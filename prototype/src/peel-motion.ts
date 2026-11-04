// Sticky stack peel motion (item 133). Pure geometry and a frame-rate independent spring for pulling a
// note off a sticky stack, frame by frame:
// - bend: the sheet stays glued along its top strip and its free part bends towards the pointer, resisting
//   more the further it is pulled;
// - detach: past `detachDistance` the glue lets go and the bent outline springs flat into the note;
// - carry, settle and the next sheet curling up are driven by the same spring (see sticky-peel.tsx).
import type { Point } from './model.ts';

export type Sheet = { x: number; y: number; s: number };
/**
 * A peel in progress, shared by the gesture (which owns `live.detached`, the single source of truth for
 * whether the note came off) and the overlay that animates it.
 */
export type PeelState = {
  note: string;
  pad: string;
  /** Pointer position (world) when the peel started. */
  grab: Point;
  /** Where across the sheet it was grabbed: 0 left edge, 1 right edge. */
  grabX: number;
  sheet: Sheet;
  noteSize: { w: number; h: number };
  fill: string;
  live: { detached: boolean };
};
export type Rect = { x: number; y: number; w: number; h: number };
/** Nine outline points: TL, TR, glue right, control, BR, control, BL, control, glue left. */
export type SheetPoints = Point[];

/** Share of the sheet held by the adhesive strip along its top edge. */
export const GLUE = 0.22;
/** How far (world units) the pointer must pull before the sheet comes off the pad. */
export const detachDistance = (s: number) => s * 0.42;
/** How far the pull has got towards detaching, 0..1. */
export const liftOf = (sheet: Sheet, d: Point) => Math.min(1, Math.hypot(d.x, d.y) / detachDistance(sheet.s));
/** Whether a pull of `d` tears the sheet off the pad. */
export const detaches = (sheet: Sheet, d: Point) => Math.hypot(d.x, d.y) >= detachDistance(sheet.s);

/** Share of a side's bend that happens next to the glue line (the side leaves it straight down). */
const BEND = 0.4;
/**
 * Where a free corner can be, given the pull: paper cannot stretch, so seen from above the side from its glue
 * point can only swing round or get shorter (lifted towards the viewer), never longer than the paper. The
 * side is drawn as a curve leaving the glue line straight down; its control polygon (which bounds the curve's
 * length) is kept within `len`.
 */
function swing(anchor: Point, want: Point, len: number): { corner: Point; control: Point } {
  let v = { x: want.x - anchor.x, y: want.y - anchor.y };
  const at = (w: Point) => {
    const m = Math.hypot(w.x, w.y),
      control = { x: anchor.x, y: anchor.y + Math.max(0, w.y) * BEND };
    return {
      corner: { x: anchor.x + w.x, y: anchor.y + w.y },
      control,
      length:
        Math.hypot(control.x - anchor.x, control.y - anchor.y) +
          Math.hypot(anchor.x + w.x - control.x, anchor.y + w.y - control.y) || m,
    };
  };
  // Both parts of the control polygon scale with v, so one rescale makes it fit exactly.
  const first = at(v);
  if (first.length > len) v = { x: (v.x * len) / first.length, y: (v.y * len) / first.length };
  const fit = at(v);
  return { corner: fit.corner, control: fit.control };
}

