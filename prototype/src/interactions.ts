import { endpoints } from './model.ts';
import type { Board, Item, Point } from './model.ts';
import { boxCenter, canRotate, normalizeRotation, rotatePoint, rotatedBounds, snapAngle } from './rotation.ts';
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
  if (item.type !== 'arrow')
    return item.rotation ? rotatedBounds(item, item.rotation) : { x: item.x, y: item.y, w: item.w, h: item.h };
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
/** Kinds that carry the objects inside their bounds when moved (frames and swimlanes, gap E6). */
export const containerKinds = ['frame', 'swimlane'];
export const isContainer = (i: { type: string }) => containerKinds.includes(i.type);
export function frameMoveIds(items: Item[], ids: string[]): string[] {
  const selected = new Set(ids),
    frames = items.filter(i => selected.has(i.id) && isContainer(i));
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
    let best: { distance: number; at: number; target: Bounds } | null = null;
    for (const target of others.map(o => (o.rotation ? itemBounds(o, board.items) : o)))
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
export const GRID_SIZE = 40;
/** Adjust a move so the selection's top-left corner lands on the grid (gap D2). */
export function snapToGrid(board: Board, ids: string[], delta: Point, size = GRID_SIZE): Point {
  const b = selectionBounds(board.items, ids);
  if (!b) return delta;
  return {
    x: Math.round((b.x + delta.x) / size) * size - b.x,
    y: Math.round((b.y + delta.y) / size) * size - b.y,
  };
}
/** New bounds for a handle drag. `fromCentre` (Alt, gap D8) grows both opposite sides and keeps the centre. */
/** Snap the edges a resize moved to the grid (gap D2); unmoved edges stay put. Keeps at least one cell. */
export function snapResize(prev: Bounds, next: Bounds, size = GRID_SIZE): Bounds {
  const r = (v: number) => Math.round(v / size) * size || 0;
  let left = next.x,
    top = next.y,
    right = next.x + next.w,
    bottom = next.y + next.h;
  if (left !== prev.x) left = r(left);
  if (top !== prev.y) top = r(top);
  if (right !== prev.x + prev.w) right = r(right);
  if (bottom !== prev.y + prev.h) bottom = r(bottom);
  const movedRight = next.x + next.w !== prev.x + prev.w,
    movedBottom = next.y + next.h !== prev.y + prev.h;
  if (right - left < size) {
    if (movedRight) right = left + size;
    else left = right - size;
  }
  if (bottom - top < size) {
    if (movedBottom) bottom = top + size;
    else top = bottom - size;
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}
export function resizeBounds(b: Bounds, handle: Handle, delta: Point, aspect = false, fromCentre = false): Bounds {
  if (fromCentre) {
    const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0,
      sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
    let w = sx ? Math.max(40, b.w + 2 * sx * delta.x) : b.w,
      h = sy ? Math.max(30, b.h + 2 * sy * delta.y) : b.h;
    if (aspect && sx && sy && b.w > 0 && b.h > 0) {
      const scale = Math.max(40 / b.w, 30 / b.h, Math.abs(w / b.w - 1) >= Math.abs(h / b.h - 1) ? w / b.w : h / b.h);
      w = b.w * scale;
      h = b.h * scale;
    }
    const c = boxCenter(b);
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  }
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
/**
 * Scale objects from box `before` to box `after`. With `keepTurned` (a selection box in board axes), rotated objects
 * keep their shape instead of stretching along their own axes by the board-axis factors.
 */
export function resizeItems(board: Board, ids: string[], before: Bounds, after: Bounds, keepTurned = false): Board {
  const selected = new Set(ids),
    sx = after.w / Math.max(before.w, 1),
    sy = after.h / Math.max(before.h, 1);
  return {
    ...board,
    items: board.items.map(i => {
      if (!selected.has(i.id)) return i;
      if (keepTurned && i.rotation && i.type !== 'arrow') {
        // A rotated object stays a rotated rectangle (no skew): its centre follows the selection, and each of its
        // own axes stretches by the length the selection's scale gives that axis.
        const a = (i.rotation * Math.PI) / 180,
          cos = Math.cos(a),
          sin = Math.sin(a),
          lw = Math.hypot(sx * cos, sy * sin),
          lh = Math.hypot(sx * sin, sy * cos),
          cx = after.x + (i.x + i.w / 2 - before.x) * sx,
          cy = after.y + (i.y + i.h / 2 - before.y) * sy,
          w = Math.max(1, i.w * lw),
          h = Math.max(1, i.h * lh);
        const turned = { ...i, x: cx - w / 2, y: cy - h / 2, w, h };
        if (i.points) turned.points = i.points.map(p => ({ x: p.x * lw, y: p.y * lh }));
        return turned;
      }
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
/**
 * CSS cursor for a resize handle of an object turned by `rotation` degrees: the handle's direction after the turn,
 * rounded to the nearest of the eight resize cursors (which come in four axis pairs).
 */
export function resizeCursor(handle: Handle, rotation = 0): string {
  const base: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const step = (((Math.round((base[handle] + rotation) / 45) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  return `${['ew', 'nwse', 'ns', 'nesw'][step]}-resize`;
}
export function handlePoint(bounds: Bounds, handle: Handle): Point {
  return {
    x: bounds.x + (handle.includes('w') ? 0 : handle.includes('e') ? bounds.w : bounds.w / 2),
    y: bounds.y + (handle.includes('n') ? 0 : handle.includes('s') ? bounds.h : bounds.h / 2),
  };
}

/** Resize one rotated object by a handle in its own frame (gap D1): the drag is turned into the
 * object's axes, and the opposite side (or the centre with `fromCentre`) stays put on screen. */
export function resizeRotated(item: Item, handle: Handle, delta: Point, aspect = false, fromCentre = false): Bounds {
  const deg = item.rotation ?? 0,
    local = rotatePoint(delta, { x: 0, y: 0 }, -deg),
    next = resizeBounds(item, handle, local, aspect, fromCentre),
    shift = rotatePoint(
      { x: next.x + next.w / 2 - (item.x + item.w / 2), y: next.y + next.h / 2 - (item.y + item.h / 2) },
      { x: 0, y: 0 },
      deg,
    ),
    c = { x: item.x + item.w / 2 + shift.x, y: item.y + item.h / 2 + shift.y };
  return { x: c.x - next.w / 2, y: c.y - next.h / 2, w: next.w, h: next.h };
}
/** Rotate objects by `delta` degrees around `pivot` (gap D1). Rotatable objects turn and orbit; other
 * objects (frames, pen strokes, containers) only orbit; free connector ends turn with the selection. */
export function rotateItems(board: Board, ids: string[], delta: number, pivot: Point): Board {
  const chosen = new Set(ids);
  return {
    ...board,
    items: board.items.map(i => {
      if (!chosen.has(i.id)) return i;
      if (i.type === 'arrow') {
        const [a, b] = endpoints(i, board.items),
          s = i.from ? a : rotatePoint(a, pivot, delta),
          e = i.to ? b : rotatePoint(b, pivot, delta);
        return i.from && i.to ? i : { ...i, x: s.x, y: s.y, w: e.x - s.x, h: e.y - s.y };
      }
      const c = rotatePoint(boxCenter(i), pivot, delta),
        moved = { ...i, x: c.x - i.w / 2, y: c.y - i.h / 2 };
      if (!canRotate(i)) return moved;
      const rotation = normalizeRotation((i.rotation ?? 0) + delta);
      if (rotation) moved.rotation = rotation;
      else delete moved.rotation;
      return moved;
    }),
  };
}
/** Set an absolute rotation on objects, each around its own centre (inspector field). */
export function setRotation(board: Board, ids: string[], deg: number): Board {
  const chosen = new Set(ids),
    rotation = normalizeRotation(deg);
  return {
    ...board,
    items: board.items.map(i => {
      if (!chosen.has(i.id) || !canRotate(i) || (i.rotation ?? 0) === rotation) return i;
      const next: Item = { ...i, rotation };
      if (!rotation) delete next.rotation;
      return next;
    }),
  };
}
/** Turn of a rotate drag. With `snap`, a single object lands on a multiple of 15 degrees
 * (`base` is its starting rotation); a multi-selection turns in 15-degree steps. */
export function rotationDelta(raw: number, snap: boolean, base: number | null): number {
  if (!snap) return raw;
  return base === null ? snapAngle(raw) : snapAngle(base + raw) - base;
}
