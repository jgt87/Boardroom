import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical, Link2, Trash2 } from 'lucide-react';
import type { RecordRow } from './model';
import { CanvasField, canvasControl } from './canvas-fields';
import { timelineGeometry, shiftTimelineRecord, addDependency, removeDependency } from './records';
import { timelineAxis, validateTimelineSettings, reorderTimelineRow } from './timeline-axis';
import type { TimelineSettings } from './timeline-axis';

export type TimelineCanvasProps = {
  rows: RecordRow[];
  allRows?: RecordRow[];
  onRows?: (rows: RecordRow[]) => void;
  onAllRows?: (rows: RecordRow[]) => void;
  recordAction?: (row: RecordRow) => React.ReactNode;
  settings?: TimelineSettings;
  onSettings?: (value: TimelineSettings) => void;
  onError?: (message: string) => void;
  /** Group rows under headings. `rows` must already be ordered by group and omit rows of hidden groups. */
  groups?: TimelineGroup[];
  groupOf?: (row: RecordRow) => string;
  onToggleGroup?: (value: string) => void;
};
export type TimelineGroup = { value: string; label: string; hidden: boolean; count: number };
const ROW = 42,
  LABEL = 150,
  DAY = 86400000,
  ROW_MIME = 'application/x-boardroom-timeline-row';

