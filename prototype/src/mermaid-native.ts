// Convert Mermaid code into native shapes and connectors (item 40), and native shapes back to Mermaid (track R5).
// Evidence: diagram-as-code module (domainRegistry, node/edge derivation, edge endpoint binding, createLine).
// Independent parsers for the flowchart, sequence, class, state and ER subsets; the Mermaid package is still
// used for rendering previews. Subgraphs, composite states and sequence blocks become frames (containers).
import type { Board, ConnectorFormat, ConnectorHead, Item, Point } from './model.ts';
import { createItem } from './model.ts';
import { isShapeKind } from './shapes.ts';
import type { ShapeKind } from './shapes.ts';
import { entityHeight } from './specs-entity.ts';
import type { EntityKey, EntityRow } from './specs-entity.ts';

type Node = { id: string; label: string; shape: ShapeKind; order: number; group?: string };
type Edge = { from: string; to: string; label: string; style: 'solid' | 'dotted' | 'thick'; arrow: boolean };
/** A subgraph: `parent` is the enclosing subgraph id, or null at the top level. */
export type Subgraph = { id: string; title: string; parent: string | null };
export type ParsedFlowchart = {
  direction: 'TB' | 'BT' | 'LR' | 'RL';
  nodes: Node[];
  edges: Edge[];
  notes: string[];
  groups: Subgraph[];
};
export type MermaidKind = 'flowchart' | 'sequence' | 'class' | 'state' | 'er';

