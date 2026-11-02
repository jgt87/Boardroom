import React, { useLayoutEffect, useRef, useState } from 'react';
import type { RecordRow } from './model';
import { statuses, moveRecord, shiftRecord, timelineGeometry } from './records';

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
}: {
  rows: RecordRow[];
  allRows?: RecordRow[];
  onRows?: (rows: RecordRow[]) => void;
  limit?: number;
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
    onRows(moveRecord(full, dragging, status, before));
    setDragging(null);
    setOver(null);
  };
  return (
    <div ref={root} className={`kanban-preview ${live ? 'live' : ''}`}>
      {statuses.map(s => {
        const cards = rows.filter(r => r.status === s),
          shown = limit ? cards.slice(0, limit) : cards;
        return (
          <section
            key={s}
            aria-label={`${s} column`}
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
            <h4>
              {s} <span>{cards.length}</span>
              {full.some(r => r.points !== undefined) && (
                <span className="kanban-points" title="Story points in this column">
                  {cards.reduce((sum, r) => sum + (r.points ?? 0), 0)} pts
                </span>
              )}
            </h4>
            {shown.map(r => (
              <div
                key={r.id}
                data-card={r.id}
                className={`record-card ${dragging === r.id ? 'dragging' : ''} ${over === `card:${r.id}` ? 'drop-before' : ''}`}
                draggable={live}
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
                        const dir = (
                          { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
                        )[e.key as 'ArrowUp'];
                        if (!e.altKey || !dir) return;
                        e.preventDefault();
                        e.stopPropagation();
                        focusAfter.current = r.id;
                        onRows!(shiftRecord(full, r.id, dir, visible));
                      }
                    : undefined
                }
              >
                {r.title || 'Untitled record'}
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

const ROW = 42;
/** Timeline bars, milestones and dependency arrows derived only from stored dates. */
export function TimelineView({ rows }: { rows: RecordRow[] }) {
  const geometry = timelineGeometry(rows),
    track = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width || 600);
    measure();
    const o = new ResizeObserver(measure);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const bars = new Map(geometry.bars.map(b => [b.id, b]));
  return (
    <div className="timeline-preview">
      <div className="timeline-scale">
        {geometry.bars.length
          ? `${new Date(geometry.min).toLocaleDateString()} — ${new Date(geometry.max).toLocaleDateString()}`
          : 'Add start and end dates to schedule work'}
      </div>
      <div className="timeline-body">
        {rows.map(r => {
          const b = bars.get(r.id);
          return (
            <div className="timeline-row" key={r.id}>
              <span title={r.title}>
                {r.milestone ? '◆ ' : ''}
                {r.title || 'Untitled record'}
              </span>
              <div>
                {b ? (
                  b.milestone ? (
                    <span
                      className="timeline-milestone"
                      title={`Milestone · ${r.start}`}
                      style={{ left: `${b.left * 100}%` }}
                    />
                  ) : (
                    <span
                      className="timeline-bar"
                      style={{ left: `${b.left * 100}%`, width: `${Math.max(0.5, b.width * 100)}%` }}
                    >
                      {r.status}
                    </span>
                  )
                ) : (
                  <small>Unscheduled</small>
                )}
              </div>
            </div>
          );
        })}
        <div ref={track} className="timeline-links-area" aria-hidden="true">
          {geometry.links.length > 0 && (
            <svg width={width} height={rows.length * ROW} className="timeline-links">
              <defs>
                <marker
                  id="dep-head"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0 0 L10 5 L0 10Z" fill="#5a5a66" />
                </marker>
              </defs>
              {geometry.links.map(l => {
                const x1 = l.x1 * width,
                  x2 = l.x2 * width,
                  y1 = l.fromRow * ROW + ROW / 2,
                  y2 = l.toRow * ROW + ROW / 2,
                  mid = Math.max(x1 + 8, Math.min(x2 - 8, (x1 + x2) / 2));
                return (
                  <path
                    key={`${l.from}-${l.to}`}
                    d={
                      l.late
                        ? `M${x1},${y1} h8 V${(y1 + y2) / 2} H${x2 - 8} V${y2} H${x2 - 1}`
                        : `M${x1},${y1} H${mid} V${y2} H${x2 - 1}`
                    }
                    fill="none"
                    stroke={l.late ? '#c2410c' : '#5a5a66'}
                    strokeDasharray={l.late ? '4 3' : undefined}
                    strokeWidth="1.5"
                    markerEnd="url(#dep-head)"
                  >
                    <title>{l.late ? 'Starts before its dependency ends' : 'Dependency'}</title>
                  </path>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
