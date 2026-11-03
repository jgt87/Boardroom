// Pure helpers behind the properties inspector (item 5). Every edit returns a new Board, or the
// same board reference when nothing changes. Locked objects are never modified.
// Evidence: the audit's "Inspector UI and design-system tokens" module.
import type { Board, Item, ShapeStyle } from './model.ts';
import { endpoints } from './model.ts';
import { resizeItems, selectionBounds, translate } from './interactions.ts';
import type { Bounds } from './interactions.ts';
import { isShapeKind } from './shapes.ts';

export const LIMIT = 1e7;
export const MIN_W = 40;
export const MIN_H = 30;
export type GeometryField = 'x' | 'y' | 'w' | 'h';
export const MIXED = Symbol('mixed');
export type Shared<T> = T | typeof MIXED | undefined;

const textKinds = new Set(['note', 'text', 'card', 'flipcard']);
export const altKinds = new Set(['image', 'video', 'pdf', 'icon', 'qr']);
export const hasText = (i: Item) => textKinds.has(i.type) || isShapeKind(i.type);

export function selectedItems(board: Board, ids: string[]): Item[] {
  const set = new Set(ids);
  return board.items.filter(i => set.has(i.id));
}
/** The value shared by all items, MIXED when they differ, undefined for an empty list. */
export function shared<T>(items: Item[], get: (i: Item) => T): Shared<T> {
  if (!items.length) return undefined;
  const first = get(items[0]);
  return items.every(i => Object.is(get(i), first)) ? first : MIXED;
}
const finite = (v: number) => Number.isFinite(v) && Math.abs(v) <= LIMIT;
const anyLocked = (items: Item[]) => items.some(i => i.locked);

/** Items whose geometry the inspector edits: non-connectors. */
export const geometryItems = (board: Board, ids: string[]) => selectedItems(board, ids).filter(i => i.type !== 'arrow');
/** Bounds of the selection (single item: its own box). */
export function geometryOf(board: Board, ids: string[]): Bounds | null {
  const items = geometryItems(board, ids);
  return items.length
    ? selectionBounds(
        board.items,
        items.map(i => i.id),
      )
    : null;
}

/**
 * Set X/Y/W/H. Several objects move or scale as one box (relative layout kept); a single object
 * changes directly. Width/height respect the 40×30 minimum; any locked object blocks the edit.
 */
export function setGeometry(board: Board, ids: string[], field: GeometryField, value: number): Board {
  if (!finite(value)) return board;
  const items = geometryItems(board, ids);
  if (!items.length || anyLocked(items)) return board;
  const before = selectionBounds(
    board.items,
    items.map(i => i.id),
  )!;
  if (field === 'x' || field === 'y') {
    const delta = { x: field === 'x' ? value - before.x : 0, y: field === 'y' ? value - before.y : 0 };
    if (!delta.x && !delta.y) return board;
    return translate(
      board,
      items.map(i => i.id),
      delta,
    );
  }
  const size = Math.max(field === 'w' ? MIN_W : MIN_H, value);
  if (size === before[field]) return board;
  const after = { ...before, [field]: size };
  return resizeItems(
    board,
    items.map(i => i.id),
    before,
    after,
  );
}

function mapEditable(board: Board, ids: string[], fn: (i: Item) => Item): Board {
  const set = new Set(ids);
  let changed = false;
  const items = board.items.map(i => {
    if (!set.has(i.id) || i.locked) return i;
    const next = fn(i);
    if (next !== i) changed = true;
    return next;
  });
  return changed ? { ...board, items } : board;
}

export function setFill(board: Board, ids: string[], color: string): Board {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return board;
  return mapEditable(board, ids, i => (i.fill === color ? i : { ...i, fill: color }));
}

/** Border field on shapes only; other kinds are left untouched. */
export function setStyleField<K extends keyof ShapeStyle>(
  board: Board,
  ids: string[],
  key: K,
  value: ShapeStyle[K],
): Board {
  const valid =
    key === 'borderColor'
      ? /^#[0-9a-f]{6}$/i.test(String(value))
      : key === 'borderWidth'
        ? typeof value === 'number' && value >= 0 && value <= 24
        : key === 'borderOpacity'
          ? typeof value === 'number' && value >= 0 && value <= 1
          : ['solid', 'dashed', 'dotted'].includes(String(value));
  if (!valid) return board;
  return mapEditable(board, ids, i =>
    !isShapeKind(i.type) || i.style?.[key] === value ? i : { ...i, style: { ...i.style, [key]: value } },
  );
}

/** Font size for text-bearing objects: 'auto' or 10–96. */
export function setTextSize(board: Board, ids: string[], size: number | 'auto'): Board {
  if (size !== 'auto' && (!Number.isFinite(size) || size < 10 || size > 96)) return board;
  return mapEditable(board, ids, i =>
    !hasText(i) || (i.format?.fontSize ?? 'auto') === size ? i : { ...i, format: { ...i.format, fontSize: size } },
  );
}

/** Move one object forward (+1) or backward (−1) in paint order. */
export function moveLayer(board: Board, id: string, delta: number): Board {
  const from = board.items.findIndex(i => i.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= board.items.length || board.items[from].locked) return board;
  const items = board.items.slice();
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return { ...board, items };
}
export const layerPosition = (board: Board, id: string) => board.items.findIndex(i => i.id === id) + 1;

export function setHiddenFlag(board: Board, ids: string[], hidden: boolean): Board {
  return mapEditable(board, ids, i => {
    if (!!i.hidden === hidden) return i;
    const next = { ...i };
    if (hidden) next.hidden = true;
    else delete next.hidden;
    return next;
  });
}

/** Optional string field (name, alt): trimmed, removed when empty. */
export function setTextField(board: Board, id: string, key: 'name' | 'alt', value: string, max: number): Board {
  const clean = value.trim().slice(0, max);
  return mapEditable(board, [id], i => {
    if ((i[key] ?? '') === clean) return i;
    if (key === 'alt' && !altKinds.has(i.type)) return i;
    const next = { ...i };
    if (clean) next[key] = clean;
    else delete next[key];
    return next;
  });
}

export function clearLink(board: Board, id: string): Board {
  return mapEditable(board, [id], i => {
    if (!i.linkTo) return i;
    const next = { ...i };
    delete next.linkTo;
    return next;
  });
}

/** Board summary for an empty selection. */
export function boardSummary(board: Board) {
  return {
    title: board.title,
    objects: board.items.length,
    frames: board.items.filter(i => i.type === 'frame').length,
    connectors: board.items.filter(i => i.type === 'arrow').length,
  };
}

/** Connector endpoints, rounded, for read-only display. */
export function connectorEnds(board: Board, item: Item) {
  const [a, b] = endpoints(item, board.items);
  const r = (n: number) => Math.round(n);
  return { start: { x: r(a.x), y: r(a.y) }, end: { x: r(b.x), y: r(b.y) } };
}
