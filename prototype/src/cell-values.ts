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
/** `YYYY-MM-DD` from ISO dates (optionally with a time), `YYYY/MM/DD` or `DD.MM.YYYY`; null when not a date. */
export function parseDate(v: string): string | null {
  const t = v.trim();
  let y: string, m: string, d: string;
  const iso = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ][\d:.]+(?:Z|[+-]\d\d:?\d\d)?)?$/);
  const dotted = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (iso) [, y, m, d] = iso;
  else if (dotted) [, d, m, y] = dotted;
  else return null;
  const out = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
    time = Date.parse(out);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === out ? out : null;
}
