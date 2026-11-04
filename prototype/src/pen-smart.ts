// Smart pen and lasso helpers (item 102). Pure geometry.
import type { Point } from './model.ts';

export type Recognized = {
  kind: 'rectangle' | 'ellipse' | 'triangle' | 'line';
  x: number;
  y: number;
  w: number;
  h: number;
};

const polygonArea = (pts: Point[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!,
      q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

/**
 * Recognise a hand-drawn stroke. Closed strokes are classified by how much of their bounding box
 * they fill (rectangle ≈ 1, ellipse ≈ π/4, triangle ≈ ½); open, nearly straight strokes become a
 * line. Returns null for scribbles, tiny strokes and anything ambiguous, so the ink is kept.
 */
export function recognizeStroke(points: Point[]): Recognized | null {
  // A very straight stroke simplifies to two points: it can still be a line, but not a closed shape.
  if (points.length < 2) return null;
  const xs = points.map(p => p.x),
    ys = points.map(p => p.y),
    x = Math.min(...xs),
    y = Math.min(...ys),
    w = Math.max(...xs) - x,
    h = Math.max(...ys) - y,
    diag = Math.hypot(w, h);
  if (diag < 24) return null;
  const first = points[0]!,
    last = points[points.length - 1]!,
    gap = Math.hypot(last.x - first.x, last.y - first.y);
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  if (gap > diag * 0.25) {
    // Open stroke: a line when the path is barely longer than its chord.
    return length <= gap * 1.08
      ? { kind: 'line', x: first.x, y: first.y, w: last.x - first.x, h: last.y - first.y }
      : null;
  }
  if (points.length < 4 || Math.min(w, h) < diag * 0.12) return null;
  const fillRatio = polygonArea(points) / (w * h);
  const kind =
    fillRatio > 0.86
      ? 'rectangle'
      : fillRatio > 0.68
        ? 'ellipse'
        : fillRatio > 0.38 && fillRatio < 0.6
          ? 'triangle'
          : null;
  return kind ? { kind, x, y, w, h } : null;
}

type Box = { id: string; type: string; x: number; y: number; w: number; h: number; hidden?: boolean };
/**
 * Smart pen connectors (track R5): the objects under each end of a recognised line, so the line becomes a
 * connector bound to them. Lines, ink, frames and hidden objects are skipped; the topmost object wins.
 */
export function lineEnds(items: Box[], line: Recognized, tolerance = 12): { from?: string; to?: string } {
  const at = (p: Point) =>
    [...items]
      .reverse()
      .find(
        i =>
          !['arrow', 'pen', 'frame', 'swimlane', 'stickypad'].includes(i.type) &&
          !i.hidden &&
          p.x >= i.x - tolerance &&
          p.x <= i.x + i.w + tolerance &&
          p.y >= i.y - tolerance &&
          p.y <= i.y + i.h + tolerance,
      )?.id;
  const from = at({ x: line.x, y: line.y }),
    to = at({ x: line.x + line.w, y: line.y + line.h });
  return { ...(from ? { from } : {}), ...(to && to !== from ? { to } : {}) };
}

/**
 * Scribble (track R5): a zig-zag stroke at least 30 px across whose path is at least three times its box
 * diagonal and that turns back horizontally or vertically at least four times.
 */
export function isScribble(points: Point[]): boolean {
  if (points.length < 8) return false;
  const xs = points.map(p => p.x),
    ys = points.map(p => p.y),
    w = Math.max(...xs) - Math.min(...xs),
    h = Math.max(...ys) - Math.min(...ys),
    diag = Math.hypot(w, h);
  if (diag < 30) return false;
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  if (length < diag * 3) return false;
  const turns = (axis: 'x' | 'y', span: number) => {
    let dir = 0,
      count = 0,
      anchor = points[0]![axis];
    for (const p of points) {
      const d = p[axis] - anchor;
      if (Math.abs(d) < span * 0.15) continue;
      const s = Math.sign(d);
      if (dir && s !== dir) count++;
      dir = s;
      anchor = p[axis];
    }
    return count;
  };
  return Math.max(turns('x', w), turns('y', h)) >= 4;
}
/** Ink strokes a scribble erases: pen strokes whose centre lies inside the scribble's bounding box. */
export function scribbleTargets(items: Box[], points: Point[]): string[] {
  const xs = points.map(p => p.x),
    ys = points.map(p => p.y),
    x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  return items
    .filter(i => i.type === 'pen' && !i.hidden)
    .filter(i => {
      const cx = i.x + i.w / 2,
        cy = i.y + i.h / 2;
      return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
    })
    .map(i => i.id);
}

/** Ray-casting point-in-polygon test. */
export function insidePolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Ids of objects whose centre lies inside the lasso. */
export const lassoSelect = (
  items: { id: string; x: number; y: number; w: number; h: number; hidden?: boolean }[],
  poly: Point[],
) =>
  poly.length < 3
    ? []
    : items.filter(i => !i.hidden && insidePolygon({ x: i.x + i.w / 2, y: i.y + i.h / 2 }, poly)).map(i => i.id);

export type PenPreset = { color: string; width: number };
export const PEN_PRESETS_KEY = 'boardroom.penPresets.v1';
export const defaultPenPresets: PenPreset[] = [
  { color: '#25252a', width: 3 },
  { color: '#e5484d', width: 5 },
  { color: '#2f9e44', width: 12 },
];
export function parsePenPresets(raw: string | null): PenPreset[] {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (
      Array.isArray(v) &&
      v.length === 3 &&
      v.every(p => p && /^#[0-9a-f]{6}$/i.test(p.color) && Number.isFinite(p.width) && p.width >= 1 && p.width <= 64)
    )
      return v.map(p => ({ color: p.color, width: p.width }));
  } catch {
    /* fall through to defaults */
  }
  return defaultPenPresets.map(p => ({ ...p }));
}