const shapes: [string, string, ShapeKind][] = [
  ['((', '))', 'ellipse'],
  ['([', '])', 'terminator'],
  ['[(', ')]', 'cylinder'],
  ['[[', ']]', 'predefined'],
  ['{{', '}}', 'hexagon'],
  ['[/', '/]', 'parallelogram'],
  ['[', ']', 'rectangle'],
  ['(', ')', 'roundrect'],
  ['{', '}', 'diamond'],
  ['>', ']', 'rectangle'],
];
const cleanLabel = (text: string) =>
  text
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&quot;|#quot;/g, '"')
    // Mermaid entity codes such as #93; let quoted labels hold brackets.
    .replace(/#(\d{1,6});/g, (_, n: string) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
    .slice(0, 6000);
/** Statements split on new lines and on semicolons outside double quotes. */
const statements = (code: string) => {
  const out: string[] = [];
  let current = '',
    quoted = false;
  for (const ch of code) {
    if (ch === '"') quoted = !quoted;
    if (ch === '\n' || (ch === ';' && !quoted)) {
      out.push(current);
      current = '';
      quoted = false;
    } else current += ch;
  }
  out.push(current);
  return out;
};
const codeLines = (code: string) =>
  code
    .replace(/%%.*$/gm, '')
    .split(/\n/)
    .map(l => l.trim())
    .filter(Boolean);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The diagram type named on the first line, or null when it cannot be converted. */
export function mermaidKind(code: string): MermaidKind | null {
  const head = codeLines(code)[0] ?? '';
  if (/^(flowchart|graph)\b/i.test(head)) return 'flowchart';
  if (/^sequenceDiagram\b/.test(head)) return 'sequence';
  if (/^classDiagram(-v2)?\b/.test(head)) return 'class';
  if (/^stateDiagram(-v2)?\b/.test(head)) return 'state';
  if (/^erDiagram\b/.test(head)) return 'er';
  return null;
}

export function parseFlowchart(code: string): ParsedFlowchart {
  const lines = statements(code.replace(/%%.*$/gm, ''))
    .map(l => l.trim())
    .filter(Boolean);
  const header = lines.shift() ?? '',
    match = /^(flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?\s*$/i.exec(header);
  if (!match) throw new Error('Only Mermaid flowcharts ("flowchart" or "graph") can be converted to shapes.');
  const direction = (
    match[2]?.toUpperCase() === 'TD' ? 'TB' : (match[2]?.toUpperCase() ?? 'TB')
  ) as ParsedFlowchart['direction'];
  const nodes = new Map<string, Node>(),
    edges: Edge[] = [],
    notes: string[] = [],
    groups: Subgraph[] = [],
    stack: string[] = [];
  let skipped = 0;
  const node = (id: string, label?: string, shape?: ShapeKind) => {
    const existing = nodes.get(id);
    if (!existing)
      nodes.set(id, {
        id,
        label: label ?? id,
        shape: shape ?? 'rectangle',
        order: nodes.size,
        ...(stack.length ? { group: stack[stack.length - 1] } : {}),
      });
    else if (label !== undefined) {
      existing.label = label;
      existing.shape = shape ?? existing.shape;
    }
  };
  for (const line of lines) {
    const sub = /^subgraph\b\s*(.*)$/i.exec(line);
    if (sub) {
      const rest = sub[1].trim(),
        titled = /^([A-Za-z0-9_-]+)\s*\[(.*)\]$/.exec(rest);
      const id = titled ? titled[1] : rest.replace(/^"|"$/g, '') || `subgraph${groups.length + 1}`,
        title = titled ? cleanLabel(titled[2]) : cleanLabel(rest) || id;
      if (groups.some(g => g.id === id)) {
        skipped++;
        stack.push(id);
        continue;
      }
      groups.push({ id, title, parent: stack[stack.length - 1] ?? null });
      stack.push(id);
      continue;
    }
    if (/^end$/i.test(line)) {
      if (stack.length) stack.pop();
      else skipped++;
      continue;
    }
    if (/^(classDef|class|style|linkStyle|click|direction)\b/i.test(line)) {
      skipped++;
      continue;
    }
    let rest = line,
      previous: string | null = null,
      pending: Omit<Edge, 'from' | 'to'> | null = null,
      ok = true;
    while (rest.length) {
      const idMatch = /^([A-Za-z0-9_][A-Za-z0-9_]*)/.exec(rest);
      if (!idMatch) {
        ok = false;
        break;
      }
      const id = idMatch[1];
      rest = rest.slice(id.length);
      let label: string | undefined, shape: ShapeKind | undefined;
      for (const [open, close, kind] of shapes) {
        if (!rest.startsWith(open)) continue;
        const end = rest.indexOf(close, open.length);
        if (end < 0) continue;
        label = cleanLabel(rest.slice(open.length, end));
        shape = kind;
        rest = rest.slice(end + close.length);
        break;
      }
      node(id, label, shape);
      if (previous && pending) edges.push({ from: previous, to: id, ...pending });
      previous = id;
      rest = rest.trimStart();
      if (!rest) break;
      const texted = /^(--|==|-\.)\s+(.+?)\s+(-->|---|==>|===|\.->|\.-)\s*/.exec(rest);
      const plain = /^(-{2,}>|-{3,}|={2,}>|={3,}|-\.+->|-\.+-|--[ox])\s*(?:\|([^|]*)\|)?\s*/.exec(rest);
      const arrow = texted?.[3] ?? plain?.[1];
      if (!arrow) {
        ok = false;
        break;
      }
      pending = {
        label: cleanLabel(texted ? texted[2] : (plain?.[2] ?? '')),
        style: arrow.includes('.') ? 'dotted' : arrow.includes('=') ? 'thick' : 'solid',
        arrow: /[>ox]$/.test(arrow),
      };
      rest = rest.slice((texted ?? plain)![0].length);
    }
    if (!ok) skipped++;
  }
  // A node named like a subgraph (and never given a label of its own) is the subgraph itself: edges bind to it.
  for (const g of groups) {
    const n = nodes.get(g.id);
    if (n && n.label === n.id && n.shape === 'rectangle') nodes.delete(g.id);
  }
  if (!nodes.size) throw new Error('This flowchart has no nodes to convert.');
  if (nodes.size > 200) throw new Error('Flowcharts with more than 200 nodes cannot be converted.');
  const used = new Set([...nodes.values()].map(n => n.group).filter(Boolean));
  for (let changed = true; changed;) {
    changed = false;
    for (const g of groups)
      if (used.has(g.id) && g.parent && !used.has(g.parent)) {
        used.add(g.parent);
        changed = true;
      }
  }
  const empty = groups.filter(g => !used.has(g.id)).length;
  if (empty) notes.push(`${plural(empty, 'empty subgraph was', 'empty subgraphs were')} left out.`);
  if (skipped)
    notes.push(
      `${plural(skipped, 'line was', 'lines were')} not understood (styling or unsupported syntax) and skipped.`,
    );
  return { direction, nodes: [...nodes.values()], edges, notes, groups: groups.filter(g => used.has(g.id)) };
}

/** Longest-path ranks (cycles broken by DFS back edges) and barycentric ordering within ranks. */
export function layerFlowchart(
  nodes: { id: string; group?: string }[],
  edges: { from: string; to: string }[],
): Map<string, { rank: number; index: number }> {
  const ids = nodes.map(n => n.id),
    known = new Set(ids),
    links = edges.filter(e => known.has(e.from) && known.has(e.to)),
    state = new Map<string, number>(),
    dag: [string, string][] = [];
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of links.filter(e => e.from === id)) {
      if (state.get(e.to) === 1) continue;
      dag.push([e.from, e.to]);
      if (!state.has(e.to)) visit(e.to);
    }
    state.set(id, 2);
  };
  const incoming = new Set(links.map(e => e.to));
  for (const id of [...ids.filter(id => !incoming.has(id)), ...ids]) if (!state.has(id)) visit(id);
  const rank = new Map(ids.map(id => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const [a, b] of dag)
      if (a !== b && rank.get(b)! < rank.get(a)! + 1) {
        rank.set(b, rank.get(a)! + 1);
        changed = true;
      }
    if (!changed) break;
  }
  const layers: string[][] = [];
  for (const id of ids) (layers[rank.get(id)!] ??= []).push(id);
  const pos = () => new Map(layers.flatMap(l => l.map((id, i) => [id, i] as [string, number])));
  for (let sweep = 0; sweep < 4; sweep++) {
    const p = pos(),
      down = sweep % 2 === 0;
    for (const layer of down ? layers.slice(1) : layers.slice(0, -1).reverse()) {
      const score = (id: string) => {
        const nb = dag.filter(([a, b]) => (down ? b === id : a === id)).map(([a, b]) => p.get(down ? a : b)!);
        return nb.length ? nb.reduce((s, v) => s + v, 0) / nb.length : p.get(id)!;
      };
      layer.sort((a, b) => score(a) - score(b));
    }
  }
  // Keep members of one subgraph next to each other in every rank so their frame does not swallow others.
  const groupOf = new Map(nodes.map(n => [n.id, n.group ?? ''])),
    groupOrder = [...new Set(nodes.map(n => n.group ?? ''))];
  if (groupOrder.length > 1)
    for (const layer of layers)
      if (layer) layer.sort((a, b) => groupOrder.indexOf(groupOf.get(a)!) - groupOrder.indexOf(groupOf.get(b)!));
  const final = pos();
  return new Map(ids.map(id => [id, { rank: rank.get(id)!, index: final.get(id)! }]));
}

