// Pure helpers for cards, the prioritization matrix, polls, spinner wheels and scales (items 21, 43, 44).
// Evidence: ComputeCardWidget (assignee, statusData, tagState, CONVERT), ComputedPipmatrixWidget (PIP_MATRIX),
// estimation trigger module; catalogue entries Poll, Spinner wheel, Alignment scale, Story points, T-shirt sizing.
import type { Board, Item } from './model.ts';
import { toCard } from './card-tools.ts';

export const cardStatuses = ['Not started', 'In progress', 'Complete'] as const;
export type CardStatus = string;
export const tshirtSizes = ['XS', 'S', 'M', 'L', 'XL'] as const;
export type CardData = {
  description: string;
  assignee: string;
  /** Optional start date (ISO yyyy-mm-dd), item 115. */
  start?: string;
  due: string;
  /** Empty string means no status (not allowed on record-synced cards). */
  status: CardStatus;
  points?: number;
  size?: (typeof tshirtSizes)[number];
};
export const isIsoDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

/** Convert a sticky note to a card: keeps id (connectors stay attached), text, tags, link; note colour becomes the accent. */
export const noteToCard = (note: Item): Item => toCard(note);
/** Total story points and t-shirt size counts for a set of cards. */
export function estimateTotals(items: Item[]): { points: number; sizes: Record<string, number>; estimated: number } {
  const sizes: Record<string, number> = {};
  let points = 0,
    estimated = 0;
  for (const i of items) {
    if (i.type !== 'card' || !i.data) continue;
    const d = i.data as CardData;
    if (typeof d.points === 'number') {
      points += d.points;
      estimated++;
    }
    if (d.size) sizes[d.size] = (sizes[d.size] ?? 0) + 1;
  }
  return { points, sizes, estimated };
}

// ---- Matrix ----------------------------------------------------------------------------------
export type MatrixData = { xLabel: string; yLabel: string; quadrants: [string, string, string, string] };
/**
 * Quadrant of an object's centre inside a matrix: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right,
 * or null when the centre is outside. The y axis grows upward visually (top = high).
 */
export function matrixQuadrant(matrix: Item, item: Item): 0 | 1 | 2 | 3 | null {
  if (item.id === matrix.id || item.type === 'arrow') return null;
  const cx = item.x + item.w / 2,
    cy = item.y + item.h / 2;
  if (cx < matrix.x || cx > matrix.x + matrix.w || cy < matrix.y || cy > matrix.y + matrix.h) return null;
  const right = cx >= matrix.x + matrix.w / 2,
    bottom = cy >= matrix.y + matrix.h / 2;
  return ((bottom ? 2 : 0) + (right ? 1 : 0)) as 0 | 1 | 2 | 3;
}
/** Objects whose centre lies in each quadrant of a matrix (frames, pens and other matrices excluded). */
export function matrixContents(board: Board, matrixId: string): [Item[], Item[], Item[], Item[]] {
  const matrix = board.items.find(i => i.id === matrixId),
    out: [Item[], Item[], Item[], Item[]] = [[], [], [], []];
  if (!matrix) return out;
  for (const i of board.items) {
    if (['frame', 'swimlane', 'pen', 'matrix'].includes(i.type)) continue;
    const q = matrixQuadrant(matrix, i);
    if (q !== null) out[q].push(i);
  }
  return out;
}

// ---- Poll ----------------------------------------------------------------------------------
export type PollOption = { id: string; label: string; votes: number };
export type PollData = { question: string; options: PollOption[] };
export function votePoll(data: PollData, optionId: string, delta = 1): PollData {
  if (!data.options.some(o => o.id === optionId)) throw new Error('That option no longer exists.');
  return {
    ...data,
    options: data.options.map(o => (o.id === optionId ? { ...o, votes: Math.max(0, o.votes + delta) } : o)),
  };
}
export const pollTotal = (d: PollData) => d.options.reduce((s, o) => s + o.votes, 0);
export function pollResults(d: PollData): { id: string; label: string; votes: number; share: number }[] {
  const total = pollTotal(d);
  return d.options.map(o => ({ ...o, share: total ? o.votes / total : 0 }));
}
export const resetPoll = (d: PollData): PollData => ({ ...d, options: d.options.map(o => ({ ...o, votes: 0 })) });

// ---- Spinner -------------------------------------------------------------------------------
export type SpinnerData = { options: string[]; result?: string };
/** Uniform integer in [0, n) from crypto.getRandomValues using rejection sampling (no modulo bias). */
export function randomIndex(
  n: number,
  source: (buf: Uint32Array) => Uint32Array = b => crypto.getRandomValues(b),
): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new Error('Add at least one option to spin.');
  const limit = Math.floor(2 ** 32 / n) * n,
    buf = new Uint32Array(1);
  for (let i = 0; i < 1000; i++) {
    source(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
  throw new Error('Random source unavailable.');
}
export function spin(d: SpinnerData, source?: (buf: Uint32Array) => Uint32Array): SpinnerData {
  const options = d.options.filter(o => o.trim());
  if (!options.length) throw new Error('Add at least one option to spin.');
  return { ...d, result: options[randomIndex(options.length, source)] };
}
/** Remove the picked option from the wheel (gap G11). The last option cannot be removed. */
export function removePicked(d: SpinnerData): SpinnerData {
  if (!d.result) throw new Error('Spin the wheel first.');
  const at = d.options.indexOf(d.result);
  if (at < 0) throw new Error('The picked option is no longer on the wheel.');
  if (d.options.length < 2) throw new Error('A spinner needs at least one option.');
  return { options: d.options.filter((_, i) => i !== at) };
}
/** Names from People widgets and user cards on the board, de-duplicated, up to 24 (gap G11). */
export function peopleNames(board: Board): string[] {
  const seen = new Set<string>(),
    names: string[] = [];
  const add = (n: unknown) => {
    if (typeof n !== 'string') return;
    const name = n.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (name && !seen.has(name.toLowerCase()) && names.length < 24) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  };
  for (const i of board.items)
    if (i.type === 'people') for (const m of (i.data?.members ?? []) as { name?: unknown }[]) add(m?.name);
    else if (i.type === 'usercard') add(i.data?.name);
  return names;
}
export function fillFromPeople(board: Board): SpinnerData {
  const options = peopleNames(board);
  if (!options.length) throw new Error('Add a People widget or user card with names first.');
  return { options };
}
/**
 * Shuffle selected flip cards (gap G11): their positions are permuted at random and every card shows its front.
 * Locked cards stay where they are.
 */
export function shuffleFlipCards(board: Board, ids: string[], source?: (buf: Uint32Array) => Uint32Array): Board {
  const cards = board.items.filter(i => ids.includes(i.id) && i.type === 'flipcard' && !i.locked);
  if (cards.length < 2) throw new Error('Select at least two unlocked flip cards to shuffle.');
  const slots = cards.map(c => ({ x: c.x, y: c.y }));
  for (let i = slots.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, source);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const place = new Map(cards.map((c, k) => [c.id, slots[k]]));
  return {
    ...board,
    items: board.items.map(i => {
      const p = place.get(i.id);
      return p ? { ...i, ...p, data: { ...i.data, flipped: false } } : i;
    }),
  };
}

// ---- Scale ---------------------------------------------------------------------------------
export type ScaleData = {
  label: string;
  min: number;
  max: number;
  value: number;
  leftLabel: string;
  rightLabel: string;
};
export const clampScale = (d: ScaleData, value: number): ScaleData => ({
  ...d,
  value: Math.round(Math.min(d.max, Math.max(d.min, value))),
});
