// Switch type, copy/paste style, frame around selection and select-by-type (gap list D3, D5, D7, D10). Pure.
import type { Board, Item, Kind } from './model.ts';
import { createItem } from './model.ts';
import { isShapeKind, shapeLabels } from './shapes.ts';
import type { ShapeKind } from './shapes.ts';
import { editableIds, expandGroups } from './arrange.ts';
import { selectionBounds } from './interactions.ts';
import { toCard } from './card-tools.ts';

export type SwitchTarget = 'note' | 'text' | 'card' | ShapeKind;
/** Objects Switch type works on: sticky notes, text and shapes (cards switch back to notes, text or shapes). */
export const canSwitch = (i: Item) => ['note', 'text', 'card'].includes(i.type) || isShapeKind(i.type);

const TEXT_INK = '#25252a';
const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 235;
};

/** Change one object's kind, keeping id (connectors stay attached), position, text, link and tags. */
export function switchItem(item: Item, target: SwitchTarget): Item {
  if (item.type === target) return item;
  if (target === 'card') return toCard(item);
  const base: Item = { ...item, type: target as Kind };
  for (const k of ['data', 'emoji', 'recordRef'] as const) delete (base as Record<string, unknown>)[k];
  if (target === 'note') {
    const note = createItem('note', 0, 0);
    base.fill = item.type === 'text' || isLight(item.fill) ? note.fill : item.fill;
    base.w = base.h = Math.max(120, Math.min(Math.max(item.w, item.h), 400));
    delete base.style;
  } else if (target === 'text') {
    base.fill = TEXT_INK;
    delete base.style;
  } else {
    // Shapes: a text object becomes a white shape; notes and cards keep their colour.
    if (item.type === 'text') base.fill = '#ffffff';
  }
  if (item.type === 'card') delete base.format;
  return base;
}

/** Switch every selected, unlocked object that supports it. */
export function switchType(board: Board, ids: string[], target: SwitchTarget): { board: Board; switched: number } {
  const chosen = new Set(editableIds(board, ids));
  let switched = 0;
  const items = board.items.map(i => {
    if (!chosen.has(i.id) || !canSwitch(i) || i.type === target || i.recordRef) return i;
    switched++;
    return switchItem(i, target);
  });
  return { board: switched ? { ...board, items } : board, switched };
}
export const switchLabel = (t: SwitchTarget) =>
  t === 'note' ? 'Sticky note' : t === 'text' ? 'Text' : t === 'card' ? 'Card' : shapeLabels[t];

// ---- Copy and paste style (D7) -------------------------------------------------------------
export type StyleClip = Pick<Item, 'fill' | 'format' | 'style' | 'connector' | 'opacity'> & { from: Kind };
/** The copied style, shared by the context menu and Ctrl+Alt+C / Ctrl+Alt+V (per tab, not saved). */
export const styleClipboard: { current: StyleClip | null } = { current: null };
export function copyStyle(item: Item): StyleClip {
  return {
    from: item.type,
    fill: item.fill,
    ...(item.format ? { format: structuredClone(item.format) } : {}),
    ...(item.style ? { style: structuredClone(item.style) } : {}),
    ...(item.connector ? { connector: structuredClone(item.connector) } : {}),
    ...(item.opacity !== undefined ? { opacity: item.opacity } : {}),
  };
}
const family = (k: Kind) => (k === 'arrow' ? 'line' : k === 'text' ? 'text' : isShapeKind(k) ? 'shape' : k);
/**
 * Apply a copied style to unlocked objects. Colour and opacity apply to every kind except images; text
 * format applies to notes, text and shapes; borders to shapes; line style only between connectors.
 */