// ---- Generic layered builder -------------------------------------------------------------------
type GNode = {
  id: string;
  type: Item['type'];
  label: string;
  w: number;
  h: number;
  fill?: string;
  data?: Record<string, unknown>;
  group?: string;
};
type GEdge = {
  from: string;
  to: string;
  label: string;
  dash?: 'dashed' | 'dotted';
  width?: number;
  startHead?: ConnectorHead;
  endHead?: ConnectorHead;
};
type Direction = ParsedFlowchart['direction'];
/** Stable Mermaid key per created item id: node and subgraph ids, `from>to#n` for edges (code-to-shape links). */
export type Keys = Record<string, string>;
/** Converted items, notes about what was skipped, and the Mermaid key of every created item. */
export type Converted = { items: Item[]; notes: string[]; keys: Keys };
/** Key of the n-th edge between two Mermaid ids (n counts from 0 in code order). */
export const edgeKey = (from: string, to: string, n: number) => `${from}>${to}#${n}`;

/** Lay out nodes in ranks, wrap groups in frames, and bind elbow connectors to the created objects. */
function buildLayered(
  nodes: GNode[],
  edges: GEdge[],
  groups: Subgraph[],
  direction: Direction,
  origin: Point,
): { items: Item[]; keys: Keys } {
  const layers = layerFlowchart(nodes, edges),
    horizontal = direction === 'LR' || direction === 'RL';
  const maxRank = Math.max(...[...layers.values()].map(l => l.rank)),
    counts = new Map<number, number>();
  for (const l of layers.values()) counts.set(l.rank, Math.max(counts.get(l.rank) ?? 0, l.index + 1));
  const widest = Math.max(...counts.values()),
    maxW = Math.max(...nodes.map(n => n.w)),
    maxH = Math.max(...nodes.map(n => n.h)),
    cellA = horizontal ? Math.max(150, maxH + 60) : Math.max(230, maxW + 50),
    cellR = horizontal ? Math.max(260, maxW + 80) : Math.max(170, maxH + 90),
    framed = groups.length > 0,
    pad = framed ? 50 : 0;
  const ids = new Map<string, string>(),
    shapesOut: Item[] = [];
  for (const n of nodes) {
    const { rank, index } = layers.get(n.id)!,
      offset = (widest - counts.get(rank)!) / 2;
    const r = direction === 'BT' || direction === 'RL' ? maxRank - rank : rank,
      along = (index + offset) * cellA,
      across = r * cellR;
    const cx = origin.x + pad + (horizontal ? across : along) + maxW / 2,
      cy = origin.y + pad + (horizontal ? along : across) + maxH / 2;
    const item: Item = {
      ...createItem(n.type, 0, 0, n.fill ?? '#ffffff'),
      x: Math.round(cx - n.w / 2),
      y: Math.round(cy - n.h / 2),
      w: n.w,
      h: n.h,
      text: n.label,
    };
    if (n.fill) item.fill = n.fill;
    if (n.data) item.data = n.data;
    ids.set(n.id, item.id);
    shapesOut.push(item);
  }
  // Frames: bounds of member objects and nested frames, innermost first.
  const frames = new Map<string, Item>(),
    depth = (g: Subgraph): number => (g.parent ? 1 + depth(groups.find(p => p.id === g.parent)!) : 0);
  for (const g of [...groups].sort((a, b) => depth(b) - depth(a))) {
    const members = [
      ...nodes.filter(n => n.group === g.id).map(n => shapesOut.find(s => s.id === ids.get(n.id))!),
      ...groups.filter(c => c.parent === g.id).map(c => frames.get(c.id)!),
    ].filter(Boolean);
    if (!members.length) continue;
    const x = Math.min(...members.map(m => m.x)) - 30,
      y = Math.min(...members.map(m => m.y)) - 30,
      x2 = Math.max(...members.map(m => m.x + m.w)) + 30,
      y2 = Math.max(...members.map(m => m.y + m.h)) + 30;
    const frame: Item = { ...createItem('frame', x, y), w: x2 - x, h: y2 - y, text: g.title.slice(0, 200) };
    frames.set(g.id, frame);
    ids.set(g.id, frame.id);
  }
  const keys: Keys = {},
    seen = new Map<string, number>();
  for (const [key, id] of ids) keys[id] = key;
  const lines: Item[] = edges
    .filter(e => ids.has(e.from) && ids.has(e.to))
    .map(e => {
      const connector: ConnectorFormat = { path: 'elbow' };
      if (e.dash) connector.dash = e.dash;
      if (e.width) connector.width = e.width;
      if (e.startHead && e.startHead !== 'none') connector.startHead = e.startHead;
      if (e.endHead !== undefined && e.endHead !== 'arrow') connector.endHead = e.endHead;
      const n = seen.get(`${e.from}>${e.to}`) ?? 0,
        id = crypto.randomUUID();
      seen.set(`${e.from}>${e.to}`, n + 1);
      keys[id] = edgeKey(e.from, e.to, n);
      return {
        id,
        type: 'arrow' as const,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        text: e.label.slice(0, 200),
        fill: '#25252a',
        from: ids.get(e.from),
        to: ids.get(e.to),
        connector,
      };
    });
  // Outer frames first so containers paint below what they hold.
  const orderedFrames = [...groups]
    .sort((a, b) => depth(a) - depth(b))
    .map(g => frames.get(g.id))
    .filter((f): f is Item => !!f);
  return { items: [...orderedFrames, ...shapesOut, ...lines], keys };
}

