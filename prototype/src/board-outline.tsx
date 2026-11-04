// Board outline by frame (track R1): a heading per frame and its objects as buttons in reading order, so
// screen-reader users can explore the board by headings and pick an object by name (Alt+O).
import { X } from 'lucide-react';
import { useApp } from './board-app';
import { laneDescription, outlineByFrame } from './access-tools';
import { describeItem } from './navigation';
import { announce } from './announce';

const LIMIT = 400;

export function BoardOutline() {
  const { board, boardOutline, setBoardOutline, setSelected, fit, selected } = useApp();
  if (!boardOutline) return null;
  const sections = outlineByFrame(board);
  const choose = (id: string) => {
    const item = board.items.find(i => i.id === id);
    if (!item) return;
    setSelected([id]);
    if (!item.hidden) fit([item]);
    const lane = laneDescription(board, id);
    announce(describeItem(item) + (lane ? `, ${lane}` : ''));
  };
  let shown = 0;
  return (
    <aside
      className="outline board-outline floating"
      aria-label="Board outline"
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setBoardOutline(false);
        }
      }}
    >
      <div className="panel-heading">
        <h2>Board outline</h2>
        <button className="icon-button" aria-label="Close board outline" onClick={() => setBoardOutline(false)}>
          <X size={17} />
        </button>
      </div>
      <p>Frames are headings; objects are listed in reading order. Choose one to select it on the board.</p>
      <div className="object-list">
        {sections.map(s => {
          if (shown >= LIMIT) return null;
          const items = s.items.slice(0, LIMIT - shown);
          shown += items.length;
          return (
            <section key={s.frame?.id ?? 'loose'} aria-label={s.frame ? s.frame.title : 'Not in a frame'}>
              <h3>
                {s.frame ? (
                  <button
                    className={selected.includes(s.frame.id) ? 'selected' : ''}
                    onClick={() => choose(s.frame!.id)}
                  >
                    {s.frame.title}
                  </button>
                ) : (
                  'Not in a frame'
                )}
              </h3>
              {items.length ? (
                <ul>
                  {items.map(i => (
                    <li key={i.id}>
                      <button className={selected.includes(i.id) ? 'selected' : ''} onClick={() => choose(i.id)}>
                        {i.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="list-empty">Empty frame</p>
              )}
            </section>
          );
        })}
        {!sections.length && <p className="list-empty">The board is empty.</p>}
        {shown >= LIMIT && <p className="list-empty">Showing the first {LIMIT} objects.</p>}
      </div>
    </aside>
  );
}
