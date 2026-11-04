// Board menu next to the board name (item 103): status, background colour, start view and duplicate.
import { useState } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { useApp } from './board-app';
import { screenToWorld } from './camera';
import { boardBackgrounds, boardStatuses, DEFAULT_BACKGROUND, withSetting } from './board-settings';
import { CatchUpPanel, DetailsPanel, HistoryPanel } from './board-history';
import { spacesOf } from './board-library';

export function BoardStatusChip() {
  const { board } = useApp();
  const status = boardStatuses.find(s => s.id === board.status);
  if (!status) return null;
  return (
    <span className="board-status" style={{ background: status.color }} title="Board status">
      {status.label}
    </span>
  );
}

export function BoardMenu() {
  const { board, boardRef, camera, size, update, display, library, boardActions } = useApp();
  const [open, setOpen] = useState(false),
    [panel, setPanel] = useState<'history' | 'catchup' | 'details' | null>(null),
    [newSpace, setNewSpace] = useState('');
  const meta = library.boards.find(b => b.id === library.activeId),
    spaces = spacesOf(library);
  const openPanel = (p: 'history' | 'catchup' | 'details') => {
    setPanel(p);
    setOpen(false);
  };
  const background = board.background ?? DEFAULT_BACKGROUND;
  const set = (change: Parameters<typeof update>[0]) => update(change);
  return (
    <div className="menu-anchor">
      <button
        className="icon-button"
        aria-label="Board menu"
        aria-expanded={open}
        title="Board menu"
        onClick={() => setOpen(o => !o)}
      >
        <EllipsisVertical size={17} />
      </button>
      {open && (
        <div
          className="dropdown floating board-menu"
          role="dialog"
          aria-label="Board settings"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <h3>Status</h3>
          <div className="board-menu-row" role="radiogroup" aria-label="Board status">
            <button
              role="radio"
              aria-checked={!board.status}
              onClick={() => set(withSetting(boardRef.current, 'status', null))}
            >
              None
            </button>
            {boardStatuses.map(s => (
              <button
                key={s.id}
                role="radio"
                aria-checked={board.status === s.id}
                onClick={() => set(withSetting(boardRef.current, 'status', s.id))}
              >
                <i style={{ background: s.color }} /> {s.label}
              </button>
            ))}
          </div>
          <h3>Background color</h3>
          <div className="board-menu-swatches" role="radiogroup" aria-label="Background color">
            {boardBackgrounds.map(b => (
              <button
                key={b.color}
                role="radio"
                aria-label={b.name}
                title={b.name}
                aria-checked={background === b.color}
                style={{ background: b.color }}
                onClick={() => set(withSetting(boardRef.current, 'background', b.color))}
              />
            ))}
          </div>
          <h3>Start view</h3>
          <p>
            {board.startView ? `Opens at ${Math.round(board.startView.z * 100)}% zoom.` : 'Opens at the default view.'}
          </p>
          <div className="board-menu-row">
            <button
              onClick={() => {
                const c = screenToWorld(camera, { x: size.w / 2, y: size.h / 2 });
                set(
                  withSetting(boardRef.current, 'startView', { x: Math.round(c.x), y: Math.round(c.y), z: camera.z }),
                );
                display('This view is now the board’s start view.');
              }}
            >
              Use current view
            </button>
            {board.startView && (
              <button onClick={() => set(withSetting(boardRef.current, 'startView', null))}>Clear start view</button>
            )}
          </div>
          <h3>Board</h3>
          <div className="board-menu-row">
            <button onClick={() => openPanel('catchup')}>Catch up</button>
            <button onClick={() => openPanel('history')}>History</button>
            <button onClick={() => openPanel('details')}>Details</button>
            <button
              aria-pressed={!!meta?.starred}
              onClick={() => boardActions.setMeta(library.activeId, { starred: !meta?.starred })}
            >
              {meta?.starred ? 'Unstar board' : 'Star this board'}
            </button>
            <button
              onClick={() => {
                boardActions.duplicate(library.activeId);
                setOpen(false);
                display('Board duplicated. Find the copy under All boards.');
              }}
            >
              Duplicate board
            </button>
          </div>
          <h3>Move to</h3>
          <div className="board-menu-row" role="radiogroup" aria-label="Space">
            <button
              role="radio"
              aria-checked={!meta?.space}
              onClick={() => boardActions.setMeta(library.activeId, { space: null })}
            >
              No space
            </button>
            {spaces.map(s => (
              <button
                key={s}
                role="radio"
                aria-checked={meta?.space === s}
                onClick={() => boardActions.setMeta(library.activeId, { space: s })}
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="board-menu-row"
            onSubmit={e => {
              e.preventDefault();
              if (!newSpace.trim()) return;
              boardActions.setMeta(library.activeId, { space: newSpace });
              setNewSpace('');
            }}
          >
            <input
              aria-label="New space name"
              placeholder="New space"
              maxLength={60}
              value={newSpace}
              onChange={e => setNewSpace(e.target.value)}
            />
            <button type="submit" disabled={!newSpace.trim()}>
              Move
            </button>
          </form>
        </div>
      )}
      {panel === 'history' && <HistoryPanel onClose={() => setPanel(null)} />}
      {panel === 'catchup' && <CatchUpPanel onClose={() => setPanel(null)} />}
      {panel === 'details' && <DetailsPanel onClose={() => setPanel(null)} />}
    </div>
  );
}