const SIZE: Record<string, [number, number]> = { diamond: [170, 110], ellipse: [150, 100] };
function flowchartItems(code: string, origin: Point): Converted {
  const chart = parseFlowchart(code);
  const nodes: GNode[] = chart.nodes.map(n => {
    const [w, h] = SIZE[n.shape] ?? [180, 80];
    return { id: n.id, type: n.shape, label: n.label, w, h, ...(n.group ? { group: n.group } : {}) };
  });
  const edges: GEdge[] = chart.edges.map(e => ({
    from: e.from,
    to: e.to,
    label: e.label,
    ...(e.style === 'dotted' ? { dash: 'dotted' as const } : {}),
    ...(e.style === 'thick' ? { width: 4 } : {}),
    ...(e.arrow ? {} : { endHead: 'none' as const }),
  }));
  return { ...buildLayered(nodes, edges, chart.groups, chart.direction, origin), notes: chart.notes };
}

// ---- Sequence diagrams -------------------------------------------------------------------------
export type SequenceMessage = {
  kind: 'message';
  from: string;
  to: string;
  text: string;
  dashed: boolean;
  head: ConnectorHead;
};
export type SequenceNote = { kind: 'note'; over: string[]; side: 'over' | 'left' | 'right'; text: string };
export type SequenceBlock = { kind: 'block'; title: string; depth: number; start: number; end: number };
export type ParsedSequence = {
  participants: { id: string; label: string; actor: boolean }[];
  steps: (SequenceMessage | SequenceNote)[];
  blocks: SequenceBlock[];
  notes: string[];
};
const PARTICIPANT_MAX = 40,
  STEP_MAX = 300;
export function parseSequence(code: string): ParsedSequence {
  const lines = codeLines(code);
  if (!/^sequenceDiagram\b/.test(lines.shift() ?? '')) throw new Error('This is not a Mermaid sequence diagram.');
  const participants: ParsedSequence['participants'] = [],
    steps: ParsedSequence['steps'] = [],
    blocks: SequenceBlock[] = [],
    open: SequenceBlock[] = [];
  let skipped = 0;
  const who = (id: string, label?: string, actor = false) => {
    const p = participants.find(x => x.id === id);
    if (p) {
      if (label) p.label = label;
      return;
    }
    if (participants.length >= PARTICIPANT_MAX)
      throw new Error('Sequence diagrams with more than 40 participants cannot be converted.');
    participants.push({ id, label: label ?? id, actor });
  };
  for (const line of lines) {
    const decl = /^(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(line);
    if (decl) {
      who(decl[2].trim(), decl[3] ? cleanLabel(decl[3]) : undefined, decl[1].toLowerCase() === 'actor');
      continue;
    }
    const msg = /^([^\s:+-][^:]*?)\s*(--?>>|--?>|--?x|--?\))\s*([+-]?)\s*([^\s:+-][^:]*?)\s*:(.*)$/.exec(line);
    if (msg) {
      const [, from, arrow, , to, text] = msg;
      who(from.trim());
      who(to.trim());
      if (steps.length < STEP_MAX)
        steps.push({
          kind: 'message',
          from: from.trim(),
          to: to.trim(),
          text: cleanLabel(text),
          dashed: arrow.startsWith('--'),
          head: arrow.endsWith('>>') || arrow.endsWith('x') ? 'arrow' : arrow.endsWith(')') ? 'open' : 'none',
        });
      continue;
    }
    const note = /^note\s+(over|left of|right of)\s+([^:]+):(.*)$/i.exec(line);
    if (note) {
      const over = note[2]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      over.forEach(id => who(id));
      const side = note[1].toLowerCase();
      if (steps.length < STEP_MAX)
        steps.push({
          kind: 'note',
          over,
          side: side === 'over' ? 'over' : side.startsWith('left') ? 'left' : 'right',
          text: cleanLabel(note[3]),
        });
      continue;
    }
    const block = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i.exec(line);
    if (block) {
      const b = {
        kind: 'block' as const,
        title: `${block[1].toLowerCase()}${block[2] && block[1].toLowerCase() !== 'rect' ? ' ' + cleanLabel(block[2]) : ''}`,
        depth: open.length,
        start: steps.length,
        end: steps.length,
      };
      open.push(b);
      blocks.push(b);
      continue;
    }
    if (/^end$/i.test(line)) {
      const b = open.pop();
      if (b) b.end = steps.length;
      else skipped++;
      continue;
    }
    if (/^(else|and|option)\b/i.test(line)) continue;
    if (/^(autonumber|activate|deactivate|title|box|links?|create|destroy)\b/i.test(line)) {
      skipped++;
      continue;
    }
    skipped++;
  }
  for (const b of open) b.end = steps.length;
  if (!participants.length) throw new Error('This sequence diagram has no participants to convert.');
  const notes: string[] = [];
  if (skipped)
    notes.push(
      `${plural(skipped, 'line was', 'lines were')} not converted (activation, styling or unsupported syntax).`,
    );
  return { participants, steps, blocks: blocks.filter(b => b.end > b.start), notes };
}

const SEQ_COL = 230,
  SEQ_BOX_W = 170,
  SEQ_BOX_H = 60,
  SEQ_ROW = 64;
