// History, Catch up and Board details (items 106–107), opened from the board menu.
import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from './board-app';
import {
  activityKey,
  catchUp,
  catchUpPeriods,
  dayLabel,
  describeType,
  parseActivity,
  restoreDeleted,
  type Activity,
} from './activity';
import { boardStatuses } from './board-settings';

const readLog = (boardId: string): Activity[] => {
  try {
    return parseActivity(localStorage.getItem(activityKey(boardId)));
  } catch {
    return [];
  }
};
const time = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside
      className="facilitate-panel floating board-side-panel"
      aria-label={title}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {children}
    </aside>
  );
}

export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const { library, boardRef, update, setSelected, fit, display } = useApp();
  const [log, setLog] = useState(() => readLog(library.activeId));
  const now = new Date();
  let lastDay = '';
  return (
    <Shell title="History" onClose={onClose}>
      <p>Changes made on this board in this browser, newest first. Deleted objects can be restored.</p>
      {log.length ? (
        <ol className="history-list" aria-label="Activity">
          {log.map(e => {
            const day = dayLabel(e.at, now),
              heading = day !== lastDay ? day : '';
            lastDay = day;
            const exists = boardRef.current.items.some(i => i.id === e.itemId);
            return (
              <li key={e.id}>
                {heading && <h3>{heading}</h3>}
                <div className="history-row">
                  <button
                    className="history-entry"
                    disabled={!exists}
                    onClick={() => {
                      const item = boardRef.current.items.find(i => i.id === e.itemId);
                      if (item) {
                        setSelected([item.id]);
                        fit([item]);
                      }
                    }}
                  >
                    <span>
                      {e.action} {describeType(e.type)}
                      {e.label && <em> · {e.label}</em>}
                    </span>
                    <small>{time(e.at)}</small>
                  </button>
                  {e.action === 'deleted' && e.item && !exists && (
                    <button
                      onClick={() => {
                        const restored = restoreDeleted(boardRef.current, e);
                        if (!restored) return;
                        update(restored);
                        setSelected([e.itemId]);
                        fit([e.item!]);
                        setLog(readLog(library.activeId));
                        display(`Restored ${describeType(e.type)}.`);
                      }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>No changes recorded yet.</p>
      )}
    </Shell>
  );
}

export function CatchUpPanel({ onClose }: { onClose: () => void }) {
  const { library } = useApp();
  const [period, setPeriod] = useState<(typeof catchUpPeriods)[number]['id']>('week');
  const log = readLog(library.activeId),
    ms = catchUpPeriods.find(p => p.id === period)!.ms,
    s = catchUp(log, Date.now() - ms);
  return (
    <Shell title="Catch up" onClose={onClose}>
      <label className="field">
        Time period
        <select aria-label="Time period" value={period} onChange={e => setPeriod(e.target.value as typeof period)}>
          {catchUpPeriods.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <h3>Here's what happened</h3>
      {s.total ? (
        <>
          <p className="catchup-totals">
            {s.added} added · {s.edited} edited · {s.deleted} deleted
          </p>
          <ul className="catchup-types" aria-label="Changes by type">
            {Object.entries(s.byType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, n]) => (
                <li key={type}>
                  <span>{describeType(type)}</span>
                  <b>{n}</b>
                </li>
              ))}
          </ul>
        </>
      ) : (
        <p>Nothing changed in this period.</p>
      )}
    </Shell>
  );
}

export function DetailsPanel({ onClose }: { onClose: () => void }) {
  const { board, library } = useApp();
  const meta = library.boards.find(b => b.id === library.activeId);
  const counts = Object.entries(
    board.items.reduce<Record<string, number>>((m, i) => ((m[i.type] = (m[i.type] ?? 0) + 1), m), {}),
  ).sort((a, b) => b[1] - a[1]);
  const bytes = new Blob([JSON.stringify(board)]).size;
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleString() : 'Unknown');
  return (
    <Shell title="Board details" onClose={onClose}>
      <dl className="details-list">
        <dt>Name</dt>
        <dd>{board.title || 'Untitled board'}</dd>
        <dt>Status</dt>
        <dd>{boardStatuses.find(s => s.id === board.status)?.label ?? 'None'}</dd>
        <dt>Created</dt>
        <dd>{date(meta?.createdAt)}</dd>
        <dt>Last modified</dt>
        <dd>{date(meta?.updatedAt)}</dd>
        <dt>Location</dt>
        <dd>This browser{meta?.space ? ` · ${meta.space}` : ''}</dd>
        <dt>Objects</dt>
        <dd>{board.items.length.toLocaleString()}</dd>
        <dt>Size</dt>
        <dd>
          {bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`} (without media)
        </dd>
      </dl>
      {counts.length > 0 && (
        <ul className="catchup-types" aria-label="Objects by type">
          {counts.map(([type, n]) => (
            <li key={type}>
              <span>{describeType(type)}</span>
              <b>{n}</b>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
