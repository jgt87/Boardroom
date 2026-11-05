// Video and Talktrack playback rules (track G): trim window, cut-out ranges, ±10 s skips, playback speed,
// player keys and the waveform peaks drawn in the trim editor. Pure: no React, no DOM.

/** A range of seconds, start inclusive and end exclusive. */
export type TimeRange = { start: number; end: number };
/** What limits playback: the trim window, cut-out ranges and the recorded length (0 when unknown). */
export type PlaybackLimits = { trim?: TimeRange; cuts?: TimeRange[]; duration?: number };

export const SKIP_SECONDS = 10;
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const MAX_CUTS = 50;
/** Cuts shorter than this are dropped: they could not be heard and would only stall playback. */
export const MIN_CUT = 0.1;

const round = (s: number) => Math.round(s * 100) / 100;

/** Is `v` a valid stored cut list: at most 50 sorted, non-overlapping ranges inside 0–1,000,000 s? */
export function validCuts(v: unknown): v is TimeRange[] {
  if (!Array.isArray(v) || v.length > MAX_CUTS) return false;
  let last = -1;
  for (const c of v) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => k !== 'start' && k !== 'end'))
      return false;
    const { start, end } = c as TimeRange;
    if (![start, end].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e6)) return false;
    if (start >= end || start < last) return false;
    last = end;
  }
  return true;
}

/**
 * Sort, merge overlapping or touching ranges, clamp into [0, duration] when the length is known and drop ranges
 * shorter than MIN_CUT. The result always passes validCuts (it keeps at most MAX_CUTS ranges).
 */
export function normalizeCuts(cuts: TimeRange[], duration = 0): TimeRange[] {
  const max = duration > 0 ? duration : 1e6;
  const sorted = cuts
    .filter(c => Number.isFinite(c.start) && Number.isFinite(c.end))
    .map(c => ({
      start: round(Math.max(0, Math.min(c.start, c.end))),
      end: round(Math.min(max, Math.max(c.start, c.end))),
    }))
    .filter(c => c.end - c.start >= MIN_CUT)
    .sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const c of sorted) {
    const prev = out[out.length - 1];
    if (prev && c.start <= prev.end) prev.end = Math.max(prev.end, c.end);
    else out.push({ ...c });
  }
  return out.slice(0, MAX_CUTS);
}

/** The playable window: the trim when set, otherwise the whole recording (end Infinity when the length is unknown). */
export function playWindow({ trim, duration }: PlaybackLimits): TimeRange {
  if (trim) return { start: trim.start, end: trim.end };
  return { start: 0, end: duration && duration > 0 ? duration : Infinity };
}

/**
 * Where playback should be for a wanted time `t`: inside the window and outside every cut. Moving forward
 * (`direction` 1) out of a cut lands on its end; moving back lands just before its start.
 * Returns the window end when nothing playable is left in that direction.
 */
export function resolvePlayhead(t: number, limits: PlaybackLimits, direction: 1 | -1 = 1): number {
  const win = playWindow(limits),
    cuts = limits.cuts ?? [];
  let at = Math.max(win.start, Math.min(t, win.end));
  for (let guard = 0; guard <= cuts.length; guard++) {
    const inside = cuts.find(c => at >= c.start && at < c.end);
    if (!inside) break;
    if (direction > 0 || inside.start <= win.start) at = Math.min(win.end, inside.end);
    else at = Math.max(win.start, inside.start - MIN_CUT);
  }
  // Backward skips can land in a cut that starts at the window start: then play from after it.
  const stuck = cuts.find(c => at >= c.start && at < c.end);
  if (stuck) at = Math.min(win.end, stuck.end);
  return round(at);
}

/** Has playback reached the end of what may be played (the window end, or a cut that runs to it)? */
export function atPlayableEnd(t: number, limits: PlaybackLimits): boolean {
  const win = playWindow(limits);
  return resolvePlayhead(t, limits, 1) >= win.end - 0.01 && t >= win.start;
}

/** New time after a skip of `delta` seconds (±10 s by default), honouring the window and the cuts. */
export const skipBy = (t: number, delta: number, limits: PlaybackLimits) =>
  resolvePlayhead(t + delta, limits, delta >= 0 ? 1 : -1);

/** Seconds that will actually play: the window minus the cuts inside it. */
export function playableLength(limits: PlaybackLimits): number {
  const win = playWindow(limits);
  if (!Number.isFinite(win.end)) return 0;
  const cut = (limits.cuts ?? []).reduce(
    (n, c) => n + Math.max(0, Math.min(c.end, win.end) - Math.max(c.start, win.start)),
    0,
  );
  return round(Math.max(0, win.end - win.start - cut));
}

