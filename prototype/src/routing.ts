// Connector routing primitives: obstacle-avoiding orthogonal search, path shaping and
// conversion between absolute bend points and the endpoint-relative stored form.
// Evidence: ComputeLineWidget carries polyline, ROUNDED_ARROW and line-jump identifiers.
import type { Point, Bend } from './model.ts';

export type Rect = { x: number; y: number; w: number; h: number };
const EPS = 1e-6;
const finitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

export function expand(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}
export function strictlyInside(r: Rect, p: Point, eps = 0.5): boolean {
  return p.x > r.x + eps && p.x < r.x + r.w - eps && p.y > r.y + eps && p.y < r.y + r.h - eps;
}

/** Whether segment a-b passes through the interior of a rectangle (Liang-Barsky clipping). */
export function segmentHitsRect(a: Point, b: Point, r: Rect, eps = 0.5): boolean {
  const left = r.x + eps,
    right = r.x + r.w - eps,
    top = r.y + eps,
    bottom = r.y + r.h - eps;
  if (left >= right || top >= bottom) return false;
  let t0 = 0,
    t1 = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - left],
    [dx, right - a.x],
    [-dy, a.y - top],
    [dy, bottom - a.y],
  ]) {
    if (Math.abs(p) < EPS) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t1 - t0 > EPS;
}
export function polylineHits(points: Point[], rects: Rect[]): boolean {
  for (let i = 1; i < points.length; i++)
    for (const r of rects) if (segmentHitsRect(points[i - 1], points[i], r)) return true;
  return false;
}

/** Remove duplicate and collinear interior points. */
export function compress(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && Math.abs(last.x - p.x) < EPS && Math.abs(last.y - p.y) < EPS) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2],
        b = out[out.length - 1],
        cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x),
        dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y);
      if (Math.abs(cross) < EPS && dot >= 0) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

type Node = { xi: number; yi: number; dir: number; cost: number; score: number; parent: Node | null; done?: boolean };
const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];
const dirIndex = (v: Point) => (v.x > 0 ? 0 : v.x < 0 ? 1 : v.y > 0 ? 2 : 3);

/**
 * Orthogonal route from anchor a (leaving along normal na) to anchor b (arriving against nb)
 * that avoids obstacle rectangles grown by `clearance`. Returns null when no route exists.
 */
export function routeOrthogonal(
  a: Point,
  na: Point,
  b: Point,
  nb: Point,
  obstacles: Rect[],
  clearance: number,
  maxExpansions = 30000,
): Point[] | null {
  const stub = Math.max(8, clearance),
    s = { x: a.x + na.x * stub, y: a.y + na.y * stub },
    t = { x: b.x + nb.x * stub, y: b.y + nb.y * stub };
  const rects: Rect[] = [];
  for (const raw of obstacles) {
    const grown = expand(raw, clearance);
    if (!strictlyInside(grown, s) && !strictlyInside(grown, t)) rects.push(grown);
    else if (!strictlyInside(raw, s) && !strictlyInside(raw, t)) rects.push(raw);
  }
  const uniq = (values: number[]) =>
    [...new Set(values.filter(Number.isFinite).map(v => Math.round(v * 1000) / 1000))].sort((p, q) => p - q);
  const xs = uniq([s.x, t.x, (s.x + t.x) / 2, ...rects.flatMap(r => [r.x, r.x + r.w])]);
  const ys = uniq([s.y, t.y, (s.y + t.y) / 2, ...rects.flatMap(r => [r.y, r.y + r.h])]);
  const blocked = (p: Point) => rects.some(r => strictlyInside(r, p, EPS));
  const sx = xs.indexOf(Math.round(s.x * 1000) / 1000),
    sy = ys.indexOf(Math.round(s.y * 1000) / 1000),
    tx = xs.indexOf(Math.round(t.x * 1000) / 1000),
    ty = ys.indexOf(Math.round(t.y * 1000) / 1000);
  if ([sx, sy, tx, ty].includes(-1)) return null;
  const bend = 24 + clearance,
    goalDir = dirIndex({ x: -nb.x, y: -nb.y }),
    h = (xi: number, yi: number) => Math.abs(xs[xi] - t.x) + Math.abs(ys[yi] - t.y);
  const heap: Node[] = [],
    best = new Map<number, number>(),
    key = (xi: number, yi: number, dir: number) => (yi * xs.length + xi) * 4 + dir;
  const push = (n: Node) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].score <= heap[i].score) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].score < heap[m].score) m = l;
        if (r < heap.length && heap[r].score < heap[m].score) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  push({ xi: sx, yi: sy, dir: dirIndex(na), cost: 0, score: h(sx, sy), parent: null });
  let expansions = 0;
  while (heap.length && expansions++ < maxExpansions) {
    const n = pop(),
      k = key(n.xi, n.yi, n.dir);
    if (!n.done && (best.get(k) ?? Infinity) < n.cost) continue;
    if (n.xi === tx && n.yi === ty) {
      if (!n.done) {
        const cost = n.cost + (n.dir === goalDir ? 0 : bend);
        push({ ...n, done: true, cost, score: cost });
        continue;
      }
      const cells: Point[] = [];
      for (let c: Node | null = n; c; c = c.parent) cells.push({ x: xs[c.xi], y: ys[c.yi] });
      const route = compress([a, ...cells.reverse(), b]);
      return route.every(finitePoint) ? route : null;
    }
    DIRS.forEach((d, dir) => {
      if (n.parent && dir === (n.dir ^ 1)) return;
      const xi = n.xi + d.x,
        yi = n.yi + d.y;
      if (xi < 0 || yi < 0 || xi >= xs.length || yi >= ys.length) return;
      const from = { x: xs[n.xi], y: ys[n.yi] },
        to = { x: xs[xi], y: ys[yi] };
      if (blocked(to) || blocked({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 })) return;
      const cost = n.cost + Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + (dir === n.dir ? 0 : bend),
        nk = key(xi, yi, dir);
      if (cost >= (best.get(nk) ?? Infinity)) return;
      best.set(nk, cost);
      push({ xi, yi, dir, cost, score: cost + h(xi, yi), parent: n });
    });
  }
  return null;
}

