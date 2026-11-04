// Swimlane diagram (gap E6): a pool of lanes (rows or columns) with an optional second axis of phases,
// used as a frame-like container for cross-functional flowcharts. Objects whose bounds lie inside the
// swimlane move with it. This module holds the data, validation and item-local layout. Pure: no React.
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';

export const swimOrientations = ['horizontal', 'vertical'] as const;
export type SwimOrientation = (typeof swimOrientations)[number];
/** One lane or phase. `size` is its length along the stacking axis, in world units. */
export type SwimSection = { id: string; title: string; size: number; color?: string };
/** `horizontal` stacks lanes as rows; `vertical` as columns. Phases divide the other axis. */
export type SwimlaneData = {
  orientation: SwimOrientation;
  lanes: SwimSection[];
  phases?: SwimSection[];
  /** Hide the pool title band. */
  hideTitle?: boolean;
};
export type SwimAxis = 'lanes' | 'phases';
export type Rect = { x: number; y: number; w: number; h: number };

export const SWIM_TITLE = 44,
  SWIM_LANE_HEADER = 48,
  SWIM_PHASE_HEADER = 36,
  /** Smallest lane or phase a resize or fit produces. */
  SWIM_MIN = 40,
  /** Smallest size accepted on import (older or hand-edited boards). */
  SWIM_MIN_VALID = 20,
  SWIM_MAX = 20000,
  SWIM_MAX_SECTIONS = 30,
  /** Smallest body length across the lanes when there are no phases. */
  SWIM_MIN_BODY = 80,
  SWIM_DEFAULT_LANE = 240,
  SWIM_DEFAULT_PHASE = 260,
  SWIM_DEFAULT_BODY = 760;
/** Lane tints offered in the editor (light enough for dark text). */
export const swimColors = ['#fde2e4', '#ffe8cc', '#fff4c2', '#dcf5e3', '#dbeafe', '#ece4ff', '#f1f1f4'];

const sectionKeys = ['id', 'title', 'size', 'color'];
function validSections(list: unknown, min: number): list is SwimSection[] {
  if (!Array.isArray(list) || list.length < min || list.length > SWIM_MAX_SECTIONS) return false;
  const ids = new Set<string>();
  for (const s of list) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    const r = s as Record<string, unknown>;
    if (Object.keys(r).some(k => !sectionKeys.includes(k))) return false;
    if (typeof r.id !== 'string' || !r.id || r.id.length > 100 || ids.has(r.id)) return false;
    ids.add(r.id);
    if (typeof r.title !== 'string' || r.title.length > 200) return false;
    if (typeof r.size !== 'number' || !Number.isFinite(r.size) || r.size < SWIM_MIN_VALID || r.size > SWIM_MAX)
      return false;
    if (r.color !== undefined && (typeof r.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(r.color))) return false;
  }
  return true;
}
export function validateSwimlane(item: Item): void {
  const d = item.data as SwimlaneData | undefined;
  if (
    !d ||
    typeof d !== 'object' ||
    Object.keys(d).some(k => !['orientation', 'lanes', 'phases', 'hideTitle'].includes(k)) ||
    !(swimOrientations as readonly string[]).includes(d.orientation) ||
    !validSections(d.lanes, 1) ||
    (d.phases !== undefined && !validSections(d.phases, 1)) ||
    (d.hideTitle !== undefined && typeof d.hideTitle !== 'boolean')
  )
    throw new Error('Invalid swimlane.');
}

const sum = (list: { size: number }[] | undefined) => (list ?? []).reduce((a, s) => a + s.size, 0);
const titleH = (d: SwimlaneData) => (d.hideTitle ? 0 : SWIM_TITLE);
const phaseH = (d: SwimlaneData) => (d.phases?.length ? SWIM_PHASE_HEADER : 0);
export const swimData = (item: Item) => item.data as SwimlaneData;

/** Lengths available to lanes (main axis) and across them (cross axis) for an item's current size. */
export function swimAxes(item: Item): { main: number; cross: number } {
  const d = swimData(item),
    horizontal = d.orientation === 'horizontal';
  const fixedW = horizontal ? SWIM_LANE_HEADER : phaseH(d),
    fixedH = titleH(d) + (horizontal ? phaseH(d) : SWIM_LANE_HEADER);
  const bodyW = Math.max(1, item.w - fixedW),
    bodyH = Math.max(1, item.h - fixedH);
  return horizontal ? { main: bodyH, cross: bodyW } : { main: bodyW, cross: bodyH };
}
/** Item size that fits the data exactly; `cross` is the body length across lanes when there are no phases. */
export function swimSizeFor(d: SwimlaneData, cross: number): { w: number; h: number } {
  const main = sum(d.lanes),
    across = d.phases?.length ? sum(d.phases) : Math.max(SWIM_MIN_BODY, cross);
  return d.orientation === 'horizontal'
    ? { w: SWIM_LANE_HEADER + across, h: titleH(d) + phaseH(d) + main }
    : { w: phaseH(d) + main, h: titleH(d) + SWIM_LANE_HEADER + across };
}
const round = (n: number) => Math.round(n * 100) / 100;
/** Scale section sizes proportionally to `total`, keeping each at least SWIM_MIN. */
function scaleSections(list: SwimSection[], total: number): SwimSection[] {
  const current = sum(list);
  if (Math.abs(current - total) < 0.5) return list;
  const k = total / current;
  return list.map(s => ({ ...s, size: Math.min(SWIM_MAX, Math.max(SWIM_MIN, round(s.size * k))) }));
}
/**
 * Keep an item's size and its lane and phase sizes consistent: after a resize the sections scale
 * proportionally to the new size (never below SWIM_MIN), then the size is set from the sections.
 * Returns the same item when nothing changes.
 */