function sequenceItems(code: string, origin: Point): Converted {
  const seq = parseSequence(code),
    pad = seq.blocks.length ? 40 : 0;
  const centre = (id: string) =>
    origin.x + pad + seq.participants.findIndex(p => p.id === id) * SEQ_COL + SEQ_BOX_W / 2;
  const rowY = (k: number) => origin.y + SEQ_BOX_H + 50 + k * SEQ_ROW;
  const bottomY = rowY(seq.steps.length) + 10;
  const tops: Item[] = [],
    bottoms: Item[] = [],
    lifelines: Item[] = [],
    steps: Item[] = [],
    keys: Keys = {};
  for (const p of seq.participants) {
    const x = centre(p.id) - SEQ_BOX_W / 2,
      kind: ShapeKind = p.actor ? 'roundrect' : 'rectangle';
    const top = { ...createItem(kind, x, origin.y, '#ffffff'), w: SEQ_BOX_W, h: SEQ_BOX_H, text: p.label };
    const bottom = { ...createItem(kind, x, bottomY, '#ffffff'), w: SEQ_BOX_W, h: SEQ_BOX_H, text: p.label };
    tops.push(top);
    bottoms.push(bottom);
    keys[top.id] = `p:${p.id}`;
    keys[bottom.id] = `p:${p.id}:end`;
    const life = createItem('arrow', 0, 0);
    keys[life.id] = `l:${p.id}`;
    lifelines.push({
      ...life,
      w: 0,
      h: 0,
      fill: '#a1a1aa',
      from: top.id,
      to: bottom.id,
      connector: { path: 'straight', dash: 'dashed', endHead: 'none', width: 1 },
    });
  }
  seq.steps.forEach((s, k) => {
    const y = rowY(k),
      at = steps.length;
    if (s.kind === 'message') {
      const a = centre(s.from),
        b = centre(s.to),
        self = s.from === s.to;
      steps.push({
        ...createItem('arrow', a, y),
        w: self ? 70 : b - a,
        h: self ? 24 : 0,
        text: s.text.slice(0, 200),
        connector: {
          path: self ? 'elbow' : 'straight',
          ...(s.dashed ? { dash: 'dashed' as const } : {}),
          ...(s.head !== 'arrow' ? { endHead: s.head } : {}),
        },
      });
    } else {
      const xs = s.over.map(centre),
        left = Math.min(...xs),
        right = Math.max(...xs),
        w = Math.max(150, right - left + (s.over.length > 1 ? 120 : 0)),
        x = s.side === 'left' ? left - w - 16 : s.side === 'right' ? left + 16 : (left + right) / 2 - w / 2;
      steps.push({ ...createItem('note', Math.round(x), y - 22, '#fff49b'), w, h: 48, text: s.text });
    }
    keys[steps[at].id] = `s:${k}`;
  });
  const width = (seq.participants.length - 1) * SEQ_COL + SEQ_BOX_W;
  const frames = seq.blocks.map((b, k) => {
    const inset = b.depth * 14,
      y = rowY(b.start) - SEQ_ROW / 2 + inset,
      h = rowY(b.end) - SEQ_ROW / 2 - y - inset;
    const frame = createItem('frame', origin.x + pad / 2 + inset - 10, y);
    keys[frame.id] = `b:${k}`;
    return {
      ...frame,
      w: width + pad + 20 - inset * 2,
      h: Math.max(40, h),
      text: b.title.slice(0, 200),
    };
  });
  return { items: [...frames, ...tops, ...bottoms, ...lifelines, ...steps], notes: seq.notes, keys };
}

// ---- Class diagrams ----------------------------------------------------------------------------
export type ParsedClass = {
  direction: Direction;
  classes: { id: string; label: string; members: string[] }[];
  relations: GEdge[];
  notes: string[];
};
const classRelation =
  /^([\w.~]+)\s*(?:"[^"]*"\s*)?(<\|--|<\|\.\.|\*--|o--|<--|<\.\.|--\|>|\.\.\|>|--\*|--o|-->|\.\.>|--|\.\.)\s*(?:"[^"]*"\s*)?([\w.~]+)\s*(?::\s*(.*))?$/;
const headOf = (mark: string): ConnectorHead =>
  mark.includes('|')
    ? 'open'
    : mark === '*' || mark === 'o'
      ? 'diamond'
      : mark === '<' || mark === '>'
        ? 'arrow'
        : 'none';
