// Convert a Mermaid flowchart into native shapes and connectors (item 40).
// Evidence: diagram-as-code module (domainRegistry, node/edge derivation, edge endpoint binding, createLine).
// Independent parser for the flowchart subset; the Mermaid package is still used for rendering previews.
import type { Item, Point } from './model.ts';
import type { ShapeKind } from './shapes.ts';

type Node = { id: string; label: string; shape: ShapeKind; order: number };
type Edge = { from: string; to: string; label: string; style: 'solid' | 'dotted' | 'thick'; arrow: boolean };
export type ParsedFlowchart = { direction: 'TB' | 'BT' | 'LR' | 'RL'; nodes: Node[]; edges: Edge[]; notes: string[] };

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
    .replace(/&quot;/g, '"')
    .slice(0, 6000);

export function parseFlowchart(code: string): ParsedFlowchart {
  const lines = code
    .replace(/%%.*$/gm, '')
    .split(/\n|;/)
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
    notes: string[] = [];
  let skipped = 0,
    subgraphs = 0;
  const node = (id: string, label?: string, shape?: ShapeKind) => {
    const existing = nodes.get(id);
    if (!existing) nodes.set(id, { id, label: label ?? id, shape: shape ?? 'rectangle', order: nodes.size });
    else if (label !== undefined) {
      existing.label = label;
      existing.shape = shape ?? existing.shape;
    }
  };
  for (const line of lines) {
    if (/^subgraph\b/i.test(line)) {
      subgraphs++;
      continue;
    }
    if (/^(end|classDef|class|style|linkStyle|click|direction)\b/i.test(line)) {
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
      pending = null;
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
  if (!nodes.size) throw new Error('This flowchart has no nodes to convert.');
  if (nodes.size > 200) throw new Error('Flowcharts with more than 200 nodes cannot be converted.');
  if (subgraphs)
    notes.push(
      `${subgraphs} subgraph${subgraphs === 1 ? ' was' : 's were'} flattened; their nodes are kept without the grouping box.`,
    );
  if (skipped)
    notes.push(
      `${skipped} line${skipped === 1 ? ' was' : 's were'} not understood (styling or unsupported syntax) and skipped.`,
    );
  return { direction, nodes: [...nodes.values()], edges, notes };
}

/** Longest-path ranks (cycles broken by DFS back edges) and barycentric ordering within ranks. */
export function layerFlowchart(nodes: Node[], edges: Edge[]): Map<string, { rank: number; index: number }> {
  const ids = nodes.map(n => n.id),
    out = new Map(ids.map(id => [id, [] as string[]])),
    state = new Map<string, number>(),
    dag: [string, string][] = [];
  const visit = (id: string) => {
    state.set(id, 1);
    for (const e of edges.filter(e => e.from === id)) {
      if (state.get(e.to) === 1) continue;
      dag.push([e.from, e.to]);
      if (!state.has(e.to)) visit(e.to);
    }
    state.set(id, 2);
  };
  const incoming = new Set(edges.map(e => e.to));
  for (const id of [...ids.filter(id => !incoming.has(id)), ...ids]) if (!state.has(id)) visit(id);
  for (const [a, b] of dag) if (a !== b) out.get(a)!.push(b);
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
  const final = pos();
  return new Map(ids.map(id => [id, { rank: rank.get(id)!, index: final.get(id)! }]));
}

const SIZE: Record<string, [number, number]> = { diamond: [170, 110], ellipse: [150, 100] };
/** Native items for a flowchart: shapes plus elbow connectors bound with from/to. Origin is the top-left. */
export function mermaidToNative(code: string, origin: Point): { items: Item[]; notes: string[] } {
  const chart = parseFlowchart(code),
    layers = layerFlowchart(chart.nodes, chart.edges),
    horizontal = chart.direction === 'LR' || chart.direction === 'RL';
  const maxRank = Math.max(...[...layers.values()].map(l => l.rank)),
    counts = new Map<number, number>();
  for (const l of layers.values()) counts.set(l.rank, Math.max(counts.get(l.rank) ?? 0, l.index + 1));
  const widest = Math.max(...counts.values()),
    cellA = horizontal ? 150 : 230,
    cellR = horizontal ? 260 : 170;
  const ids = new Map<string, string>(),
    items: Item[] = [];
  for (const n of chart.nodes) {
    const { rank, index } = layers.get(n.id)!,
      [w, h] = SIZE[n.shape] ?? [180, 80],
      offset = (widest - counts.get(rank)!) / 2;
    const r = chart.direction === 'BT' || chart.direction === 'RL' ? maxRank - rank : rank,
      along = (index + offset) * cellA,
      across = r * cellR;
    const cx = origin.x + (horizontal ? across : along) + 90,
      cy = origin.y + (horizontal ? along : across) + 40,
      id = crypto.randomUUID();
    ids.set(n.id, id);
    items.push({ id, type: n.shape, x: cx - w / 2, y: cy - h / 2, w, h, text: n.label, fill: '#ffffff' });
  }
  for (const e of chart.edges) {
    items.push({
      id: crypto.randomUUID(),
      type: 'arrow',
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      text: e.label.slice(0, 200),
      fill: '#25252a',
      from: ids.get(e.from),
      to: ids.get(e.to),
      connector: {
        path: 'elbow',
        ...(e.style === 'dotted' ? { dash: 'dotted' as const } : {}),
        ...(e.style === 'thick' ? { width: 4 } : {}),
        ...(e.arrow ? {} : { endHead: 'none' as const }),
      },
    });
  }
  return { items, notes: chart.notes };
}
