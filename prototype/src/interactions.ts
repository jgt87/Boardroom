import { endpoints } from './model.ts';
import type { Board, Item, Point } from './model.ts';
export type Bounds = { x: number; y: number; w: number; h: number };
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
/** Screen-pixel gap between an object and its selection outline (item 112). */
export const SELECT_GAP = 6;
/** Screen-pixel distance of the connection dots outside the outline (item 112). */
export const ANCHOR_GAP = 16;
export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';
export const anchorSides: AnchorSide[] = ['top', 'right', 'bottom', 'left'];
/** World position of a connection dot for bounds `b` at zoom `z`. */
export function anchorPoint(b: Bounds, side: AnchorSide, z: number) {
  const g = (SELECT_GAP + ANCHOR_GAP) / z;
  return side === 'top'
    ? { x: b.x + b.w / 2, y: b.y - g }
    : side === 'bottom'
      ? { x: b.x + b.w / 2, y: b.y + b.h + g }
      : side === 'left'
        ? { x: b.x - g, y: b.y + b.h / 2 }
        : { x: b.x + b.w + g, y: b.y + b.h / 2 };
}
export type Guide = { axis: 'x' | 'y'; at: number; start: number; end: number };
export function itemBounds(item: Item, items: Item[]): Bounds {
  if (item.type !== 'arrow') return { x: item.x, y: item.y, w: item.w, h: item.h };
  const [a, b] = endpoints(item, items);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}
export function selectionBounds(items: Item[], ids: string[]): Bounds | null {
  const selected = new Set(ids),
    boxes = items.filter(i => selected.has(i.id)).map(i => itemBounds(i, items));
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map(b => b.x)),
    y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}
export function contains(outer: Bounds, inner: Bounds) {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
export function frameMoveIds(items: Item[], ids: string[]): string[] {
  const selected = new Set(ids),
    frames = items.filter(i => selected.has(i.id) && i.type === 'frame');
  for (const item of items) if (frames.some(frame => contains(frame, itemBounds(item, items)))) selected.add(item.id);
  return [...selected];
}
export function translate(board: Board, ids: string[], delta: Point): Board {
  const moved = new Set(ids);
  return {
    ...board,
    items: board.items.map(i => {
      if (!moved.has(i.id)) return i;
      if (i.type === 'arrow' && ((i.from && !moved.has(i.from)) || (i.to && !moved.has(i.to)))) {
        const [a, b] = endpoints(i, board.items);
        return {
          ...i,
          x: a.x + delta.x,
          y: a.y + delta.y,
          w: b.x - a.x,
          h: b.y - a.y,
          from: i.from && moved.has(i.from) ? i.from : undefined,
          to: i.to && moved.has(i.to) ? i.to : undefined,
        };
      }
      return { ...i, x: i.x + delta.x, y: i.y + delta.y };
    }),
  };
}
export function selectWithin(items: Item[], bounds: Bounds): string[] {
  return items.filter(i => contains(bounds, itemBounds(i, items))).map(i => i.id);
}
export function snapMove(
  board: Board,
  ids: string[],
  delta: Point,
  threshold: number,
  disabled = false,
  constrain = false,
): { delta: Point; guides: Guide[] } {
  const next = { ...delta };
  const lock = constrain ? (Math.abs(next.x) >= Math.abs(next.y) ? 'y' : 'x') : null;
  if (lock) next[lock] = 0;
  const b = selectionBounds(board.items, ids),
    guides: Guide[] = [];
  if (!b || disabled) return { delta: next, guides };
  const moving = new Set(ids),
    others = board.items.filter(i => !moving.has(i.id) && i.type !== 'arrow' && i.type !== 'pen');
  for (const axis of ['x', 'y'] as const) {
    if (lock === axis) continue;
    const span = axis === 'x' ? 'w' : 'h',
      other = axis === 'x' ? 'y' : 'x',
      otherSpan = axis === 'x' ? 'h' : 'w';
    const anchors = [b[axis], b[axis] + b[span] / 2, b[axis] + b[span]];
    let best: { distance: number; at: number; target: Item } | null = null;
    for (const target of others)
      for (const at of [target[axis], target[axis] + target[span] / 2, target[axis] + target[span]])
        for (const anchor of anchors) {
          const distance = at - anchor - next[axis];
          if (Math.abs(distance) <= threshold && (!best || Math.abs(distance) < Math.abs(best.distance)))
            best = { distance, at, target };
        }
    if (best) {
      next[axis] += best.distance;
      guides.push({
        axis,
        at: best.at,
        start: Math.min(b[other] + next[other], best.target[other]) - 18,
        end: Math.max(b[other] + next[other] + b[otherSpan], best.target[other] + best.target[otherSpan]) + 18,
      });
    }
  }
  return { delta: next, guides };
}
export function resizeBounds(b: Bounds, handle: Handle, delta: Point, aspect = false): Bounds {
  let left = b.x,
    right = b.x + b.w,
    top = b.y,
    bottom = b.y + b.h;
  if (handle.includes('w')) left = Math.min(right - 40, left + delta.x);
  if (handle.includes('e')) right = Math.max(left + 40, right + delta.x);
  if (handle.includes('n')) top = Math.min(bottom - 30, top + delta.y);
  if (handle.includes('s')) bottom = Math.max(top + 30, bottom + delta.y);
  if (aspect && handle.length === 2 && b.w > 0 && b.h > 0) {
    const scale = Math.max(
      40 / b.w,
      30 / b.h,
      Math.abs((right - left) / b.w - 1) >= Math.abs((bottom - top) / b.h - 1)
        ? (right - left) / b.w
        : (bottom - top) / b.h,
    );
    const w = b.w * scale,
      h = b.h * scale;
    if (handle.includes('w')) left = right - w;
    else right = left + w;
    if (handle.includes('n')) top = bottom - h;
    else bottom = top + h;
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}
export function resizeItems(board: Board, ids: string[], before: Bounds, after: Bounds): Board {
  const selected = new Set(ids),
    sx = after.w / Math.max(before.w, 1),
    sy = after.h / Math.max(before.h, 1);
  return {
    ...board,
    items: board.items.map(i => {
      if (!selected.has(i.id)) return i;
      const resized = {
        ...i,
        x: after.x + (i.x - before.x) * sx,
        y: after.y + (i.y - before.y) * sy,
        w: i.w * sx,
        h: i.h * sy,
      };
      if (i.type !== 'arrow') {
        resized.w = Math.max(1, resized.w);
        resized.h = Math.max(1, resized.h);
      }
      if (i.points) resized.points = i.points.map(p => ({ x: p.x * sx, y: p.y * sy }));
      return resized;
    }),
  };
}
export function handlePoint(bounds: Bounds, handle: Handle): Point {
  return {
    x: bounds.x + (handle.includes('w') ? 0 : handle.includes('e') ? bounds.w : bounds.w / 2),
    y: bounds.y + (handle.includes('n') ? 0 : handle.includes('s') ? bounds.h : bounds.h / 2),
  };
}
