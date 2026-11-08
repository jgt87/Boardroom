// Matrix, poll, spinner and scale views and editors (items 43-44).
import { useMemo, useRef, useState } from 'react';
import { X, Plus, Minus, RotateCcw, Shuffle, Eraser, Users } from 'lucide-react';
import type { Item } from './model';
import type { WidgetAction, WidgetCtx } from './widget-types';
import { matrixContents, votePoll, pollResults, pollTotal, resetPoll, setPollHidden } from './facilitation-widgets';
import { spin, removePicked, fillFromPeople } from './facilitation-widgets';
import {
  scaleStatements,
  scaleStats,
  tallyScale,
  normalizeScale,
  resetScale,
  rangeScale,
} from './facilitation-widgets';
import { SCALE_BUTTON_STEPS, SCALE_STATEMENTS_MAX } from './facilitation-widgets';
import type { PollData, SpinnerData, ScaleData, ScaleStatement, MatrixData } from './facilitation-widgets';
import { Dialog, data, setData, stop } from './widget-kit';

// ---- Matrix (43) -----------------------------------------------------------------------------
export function MatrixRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<MatrixData>(item),
    counts = useMemo(() => matrixContents(ctx.board, item.id).map(q => q.length), [ctx.board, item.id]);
  return (
    <div className="w-matrix">
      <div className="w-matrix-title">{item.text}</div>
      <div className="w-matrix-area">
        {d.quadrants.map((q, i) => (
          <div key={i} className={`q q${i}`}>
            <span>{q}</span>
            <small>
              {counts[i]} {counts[i] === 1 ? 'item' : 'items'}
            </small>
          </div>
        ))}
        <span className="axis-y">{d.yLabel} ↑</span>
        <span className="axis-x">{d.xLabel} →</span>
      </div>
    </div>
  );
}
export function MatrixEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [d, setD] = useState<MatrixData>({
      ...data<MatrixData>(item),
      quadrants: [...data<MatrixData>(item).quadrants] as MatrixData['quadrants'],
    }),
    [title, setTitle] = useState(item.text);
  const names = [
    'Top left (high, low)',
    'Top right (high, high)',
    'Bottom left (low, low)',
    'Bottom right (low, high)',
  ];
  return (
    <Dialog
      title="2×2 matrix"
      hint="Objects dropped on the matrix are counted in the quadrant containing their centre."
      onClose={onClose}
      onApply={() => {
        setData(ctx, item.id, d, { text: title.slice(0, 200) });
        onClose();
      }}
    >
      <div className="w-form">
        <label className="span2">
          Title
          <input aria-label="Matrix title" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label>
          Horizontal axis
          <input
            aria-label="Horizontal axis"
            maxLength={80}
            value={d.xLabel}
            onChange={e => setD({ ...d, xLabel: e.target.value })}
          />
        </label>
        <label>
          Vertical axis
          <input
            aria-label="Vertical axis"
            maxLength={80}
            value={d.yLabel}
            onChange={e => setD({ ...d, yLabel: e.target.value })}
          />
        </label>
        {d.quadrants.map((q, i) => (
          <label key={i}>
            {names[i]}
            <input
              aria-label={names[i]}
              maxLength={80}
              value={q}
              onChange={e => {
                const qs = [...d.quadrants] as MatrixData['quadrants'];
                qs[i] = e.target.value;
                setD({ ...d, quadrants: qs });
              }}
            />
          </label>
        ))}
      </div>
    </Dialog>
  );
}

