// Matrix, poll, spinner and scale views and editors (items 43-44).
import { useMemo, useRef, useState } from 'react';
import { X, Plus, Minus, RotateCcw } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { matrixContents, votePoll, pollResults, pollTotal, resetPoll, clampScale } from './facilitation-widgets';
import type { PollData, SpinnerData, ScaleData, MatrixData } from './facilitation-widgets';
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
    locked = !!item.locked;
  return (
    <div className="w-poll">
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
              <span className="bar" style={{ width: `${o.share * 100}%` }} />
              <span className="label">{o.label}</span>{' '}
              <span className="count">
                {o.votes}
                <span className="sr-only"> {o.votes === 1 ? 'vote' : 'votes'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <small>
        {total} {total === 1 ? 'vote' : 'votes'} · on this device
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
export function ScaleRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<ScaleData>(item),
    steps = Array.from({ length: d.max - d.min + 1 }, (_, i) => d.min + i),
    set = (v: number) => {
      if (!item.locked && v !== d.value) setData(ctx, item.id, clampScale(d, v));
    };
  return (
    <div className="w-scale">
      <strong>{d.label}</strong>
      <div
        className="w-scale-track"
        role="slider"
        tabIndex={0}
        aria-label={d.label}
        aria-valuemin={d.min}
        aria-valuemax={d.max}
        aria-valuenow={d.value}
        aria-valuetext={`${d.value} of ${d.max}`}
        onPointerDown={stop}
        onKeyDown={e => {
          const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
          if (step) {
            e.preventDefault();
            e.stopPropagation();
            set(d.value + step);
          } else if (e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            e.stopPropagation();
            set(e.key === 'Home' ? d.min : d.max);
          }
        }}
      >
        {steps.length <= 21 &&
          steps.map(v => (
            <span
              key={v}
              role="presentation"
              className={`w-scale-step ${v === d.value ? 'on' : ''}`}
              onClick={e => {
                e.stopPropagation();
                set(v);
              }}
            >
              {v}
            </span>
          ))}
        {steps.length > 21 && (
          <input
            type="range"
            min={d.min}
            max={d.max}
            value={d.value}
            aria-hidden="true"
            tabIndex={-1}
            onChange={e => set(Number(e.target.value))}
          />
        )}
      </div>
      <div className="w-scale-ends">
        <span>{d.leftLabel}</span>
        <span>{d.rightLabel}</span>
      </div>
    </div>
  );
}
export function ScaleEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [d, setD] = useState<ScaleData>(data<ScaleData>(item));
  const error =
    !Number.isInteger(d.min) || !Number.isInteger(d.max) || d.min >= d.max
      ? 'Minimum must be below maximum.'
      : d.max - d.min > 100
        ? 'Use at most 100 steps.'
        : '';
  return (
    <Dialog
      title="Alignment scale"
      onClose={onClose}
      onApply={() => {
        if (!error) {
          setData(ctx, item.id, clampScale(d, d.value));
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
            aria-label="Scale question"
            maxLength={200}
            value={d.label}
            onChange={e => setD({ ...d, label: e.target.value })}
          />
        </label>
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
            value={d.min}
            onChange={e => setD({ ...d, min: Math.round(Number(e.target.value)) })}
          />
        </label>
        <label>
          Maximum
          <input
            aria-label="Scale maximum"
            type="number"
            value={d.max}
            onChange={e => setD({ ...d, max: Math.round(Number(e.target.value)) })}
          />
        </label>
        <label className="span2">
          Value: {d.value}
          <input
            aria-label="Scale value"
            type="range"
            min={d.min}
            max={Math.max(d.min, d.max)}
            value={Math.min(Math.max(d.value, d.min), d.max)}
            onChange={e => setD({ ...d, value: Number(e.target.value) })}
          />
        </label>
      </div>
    </Dialog>
  );
}
