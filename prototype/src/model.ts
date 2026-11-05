import { shapeEdge, shapeSizes, isShapeKind, shapeKinds } from './shapes.ts';
import type { ShapeKind } from './shapes.ts';
import { validateExtensions } from './model-ext.ts';
import { migrateTimelineFlags } from './timeline-flags.ts';
import { rotatePoint } from './rotation.ts';
import { widgetSizes, specFor } from './widget-specs.ts';
export type WidgetKind =
  | 'drawio'
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
  | 'quiz'
  | 'slides'
  | 'openended'
  | 'people'
  | 'usercard'
  | 'shortcut'
  | 'stickypad'
  | 'chart'
  | 'entity'
  | 'swimlane'
  | 'estimates'
  | 'dotpile'
  | 'file';
export const widgetKinds: WidgetKind[] = [
  'drawio',
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
  'slides',
  'openended',
  'people',
  'usercard',
  'shortcut',
  'stickypad',
  'chart',
  'entity',
  'swimlane',
  'estimates',
  'dotpile',
  'file',
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
  ...shapeKinds,
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
  status: string;
  assignee: string;
  start: string;
  end: string;
  milestone?: boolean;
  dependsOn?: string[];
  tags?: string[];
  link?: string;
  points?: number;
  description?: string;
  values?: import('./record-schema.ts').RecordValues;
  /** Parent record id in the same dataset (validated in records.ts recordsError). */
  parent?: string;
  /** Record colour (#rrggbb from `recordColors`), shown on Kanban cards and Timeline bars. */
  color?: string;
};
/** Topic outline styles (track R5); a missing shape is the default rounded box. */
export const mindNodeShapes = ['rounded', 'rect', 'pill', 'underline'] as const;
export type MindNodeShape = (typeof mindNodeShapes)[number];
/** `collapsed` hides descendants; `color` overrides the branch colour; `shape` and `link` (track R5). */
export type MindNode = {
  id: string;
  parent: string | null;
  text: string;
  position?: Point;
  collapsed?: boolean;
  color?: string;
  shape?: MindNodeShape;
  link?: string;
};
/** Fonts offered for text (gap D14). Values are font ids; `fontStack` maps them to CSS font stacks. */
export const fontFamilies = [
  'Arial',
  'Georgia',
  'monospace',
  'Verdana',
  'Trebuchet MS',
  'Times New Roman',
  'Rounded',
  'Handwriting',
] as const;
export type FontFamily = (typeof fontFamilies)[number];
/** CSS font stack for a font id: only fonts that ship with common operating systems, no downloads. */
export const fontStack = (f: FontFamily | undefined): string =>
  f === 'Rounded'
    ? "ui-rounded, 'Arial Rounded MT Bold', 'Segoe UI', Arial, sans-serif"
    : f === 'Handwriting'
      ? "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"
      : f === 'Times New Roman'
        ? "'Times New Roman', Times, serif"
        : f === 'Trebuchet MS'
          ? "'Trebuchet MS', Arial, sans-serif"
          : f === 'Verdana'
            ? 'Verdana, Geneva, sans-serif'
            : f === 'monospace'
              ? "ui-monospace, Consolas, 'Courier New', monospace"
              : (f ?? 'Arial');
