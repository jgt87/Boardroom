// Chart widget (gap list I4): bar, line and pie charts from a small data grid. Pure: spec, validation,
// grid conversion, record summaries and the drawing geometry used by the SVG renderer.
import type { Item, RecordRow } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import type { RecordSchema } from './record-schema.ts';
import { parseNumber } from './cell-values.ts';

export const chartTypes = ['bar', 'line', 'pie'] as const;
export type ChartType = (typeof chartTypes)[number];
export const chartTypeLabels: Record<ChartType, string> = { bar: 'Bar', line: 'Line', pie: 'Pie' };
export type ChartSeries = { name: string; values: number[]; color: string };
export type ChartData = { chart: ChartType; labels: string[]; series: ChartSeries[]; legend: boolean };

export const CHART_LABELS_MAX = 50;
export const CHART_SERIES_MAX = 8;
export const CHART_NAME_MAX = 80;
export const CHART_VALUE_MAX = 1e12;
/** Series colours (distinct in hue and lightness; readable on white). */
export const chartPalette = ['#4262ff', '#f2994a', '#2c9f5b', '#d64576', '#8a5cf6', '#1aa3b8', '#a1452f', '#71717a'];

const fail = (message: string): never => {
  throw new Error(message);
};
const nameOK = (v: unknown) => typeof v === 'string' && v.length <= CHART_NAME_MAX;

export function validateChart(d: ChartData): void {
  if (!d || !chartTypes.includes(d.chart)) fail('Choose a bar, line or pie chart.');
  if (typeof d.legend !== 'boolean') fail('Invalid chart legend setting.');
  if (!Array.isArray(d.labels) || !d.labels.length || d.labels.length > CHART_LABELS_MAX || !d.labels.every(nameOK))
    fail(`A chart has 1–${CHART_LABELS_MAX} categories with labels up to ${CHART_NAME_MAX} characters.`);
  if (!Array.isArray(d.series) || !d.series.length || d.series.length > CHART_SERIES_MAX)
    fail(`A chart has 1–${CHART_SERIES_MAX} data series.`);
  for (const s of d.series)
    if (
      !s ||
      typeof s !== 'object' ||
      !nameOK(s.name) ||
      typeof s.color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(s.color) ||
      !Array.isArray(s.values) ||
      s.values.length !== d.labels.length ||
      s.values.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > CHART_VALUE_MAX)
    )
      fail('Each chart series needs a name, a colour and one number per category.');
}

export const defaultChart = (): ChartData => ({
  chart: 'bar',
  legend: true,
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { name: 'Plan', values: [12, 18, 15, 22], color: chartPalette[0] },
    { name: 'Actual', values: [10, 20, 14, 25], color: chartPalette[1] },
  ],
});

/** Data grid for the editor: a header row (blank corner, series names) then one row per category. */
export const chartToGrid = (d: ChartData): string[][] => [
  ['', ...d.series.map(s => s.name)],
  ...d.labels.map((label, k) => [label, ...d.series.map(s => String(s.values[k]))]),
];
/**
 * Chart data from a grid such as one pasted from a spreadsheet: first column labels, header row series names.
 * Blank or non-numeric cells count as 0. Grids beyond the limits are cut (`truncated`).
 */
