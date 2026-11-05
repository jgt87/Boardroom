import type { RecordRow } from './model.ts';
import { isIsoDate } from './facilitation-widgets.ts';
export type TimelineScale = 'days' | 'weeks' | 'months' | 'quarters' | 'years';
/** A free milestone flag on a Timeline (track R2-I): a dated, coloured label not tied to a record. */
export type TimelineFlag = { id: string; date: string; label: string; color: string };
export type TimelineSettings = {
  scale?: TimelineScale;
  start?: string;
  end?: string;
  fit?: boolean;
  /**
   * Flags drawn on the axis. Board Timelines keep them on the dataset (`RecordSchema.timelineFlags`, P2-Q6);
   * a value stored here on a Timeline object is from an older board and is moved there (timeline-flags.ts).
   */
  flags?: TimelineFlag[];
};
export const TIMELINE_FLAG_LIMIT = 50;
export const TIMELINE_FLAG_LABEL_MAX = 80;
/** Flag colours offered in the Timeline controls; any #rrggbb colour is accepted when loading. */
export const timelineFlagColors = [
  { name: 'Red', value: '#e5484d' },
  { name: 'Orange', value: '#f76b15' },
  { name: 'Yellow', value: '#e2b100' },
  { name: 'Green', value: '#30a46c' },
  { name: 'Blue', value: '#4262ff' },
  { name: 'Purple', value: '#8e4ec6' },
  { name: 'Gray', value: '#696973' },
] as const;
const DAY = 86400000;
/** A flag label without markup or control characters. */
export const cleanFlagLabel = (v: string) =>
  [...v].filter(ch => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>').join('');
/**
 * Most flags a dataset may store. Adding stops at TIMELINE_FLAG_LIMIT; the higher ceiling only keeps every flag
 * when older boards whose Timelines each held their own flags are merged into the dataset (P2-Q6).
 */
export const TIMELINE_FLAG_STORE_LIMIT = 500;
/** Throw when the optional free flags are not valid (unique ids, real dates, short labels, #rrggbb colours). */
export function validateTimelineFlags(flags: unknown, limit = TIMELINE_FLAG_LIMIT): void {
  if (flags === undefined) return;
  const ids = new Set<string>();
  if (
    !Array.isArray(flags) ||
    flags.length > limit ||
    flags.some(f => {
      const bad =
        !f ||
        typeof f !== 'object' ||
        typeof f.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(f.id) ||
        ids.has(f.id) ||
        typeof f.date !== 'string' ||
        !isIsoDate(f.date) ||
        typeof f.label !== 'string' ||
        f.label.length > TIMELINE_FLAG_LABEL_MAX ||
        cleanFlagLabel(f.label) !== f.label ||
        typeof f.color !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(f.color);
      if (!bad) ids.add(f.id);
      return bad;
    })
  )
    throw new Error('Invalid Timeline flags.');
}
export function validateTimelineSettings(value: TimelineSettings): void {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value.scale !== undefined && !['days', 'weeks', 'months', 'quarters', 'years'].includes(value.scale)) ||
    [value.start, value.end].some(v => v !== undefined && (typeof v !== 'string' || !isIsoDate(v))) ||
    (value.start && value.end && value.end < value.start) ||
    (value.fit !== undefined && typeof value.fit !== 'boolean')
  )
    throw new Error('Choose a valid Timeline range, with the end on or after the start.');
  validateTimelineFlags(value.flags);
}
/** Add a free flag; throws when the date is not real, the label is too long or the limit is reached. */
export function addTimelineFlag(
  settings: TimelineSettings,
  flag: Omit<TimelineFlag, 'id'>,
  makeId: () => string = () => crypto.randomUUID(),
): TimelineSettings {
  const flags = settings.flags ?? [];
  if (flags.length >= TIMELINE_FLAG_LIMIT) throw new Error(`Use up to ${TIMELINE_FLAG_LIMIT} flags per dataset.`);
  if (!isIsoDate(flag.date)) throw new Error('Choose a date for the flag.');
  const label = cleanFlagLabel(flag.label).trim().slice(0, TIMELINE_FLAG_LABEL_MAX);
  const next = [...flags, { id: makeId(), date: flag.date, label, color: flag.color }];
  validateTimelineFlags(next);
  return { ...settings, flags: next };
}
/** Remove a free flag (the `flags` list is dropped when it becomes empty). */
export function removeTimelineFlag(settings: TimelineSettings, id: string): TimelineSettings {
  const flags = (settings.flags ?? []).filter(f => f.id !== id);
  const next: TimelineSettings = { ...settings, flags };
  if (!flags.length) delete next.flags;
  return next;
}
/** Horizontal position (0..1 of the axis width) of the middle of a flag's day, or null when it is out of range. */
export function flagLeft(date: string, axis: { min: number; max: number }): number | null {
  const t = Date.parse(date);
  if (!Number.isFinite(t) || t < axis.min || t > axis.max) return null;
  return (t - axis.min + DAY / 2) / (axis.max - axis.min + DAY);
}
function floor(time: number, scale: TimelineScale): number {
  const date = new Date(time);
  date.setUTCHours(0, 0, 0, 0);
  if (scale === 'weeks') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  if (['months', 'quarters', 'years'].includes(scale)) date.setUTCDate(1);
  if (scale === 'quarters') date.setUTCMonth(Math.floor(date.getUTCMonth() / 3) * 3);
  if (scale === 'years') date.setUTCMonth(0);
  return date.getTime();
}
function advance(time: number, scale: TimelineScale, n = 1): number {
  const date = new Date(time);
  if (scale === 'days' || scale === 'weeks') date.setUTCDate(date.getUTCDate() + n * (scale === 'weeks' ? 7 : 1));
  else if (scale === 'years') date.setUTCFullYear(date.getUTCFullYear() + n);
  else date.setUTCMonth(date.getUTCMonth() + n * (scale === 'quarters' ? 3 : 1));
  return date.getTime();
}
export function timelineAxis(
  rows: RecordRow[],
  settings: TimelineSettings = {},
  available = 600,
  today = new Date().toISOString().slice(0, 10),
) {
  const scale = settings.scale ?? 'weeks',
    dates = rows
      .flatMap(r => [r.start, r.end])
      .concat((settings.flags ?? []).map(f => f.date))
      .filter(Boolean)
      .map(Date.parse)
      .filter(Number.isFinite);
  const first = dates.length ? Math.min(...dates) : Date.parse(today),
    last = dates.length ? Math.max(...dates) : first;
  const min = settings.start ? Date.parse(settings.start) : floor(first, scale);
  const max = Math.max(
    min,
    settings.end
      ? Date.parse(settings.end)
      : Math.min(Date.parse('9999-12-31'), advance(floor(last, scale), scale) - DAY),
  );
  const span = max - min + DAY;
  const months =
    (new Date(max).getUTCFullYear() - new Date(min).getUTCFullYear()) * 12 +
    new Date(max).getUTCMonth() -
    new Date(min).getUTCMonth() +
    1;
  const count =
    scale === 'days'
      ? Math.ceil(span / DAY)
      : scale === 'weeks'
        ? Math.ceil(span / DAY / 7)
        : scale === 'months'
          ? months
          : scale === 'quarters'
            ? Math.ceil(months / 3)
            : Math.ceil(months / 12);
  const width =
    settings.fit !== false
      ? Math.max(280, available)
      : Math.min(
          20000,
          Math.max(available, count * { days: 44, weeks: 90, months: 110, quarters: 140, years: 180 }[scale]),
        );
  const step = Math.max(1, Math.ceil(count / Math.min(400, Math.max(1, Math.floor(width / 70)))));
  const ticks: { time: number; left: number; label: string }[] = [];
  for (let cursor = floor(min, scale); cursor <= max && ticks.length < 401; cursor = advance(cursor, scale, step)) {
    const date = new Date(cursor);
    const label =
      scale === 'quarters'
        ? `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`
        : scale === 'years'
          ? String(date.getUTCFullYear())
          : new Intl.DateTimeFormat(undefined, {
              timeZone: 'UTC',
              ...(scale === 'months'
                ? { month: 'short' as const, year: 'numeric' as const }
                : { month: 'short' as const, day: 'numeric' as const }),
            }).format(date);
    if (cursor >= min) ticks.push({ time: cursor, left: (cursor - min) / span, label });
  }
  return { min, max, width, ticks, scale };
}
export function reorderTimelineRow(rows: RecordRow[], id: string, before: string | null): RecordRow[] {
  if (id === before) return rows;
  const row = rows.find(r => r.id === id);
  if (!row) return rows;
  const rest = rows.filter(r => r.id !== id),
    index = before ? rest.findIndex(r => r.id === before) : -1,
    at = index < 0 ? rest.length : index;
  return [...rest.slice(0, at), row, ...rest.slice(at)];
}
const barDates = (row: RecordRow) => {
  const a = Date.parse(row.start || row.end),
    b = Date.parse(row.milestone ? row.start || row.end : row.end || row.start);
  return Number.isFinite(a) && Number.isFinite(b) ? { a, b } : null;
};
/**
 * Where a record's bar lies relative to the visible range: 'before', 'after', 'inside', or null when it has no
 * dates. `min` and `max` are the range's first and last day (epoch milliseconds), as returned by `timelineAxis`.
 */
export function barSide(row: RecordRow, range: { min: number; max: number }): 'before' | 'after' | 'inside' | null {
  const d = barDates(row);
  if (!d) return null;
  if (d.b < range.min) return 'before';
  if (d.a > range.max) return 'after';
  return 'inside';
}
/**
 * Shift the Timeline range so a record's bar is in view, keeping the range length. The bar starts a tenth of
 * the way into the new range; a bar longer than the range widens it.
 */
export function jumpToRecord(
  settings: TimelineSettings,
  range: { min: number; max: number },
  row: RecordRow,
): TimelineSettings {
  const d = barDates(row);
  if (!d) return settings;
  const length = Math.max(range.max - range.min, d.b - d.a),
    start = Math.max(Date.parse('0001-01-01'), d.a - Math.round((length * 0.1) / DAY) * DAY),
    end = Math.min(Date.parse('9999-12-31'), Math.max(d.b, start + length));
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { ...settings, start: iso(start), end: iso(end), fit: false };
}
