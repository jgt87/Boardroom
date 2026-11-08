// Selection-bar actions for presentation and facilitation (gaps G1, G2, G6, G7, G8, G11) and the clock that
// ends timed voting sessions (G5). Rendered by the selection bar and the floating panels through useApp().
import React, { useEffect, useState } from 'react';
import { NotebookPen, MonitorOff, Palette, Group, FileText, Shuffle, CopyPlus, Heading } from 'lucide-react';
import { frameTitleHidden, setFrameTitleHidden } from './frame-workflow';
import { copyFrame, shuffleFrameStyle, FRAME_COPIES_MAX } from './frame-tools';
import { useApp } from './board-app';
import { expandGroups } from './arrange';
import { frameNotes, isHiddenSlide, setFrameNotes, setHiddenSlide } from './navigation';
import { NotesEditor } from './presentation';
import { applyFrameStyle, framePalettes, frameStyleOf, removeFrameStyle } from './frame-styles';
import { clusterLabels, clusterSelection, clusterAsOne } from './cluster';
import type { ClusterBy } from './cluster';
import { notesToDoc } from './notes';
import type { OutlineBy } from './notes';
import { shuffleFlipCards } from './facilitation-widgets';
import { endVoting } from './board-tools';
import { votingExpired, voteLabel } from './facilitation-rules';
import { useLatest } from './use-latest';
import './facilitation.css';

type Open = 'notes' | 'style' | 'cluster' | 'doc' | 'copies' | null;

/** Popover below a selection-bar button. Keys and pointer presses stay inside it. */
function Popover({ label, children, onClose }: { label: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fx-popover floating"
      role="dialog"
      aria-label={label}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      {children}
    </div>
  );
}