export function parseClassDiagram(code: string): ParsedClass {
  const lines = codeLines(code);
  if (!/^classDiagram/.test(lines.shift() ?? '')) throw new Error('This is not a Mermaid class diagram.');
  const classes: ParsedClass['classes'] = [],
    relations: GEdge[] = [];
  let direction: Direction = 'TB',
    skipped = 0,
    inside: ParsedClass['classes'][number] | null = null;
  const cls = (raw: string) => {
    const id = raw.replace(/~.*~$/, '');
    let c = classes.find(x => x.id === id);
    if (!c) {
      if (classes.length >= 200) throw new Error('Class diagrams with more than 200 classes cannot be converted.');
      c = { id, label: raw.replace(/~(.*)~$/, '<$1>'), members: [] };
      classes.push(c);
    }
    return c;
  };
  for (const line of lines) {
    if (inside) {
      if (line === '}') inside = null;
      else if (!/^<<.*>>$/.test(line) && inside.members.length < 60) inside.members.push(line.slice(0, 200));
      continue;
    }
    const dir = /^direction\s+(TB|TD|BT|LR|RL)$/i.exec(line);
    if (dir) {
      direction = (dir[1].toUpperCase() === 'TD' ? 'TB' : dir[1].toUpperCase()) as Direction;
      continue;
    }
    const decl = /^class\s+([\w~]+)(?:\s*\[.*\])?\s*(\{)?\s*(\})?$/.exec(line);
    if (decl) {
      const c = cls(decl[1]);
      if (decl[2] && !decl[3]) inside = c;
      continue;
    }
    const member = /^([\w~]+)\s*:\s*(.+)$/.exec(line);
    if (member && !classRelation.test(line)) {
      const c = cls(member[1]);
      if (c.members.length < 60) c.members.push(member[2].trim().slice(0, 200));
      continue;
    }
    const rel = classRelation.exec(line);
    if (rel) {
      const [, a, arrow, b, label] = rel,
        dashed = arrow.includes('..'),
        body = dashed ? '..' : '--',
        [left, right] = arrow.split(body);
      cls(a);
      cls(b);
      // Put the "parent" end (the decorated side) first so it ranks above.
      const leftHead = headOf(left),
        rightHead = headOf(right);
      const edge: GEdge =
        rightHead !== 'none' && leftHead === 'none'
          ? {
              from: b.replace(/~.*~$/, ''),
              to: a.replace(/~.*~$/, ''),
              label: '',
              startHead: rightHead,
              endHead: 'none',
            }
          : {
              from: a.replace(/~.*~$/, ''),
              to: b.replace(/~.*~$/, ''),
              label: '',
              startHead: leftHead,
              endHead: 'none',
            };
      if (rightHead !== 'none' && leftHead !== 'none') edge.endHead = rightHead;
      edge.label = cleanLabel(label ?? '');
      if (dashed) edge.dash = 'dashed';
      relations.push(edge);
      continue;
    }
    if (/^(<<|note|style|classDef|cssClass|click|link|callback|namespace|\}|annotation)/i.test(line)) {
      skipped++;
      continue;
    }
    skipped++;
  }
  if (!classes.length) throw new Error('This class diagram has no classes to convert.');
  const notes: string[] = [];
  if (skipped)
    notes.push(`${plural(skipped, 'line was', 'lines were')} not converted (notes, styling or annotations).`);
  return { direction, classes, relations, notes };
}
const tableWidth = (title: string, rows: string[]) =>
  Math.min(380, Math.max(200, Math.round(Math.max(title.length * 9, ...rows.map(r => r.length * 7.4)) + 60)));
function classItems(code: string, origin: Point): Converted {
  const c = parseClassDiagram(code);
  const nodes: GNode[] = c.classes.map(k => {
    const rows: EntityRow[] = k.members.map(m => ({ name: m, type: '' }));
    return {
      id: k.id,
      type: 'entity',
      label: k.label,
      w: tableWidth(k.label, k.members),
      h: entityHeight(rows.length),
      fill: '#dfe5ff',
      data: { rows },
    };
  });
  return { ...buildLayered(nodes, c.relations, [], c.direction, origin), notes: c.notes };
}

