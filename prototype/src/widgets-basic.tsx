// Views and editors for essential and facilitation widgets (items 21–23, 27–29, 43–44).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Minus,
  Merge as MergeIcon,
  Split,
  RotateCcw,
  Repeat2,
  Shuffle,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import type { Item } from './model';
import type { WidgetView, WidgetCtx } from './widget-types';
import { stampKinds } from './specs-basic';
import type { StampKind } from './specs-basic';
import {
  addRow,
  addColumn,
  removeRow,
  removeColumn,
  mergeCells,
  unmergeCell,
  setCell,
  setCellColor,
  setCellStyle,
  cellStyle,
  mergeAt,
  isCovered,
  GRID_MAX,
} from './grid';
import type { GridData } from './grid';
import { qrMatrix, qrPath, QR_MAX } from './qr';
import {
  cardStatuses,
  tshirtSizes,
  isIsoDate,
  matrixContents,
  votePoll,
  pollResults,
  pollTotal,
  resetPoll,
  spin,
  clampScale,
} from './facilitation-widgets';
import type { CardData, PollData, SpinnerData, ScaleData, MatrixData } from './facilitation-widgets';
import './widgets-basic.css';

const data = <T,>(i: Item) => (i.data ?? {}) as T;
const patchItem = (ctx: WidgetCtx, id: string, change: (i: Item) => Item) =>
  ctx.update(b => ({ ...b, items: b.items.map(i => (i.id === id ? change(i) : i)) }));
