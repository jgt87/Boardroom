// Chart widget view (gap list I4): SVG bar, line and pie charts with a title and legend, a data grid editor
// and selection-bar actions. Pure data handling lives in specs-charts.ts.
import { useState } from 'react';
import { BarChart3, LineChart, PieChart } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx, WidgetView } from './widget-types';
import { Dialog, data, setData, patchItem } from './widget-kit';
import { parseDelimited } from './smart-paste';
import {
  barRects,
  chartFromGrid,
  chartScale,
  chartSummary,
  chartToGrid,
  chartTypeLabels,
  chartTypes,
  linePoints,
  pieSlices,
  shortNumber,
  CHART_LABELS_MAX,
  CHART_SERIES_MAX,
} from './specs-charts';
import type { ChartData, ChartType } from './specs-charts';
import './formats-gaps.css';

const clip = (s: string, room: number) => {
  const max = Math.max(1, Math.floor(room / 7));
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
};

export function ChartRender({ item }: { item: Item }) {
  const d = data<ChartData>(item),
    pad = 16,
    titleH = item.text.trim() ? 30 : 0,
    pie = d.chart === 'pie',
    legendItems = pie
      ? d.labels.map((l, k) => ({ name: l, color: pieColor(d, k) }))
      : d.series.map(s => ({ name: s.name, color: s.color })),
    legendH = d.legend ? 26 : 0,
    plot = {
      x: pad + (pie ? 0 : 44),
      y: pad + titleH,
      w: Math.max(10, item.w - pad * 2 - (pie ? 0 : 44)),
      h: Math.max(10, item.h - pad * 2 - titleH - legendH - (pie ? 0 : 22)),
    };
  const all = d.series.flatMap(s => s.values),
    scale = chartScale(Math.min(...all), Math.max(...all)),
    y = (v: number) => plot.y + plot.h - ((v - scale.lo) / (scale.hi - scale.lo)) * plot.h,
    ticks: number[] = [];
  for (let v = scale.lo; v <= scale.hi + scale.step / 2 && ticks.length < 12; v += scale.step) ticks.push(v);
  const band = plot.w / d.labels.length;
  return (
    <g className="chart-widget" data-chart={d.chart}>
      <title>{chartSummary(item.text, d)}</title>
      <rect width={item.w} height={item.h} rx={8} fill={item.fill} stroke="#d4d4d8" />
      {titleH > 0 && (
        <text x={pad} y={pad + 18} fontSize={18} fontWeight={600} fill="#1f1f23">
          {clip(item.text, item.w - pad * 2)}
        </text>
      )}
      {pie ? (
        (() => {
          const r = Math.max(4, Math.min(plot.w, plot.h) / 2),
            cx = plot.x + plot.w / 2,
            cy = plot.y + plot.h / 2,
            slices = pieSlices(d, cx, cy, r);
          return slices.length ? (
            slices.map(s => (
              <path key={s.index} d={s.path} fill={pieColor(d, s.index)} stroke="#ffffff" strokeWidth={1.5}>
                <title>{`${d.labels[s.index]}: ${shortNumber(s.value)} (${Math.round(s.share * 100)}%)`}</title>
              </path>
            ))
          ) : (
            <text x={cx} y={cy} textAnchor="middle" fontSize={13} fill="#52525b">
              No positive values
            </text>
          );
        })()
      ) : (
        <>
          {ticks.map(v => (
            <g key={v}>
              <line x1={plot.x} x2={plot.x + plot.w} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#a1a1aa' : '#e4e4e7'} />
              <text x={plot.x - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#52525b">
                {shortNumber(v)}
              </text>
            </g>
          ))}
          {d.labels.map((l, k) => (
            <text
              key={k}
              x={plot.x + band * (k + 0.5)}
              y={plot.y + plot.h + 16}
              textAnchor="middle"
              fontSize={11}
              fill="#3f3f46"
            >
              {clip(l, band)}
            </text>
          ))}
          {d.chart === 'bar'
            ? barRects(d, plot).map(b => (
                <rect
                  key={`${b.series}-${b.index}`}
                  x={b.x}
                  y={b.y}
                  width={Math.max(0, b.w - 1)}
                  height={b.h}
                  rx={2}
                  fill={d.series[b.series].color}
                >
                  <title>{`${d.series[b.series].name}, ${d.labels[b.index]}: ${shortNumber(b.value)}`}</title>
                </rect>
              ))
            : linePoints(d, plot).map((points, si) => (
                <g key={si}>
                  <polyline
                    points={points.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={d.series[si].color}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                  />
                  {points.map((p, k) => (
                    <circle key={k} cx={p.x} cy={p.y} r={3.5} fill={d.series[si].color}>
                      <title>{`${d.series[si].name}, ${d.labels[k]}: ${shortNumber(d.series[si].values[k])}`}</title>
                    </circle>
                  ))}
                </g>
              ))}
        </>
      )}
      {d.legend && (
        <g transform={`translate(${pad} ${item.h - pad - 8})`}>
          {(() => {
            let x = 0;
            return legendItems.slice(0, 12).map((l, k) => {
              const label = clip(l.name, 140),
                at = x;
              x += 22 + label.length * 7;
              if (at > item.w - pad * 2 - 20) return null;
              return (
                <g key={k} transform={`translate(${at} 0)`}>
                  <rect y={-9} width={10} height={10} rx={2} fill={l.color} />
                  <text x={14} fontSize={11} fill="#3f3f46">
                    {label}
                  </text>
                </g>
              );
            });
          })()}
        </g>
      )}
    </g>
  );
}
/** Pie slices use the series colour for the first slice and the palette for the rest. */
function pieColor(d: ChartData, index: number) {
  const palette = ['#4262ff', '#f2994a', '#2c9f5b', '#d64576', '#8a5cf6', '#1aa3b8', '#a1452f', '#71717a'];
  return index === 0 ? d.series[0].color : palette[index % palette.length];
}

export function ChartEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const start = data<ChartData>(item),
    [title, setTitle] = useState(item.text),
    [chart, setChart] = useState<ChartType>(start.chart),
    [legend, setLegend] = useState(start.legend),
    [grid, setGrid] = useState<string[][]>(() => chartToGrid(start)),
    [paste, setPaste] = useState(''),
    [error, setError] = useState('');
  const rows = grid.length - 1,
    cols = grid[0].length - 1;
  const setCell = (r: number, c: number, v: string) =>
    setGrid(g => g.map((row, k) => (k === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  const apply = () => {
    try {
      const made = chartFromGrid(grid, { chart, legend, series: start.series });
      setData(ctx, item.id, made.data, { text: title.slice(0, 200) });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog
      title="Chart"
      hint="Rows are categories and columns are data series. Paste cells from a spreadsheet to replace the data."
      onClose={onClose}
      onApply={apply}
      error={error}
      wide
    >
      <div className="w-form">
        <label className="span2">
          Title
          <input aria-label="Chart title" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label>
          Chart type
          <select aria-label="Chart type" value={chart} onChange={e => setChart(e.target.value as ChartType)}>
            {chartTypes.map(t => (
              <option key={t} value={t}>
                {chartTypeLabels[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="chart-legend-toggle">
          <input type="checkbox" checked={legend} onChange={e => setLegend(e.target.checked)} />
          Show legend
        </label>
      </div>
      <div className="chart-grid-wrap">
        <table className="chart-grid">
          <caption>Chart data</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              {grid[0].slice(1).map((name, c) => (
                <th scope="col" key={c}>
                  <input
                    aria-label={`Series ${c + 1} name`}
                    maxLength={80}
                    value={name}
                    onChange={e => setCell(0, c + 1, e.target.value)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.slice(1).map((row, r) => (
              <tr key={r}>
                <th scope="row">
                  <input
                    aria-label={`Category ${r + 1} label`}
                    maxLength={80}
                    value={row[0]}
                    onChange={e => setCell(r + 1, 0, e.target.value)}
                  />
                </th>
                {row.slice(1).map((v, c) => (
                  <td key={c}>
                    <input
                      aria-label={`${grid[0][c + 1] || `Series ${c + 1}`}, ${row[0] || `category ${r + 1}`} value`}
                      inputMode="decimal"
                      maxLength={24}
                      value={v}
                      onChange={e => setCell(r + 1, c + 1, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="chart-grid-actions">
        <button
          disabled={rows >= CHART_LABELS_MAX}
          onClick={() => setGrid(g => [...g, [`Item ${g.length}`, ...Array(cols).fill('0')]])}
        >
          Add category
        </button>
        <button disabled={rows <= 1} onClick={() => setGrid(g => g.slice(0, -1))}>
          Remove last category
        </button>
        <button
          disabled={cols >= CHART_SERIES_MAX}
          onClick={() => setGrid(g => g.map((row, k) => [...row, k === 0 ? `Series ${cols + 1}` : '0']))}
        >
          Add series
        </button>
        <button disabled={cols <= 1} onClick={() => setGrid(g => g.map(row => row.slice(0, -1)))}>
          Remove last series
        </button>
      </div>
      <div className="w-form">
        <label className="span2">
          Paste spreadsheet cells (header row first)
          <textarea
            aria-label="Paste spreadsheet cells"
            rows={3}
            value={paste}
            onChange={e => setPaste(e.target.value)}
          />
        </label>
        <button
          className="span2"
          disabled={!paste.trim()}
          onClick={() => {
            try {
              const made = chartFromGrid(parseDelimited(paste), { chart, legend, series: start.series });
              setGrid(chartToGrid(made.data));
              setPaste('');
              setError(
                made.truncated
                  ? `Only the first ${CHART_LABELS_MAX} rows and ${CHART_SERIES_MAX} series were used.`
                  : '',
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Use pasted cells
        </button>
      </div>
    </Dialog>
  );
}

const typeIcons = { bar: BarChart3, line: LineChart, pie: PieChart };
export const chartViews: WidgetView[] = [
  {
    kind: 'chart',
    mode: 'svg',
    Render: ChartRender,
    Editor: ChartEditor,
    actions: (item, ctx) => {
      const d = data<ChartData>(item),
        next = chartTypes[(chartTypes.indexOf(d.chart) + 1) % chartTypes.length],
        Icon = typeIcons[next];
      return [
        {
          label: `${chartTypeLabels[d.chart]} chart (switch to ${chartTypeLabels[next].toLowerCase()})`,
          icon: <Icon size={17} />,
          disabled: !!item.locked,
          run: () => patchItem(ctx, item.id, i => ({ ...i, data: { ...i.data, chart: next } })),
        },
        {
          label: d.legend ? 'Hide legend' : 'Show legend',
          disabled: !!item.locked,
          run: () => patchItem(ctx, item.id, i => ({ ...i, data: { ...i.data, legend: !d.legend } })),
        },
      ];
    },
  },
];
