// Connector label styles and callout tails that point at objects (track R2-H). Pure: no React, no DOM.
import type { Board, Item, Point } from './model.ts';
import { calloutTailTip } from './model.ts';

// ---- Connector label colour and size ---------------------------------------------------------------
export const LABEL_SIZE_MIN = 8,
  LABEL_SIZE_MAX = 48,
  /** Default font sizes of the main caption and of the extra labels. */
  MAIN_LABEL_SIZE = 14,
  EXTRA_LABEL_SIZE = 13,
  LABEL_COLOR = '#25252c';
export const labelSizes = [10, 12, 13, 14, 16, 18, 20, 24, 32];
export const labelColors: [string, string][] = [
  ['#25252c', 'Black'],
  ['#696973', 'Gray'],
  ['#4262ff', 'Blue'],
  ['#1a7f37', 'Green'],
  ['#c2410c', 'Orange'],
  ['#d1242f', 'Red'],
  ['#8250df', 'Purple'],
];
const hex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const sizeOk = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= LABEL_SIZE_MIN && v <= LABEL_SIZE_MAX;

/**
 * Set the colour or font size of a connector's main caption (`labelId` null) or of one extra label. Undefined
 * values restore the default. Locked connectors are unchanged. One undo step when applied with `update`.
 */
export function setConnectorLabelStyle(
  board: Board,
  id: string,
  labelId: string | null,
  patch: { color?: string | null; size?: number | null },
): Board {
  const item = board.items.find(i => i.id === id);
  if (!item || item.type !== 'arrow' || item.locked) return board;
  if (patch.color != null && !hex(patch.color)) throw new Error('Choose a label colour.');
  if (patch.size != null && !sizeOk(patch.size))
    throw new Error(`Choose a label size from ${LABEL_SIZE_MIN} to ${LABEL_SIZE_MAX} px.`);
  const c = { ...item.connector };
  const apply = <T extends Record<string, unknown>>(target: T, colorKey: keyof T, sizeKey: keyof T): T => {
    const next = { ...target };
    if (patch.color !== undefined) {
      if (patch.color === null) delete next[colorKey];
      else next[colorKey] = patch.color as T[keyof T];
    }
    if (patch.size !== undefined) {
      if (patch.size === null) delete next[sizeKey];
      else next[sizeKey] = patch.size as T[keyof T];
    }
    return next;
  };
  let connector;
  if (labelId === null) connector = apply(c, 'labelColor', 'labelSize');
  else {
    if (!c.labels?.some(l => l.id === labelId)) return board;
    connector = { ...c, labels: c.labels.map(l => (l.id === labelId ? apply(l, 'color', 'size') : l)) };
  }
  return { ...board, items: board.items.map(i => (i.id === id ? { ...i, connector } : i)) };
}
/** Move a connector's main caption (`labelId` null) or an extra label to fraction `at` along the line. */
export function moveConnectorLabel(board: Board, id: string, labelId: string | null, at: number): Board {
  const item = board.items.find(i => i.id === id);
  if (!item || item.type !== 'arrow' || item.locked || !Number.isFinite(at)) return board;
  const t = Math.round(Math.max(0, Math.min(1, at)) * 1000) / 1000,
    c = item.connector ?? {};
  if (labelId !== null && !c.labels?.some(l => l.id === labelId)) return board;
  const connector =
    labelId === null
      ? { ...c, labelAt: t }
      : { ...c, labels: c.labels!.map(l => (l.id === labelId ? { ...l, at: t } : l)) };
  return { ...board, items: board.items.map(i => (i.id === id ? { ...i, connector } : i)) };
}

// ---- Callout tails --------------------------------------------------------------------------------
export const calloutKinds = ['callout', 'ovalcallout', 'thought'] as const;
export const isCallout = (i: Pick<Item, 'type'>) => (calloutKinds as readonly string[]).includes(i.type);
/** Height of the bubble body as a fraction of the box; the rest holds the built-in tail. */
const bodyShare = (kind: string) => (kind === 'callout' ? 0.78 : 0.8);
/** Where the built-in tail points, in the callout's local frame. */
export function defaultTailTip(i: Pick<Item, 'type' | 'w' | 'h'>): Point {
  if (i.type === 'ovalcallout') return { x: i.w * 0.16, y: i.h };
  if (i.type === 'thought') return { x: i.w * 0.17, y: i.h * 0.97 };
  return { x: i.w * 0.2, y: i.h };
}
/** Current tail tip (custom or built-in), local to the callout. */
export const tailTip = (i: Item, items: Item[]): Point => calloutTailTip(i, items) ?? defaultTailTip(i);