// ---- State diagrams ----------------------------------------------------------------------------
export type ParsedState = {
  direction: Direction;
  states: { id: string; label: string; kind: 'state' | 'start' | 'end' | 'choice' | 'bar'; group?: string }[];
  transitions: { from: string; to: string; label: string }[];
  groups: Subgraph[];
  notes: string[];
};
export function parseStateDiagram(code: string): ParsedState {
  const lines = codeLines(code);
  if (!/^stateDiagram/.test(lines.shift() ?? '')) throw new Error('This is not a Mermaid state diagram.');
  const states: ParsedState['states'] = [],
    transitions: ParsedState['transitions'] = [],
    groups: Subgraph[] = [],
    stack: string[] = [];
  let direction: Direction = 'TB',
    skipped = 0,
    inNote = false;
  const scope = () => stack[stack.length - 1];
  const state = (id: string, patch: Partial<ParsedState['states'][number]> = {}) => {
    let s = states.find(x => x.id === id);
    if (!s) {
      if (states.length >= 200) throw new Error('State diagrams with more than 200 states cannot be converted.');
      s = { id, label: id, kind: 'state', ...(scope() ? { group: scope() } : {}) };
      states.push(s);
    }
    Object.assign(s, patch);
    return s;
  };
  const endpoint = (raw: string, source: boolean) => {
    if (raw !== '[*]') return state(raw).id;
    const where = scope() ?? 'root',
      id = `[*]${source ? 'start' : 'end'}:${where}`;
    state(id, { kind: source ? 'start' : 'end', label: '' });
    return id;
  };
  for (const line of lines) {
    if (inNote) {
      if (/^end\s+note$/i.test(line)) inNote = false;
      continue;
    }
    const dir = /^direction\s+(TB|TD|BT|LR|RL)$/i.exec(line);
    if (dir) {
      direction = (dir[1].toUpperCase() === 'TD' ? 'TB' : dir[1].toUpperCase()) as Direction;
      continue;
    }
    const comp = /^state\s+(?:"([^"]*)"\s+as\s+)?([\w-]+)\s*\{$/.exec(line);
    if (comp) {
      const id = comp[2];
      if (!groups.some(g => g.id === id)) groups.push({ id, title: comp[1] ?? id, parent: scope() ?? null });
      stack.push(id);
      continue;
    }
    if (line === '}') {
      if (stack.length) stack.pop();
      else skipped++;
      continue;
    }
    const alias = /^state\s+"([^"]*)"\s+as\s+([\w-]+)$/.exec(line);
    if (alias) {
      state(alias[2], { label: cleanLabel(alias[1]) });
      continue;
    }
    const special = /^state\s+([\w-]+)\s*<<(choice|fork|join)>>$/.exec(line);
    if (special) {
      state(special[1], { kind: special[2] === 'choice' ? 'choice' : 'bar', label: '' });
      continue;
    }
    const plain = /^state\s+([\w-]+)$/.exec(line);
    if (plain) {
      state(plain[1]);
      continue;
    }
    const tr = /^(\[\*\]|[\w-]+)\s*-->\s*(\[\*\]|[\w-]+)\s*(?::\s*(.*))?$/.exec(line);
    if (tr) {
      const from = endpoint(tr[1], true),
        to = endpoint(tr[2], false);
      transitions.push({ from, to, label: cleanLabel(tr[3] ?? '') });
      continue;
    }
    const described = /^([\w-]+)\s*:\s*(.+)$/.exec(line);
    if (described) {
      state(described[1], { label: cleanLabel(described[2]) });
      continue;
    }
    if (/^note\b/i.test(line)) {
      if (!line.includes(':')) inNote = true;
      skipped++;
      continue;
    }
    skipped++;
  }
  // A composite state is drawn as its frame, not as a separate box.
  const composite = new Set(groups.map(g => g.id));
  const kept = states.filter(s => !composite.has(s.id));
  if (!kept.length) throw new Error('This state diagram has no states to convert.');
  const notes: string[] = [];
  if (skipped)
    notes.push(`${plural(skipped, 'line was', 'lines were')} not converted (notes, concurrency or styling).`);
  return { direction, states: kept, transitions, groups, notes };
}
function stateItems(code: string, origin: Point): Converted {
  const s = parseStateDiagram(code);
  const nodes: GNode[] = s.states.map(st => {
    const base = { id: st.id, label: st.label, ...(st.group ? { group: st.group } : {}) };
    if (st.kind === 'start') return { ...base, type: 'ellipse', w: 30, h: 30, fill: '#25252a' };
    if (st.kind === 'end') return { ...base, type: 'ellipse', w: 34, h: 34, fill: '#52525b' };
    if (st.kind === 'choice') return { ...base, type: 'diamond', w: 60, h: 60 };
    if (st.kind === 'bar') return { ...base, type: 'rectangle', w: 120, h: 14, fill: '#25252a' };
    return { ...base, type: 'roundrect', w: 170, h: 64 };
  });
  const edges: GEdge[] = s.transitions.map(t => ({ from: t.from, to: t.to, label: t.label }));
  // Groups with no kept members are dropped by the builder.
  return { ...buildLayered(nodes, edges, s.groups, s.direction, origin), notes: s.notes };
}

// ---- ER diagrams -------------------------------------------------------------------------------
const cardinality: Record<string, ConnectorHead> = {
  '||': 'one',
  '|o': 'zero-one',
  'o|': 'zero-one',
  '}|': 'one-many',
  '|{': 'one-many',
  '}o': 'zero-many',
  'o{': 'zero-many',
};
export type ParsedEr = {
  entities: { id: string; label: string; rows: EntityRow[] }[];
  relations: GEdge[];
  notes: string[];
};
export function parseErDiagram(code: string): ParsedEr {
  const lines = codeLines(code);
  if (!/^erDiagram\b/.test(lines.shift() ?? '')) throw new Error('This is not a Mermaid ER diagram.');
  const entities: ParsedEr['entities'] = [],
    relations: GEdge[] = [];
  let skipped = 0,
    inside: ParsedEr['entities'][number] | null = null;
  const entity = (raw: string) => {
    const m = /^([\w-]+)(?:\["?([^"\]]*)"?\])?$/.exec(raw.replace(/^"|"$/g, ''));
    const id = m ? m[1] : raw;
    let e = entities.find(x => x.id === id);
    if (!e) {
      if (entities.length >= 200) throw new Error('ER diagrams with more than 200 entities cannot be converted.');
      e = { id, label: m?.[2] || id, rows: [] };
      entities.push(e);
    }
    return e;
  };
  for (const line of lines) {
    if (inside) {
      if (line === '}') {
        inside = null;
        continue;
      }
      const attr = /^([\w()[\]-]+)\s+([\w-]+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"[^"]*")?$/.exec(line);
      if (attr && inside.rows.length < 60) {
        const row: EntityRow = { name: attr[2].slice(0, 200), type: attr[1].slice(0, 100) };
        if (attr[3]) row.key = attr[3].split(',')[0].trim() as EntityKey;
        inside.rows.push(row);
      } else skipped++;
      continue;
    }
    const block = /^("?[\w-]+"?(?:\[[^\]]*\])?)\s*\{$/.exec(line);
    if (block) {
      inside = entity(block[1]);
      continue;
    }
    const rel = /^("?[\w-]+"?)\s*(\|\||\|o|\}\||\}o)(--|\.\.)(\|\||o\||\|\{|o\{)\s*("?[\w-]+"?)\s*:\s*(.*)$/.exec(line);
    if (rel) {
      const a = entity(rel[1]),
        b = entity(rel[5]);
      relations.push({
        from: a.id,
        to: b.id,
        label: cleanLabel(rel[6]),
        startHead: cardinality[rel[2]],
        endHead: cardinality[rel[4]],
        ...(rel[3] === '..' ? { dash: 'dashed' as const } : {}),
      });
      continue;
    }
    const lone = /^("?[\w-]+"?)$/.exec(line);
    if (lone && !/^(direction|title)$/i.test(line)) {
      entity(lone[1]);
      continue;
    }
    skipped++;
  }
  if (!entities.length) throw new Error('This ER diagram has no entities to convert.');
  const notes: string[] = [];
  if (skipped) notes.push(`${plural(skipped, 'line was', 'lines were')} not converted.`);
  return { entities, relations, notes };
}
function erItems(code: string, origin: Point): Converted {
  const er = parseErDiagram(code);
  const nodes: GNode[] = er.entities.map(e => ({
    id: e.id,
    type: 'entity',
    label: e.label,
    w: tableWidth(
      e.label,
      e.rows.map(r => `${r.key ?? ''} ${r.name} ${r.type}`),
    ),
    h: entityHeight(e.rows.length),
    fill: '#dfe5ff',
    data: { rows: e.rows, stripes: true },
  }));
  return { ...buildLayered(nodes, er.relations, [], 'LR', origin), notes: er.notes };
}