export function pasteStyle(board: Board, ids: string[], clip: StyleClip): { board: Board; styled: number } {
  const chosen = new Set(editableIds(board, expandGroups(board, ids)));
  let styled = 0;
  const textLike = (k: Kind) => k === 'note' || k === 'text' || isShapeKind(k);
  const items = board.items.map(i => {
    if (!chosen.has(i.id) || ['image', 'video', 'pdf', 'pen'].includes(i.type)) return i;
    const next: Item = { ...i };
    const sameFamily = family(i.type) === family(clip.from);
    // Text colour and fill mean different things on text vs. filled objects: only copy fill within a family,
    // or between filled objects (notes, shapes, cards, frames).
    if (sameFamily || (i.type !== 'text' && i.type !== 'arrow' && clip.from !== 'text' && clip.from !== 'arrow'))
      next.fill = clip.fill;
    if (clip.opacity !== undefined) next.opacity = clip.opacity;
    if (clip.format && textLike(i.type) && textLike(clip.from)) next.format = structuredClone(clip.format);
    if (clip.style && isShapeKind(i.type)) next.style = structuredClone(clip.style);
    if (clip.connector && i.type === 'arrow') next.connector = { ...i.connector, ...structuredClone(clip.connector) };
    if (JSON.stringify(next) === JSON.stringify(i)) return i;
    styled++;
    return next;
  });
  return { board: styled ? { ...board, items } : board, styled };
}

// ---- Frame around selection (D10) ------------------------------------------------------------
export function frameAround(board: Board, ids: string[], padding = 40): { board: Board; frame: Item } | null {
  const picked = expandGroups(board, ids).filter(id => board.items.find(i => i.id === id)?.type !== 'frame');
  const b = selectionBounds(board.items, picked);
  if (!b) return null;
  const frame = {
    ...createItem('frame', 0, 0),
    x: Math.round(b.x - padding),
    y: Math.round(b.y - padding - 24),
    w: Math.round(b.w + padding * 2),
    h: Math.round(b.h + padding * 2 + 24),
  };
  frame.text = frame.text || 'Frame';
  // Frames paint first; put the new one before the first selected object.
  const first = board.items.findIndex(i => picked.includes(i.id));
  const items = [...board.items];
  items.splice(Math.max(0, first), 0, frame);
  return { board: { ...board, items }, frame };
}

// ---- Select by type (D5) ----------------------------------------------------------------------
/** Counts of each kind in the selection, most common first. */
export function typesIn(board: Board, ids: string[]): { type: Kind; count: number }[] {
  const counts = new Map<Kind, number>();
  for (const id of ids) {
    const t = board.items.find(i => i.id === id)?.type;
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}
export const onlyType = (board: Board, ids: string[], type: Kind) =>
  ids.filter(id => board.items.find(i => i.id === id)?.type === type);
export const allOfType = (board: Board, type: Kind) =>
  board.items.filter(i => i.type === type && !i.hidden).map(i => i.id);
export const kindLabel = (k: Kind) =>
  isShapeKind(k)
    ? shapeLabels[k]
    : (({ note: 'Sticky note', text: 'Text', arrow: 'Connector', pen: 'Drawing' } as Record<string, string>)[k] ??
      k[0].toUpperCase() + k.slice(1));

// ---- Keyboard connect (gap F9) ------------------------------------------------------------------
/** Source chosen with "Start connection here", kept per tab until used. */
export const pendingConnection: { from: string | null } = { from: null };
/** Connect objects in order (a → b → c …) with new connectors. Pairs already connected are skipped. */
export function connectItems(board: Board, ids: string[]): { board: Board; connectors: Item[] } {
  const exists = (a: string, b: string) => board.items.some(i => i.type === 'arrow' && i.from === a && i.to === b);
  const valid = ids.filter(id => {
    const i = board.items.find(x => x.id === id);
    return i && i.type !== 'arrow' && i.type !== 'pen';
  });
  const connectors: Item[] = [];
  for (let k = 1; k < valid.length; k++) {
    if (valid[k - 1] === valid[k] || exists(valid[k - 1], valid[k])) continue;
    connectors.push({ ...createItem('arrow', 0, 0), from: valid[k - 1], to: valid[k] });
  }
  return { board: connectors.length ? { ...board, items: [...board.items, ...connectors] } : board, connectors };
}
