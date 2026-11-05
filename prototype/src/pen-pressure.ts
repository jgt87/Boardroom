// Pen pressure (track R2-K). Pure: pen strokes drawn with a stylus keep a pressure per point (`p`, 0..1) and
// are drawn as a filled outline whose width follows it. Mouse and touch strokes carry no pressure and keep
// drawing as one plain stroked path.
import type { StrokePoint } from './model.ts';

/** Pressure a pointer event reports, rounded; 0 (no contact or no data) falls back to the neutral 0.5. */
export function pressureOf(pressure: number | undefined): number {
  if (typeof pressure !== 'number' || !Number.isFinite(pressure) || pressure <= 0) return 0.5;
  return Math.round(Math.min(1, pressure) * 1000) / 1000;
}
/** Width multiplier for a pressure: neutral 0.5 draws at the chosen width, a light touch thinner, a firm one up to 1.8x. */
export const pressureFactor = (p: number) => 0.2 + 1.6 * Math.max(0, Math.min(1, p));
/** True when at least one point carries a pressure. */
export const hasPressure = (points: readonly StrokePoint[] | undefined) => !!points?.some(p => p.p !== undefined);
/**
 * Pressure only when it varies: a pen that reports one constant value (no pressure hardware) draws like a
 * mouse stroke, so its points drop the field.
 */
export function settlePressure(points: StrokePoint[]): StrokePoint[] {
  const ps = points.map(p => p.p).filter((v): v is number => v !== undefined);
  if (!ps.length) return points;
  if (Math.max(...ps) - Math.min(...ps) >= 0.02) return points.map(p => (p.p === undefined ? { ...p, p: 0.5 } : p));
  return points.map(({ x, y }) => ({ x, y }));
}
/** A valid stored pressure: a finite number from 0 to 1. */
export const isPressure = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

const fmt = (n: number) => String(Math.round(n * 100) / 100);
/** Smooth path through `pts` (quadratic curves between midpoints), continuing an open path with L/Q. */
function through(pts: { x: number; y: number }[]): string {
  if (pts.length < 3) return pts.map(p => ` L${fmt(p.x)},${fmt(p.y)}`).join('');
  let d = ` L${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i],
      n = pts[i + 1];
    d += ` Q${fmt(p.x)},${fmt(p.y)} ${fmt((p.x + n.x) / 2)},${fmt((p.y + n.y) / 2)}`;
  }
  const last = pts.at(-1)!;
  return `${d} L${fmt(last.x)},${fmt(last.y)}`;
}
/**
 * Filled outline (SVG path data) of a variable-width stroke: each point is offset to both sides by half of
 * `width * pressureFactor(p)`, joined with round caps. Drawn with `fill`, nonzero rule, no stroke.
 */
export function pressureOutline(points: readonly StrokePoint[], width: number): string {
  const pts = points.filter((p, k) => !k || p.x !== points[k - 1].x || p.y !== points[k - 1].y);
  if (!pts.length) return '';
  const radius = pts.map(p => Math.max(0.25, (width * pressureFactor(p.p ?? 0.5)) / 2));
  if (pts.length === 1) {
    const { x, y } = pts[0],
      r = fmt(radius[0]);
    return `M${fmt(x - radius[0])},${fmt(y)} A${r},${r} 0 1 0 ${fmt(x + radius[0])},${fmt(y)} A${r},${r} 0 1 0 ${fmt(x - radius[0])},${fmt(y)} Z`;
  }
  const left: { x: number; y: number }[] = [],
    right: { x: number; y: number }[] = [];
  pts.forEach((p, k) => {
    const a = pts[Math.max(0, k - 1)],
      b = pts[Math.min(pts.length - 1, k + 1)],
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy) || 1,
      nx = -dy / len,
      ny = dx / len,
      r = radius[k];
    left.push({ x: p.x + nx * r, y: p.y + ny * r });
    right.push({ x: p.x - nx * r, y: p.y - ny * r });
  });
  const start = left[0],
    end = radius.at(-1)!,
    first = radius[0];
  return (
    `M${fmt(start.x)},${fmt(start.y)}` +
    through(left).slice(` L${fmt(start.x)},${fmt(start.y)}`.length) +
    ` A${fmt(end)},${fmt(end)} 0 0 0 ${fmt(right.at(-1)!.x)},${fmt(right.at(-1)!.y)}` +
    through(right.reverse()) +
    ` A${fmt(first)},${fmt(first)} 0 0 0 ${fmt(start.x)},${fmt(start.y)} Z`
  );
}
