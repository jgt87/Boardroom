// Shape geometry shared by rendering, text placement and connector attachment.
// Evidence: ComputeShapeWidget registers ShapeTriangle, ShapeRounder, ShapeBarrel,
// ShapeParallelogram, ShapePredefinedProcess, ShapePill and ShapeHexagon geometries.
import type { Point } from './model.ts';
import { packKinds, packDef, packOrder } from './shape-packs.ts';
import type { PackName } from './shape-packs.ts';

const basicKinds = [
  'rectangle',
  'roundrect',
  'ellipse',
  'diamond',
  'triangle',
  'cylinder',
  'parallelogram',
  'hexagon',
  'predefined',
  'terminator',
] as const;
export const shapeKinds = [...basicKinds, ...packKinds] as const;
export type ShapeKind = (typeof shapeKinds)[number];
export const isShapeKind = (kind: string): kind is ShapeKind => (shapeKinds as readonly string[]).includes(kind);
const basicLabels: Record<(typeof basicKinds)[number], string> = {
  rectangle: 'Rectangle',
  roundrect: 'Rounded rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond (decision)',
  triangle: 'Triangle',
  cylinder: 'Cylinder (database)',
  parallelogram: 'Parallelogram (input/output)',
  hexagon: 'Hexagon (preparation)',
  predefined: 'Predefined process',
  terminator: 'Terminator (start/end)',
};
const basicSizes: Record<(typeof basicKinds)[number], [number, number]> = {
  rectangle: [230, 130],
  roundrect: [230, 130],
  ellipse: [220, 150],
  diamond: [200, 180],
  triangle: [200, 170],
  cylinder: [170, 200],
  parallelogram: [240, 130],
  hexagon: [240, 130],
  predefined: [240, 130],
  terminator: [230, 90],
};
export const shapeLabels = {
  ...basicLabels,
  ...Object.fromEntries(packKinds.map(k => [k, packDef(k)!.label])),
} as Record<ShapeKind, string>;
export const shapeSizes = {
  ...basicSizes,
  ...Object.fromEntries(packKinds.map(k => [k, packDef(k)!.size])),
} as Record<ShapeKind, [number, number]>;
/** Shapes grouped for the Shapes and lines menu. */
export const shapePacks: { name: PackName; kinds: ShapeKind[] }[] = packOrder.map(name => ({
  name,
  kinds: [...(name === 'Basic' ? basicKinds : []), ...packKinds.filter(k => packDef(k)!.pack === name)] as ShapeKind[],
}));
export type Box = { x: number; y: number; w: number; h: number };

const slant = (w: number, h: number) => Math.min(w * 0.2, h * 0.6);
const capHeight = (w: number, h: number) => Math.min(h * 0.12, w * 0.2, 30);