export function fitSwimlaneItem(item: Item): Item {
  if (item.type !== 'swimlane' || !item.data) return item;
  const d = swimData(item),
    axes = swimAxes(item);
  const lanes = scaleSections(d.lanes, axes.main),
    phases = d.phases?.length ? scaleSections(d.phases, axes.cross) : d.phases;
  const data = lanes === d.lanes && phases === d.phases ? d : { ...d, lanes, ...(phases ? { phases } : {}) };
  const size = swimSizeFor(data, axes.cross);
  if (data === d && Math.abs(size.w - item.w) < 0.5 && Math.abs(size.h - item.h) < 0.5) return item;
  return { ...item, data, w: round(size.w), h: round(size.h) };
}

export type SwimCell = { section: SwimSection; index: number; start: number; size: number; header: Rect; body: Rect };
export type SwimLayout = {
  orientation: SwimOrientation;
  title: Rect | null;
  /** Area of all lane bodies together. */
  body: Rect;
  lanes: SwimCell[];
  phases: SwimCell[];
};
/** Item-local rectangles of the title band, lane and phase headers and bodies (sizes fitted to the item). */
export function swimlaneLayout(item: Item): SwimLayout {
  const d = swimData(item),
    horizontal = d.orientation === 'horizontal',
    T = titleH(d),
    P = phaseH(d),
    L = SWIM_LANE_HEADER;
  const body: Rect = horizontal
    ? { x: L, y: T + P, w: Math.max(1, item.w - L), h: Math.max(1, item.h - T - P) }
    : { x: P, y: T + L, w: Math.max(1, item.w - P), h: Math.max(1, item.h - T - L) };
  const mainStart = horizontal ? body.y : body.x,
    mainLen = horizontal ? body.h : body.w,
    crossStart = horizontal ? body.x : body.y,
    crossLen = horizontal ? body.w : body.h;
  const cells = (list: SwimSection[], start: number, len: number, lane: boolean): SwimCell[] => {
    const total = sum(list) || 1;
    let at = start;
    return list.map((section, index) => {
      const size = (section.size / total) * len,
        s = at;
      at += size;
      const header: Rect = lane
        ? horizontal
          ? { x: 0, y: s, w: L, h: size }
          : { x: s, y: T, w: size, h: L }
        : horizontal
          ? { x: s, y: T, w: size, h: P }
          : { x: 0, y: s, w: P, h: size };
      const cellBody: Rect = lane
        ? horizontal
          ? { x: body.x, y: s, w: body.w, h: size }
          : { x: s, y: body.y, w: size, h: body.h }
        : horizontal
          ? { x: s, y: body.y, w: size, h: body.h }
          : { x: body.x, y: s, w: body.w, h: size };
      return { section, index, start: s, size, header, body: cellBody };
    });
  };
  return {
    orientation: d.orientation,
    title: T ? { x: 0, y: 0, w: item.w, h: T } : null,
    body,
    lanes: cells(d.lanes, mainStart, mainLen, true),
    phases: d.phases?.length ? cells(d.phases, crossStart, crossLen, false) : [],
  };
}
/** Index of the cell whose range holds `at` (clamped to the first or last cell). */
export function cellIndexAt(cells: SwimCell[], at: number): number {
  if (!cells.length) return -1;
  const k = cells.findIndex(c => at < c.start + c.size);
  return k === -1 ? cells.length - 1 : k;
}

const clip = (s: string, n: number) => s.trim().replace(/\s+/g, ' ').slice(0, n);
/** Spoken summary, e.g. "Swimlane, Order flow, 3 lanes: Sales, Ops, Finance, 2 phases: Plan, Do". */
export function swimlaneSummary(item: Item): string {
  const d = swimData(item);
  if (!d?.lanes) return 'Swimlane';
  const names = (list: SwimSection[]) => list.map((s, k) => clip(s.title, 40) || `Untitled ${k + 1}`).join(', ');
  const n = d.lanes.length,
    p = d.phases?.length ?? 0;
  return [
    'Swimlane',
    clip(item.name || item.text || '', 80),
    `${n} ${n === 1 ? 'lane' : 'lanes'}: ${names(d.lanes)}`,
    p ? `${p} ${p === 1 ? 'phase' : 'phases'}: ${names(d.phases!)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

export const swimlaneSpec: WidgetSpec = {
  kind: 'swimlane',
  label: 'Swimlanes',
  description: 'Lanes for cross-functional process diagrams',
  category: 'Diagramming',
  size: [SWIM_LANE_HEADER + SWIM_DEFAULT_BODY, SWIM_TITLE + 3 * SWIM_DEFAULT_LANE],
  init: (item: Item) => ({
    ...item,
    fill: '#f4f4f6',
    text: item.text || 'Swimlane diagram',
    data: {
      orientation: 'horizontal',
      lanes: [1, 2, 3].map(k => ({ id: crypto.randomUUID(), title: `Lane ${k}`, size: SWIM_DEFAULT_LANE })),
    } satisfies SwimlaneData,
  }),
  validate: validateSwimlane,
  searchText: (item: Item) => {
    const d = swimData(item);
    return [...(d?.lanes ?? []), ...(d?.phases ?? [])].map(s => s.title).join('\n');
  },
};