export type TextFormat = {
  background?: string;
  highlight?: string;
  strike?: boolean;
  autoHeight?: boolean;
  fontSize?: number | 'auto';
  fontWeight?: number;
  /** Vertical text offset in world pixels; positive values move down. */
  baselineOffsetY?: number;
  fontFamily?: FontFamily;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  list?: 'none' | 'bullet' | 'number';
};
export type Point = { x: number; y: number };
/** A pen stroke point; `p` is the stylus pressure (0..1), recorded only for pen input (track R2-K). */
export type StrokePoint = Point & { p?: number };
/** `one`, `many`, `zero-one`, `zero-many` and `one-many` are ERD crow's-foot heads (gap E3). */
export const connectorHeads = [
  'none',
  'arrow',
  'open',
  'circle',
  'diamond',
  'one',
  'many',
  'zero-one',
  'zero-many',
  'one-many',
] as const;
export type ConnectorHead = (typeof connectorHeads)[number];
/** Extra connector label at fraction `at` (0 to 1) along the path (gap E4). */
export type ConnectorLabel = {
  id: string;
  text: string;
  at: number;
  /** Text colour `#rrggbb` and font size in world pixels (track R2-H); missing means the defaults. */
  color?: string;
  size?: number;
};
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
  /** World-unit gap between an attached end and its object (item 113). */
  gap?: number;
  bends?: Bend[];
  startSide?: Side;
  endSide?: Side;
  jumps?: boolean;
  labelAt?: number;
  /** Main caption colour `#rrggbb` and font size (track R2-H). */
  labelColor?: string;
  labelSize?: number;
  /** Labels in addition to the main caption (`Item.text`). */
  labels?: ConnectorLabel[];
};
export type ShapeStyle = {
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  borderOpacity?: number;
  /** Corner radius in world units for rectangles, rounded rectangles and images (gaps D8, D11). */
  radius?: number;
  /** Image mask: the outline an image is clipped to inside its box (gap D11; more outlines in track G). */
  mask?: import('./image-masks.ts').ImageMask;
};
export type Crop = { x: number; y: number; w: number; h: number };
export type FrameFormat = { preset: string; orientation: 'portrait' | 'landscape' };
export type GroupDef = { id: string; parent: string | null };
export type ImageAsset = { mime: string; data: string; width: number; height: number; name: string };
/** Non-destructive image adjustments (gap b6-6); brightness and contrast are percentages, 100 = unchanged. */
export type ImageAdjust = { flipX?: boolean; flipY?: boolean; brightness?: number; contrast?: number };
export type Item = {
  id: string;
  type: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill: string;
  points?: StrokePoint[];
  from?: string;
  to?: string;
  nodes?: MindNode[];
  datasetId?: string;
  recordRef?: { datasetId: string; recordId: string };
  recordGroup?: string;
  recordView?: import('./record-query.ts').RecordViewConfig;
  format?: TextFormat;
  /** Per-word styles, links and mentions over `text`; used only while `spansFor` is the hash of `text`. */
  spans?: import('./rich-text.ts').TextSpan[];
  spansFor?: string;
  link?: string;
  tags?: string[];
  connector?: ConnectorFormat;
  style?: ShapeStyle;
  group?: string;
  locked?: boolean;
  assetId?: string;
  /**
   * Images converted to PNG when added (SVG, BMP): the asset holding the file as it was added (gap R2-Q3).
   * It is only ever downloaded ("Download original"), never drawn.
   */
  originalAssetId?: string;
  crop?: Crop;
  /** Image flip, brightness and contrast, applied when drawn; the stored picture is unchanged. */
  adjust?: ImageAdjust;
  /** Animated GIF playback (track G): start paused, and/or play the animation once instead of looping. */
  gif?: { paused?: boolean; once?: boolean };
  emoji?: string;
  /** Display name of whoever created a sticky note on this device (item 85). */
  author?: string;
  /** Show this note's author in its bottom-left corner (item 111). */
  showAuthor?: boolean;
  /** Sticky note shape used by the size presets: a wide 2:1 rectangle; missing means square. */
  noteShape?: NoteShape;
  frame?: FrameFormat;
  language?: string;
  /** Per-widget payload; shape is defined and validated by the widget registry (widget-types.ts). */
  data?: Record<string, any>;
  /** Layers panel: display name, visibility. */
  name?: string;
  hidden?: boolean;
  opacity?: number;
  /** Click-to-navigate link to another object or frame. */
  linkTo?: string;
  /** Text alternative for images and media (accessibility checker). */
  alt?: string;
  /** Layer id (gap D9); missing means the base layer. */
  layer?: string;
  /** Emoji reactions on a sticky note with their counts (gap D13). */
  reactions?: Record<string, number>;
  /** Clockwise rotation in degrees around the box centre, in [0, 360) (gap D1). */
  rotation?: number;
  /** When the object was created and last modified on this device (ISO; object info in the inspector). */
  createdAt?: string;
  modifiedAt?: string;
  /**
   * Shape or connector generated from Mermaid code: `frame` is the linked diagram frame (its `data.mermaid` holds the
   * code) and `id` the stable Mermaid key (node or subgraph id, or `from>to#n` for an edge). See mermaid-link.ts.
   */
  mermaidNode?: { frame: string; id: string };
  /**
   * Callout tail (track R2-H): tip offset from the callout's top-left corner, and optionally the object it points
   * at. With a `target`, the tip follows that object; `x`/`y` keep the last position for when it is removed.
   */
  tail?: CalloutTail;
  /** Estimate dropped on a sticky note from an estimate palette: story points, "?" or a T-shirt size (track F). */
  estimate?: string;
  /** Person dropped on a sticky note from a People widget (track F). */
  assignee?: string;
  /** Voting dots dropped from dot piles, per pile, with the pile's colour when placed (track F). */
  dots?: PlacedDots[];
};
export type PlacedDots = { pile: string; color: string; n: number };
export type CalloutTail = { x: number; y: number; target?: string };
export type CommentThread = {
  id: string;
  itemId?: string;
  x: number;
  y: number;
  resolved?: boolean;
  /** Pinned threads are listed first (gap G9). */
  pinned?: boolean;
  /** Pin colour on the canvas (one of `commentColors`). */
  color?: string;
  messages: CommentMessage[];
};
/** `editedAt` marks an edited message; `reactions` holds distinct emoji reactions (gap G9). */
export type CommentMessage = { id: string; text: string; at: string; editedAt?: string; reactions?: string[] };
export type VotingSession = {
  active: boolean;
  budget: number;
  targets: string[];
  votes: Record<string, number>;
  startedAt: string;
  /** ISO time at which the session ends automatically (gap G5). */
  endsAt?: string;
  /** At most one vote per object (gap G5). */
  onePerObject?: boolean;
};
export type VotingResult = {
  endedAt: string;
  budget: number;
  totals: { id: string; label: string; votes: number }[];
  /** User-given name for a stored result (gap G5). */
  name?: string;
};
export type Board = {
  version: 1;
  title: string;
  items: Item[];
  datasets?: Record<string, RecordRow[]>;
  recordSchemas?: Record<string, import('./record-schema.ts').RecordSchema>;
  groups?: GroupDef[];
  presentation?: string[];
  assets?: Record<string, ImageAsset>;
  comments?: CommentThread[];
  voting?: VotingSession;
  votingResults?: VotingResult[];
  privateMode?: { all: boolean; frames: string[] };
  /** Named layers bottom to top (gap D9); see layers.ts. */
  layers?: import('./layers.ts').Layer[];
  /** Frame whose area is the board's thumbnail on the dashboard (gap C13). */
  thumbnailFrame?: string;
  /** View-only board (gap C16): editing is refused until it is turned off. */
  viewOnly?: boolean;
  /** Comment-only board (track R2-K): only comment changes are accepted; see board-modes.ts. */
  commentOnly?: boolean;
  /** Card tag colours by tag name (item 115); tags without an entry use the default colour. */
  tagColors?: Record<string, string>;
  /** Show sticky note authors (item 85). */
  showAuthors?: boolean;
  /** Board settings (item 103): canvas colour, the view new visitors open at, and a status. */
  background?: string;
  startView?: { x: number; y: number; z: number };
  /** Open the board in this format object's focus view (a Table, Kanban, Timeline, Doc or Slides id). */
  startObject?: string;
  status?: 'draft' | 'in-progress' | 'review' | 'approved' | 'done' | 'outdated';
  /** Short board description (shown in Details and on dashboard cards). */
  description?: string;
  /** Sensitivity label (track R2-K): shown in the top bar and on dashboard cards, and stamped on exports. */
  sensitivity?: import('./board-settings.ts').Sensitivity;
  /** Board notes (track L): Markdown shown in the docked notes panel; see board-notes.ts. */
  notes?: string;
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
  // Dark colours (item 98): text on these switches to white automatically.
  '#3d5afe',
  '#1e3a8a',
  '#166534',
  '#1f1f23',
];
/** Spoken names for palette colours (gap F10); other colours fall back to their hex code. */
export const colorNames: Record<string, string> = {
  '#fff49b': 'Light yellow',
  '#ffe36e': 'Yellow',
  '#ffb879': 'Orange',
  '#ffa0a7': 'Red',
  '#f7c5ef': 'Pink',
  '#d3b7f6': 'Violet',
  '#a8cdff': 'Light blue',
  '#8ce3eb': 'Cyan',
  '#a9e8bb': 'Light green',
  '#d1ec9c': 'Lime',
  '#ffffff': 'White',
  '#e4e4e7': 'Grey',
  '#3d5afe': 'Blue',
  '#1e3a8a': 'Dark blue',
  '#166534': 'Dark green',
  '#1f1f23': 'Black',
  '#25252a': 'Black',
  '#4262ff': 'Blue',
  '#e5484d': 'Red',
  '#2f9e44': 'Green',
  '#f59f00': 'Amber',
  '#7048e8': 'Purple',
};
export const colorName = (hex: string) => colorNames[hex.toLowerCase()] ?? hex;
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
    items = board.items
      .filter(
        i => !removed.has(i.id) && !(i.type === 'arrow' && (removed.has(i.from ?? '') || removed.has(i.to ?? ''))),
      )
      .map(i => {
        // A callout pointing at a removed object keeps its tail where it pointed (track R2-H).
        if (!i.tail?.target || !removed.has(i.tail.target)) return i;
        const tip = calloutTailTip(i, board.items)!;
        return { ...i, tail: { x: Math.round(tip.x), y: Math.round(tip.y) } };
      });
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
  if (
    (next.items ?? board.items).some(
      i => i.type === 'grid' && (i.data as import('./grid.ts').GridData).objects?.some(o => !alive.has(o.id)),
    )
  )
    next.items = (next.items ?? board.items).map(i =>
      i.type === 'grid'
        ? {
            ...i,
            data: {
              ...i.data,
              objects: (i.data as import('./grid.ts').GridData).objects?.filter(o => alive.has(o.id)),
            },
          }
        : i,
    );
  if ((next.items ?? board.items).some(i => i.linkTo && !alive.has(i.linkTo)))
    next.items = (next.items ?? board.items).map(i => {
      if (!i.linkTo || alive.has(i.linkTo)) return i;
      const n = { ...i };
      delete n.linkTo;
      return n;
    });
  // A callout pointing at a removed object keeps its tail where it last pointed (track R2-H).
  if ((next.items ?? board.items).some(i => i.tail?.target && !alive.has(i.tail.target)))
    next.items = (next.items ?? board.items).map(i => {
      if (!i.tail?.target || alive.has(i.tail.target)) return i;
      return { ...i, tail: { x: i.tail.x, y: i.tail.y } };
    });
  if (board.privateMode && board.privateMode.frames.some(f => !alive.has(f)))
    next.privateMode = { ...board.privateMode, frames: board.privateMode.frames.filter(f => alive.has(f)) };
  return next;
}
export function center(i: Item): Point {
  return { x: i.x + i.w / 2, y: i.y + i.h / 2 };
}
export function edge(item: Item, toward: Point): Point {
  // Rotated objects (gap D1): solve on the unrotated outline, then turn the point back.
  if (item.rotation) {
    const c = center(item);
    return rotatePoint(flatEdge(item, rotatePoint(toward, c, -item.rotation)), c, item.rotation);
  }
  return flatEdge(item, toward);
}
/**
 * Tip of a callout's custom tail in the callout's own unrotated frame (track R2-H), or null for the built-in
 * tail. An attached tail points at the edge of its target, seen from the callout's centre.
 */
