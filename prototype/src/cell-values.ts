// Spreadsheet cell parsing shared by record import and charts (gap list B3, I4). Pure, with no imports so
// widget specs can use it without an import cycle through the model.
/** A spreadsheet number (`1234.5`, `-3`, `1e3`, `12,5`) or null. */
export function parseNumber(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const s = /^[-+]?\d+,\d+$/.test(t) ? t.replace(',', '.') : t;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** Day/month order of slashed dates such as `03/04/2026`: day first or month first. */
export type DateOrder = 'dmy' | 'mdy';
const slashed = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/;

/**
 * The day/month order of a column's slashed dates (gap Q15): day first when some value's first part is over 12,
 * month first when some value's second part is over 12. `ambiguous` when no value settles it, `conflict` when the
 * values point both ways, and null when the column holds no slashed dates. Values with equal parts read the same
 * either way, so they never make a column ambiguous.
 */
export function slashedDateOrder(values: string[]): DateOrder | 'ambiguous' | 'conflict' | null {
  let any = false,
    unsettled = false,
    dayFirst = false,
    monthFirst = false;
  for (const v of values) {
    const m = v.trim().match(slashed);
    if (!m) continue;
    any = true;
    const a = Number(m[1]),
      b = Number(m[3]);
    if (a > 12) dayFirst = true;
    if (b > 12) monthFirst = true;
    if (a !== b && a <= 12 && b <= 12) unsettled = true;
  }
  if (!any) return null;
  if (dayFirst && monthFirst) return 'conflict';
  if (dayFirst) return 'dmy';
  if (monthFirst) return 'mdy';
  return unsettled ? 'ambiguous' : 'dmy';
}

/**
 * `YYYY-MM-DD` from ISO dates (optionally with a time), `YYYY/MM/DD` or `DD.MM.YYYY`; null when not a date.
 * Slashed dates (`DD/MM/YYYY` or `MM/DD/YYYY`) are read only when `order` says which part is the day.
 */
export function parseDate(v: string, order?: DateOrder): string | null {
  const t = v.trim();
  let y: string, m: string, d: string;
  const iso = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ][\d:.]+(?:Z|[+-]\d\d:?\d\d)?)?$/);
  const dotted = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  const slash = order ? t.match(slashed) : null;
  if (iso) [, y, m, d] = iso;
  else if (dotted) [, d, m, y] = dotted;
  else if (slash) [d, m, y] = order === 'dmy' ? [slash[1], slash[3], slash[4]] : [slash[3], slash[1], slash[4]];
  else return null;
  const out = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
    time = Date.parse(out);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === out ? out : null;
}
