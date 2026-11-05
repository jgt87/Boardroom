// Drag-and-drop chips (track F): estimate chips, voting dots and people avatars dropped onto board objects.
// Chip payloads, the estimate palette and dot pile data, and validation of the optional fields chips store
// on objects. Pure: no React, no CSS, no board-editing imports (model-ext.ts imports this module).
import type { Board, Item, PlacedDots } from './model.ts';
import { tshirtSizes } from './facilitation-widgets.ts';
import { isValidAuthor } from './authors.ts';

/** Drag data type for every chip; the payload is `estimate:<value>`, `dot:<pile id>` or `person:<name>`. */
export const CHIP_MIME = 'application/x-boardroom-chip';

export type Chip =
  /** `value` is story points ("5", "0.5"), "?" or a T-shirt size; '' clears the estimate. */
  | { kind: 'estimate'; value: string }
  | { kind: 'dot'; pile: string }
  /** '' unassigns. */
  | { kind: 'person'; name: string };

export type EstimateScale = 'points' | 'tshirt';
export type EstimatePaletteData = { scale: EstimateScale };
export type DotPileData = { title: string; total: number; color: string };

/** Story point chips on the estimate palette ("?" means "needs discussion"). */
export const paletteValues: Record<EstimateScale, readonly string[]> = {
  points: ['0', '1', '2', '3', '5', '8', '13', '21', '?'],
  tshirt: tshirtSizes,
};
export const DOT_PILE_MAX = 99;
/** Different dot piles one object can hold dots from. */
export const MAX_DOT_PILES = 12;
export const MAX_DOTS_PER_PILE = 999;
export const dotColors = ['#e8445a', '#4262ff', '#2c9f5b', '#e2a01b', '#8e5cd9', '#1aa3b8', '#3f3f46'];

const hex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const fail = (message: string): never => {
  throw new Error(message);
};

/** Story points (0 to 1,000 in halves), "?" or a T-shirt size. */
export function isEstimateValue(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (v === '?' || (tshirtSizes as readonly string[]).includes(v)) return true;
  return /^\d{1,4}(\.5)?$/.test(v) && Number(v) <= 1000;
}
export const estimateLabel = (v: string) => (v === '0.5' ? '½' : v);

export function encodeChip(c: Chip): string {
  return c.kind === 'estimate' ? `estimate:${c.value}` : c.kind === 'dot' ? `dot:${c.pile}` : `person:${c.name}`;
}
/** Parse a chip payload from drag data; foreign or malformed payloads give null. */
export function parseChip(payload: string): Chip | null {
  if (typeof payload !== 'string' || payload.length > 300) return null;
  const at = payload.indexOf(':');
  if (at < 0) return null;
  const kind = payload.slice(0, at),
    value = payload.slice(at + 1);
  if (kind === 'estimate') return value === '' || isEstimateValue(value) ? { kind, value } : null;
  if (kind === 'dot') return value && value.length <= 64 ? { kind, pile: value } : null;
  if (kind === 'person') return value === '' || isValidAuthor(value) ? { kind, name: value } : null;
  return null;
}
/** Older estimate drags from the card bar: "points:5" or "size:M". */
export function legacyEstimateChip(payload: string): Chip | null {
  const m = /^(points|size):(.+)$/.exec(payload);
  if (!m) return null;
  const value = m[1] === 'points' ? String(Number(m[2])) : m[2]!;
  return isEstimateValue(value) && (m[1] === 'size') === !/^\d/.test(value) ? { kind: 'estimate', value } : null;
}

/** Dots from `pileId` placed on objects across the board. */
export function dotsPlaced(board: Board, pileId: string): number {
  let n = 0;
  for (const i of board.items) for (const d of i.dots ?? []) if (d.pile === pileId) n += d.n;
  return n;
}
/** Dots still in a pile: its size minus the dots placed from it (never below zero). */
export function dotsLeft(board: Board, pile: Item): number {
  const total = (pile.data as DotPileData | undefined)?.total ?? 0;
  return Math.max(0, total - dotsPlaced(board, pile.id));
}
export const dotCount = (i: Item) => (i.dots ?? []).reduce((n, d) => n + d.n, 0);

/** Kinds a chip can land on: estimates and people go on cards and sticky notes; dots on any object but connectors and chip sources. */
export function acceptsChip(i: Item, chip: Chip): boolean {
  if (chip.kind === 'dot') return !['arrow', 'dotpile', 'estimates'].includes(i.type);
  return i.type === 'card' || i.type === 'note';
}

/** Optional chip fields on objects (sticky estimate and assignee, placed dots). */
export function validateChipFields(i: Item): void {
  if (i.estimate !== undefined && (i.type !== 'note' || !isEstimateValue(i.estimate)))
    fail('Invalid estimate on a sticky note.');
  if (i.assignee !== undefined && (i.type !== 'note' || !isValidAuthor(i.assignee)))
    fail('Invalid assignee on a sticky note.');
  if (i.dots === undefined) return;
  const dots = i.dots as unknown;
  if (!Array.isArray(dots) || !dots.length || dots.length > MAX_DOT_PILES || i.type === 'arrow')
    fail('Invalid voting dots.');
  const piles = new Set<string>();
  for (const d of dots as PlacedDots[]) {
    if (
      !d ||
      typeof d !== 'object' ||
      typeof d.pile !== 'string' ||
      !d.pile ||
      d.pile.length > 64 ||
      piles.has(d.pile) ||
      !hex(d.color) ||
      !Number.isInteger(d.n) ||
      d.n < 1 ||
      d.n > MAX_DOTS_PER_PILE ||
      Object.keys(d).some(k => !['pile', 'color', 'n'].includes(k))
    )
      fail('Invalid voting dots.');
    piles.add(d.pile);
  }
}

export function validateEstimatePalette(i: Item): void {
  const d = (i.data ?? {}) as EstimatePaletteData;
  if (d.scale !== 'points' && d.scale !== 'tshirt') fail('Invalid estimate palette.');
}
export function validateDotPile(i: Item): void {
  const d = (i.data ?? {}) as DotPileData;
  if (typeof d.title !== 'string' || d.title.length > 80 || /[<>]/.test(d.title)) fail('Invalid dot pile title.');
  if (!Number.isInteger(d.total) || d.total < 1 || d.total > DOT_PILE_MAX)
    fail(`A dot pile holds 1 to ${DOT_PILE_MAX} dots.`);
  if (!hex(d.color)) fail('Invalid dot colour.');
}