// ---- Poll, spinner, scale (44) ----------------------------------------------------------------
export function PollRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<PollData>(item),
    results = pollResults(d),
    total = pollTotal(d),
    locked = !!item.locked,
    hidden = !!d.resultsHidden;
  return (
    <div className={`w-poll${hidden ? ' results-hidden' : ''}`}>
      <strong>{d.question}</strong>
      <ul>
        {results.map(o => (
          <li key={o.id}>
            <button
              disabled={locked}
              title={`Vote for ${o.label}`}
              onPointerDown={stop}
              onClick={e => {
                e.stopPropagation();
                setData(ctx, item.id, votePoll(d, o.id));
              }}
            >
              {!hidden && <span className="bar" style={{ transform: `scaleX(${o.share})` }} />}
              <span className="label">{o.label}</span>{' '}
              {!hidden && (
                <span className="count">
                  {o.votes}
                  <span className="sr-only"> {o.votes === 1 ? 'vote' : 'votes'}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <small>
        {total} {total === 1 ? 'vote' : 'votes'} · {hidden ? 'results hidden' : 'on this device'}
      </small>
    </div>
  );
}
export function PollEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [d, setD] = useState<PollData>(data<PollData>(item));
  const error =
    d.options.length < 2
      ? 'A poll needs at least two options.'
      : d.options.some(o => !o.label.trim())
        ? 'Give every option a label.'
        : !d.question.trim()
          ? 'Enter a question.'
          : '';
  return (
    <Dialog
      title="Poll"
      hint="Votes are counted on this device only."
      onClose={onClose}
      onApply={() => {
        if (!error) {
          setData(ctx, item.id, d);
          onClose();
        }
      }}
      applyDisabled={!!error}
      error={error}
    >
      <div className="w-form">
        <label className="span2">
          Question
          <input
            aria-label="Poll question"
            maxLength={300}
            value={d.question}
            onChange={e => setD({ ...d, question: e.target.value })}
          />
        </label>
        <ol className="w-options span2">
          {d.options.map((o, i) => (
            <li key={o.id}>
              <input
                aria-label={`Option ${i + 1}`}
                maxLength={120}
                value={o.label}
                onChange={e =>
                  setD({ ...d, options: d.options.map(x => (x.id === o.id ? { ...x, label: e.target.value } : x)) })
                }
              />
              <button
                className="icon-button"
                aria-label={`Remove vote from ${o.label || `option ${i + 1}`}`}
                disabled={!o.votes}
                onClick={() => setD(votePoll(d, o.id, -1))}
              >
                <Minus size={14} />
              </button>
              <span className="count">{o.votes}</span>
              <button
                className="icon-button"
                aria-label={`Add vote to ${o.label || `option ${i + 1}`}`}
                onClick={() => setD(votePoll(d, o.id))}
              >
                <Plus size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete option ${i + 1}`}
                disabled={d.options.length <= 2}
                onClick={() => setD({ ...d, options: d.options.filter(x => x.id !== o.id) })}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
        <label className="check-line span2">
          <input type="checkbox" checked={!!d.resultsHidden} onChange={e => setD(setPollHidden(d, e.target.checked))} />
          Hide results until revealed
        </label>
        <div className="w-row span2">
          <button
            disabled={d.options.length >= 12}
            onClick={() =>
              setD({
                ...d,
                options: [
                  ...d.options,
                  { id: crypto.randomUUID(), label: `Option ${String.fromCharCode(65 + d.options.length)}`, votes: 0 },
                ],
              })
            }
          >
            <Plus size={14} />
            Add option
          </button>
          <button onClick={() => setD(resetPoll(d))}>
            <RotateCcw size={14} />
            Reset votes
          </button>
        </div>
      </div>
    </Dialog>
  );
}
const wheelColors = ['#a8cdff', '#ffd27a', '#a9e8bb', '#f7c5ef', '#d3b7f6', '#ffb879', '#8ce3eb', '#ffa0a7'];
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export function SpinnerRender({ item }: { item: Item }) {
  const d = data<SpinnerData>(item),
    options = d.options.filter(o => o.trim()),
    n = Math.max(1, options.length),
    slice = 360 / n;
  const index = d.result ? options.indexOf(d.result) : -1,
    target = index < 0 ? 0 : -(index * slice + slice / 2);
  const turns = useRef(0),
    last = useRef(d.result);
  if (last.current !== d.result) {
    last.current = d.result;
    turns.current += 1;
  }
  const angle = target - (reducedMotion() ? 0 : turns.current * 1440),
    size = Math.min(item.w, item.h - 54),
    r = size / 2 - 6;
  const arc = (i: number) => {
    const a0 = ((i * slice - 90) * Math.PI) / 180,
      a1 = (((i + 1) * slice - 90) * Math.PI) / 180;
    return n === 1
      ? `M${-r},0 a${r},${r} 0 1 0 ${r * 2},0 a${r},${r} 0 1 0 ${-r * 2},0`
      : `M0,0 L${r * Math.cos(a0)},${r * Math.sin(a0)} A${r},${r} 0 ${slice > 180 ? 1 : 0} 1 ${r * Math.cos(a1)},${r * Math.sin(a1)}Z`;
  };
  return (
    <div className="w-spinner">
      <svg
        width={size}
        height={size}
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        role="img"
        aria-label={`Spinner wheel${d.result ? `, result ${d.result}` : ''}`}
      >
        <g
          className="w-wheel"
          style={{
            transform: `rotate(${angle}deg)`,
            transition: reducedMotion() ? 'none' : 'transform 2.4s cubic-bezier(.12,.75,.18,1)',
          }}
        >
          {options.map((o, i) => {
            const mid = (((i + 0.5) * slice - 90) * Math.PI) / 180;
            return (
              <g key={i}>
                <path d={arc(i)} fill={wheelColors[i % wheelColors.length]} stroke="#fff" strokeWidth="2" />
                <text
                  x={r * 0.6 * Math.cos(mid)}
                  y={r * 0.6 * Math.sin(mid)}
                  fontSize={Math.max(9, Math.min(15, 160 / n))}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#25252c"
                  transform={`rotate(${(i + 0.5) * slice} ${r * 0.6 * Math.cos(mid)} ${r * 0.6 * Math.sin(mid)})`}
                >
                  {o.length > 14 ? o.slice(0, 13) + '…' : o}
                </text>
              </g>
            );
          })}
        </g>
        <path d={`M-9,${-size / 2 + 1} L9,${-size / 2 + 1} L0,${-size / 2 + 20}Z`} fill="#25252c" />
        <circle r="9" fill="#fff" stroke="#25252c" strokeWidth="2" />
      </svg>
      <div className="w-spin-result" aria-live="polite">
        {d.result ? (
          <>
            Result: <strong>{d.result}</strong>
          </>
        ) : (
          'Select the wheel and choose Spin'
        )}
      </div>
    </div>
  );
}
/** Selection-bar actions for a spinner: spin, remove the picked option, fill from People (gap G11). */
export function spinnerActions(item: Item, ctx: WidgetCtx): WidgetAction[] {
  const d = data<SpinnerData>(item),
    attempt = (change: () => SpinnerData) => {
      try {
        setData(ctx, item.id, change());
      } catch (e) {
        ctx.display((e as Error).message);
      }
    };
  return [
    { label: 'Spin', icon: <Shuffle size={16} />, run: () => attempt(() => spin(d)) },
    {
      label: 'Remove pick',
      icon: <Eraser size={16} />,
      disabled: !d.result || d.options.length < 2,
      run: () => attempt(() => removePicked(d)),
    },
    { label: 'Fill from People', icon: <Users size={16} />, run: () => attempt(() => fillFromPeople(ctx.board)) },
  ];
}
export function SpinnerEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [text, setText] = useState(data<SpinnerData>(item).options.join('\n')),
    options = text
      .split('\n')
      .map(o => o.trim())
      .filter(Boolean);
  const error = !options.length
    ? 'Add at least one option.'
    : options.length > 24
      ? 'Use up to 24 options.'
      : options.some(o => o.length > 60)
        ? 'Keep options under 60 characters.'
        : '';
  return (
    <Dialog
      title="Spinner wheel"
      hint="One option per line."
      onClose={onClose}
      onApply={() => {
        if (!error) {
          setData(ctx, item.id, { options });
          onClose();
        }
      }}
      applyDisabled={!!error}
      error={error}
    >
      <div className="w-form">
        <label className="span2">
          Options
          <textarea aria-label="Spinner options" rows={8} value={text} onChange={e => setText(e.target.value)} />
          <small>{options.length} options</small>
        </label>
      </div>
    </Dialog>
  );
}
/** Height that fits `n` statements; the editor grows a scale to it. */
export const scaleHeight = (n: number) => 76 + n * 74;
function ScaleRow({
  d,
  s,
  locked,
  onTally,
}: {
  d: ScaleData;
  s: ScaleStatement;
  locked: boolean;
  onTally: (value: number) => void;
}) {
  const stats = scaleStats(s, d.min),
    steps = Array.from({ length: d.max - d.min + 1 }, (_, k) => d.min + k),
    peak = Math.max(0, ...stats.shares),
    [pick, setPick] = useState(Math.round((d.min + d.max) / 2)),
    name = s.text || d.label || 'Statement';
  return (
    <li className="w-scale-row">
      <div className="w-scale-head">
        <span className="w-scale-text">{s.text}</span>
        <span className="w-scale-avg" aria-label={`Average for ${name}`}>
          {stats.average === null ? 'No responses' : `Avg ${stats.average}`}
          <small>
            {' '}
            · {stats.count} {stats.count === 1 ? 'response' : 'responses'}
          </small>
        </span>
      </div>
      {steps.length <= SCALE_BUTTON_STEPS ? (
        <div className="w-scale-steps" role="group" aria-label={`Rate ${name}`}>
          {steps.map((v, k) => (
            <button
              key={v}
              className="w-scale-step"
              disabled={locked}
              aria-label={`Add a ${v} for ${name}`}
              title={`${s.tallies[k] ?? 0} at ${v}`}
              onPointerDown={stop}
              onClick={e => {
                e.stopPropagation();
                onTally(v);
              }}
            >
              <span
                className="w-scale-dist"
                aria-hidden="true"
                style={{ transform: `scaleY(${peak ? (stats.shares[k] ?? 0) / peak : 0})` }}
              />
              <span className="w-scale-value">{v}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="w-scale-steps wide" role="group" aria-label={`Rate ${name}`} onPointerDown={stop}>
          <input
            type="range"
            min={d.min}
            max={d.max}
            value={pick}
            aria-label={`Value for ${name}`}
            onChange={e => setPick(Number(e.target.value))}
          />
          <button
            className="w-scale-add"
            disabled={locked}
            onClick={e => {
              e.stopPropagation();
              onTally(pick);
            }}
          >
            Add {pick}
          </button>
        </div>
      )}
      <div className="w-scale-bar" aria-hidden="true">
        {stats.shares.map((share, k) =>
          share ? (
            <span
              key={k}
              style={{ width: `${share * 100}%`, opacity: 0.35 + (0.65 * k) / Math.max(1, steps.length - 1) }}
            />
          ) : null,
        )}
      </div>
    </li>
  );
}
export function ScaleRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<ScaleData>(item),
    statements = scaleStatements(d),
    locked = !!item.locked;
  return (
    <div className="w-scale">
      <strong>{d.label}</strong>
      <ol className="w-scale-list">
        {statements.map(s => (
          <ScaleRow
            key={s.id}
            d={d}
            s={s}
            locked={locked}
            onTally={v => {
              try {
                setData(ctx, item.id, tallyScale(d, s.id, v));
              } catch (e) {
                ctx.display((e as Error).message);
              }
            }}
          />
        ))}
      </ol>
      <div className="w-scale-ends">
        <span>
          {d.min} {d.leftLabel}
        </span>
        <span>
          {d.rightLabel} {d.max}
        </span>
      </div>
    </div>
  );
}
export function ScaleEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [d, setD] = useState<ScaleData>(() => normalizeScale(data<ScaleData>(item))),
    [min, setMin] = useState(d.min),
    [max, setMax] = useState(d.max);
  const statements = d.statements ?? [];
  const error =
    !Number.isInteger(min) || !Number.isInteger(max) || min >= max
      ? 'Minimum must be below maximum.'
      : max - min > 100
        ? 'Use at most 100 steps.'
        : !statements.length
          ? 'Add at least one statement.'
          : statements.some(s => !s.text.trim())
            ? 'Give every statement some text.'
            : '';
  const setStatement = (id: string, text: string) =>
    setD({ ...d, statements: statements.map(s => (s.id === id ? { ...s, text } : s)) });
  return (
    <Dialog
      title="Alignment scale"
      hint="Click a step on the board to add a response. Responses are counted on this device only."
      onClose={onClose}
      onApply={() => {
        if (error) return;
        const next = rangeScale(d, min, max);
        setData(ctx, item.id, next, { h: Math.max(item.h, scaleHeight(next.statements?.length ?? 1)) });
        onClose();
      }}
      applyDisabled={!!error}
      error={error}
    >
      <div className="w-form">
        <label className="span2">
          Title
          <input
            aria-label="Scale question"
            maxLength={200}
            value={d.label}
            onChange={e => setD({ ...d, label: e.target.value })}
          />
        </label>
        <ol className="w-options span2" aria-label="Statements">
          {statements.map((s, i) => (
            <li key={s.id}>
              <input
                aria-label={`Statement ${i + 1}`}
                maxLength={200}
                value={s.text}
                onChange={e => setStatement(s.id, e.target.value)}
              />
              <span className="count" title="Responses">
                {scaleStats(s, d.min).count}
              </span>
              <button
                className="icon-button"
                aria-label={`Delete statement ${i + 1}`}
                disabled={statements.length <= 1}
                onClick={() => setD({ ...d, statements: statements.filter(x => x.id !== s.id) })}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ol>
        <div className="w-row span2">
          <button
            disabled={statements.length >= SCALE_STATEMENTS_MAX}
            onClick={() =>
              setD({
                ...d,
                statements: [
                  ...statements,
                  {
                    id: crypto.randomUUID(),
                    text: `Statement ${statements.length + 1}`,
                    tallies: new Array<number>(d.max - d.min + 1).fill(0),
                  },
                ],
              })
            }
          >
            <Plus size={14} />
            Add statement
          </button>
          <button onClick={() => setD(resetScale(d))}>
            <RotateCcw size={14} />
            Reset responses
          </button>
        </div>
        <label>
          Low label
          <input
            aria-label="Low end label"
            maxLength={60}
            value={d.leftLabel}
            onChange={e => setD({ ...d, leftLabel: e.target.value })}
          />
        </label>
        <label>
          High label
          <input
            aria-label="High end label"
            maxLength={60}
            value={d.rightLabel}
            onChange={e => setD({ ...d, rightLabel: e.target.value })}
          />
        </label>
        <label>
          Minimum
          <input
            aria-label="Scale minimum"
            type="number"
            value={min}
            onChange={e => setMin(Math.round(Number(e.target.value)))}
          />
        </label>
        <label>
          Maximum
          <input
            aria-label="Scale maximum"
            type="number"
            value={max}
            onChange={e => setMax(Math.round(Number(e.target.value)))}
          />
        </label>
        <small className="span2">Changing the range keeps responses that are still on the scale.</small>
      </div>
    </Dialog>
  );
}
