import { TimelineCanvas } from './timeline-canvas';
import type { TimelineCanvasProps } from './timeline-canvas';
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { RecordRow } from './model';
import type { RecordColumnSettings } from './record-schema';
import { statuses, moveRecord, shiftRecord, deleteRecord, columnLoad } from './records';
import { CanvasField, canvasControl } from './canvas-fields';
import './record-gaps.css';

/** A horizontal swimlane: cards whose lane field has `value`. */
export type KanbanLane = { value: string; label: string; hidden: boolean };

/**
 * Kanban columns. When `onRows` is given the board is interactive: cards can be dragged between
 * and within columns, or moved with Alt + arrow keys. `rows` may be a filtered subset; moves are
 * applied to `allRows` so hidden records keep their place. With `lanes`, cards are also split into
 * horizontal swimlanes by a second field; dropping a card into another lane sets that field through `withLane`.
 */
export function KanbanView({
  rows,
  allRows,
  onRows,
  limit,
  recordAction,
  columns = statuses,
  cardFields,
  columnSettings,
  capacity = 'count',
  lanes,
  laneOf,
  withLane,
  onToggleLane,
}: {
  rows: RecordRow[];
  allRows?: RecordRow[];
  onRows?: (rows: RecordRow[]) => void;
  limit?: number;
  recordAction?: (row: RecordRow) => React.ReactNode;
  columns?: string[];
  cardFields?: (row: RecordRow) => React.ReactNode;
  columnSettings?: Record<string, RecordColumnSettings>;
  capacity?: 'count' | 'points';
  lanes?: KanbanLane[];
  laneOf?: (row: RecordRow) => string;
  withLane?: (row: RecordRow, lane: string) => RecordRow;
  onToggleLane?: (value: string) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null),
    focusAfter = useRef<string | null>(null),
    root = useRef<HTMLDivElement>(null);
  const full = allRows ?? rows,
    visible = new Set(rows.map(r => r.id)),
    live = !!onRows,
    laned = !!(lanes && laneOf);
  useLayoutEffect(() => {
    if (focusAfter.current) {
      root.current?.querySelector<HTMLElement>(`[data-card="${focusAfter.current}"]`)?.focus();
      focusAfter.current = null;
    }
  });
  const drop = (status: RecordRow['status'], before: string | null, lane?: string) => {
    if (!dragging || !onRows) return;
    try {
      let next = moveRecord(full, dragging, status, before, columns);
      if (lane !== undefined && withLane)
        next = next.map(r => (r.id === dragging && laneOf?.(r) !== lane ? withLane(r, lane) : r));
      onRows(next);
    } finally {
      setDragging(null);
      setOver(null);
    }
  };
  const renderColumns = (laneRows: RecordRow[], lane?: string) =>
    columns.map(s => {
      const key = lane === undefined ? s : `${lane}\u0000${s}`,
        cards = laneRows.filter(r => r.status === s),
        shown = limit ? cards.slice(0, limit) : cards,
        settings = columnSettings?.[s],
        load = columnLoad(
          full.filter(r => r.status === s),
          capacity,
        ),
        over_ = settings?.limit !== undefined && load > settings.limit;
      return (
        <section
          key={key}
          aria-label={`${s || 'Unassigned'} column${lane !== undefined ? ` in ${lane || 'Unassigned'} lane` : ''}`}
          data-record-status={s}
          className={over === `col:${key}` ? 'drop-target' : ''}
          style={settings?.color ? { background: settings.color } : undefined}
          onDragOver={
            live
              ? e => {
                  e.preventDefault();
                  setOver(o => (o?.startsWith('card:') ? o : `col:${key}`));
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
                  drop(s, null, lane);
                }
              : undefined
          }
        >
          <div
            className={`kanban-col-title ${over_ ? 'over-capacity' : ''}`}
            data-over-capacity={over_ || undefined}
            title={
              settings?.limit !== undefined
                ? `${load} of ${settings.limit} ${capacity === 'points' ? 'points' : 'cards'}${over_ ? ' (over capacity)' : ''}`
                : undefined
            }
          >
            {s || 'Unassigned'} <span>{cards.length}</span>
            {settings?.limit !== undefined && (
              <span className="kanban-capacity">
                {load}/{settings.limit}
                {capacity === 'points' ? ' pts' : ''}
              </span>
            )}
            {full.some(r => r.points !== undefined) && (
              <span className="kanban-points" title="Story points in this column">
                {cards.reduce((sum, r) => sum + (r.points ?? 0), 0)} pts
              </span>
            )}
          </div>
          {live && (
            <button
              {...canvasControl}
              aria-label={`Add card to ${s || 'Unassigned'}${lane !== undefined ? ` in ${lane || 'Unassigned'} lane` : ''}`}
              onClick={() => {
                const card: RecordRow = {
                  id: crypto.randomUUID(),
                  title: 'New task',
                  status: s,
                  assignee: '',
                  start: '',
                  end: '',
                };
                onRows!([...full, lane !== undefined && withLane ? withLane(card, lane) : card]);
              }}
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
                      drop(s, r.id, lane);
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
                      onRows!(
                        shiftRecord(full, r.id, dir, laned ? new Set(laneRows.map(c => c.id)) : visible, columns),
                      );
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
    });
  if (!laned)
    return (
      <div ref={root} className={`kanban-preview ${live ? 'live' : ''}`}>
        {renderColumns(rows)}
      </div>
    );
  return (
    <div ref={root} className={`kanban-preview kanban-has-lanes ${live ? 'live' : ''}`}>
      {lanes!.map(lane => {
        const laneRows = rows.filter(r => laneOf!(r) === lane.value);
        return (
          <div className="kanban-lane" key={lane.value} data-lane={lane.value}>
            <button
              {...canvasControl}
              className="kanban-lane-title"
              aria-expanded={!lane.hidden}
              disabled={!onToggleLane}
              onClick={() => onToggleLane?.(lane.value)}
            >
              {lane.label} ({laneRows.length})
            </button>
            {!lane.hidden && <div className="kanban-lane-columns">{renderColumns(laneRows, lane.value)}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Timeline bars, milestones and dependency arrows derived only from stored dates. */
export function TimelineView(props: TimelineCanvasProps) {
  return <TimelineCanvas {...props} />;
}
