// Import a draw.io (diagrams.net) file as native shapes and connectors (track R2-H). Pure: no React, no DOM.
// Reads plain and compressed mxGraphModel pages (base64, raw deflate, then URI encoding), maps vertices to
// Boardroom shapes with their fill, line and text colours, and edges to connectors between the mapped shapes.
// Styles it does not know become rectangles. Nothing in the file is executed or placed in the page as markup.
import { inflateSync, strFromU8 } from 'fflate';
import type { Board, ConnectorFormat, ConnectorHead, Item, Kind, Point } from './model.ts';
import { textHash } from './rich-text.ts';

export type Make = (type: Kind, x: number, y: number, fill?: string) => Item;
type XNode = { tag: string; attrs: Record<string, string>; children: XNode[]; text: string };

const entities: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: '\u00a0' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return entities[e.toLowerCase()] ?? m;
  });
}

/** Small XML reader for draw.io files: elements, attributes and text. Throws on mismatched tags. */
export function parseXml(src: string): XNode {
  const root: XNode = { tag: '#root', attrs: {}, children: [], text: '' },
    stack = [root],
    token =
      /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|</g;
  for (let m = token.exec(src); m; m = token.exec(src)) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      if (top.tag !== m[2]) throw new Error('The diagram contains malformed XML.');
      stack.pop();
    } else if (m[3]) {
      const attrs: Record<string, string> = {},
        attr = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      for (let a = attr.exec(m[4] ?? ''); a; a = attr.exec(m[4] ?? ''))
        attrs[a[1]] = decodeEntities(a[2] ?? a[3] ?? '');
      const node: XNode = { tag: m[3], attrs, children: [], text: '' };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
    else if (m[0] === '<') throw new Error('The diagram contains malformed XML.');
  }
  if (stack.length !== 1) throw new Error('The diagram contains malformed XML.');
  return root;
}
const find = (n: XNode, tag: string): XNode | undefined => {
  for (const c of n.children) {
    if (c.tag === tag) return c;
    const deep = find(c, tag);
    if (deep) return deep;
  }
  return undefined;
};

/** Expand a compressed page: base64, raw deflate, then URI encoding (older files skip the last step). */
export function inflateDiagram(text: string): string {
  const clean = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) throw new Error('The diagram page could not be read.');
  let bytes: Uint8Array;
  try {
    const bin = atob(clean);
    bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    bytes = inflateSync(bytes);
  } catch {
    throw new Error('The compressed diagram page could not be expanded.');
  }
  if (bytes.length > 20_000_000) throw new Error('The diagram is too large to import as shapes.');
  const raw = strFromU8(bytes, true);
  try {
    return decodeURIComponent(raw);
  } catch {
    return strFromU8(bytes);
  }
}

/** The first page's mxGraphModel, from a plain or compressed `.drawio` file, plus the number of pages. */
export function drawioModel(xml: string): { model: XNode; pages: number } {
  const doc = parseXml(xml.replace(/^\uFEFF/, ''));
  const top = doc.children.find(c => c.tag === 'mxfile' || c.tag === 'mxGraphModel');
  if (!top) throw new Error('This file is not a Draw.io XML diagram.');
  if (top.tag === 'mxGraphModel') return { model: top, pages: 1 };
  const pages = top.children.filter(c => c.tag === 'diagram');
  const first = pages[0];
  if (!first) throw new Error('The diagram has no pages.');
  const inner = find(first, 'mxGraphModel');
  if (inner) return { model: inner, pages: pages.length };
  if (!first.text.trim()) throw new Error('The first diagram page is empty.');
  const expanded = parseXml(inflateDiagram(first.text));
  const model = expanded.tag === 'mxGraphModel' ? expanded : find(expanded, 'mxGraphModel');
  if (!model) throw new Error('The diagram page could not be read.');
  return { model, pages: pages.length };
}

