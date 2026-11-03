import type { RecordRow } from './model.ts';
import { isIsoDate } from './facilitation-widgets.ts';
export type TimelineScale = 'days' | 'weeks' | 'months' | 'quarters' | 'years';
export type TimelineSettings = { scale?: TimelineScale; start?: string; end?: string; fit?: boolean };
const DAY = 86400000;
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