export function calloutTailTip(i: Item, items: Item[]): Point | null {
  if (!i.tail) return null;
  const target = i.tail.target ? items.find(n => n.id === i.tail!.target && n.id !== i.id) : undefined;
  if (!target) return { x: i.tail.x, y: i.tail.y };
  const c = center(i),
    hit = edge(target, c),
    d = Math.hypot(c.x - hit.x, c.y - hit.y) || 1,
    // Stop just short of the target's outline so the tip stays visible.
    world = { x: hit.x + ((c.x - hit.x) / d) * 4, y: hit.y + ((c.y - hit.y) / d) * 4 },
    flat = i.rotation ? rotatePoint(world, c, -i.rotation) : world;
  return { x: flat.x - i.x, y: flat.y - i.y };
}
function flatEdge(item: Item, toward: Point): Point {
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
  // The face is in the object's own frame, so a rotated object keeps its 'top' with it.
  return edge(
    item,
    rotatePoint(
      { x: c.x + (v.x ? v.x * item.w : offset), y: c.y + (v.y ? v.y * item.h : offset) },
      c,
      item.rotation ?? 0,
    ),
  );
}
/** Faces used by each endpoint. A self-loop defaults to leaving right and returning on top. */
export function connectorSides(i: Item): [Side | undefined, Side | undefined] {
  const loop = !!i.from && i.from === i.to;
  return [i.connector?.startSide ?? (loop ? 'right' : undefined), i.connector?.endSide ?? (loop ? 'top' : undefined)];
}
/** Push attached ends `gap` units away from their objects, along the direction out of the object. */
function withGap(i: Item, from: Item | undefined, to: Item | undefined, ends: [Point, Point]): [Point, Point] {
  const gap = i.connector?.gap ?? 0;
  if (!gap) return ends;
  const push = (p: Point, owner: Item | undefined) => {
    if (!owner) return p;
    const c = { x: owner.x + owner.w / 2, y: owner.y + owner.h / 2 },
      dx = p.x - c.x,
      dy = p.y - c.y,
      // Side midpoints and edge points: step along the outward side normal (dominant axis relative to size).
      horizontal = Math.abs(dx) / Math.max(1, owner.w) >= Math.abs(dy) / Math.max(1, owner.h);
    return horizontal ? { x: p.x + Math.sign(dx || 1) * gap, y: p.y } : { x: p.x, y: p.y + Math.sign(dy || 1) * gap };
  };
  return [push(ends[0], from), push(ends[1], to)];
}
export function endpoints(i: Item, items: Item[]): [Point, Point] {
  const [from, to] = [items.find(n => n.id === i.from), items.find(n => n.id === i.to)];
  return withGap(i, from, to, rawEndpoints(i, items));
}
function rawEndpoints(i: Item, items: Item[]): [Point, Point] {
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
            typeof r.status !== 'string' ||
            !r.status.trim() ||
            r.status.length > 80 ||
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
      i.text.length > (i.type === 'card' ? 20000 : 6000) ||
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
          p =>
            !p ||
            ![p.x, p.y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7) ||
            (p.p !== undefined && !(typeof p.p === 'number' && Number.isFinite(p.p) && p.p >= 0 && p.p <= 1)),
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
        [c.startHead, c.endHead].some(h => h !== undefined && !(connectorHeads as readonly string[]).includes(h))
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
    // Not tied to the note type: converting a note to another kind keeps the field harmlessly.
    if (i.noteShape !== undefined && !(noteShapes as readonly string[]).includes(i.noteShape as string))
      throw new Error('Invalid sticky note shape.');
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
        (f.fontFamily !== undefined && !(fontFamilies as readonly string[]).includes(f.fontFamily)) ||
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
    if (
      i.recordRef !== undefined &&
      (i.type !== 'card' ||
        !i.recordRef ||
        typeof i.recordRef.datasetId !== 'string' ||
        !i.recordRef.datasetId ||
        i.recordRef.datasetId.length > 200 ||
        typeof i.recordRef.recordId !== 'string' ||
        !i.recordRef.recordId ||
        i.recordRef.recordId.length > 200)
    )
      throw new Error('Invalid synced card reference.');
    if (i.type === 'mindmap') validateMindNodes(i.nodes);
  }
  validateExtensions(b);
  // Timeline flags stored on objects by older boards move to their datasets (P2-Q6).
  return migrateTimelineFlags(clone(b));
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
        (n.position !== undefined &&
          (!n.position ||
            ![n.position.x, n.position.y].every(
              v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000,
            ))) ||
        (n.parent !== null && typeof n.parent !== 'string') ||
        (n.collapsed !== undefined && typeof n.collapsed !== 'boolean') ||
        (n.color !== undefined && (typeof n.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(n.color))) ||
        (n.shape !== undefined && !(mindNodeShapes as readonly string[]).includes(n.shape)) ||
        (n.link !== undefined && !validLink(n.link)),
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
/** A stored web link: a string that is already in normalized http(s) form. */
export function validLink(value: unknown): boolean {
  if (typeof value !== 'string' || !value || value.length > 2048) return false;
  try {
    return normalizeNoteLink(value) === value;
  } catch {
    return false;
  }
}
export const noteShapes = ['square', 'rectangle'] as const;
export type NoteShape = (typeof noteShapes)[number];
/** Sticky note size presets: the height of the note (a square note is as wide; a rectangle twice as wide). */
export const noteSizes = [140, 210, 300] as const;
/** The preset a note matches (shape plus size), or 'custom' after a free resize. */
export function noteSizeOf(item: Pick<Item, 'w' | 'h' | 'noteShape'>): number | 'custom' {
  const ratio = item.noteShape === 'rectangle' ? 2 : 1;
  return (noteSizes as readonly number[]).includes(item.h) && item.w === item.h * ratio ? item.h : 'custom';
}
/**
 * The change that gives a note a preset size and shape, keeping its centre. A custom-sized note switching shape
 * keeps its height. Square notes drop the field so older boards stay byte-identical.
 */
export function noteSizePatch(
  item: Pick<Item, 'x' | 'y' | 'w' | 'h' | 'noteShape'>,
  size: number | 'keep',
  shape: NoteShape = item.noteShape ?? 'square',
): Pick<Item, 'x' | 'y' | 'w' | 'h' | 'noteShape'> {
  const h = size === 'keep' ? Math.max(40, Math.min(item.h, 1000)) : size,
    w = shape === 'rectangle' ? h * 2 : h;
  return {
    x: item.x + (item.w - w) / 2,
    y: item.y + (item.h - h) / 2,
    w,
    h,
    noteShape: shape === 'rectangle' ? 'rectangle' : undefined,
  };
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
  const occupied = board.items.filter(i => !['frame', 'swimlane', 'arrow'].includes(i.type));
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
