// History, Catch up and Board details (items 106–107), opened from the board menu.
import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from './board-app';
import { listVersions, MAX_VERSIONS } from './versions';
import { parseBoard } from './model';
import {
  activityKey,
  catchUp,
  changedSince,
  previousVisit,
  catchUpPeriods,
  dayLabel,
  describeType,
  parseActivity,
  restorable,
  restoreMany,
  catchUpSteps,
  type Activity,
} from './activity';
import { BOARD_DESCRIPTION_MAX, boardStatuses, cleanDescription, withSetting } from './board-settings';
import { boardEmoji, cleanEmoji, spacesOf } from './board-library';
import { settingsLocked, settingsLockedNote } from './board-modes';
import { useLibraryFiles } from './use-library-files';
import './library-r2.css';

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
  const [picked, setPicked] = useState<string[]>([]);
  const now = new Date();
  let lastDay = '';
  const canRestore = log.filter(e => restorable(boardRef.current, e)),
    pickedEntries = canRestore.filter(e => picked.includes(e.id));
  /** Restore entries in one change (one undo step), bringing back connectors deleted with them. */
  const restore = (entries: Activity[]) => {
    const made = restoreMany(boardRef.current, entries, log);
    if (!made) return display('These objects are already on the board.');
    update(made.board);
    setSelected(made.restored);
    fit(made.board.items.filter(i => made.restored.includes(i.id)));
    setLog(readLog(library.activeId));
    setPicked([]);
    const objects = made.restored.length - made.reattached;
    display(
      (objects === 1 && entries.length === 1
        ? `Restored ${describeType(entries[0].type)}.`
        : `Restored ${objects} ${objects === 1 ? 'object' : 'objects'}.`) +
        (made.reattached
          ? ` ${made.reattached} ${made.reattached === 1 ? 'connector was' : 'connectors were'} re-attached.`
          : '') +
        (made.detached
          ? ` ${made.detached} connector ${made.detached === 1 ? 'end was' : 'ends were'} left loose.`
          : ''),
    );
  };
  return (
    <Shell title="History" onClose={onClose}>
      <p>Changes made on this board in this browser, newest first. Deleted objects can be restored.</p>
      {canRestore.length > 1 && (
        <div className="history-batch" role="group" aria-label="Restore several">
          <label>
            <input
              type="checkbox"
              aria-label="Select all deleted objects"
              checked={pickedEntries.length === canRestore.length}
              onChange={e => setPicked(e.target.checked ? canRestore.map(x => x.id) : [])}
            />
            {pickedEntries.length ? `${pickedEntries.length} selected` : 'Select deleted objects'}
          </label>
          <button disabled={!pickedEntries.length} onClick={() => restore(pickedEntries)}>
            Restore selected
          </button>
        </div>
      )}
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
                  {canRestore.length > 1 && restorable(boardRef.current, e) && (
                    <input
                      type="checkbox"
                      className="history-pick"
                      aria-label={`Select deleted ${describeType(e.type)}${e.label ? `: ${e.label}` : ''}`}
                      checked={picked.includes(e.id)}
                      onChange={() => setPicked(p => (p.includes(e.id) ? p.filter(x => x !== e.id) : [...p, e.id]))}
                    />
                  )}
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
                  {e.action === 'deleted' && e.item && !exists && <button onClick={() => restore([e])}>Restore</button>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>No changes recorded yet.</p>
      )}
      <VersionList />
    </Shell>
  );
}

