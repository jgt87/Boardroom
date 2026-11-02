import { shapeEdge, shapeSizes, isShapeKind } from './shapes.ts';
import type { ShapeKind } from './shapes.ts';
import { validateExtensions } from './model-ext.ts';
import { widgetSizes, specFor } from './widget-specs.ts';
export type WidgetKind =
  | 'card'
  | 'flipcard'
  | 'grid'
  | 'divider'
  | 'stamp'
  | 'icon'
  | 'qr'
  | 'video'
  | 'pdf'
  | 'bookmark'
  | 'embed'
  | 'doc'
  | 'orgchart'
  | 'storymap'
  | 'wireframe'
  | 'screen'
  | 'autolayout'
  | 'matrix'
  | 'poll'
  | 'spinner'
  | 'scale'
  | 'journey'
  | 'planner'
  | 'wordcloud'
  | 'ranking'
  | 'quiz';
export const widgetKinds: WidgetKind[] = [
  'card',
  'flipcard',
  'grid',
  'divider',
  'stamp',
  'icon',
  'qr',
  'video',
  'pdf',
  'bookmark',
  'embed',
  'doc',
  'orgchart',
  'storymap',
  'wireframe',
  'screen',
  'autolayout',
  'matrix',
  'poll',
  'spinner',
  'scale',
  'journey',
  'planner',
  'wordcloud',
  'ranking',
  'quiz',
];
export type Kind =
  | 'note'
  | 'text'
  | ShapeKind
  | 'frame'
  | 'pen'
  | 'arrow'
  | 'mermaid'
  | 'mindmap'
  | 'table'
  | 'kanban'
  | 'timeline'
  | 'image'
  | 'code'
  | WidgetKind;