/** draw.io style string as flags (bare words) and key-value pairs. */
export function parseStyle(style: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of style.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq < 0) out.set(p, '1');
    else out.set(p.slice(0, eq).trim(), p.slice(eq + 1).trim());
  }
  return out;
}
/** `#rgb` or `#rrggbb` as `#rrggbb`; 'none' as 'none'; anything else undefined. */
export function drawioColor(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (v === 'none') return 'none';
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}
/** Plain text from a cell label, which may be HTML when the style has html=1. */
export function labelText(value: string): string {
  if (!/[<&]/.test(value)) return value;
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<(div|p|li|h[1-6]|tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Boardroom kind for a draw.io vertex style; unknown styles fall back to rectangles. */
export function vertexKind(s: Map<string, string>): Kind | 'skip' {
  const shape = (s.get('shape') ?? '').toLowerCase(),
    has = (flag: string) => s.get(flag) === '1' || shape === flag.toLowerCase();
  if (has('group')) return 'skip';
  if (has('text') || shape === 'text') return 'text';
  if (has('swimlane') || shape === 'swimlane' || shape === 'table') return 'frame';
  if (has('ellipse') || shape === 'doubleellipse' || shape.endsWith('.start_1') || shape.endsWith('.on-page_reference'))
    return 'ellipse';
  if (has('rhombus') || shape.endsWith('.decision')) return 'diamond';
  if (has('triangle')) return 'triangle';
  if (has('hexagon')) return 'hexagon';
  if (shape.startsWith('cylinder') || shape === 'datastore' || shape.endsWith('.database')) return 'cylinder';
  if (shape === 'parallelogram' || shape.endsWith('.data')) return 'parallelogram';
  if (shape === 'process' || shape.endsWith('.predefined_process')) return 'predefined';
  if (shape.endsWith('.terminator')) return 'terminator';
  if (shape === 'document' || shape.endsWith('.document')) return 'document';
  if (has('cloud')) return 'cloud';
  if (shape === 'umlactor') return 'actor';
  if (shape === 'note' || shape.endsWith('.note')) return 'umlnote';
  if (s.get('rounded') === '1') return 'roundrect';
  return 'rectangle';
}
const arrowHeads: Record<string, ConnectorHead> = {
  none: 'none',
  classic: 'arrow',
  classicthin: 'arrow',
  block: 'arrow',
  blockthin: 'arrow',
  open: 'open',
  openthin: 'open',
  oval: 'circle',
  dash: 'none',
  diamond: 'diamond',
  diamondthin: 'diamond',
  ermany: 'many',
  erone: 'one',
  ermandone: 'one',
  erzerotomany: 'zero-many',
  eronetomany: 'one-many',
  erzerotoone: 'zero-one',
};
const head = (v: string | undefined, fallback: ConnectorHead): ConnectorHead =>
  v === undefined ? fallback : (arrowHeads[v.toLowerCase()] ?? 'arrow');
const num = (v: string | undefined, fallback = 0) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type DrawioImport = { items: Item[]; shapes: number; connectors: number; skipped: number; pages: number };

/**
 * Native objects for the first page of a draw.io file, centred on `at`. `limit` caps the number of objects
 * (the board's remaining room): shapes come first, then connectors between shapes that were kept.
 */
export function drawioToItems(xml: string, at: Point, make: Make, limit = 2000): DrawioImport {
  const { model, pages } = drawioModel(xml);
  const root = find(model, 'root') ?? model;
  // Cells may be wrapped in <UserObject>/<object> elements that carry the label and id.
  type Cell = { id: string; parent: string; value: string; style: Map<string, string>; node: XNode; edge: boolean };
  const cells: Cell[] = [];
  for (const c of root.children) {
    const cell = c.tag === 'mxCell' ? c : c.children.find(k => k.tag === 'mxCell');
    if (!cell) continue;
    const wrapped = c !== cell;
    cells.push({
      id: (wrapped ? c.attrs.id : cell.attrs.id) ?? '',
      parent: cell.attrs.parent ?? '',
      value: wrapped ? (c.attrs.label ?? '') : (cell.attrs.value ?? ''),
      style: parseStyle(cell.attrs.style ?? ''),
      node: cell,
      edge: cell.attrs.edge === '1',
    });
  }
  const byId = new Map(cells.map(c => [c.id, c]));
  const geometry = (c: Cell) => c.node.children.find(k => k.tag === 'mxGeometry');
  const isVertex = (c: Cell) => c.node.attrs.vertex === '1' && geometry(c)?.attrs.relative !== '1';
  /** Absolute position of a cell's origin: containers and groups offset their children. */
  const origin = (id: string, guard = 0): Point => {
    const c = byId.get(id);
    if (!c || guard > 50 || !isVertex(c)) return { x: 0, y: 0 };
    const g = geometry(c)!,
      p = origin(c.parent, guard + 1);
    return { x: p.x + num(g.attrs.x), y: p.y + num(g.attrs.y) };
  };
  const vertices = cells.filter(isVertex);
  const placed: { cell: Cell; kind: Kind; x: number; y: number; w: number; h: number }[] = [];
  for (const c of vertices) {
    const kind = vertexKind(c.style);
    if (kind === 'skip') continue;
    const g = geometry(c)!,
      o = origin(c.id);
    placed.push({
      cell: c,
      kind,
      x: o.x,
      y: o.y,
      w: Math.max(1, num(g.attrs.width, 120)),
      h: Math.max(1, num(g.attrs.height, 60)),
    });
  }
  // Containers (frames) first so they stay behind their contents, as on the canvas.
  placed.sort((a, b) => Number(b.kind === 'frame') - Number(a.kind === 'frame'));
  const minX = Math.min(...placed.map(p => p.x)),
    minY = Math.min(...placed.map(p => p.y)),
    maxX = Math.max(...placed.map(p => p.x + p.w)),
    maxY = Math.max(...placed.map(p => p.y + p.h));
  const dx = placed.length ? at.x - (minX + maxX) / 2 : 0,
    dy = placed.length ? at.y - (minY + maxY) / 2 : 0;
  const items: Item[] = [],
    idMap = new Map<string, Item>();
  let skipped = 0;
  for (const p of placed) {
    if (items.length >= limit) {
      skipped++;
      continue;
    }
    const s = p.cell.style,
      fill = drawioColor(s.get('fillColor')),
      stroke = drawioColor(s.get('strokeColor')),
      font = drawioColor(s.get('fontColor')),
      text = labelText(p.cell.value).slice(0, 6000);
    const base = make(p.kind, Math.round(p.x + dx), Math.round(p.y + dy), fill && fill !== 'none' ? fill : '#ffffff');
    const item: Item = {
      ...base,
      w: Math.round(p.kind === 'text' ? Math.max(20, p.w) : p.w),
      h: Math.round(p.kind === 'text' ? Math.max(20, p.h) : p.h),
      text: p.kind === 'frame' ? text.slice(0, 200) || 'Container' : text,
    };
    if (p.kind === 'text') item.fill = font && font !== 'none' ? font : '#25252a';
    else if (p.kind !== 'frame') {
      const style: Item['style'] = {};
      if (stroke === 'none') style.borderWidth = 0;
      else {
        if (stroke) style.borderColor = stroke;
        if (s.has('strokeWidth')) style.borderWidth = clamp(num(s.get('strokeWidth'), 1), 0, 24);
      }
      if (s.get('dashed') === '1') style.borderStyle = 'dashed';
      if (Object.keys(style).length) item.style = style;
      if (font && font !== 'none' && text) {
        item.spans = [{ start: 0, end: text.length, color: font }];
        item.spansFor = textHash(text);
      }
    }
    if (p.kind !== 'frame') {
      const format: Item['format'] = { ...item.format };
      const size = num(s.get('fontSize'), 0),
        bits = num(s.get('fontStyle'), 0),
        align = s.get('align'),
        valign = s.get('verticalAlign');
      if (size) format.fontSize = clamp(Math.round(size), 10, 96);
      if (bits & 1) format.bold = true;
      if (bits & 2) format.italic = true;
      if (bits & 4) format.underline = true;
      if (align === 'left' || align === 'center' || align === 'right') format.align = align;
      if (valign === 'top' || valign === 'middle' || valign === 'bottom') format.valign = valign;
      if (Object.keys(format).length) item.format = format;
    }
    items.push(item);
    idMap.set(p.cell.id, item);
  }
  let connectors = 0;
  // Labels drawn as child cells of an edge join that edge's caption.
  const edgeLabels = new Map<string, string[]>();
  for (const c of cells)
    if (c.node.attrs.vertex === '1' && byId.get(c.parent)?.edge) {
      const t = labelText(c.value);
      if (t) edgeLabels.set(c.parent, [...(edgeLabels.get(c.parent) ?? []), t]);
    }
  for (const c of cells.filter(e => e.edge)) {
    const g = geometry(c),
      point = (as: string) => {
        const n = g?.children.find(k => k.tag === 'mxPoint' && k.attrs.as === as);
        if (!n) return undefined;
        const o = origin(c.parent);
        return { x: o.x + num(n.attrs.x) + dx, y: o.y + num(n.attrs.y) + dy };
      };
    const from = idMap.get(c.node.attrs.source ?? ''),
      to = idMap.get(c.node.attrs.target ?? ''),
      a = from ? undefined : point('sourcePoint'),
      b = to ? undefined : point('targetPoint');
    if ((!from && !a) || (!to && !b)) continue;
    if (items.length >= limit) {
      skipped++;
      continue;
    }
    const s = c.style,
      edgeStyle = (s.get('edgeStyle') ?? '').toLowerCase(),
      stroke = drawioColor(s.get('strokeColor')),
      connector: ConnectorFormat = {
        path:
          s.get('curved') === '1'
            ? 'curved'
            : /orthogonal|elbow|entityrelation|isometric/.test(edgeStyle)
              ? 'elbow'
              : 'straight',
        endHead: head(s.get('endArrow'), 'arrow'),
        startHead: head(s.get('startArrow'), 'none'),
      };
    if (s.has('strokeWidth')) connector.width = clamp(num(s.get('strokeWidth'), 2), 1, 12);
    if (s.get('dashed') === '1') connector.dash = 'dashed';
    const start = a ?? { x: from!.x + from!.w / 2, y: from!.y + from!.h / 2 },
      end = b ?? { x: to!.x + to!.w / 2, y: to!.y + to!.h / 2 };
    const label = [labelText(c.value), ...(edgeLabels.get(c.id) ?? [])].filter(Boolean).join('\n').slice(0, 200);
    const line: Item = {
      ...make('arrow', Math.round(start.x), Math.round(start.y)),
      w: Math.round(end.x - start.x),
      h: Math.round(end.y - start.y),
      text: label,
      connector,
    };
    if (stroke && stroke !== 'none') line.fill = stroke;
    if (from) line.from = from.id;
    if (to) line.to = to.id;
    items.push(line);
    connectors++;
  }
  if (!items.length) throw new Error('The diagram has no shapes to import.');
  return { items, shapes: items.length - connectors, connectors, skipped, pages };
}

export const BOARD_OBJECT_LIMIT = 2000;
/**
 * Replace a Draw.io widget with native shapes drawn from its diagram, centred where the widget was (one undo
 * step when applied with `update`). Locked widgets are unchanged.
 */
export function convertDrawioWidget(
  board: Board,
  id: string,
  make: Make,
): { board: Board; result: DrawioImport } | null {
  const widget = board.items.find(i => i.id === id);
  if (!widget || widget.type !== 'drawio' || widget.locked) return null;
  const room = BOARD_OBJECT_LIMIT - board.items.length + 1;
  const result = drawioToItems(
    String(widget.data?.xml ?? ''),
    { x: widget.x + widget.w / 2, y: widget.y + widget.h / 2 },
    make,
    room,
  );
  const index = board.items.indexOf(widget);
  return {
    board: { ...board, items: [...board.items.slice(0, index), ...result.items, ...board.items.slice(index + 1)] },
    result,
  };
}
/** Status message after an import: counts, plus what was left out. */
export function drawioImportNote(r: DrawioImport): string {
  const parts = [
    `Imported ${r.shapes} ${r.shapes === 1 ? 'shape' : 'shapes'} and ${r.connectors} ${r.connectors === 1 ? 'connector' : 'connectors'}.`,
  ];
  if (r.skipped)
    parts.push(`${r.skipped} more did not fit the ${BOARD_OBJECT_LIMIT.toLocaleString('en')}-object limit.`);
  if (r.pages > 1) parts.push(`Only the first of ${r.pages} pages was imported.`);
  return parts.join(' ');
}