const setData = (ctx: WidgetCtx, id: string, d: Record<string, any>, extra: Partial<Item> = {}) =>
  patchItem(ctx, id, i => ({ ...i, ...extra, data: d }));
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Shared focus dialog in the existing format-editor vocabulary. */
function Dialog({
  title,
  hint,
  onClose,
  onApply,
  applyDisabled,
  error,
  wide,
  children,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  onApply: () => void;
  applyDisabled?: boolean;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    (
      box.current?.querySelector<HTMLElement>('input,textarea,select,[tabindex="0"]') ??
      box.current?.querySelector<HTMLElement>('button')
    )?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !applyDisabled) {
          e.preventDefault();
          onApply();
        }
      }}
      onPointerDown={stop}
    >
      <div
        ref={box}
        className={`format-editor widget-editor ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {hint && <p>{hint}</p>}
          </div>
          <button className="icon-button" aria-label={`Cancel ${title.toLowerCase()}`} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="widget-editor-body">{children}</div>
        {error && (
          <p className="format-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span>Ctrl+Enter applies · Esc cancels</span>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={applyDisabled} onClick={onApply}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---- Card (21) + estimates (43) -------------------------------------------------------------
const statusColor: Record<string, string> = { 'Not started': '#8a8a94', 'In progress': '#e2a01b', Complete: '#2c9f5b' };
function CardRender({ item }: { item: Item }) {
  const d = data<CardData>(item),
    overdue = d.due && d.status !== 'Complete' && d.due < new Date().toISOString().slice(0, 10);
  return (
    <div className="w-card" style={{ borderLeftColor: item.fill }}>
      <div className="w-card-top">
        <span className="w-status" style={{ background: statusColor[d.status] }}>
          {d.status}
        </span>
        {(d.points !== undefined || d.size) && (
          <span className="w-estimate" title="Estimate">
            {[d.points !== undefined ? `${d.points} pt` : '', d.size ?? ''].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      <strong className="w-card-title">{item.text || 'Untitled card'}</strong>
      {d.description && <p className="w-card-desc">{d.description}</p>}
      <div className="w-card-meta">
        {d.assignee && (
          <span className="w-avatar" title={d.assignee}>
            {d.assignee
              .trim()
              .split(/\s+/)
              .map(p => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
        )}
        {d.due && <span className={overdue ? 'overdue' : ''}>Due {d.due}</span>}
        {item.tags?.map(t => (
          <span key={t} className="w-tag">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
function CardEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [title, setTitle] = useState(item.text),
    [d, setD] = useState<CardData>({ ...data<CardData>(item) }),
    [tags, setTags] = useState(item.tags?.join(', ') ?? ''),
    [points, setPoints] = useState(d.points === undefined ? '' : String(d.points));
  const tagList = [
    ...new Set(
      tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    ),
  ];
  const error =
    d.due && !isIsoDate(d.due)
      ? 'Enter a valid due date.'
      : points && !(Number(points) >= 0 && Number(points) <= 1000)
        ? 'Story points must be between 0 and 1,000.'
        : tagList.length > 10 || tagList.some(t => t.length > 32)
          ? 'Use up to 10 tags of at most 32 characters.'
          : '';
  const apply = () => {
    if (error) return;
    const next: CardData = { ...d };
    if (points === '') delete next.points;
    else next.points = Number(points);
    if (!next.size) delete next.size;
    setData(ctx, item.id, next, { text: title.slice(0, 6000), tags: tagList.length ? tagList : undefined });
    onClose();
  };
  return (
    <Dialog
      title="Card details"
      hint="Status matches Table, Kanban and Timeline records."
      onClose={onClose}
      onApply={apply}
      applyDisabled={!!error}
      error={error}
    >
      <div className="w-form">
        <label className="span2">
          Title
          <input aria-label="Card title" maxLength={6000} value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="span2">
          Description
          <textarea
            aria-label="Card description"
            maxLength={6000}
            value={d.description}
            onChange={e => setD({ ...d, description: e.target.value })}
          />
        </label>
        <label>
          Assignee
          <input
            aria-label="Card assignee"
            maxLength={200}
            value={d.assignee}
            onChange={e => setD({ ...d, assignee: e.target.value })}
          />
        </label>
        <label>
          Due date
          <input
            aria-label="Card due date"
            type="date"
            value={d.due}
            onChange={e => setD({ ...d, due: e.target.value })}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Card status"
            value={d.status}
            onChange={e => setD({ ...d, status: e.target.value as CardData['status'] })}
          >
            {cardStatuses.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Tags
          <input
            aria-label="Card tags"
            placeholder="Design, Urgent"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />
        </label>
        <label>
          Story points
          <input
            aria-label="Story points"
            type="number"
            min={0}
            max={1000}
            step={0.5}
            value={points}
            onChange={e => setPoints(e.target.value)}
          />
        </label>
        <label>
          T-shirt size
          <select
            aria-label="T-shirt size"
            value={d.size ?? ''}
            onChange={e => setD({ ...d, size: (e.target.value || undefined) as CardData['size'] })}
          >
            <option value="">None</option>
            {tshirtSizes.map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
    </Dialog>
  );
}

// ---- Flip card (22) --------------------------------------------------------------------------
function FlipRender({ item }: { item: Item }) {
  const d = data<{ back: string; flipped: boolean }>(item),
    text = d.flipped ? d.back : item.text;
  return (
    <div
      className={`w-flip ${d.flipped ? 'back' : ''}`}
      style={{ background: d.flipped ? '#ffffff' : item.fill, borderColor: item.fill }}
    >
      <small>{d.flipped ? 'Back' : 'Front'}</small>
      <span>{text || (d.flipped ? 'Add text to the back' : 'Add text to the front')}</span>
    </div>
  );
}
function FlipEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<{ back: string; flipped: boolean }>(item),
    [front, setFront] = useState(item.text),
    [back, setBack] = useState(d.back);
  return (
    <Dialog
      title="Flip card"
      hint="Each face is edited independently."
      onClose={onClose}
      onApply={() => {
        setData(ctx, item.id, { ...d, back: back.slice(0, 6000) }, { text: front.slice(0, 6000) });
        onClose();
      }}
    >
      <div className="w-form">
        <label className="span2">
          Front
          <textarea aria-label="Front face" maxLength={6000} value={front} onChange={e => setFront(e.target.value)} />
        </label>
        <label className="span2">
          Back
          <textarea aria-label="Back face" maxLength={6000} value={back} onChange={e => setBack(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}

// ---- Grid (23) -------------------------------------------------------------------------------
function GridTable({ g, render }: { g: GridData; render: (r: number, c: number) => React.ReactNode }) {
  return (
    <table className={`w-grid align-${g.align}`}>
      <tbody>
        {g.cells.map((row, r) => (
          <tr key={r}>
            {row.map((_, c) => {
              if (isCovered(g, r, c)) return null;
              const m = mergeAt(g, r, c);
              const st = cellStyle(g, r, c);
              return (
                <td
                  key={c}
                  rowSpan={m?.rs}
                  colSpan={m?.cs}
                  style={{
                    background: g.colors?.[`${r},${c}`],
                    fontWeight: st.bold ? 700 : undefined,
                    fontStyle: st.italic ? 'italic' : undefined,
                    color: st.color,
                    textAlign: st.align,
                  }}
                >
                  {render(r, c)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function GridRender({ item }: { item: Item }) {
  const g = item.data as GridData;
  return (
    <div className="w-grid-wrap">
      <GridTable g={g} render={(r, c) => <span>{g.cells[r][c]}</span>} />
    </div>
  );
}
function GridEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [g, setG] = useState<GridData>(item.data as GridData),
    [cur, setCur] = useState({ r: 0, c: 0 }),
    [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null),
    [error, setError] = useState(''),
    table = useRef<HTMLDivElement>(null);
  const run = (fn: () => GridData) => {
    try {
      setG(fn());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const focusCell = (r: number, c: number) => {
    const m = mergeAt(g, r, c);
    const t = m ? { r: m.r, c: m.c } : { r, c };
    setCur(t);
    requestAnimationFrame(() =>
      table.current?.querySelector<HTMLTextAreaElement>(`[data-cell="${t.r},${t.c}"]`)?.focus(),
    );
  };
  const sel = anchor
    ? {
        r1: Math.min(anchor.r, cur.r),
        c1: Math.min(anchor.c, cur.c),
        r2: Math.max(anchor.r, cur.r),
        c2: Math.max(anchor.c, cur.c),
      }
    : null;
  const inSel = (r: number, c: number) => !!sel && r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2;
  const area = sel ?? { r1: cur.r, c1: cur.c, r2: cur.r, c2: cur.c },
    curStyle = cellStyle(g, cur.r, cur.c);
  const style = (patch: Parameters<typeof setCellStyle>[5]) =>
    run(() => setCellStyle(g, area.r1, area.c1, area.r2, area.c2, patch));
  const key = (e: React.KeyboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    const el = e.currentTarget,
      atStart = el.selectionStart === 0 && el.selectionEnd === 0,
      atEnd = el.selectionStart === el.value.length;
    const m = mergeAt(g, r, c),
      rEnd = m ? m.r + m.rs - 1 : r,
      cEnd = m ? m.c + m.cs - 1 : c;
    let next: [number, number] | null = null;
    if (e.key === 'Tab')
      next = e.shiftKey
        ? c > 0
          ? [r, c - 1]
          : r > 0
            ? [r - 1, g.cols - 1]
            : null
        : cEnd < g.cols - 1
          ? [r, cEnd + 1]
          : r < g.rows - 1
            ? [rEnd + 1, 0]
            : null;
    else if (e.key === 'ArrowUp' && (atStart || e.altKey)) next = r > 0 ? [r - 1, c] : null;
    else if (e.key === 'ArrowDown' && (atEnd || e.altKey)) next = rEnd < g.rows - 1 ? [rEnd + 1, c] : null;
    else if (e.key === 'ArrowLeft' && atStart && e.altKey) next = c > 0 ? [r, c - 1] : null;
    else if (e.key === 'ArrowRight' && atEnd && e.altKey) next = cEnd < g.cols - 1 ? [r, cEnd + 1] : null;
    else return;
    e.preventDefault();
    if (next) {
      if (e.shiftKey && e.key !== 'Tab') setAnchor(a => a ?? { r, c });
      else setAnchor(null);
      focusCell(next[0], next[1]);
    }
  };
  return (
    <Dialog
      wide
      title="Grid"
      hint="Tab moves between cells; Alt + arrows move across text. Shift-click or Shift + Alt + arrows selects a range to merge."
      onClose={onClose}
      onApply={() => {
        setData(ctx, item.id, g);
        onClose();
      }}
      error={error}
    >
      <div className="w-grid-tools">
        <span>
          {g.rows} × {g.cols}
        </span>
        <button disabled={g.rows >= GRID_MAX} onClick={() => run(() => addRow(g, cur.r + 1))}>
          <Plus size={14} />
          Row below
        </button>
        <button disabled={g.cols >= GRID_MAX} onClick={() => run(() => addColumn(g, cur.c + 1))}>
          <Plus size={14} />
          Column right
        </button>
        <button
          disabled={g.rows <= 1}
          onClick={() => {
            run(() => removeRow(g, cur.r));
            setCur({ r: Math.max(0, cur.r - 1), c: cur.c });
            setAnchor(null);
          }}
        >
          <Minus size={14} />
          Row
        </button>
        <button
          disabled={g.cols <= 1}
          onClick={() => {
            run(() => removeColumn(g, cur.c));
            setCur({ r: cur.r, c: Math.max(0, cur.c - 1) });
            setAnchor(null);
          }}
        >
          <Minus size={14} />
          Column
        </button>
        <button
          disabled={!sel}
          onClick={() => {
            run(() => mergeCells(g, sel!.r1, sel!.c1, sel!.r2, sel!.c2));
            setAnchor(null);
            setCur({ r: sel!.r1, c: sel!.c1 });
          }}
        >
          <MergeIcon size={14} />
          Merge
        </button>
        <button disabled={!mergeAt(g, cur.r, cur.c)} onClick={() => run(() => unmergeCell(g, cur.r, cur.c))}>
          <Split size={14} />
          Unmerge
        </button>
        <select
          aria-label="Default text alignment"
          title="Default alignment for cells without their own"
          value={g.align}
          onChange={e => setG({ ...g, align: e.target.value as GridData['align'] })}
        >
          <option value="left">Grid: left</option>
          <option value="center">Grid: center</option>
          <option value="right">Grid: right</option>
        </select>
        <span className="w-grid-styles" role="group" aria-label="Cell style">
          <button
            className={curStyle.bold ? 'active' : ''}
            aria-pressed={!!curStyle.bold}
            aria-label="Bold cells"
            title="Bold"
            onMouseDown={e => e.preventDefault()}
            onClick={() => style({ bold: !curStyle.bold })}
          >
            <Bold size={14} />
          </button>
          <button
            className={curStyle.italic ? 'active' : ''}
            aria-pressed={!!curStyle.italic}
            aria-label="Italic cells"
            title="Italic"
            onMouseDown={e => e.preventDefault()}
            onClick={() => style({ italic: !curStyle.italic })}
          >
            <Italic size={14} />
          </button>
          {(
            [
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
            ] as const
          ).map(([a, Icon]) => (
            <button
              key={a}
              className={curStyle.align === a ? 'active' : ''}
              aria-pressed={curStyle.align === a}
              aria-label={`Align cells ${a}`}
              title={`Align cells ${a} (click again for the grid default)`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => style({ align: curStyle.align === a ? undefined : a })}
            >
              <Icon size={14} />
            </button>
          ))}
          <label className="w-inline">
            Text
            <input
              type="color"
              aria-label="Cell text colour"
              value={curStyle.color ?? '#25252c'}
              onChange={e => style({ color: e.target.value.toLowerCase() === '#25252c' ? undefined : e.target.value })}
            />
          </label>
        </span>
        <label className="w-inline">
          Cell colour
          <input
            type="color"
            aria-label="Cell colour"
            value={g.colors?.[`${cur.r},${cur.c}`] ?? '#ffffff'}
            onChange={e =>
              setG(setCellColor(g, cur.r, cur.c, e.target.value === '#ffffff' ? undefined : e.target.value))
            }
          />
        </label>
      </div>
      <div ref={table} className="w-grid-edit">
        <GridTable
          g={g}
          render={(r, c) => (
            <textarea
              data-cell={`${r},${c}`}
              aria-label={`Row ${r + 1}, column ${c + 1}`}
              className={`${cur.r === r && cur.c === c ? 'current' : ''} ${inSel(r, c) ? 'selected' : ''}`}
              maxLength={2000}
              value={g.cells[r][c]}
              onFocus={() => setCur({ r, c })}
              onMouseDown={e => {
                if (e.shiftKey) {
                  e.preventDefault();
                  setAnchor(a => a ?? cur);
                  setCur({ r, c });
                } else setAnchor(null);
              }}
              onChange={e => setG(setCell(g, r, c, e.target.value))}
              onKeyDown={e => key(e, r, c)}
            />
          )}
        />
      </div>
    </Dialog>
  );
}

// ---- Divider and stamp (27) ------------------------------------------------------------------
function DividerRender({ item }: { item: Item }) {
  const d = data<{ orientation: string; style: string; weight: number }>(item),
    h = d.orientation === 'horizontal';
  const dash =
    d.style === 'dashed'
      ? `${d.weight * 4} ${d.weight * 2.5}`
      : d.style === 'dotted'
        ? `0 ${d.weight * 2.5}`
        : undefined;
  return (
    <>
      <rect width={item.w} height={item.h} fill="transparent" />
      <line
        x1={h ? 0 : item.w / 2}
        y1={h ? item.h / 2 : 0}
        x2={h ? item.w : item.w / 2}
        y2={h ? item.h / 2 : item.h}
        stroke={item.fill}
        strokeWidth={d.weight}
        strokeDasharray={dash}
        strokeLinecap={d.style === 'dotted' ? 'round' : 'butt'}
      />
    </>
  );
}
const stampLabels: Record<StampKind, string> = {
  check: 'Check',
  cross: 'Cross',
  star: 'Star',
  thumbsup: 'Thumbs up',
  question: 'Question',
  heart: 'Heart',
  flag: 'Flag',
  warning: 'Warning',
};
const stampColors: Record<StampKind, string> = {
  check: '#2c9f5b',
  cross: '#d03a45',
  star: '#e2a01b',
  thumbsup: '#4262ff',
  question: '#7a52cc',
  heart: '#e0457b',
  flag: '#e2701b',
  warning: '#d48a00',
};
function StampGlyph({ kind }: { kind: StampKind }) {
  const s = {
    fill: 'none',
    stroke: '#fff',
    strokeWidth: 7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'check':
      return <path d="M30 52 L44 66 L71 36" {...s} />;
    case 'cross':
      return <path d="M34 34 L66 66 M66 34 L34 66" {...s} />;
    case 'star':
      return (
        <path d="M50 24 L57.6 41 L76 42.8 L62 55 L66.2 73 L50 63.5 L33.8 73 L38 55 L24 42.8 L42.4 41Z" fill="#fff" />
      );
    case 'thumbsup':
      return (
        <path
          d="M30 48 h9 v24 h-9z M42 72 V48 l10 -18 c4 0 6 3 5 8 l-3 9 h15 c4 0 6 3 5 7 l-4 14 c-1 3 -3 4 -6 4z"
          fill="#fff"
        />
      );
    case 'question':
      return (
        <>
          <path d="M38 40 c0 -9 6 -14 13 -14 c7 0 13 5 13 12 c0 10 -13 11 -13 21" {...s} />
          <circle cx="51" cy="72" r="4.5" fill="#fff" />
        </>
      );
    case 'heart':
      return (
        <path d="M50 74 C24 57 26 33 40 31 C46 30 49 34 50 38 C51 34 54 30 60 31 C74 33 76 57 50 74Z" fill="#fff" />
      );
    case 'flag':
      return <path d="M35 76 V26 M35 28 H68 L60 39 L68 50 H35" {...s} strokeWidth={6} />;
    case 'warning':
      return (
        <>
          <path d="M50 28 V56" {...s} />
          <circle cx="50" cy="70" r="4.5" fill="#fff" />
        </>
      );
  }
}
function StampRender({ item }: { item: Item }) {
  const kind = data<{ stamp: StampKind }>(item).stamp;
  return (
    <svg width={item.w} height={item.h} viewBox="0 0 100 100" role="img" aria-label={`${stampLabels[kind]} stamp`}>
      <circle cx="50" cy="50" r="46" fill={item.fill} stroke="#ffffff" strokeWidth="4" />
      <StampGlyph kind={kind} />
    </svg>
  );
}
function StampEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [kind, setKind] = useState<StampKind>(data<{ stamp: StampKind }>(item).stamp);
  return (
    <Dialog
      title="Stamp"
      hint="Arrow keys move between stamps."
      onClose={onClose}
      onApply={() => {
        setData(ctx, item.id, { stamp: kind }, { fill: stampColors[kind] });
        onClose();
      }}
    >
      <div
        className="w-stamp-grid"
        role="radiogroup"
        aria-label="Stamp"
        onKeyDown={e => {
          const i = stampKinds.indexOf(kind),
            step = { ArrowRight: 1, ArrowDown: 4, ArrowLeft: -1, ArrowUp: -4 }[e.key];
          if (step) {
            e.preventDefault();
            const n = stampKinds[(i + step + stampKinds.length) % stampKinds.length];
            setKind(n);
            (e.currentTarget.querySelector(`[data-stamp="${n}"]`) as HTMLElement)?.focus();
          }
        }}
      >
        {stampKinds.map(k => (
          <button
            key={k}
            data-stamp={k}
            role="radio"
            aria-checked={k === kind}
            tabIndex={k === kind ? 0 : -1}
            className={k === kind ? 'active' : ''}
            onClick={() => setKind(k)}
          >
            <svg width="44" height="44" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill={stampColors[k]} />
              <StampGlyph kind={k} />
            </svg>
            <span>{stampLabels[k]}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

// ---- Icon (28) -------------------------------------------------------------------------------
type IconMap = Record<
  string,
  React.ComponentType<{ size?: number; color?: string; width?: number; height?: number; strokeWidth?: number }>
>;
let iconCache: IconMap | null = null,
  iconPromise: Promise<IconMap> | null = null;
function useIcons(): IconMap | null {
  const [icons, setIcons] = useState<IconMap | null>(iconCache);
  useEffect(() => {
    if (iconCache) return;
    iconPromise ??= import('lucide-react').then(m => (iconCache = m.icons as unknown as IconMap));
    let live = true;
    iconPromise.then(i => {
      if (live) setIcons(i);
    });
    return () => {
      live = false;
    };
  }, []);
  return icons;
}
function IconRender({ item }: { item: Item }) {
  const icons = useIcons(),
    Icon = icons?.[data<{ name: string }>(item).name];
  return (
    <>
      <rect width={item.w} height={item.h} fill="transparent" />
      {Icon ? (
        <Icon width={item.w} height={item.h} color={item.fill} strokeWidth={1.75} />
      ) : (
        <rect
          x={item.w * 0.2}
          y={item.h * 0.2}
          width={item.w * 0.6}
          height={item.h * 0.6}
          rx="6"
          fill="none"
          stroke="#c5c5ce"
          strokeDasharray="4 3"
        />
      )}
    </>
  );
}
function IconEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const icons = useIcons(),
    [query, setQuery] = useState(''),
    [name, setName] = useState(data<{ name: string }>(item).name),
    [color, setColor] = useState(item.fill),
    list = useRef<HTMLDivElement>(null);
  const names = useMemo(() => {
    if (!icons) return [];
    const q = query
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '');
    return Object.keys(icons)
      .filter(n => !q || n.toLowerCase().includes(q))
      .slice(0, 240);
  }, [icons, query]);
  const move = (e: React.KeyboardEvent) => {
    const cols = 8,
      step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (!step || !names.length) return;
    e.preventDefault();
    const i = Math.max(0, Math.min(names.length - 1, names.indexOf(name) + step));
    setName(names[i]);
    list.current?.querySelector<HTMLElement>(`[data-icon="${names[i]}"]`)?.focus();
  };
  return (
    <Dialog
      wide
      title="Icons"
      hint="Search the bundled icon set; arrow keys move, Enter applies."
      onClose={onClose}
      onApply={() => {
        setData(ctx, item.id, { name }, { fill: color });
        onClose();
      }}
      applyDisabled={!icons?.[name]}
    >
      <div className="w-icon-tools">
        <input
          aria-label="Search icons"
          placeholder="Search icons"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' && names.length) {
              e.preventDefault();
              setName(names[0]);
              list.current?.querySelector<HTMLElement>('button')?.focus();
            }
          }}
        />
        <label className="w-inline">
          Colour
          <input type="color" aria-label="Icon colour" value={color} onChange={e => setColor(e.target.value)} />
        </label>
        <span>{icons ? `${names.length}${names.length === 240 ? '+' : ''} icons` : 'Loading icons…'}</span>
      </div>
      <div ref={list} className="w-icon-grid" role="listbox" aria-label="Icons" onKeyDown={move}>
        {icons &&
          names.map(n => {
            const Icon = icons[n];
            return (
              <button
                key={n}
                data-icon={n}
                role="option"
                aria-selected={n === name}
                aria-label={n.replace(/([a-z])([A-Z0-9])/g, '$1 $2')}
                title={n}
                tabIndex={n === name ? 0 : -1}
                className={n === name ? 'active' : ''}
                onClick={() => setName(n)}
              >
                <Icon size={22} color={color} />
              </button>
            );
          })}
        {icons && !names.length && <p className="format-hint">No icons match “{query}”.</p>}
      </div>
    </Dialog>
  );
}

// ---- QR (29) ---------------------------------------------------------------------------------
function QrRender({ item }: { item: Item }) {
  const d = data<{ color: string; quiet: number }>(item);
  let matrix: boolean[][] | null = null;
  try {
    matrix = qrMatrix(item.text);
  } catch {
    /* invalid content shows a placeholder */
  }
  const n = (matrix?.length ?? 21) + d.quiet * 2;
  return (
    <svg
      width={item.w}
      height={item.h}
      viewBox={`0 0 ${n} ${n}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code: ${item.text}`}
    >
      <rect width={n} height={n} fill={item.fill} />
      {matrix ? (
        <path d={qrPath(matrix, d.quiet)} fill={d.color} />
      ) : (
        <text x={n / 2} y={n / 2} fontSize="3" textAnchor="middle" fill="#ad2532">
          Invalid
        </text>
      )}
    </svg>
  );
}
function QrEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<{ color: string; quiet: number }>(item),
    [text, setText] = useState(item.text),
    [color, setColor] = useState(d.color),
    [bg, setBg] = useState(item.fill),
    [quiet, setQuiet] = useState(d.quiet);
  let error = '';
  try {
    qrMatrix(text);
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <Dialog
      title="QR code"
      hint={`Up to ${QR_MAX.toLocaleString('en-US')} characters. Keep strong contrast so it scans.`}
      onClose={onClose}
      onApply={() => {
        if (!error) {
          setData(ctx, item.id, { color, quiet }, { text, fill: bg });
          onClose();
        }
      }}
      applyDisabled={!!error}
      error={error}
    >
      <div className="w-form">
        <label className="span2">
          Link or text
          <textarea aria-label="QR content" value={text} onChange={e => setText(e.target.value)} />
          <small>
            {text.length.toLocaleString('en-US')} / {QR_MAX.toLocaleString('en-US')}
          </small>
        </label>
        <label>
          Code colour
          <input type="color" aria-label="QR colour" value={color} onChange={e => setColor(e.target.value)} />
        </label>
        <label>
          Background
          <input type="color" aria-label="QR background" value={bg} onChange={e => setBg(e.target.value)} />
        </label>
        <label>
          Quiet zone
          <select aria-label="Quiet zone" value={quiet} onChange={e => setQuiet(Number(e.target.value))}>
            {[0, 1, 2, 4, 6, 8].map(q => (
              <option key={q} value={q}>
                {q} modules
              </option>
            ))}
          </select>
        </label>
        {!error && (
          <div className="w-qr-preview">
            <QrRender item={{ ...item, w: 140, h: 140, text, fill: bg, data: { color, quiet } }} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---- Matrix (43) -----------------------------------------------------------------------------
function MatrixRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
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
function MatrixEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
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
function PollRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
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
function PollEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
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
function SpinnerRender({ item }: { item: Item }) {
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
function SpinnerEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
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
function ScaleRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
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
function ScaleEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
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

const cycle = <T,>(list: readonly T[], v: T) => list[(list.indexOf(v) + 1) % list.length];
export const basicViews: WidgetView[] = [
  {
    kind: 'card',
    mode: 'html',
    Render: CardRender,
    Editor: CardEditor,
    actions: (item, ctx) => {
      const d = data<CardData>(item);
      return [
        {
          label: `Status: ${d.status}`,
          icon: <Repeat2 size={16} />,
          run: () => setData(ctx, item.id, { ...d, status: cycle(cardStatuses, d.status) }),
        },
      ];
    },
  },
  {
    kind: 'flipcard',
    mode: 'html',
    Render: FlipRender,
    Editor: FlipEditor,
    actions: (item, ctx) => {
      const d = data<{ back: string; flipped: boolean }>(item);
      return [
        {
          label: d.flipped ? 'Show front' : 'Flip',
          icon: <Repeat2 size={16} />,
          pressed: d.flipped,
          run: () => setData(ctx, item.id, { ...d, flipped: !d.flipped }),
        },
      ];
    },
  },
  { kind: 'grid', mode: 'html', Render: GridRender, Editor: GridEditor },
  {
    kind: 'divider',
    mode: 'svg',
    Render: DividerRender,
    actions: (item, ctx) => {
      const d = data<{ orientation: string; style: string; weight: number }>(item);
      return [
        {
          label: d.orientation === 'horizontal' ? 'Make vertical' : 'Make horizontal',
          run: () =>
            patchItem(ctx, item.id, i => ({
              ...i,
              w: i.h,
              h: i.w,
              x: i.x + (i.w - i.h) / 2,
              y: i.y + (i.h - i.w) / 2,
              data: { ...d, orientation: d.orientation === 'horizontal' ? 'vertical' : 'horizontal' },
            })),
        },
        {
          label: `Pattern: ${d.style}`,
          run: () => setData(ctx, item.id, { ...d, style: cycle(['solid', 'dashed', 'dotted'], d.style) }),
        },
        {
          label: `Weight: ${d.weight} px`,
          run: () => setData(ctx, item.id, { ...d, weight: cycle([1, 2, 4, 8], d.weight) }),
        },
      ];
    },
  },
  {
    kind: 'stamp',
    mode: 'svg',
    Render: StampRender,
    Editor: StampEditor,
    actions: (item, ctx) => {
      const k = data<{ stamp: StampKind }>(item).stamp,
        n = cycle(stampKinds, k);
      return [
        {
          label: `Next stamp (${stampLabels[n]})`,
          icon: <Repeat2 size={16} />,
          run: () => setData(ctx, item.id, { stamp: n }, { fill: stampColors[n] }),
        },
      ];
    },
  },
  { kind: 'icon', mode: 'svg', Render: IconRender, Editor: IconEditor },
  { kind: 'qr', mode: 'svg', Render: QrRender, Editor: QrEditor },
  { kind: 'matrix', mode: 'html', Render: MatrixRender, Editor: MatrixEditor },
  {
    kind: 'poll',
    mode: 'html',
    Render: PollRender,
    Editor: PollEditor,
    interactive: true,
    actions: (item, ctx) => [
      {
        label: 'Reset votes',
        icon: <RotateCcw size={16} />,
        disabled: !pollTotal(data<PollData>(item)),
        run: () => setData(ctx, item.id, resetPoll(data<PollData>(item))),
      },
    ],
  },
  {
    kind: 'spinner',
    mode: 'html',
    Render: SpinnerRender,
    Editor: SpinnerEditor,
    actions: (item, ctx) => [
      {
        label: 'Spin',
        icon: <Shuffle size={16} />,
        run: () => {
          try {
            setData(ctx, item.id, spin(data<SpinnerData>(item)));
          } catch (e) {
            ctx.display((e as Error).message);
          }
        },
      },
    ],
  },
  { kind: 'scale', mode: 'html', Render: ScaleRender, Editor: ScaleEditor, interactive: true },
];
