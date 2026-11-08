// Grid widget view and editor (item 23).
import React, { useEffect, useRef, useState } from 'react';
import { Plus, Minus, Merge as MergeIcon, Split, Bold, Italic, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
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
  canAddRow,
  canAddColumn,
  LARGE_GRID_CELLS,
  reorderGrid,
} from './grid';
import type { GridData } from './grid';
import { Dialog, setData } from './widget-kit';
import { BrandSwatches } from './brand-kit-panel';
import { ColorMenu } from './color-menu';
import { CanvasField, canvasControl } from './canvas-fields';
import { gridMetrics, GRID_HEADER, setGridResizeMode } from './grid-canvas';
import { GridAxisHandle } from './grid-axis-handle';

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
export function GridRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const [preview, setPreview] = useState<GridData | null>(null);
  const g = preview ?? (item.data as GridData);
  const metrics = gridMetrics({
    ...item,
    ...(preview
      ? {
          w: preview.colSizes!.reduce((a, b) => a + b, 0),
          h: GRID_HEADER + preview.rowSizes!.reduce((a, b) => a + b, 0),
        }
      : {}),
    data: g,
  });
  const resize = useRef<{
    axis: 'row' | 'column';
    index: number;
    start: number;
    size: number;
    base: GridData;
    next: GridData;
  } | null>(null);
  const [cur, setCur] = useState({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const area = {
    r1: Math.min(cur.r, anchor?.r ?? cur.r),
    c1: Math.min(cur.c, anchor?.c ?? cur.c),
    r2: Math.max(cur.r, anchor?.r ?? cur.r),
    c2: Math.max(cur.c, anchor?.c ?? cur.c),
  };
  const run = (change: (value: GridData) => GridData) => {
    if (item.locked) return;
    try {
      ctx.update(b => ({
        ...b,
        items: b.items.map(i => {
          if (i.id !== item.id) return i;
          const sizes = gridMetrics(i);
          const next = change({ ...(i.data as GridData), rowSizes: sizes.rows, colSizes: sizes.cols });
          setAnchor(a => (a ? { r: Math.min(a.r, next.rows - 1), c: Math.min(a.c, next.cols - 1) } : null));
          setCur(v => ({ r: Math.min(v.r, next.rows - 1), c: Math.min(v.c, next.cols - 1) }));
          return {
            ...i,
            data: next,
            w: next.colSizes!.reduce((a, b) => a + b, 0),
            h: GRID_HEADER + next.rowSizes!.reduce((a, b) => a + b, 0),
          };
        }),
      }));
    } catch (e) {
      ctx.display((e as Error).message, undefined, 'error');
    }
  };
  // Large grids (track J, up to 2,500 cells) draw cells as text and keep one live field, on the current
  // cell, so the canvas stays responsive; small grids keep a field in every cell.
  const large = g.rows * g.cols > LARGE_GRID_CELLS,
    [pendingFocus, setPendingFocus] = useState(0);
  const field = (r: number, c: number) =>
    Array.from(root.current?.querySelectorAll<HTMLTextAreaElement>('textarea') ?? []).find(
      el => el.getAttribute('aria-label') === `Grid cell ${r + 1}, ${c + 1}`,
    );
  const focus = (r: number, c: number) => {
    const el = field(r, c);
    if (el) el.focus();
    else if (large) {
      setCur({ r, c });
      setPendingFocus(n => n + 1);
    }
  };
  const target = useRef(cur);
  target.current = cur;
  useEffect(() => {
    if (!pendingFocus) return;
    // After the pointer or key event has finished, so the browser does not move focus away again.
    const t = setTimeout(() => {
      const { r, c } = target.current;
      root.current?.querySelector<HTMLTextAreaElement>(`textarea[aria-label="Grid cell ${r + 1}, ${c + 1}"]`)?.focus();
    });
    return () => clearTimeout(t);
  }, [pendingFocus]);
  /** Next (or previous) visible cell in reading order, wrapping to the first. */
  const stepCell = (r: number, c: number, back: boolean) => {
    const total = g.rows * g.cols;
    let k = r * g.cols + c;
    for (let n = 0; n < total; n++) {
      k = (k + (back ? -1 : 1) + total) % total;
      const nr = Math.floor(k / g.cols),
        nc = k % g.cols;
      if (!isCovered(g, nr, nc)) return { r: nr, c: nc };
    }
    return { r: 0, c: 0 };
  };
  const border = (axis: 'row' | 'column', index: number) => (
    <span
      className={`grid-resize grid-resize-${axis}`}
      role="separator"
      aria-label={`Resize ${axis} ${index + 1}`}
      aria-orientation={axis === 'row' ? 'horizontal' : 'vertical'}
      aria-valuenow={Math.round((axis === 'row' ? metrics.rows : metrics.cols)[index])}
      aria-valuemin={40}
      aria-valuemax={10000}
      tabIndex={item.locked ? -1 : 0}
      onPointerDown={e => {
        if (item.locked) return;
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const base = { ...g, rowSizes: metrics.rows, colSizes: metrics.cols };
        resize.current = {
          axis,
          index,
          start: axis === 'row' ? e.clientY : e.clientX,
          size: (axis === 'row' ? metrics.rows : metrics.cols)[index],
          base,
          next: base,
        };
      }}
      onPointerMove={e => {
        const drag = resize.current;
        if (!drag || item.locked) return;
        const size = Math.max(
          40,
          Math.min(10000, drag.size + ((axis === 'row' ? e.clientY : e.clientX) - drag.start) / ctx.zoom),
        );
        const key = axis === 'row' ? 'rowSizes' : 'colSizes';
        drag.next = { ...drag.base, [key]: drag.base[key]!.map((n, k) => (k === index ? size : n)) };
        setPreview(drag.next);
      }}
      onPointerUp={e => {
        const drag = resize.current;
        resize.current = null;
        setPreview(null);
        if (drag) run(() => drag.next);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        resize.current = null;
        setPreview(null);
      }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          resize.current = null;
          setPreview(null);
        }
        if (item.locked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        run(v => {
          const key = axis === 'row' ? 'rowSizes' : 'colSizes';
          return {
            ...v,
            [key]: v[key]!.map((n, k) =>
              k === index
                ? Math.max(40, Math.min(10000, n + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -10 : 10)))
                : n,
            ),
          };
        });
      }}
    />
  );
  return (
    <div
      ref={root}
      className="w-grid-wrap canvas-interactive"
      style={
        preview
          ? {
              width: metrics.cols.reduce((a, b) => a + b, 0),
              height: GRID_HEADER + metrics.rows.reduce((a, b) => a + b, 0),
            }
          : undefined
      }
      onDoubleClick={e => e.stopPropagation()}
    >
      <div className="canvas-grid-toolbar canvas-widget-header">
        <span>Grid</span>
        <div {...canvasControl}>
          <select
            aria-label="Cell sizing"
            value={g.resizeMode ?? 'auto'}
            disabled={!!item.locked}
            onChange={e => {
              const mode = e.target.value as 'auto' | 'manual';
              ctx.update(b => setGridResizeMode(b, item.id, mode));
            }}
          >
            <option value="auto">Auto sizing</option>
            <option value="manual">Manual sizing</option>
          </select>
          <button
            disabled={!!item.locked || !canAddRow(g)}
            onClick={() => run(v => addRow(v, Math.min(cur.r + 1, v.rows)))}
          >
            + Row
          </button>
          <button
            disabled={!!item.locked || !canAddColumn(g)}
            onClick={() => run(v => addColumn(v, Math.min(cur.c + 1, v.cols)))}
          >
            + Column
          </button>
          <button disabled={!!item.locked || g.rows <= 1} onClick={() => run(v => removeRow(v, cur.r))}>
            Delete row
          </button>
          <button disabled={!!item.locked || g.cols <= 1} onClick={() => run(v => removeColumn(v, cur.c))}>
            Delete column
          </button>
          <button
            disabled={!!item.locked || !anchor || (area.r1 === area.r2 && area.c1 === area.c2)}
            onClick={() => {
              run(v => mergeCells(v, area.r1, area.c1, area.r2, area.c2));
              setCur({ r: area.r1, c: area.c1 });
              setAnchor(null);
            }}
          >
            Merge
          </button>
          <button
            disabled={!!item.locked || !mergeAt(g, cur.r, cur.c)}
            onClick={() => run(v => unmergeCell(v, cur.r, cur.c))}
          >
            Unmerge
          </button>
          <button
            disabled={!!item.locked}
            aria-label="Bold selected cells"
            onClick={() =>
              run(v => setCellStyle(v, area.r1, area.c1, area.r2, area.c2, { bold: !cellStyle(v, cur.r, cur.c).bold }))
            }
          >
            <Bold size={13} />
          </button>
        </div>
      </div>
      <div className="canvas-grid-table" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
        <table className={`w-grid align-${g.align}`}>
          <colgroup>
            {metrics.cols.map((size, k) => (
              <col key={k} style={{ width: size }} />
            ))}
          </colgroup>
          <tbody>
            {g.cells.map((row, r) => (
              <tr key={r} style={{ height: metrics.rows[r] }}>
                {row.map((_, c) => {
                  if (isCovered(g, r, c)) return null;
                  const m = mergeAt(g, r, c),
                    st = cellStyle(g, r, c);
                  return (
                    <td
                      key={c}
                      data-grid-cell={`${r},${c}`}
                      data-grid-id={item.id}
                      data-grid-row={r}
                      data-grid-col={c}
                      rowSpan={m?.rs}
                      colSpan={m?.cs}
                      data-active={r >= area.r1 && r <= area.r2 && c >= area.c1 && c <= area.c2}
                      style={{
                        background: g.colors?.[`${r},${c}`],
                        fontWeight: st.bold ? 700 : undefined,
                        fontStyle: st.italic ? 'italic' : undefined,
                        color: st.color,
                        textAlign: st.align,
                      }}
                      onPointerDownCapture={e => {
                        // Large grids: commit the live field before it moves to another cell (it unmounts).
                        if (large && (cur.r !== r || cur.c !== c)) {
                          const active = document.activeElement;
                          if (active instanceof HTMLTextAreaElement && root.current?.contains(active)) active.blur();
                        }
                        if (e.shiftKey) {
                          e.preventDefault();
                          setAnchor(a => a ?? cur);
                        } else setAnchor(null);
                        setCur({ r, c });
                        if (large && !e.shiftKey && (cur.r !== r || cur.c !== c)) setPendingFocus(n => n + 1);
                      }}
                    >
                      {r === 0 && (
                        <GridAxisHandle
                          id={item.id}
                          axis="column"
                          index={c}
                          count={g.cols}
                          disabled={!!item.locked}
                          onMove={(from, to) => run(v => reorderGrid(v, 'column', from, to))}
                        />
                      )}
                      {c === 0 && (
                        <GridAxisHandle
                          id={item.id}
                          axis="row"
                          index={r}
                          count={g.rows}
                          disabled={!!item.locked}
                          onMove={(from, to) => run(v => reorderGrid(v, 'row', from, to))}
                        />
                      )}
                      {(!large || r === 0) && border('column', c)}
                      {(!large || c === 0) && border('row', r)}
                      {item.locked || (large && (cur.r !== r || cur.c !== c)) ? (
                        <span className={large && !item.locked ? 'grid-cell-text' : undefined}>{g.cells[r][c]}</span>
                      ) : (
                        <CanvasField
                          multiline
                          maxLength={2000}
                          label={`Grid cell ${r + 1}, ${c + 1}`}
                          value={g.cells[r][c]}
                          onCommit={text => run(v => setCell(v, r, c, text.slice(0, 2000)))}
                          onKeyDown={e => {
                            if (e.key !== 'Tab') return;
                            if (large) {
                              e.preventDefault();
                              (e.currentTarget as HTMLElement).blur();
                              const next = stepCell(r, c, e.shiftKey);
                              setCur(next);
                              setAnchor(null);
                              setPendingFocus(n => n + 1);
                              return;
                            }
                            const cells = Array.from(root.current!.querySelectorAll<HTMLTextAreaElement>('textarea'));
                            const idx = cells.indexOf(e.currentTarget as HTMLTextAreaElement),
                              target = cells[idx + (e.shiftKey ? -1 : 1)];
                            if (target) {
                              e.preventDefault();
                              target.focus();
                            } else {
                              e.preventDefault();
                              focus(0, 0);
                            }
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function GridEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
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
    let next: [number, number] | null;
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
        <button disabled={!canAddRow(g)} onClick={() => run(() => addRow(g, cur.r + 1))}>
          <Plus size={14} />
          Row below
        </button>
        <button disabled={!canAddColumn(g)} onClick={() => run(() => addColumn(g, cur.c + 1))}>
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
          <span className="w-inline">
            Text
            <ColorMenu
              label="Cell text colour"
              value={curStyle.color ?? '#25252c'}
              onPick={c => style({ color: c.toLowerCase() === '#25252c' ? undefined : c })}
            />
          </span>
          <BrandSwatches label="Brand colours for cell text" value={curStyle.color} onPick={c => style({ color: c })} />
        </span>
        <span className="w-inline">
          Cell colour
          <ColorMenu
            label="Cell colour"
            value={g.colors?.[`${cur.r},${cur.c}`] ?? '#ffffff'}
            onPick={c => setG(setCellColor(g, cur.r, cur.c, c === '#ffffff' ? undefined : c))}
          />
        </span>
        <BrandSwatches
          label="Brand colours for cell"
          value={g.colors?.[`${cur.r},${cur.c}`]}
          onPick={c => setG(setCellColor(g, cur.r, cur.c, c))}
        />
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