export function validateCalloutTail(i: Item): void {
  const t = i.tail as unknown as Record<string, unknown> | undefined;
  const fin = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6;
  if (
    !t ||
    typeof t !== 'object' ||
    Array.isArray(t) ||
    !fin(t.x) ||
    !fin(t.y) ||
    (t.target !== undefined &&
      (typeof t.target !== 'string' || !t.target || t.target.length > 100 || t.target === i.id)) ||
    Object.keys(t).some(k => !['x', 'y', 'target'].includes(k))
  )
    throw new Error('Invalid callout tail.');
}

/** Objects a callout tail can point at: anything visible except connectors, ink, frames and the callout. */
export const canTailTarget = (i: Item, calloutId: string) =>
  i.id !== calloutId && !i.hidden && !['arrow', 'pen', 'frame', 'swimlane'].includes(i.type);

/**
 * Point a callout's tail at `p` (world). With `target`, the tail attaches to that object and follows it.
 * Locked or missing callouts are unchanged.
 */
export function setCalloutTail(board: Board, id: string, p: Point, target?: string): Board {
  const item = board.items.find(i => i.id === id);
  if (!item || !isCallout(item) || item.locked) return board;
  const goal = target ? board.items.find(i => i.id === target && canTailTarget(i, id)) : undefined;
  const c = { x: item.x + item.w / 2, y: item.y + item.h / 2 },
    a = item.rotation ? (-item.rotation * Math.PI) / 180 : 0,
    flat = a
      ? {
          x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a),
          y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a),
        }
      : p;
  let tail: Item['tail'] = { x: Math.round(flat.x - item.x), y: Math.round(flat.y - item.y) };
  if (goal) {
    tail = { ...tail, target: goal.id };
    const tip = calloutTailTip({ ...item, tail }, board.items)!;
    tail = { x: Math.round(tip.x), y: Math.round(tip.y), target: goal.id };
  }
  return { ...board, items: board.items.map(i => (i.id === id ? { ...i, tail } : i)) };
}
/** Restore the built-in tail. */
export function resetCalloutTail(board: Board, id: string): Board {
  const item = board.items.find(i => i.id === id);
  if (!item?.tail || item.locked) return board;
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id) return i;
      const n = { ...i };
      delete n.tail;
      return n;
    }),
  };
}

const ellipseD = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
const r2 = (v: number) => Math.round(v * 100) / 100;
/**
 * Paths for a callout with a custom tail: the bubble body without its built-in tail, and the tail toward
 * `tip` (local). Both are filled together, so the tail's root inside the body never shows.
 */
export function calloutPaths(kind: string, w: number, h: number, tip: Point): { body: string; tail: string } {
  const b = h * bodyShare(kind),
    c = { x: w / 2, y: b / 2 };
  let body: string;
  if (kind === 'ovalcallout') body = ellipseD(c.x, c.y, w / 2, b / 2);
  else if (kind === 'thought') {
    const pts = Array.from({ length: 96 }, (_, k) => {
      const t = (k / 96) * Math.PI * 2,
        r = 0.86 + 0.14 * Math.abs(Math.sin(t * 5));
      return `${r2(w / 2 + (w / 2) * r * Math.cos(t))},${r2(h * 0.4 + h * 0.4 * r * Math.sin(t))}`;
    });
    body = `M${pts.join(' L')} Z`;
  } else {
    const r = Math.min(8, w / 4, b / 4);
    body = `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${b - r} A${r},${r} 0 0 1 ${w - r},${b} H${r} A${r},${r} 0 0 1 0,${b - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;
  }
  const dx = tip.x - c.x,
    dy = tip.y - c.y,
    len = Math.hypot(dx, dy) || 1,
    ux = dx / len,
    uy = dy / len;
  if (kind === 'thought') {
    // Shrinking bubbles from the cloud's edge to the tip.
    const rx = w / 2,
      ry = h * 0.4,
      edgeT = 1 / Math.hypot(ux / rx, uy / ry),
      start = Math.min(len, edgeT * 0.95),
      unit = Math.min(w, h);
    const bubbles = [0.25, 0.6, 1].map((f, k) => {
      const d = start + (len - start) * f,
        rad = unit * [0.06, 0.045, 0.03][k];
      return ellipseD(r2(c.x + ux * d), r2(c.y + uy * d), r2(rad), r2(rad * 0.85));
    });
    return { body, tail: len > start ? bubbles.join(' ') : '' };
  }
  const half = Math.max(6, Math.min(w, b) * 0.1),
    a = { x: c.x - uy * half, y: c.y + ux * half },
    z = { x: c.x + uy * half, y: c.y - ux * half };
  return { body, tail: `M${r2(a.x)},${r2(a.y)} L${r2(tip.x)},${r2(tip.y)} L${r2(z.x)},${r2(z.y)} Z` };
}