export function TimelineCanvas({
  rows,
  allRows,
  onRows,
  onAllRows,
  recordAction,
  settings: externalSettings,
  onSettings,
  onError,
  groups,
  groupOf,
  onToggleGroup,
}: TimelineCanvasProps) {
  const scope = useId(),
    root = useRef<HTMLDivElement>(null),
    body = useRef<HTMLDivElement>(null),
    area = useRef<HTMLDivElement>(null);
  const [localSettings, setLocalSettings] = useState<TimelineSettings>({}),
    settings = externalSettings ?? localSettings;
  const [available, setAvailable] = useState(600),
    [preview, setPreview] = useState<RecordRow[] | null>(null),
    [notice, setNotice] = useState('');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const focusAfter = useRef<string | null>(null);
  const full = allRows ?? rows,
    report = (message: string) => {
      setNotice(message);
      onError?.(message);
    };
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setAvailable(Math.max(280, element.clientWidth - LABEL));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!focusAfter.current) return;
    [...(body.current?.querySelectorAll<HTMLElement>('[data-record]') ?? [])]
      .find(el => el.dataset.record === focusAfter.current)
      ?.querySelector<HTMLButtonElement>('.timeline-row-grip')
      ?.focus();
    focusAfter.current = null;
  }, [rows]);
  const axis = timelineAxis(rows, settings, available),
    shown = preview ?? rows,
    geometry = timelineGeometry(shown, axis);
  const bars = new Map(geometry.bars.map(bar => [bar.id, bar]));
  // Display slots: group headings take one row height each, so bar and link positions use slots.
  const display: ({ kind: 'group'; group: TimelineGroup } | { kind: 'row'; row: RecordRow })[] =
    groups && groupOf
      ? groups.flatMap(group => [
          { kind: 'group' as const, group },
          ...shown.filter(r => groupOf(r) === group.value).map(row => ({ kind: 'row' as const, row })),
        ])
      : shown.map(row => ({ kind: 'row' as const, row }));
  const slots = new Map<string, number>();
  display.forEach((entry, k) => {
    if (entry.kind === 'row') slots.set(entry.row.id, k);
  });
  const yOf = (index: number) => (slots.get(shown[index]?.id) ?? index) * ROW + ROW / 2;
  const drag = useRef<{
    id: string;
    mode: 'move' | 'start' | 'end';
    x: number;
    width: number;
    span: number;
    days: number;
    rows: RecordRow[];
  } | null>(null);
  const connection = useRef<{
    from: string;
    target: string | null;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [linkPreview, setLinkPreview] = useState<typeof connection.current>(null);
  const changeSettings = (next: TimelineSettings) => {
    if (!onRows) return;
    try {
      validateTimelineSettings(next);
      setNotice('');
      if (onSettings) onSettings(next);
      else setLocalSettings(next);
    } catch (error) {
      report((error as Error).message);
    }
  };
  const connect = (source: string, target: string) => {
    if (!onRows || !source || !target) return;
    try {
      (onAllRows ?? onRows)(addDependency(full, target, source));
      setNotice('');
    } catch (error) {
      report((error as Error).message);
    }
  };
  const barEvents = (row: RecordRow) =>
    onRows
      ? {
          role: 'slider' as const,
          tabIndex: 0,
          'aria-label': `Schedule ${row.title}`,
          'aria-valuetext': `${row.start} to ${row.end || row.start}`,
          'aria-valuenow': Date.parse(row.start || row.end) / DAY,
          'aria-valuemin': Date.parse('0001-01-01') / DAY,
          'aria-valuemax': Date.parse('9999-12-31') / DAY,
          onDoubleClick: (event: React.MouseEvent) => event.stopPropagation(),
          onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              id: row.id,
              mode: ((event.target as HTMLElement).dataset.timeHandle as 'start' | 'end') || 'move',
              x: event.clientX,
              width: event.currentTarget.parentElement!.getBoundingClientRect().width,
              span: axis.max - axis.min + DAY,
              days: 0,
              rows,
            };
          },
          onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
            const value = drag.current;
            if (!value) return;
            value.days = Math.round((((event.clientX - value.x) / Math.max(1, value.width)) * value.span) / DAY);
            setPreview(shiftTimelineRecord(value.rows, value.id, value.days, value.mode));
          },
          onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
            const value = drag.current;
            drag.current = null;
            setPreview(null);
            if (value?.days) onRows(shiftTimelineRecord(value.rows, value.id, value.days, value.mode));
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          },
          onPointerCancel: () => {
            drag.current = null;
            setPreview(null);
          },
          onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              drag.current = null;
              setPreview(null);
              connection.current = null;
              setLinkPreview(null);
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              onRows(
                shiftTimelineRecord(
                  rows,
                  row.id,
                  (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 7 : 1),
                  event.altKey ? 'end' : event.ctrlKey ? 'start' : 'move',
                ),
              );
            }
          },
        }
      : {};
  const connectionEvents = (row: RecordRow) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!onRows) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      const bar = bars.get(row.id)!;
      connection.current = {
        from: row.id,
        target: null,
        x1: (bar.left + bar.width) * axis.width,
        y1: yOf(bar.row),
        x2: (bar.left + bar.width) * axis.width,
        y2: yOf(bar.row),
      };
      setLinkPreview({ ...connection.current });
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      const value = connection.current,
        element = area.current;
      if (!value || !element) return;
      const rect = element.getBoundingClientRect(),
        ratio = axis.width / rect.width;
      const hit = document
        .elementsFromPoint(event.clientX, event.clientY)
        .find(el => el.closest('[data-time-record]')?.closest('.timeline-body') === body.current)
        ?.closest<HTMLElement>('[data-time-record]');
      value.target = hit?.dataset.timeRecord && hit.dataset.timeRecord !== value.from ? hit.dataset.timeRecord : null;
      value.x2 = (event.clientX - rect.left) * ratio;
      value.y2 = (event.clientY - rect.top) * ratio;
      setLinkPreview({ ...value });
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      const value = connection.current;
      connection.current = null;
      setLinkPreview(null);
      if (value?.target) connect(value.from, value.target);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => {
      connection.current = null;
      setLinkPreview(null);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        connection.current = null;
        setLinkPreview(null);
      }
    },
    onClick: () => setFrom(row.id),
  });
  return (
    <div
      ref={root}
      className="timeline-preview timeline-canvas"
      onKeyDown={event => {
        if (event.key === 'Escape' && connection.current) {
          event.preventDefault();
          event.stopPropagation();
          connection.current = null;
          setLinkPreview(null);
        }
      }}
    >
      <fieldset className="timeline-controls" disabled={!onRows} {...canvasControl}>
        <select
          aria-label="Timeline scale"
          value={settings.scale ?? 'weeks'}
          onChange={event =>
            changeSettings({ ...settings, scale: event.target.value as TimelineSettings['scale'], fit: false })
          }
        >
          {['days', 'weeks', 'months', 'quarters', 'years'].map(scale => (
            <option key={scale} value={scale}>
              {scale[0].toUpperCase() + scale.slice(1)}
            </option>
          ))}
        </select>
        <button onClick={() => changeSettings({ ...settings, start: undefined, end: undefined, fit: true })}>
          Autofit
        </button>
        <label>
          Start
          <input
            aria-label="Timeline range start"
            type="date"
            value={settings.start ?? ''}
            onChange={event => changeSettings({ ...settings, start: event.target.value || undefined, fit: false })}
          />
        </label>
        <label>
          End
          <input
            aria-label="Timeline range end"
            type="date"
            value={settings.end ?? ''}
            onChange={event => changeSettings({ ...settings, end: event.target.value || undefined, fit: false })}
          />
        </label>
        <details className="timeline-dependency-controls">
          <summary>Dependencies</summary>
          <div>
            <select aria-label="Dependency from" value={from} onChange={event => setFrom(event.target.value)}>
              <option value="">From record</option>
              {full.map(row => (
                <option key={row.id} value={row.id}>
                  {row.title || 'Untitled record'}
                </option>
              ))}
            </select>
            <select aria-label="Dependency to" value={to} onChange={event => setTo(event.target.value)}>
              <option value="">To record</option>
              {full.map(row => (
                <option key={row.id} value={row.id}>
                  {row.title || 'Untitled record'}
                </option>
              ))}
            </select>
            <button disabled={!from || !to} onClick={() => connect(from, to)}>
              Add dependency
            </button>
            {(full.find(row => row.id === to)?.dependsOn ?? []).map(source => (
              <button
                key={source}
                aria-label={`Remove dependency from ${full.find(row => row.id === source)?.title || source}`}
                onClick={() => {
                  if (onRows) (onAllRows ?? onRows)(removeDependency(full, to, source));
                }}
              >
                <Trash2 size={12} />
                {full.find(row => row.id === source)?.title || source}
              </button>
            ))}
          </div>
        </details>
      </fieldset>
      {notice && (
        <p role="status" className="timeline-notice">
          {notice}
        </p>
      )}
      <div className="timeline-scroll">
        <div style={{ width: LABEL + axis.width }}>
          <div className="timeline-calendar" style={{ gridTemplateColumns: `${LABEL}px ${axis.width}px` }}>
            <strong>Records</strong>
            <div>
              {axis.ticks.map(tick => (
                <span key={tick.time} style={{ left: `${tick.left * 100}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
          <div ref={body} className="timeline-body">
            {display.map(entry => {
              if (entry.kind === 'group')
                return (
                  <div
                    key={`group:${entry.group.value}`}
                    className="timeline-group-heading"
                    data-timeline-group={entry.group.value}
                  >
                    <button
                      {...canvasControl}
                      aria-expanded={!entry.group.hidden}
                      disabled={!onToggleGroup}
                      onClick={() => onToggleGroup?.(entry.group.value)}
                    >
                      {entry.group.hidden ? '▸' : '▾'} {entry.group.label} ({entry.group.count})
                    </button>
                  </div>
                );
              const row = entry.row,
                bar = bars.get(row.id);
              return (
                <div
                  key={row.id}
                  className="timeline-row"
                  data-record={row.id}
                  data-connection-target={linkPreview?.target === row.id}
                  style={{ gridTemplateColumns: `140px ${axis.width}px` }}
                  onDragOver={event => {
                    if (onRows && [...event.dataTransfer.types].includes(ROW_MIME)) event.preventDefault();
                  }}
                  onDrop={event => {
                    if (!onRows) return;
                    try {
                      const value = JSON.parse(event.dataTransfer.getData(ROW_MIME));
                      if (value.scope !== scope) return;
                      event.preventDefault();
                      event.stopPropagation();
                      focusAfter.current = value.id;
                      onRows(reorderTimelineRow(rows, value.id, row.id));
                    } catch {
                      /* Foreign drag. */
                    }
                  }}
                >
                  <span className="timeline-record-label" title={row.title}>
                    {onRows && (
                      <button
                        {...canvasControl}
                        className="timeline-row-grip"
                        draggable
                        aria-label={`Move Timeline row: ${row.title}`}
                        title="Drag to reorder; Alt + up/down also moves rows"
                        onDragStart={event => {
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData(ROW_MIME, JSON.stringify({ scope, id: row.id }));
                        }}
                        onKeyDown={event => {
                          event.stopPropagation();
                          if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                          event.preventDefault();
                          const index = rows.findIndex(r => r.id === row.id),
                            toIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
                          if (toIndex < 0 || toIndex >= rows.length) return;
                          const next = [...rows];
                          [next[index], next[toIndex]] = [next[toIndex], next[index]];
                          focusAfter.current = row.id;
                          onRows(next);
                        }}
                      >
                        <GripVertical size={12} />
                      </button>
                    )}
                    {recordAction?.(row)}
                    {onRows ? (
                      <CanvasField
                        label={`Timeline title: ${row.title}`}
                        value={row.title}
                        onCommit={title => onRows(rows.map(r => (r.id === row.id ? { ...r, title } : r)))}
                      />
                    ) : (
                      row.title || 'Untitled record'
                    )}
                  </span>
                  <div className="timeline-row-track">
                    {bar ? (
                      <>
                        <span
                          {...barEvents(row)}
                          data-time-record={row.id}
                          className={
                            bar.milestone
                              ? 'timeline-milestone'
                              : `timeline-bar ${!row.start ? 'missing-start' : !row.end ? 'missing-end' : ''}`
                          }
                          title={bar.milestone ? `Milestone · ${row.start}` : undefined}
                          style={{
                            left: `${bar.left * 100}%`,
                            ...(bar.milestone ? {} : { width: `${Math.max(0.5, bar.width * 100)}%` }),
                          }}
                        >
                          {!bar.milestone && (
                            <>
                              {onRows && <span className="timeline-handle" data-time-handle="start" />}
                              {row.status}
                              {onRows && <span className="timeline-handle" data-time-handle="end" />}
                            </>
                          )}
                        </span>
                        {onRows && !row.milestone && (!row.start || !row.end) && (
                          <button
                            {...canvasControl}
                            className="timeline-fill-date"
                            style={{ left: `${Math.min(94, (bar.left + bar.width / 2) * 100)}%` }}
                            aria-label={`Add missing ${!row.start ? 'start' : 'end'} date: ${row.title}`}
                            onClick={() =>
                              onRows(
                                rows.map(r =>
                                  r.id === row.id ? { ...r, start: r.start || r.end, end: r.end || r.start } : r,
                                ),
                              )
                            }
                          >
                            +
                          </button>
                        )}
                        {onRows && (
                          <button
                            {...connectionEvents(row)}
                            data-time-record={row.id}
                            className="timeline-connect-handle"
                            style={{ left: `${Math.max(0, Math.min(98, (bar.left + bar.width) * 100))}%` }}
                            aria-label={`Connect dependency from ${row.title}`}
                            title="Drag to another time bar to connect a dependency"
                          >
                            <Link2 size={11} />
                          </button>
                        )}
                      </>
                    ) : onRows ? (
                      <button
                        {...canvasControl}
                        className="timeline-schedule"
                        aria-label={`Schedule record: ${row.title || 'Untitled record'}`}
                        onClick={() => {
                          const date = row.end || new Date().toISOString().slice(0, 10);
                          onRows(
                            rows.map(r => (r.id === row.id ? { ...r, start: date, end: r.milestone ? '' : date } : r)),
                          );
                        }}
                      >
                        + Schedule
                      </button>
                    ) : (
                      <small>Unscheduled</small>
                    )}
                  </div>
                </div>
              );
            })}
            <div
              className="timeline-row-end"
              onDragOver={event => {
                if (onRows && [...event.dataTransfer.types].includes(ROW_MIME)) event.preventDefault();
              }}
              onDrop={event => {
                if (!onRows) return;
                try {
                  const value = JSON.parse(event.dataTransfer.getData(ROW_MIME));
                  if (value.scope !== scope) return;
                  event.preventDefault();
                  event.stopPropagation();
                  focusAfter.current = value.id;
                  onRows(reorderTimelineRow(rows, value.id, null));
                } catch {
                  /* Foreign drag. */
                }
              }}
            >
              Drop here to move a record last
            </div>
            <div ref={area} className="timeline-links-area" style={{ width: axis.width }} aria-hidden="true">
              <svg width={axis.width} height={display.length * ROW} className="timeline-links">
                <defs>
                  <marker
                    id={`timeline-head-${scope}`}
                    viewBox="0 0 10 10"
                    refX={9}
                    refY={5}
                    markerWidth={6}
                    markerHeight={6}
                    orient="auto"
                  >
                    <path d="M0 0 L10 5 L0 10Z" fill="#5a5a66" />
                  </marker>
                </defs>
                {geometry.links.map(link => {
                  const x1 = link.x1 * axis.width,
                    x2 = link.x2 * axis.width,
                    y1 = yOf(link.fromRow),
                    y2 = yOf(link.toRow);
                  return (
                    <path
                      key={`${link.from}>${link.to}`}
                      data-timeline-dependency={`${link.from}>${link.to}`}
                      d={`M${x1} ${y1} H${x1 + 12} V${y2} H${x2}`}
                      fill="none"
                      stroke={link.late ? '#c2410c' : '#5a5a66'}
                      strokeDasharray={link.late ? '4 3' : undefined}
                      strokeWidth={1.5}
                      markerEnd={`url(#timeline-head-${scope})`}
                    />
                  );
                })}
                {linkPreview && (
                  <path
                    data-dependency-preview
                    d={`M${linkPreview.x1} ${linkPreview.y1} L${linkPreview.x2} ${linkPreview.y2}`}
                    fill="none"
                    stroke="#4262ff"
                    strokeDasharray="4 3"
                    strokeWidth={2}
                  />
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