/** Outline of a sheet still glued at the top, pulled by `d`; `grabX` is where it was grabbed (0 left, 1 right). */
export function bentPoints(sheet: Sheet, d: Point, grabX: number): SheetPoints {
  const { x, y, s } = sheet,
    glueY = y + GLUE * s,
    side = s - GLUE * s,
    gr = { x: x + s, y: glueY },
    gl = { x, y: glueY },
    // Paper resists: the corners follow the pointer less the further it pulls.
    r = 1 / (1 + Math.hypot(d.x, d.y) / (0.9 * s)),
    e = { x: d.x * r, y: d.y * r },
    fx = Math.min(1, Math.max(0, grabX)),
    wR = 0.6 + 0.4 * fx,
    wL = 0.6 + 0.4 * (1 - fx);
  const right = swing(gr, { x: x + s + e.x * wR, y: y + s + e.y * wR }, side);
  // The free edge cannot be longer than the sheet is wide. Moving the far corner by the same vector as the
  // grabbed one keeps the edge exactly as wide as the sheet (both sides fit the same way), so blend the far
  // corner's own target towards that and take the least blend that fits.
  const own = { x: x + e.x * wL, y: y + s + e.y * wL },
    rigid = { x: right.corner.x - s, y: right.corner.y },
    leftAt = (t: number) => swing(gl, { x: own.x + (rigid.x - own.x) * t, y: own.y + (rigid.y - own.y) * t }, side),
    fits = (c: Point) => Math.hypot(right.corner.x - c.x, right.corner.y - c.y) <= s;
  let left = leftAt(0);
  if (!fits(left.corner)) {
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(leftAt(mid).corner)) hi = mid;
      else lo = mid;
    }
    left = leftAt(hi);
  }
  const br = right.corner,
    bl = left.corner,
    chord = Math.hypot(br.x - bl.x, br.y - bl.y),
    lift = liftOf(sheet, d),
    // The free edge lifts towards the viewer, so it bows; the bow is limited so the edge keeps its length.
    bow = Math.min(0.08 * s * lift, Math.sqrt(Math.max(0, (s / 2) ** 2 - (chord / 2) ** 2))),
    c2 = { x: (br.x + bl.x) / 2, y: (br.y + bl.y) / 2 - bow };
  return [{ x, y }, { x: x + s, y }, gr, right.control, br, c2, bl, left.control, gl];
}

/** The same nine points for a flat rectangle (straight edges). */
export function flatPoints(r: Rect): SheetPoints {
  const glueY = r.y + GLUE * r.h,
    midY = (glueY + r.y + r.h) / 2;
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: glueY },
    { x: r.x + r.w, y: midY },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x + r.w / 2, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
    { x: r.x, y: midY },
    { x: r.x, y: glueY },
  ];
}

/** Blend two outlines: t = 0 gives `a`, t = 1 gives `b` (values past 1 overshoot, for a springy pop). */
export function lerpPoints(a: SheetPoints, b: SheetPoints, t: number): SheetPoints {
  return a.map((p, i) => ({ x: p.x + (b[i].x - p.x) * t, y: p.y + (b[i].y - p.y) * t }));
}

const f = (n: number) => Math.round(n * 100) / 100;
/** SVG path for a nine-point outline. */
export function outlinePath(p: SheetPoints): string {
  const pt = (q: Point) => `${f(q.x)},${f(q.y)}`;
  return `M${pt(p[0])} L${pt(p[1])} L${pt(p[2])} Q${pt(p[3])} ${pt(p[4])} Q${pt(p[5])} ${pt(p[6])} Q${pt(p[7])} ${pt(p[8])} Z`;
}

/** Centre of an outline's corners (for tilting a free sheet about its middle). */
export function centreOf(p: SheetPoints): Point {
  const corners = [p[0], p[1], p[4], p[6]];
  return { x: corners.reduce((n, q) => n + q.x, 0) / 4, y: corners.reduce((n, q) => n + q.y, 0) / 4 };
}

export type Spring = { x: number; v: number };
/**
 * Advance a damped spring towards `target` by `dt` seconds. It integrates in fixed sub-steps of at most
 * 1/240 s, so the motion is the same at 30, 60 or 144 frames per second and a long frame stays stable.
 */
export function springStep(sp: Spring, target: number, dt: number, stiffness = 320, damping = 24): Spring {
  let { x, v } = sp,
    left = Math.min(Math.max(0, dt), 0.1);
  while (left > 1e-9) {
    const h = Math.min(left, 1 / 240);
    v += (stiffness * (target - x) - damping * v) * h;
    x += v * h;
    left -= h;
  }
  return { x, v };
}
/** Whether a spring has come to rest at `target`. */
export const atRest = (sp: Spring, target: number, eps = 0.01) =>
  Math.abs(sp.x - target) < eps && Math.abs(sp.v) < eps * 10;

/** Tilt (degrees) of a carried note from its horizontal speed (world units per second), like paper in air. */
export const tiltFor = (vx: number) => Math.max(-9, Math.min(9, -vx * 0.006));