export function chartFromGrid(
  grid: string[][],
  base: Pick<ChartData, 'chart' | 'legend'> & { series?: ChartSeries[] } = { chart: 'bar', legend: true },
): { data: ChartData; truncated: boolean } {
  const rows = grid.filter(r => r.some(c => c.trim()));
  if (rows.length < 2 || Math.max(...rows.map(r => r.length)) < 2)
    throw new Error('Use a header row of series names and at least one row with a label and a number.');
  const [header, ...body] = rows,
    width = Math.min(Math.max(...rows.map(r => r.length)) - 1, CHART_SERIES_MAX),
    kept = body.slice(0, CHART_LABELS_MAX);
  const data: ChartData = {
    chart: base.chart,
    legend: base.legend,
    labels: kept.map((r, k) => (r[0] ?? '').trim().slice(0, CHART_NAME_MAX) || `Item ${k + 1}`),
    series: Array.from({ length: width }, (_, s) => ({
      name: (header[s + 1] ?? '').trim().slice(0, CHART_NAME_MAX) || `Series ${s + 1}`,
      color: base.series?.[s]?.color ?? chartPalette[s % chartPalette.length],
      values: kept.map(r => {
        const n = parseNumber(r[s + 1] ?? '');
        return n === null ? 0 : Math.max(-CHART_VALUE_MAX, Math.min(CHART_VALUE_MAX, n));
      }),
    })),
  };
  validateChart(data);
  return {
    data,
    truncated: body.length > CHART_LABELS_MAX || Math.max(...rows.map(r => r.length)) - 1 > CHART_SERIES_MAX,
  };
}

/** Columns of a record dataset that a chart can summarise. */
export function chartColumns(schema: RecordSchema): { id: string; name: string; mode: 'count' | 'sum' }[] {
  return [
    { id: 'status', name: 'Status', mode: 'count' as const },
    { id: 'assignee', name: 'Assignee', mode: 'count' as const },
    { id: 'points', name: 'Points', mode: 'sum' as const },
    ...schema.fields
      .filter(f => ['select', 'checkbox', 'text', 'number'].includes(f.type))
      .map(f => ({ id: f.id, name: f.name, mode: f.type === 'number' ? ('sum' as const) : ('count' as const) })),
  ];
}
/**
 * Summarise one record column: categorical columns count records per value; number columns (and Points)
 * total their values per status. Values beyond the category limit are folded into "Other".
 */