/** Next playback speed up (`dir` 1) or down (-1) from the offered speeds; stays at the ends. */
export function stepRate(rate: number, dir: 1 | -1): number {
  const rates = PLAYBACK_RATES as readonly number[];
  let i = rates.findIndex(r => Math.abs(r - rate) < 1e-6);
  if (i < 0) i = rates.findIndex(r => r > rate) - (dir > 0 ? 1 : 0);
  return rates[Math.max(0, Math.min(rates.length - 1, i + dir))];
}
export const rateLabel = (rate: number) => `${rate}×`;
/** Is `v` one of the offered playback speeds (the value a video remembers in `data.rate`)? */
export const validRate = (v: unknown): v is number =>
  typeof v === 'number' && (PLAYBACK_RATES as readonly number[]).includes(v);
/** The remembered speed of a video, or normal speed when none (or an unknown one) is stored. */
export const storedRate = (v: unknown): number => (validRate(v) ? v : 1);
/**
 * Video data with the speed remembered: normal speed removes the field so untouched videos stay unchanged.
 * Returns the same object when nothing changes.
 */
export function withRate<T extends { rate?: number }>(data: T, rate: number): T {
  const next = validRate(rate) && rate !== 1 ? rate : undefined;
  if (data.rate === next) return data;
  const copy = { ...data };
  if (next === undefined) delete copy.rate;
  else copy.rate = next;
  return copy;
}

// ---- Drawing cuts on the waveform ----------------------------------------------------------------------

/** Seconds at horizontal offset `px` of a strip `width` pixels wide showing `total` seconds, to tenths. */
export function timeAtX(px: number, width: number, total: number): number {
  if (!(width > 0) || !(total > 0)) return 0;
  return Math.round(Math.max(0, Math.min(total, (px / width) * total)) * 10) / 10;
}

export type CutGrab = { index: number; edge: 'start' | 'end'; anchor: number };
/**
 * The cut edge nearest to `t` within `tolerance` seconds, as the cut index and which end, or null. A drag that
 * starts there moves that edge; the other end stays as the drag's anchor.
 */
export function cutEdgeAt(t: number, cuts: TimeRange[], tolerance: number): CutGrab | null {
  let best: CutGrab | null = null,
    dist = tolerance;
  cuts.forEach((c, index) => {
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end)) return;
    for (const edge of ['start', 'end'] as const) {
      const d = Math.abs(c[edge] - t);
      if (d <= dist) {
        dist = d;
        best = { index, edge, anchor: edge === 'start' ? c.end : c.start };
      }
    }
  });
  return best;
}

/** The cut a drag describes: from the anchor to the pointer, either way round, inside [0, total]. */
export function cutFromDrag(anchor: number, t: number, total: number): TimeRange {
  const max = total > 0 ? total : 1e6,
    clamp = (s: number) => Math.round(Math.max(0, Math.min(max, s)) * 10) / 10;
  const a = clamp(anchor),
    b = clamp(t);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

export type MediaKeyAction = 'back' | 'forward' | 'toggle' | 'slower' | 'faster';
/** Player keys while the player has focus: J/← back 10 s, L/→ forward 10 s, K/space play-pause, < > speed. */
export function mediaKeyAction(key: string): MediaKeyAction | null {
  switch (key) {
    case 'j':
    case 'J':
    case 'ArrowLeft':
      return 'back';
    case 'l':
    case 'L':
    case 'ArrowRight':
      return 'forward';
    case 'k':
    case 'K':
    case ' ':
      return 'toggle';
    case '<':
    case ',':
      return 'slower';
    case '>':
    case '.':
      return 'faster';
    default:
      return null;
  }
}

/**
 * Waveform peaks: the largest absolute sample in each of `buckets` equal slices, scaled so the loudest is 1.
 * Silent or empty audio gives all zeros.
 */
export function waveformPeaks(samples: ArrayLike<number>, buckets: number): number[] {
  const n = samples.length,
    count = Math.max(1, Math.floor(buckets)),
    out = new Array<number>(count).fill(0);
  if (!n) return out;
  for (let b = 0; b < count; b++) {
    const from = Math.floor((b * n) / count),
      to = Math.max(from + 1, Math.floor(((b + 1) * n) / count));
    let peak = 0;
    for (let k = from; k < to && k < n; k++) {
      const v = Math.abs(samples[k]);
      if (v > peak) peak = v;
    }
    out[b] = peak;
  }
  const top = Math.max(...out);
  return top > 0 ? out.map(v => Math.round((v / top) * 1000) / 1000) : out;
}

/** Parse "1:05", "65" or "0:01.5" as seconds; NaN when it is not a time. */
export function parseClock(v: string): number {
  const m = /^\s*(?:(\d+):)?(\d+(?:\.\d+)?)\s*$/.exec(v);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN;
}
/** Seconds as m:ss, with tenths when they matter. */
export function clockLabel(s: number): string {
  const t = Math.round(Math.max(0, s) * 10),
    whole = Math.floor(t / 10),
    tenths = t % 10;
  const base = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  return tenths ? `${base}.${tenths}` : base;
}
