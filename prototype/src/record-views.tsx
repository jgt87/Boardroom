import { TimelineCanvas } from './timeline-canvas';
import type { TimelineCanvasProps } from './timeline-canvas';
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { RecordRow } from './model';
import { statuses, moveRecord, shiftRecord, deleteRecord } from './records';
import { CanvasField, canvasControl } from './canvas-fields';

/**
 * Kanban columns. When `onRows` is given the board is interactive: cards can be dragged between
 * and within columns, or moved with Alt + arrow keys. `rows` may be a filtered subset; moves are
 * applied to `allRows` so hidden records keep their place.
 */
export function KanbanView({
  rows,
  allRows,
  onRows,
  limit,
  recordAction,
  columns = statuses,
  cardFields,
}: {
  rows: RecordRow[];
  allRows?: RecordRow[];
  onRows?: (rows: RecordRow[]) => void;
  limit?: number;
  recordAction?: (row: RecordRow) => React.ReactNode;
  columns?: string[];
  cardFields?: (row: RecordRow) => React.ReactNode;
}) {
  const [dragging, setDragging] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null),
    focusAfter = useRef<string | null>(null),
    root = useRef<HTMLDivElement>(null);
  const full = allRows ?? rows,
    visible = new Set(rows.map(r => r.id)),
    live = !!onRows;
  useLayoutEffect(() => {
    if (focusAfter.current) {
      root.current?.querySelector<HTMLElement>(`[data-card="${focusAfter.current}"]`)?.focus();
      focusAfter.current = null;
    }
  });
  const drop = (status: RecordRow['status'], before: string | null) => {
    if (!dragging || !onRows) return;
    onRows(moveRecord(full, dragging, status, before, columns));
    setDragging(null);
    setOver(null);
  };
  return (
    <div ref={root} className={`kanban-preview ${live ? 'live' : ''}`}>
      {columns.map(s => {
        const cards = rows.filter(r => r.status === s),
          shown = limit ? cards.slice(0, limit) : cards;
        return (
          <section
            key={s}
            aria-label={`${s || 'Unassigned'} column`}
            data-record-status={s}
            className={over === `col:${s}` ? 'drop-target' : ''}
            onDragOver={
              live
                ? e => {
                    e.preventDefault();
                    setOver(o => (o?.startsWith('card:') ? o : `col:${s}`));
                  }
                : undefined
            }
            onDragLeave={
              live
                ? e => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                  }
                : undefined
            }
            onDrop={
              live
                ? e => {
                    e.preventDefault();
                    drop(s, null);
                  }
                : undefined
            }
          >
            <div className="kanban-col-title">
              {s || 'Unassigned'} <span>{cards.length}</span>
              {full.some(r => r.points !== undefined) && (
                <span className="kanban-points" title="Story points in this column">
                  {cards.reduce((sum, r) => sum + (r.points ?? 0), 0)} pts
                </span>
              )}
            </div>
            {live && (
              <button
                {...canvasControl}
                aria-label={`Add card to ${s || 'Unassigned'}`}
                onClick={() =>
                  onRows!([
                    ...full,
                    { id: crypto.randomUUID(), title: 'New task', status: s, assignee: '', start: '', end: '' },
                  ])
                }
              >
                + Add card
              </button>
            )}
            {shown.map(r => (
              <div
                key={r.id}
                data-card={r.id}
                className={`record-card ${dragging === r.id ? 'dragging' : ''} ${over === `card:${r.id}` ? 'drop-before' : ''}`}
                draggable={live}
                onPointerDown={live ? e => e.stopPropagation() : undefined}
                onDoubleClick={live ? e => e.stopPropagation() : undefined}
                tabIndex={live ? 0 : undefined}
                aria-label={
                  live ? `${r.title || 'Untitled record'}, ${s}. Alt plus arrow keys move this card.` : undefined
                }
                onDragStart={
                  live
                    ? e => {
                        setDragging(r.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', r.id);
                      }
                    : undefined
                }
                onDragEnd={
                  live
                    ? () => {
                        setDragging(null);
                        setOver(null);
                      }
                    : undefined
                }
                onDragOver={
                  live
                    ? e => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragging !== r.id) setOver(`card:${r.id}`);
                      }
                    : undefined
                }
                onDrop={
                  live
                    ? e => {
                        e.preventDefault();
                        e.stopPropagation();
                        drop(s, r.id);
                      }
                    : undefined
                }
                onKeyDown={
                  live
                    ? e => {
                        if ((e.target as HTMLElement).closest('input,textarea,button')) return;
                        if (e.key === 'Delete' || e.key === 'Backspace') {
                          e.preventDefault();
                          e.stopPropagation();
                          onRows!(deleteRecord(full, r.id));
                          return;
                        }
                        const dir = (
                          { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
                        )[e.key as 'ArrowUp'];
                        if (!e.altKey || !dir) return;
                        e.preventDefault();
                        e.stopPropagation();
                        focusAfter.current = r.id;
                        onRows!(shiftRecord(full, r.id, dir, visible, columns));
                      }
                    : undefined
                }
              >
                {recordAction?.(r)}
                {cardFields?.(r)}
                {live ? (
                  <CanvasField
                    value={r.title}
                    label={`Card title: ${r.title || 'Untitled record'}`}
                    onCommit={title => onRows!(full.map(row => (row.id === r.id ? { ...row, title } : row)))}
                  />
                ) : (
                  r.title || 'Untitled record'
                )}
                <small>
                  {r.assignee || 'Unassigned'}
                  {r.tags?.length ? ` · ${r.tags.map(t => `#${t}`).join(' ')}` : ''}
                </small>
              </div>
            ))}
            {limit && cards.length > limit && <p className="kanban-more">+{cards.length - limit} more</p>}
            {live && !cards.length && <p className="kanban-empty">Drop cards here</p>}
          </section>
        );
      })}
    </div>
  );
}

/** Timeline bars, milestones and dependency arrows derived only from stored dates. */
export function TimelineView(props: TimelineCanvasProps) {
  return <TimelineCanvas {...props} />;
}
