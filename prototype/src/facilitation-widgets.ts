// Pure helpers for cards, the prioritization matrix, polls, spinner wheels and scales (items 21, 43, 44).
// Evidence: ComputeCardWidget (assignee, statusData, tagState, CONVERT), ComputedPipmatrixWidget (PIP_MATRIX),
// estimation trigger module; catalogue entries Poll, Spinner wheel, Alignment scale, Story points, T-shirt sizing.
import type { Board, Item } from './model.ts';
import { toCard } from './card-tools.ts';

export const cardStatuses = ['Not started', 'In progress', 'Complete'] as const;
export type CardStatus = string;
export const tshirtSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
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
/** `resultsHidden` keeps counts and bars hidden until the facilitator reveals them (track R1-E). */
export type PollData = { question: string; options: PollOption[]; resultsHidden?: boolean };
/** Show or hide the results; hidden is stored only while on. */
export function setPollHidden(d: PollData, hidden: boolean): PollData {
  const next = { ...d };
  if (hidden) next.resultsHidden = true;
  else delete next.resultsHidden;
  return next;
}
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
/** One statement on a scale; `tallies[k]` counts the responses at step `min + k` on this device. */
export type ScaleStatement = { id: string; text: string; tallies: number[] };
/**
 * A scale has a title (`label`), end labels and up to six statements (track R1-E). Older boards stored a single
 * marker `value` and no statements; they still load and read as one statement with that value as its response.
 */
export type ScaleData = {
  label: string;
  min: number;
  max: number;
  /** Older single-marker scales only. */
  value?: number;
  leftLabel: string;
  rightLabel: string;
  statements?: ScaleStatement[];
};
export const SCALE_STATEMENTS_MAX = 6;
/** Steps a statement can be rated on with buttons; larger ranges use a slider and an Add button. */
export const SCALE_BUTTON_STEPS = 11;
export const clampScale = (d: ScaleData, value: number): ScaleData => ({
  ...d,
  value: Math.round(Math.min(d.max, Math.max(d.min, value))),
});
/** Statements of a scale. An older single-marker scale reads as one statement (its title) with one response. */
export function scaleStatements(d: ScaleData): ScaleStatement[] {
  if (Array.isArray(d.statements)) return d.statements;
  const tallies = new Array<number>(d.max - d.min + 1).fill(0),
    v = d.value;
  if (typeof v === 'number' && Number.isInteger(v) && v >= d.min && v <= d.max) tallies[v - d.min] = 1;
  return [{ id: 'statement-1', text: d.label, tallies }];
}
/** The scale in the current format: statements stored, the older marker value dropped. */
export function normalizeScale(d: ScaleData): ScaleData {
  const next: ScaleData = { ...d, statements: scaleStatements(d) };
  delete next.value;
  return next;
}
/** Add (or with a negative delta, remove) one response at `value` for a statement. */
export function tallyScale(d: ScaleData, statementId: string, value: number, delta = 1): ScaleData {
  if (!Number.isInteger(value) || value < d.min || value > d.max) throw new Error('That step is not on the scale.');
  const n = normalizeScale(d),
    statements = n.statements ?? [];
  if (!statements.some(s => s.id === statementId)) throw new Error('That statement no longer exists.');
  return {
    ...n,
    statements: statements.map(s =>
      s.id !== statementId
        ? s
        : { ...s, tallies: s.tallies.map((t, k) => (k === value - d.min ? Math.min(1e6, Math.max(0, t + delta)) : t)) },
    ),
  };
}
/** Response count, average to one decimal (null without responses) and the share of responses at each step. */
export function scaleStats(
  s: ScaleStatement,
  min: number,
): { count: number; average: number | null; shares: number[] } {
  const count = s.tallies.reduce((a, t) => a + t, 0),
    sum = s.tallies.reduce((a, t, k) => a + t * (min + k), 0);
  return {
    count,
    average: count ? Math.round((sum / count) * 10) / 10 : null,
    shares: s.tallies.map(t => (count ? t / count : 0)),
  };
}
/** Responses across every statement. */
export const scaleTotal = (d: ScaleData) =>
  scaleStatements(d).reduce((a, s) => a + s.tallies.reduce((b, t) => b + t, 0), 0);
/** Clear every response. */
export function resetScale(d: ScaleData): ScaleData {
  const n = normalizeScale(d);
  return { ...n, statements: (n.statements ?? []).map(s => ({ ...s, tallies: s.tallies.map(() => 0) })) };
}
/**
 * Change the range: responses keep their step value and responses outside the new range are dropped.
 * Statements beyond the limit are left out.
 */
export function rangeScale(d: ScaleData, min: number, max: number): ScaleData {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) throw new Error('Minimum must be below maximum.');
  if (max - min > 100) throw new Error('Use at most 100 steps.');
  const n = normalizeScale(d);
  return {
    ...n,
    min,
    max,
    statements: (n.statements ?? []).slice(0, SCALE_STATEMENTS_MAX).map(s => ({
      ...s,
      tallies: Array.from({ length: max - min + 1 }, (_, k) => {
        const old = min + k - d.min;
        return old >= 0 && old < s.tallies.length ? s.tallies[old] : 0;
      }),
    })),
  };
}
/** Throws when scale data is invalid. Accepts the statements format and older single-marker scales. */
export function validateScaleData(x: any): void {
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  const inRange = (v: unknown) => Number.isInteger(v) && (v as number) >= x.min && (v as number) <= x.max;
  if (
    !x ||
    !str(x.label, 200) ||
    !str(x.leftLabel, 60) ||
    !str(x.rightLabel, 60) ||
    !Number.isInteger(x.min) ||
    !Number.isInteger(x.max) ||
    x.min >= x.max ||
    x.max - x.min > 100
  )
    throw new Error('Invalid scale.');
  if (x.statements === undefined) {
    if (!inRange(x.value)) throw new Error('Invalid scale.');
    return;
  }
  if (x.value !== undefined && !inRange(x.value)) throw new Error('Invalid scale.');
  const steps = x.max - x.min + 1;
  if (
    !Array.isArray(x.statements) ||
    !x.statements.length ||
    x.statements.length > SCALE_STATEMENTS_MAX ||
    x.statements.some(
      (s: any) =>
        !s ||
        typeof s.id !== 'string' ||
        !s.id ||
        s.id.length > 80 ||
        !str(s.text, 200) ||
        !Array.isArray(s.tallies) ||
        s.tallies.length !== steps ||
        s.tallies.some((t: unknown) => !Number.isInteger(t) || (t as number) < 0 || (t as number) > 1e6),
    ) ||
    new Set(x.statements.map((s: any) => s.id)).size !== x.statements.length
  )
    throw new Error('A scale needs 1 to 6 valid statements.');
}
