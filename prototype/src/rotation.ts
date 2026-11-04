// Object rotation geometry (gap D1). Pure helpers: angles are in degrees, clockwise on screen
// (SVG y points down), and every object rotates around the centre of its unrotated box.
import type { Point } from './model.ts';

export type Box = { x: number; y: number; w: number; h: number };
/** Kinds that never rotate: connectors follow their ends, frames stay axis-aligned (they define
 * containment and presentation slides), pen strokes keep their raw points for the eraser, and
 * layout containers keep their children on a straight grid. */
export const unrotatableKinds = ['arrow', 'frame', 'pen', 'grid', 'autolayout'];
export const canRotate = (item: { type: string }) => !unrotatableKinds.includes(item.type);
/** Rotation snap step while Shift is held. */
export const ROTATION_SNAP = 15;

/** Wrap any finite angle into [0, 360), rounded to 1/100 degree so repeated edits stay stable. */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = Math.round((((deg % 360) + 360) % 360) * 100) / 100;
  return r >= 360 ? 0 : r === 0 ? 0 : r;
}
export const isValidRotation = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 360;
export const snapAngle = (deg: number, step = ROTATION_SNAP) => Math.round(deg / step) * step;
/** Rotate `p` around `c` by `deg`. */
export function rotatePoint(p: Point, c: Point, deg: number): Point {
  if (!deg) return { x: p.x, y: p.y };
  const a = (deg * Math.PI) / 180,
    cos = Math.cos(a),
    sin = Math.sin(a),
    dx = p.x - c.x,
    dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}
export const boxCenter = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
/** Corners of a box rotated around its centre (nw, ne, se, sw). */
export function rotatedCorners(b: Box, deg: number): Point[] {
  const c = boxCenter(b);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ].map(p => rotatePoint(p, c, deg));
}
/** Axis-aligned bounding box of a box rotated around its centre. */
export function rotatedBounds(b: Box, deg = 0): Box {
  if (!deg) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const a = (deg * Math.PI) / 180,
    cos = Math.abs(Math.cos(a)),
    sin = Math.abs(Math.sin(a)),
    w = b.w * cos + b.h * sin,
    h = b.w * sin + b.h * cos,
    c = boxCenter(b);
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}
/** A world point expressed in the object's unrotated frame (for hit tests and edges). */
export const toLocal = (b: Box & { rotation?: number }, p: Point): Point =>
  b.rotation ? rotatePoint(p, boxCenter(b), -b.rotation) : p;
/** True when `p` lies inside the (rotated) box, grown by `tolerance`. */
export function pointInBox(b: Box & { rotation?: number }, p: Point, tolerance = 0): boolean {
  const q = toLocal(b, p);
  return (
    q.x >= b.x - tolerance && q.x <= b.x + b.w + tolerance && q.y >= b.y - tolerance && q.y <= b.y + b.h + tolerance
  );
}
/** Angle of `p` seen from `c`, with 0 straight up (where the rotate handle sits). */
export const handleAngle = (c: Point, p: Point) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
/** Drop rotation from objects that cannot rotate (for example after a kind change), so the board
 * always passes validation. Returns the same board when nothing changes. */
export function stripRotation<B extends { items: { type: string; rotation?: number }[] }>(board: B): B {
  if (!board.items.some(i => i.rotation !== undefined && !canRotate(i))) return board;
  return {
    ...board,
    items: board.items.map(i => {
      if (i.rotation === undefined || canRotate(i)) return i;
      const next = { ...i };
      delete next.rotation;
      return next;
    }),
  };
}
