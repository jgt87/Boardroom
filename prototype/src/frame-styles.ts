// Frame style palettes (gap G8) and validation of every frame setting stored in `frame.data`.
// A style recolours the sticky notes, shapes and text inside selected frames. The colours each object had
// before the first style was applied are kept on the frame, so "Remove style" restores them exactly.
import type { Board, Item } from './model.ts';
import { isShapeKind } from './shapes.ts';

export type FramePalette = {
  id: string;
  name: string;
  /** Frame background. */
  frame: string;
  /** Sticky note colours, assigned to the distinct original note colours in order. */
  notes: string[];
  /** Shape fills, assigned the same way. */
  shapes: string[];
  border: string;
  text: string;
};
export const framePalettes: FramePalette[] = [
  {
    id: 'sunrise',
    name: 'Sunrise',
    frame: '#fff8ec',
    notes: ['#ffe36e', '#ffb879', '#ffa0a7', '#fff49b'],
    shapes: ['#ffd8a8', '#ffc9c9', '#fff3bf'],
    border: '#e8590c',
    text: '#7a2e0b',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    frame: '#eef6ff',
    notes: ['#a8cdff', '#8ce3eb', '#d3b7f6', '#ffffff'],
    shapes: ['#d0ebff', '#c5f6fa', '#e5dbff'],
    border: '#1c7ed6',
    text: '#0b3d6b',
  },
  {
    id: 'forest',
    name: 'Forest',
    frame: '#f1f9ef',
    notes: ['#a9e8bb', '#d1ec9c', '#fff49b', '#e4e4e7'],
    shapes: ['#d3f9d8', '#e9fac8', '#f4fce3'],
    border: '#2b8a3e',
    text: '#1b4d2b',
  },
  {
    id: 'berry',
    name: 'Berry',
    frame: '#fdf0fa',
    notes: ['#f7c5ef', '#d3b7f6', '#ffa0a7', '#ffffff'],
    shapes: ['#fcc2d7', '#eebefa', '#f3d9fa'],
    border: '#a61e4d',
    text: '#5c1a3b',
  },
  {
    id: 'mono',
    name: 'Monochrome',
    frame: '#f4f4f5',
    notes: ['#ffffff', '#e4e4e7', '#d4d4d8', '#a1a1aa'],
    shapes: ['#ffffff', '#e4e4e7', '#d4d4d8'],
    border: '#3f3f46',
    text: '#18181b',
  },
  {
    id: 'night',
    name: 'Night',
    frame: '#1f2433',
    notes: ['#3d5afe', '#1e3a8a', '#166534', '#1f1f23'],
    shapes: ['#2f3a56', '#28324a', '#3a4566'],
    border: '#8ea2ff',
    text: '#f1f3ff',
  },
];
export const paletteById = (id: string) => framePalettes.find(p => p.id === id);

export type FrameStyle = { id: string; prev: Record<string, { fill: string; border?: string }> };
export const frameStyleOf = (frame: Item): FrameStyle | undefined =>
  frame.type === 'frame' ? (frame.data?.style as FrameStyle | undefined) : undefined;

const styleable = (i: Item) => i.type === 'note' || i.type === 'text' || isShapeKind(i.type);
const within = (f: Item, i: Item) => i.x >= f.x && i.y >= f.y && i.x + i.w <= f.x + f.w && i.y + i.h <= f.y + f.h;
/** Unlocked notes, shapes and text that lie entirely inside a frame. */
export const styleMembers = (board: Board, frame: Item) =>
  board.items.filter(i => i.id !== frame.id && styleable(i) && !i.locked && within(frame, i));

/** Map each distinct original colour (in first-seen order) to the palette colours in turn. */
function colourMap(originals: string[], palette: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of originals) if (!map.has(c)) map.set(c, palette[map.size % palette.length]);
  return map;
}