/** Make a polyline axis-aligned by inserting corners; the first leg follows the start normal. */
export function orthogonalize(points: Point[], startHorizontal: boolean): Point[] {
  const out: Point[] = [points[0]];
  let horizontal = startHorizontal;
  for (const q of points.slice(1)) {
    const p = out.at(-1)!;
    if (Math.abs(p.x - q.x) > EPS && Math.abs(p.y - q.y) > EPS) {
      out.push(horizontal ? { x: q.x, y: p.y } : { x: p.x, y: q.y });
    }
    out.push(q);
    const last = out[out.length - 2];
    horizontal = Math.abs(q.y - last.y) > Math.abs(q.x - last.x);
  }
  return compress(out);
}

export const polylinePath = (points: Point[]) => `M${points.map(p => `${p.x},${p.y}`).join(' L')}`;

/** Polyline with rounded corners (used for curved connectors that follow an avoiding route). */
export function roundedPath(points: Point[], radius: number): string {
  if (points.length < 3) return polylinePath(points);
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1],
      c = points[i],
      n = points[i + 1],
      l1 = Math.hypot(c.x - p.x, c.y - p.y),
      l2 = Math.hypot(n.x - c.x, n.y - c.y),
      r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < EPS) {
      d += ` L${c.x},${c.y}`;
      continue;
    }
    d += ` L${c.x + ((p.x - c.x) / l1) * r},${c.y + ((p.y - c.y) / l1) * r} Q${c.x},${c.y} ${c.x + ((n.x - c.x) / l2) * r},${c.y + ((n.y - c.y) / l2) * r}`;
  }
  const last = points.at(-1)!;
  return `${d} L${last.x},${last.y}`;
}

/** Smooth curve through every point (Catmull-Rom converted to cubic Bezier segments). */
export function smoothPath(points: Point[]): string {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}
/** Sampled points of the same Catmull-Rom curve, for hit testing and label placement. */
export function smoothSamples(points: Point[], perSegment = 12): Point[] {
  const out: Point[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i],
      p1 = points[i],
      p2 = points[i + 1],
      p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let s = 1; s <= perSegment; s++) out.push(cubic(p1, c1, c2, p2, s / perSegment));
  }
  return out;
}
export function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}
/** Point halfway along a polyline. */
export function halfway(points: Point[]): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y)),
    total = lengths.reduce((s, l) => s + l, 0);
  if (!total) return points[0];
  let remaining = total / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 0,
        a = points[i],
        b = points[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= lengths[i];
  }
  return points.at(-1)!;
}

/** Basis for manual bends: along start-to-end, and perpendicular to it. Degenerate lines use a fixed basis. */
function basis(a: Point, b: Point): [Point, Point] {
  const d = { x: b.x - a.x, y: b.y - a.y };
  return Math.hypot(d.x, d.y) < 1e-6
    ? [
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ]
    : [d, { x: -d.y, y: d.x }];
}
export function bendsToPoints(a: Point, b: Point, bends: Bend[]): Point[] {
  const [ex, ey] = basis(a, b);
  return bends.map(p => ({ x: a.x + p.u * ex.x + p.v * ey.x, y: a.y + p.u * ex.y + p.v * ey.y }));
}
export function pointsToBends(a: Point, b: Point, points: Point[]): Bend[] {
  const [ex, ey] = basis(a, b),
    lx = ex.x * ex.x + ex.y * ex.y,
    ly = ey.x * ey.x + ey.y * ey.y,
    clamp = (v: number) => Math.max(-1000, Math.min(1000, v));
  return points.map(p => ({
    u: clamp(((p.x - a.x) * ex.x + (p.y - a.y) * ex.y) / lx),
    v: clamp(((p.x - a.x) * ey.x + (p.y - a.y) * ey.y) / ly),
  }));
}