/** Saved versions of this board (gap C15): restore one as a new board. */
function VersionList() {
  const { library, boardActions, display } = useApp();
  const versions = listVersions(localStorage, library.activeId);
  return (
    <section className="version-list" aria-label="Versions">
      <h3>Versions</h3>
      <p>A copy is kept at most every 30 minutes while you edit (up to {MAX_VERSIONS}).</p>
      {versions.length ? (
        <ul>
          {versions.map(v => (
            <li key={v.at}>
              <span>
                {new Date(v.at).toLocaleString()} <small>· {v.items} objects</small>
              </span>
              <button
                onClick={() => {
                  try {
                    const restored = parseBoard(structuredClone(v.board));
                    const title = `${v.title || 'Untitled board'} (version ${new Date(v.at).toLocaleString()})`.slice(
                      0,
                      200,
                    );
                    if (boardActions.createFrom({ ...restored, title })) display('Opened the version as a new board.');
                  } catch {
                    display('This version could not be opened.');
                  }
                }}
              >
                Restore as new board
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No versions yet.</p>
      )}
    </section>
  );
}

export function CatchUpPanel({ onClose }: { onClose: () => void }) {
  const { library, boardRef, setSelected, fit, display } = useApp();
  const lastVisit = previousVisit(localStorage, library.activeId);
  const [period, setPeriod] = useState<(typeof catchUpPeriods)[number]['id'] | 'visit'>(lastVisit ? 'visit' : 'week');
  // Walkthrough (track R2-I): the changed objects, oldest change first, and the one shown now.
  const [walk, setWalk] = useState<{ steps: Activity[]; at: number } | null>(null);
  const log = readLog(library.activeId),
    since =
      period === 'visit' && lastVisit
        ? Date.parse(lastVisit)
        : Date.now() - catchUpPeriods.find(p => p.id === period)!.ms,
    s = catchUp(log, since);
  const goTo = (steps: Activity[], at: number) => {
    const target = steps[at],
      found = target && boardRef.current.items.find(i => i.id === target.itemId);
    setWalk({ steps, at });
    if (!found) return display('This object is no longer on the board.');
    setSelected([found.id]);
    fit([found]);
  };
  const startWalk = () => {
    const steps = catchUpSteps(log, since, new Set(boardRef.current.items.map(i => i.id)));
    if (!steps.length) return display('The changed objects are no longer on the board.');
    goTo(steps, 0);
  };
  const step = walk?.steps[walk.at];
  return (
    <Shell title="Catch up" onClose={onClose}>
      <label className="field">
        Time period
        <select
          aria-label="Time period"
          value={period}
          onChange={e => {
            setPeriod(e.target.value as typeof period);
            setWalk(null);
          }}
        >
          {lastVisit && <option value="visit">Since my last visit ({new Date(lastVisit).toLocaleString()})</option>}
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
          <button
            className="catchup-show"
            onClick={() => {
              const ids = changedSince(log, since, new Set(boardRef.current.items.map(i => i.id)));
              if (!ids.length) return display('The changed objects are no longer on the board.');
              setSelected(ids);
              fit(boardRef.current.items.filter(i => ids.includes(i.id)));
            }}
          >
            Show these on the board
          </button>
          <div className="catchup-walk" role="group" aria-label="Step through changes">
            <button
              aria-label="Previous change"
              disabled={!walk || walk.at === 0}
              onClick={() => walk && goTo(walk.steps, walk.at - 1)}
            >
              ‹ Previous
            </button>
            <span className="catchup-step" aria-live="polite">
              {walk ? `${walk.at + 1} of ${walk.steps.length}` : 'Step through'}
            </span>
            <button
              aria-label={walk ? 'Next change' : 'Step through the changes'}
              disabled={!!walk && walk.at >= walk.steps.length - 1}
              onClick={() => (walk ? goTo(walk.steps, walk.at + 1) : startWalk())}
            >
              {walk ? 'Next ›' : 'Start ›'}
            </button>
          </div>
          {step && (
            <p className="catchup-current">
              {step.action} {describeType(step.type)}
              {step.label && <em> · {step.label}</em>} <small>{new Date(step.at).toLocaleString()}</small>
            </p>
          )}
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
  const { board, boardRef, library, update, boardActions, display } = useApp();
  const meta = library.boards.find(b => b.id === library.activeId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const libraryFiles = useLibraryFiles();
  const emoji = boardEmoji(meta);
  // Read-only on a comment-only or view-only board (question P2-Q11).
  const locked = settingsLocked(board);
  const saveEmoji = (value: string) => {
    if (locked) return;
    const clean = cleanEmoji(value);
    if (value.trim() && !clean) return display('Use one short emoji or symbol.');
    if (clean !== emoji) boardActions.setMeta(library.activeId, { emoji: clean || null });
  };
  const saveDescription = (text: string) => {
    if (locked) return;
    const clean = cleanDescription(text);
    if (clean !== (boardRef.current.description ?? ''))
      update(withSetting(boardRef.current, 'description', clean || null));
  };
  const counts = Object.entries(
    board.items.reduce<Record<string, number>>((m, i) => ((m[i.type] = (m[i.type] ?? 0) + 1), m), {}),
  ).sort((a, b) => b[1] - a[1]);
  const bytes = new Blob([JSON.stringify(board)]).size;
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleString() : 'Unknown');
  return (
    <Shell title="Board details" onClose={onClose}>
      {locked && <p className="main-menu-note settings-locked-note">{settingsLockedNote(board)}</p>}
      <label className="field board-description-field">
        Description
        <textarea
          key={board.description ?? ''}
          aria-label="Board description"
          placeholder="What is this board for?"
          rows={3}
          maxLength={BOARD_DESCRIPTION_MAX}
          defaultValue={board.description ?? ''}
          readOnly={locked}
          onBlur={e => saveDescription(e.target.value)}
        />
      </label>
      <label className="field board-emoji-field">
        Emoji
        <input
          key={emoji}
          aria-label="Board emoji"
          placeholder="None"
          maxLength={16}
          defaultValue={emoji}
          readOnly={locked}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={e => saveEmoji(e.target.value)}
        />
      </label>
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
      <div className="details-actions" role="group" aria-label="Board actions">
        <label className="field">
          Move to space
          <select
            aria-label="Move board to space"
            value={meta?.space ?? ''}
            onChange={e => boardActions.setMeta(library.activeId, { space: e.target.value || null })}
          >
            <option value="">No space</option>
            {spacesOf(library).map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            boardActions.duplicate(library.activeId);
            display(
              `Board duplicated as "${(board.title || 'Untitled board').slice(0, 190)} copy". Find it under All boards.`,
            );
          }}
        >
          Duplicate board
        </button>
        <button onClick={() => void libraryFiles.backupBoards([library.activeId])}>Back up this board</button>
        {confirmDelete ? (
          <span className="board-confirm" role="alert">
            <span>Move this board to the trash?</span>
            <button className="danger-button" onClick={() => boardActions.remove(library.activeId)}>
              Move to trash
            </button>
            <button onClick={() => setConfirmDelete(false)}>Keep</button>
          </span>
        ) : (
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            Delete board
          </button>
        )}
      </div>
    </Shell>
  );
}