export const allKinds: Kind[] = [
  'note',
  'text',
  'rectangle',
  'ellipse',
  'diamond',
  'roundrect',
  'triangle',
  'cylinder',
  'parallelogram',
  'hexagon',
  'predefined',
  'terminator',
  'frame',
  'pen',
  'arrow',
  'mermaid',
  'mindmap',
  'table',
  'kanban',
  'timeline',
  'image',
  'code',
  ...widgetKinds,
];
export type RecordRow = {
  id: string;
  title: string;
  status: 'Not started' | 'In progress' | 'Complete';
  assignee: string;
  start: string;
  end: string;
  milestone?: boolean;
  dependsOn?: string[];
  tags?: string[];
  link?: string;
  points?: number;
};
export type MindNode = { id: string; parent: string | null; text: string };
export type TextFormat = {
  background?: string;
  highlight?: string;
  strike?: boolean;
  autoHeight?: boolean;
  fontSize?: number | 'auto';
  fontFamily?: 'Arial' | 'Georgia' | 'monospace';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  list?: 'none' | 'bullet' | 'number';
};
export type Point = { x: number; y: number };
export type ConnectorHead = 'none' | 'arrow' | 'open' | 'circle' | 'diamond';
export type Side = 'top' | 'right' | 'bottom' | 'left';
/** Manual bend in the start-to-end frame: u along the line, v perpendicular (both as fractions of its length). */
export type Bend = { u: number; v: number };
export type ConnectorFormat = {
  path?: 'straight' | 'elbow' | 'curved';
  width?: number;
  dash?: 'solid' | 'dashed' | 'dotted';
  startHead?: ConnectorHead;
  endHead?: ConnectorHead;
  avoid?: boolean;
  clearance?: number;
  bends?: Bend[];
  startSide?: Side;
  endSide?: Side;
  jumps?: boolean;
  labelAt?: number;
};
export type ShapeStyle = {
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  borderOpacity?: number;
};
export type Crop = { x: number; y: number; w: number; h: number };
export type FrameFormat = { preset: string; orientation: 'portrait' | 'landscape' };
export type GroupDef = { id: string; parent: string | null };
export type ImageAsset = { mime: string; data: string; width: number; height: number; name: string };
export type Item = {
  id: string;
  type: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill: string;
  points?: Point[];
  from?: string;
  to?: string;
  nodes?: MindNode[];
  datasetId?: string;
  format?: TextFormat;
  link?: string;
  tags?: string[];
  connector?: ConnectorFormat;
  style?: ShapeStyle;
  group?: string;
  locked?: boolean;
  assetId?: string;
  crop?: Crop;
  emoji?: string;
  frame?: FrameFormat;
  language?: string;
  /** Per-widget payload; shape is defined and validated by the widget registry (widget-types.ts). */
  data?: Record<string, any>;
  /** Layers panel: display name, visibility. */
  name?: string;
  hidden?: boolean;
  /** Click-to-navigate link to another object or frame. */
  linkTo?: string;
  /** Text alternative for images and media (accessibility checker). */
  alt?: string;
};
export type CommentThread = {
  id: string;
  itemId?: string;
  x: number;
  y: number;
  resolved?: boolean;
  messages: { id: string; text: string; at: string }[];
};
export type VotingSession = {
  active: boolean;
  budget: number;
  targets: string[];
  votes: Record<string, number>;
  startedAt: string;
};
export type VotingResult = { endedAt: string; budget: number; totals: { id: string; label: string; votes: number }[] };
export type Board = {
  version: 1;
  title: string;
  items: Item[];
  datasets?: Record<string, RecordRow[]>;
  groups?: GroupDef[];
  presentation?: string[];
  assets?: Record<string, ImageAsset>;
  comments?: CommentThread[];
  voting?: VotingSession;
  votingResults?: VotingResult[];
  privateMode?: { all: boolean; frames: string[] };
};
export type History = { past: Board[]; current: Board; future: Board[] };
export const colors = [
  '#fff49b',
  '#ffe36e',
  '#ffb879',
  '#ffa0a7',
  '#f7c5ef',
  '#d3b7f6',
  '#a8cdff',
  '#8ce3eb',
  '#a9e8bb',
  '#d1ec9c',
  '#ffffff',
  '#e4e4e7',
];
export const clone = <T>(value: T): T => structuredClone(value);
export const newBoard = (): Board => ({ version: 1, title: 'My first board', items: [] });
export function createItem(type: Kind, x: number, y: number, fill = colors[0]): Item {
  const dimensions: Record<Kind, [number, number]> = {
    ...widgetSizes,
    ...shapeSizes,
    note: [210, 210],
    text: [260, 90],
    frame: [650, 430],
    pen: [1, 1],
    arrow: [180, 0],
    mermaid: [620, 400],
    mindmap: [700, 440],
    table: [760, 400],
    kanban: [760, 400],
    timeline: [760, 400],
    image: [320, 240],
    code: [460, 260],
  };
  const [w, h] = dimensions[type];
  const item: Item = {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    w,
    h,
    fill:
      type === 'frame' || type === 'code' || type === 'image'
        ? '#ffffff'
        : type === 'text' || type === 'arrow' || type === 'pen'
          ? '#25252a'
          : fill,
    text: type === 'frame' ? 'Untitled frame' : '',
  };
  return specFor(type)?.init?.(item) ?? item;
}
export function commit(history: History, board: Board): History {
  if (JSON.stringify(board) === JSON.stringify(history.current)) return history;
  return { past: [...history.past.slice(-79), clone(history.current)], current: clone(board), future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), current: clone(h.past.at(-1)!), future: [clone(h.current), ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, clone(h.current)], current: clone(h.future[0]), future: h.future.slice(1) };
}
export function removeItems(board: Board, ids: string[]): Board {
  const removed = new Set(ids),
    items = board.items.filter(
      i => !removed.has(i.id) && !(i.type === 'arrow' && (removed.has(i.from ?? '') || removed.has(i.to ?? ''))),
    );
  return pruneReferences({ ...board, items });
}
/** Drop empty groups and presentation entries whose frames no longer exist. */
export function pruneReferences(board: Board): Board {
  const next = { ...board };
  if (board.groups) {
    let groups = board.groups;
    for (let changed = true; changed;) {
      changed = false;
      const kept = groups.filter(g => board.items.some(i => i.group === g.id) || groups.some(c => c.parent === g.id));
      if (kept.length !== groups.length) {
        groups = kept;
        changed = true;
      }
    }
    const known = new Set(groups.map(g => g.id));
    if (groups.length) next.groups = groups.map(g => (g.parent && !known.has(g.parent) ? { ...g, parent: null } : g));
    else delete next.groups;
    if (board.items.some(i => i.group && !known.has(i.group)))
      next.items = board.items.map(i => (i.group && !known.has(i.group) ? { ...i, group: undefined } : i));
  }
  if (board.presentation) {
    const frames = new Set(board.items.filter(i => i.type === 'frame').map(i => i.id));
    next.presentation = board.presentation.filter(id => frames.has(id));
  }
  const alive = new Set((next.items ?? board.items).map(i => i.id));
  if ((next.items ?? board.items).some(i => i.linkTo && !alive.has(i.linkTo)))
    next.items = (next.items ?? board.items).map(i => {
      if (!i.linkTo || alive.has(i.linkTo)) return i;
      const n = { ...i };
      delete n.linkTo;
      return n;
    });
  if (board.privateMode && board.privateMode.frames.some(f => !alive.has(f)))
    next.privateMode = { ...board.privateMode, frames: board.privateMode.frames.filter(f => alive.has(f)) };
  return next;
}
export function center(i: Item): Point {
  return { x: i.x + i.w / 2, y: i.y + i.h / 2 };
}
export function edge(item: Item, toward: Point): Point {
  if (isShapeKind(item.type) && !['rectangle', 'ellipse', 'diamond'].includes(item.type))
    return shapeEdge(item.type, item, toward);
  const c = center(item),
    dx = toward.x - c.x,
    dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const rx = item.w / 2,
    ry = item.h / 2;
  const f =
    item.type === 'ellipse'
      ? 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
      : item.type === 'diamond'
        ? 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry)
        : Math.min(rx / (Math.abs(dx) || 1e-9), ry / (Math.abs(dy) || 1e-9));
  return { x: c.x + dx * f, y: c.y + dy * f };
}
export const sideVector: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
/** Anchor on a chosen face of an object; offset slides the anchor along that face. */
export function sideAnchor(item: Item, side: Side, offset = 0): Point {
  const c = center(item),
    v = sideVector[side];
  return edge(item, { x: c.x + (v.x ? v.x * item.w : offset), y: c.y + (v.y ? v.y * item.h : offset) });
}
/** Faces used by each endpoint. A self-loop defaults to leaving right and returning on top. */
export function connectorSides(i: Item): [Side | undefined, Side | undefined] {
  const loop = !!i.from && i.from === i.to;
  return [i.connector?.startSide ?? (loop ? 'right' : undefined), i.connector?.endSide ?? (loop ? 'top' : undefined)];
}
export function endpoints(i: Item, items: Item[]): [Point, Point] {
  const from = items.find(n => n.id === i.from),
    to = items.find(n => n.id === i.to);
  const [startSide, endSide] = connectorSides(i);
  if ((from && startSide) || (to && endSide)) {
    const same = !!from && !!to && from.id === to.id && startSide === endSide,
      shift = same ? (startSide === 'top' || startSide === 'bottom' ? from!.w : from!.h) / 4 : 0;
    const a = from && startSide ? sideAnchor(from, startSide, -shift) : null,
      b = to && endSide ? sideAnchor(to, endSide, shift) : null;
    const start =
      a ?? (from ? edge(from, b ?? (to ? center(to) : { x: i.x + i.w, y: i.y + i.h })) : { x: i.x, y: i.y });
    const end = b ?? (to ? edge(to, a ?? (from ? center(from) : { x: i.x, y: i.y })) : { x: i.x + i.w, y: i.y + i.h });
    return [start, end];
  }
  const start = from ? center(from) : { x: i.x, y: i.y },
    end = to ? center(to) : { x: i.x + i.w, y: i.y + i.h };
  if (i.connector?.path && i.connector.path !== 'straight') {
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    return [
      from ? edge(from, horizontal ? { x: end.x, y: start.y } : { x: start.x, y: end.y }) : start,
      to ? edge(to, horizontal ? { x: start.x, y: end.y } : { x: end.x, y: start.y }) : end,
    ];
  }
  return [from ? edge(from, end) : start, to ? edge(to, start) : end];
}
export function parseBoard(raw: unknown): Board {
  if (!raw || typeof raw !== 'object') throw new Error('This file is not a Boardroom board.');
  const b = raw as Board;
  if (
    b.version !== 1 ||
    typeof b.title !== 'string' ||
    b.title.length > 200 ||
    !Array.isArray(b.items) ||
    b.items.length > 2000
  )
    throw new Error('Unsupported board format or size.');
  const ids = new Set<string>(),
    kinds = allKinds;
  if (b.datasets !== undefined) {
    if (
      !b.datasets ||
      typeof b.datasets !== 'object' ||
      Array.isArray(b.datasets) ||
      Object.keys(b.datasets).length > 2000
    )
      throw new Error('Invalid datasets.');
    for (const rows of Object.values(b.datasets)) {
      if (
        !Array.isArray(rows) ||
        rows.length > 1000 ||
        new Set(rows.map(r => r?.id)).size !== rows.length ||
        rows.some(
          r =>
            !r ||
            typeof r.id !== 'string' ||
            !r.id ||
            !['Not started', 'In progress', 'Complete'].includes(r.status) ||
            ![r.title, r.assignee, r.start, r.end].every(s => typeof s === 'string' && s.length <= 6000) ||
            ![r.start, r.end].every(s => s === '' || (/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)))),
        )
      )
        throw new Error('Invalid records.');
    }
  }
  for (const i of b.items) {
    if (
      !i ||
      typeof i.id !== 'string' ||
      !i.id ||
      ids.has(i.id) ||
      !kinds.includes(i.type) ||
      typeof i.text !== 'string' ||
      i.text.length > 6000 ||
      !/^#[0-9a-f]{6}$/i.test(i.fill)
    )
      throw new Error('The board contains an invalid object.');
    if (
      ![i.x, i.y, i.w, i.h].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7) ||
      (i.type !== 'arrow' && (i.w <= 0 || i.h <= 0))
    )
      throw new Error('The board contains invalid dimensions.');
    if (
      i.points &&
      (!Array.isArray(i.points) ||
        i.points.length > 20000 ||
        i.points.some(
          p => !p || ![p.x, p.y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7),
        ))
    )
      throw new Error('The board contains an invalid drawing.');
    if ((i.from !== undefined && typeof i.from !== 'string') || (i.to !== undefined && typeof i.to !== 'string'))
      throw new Error('The board contains an invalid connector.');
    ids.add(i.id);
    if (
      i.connector !== undefined &&
      (!i.connector ||
        typeof i.connector !== 'object' ||
        Array.isArray(i.connector) ||
        (i.connector.path !== undefined && !['straight', 'elbow', 'curved'].includes(i.connector.path)))
    )
      throw new Error('Invalid connector path.');
    if (i.connector) {
      const c = i.connector;
      if (
        (c.width !== undefined && (!Number.isFinite(c.width) || c.width < 1 || c.width > 12)) ||
        (c.dash !== undefined && !['solid', 'dashed', 'dotted'].includes(c.dash)) ||
        [c.startHead, c.endHead].some(
          h => h !== undefined && !['none', 'arrow', 'open', 'circle', 'diamond'].includes(h),
        )
      )
        throw new Error('Invalid connector styling.');
    }
    if (
      i.link !== undefined &&
      (typeof i.link !== 'string' || i.link.length > 2048 || normalizeNoteLink(i.link) !== i.link)
    )
      throw new Error('Invalid note link.');
    if (
      i.tags !== undefined &&
      (!Array.isArray(i.tags) ||
        i.tags.length > 10 ||
        new Set(i.tags).size !== i.tags.length ||
        i.tags.some(t => typeof t !== 'string' || !t.trim() || t !== t.trim() || t.length > 32))
    )
      throw new Error('Invalid note tags.');
    if (i.format?.valign !== undefined && !['top', 'middle', 'bottom'].includes(i.format.valign))
      throw new Error('Invalid vertical text alignment.');
    if (i.format) {
      const f = i.format;
      if (
        typeof f !== 'object' ||
        Array.isArray(f) ||
        (f.fontSize !== undefined &&
          f.fontSize !== 'auto' &&
          (typeof f.fontSize !== 'number' || !Number.isFinite(f.fontSize) || f.fontSize < 10 || f.fontSize > 96)) ||
        (f.fontFamily !== undefined && !['Arial', 'Georgia', 'monospace'].includes(f.fontFamily)) ||
        (f.align !== undefined && !['left', 'center', 'right'].includes(f.align)) ||
        (f.list !== undefined && !['none', 'bullet', 'number'].includes(f.list)) ||
        [f.bold, f.italic, f.underline].some(v => v !== undefined && typeof v !== 'boolean')
      )
        throw new Error('Invalid text formatting.');
    }
    if (
      ['table', 'kanban', 'timeline'].includes(i.type) &&
      (typeof i.datasetId !== 'string' || !Object.hasOwn(b.datasets ?? {}, i.datasetId))
    )
      throw new Error('Missing record dataset.');
    if (i.type === 'mindmap') validateMindNodes(i.nodes);
  }
  validateExtensions(b);
  return clone(b);
}
export const richKinds = ['mermaid', 'mindmap', 'table', 'kanban', 'timeline'];
export function validateMindNodes(nodes: unknown): asserts nodes is MindNode[] {
  if (
    !Array.isArray(nodes) ||
    !nodes.length ||
    nodes.length > 200 ||
    nodes.some(
      n =>
        !n ||
        typeof n.id !== 'string' ||
        !n.id ||
        typeof n.text !== 'string' ||
        n.text.length > 6000 ||
        (n.parent !== null && typeof n.parent !== 'string'),
    ) ||
    new Set(nodes.map(n => n.id)).size !== nodes.length ||
    nodes.filter(n => n.parent === null).length !== 1
  )
    throw new Error('Invalid mind map.');
  const map = new Map(nodes.map(n => [n.id, n]));
  for (const node of nodes) {
    const seen = new Set<string>();
    let n: MindNode | undefined = node;
    while (n) {
      if (seen.has(n.id)) throw new Error('Mind map cycle.');
      seen.add(n.id);
      if (n.parent !== null && !map.has(n.parent)) throw new Error('Missing mind map parent.');
      n = n.parent === null ? undefined : map.get(n.parent);
    }
  }
}
export function removeBranch(nodes: MindNode[], id: string): MindNode[] {
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (n.parent && removed.has(n.parent) && !removed.has(n.id)) {
        removed.add(n.id);
        changed = true;
      }
  }
  return nodes.filter(n => !removed.has(n.id));
}
export function bulkNotes(text: string, x: number, y: number, fill = colors[0]): Item[] {
  return text
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 100)
    .map((text, index) => ({
      ...createItem('note', x + (index % 4) * 230, y + Math.floor(index / 4) * 230, fill),
      text: text.slice(0, 6000),
    }));
}
export function normalizeNoteLink(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > 2048) throw new Error('Use a link shorter than 2,048 characters.');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text);
  } catch {
    throw new Error('Enter a valid website link.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error('Use an http or https website link without embedded credentials.');
  if (url.href.length > 2048) throw new Error('Use a link shorter than 2,048 characters.');
  return url.href;
}
export function normalizeNoteTags(value: string): string[] {
  const tags = [
    ...new Set(
      value
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    ),
  ];
  if (tags.length > 10 || tags.some(t => t.length > 32))
    throw new Error('Use up to 10 tags, each no longer than 32 characters.');
  return tags;
}
export function addConnectedNote(board: Board, sourceId: string): { board: Board; note: Item; connector: Item } {
  const source = board.items.find(i => i.id === sourceId);
  if (!source || source.type !== 'note') throw new Error('Select a sticky note to add a connected note.');
  if (board.items.length > 1998) throw new Error('Make room for two objects before adding a connected note.');
  const note = {
    ...createItem('note', source.x + source.w + 80, source.y, source.fill),
    w: source.w,
    h: source.h,
    format: source.format ? clone(source.format) : undefined,
  };
  const occupied = board.items.filter(i => !['frame', 'arrow'].includes(i.type));
  for (
    let attempt = 0;
    attempt < 2000 &&
    occupied.some(
      i =>
        note.x < i.x + i.w + 16 && note.x + note.w + 16 > i.x && note.y < i.y + i.h + 16 && note.y + note.h + 16 > i.y,
    );
    attempt++
  )
    note.y += note.h + 40;
  const connector = { ...createItem('arrow', 0, 0), from: source.id, to: note.id };
  return { board: { ...board, items: [...board.items, connector, note] }, note, connector };
}