/**
 * Native items for Mermaid code: shapes (or entity tables) plus connectors bound with from/to, and frames for
 * subgraphs, composite states and sequence blocks. Origin is the top-left.
 */
export function mermaidToNative(code: string, origin: Point): Converted {
  const kind = mermaidKind(code);
  if (kind === 'sequence') return sequenceItems(code, origin);
  if (kind === 'class') return classItems(code, origin);
  if (kind === 'state') return stateItems(code, origin);
  if (kind === 'er') return erItems(code, origin);
  if (kind === 'flowchart') return flowchartItems(code, origin);
  throw new Error('Only flowcharts, sequence, class, state and ER diagrams can be converted to shapes.');
}

// ---- Native shapes back to Mermaid -------------------------------------------------------------
export const brackets: Partial<Record<ShapeKind, [string, string]>> = {
  ellipse: ['((', '))'],
  terminator: ['([', '])'],
  cylinder: ['[(', ')]'],
  predefined: ['[[', ']]'],
  hexagon: ['{{', '}}'],
  parallelogram: ['[/', '/]'],
  roundrect: ['(', ')'],
  diamond: ['{', '}'],
};
const quote = (text: string) =>
  '"' + text.replace(/"/g, '#quot;').replace(/\r?\n/g, '<br/>').replace(/[|]/g, '/').trim() + '"';
const inside = (outer: Item, inner: Item) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/**
 * Mermaid flowchart code for selected shapes, notes and text: connectors between them become edges (label,
 * dotted, thick, no head) and selected frames become subgraphs. Throws when nothing convertible is selected.
 */
export function nativeToMermaid(board: Board, ids: string[]): string {
  const chosen = new Set(ids),
    picked = board.items.filter(i => chosen.has(i.id));
  const frames = picked.filter(i => i.type === 'frame'),
    nodes = board.items.filter(
      i =>
        (chosen.has(i.id) || frames.some(f => inside(f, i))) &&
        (isShapeKind(i.type) || i.type === 'note' || i.type === 'text' || i.type === 'entity'),
    );
  if (!nodes.length) throw new Error('Select shapes, sticky notes or text to convert to Mermaid code.');
  if (nodes.length > 200) throw new Error('Select at most 200 objects to convert to Mermaid code.');
  const key = new Map(nodes.map((n, k) => [n.id, `n${k + 1}`])),
    fkey = new Map(frames.map((f, k) => [f.id, `g${k + 1}`]));
  const edges = board.items.filter(i => i.type === 'arrow' && i.from && i.to && key.has(i.from) && key.has(i.to));
  // Direction: mostly horizontal links read better left to right.
  let dx = 0,
    dy = 0;
  for (const e of edges) {
    const a = nodes.find(n => n.id === e.from)!,
      b = nodes.find(n => n.id === e.to)!;
    dx += Math.abs(b.x + b.w / 2 - (a.x + a.w / 2));
    dy += Math.abs(b.y + b.h / 2 - (a.y + a.h / 2));
  }
  const area = (f: Item) => f.w * f.h;
  const smallestFrame = (i: Item) =>
    frames.filter(f => f.id !== i.id && inside(f, i)).sort((a, b) => area(a) - area(b))[0];
  const nodeLine = (n: Item) => {
    const [open, close] = (isShapeKind(n.type) && brackets[n.type]) || ['[', ']'];
    return `${key.get(n.id)}${open}${quote(n.text || ' ')}${close}`;
  };
  const out = [`flowchart ${edges.length && dx > dy ? 'LR' : 'TB'}`];
  const emit = (parent: Item | undefined, indent: string) => {
    for (const f of frames.filter(f => smallestFrame(f) === parent)) {
      out.push(`${indent}subgraph ${fkey.get(f.id)} [${quote(f.text || 'Frame')}]`);
      emit(f, indent + '  ');
      out.push(`${indent}end`);
    }
    for (const n of nodes.filter(n => smallestFrame(n) === parent)) out.push(indent + nodeLine(n));
  };
  emit(undefined, '  ');
  for (const e of edges) {
    const c = e.connector ?? {},
      label = e.text.trim() ? `|${quote(e.text)}|` : '',
      noHead = c.endHead === 'none';
    const arrow =
      c.dash === 'dotted' || c.dash === 'dashed'
        ? noHead
          ? '-.-'
          : '-.->'
        : (c.width ?? 2) >= 4
          ? noHead
            ? '==='
            : '==>'
          : noHead
            ? '---'
            : '-->';
    out.push(`  ${key.get(e.from!)} ${arrow}${label} ${key.get(e.to!)}`);
  }
  return out.join('\n');
}