/** Apply a palette to frames (one board change). Re-applying keeps the colours from before the first style. */
export function applyFrameStyle(board: Board, frameIds: string[], paletteId: string): Board {
  const palette = paletteById(paletteId);
  if (!palette) throw new Error('Unknown frame style.');
  const frames = board.items.filter(i => frameIds.includes(i.id) && i.type === 'frame' && !i.locked);
  if (!frames.length) throw new Error('Select an unlocked frame to style.');
  const changes = new Map<string, Partial<Item>>();
  const frameData = new Map<string, Record<string, any>>();
  for (const f of frames) {
    const prev: FrameStyle['prev'] = { ...frameStyleOf(f)?.prev };
    const members = styleMembers(board, f);
    if (!prev[f.id]) prev[f.id] = { fill: f.fill };
    for (const m of members)
      if (!prev[m.id]) {
        prev[m.id] = { fill: m.fill };
        if (m.style?.borderColor) prev[m.id].border = m.style.borderColor;
      }
    const original = (i: Item) => prev[i.id]?.fill ?? i.fill;
    const notes = colourMap(members.filter(m => m.type === 'note').map(original), palette.notes),
      shapes = colourMap(members.filter(m => isShapeKind(m.type)).map(original), palette.shapes);
    for (const m of members) {
      if (m.type === 'note') changes.set(m.id, { fill: notes.get(original(m))! });
      else if (m.type === 'text') changes.set(m.id, { fill: palette.text });
      else changes.set(m.id, { fill: shapes.get(original(m))!, style: { ...m.style, borderColor: palette.border } });
    }
    frameData.set(f.id, { ...f.data, style: { id: palette.id, prev } satisfies FrameStyle });
  }
  return {
    ...board,
    items: board.items.map(i => {
      const d = frameData.get(i.id);
      if (d) return { ...i, fill: palette.frame, data: d };
      const c = changes.get(i.id);
      return c ? { ...i, ...c } : i;
    }),
  };
}

/** Restore the colours stored by `applyFrameStyle` and forget the style. Deleted objects are skipped. */
export function removeFrameStyle(board: Board, frameIds: string[]): Board {
  const restore = new Map<string, { fill: string; border?: string }>(),
    cleared = new Set<string>();
  for (const f of board.items) {
    if (!frameIds.includes(f.id) || f.locked) continue;
    const s = frameStyleOf(f);
    if (!s) continue;
    cleared.add(f.id);
    for (const [id, p] of Object.entries(s.prev)) restore.set(id, p);
  }
  if (!cleared.size) throw new Error('The selected frames have no style to remove.');
  return {
    ...board,
    items: board.items.map(i => {
      const p = restore.get(i.id);
      let n = i;
      if (p && !i.locked) {
        n = { ...i, fill: p.fill };
        if (isShapeKind(i.type) && i.style) {
          const style = { ...i.style };
          if (p.border) style.borderColor = p.border;
          else delete style.borderColor;
          if (Object.keys(style).length) n.style = style;
          else delete n.style;
        }
      }
      if (cleared.has(i.id)) {
        const data = { ...n.data };
        delete data.style;
        n = { ...n };
        if (Object.keys(data).length) n.data = data;
        else delete n.data;
      }
      return n;
    }),
  };
}

const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
// `hideTitle` hides the title above the frame on the canvas (track R5).
// `mermaid` (a link to Mermaid code) is validated in model-ext.ts with validateMermaidLink.
const frameKeys = ['contentHidden', 'notes', 'skipInPresentation', 'style', 'hideTitle', 'mermaid'];
export const FRAME_NOTES_MAX = 10000;
/** Validate `frame.data`: hidden contents, presenter notes, hidden-from-presentation flag and style. */
export function validateFrameData(d: unknown): void {
  const fail = () => {
    throw new Error('Invalid frame settings.');
  };
  if (!d || typeof d !== 'object' || Array.isArray(d)) return fail();
  const x = d as Record<string, unknown>;
  if (Object.keys(x).some(k => !frameKeys.includes(k))) fail();
  if (x.contentHidden !== undefined && typeof x.contentHidden !== 'boolean') fail();
  if (x.skipInPresentation !== undefined && typeof x.skipInPresentation !== 'boolean') fail();
  if (x.hideTitle !== undefined && typeof x.hideTitle !== 'boolean') fail();
  if (x.notes !== undefined && (typeof x.notes !== 'string' || x.notes.length > FRAME_NOTES_MAX)) fail();
  if (x.style !== undefined) {
    const s = x.style as FrameStyle;
    if (
      !s ||
      typeof s !== 'object' ||
      Array.isArray(s) ||
      Object.keys(s).some(k => k !== 'id' && k !== 'prev') ||
      typeof s.id !== 'string' ||
      !paletteById(s.id) ||
      !s.prev ||
      typeof s.prev !== 'object' ||
      Array.isArray(s.prev) ||
      Object.keys(s.prev).length > 2000 ||
      Object.values(s.prev).some(
        p =>
          !p ||
          typeof p !== 'object' ||
          Object.keys(p).some(k => k !== 'fill' && k !== 'border') ||
          !hex(p.fill) ||
          (p.border !== undefined && !hex(p.border)),
      )
    )
      fail();
  }
}