export function chartFromRecords(rows: RecordRow[], schema: RecordSchema, columnId: string): ChartData {
  const column = chartColumns(schema).find(c => c.id === columnId);
  if (!column) throw new Error('Choose a column to chart.');
  const value = (r: RecordRow): string | number | boolean | undefined =>
    columnId === 'status'
      ? r.status
      : columnId === 'assignee'
        ? r.assignee
        : columnId === 'points'
          ? r.points
          : r.values?.[columnId];
  const totals = new Map<string, number>();
  if (column.mode === 'sum') {
    for (const s of schema.statuses) totals.set(s, 0);
    for (const r of rows) {
      const v = value(r);
      if (typeof v === 'number') totals.set(r.status, (totals.get(r.status) ?? 0) + v);
    }
  } else {
    if (columnId === 'status') for (const s of schema.statuses) totals.set(s, 0);
    const field = schema.fields.find(f => f.id === columnId);
    if (field?.type === 'select') for (const o of field.options ?? []) totals.set(o, 0);
    for (const r of rows) {
      const v = value(r),
        key =
          v === undefined || v === ''
            ? columnId === 'assignee'
              ? 'Unassigned'
              : 'Empty'
            : typeof v === 'boolean'
              ? v
                ? 'Yes'
                : 'No'
              : String(v).slice(0, CHART_NAME_MAX);
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
  }
  let entries = [...totals.entries()];
  if (entries.length > CHART_LABELS_MAX) {
    const rest = entries.slice(CHART_LABELS_MAX - 1).reduce((n, [, v]) => n + v, 0);
    entries = [...entries.slice(0, CHART_LABELS_MAX - 1), ['Other', rest]];
  }
  if (!entries.length) entries = [['No records', 0]];
  const data: ChartData = {
    chart: 'bar',
    legend: false,
    labels: entries.map(([k]) => k),
    series: [
      {
        name: column.mode === 'sum' ? `Total ${column.name}` : 'Records',
        values: entries.map(([, v]) => v),
        color: chartPalette[0],
      },
    ],
  };
  validateChart(data);
  return data;
}

// ---- Geometry -----------------------------------------------------------------------------------------

/** Rounded axis maximum and tick values covering 0..max (and negative minimum when present). */
export function chartScale(min: number, max: number, ticks = 4): { lo: number; hi: number; step: number } {
  const lo0 = Math.min(0, min),
    hi0 = Math.max(0, max);
  const span = hi0 - lo0 || 1,
    raw = span / ticks,
    mag = 10 ** Math.floor(Math.log10(raw)),
    step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  return { lo: Math.floor(lo0 / step) * step, hi: Math.ceil(hi0 / step) * step || step, step };
}
export type ChartBox = { x: number; y: number; w: number; h: number };
export type BarRect = ChartBox & { series: number; index: number; value: number };
/** Bar rectangles (grouped by category) inside the plot box. */
export function barRects(d: ChartData, plot: ChartBox): BarRect[] {
  const all = d.series.flatMap(s => s.values),
    { lo, hi } = chartScale(Math.min(...all), Math.max(...all)),
    y = (v: number) => plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h,
    band = plot.w / d.labels.length,
    gap = band * 0.2,
    bw = (band - gap) / d.series.length;
  return d.series.flatMap((s, si) =>
    s.values.map((v, index) => {
      const top = Math.min(y(v), y(0)),
        bottom = Math.max(y(v), y(0));
      return {
        x: plot.x + index * band + gap / 2 + si * bw,
        y: top,
        w: bw,
        h: bottom - top,
        series: si,
        index,
        value: v,
      };
    }),
  );
}
/** Line chart points per series (category centres). */
export function linePoints(d: ChartData, plot: ChartBox): { x: number; y: number }[][] {
  const all = d.series.flatMap(s => s.values),
    { lo, hi } = chartScale(Math.min(...all), Math.max(...all)),
    band = plot.w / d.labels.length;
  return d.series.map(s =>
    s.values.map((v, k) => ({ x: plot.x + band * (k + 0.5), y: plot.y + plot.h - ((v - lo) / (hi - lo)) * plot.h })),
  );
}
export type PieSlice = { index: number; value: number; start: number; end: number; path: string; share: number };
/** Pie slices of the first series (negative values count as 0), angles in radians from 12 o'clock. */
export function pieSlices(d: ChartData, cx: number, cy: number, r: number): PieSlice[] {
  const values = d.series[0].values.map(v => Math.max(0, v)),
    total = values.reduce((a, b) => a + b, 0);
  if (!total) return [];
  let angle = 0;
  const point = (a: number) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  return values.flatMap((value, index) => {
    if (!value) return [];
    const start = angle,
      end = (angle += (value / total) * Math.PI * 2),
      share = value / total;
    const path =
      share >= 0.9999
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
        : `M ${cx} ${cy} L ${point(start)} A ${r} ${r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(end)} Z`;
    return [{ index, value, start, end, path, share }];
  });
}
/** Short number text for axis ticks and labels (1.2k, 3.4M). */
export function shortNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`;
  return String(+v.toFixed(2));
}
/** Plain-text description of a chart for screen readers and search. */
export function chartSummary(title: string, d: ChartData): string {
  const parts = d.series.map(
    s => `${s.name}: ${d.labels.map((l, k) => `${l} ${shortNumber(s.values[k])}`).join(', ')}`,
  );
  return `${chartTypeLabels[d.chart]} chart${title ? ` ${title}` : ''}. ${parts.join('. ')}`;
}

const dataOf = (i: Item) => (i.data ?? {}) as ChartData;
export const chartSpecs: WidgetSpec[] = [
  {
    kind: 'chart',
    label: 'Chart',
    description: 'Show numbers as a bar, line or pie chart',
    category: 'Essentials',
    size: [520, 360],
    init: i => ({ ...i, fill: '#ffffff', text: 'Chart', data: defaultChart() }),
    validate: i => validateChart(dataOf(i)),
    searchText: i => {
      const d = dataOf(i);
      return [...(d.labels ?? []), ...(d.series ?? []).map(s => s.name)].join(' ');
    },
  },
];