export function FacilitationActions() {
  const { board, boardRef, selected, selectedItem, run, update, setSelected, display, setEditing } = useApp();
  const [open, setOpen] = useState<Open>(null),
    [copies, setCopies] = useState(3),
    [openFor, setOpenFor] = useState(selected.join());
  // Close any popover when the selection changes.
  if (openFor !== selected.join()) {
    setOpenFor(selected.join());
    if (open) setOpen(null);
  }
  const ids = expandGroups(board, selected),
    items = board.items.filter(i => ids.includes(i.id)),
    frames = items.filter(i => i.type === 'frame'),
    notes = items.filter(i => i.type === 'note'),
    flips = items.filter(i => i.type === 'flipcard'),
    frame = selected.length === 1 && selectedItem?.type === 'frame' ? selectedItem : null,
    onlyFrames = frames.length > 0 && frames.length === selected.length,
    styled = frames.some(f => frameStyleOf(f));
  const toggle = (which: Exclude<Open, null>) => {
    setEditing(null);
    setOpen(open === which ? null : which);
  };
  const cluster = (by: ClusterBy) => {
    try {
      const r = clusterSelection(boardRef.current, ids, by);
      update(r.board);
      setSelected([...r.clusters.flatMap(c => c.ids), ...r.titleIds]);
      setOpen(null);
      display(
        `Grouped ${r.clusters.reduce((s, c) => s + c.ids.length, 0)} notes into ${r.clusters.length} cluster frame${r.clusters.length === 1 ? '' : 's'}. Undo restores the layout.`,
      );
    } catch (err) {
      display((err as Error).message, undefined, 'error');
    }
  };
  const clusterOne = () => {
    try {
      const r = clusterAsOne(boardRef.current, ids);
      update(r.board);
      setSelected([r.frameId]);
      setOpen(null);
      setEditing(r.frameId);
      display('Put the notes in one cluster frame. Type a name for it.');
    } catch (err) {
      display((err as Error).message, undefined, 'error');
    }
  };
  const toDoc = (by: OutlineBy) => {
    try {
      const r = notesToDoc(boardRef.current, ids, by);
      update(r.board);
      setSelected([r.docId]);
      setOpen(null);
      display('Doc created from the selected notes.');
    } catch (err) {
      display((err as Error).message, undefined, 'error');
    }
  };
  if (!frame && !onlyFrames && notes.length < 2 && flips.length < 2) return null;
  return (
    <>
      {frame && (
        <>
          <span className="fx-wrap">
            <button
              className={`icon-button ${frameNotes(frame) ? 'active' : ''}`}
              aria-label="Presenter notes"
              aria-expanded={open === 'notes'}
              title="Presenter notes"
              onClick={() => toggle('notes')}
            >
              <NotebookPen size={17} />
            </button>
            {open === 'notes' && (
              <Popover label="Presenter notes" onClose={() => setOpen(null)}>
                <h3>Presenter notes</h3>
                <NotesEditor
                  value={frameNotes(frame)}
                  label="Presenter notes text"
                  onSave={text => {
                    run(b => setFrameNotes(b, frame.id, text));
                    setOpen(null);
                  }}
                  onCancel={() => setOpen(null)}
                />
                <p className="fx-hint">Shown only to you while presenting (press N).</p>
              </Popover>
            )}
          </span>
          <button
            className={`icon-button ${isHiddenSlide(frame) ? 'active' : ''}`}
            aria-label={isHiddenSlide(frame) ? 'Show in presentation' : 'Hide from presentation'}
            aria-pressed={isHiddenSlide(frame)}
            title={isHiddenSlide(frame) ? 'Show in presentation' : 'Hide from presentation'}
            onClick={() => run(b => setHiddenSlide(b, frame.id, !isHiddenSlide(frame)))}
          >
            <MonitorOff size={17} />
          </button>
          <button
            className={`icon-button ${frameTitleHidden(frame) ? 'active' : ''}`}
            aria-label={frameTitleHidden(frame) ? 'Show frame title' : 'Hide frame title'}
            aria-pressed={frameTitleHidden(frame)}
            title={frameTitleHidden(frame) ? 'Show frame title' : 'Hide frame title'}
            onClick={() => run(b => setFrameTitleHidden(b, frame.id, !frameTitleHidden(frame)))}
          >
            <Heading size={17} />
          </button>
          <span className="fx-wrap">
            <button
              className="icon-button"
              aria-label="Make copies of frame"
              aria-expanded={open === 'copies'}
              title="Make copies of this frame and its contents"
              onClick={() => toggle('copies')}
            >
              <CopyPlus size={17} />
            </button>
            {open === 'copies' && (
              <Popover label="Make copies of frame" onClose={() => setOpen(null)}>
                <h3>Make copies</h3>
                <form
                  className="fx-copies"
                  onSubmit={e => {
                    e.preventDefault();
                    try {
                      const r = copyFrame(boardRef.current, frame.id, copies);
                      update(r.board);
                      setSelected(r.frames);
                      setOpen(null);
                      display(`Made ${copies} ${copies === 1 ? 'copy' : 'copies'} of the frame. Undo removes them.`);
                    } catch (err) {
                      display((err as Error).message, undefined, 'error');
                    }
                  }}
                >
                  <label>
                    Copies
                    <input
                      type="number"
                      min={1}
                      max={FRAME_COPIES_MAX}
                      value={copies}
                      aria-label="Number of copies"
                      onChange={e =>
                        setCopies(Math.max(1, Math.min(FRAME_COPIES_MAX, Math.round(Number(e.target.value)) || 1)))
                      }
                    />
                  </label>
                  <button type="submit" className="primary">
                    Make copies
                  </button>
                </form>
                <p className="fx-hint">Copies are placed in a row to the right, with everything inside the frame.</p>
              </Popover>
            )}
          </span>
        </>
      )}
      {onlyFrames && (
        <span className="fx-wrap">
          <button
            className={`icon-button ${styled ? 'active' : ''}`}
            aria-label="Frame style"
            aria-expanded={open === 'style'}
            title="Recolour notes, shapes and text in the frame"
            onClick={() => toggle('style')}
          >
            <Palette size={17} />
          </button>
          {open === 'style' && (
            <Popover label="Frame style" onClose={() => setOpen(null)}>
              <h3>Frame style</h3>
              <div className="fx-palettes">
                {framePalettes.map(p => (
                  <button
                    key={p.id}
                    aria-label={`Apply ${p.name} style`}
                    aria-pressed={frames.every(f => frameStyleOf(f)?.id === p.id)}
                    onClick={() =>
                      run(b =>
                        applyFrameStyle(
                          b,
                          frames.map(f => f.id),
                          p.id,
                        ),
                      )
                    }
                  >
                    <span className="fx-swatches" style={{ background: p.frame }}>
                      {p.notes.slice(0, 3).map(c => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
              <button
                className="fx-remove"
                onClick={() =>
                  run(b =>
                    shuffleFrameStyle(
                      b,
                      frames.map(f => f.id),
                    ),
                  )
                }
              >
                <Shuffle size={14} /> Shuffle style
              </button>
              <button
                className="fx-remove"
                disabled={!styled}
                onClick={() =>
                  run(b =>
                    removeFrameStyle(
                      b,
                      frames.map(f => f.id),
                    ),
                  )
                }
              >
                Remove style
              </button>
            </Popover>
          )}
        </span>
      )}
      {notes.length >= 2 && (
        <>
          <span className="fx-wrap">
            <button
              className="icon-button"
              aria-label="Cluster notes"
              aria-expanded={open === 'cluster'}
              title="Cluster notes by colour, tag, author or keyword"
              onClick={() => toggle('cluster')}
            >
              <Group size={17} />
            </button>
            {open === 'cluster' && (
              <Popover label="Cluster notes" onClose={() => setOpen(null)}>
                <h3>Cluster {notes.length} notes by</h3>
                <div className="fx-choices">
                  {(Object.keys(clusterLabels) as ClusterBy[]).map(by => (
                    <button key={by} onClick={() => cluster(by)}>
                      {clusterLabels[by]}
                    </button>
                  ))}
                </div>
                <p className="fx-hint">Keyword groups notes that share words. It runs on this device.</p>
                <div className="fx-choices">
                  <button onClick={clusterOne}>One cluster</button>
                </div>
                <p className="fx-hint">Each cluster is a frame: rename it, resize it, drag notes in or out.</p>
              </Popover>
            )}
          </span>
          <span className="fx-wrap">
            <button
              className="icon-button"
              aria-label="Notes to doc"
              aria-expanded={open === 'doc'}
              title="Summarise notes in a doc"
              onClick={() => toggle('doc')}
            >
              <FileText size={17} />
            </button>
            {open === 'doc' && (
              <Popover label="Notes to doc" onClose={() => setOpen(null)}>
                <h3>Create a doc outline, grouped by</h3>
                <div className="fx-choices">
                  <button onClick={() => toDoc('color')}>Colour</button>
                  <button onClick={() => toDoc('frame')}>Frame</button>
                </div>
              </Popover>
            )}
          </span>
        </>
      )}
      {flips.length >= 2 && (
        <button
          className="icon-button"
          aria-label="Shuffle flip cards"
          title="Shuffle flip cards"
          onClick={() => run(b => shuffleFlipCards(b, ids))}
        >
          <Shuffle size={17} />
        </button>
      )}
    </>
  );
}

/** Ends a timed voting session when its time runs out, wherever the voting panel is. */
export function VotingClock() {
  const { board, boardRef, update, display } = useApp();
  const endsAt = board.voting?.active ? board.voting.endsAt : undefined,
    updateRef = useLatest(update),
    displayRef = useLatest(display);
  useEffect(() => {
    if (!endsAt) return;
    const finish = () => {
      if (!votingExpired(boardRef.current, Date.now())) return;
      try {
        updateRef.current(endVoting(boardRef.current, voteLabel).board);
        displayRef.current('Voting time is over. Results are saved with the board.');
      } catch {
        /* the session already ended */
      }
    };
    // Timers are capped near 24 days; voting sessions last at most 240 minutes.
    const id = setTimeout(finish, Math.max(0, Date.parse(endsAt) - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [endsAt, boardRef, updateRef, displayRef]);
  return null;
}