/** Polygon outline for polygonal shapes, in local coordinates. */
export function polygon(kind: ShapeKind, w: number, h: number): Point[] | null {
  const pack = packDef(kind);
  if (pack) return pack.outline(w, h);
  const s = slant(w, h),
    hx = Math.min(w * 0.2, h / 2);
  switch (kind) {
    case 'triangle':
      return [
        { x: w / 2, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    case 'diamond':
      return [
        { x: w / 2, y: 0 },
        { x: w, y: h / 2 },
        { x: w / 2, y: h },
        { x: 0, y: h / 2 },
      ];
    case 'parallelogram':
      return [
        { x: s, y: 0 },
        { x: w, y: 0 },
        { x: w - s, y: h },
        { x: 0, y: h },
      ];
    case 'hexagon':
      return [
        { x: hx, y: 0 },
        { x: w - hx, y: 0 },
        { x: w, y: h / 2 },
        { x: w - hx, y: h },
        { x: hx, y: h },
        { x: 0, y: h / 2 },
      ];
    default:
      return null;
  }
}

/** SVG path data for the filled outline. */
export function shapePath(kind: ShapeKind, w: number, h: number): string {
  const custom = packDef(kind)?.path;
  if (custom) return custom(w, h);
  const poly = polygon(kind, w, h);
  if (poly) return `M${poly.map(p => `${p.x},${p.y}`).join(' L')} Z`;
  if (kind === 'ellipse')
    return `M0,${h / 2} A${w / 2},${h / 2} 0 1 0 ${w},${h / 2} A${w / 2},${h / 2} 0 1 0 0,${h / 2} Z`;
  if (kind === 'cylinder') {
    const ry = capHeight(w, h);
    return `M0,${ry} A${w / 2},${ry} 0 0 1 ${w},${ry} L${w},${h - ry} A${w / 2},${ry} 0 0 1 0,${h - ry} Z`;
  }
  const r =
    kind === 'terminator'
      ? Math.min(w, h) / 2
      : kind === 'roundrect'
        ? Math.min(20, w / 4, h / 4)
        : Math.min(4, w / 2, h / 2);
  return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
}

/** Interior detail strokes (cylinder lid, predefined-process bars). */
export function shapeDetail(kind: ShapeKind, w: number, h: number): string | undefined {
  const pack = packDef(kind);
  if (pack) return pack.detail?.(w, h);
  if (kind === 'cylinder') {
    const ry = capHeight(w, h);
    return `M0,${ry} A${w / 2},${ry} 0 0 0 ${w},${ry}`;
  }
  if (kind === 'predefined') {
    const inset = Math.min(w * 0.1, 24);
    return `M${inset},0 V${h} M${w - inset},0 V${h}`;
  }
  return undefined;
}

/** Text area inside each shape. Original shapes keep their 12 px inset for compatibility. */
export function textBox(kind: ShapeKind, w: number, h: number): Box {
  const inset = (l: number, t: number, r = l, b = t): Box => ({
    x: l,
    y: t,
    w: Math.max(20, w - l - r),
    h: Math.max(20, h - t - b),
  });
  const pack = packDef(kind);
  if (pack) return pack.text ? pack.text(w, h) : inset(12, 12);
  switch (kind) {
    case 'triangle':
      return { x: w * 0.25, y: h * 0.45, w: Math.max(20, w * 0.5), h: Math.max(20, h * 0.5) };
    case 'cylinder': {
      const ry = capHeight(w, h);
      return inset(12, ry * 2 + 4, 12, ry + 6);
    }
    case 'parallelogram':
      return inset(slant(w, h) + 6, 10);
    case 'hexagon':
      return inset(Math.min(w * 0.2, h / 2) + 4, 10);
    case 'predefined':
      return inset(Math.min(w * 0.1, 24) + 8, 10);
    case 'terminator':
      return inset(Math.min(w, h) / 4 + 8, 8);
    default:
      return inset(12, 12);
  }
}

function insidePolygon(poly: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether a local point lies inside the shape. */
export function shapeContains(kind: ShapeKind, w: number, h: number, p: Point): boolean {
  if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) return false;
  const poly = polygon(kind, w, h);
  if (poly) return insidePolygon(poly, p);
  const inEllipse = (cx: number, cy: number, rx: number, ry: number) =>
    rx > 0 && ry > 0 && ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2 <= 1;
  if (kind === 'ellipse') return inEllipse(w / 2, h / 2, w / 2, h / 2);
  if (kind === 'cylinder') {
    const ry = capHeight(w, h);
    return (p.y >= ry && p.y <= h - ry) || inEllipse(w / 2, ry, w / 2, ry) || inEllipse(w / 2, h - ry, w / 2, ry);
  }
  if (kind === 'terminator') {
    const r = Math.min(w, h) / 2;
    return (
      (p.x >= r && p.x <= w - r) ||
      (p.y >= r && p.y <= h - r) ||
      inEllipse(r, h / 2, r, h / 2) ||
      inEllipse(w - r, h / 2, r, h / 2)
    );
  }
  return true;
}

/** Boundary point of a shape on the ray from its center toward a world point. */
export function shapeEdge(kind: ShapeKind, box: Box, toward: Point): Point {
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 },
    dx = toward.x - c.x,
    dy = toward.y - c.y,
    length = Math.hypot(dx, dy);
  if (!length || !Number.isFinite(length)) return c;
  const ux = dx / length,
    uy = dy / length,
    reach = Math.hypot(box.w, box.h);
  let low = 0,
    high = reach;
  for (let i = 0; i < 32; i++) {
    const t = (low + high) / 2,
      local = { x: c.x + ux * t - box.x, y: c.y + uy * t - box.y };
    if (shapeContains(kind, box.w, box.h, local)) low = t;
    else high = t;
  }
  return { x: c.x + ux * low, y: c.y + uy * low };
}
