import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Play,
  Plus,
  Eye,
  EyeOff,
  NotebookPen,
  LayoutGrid,
  Moon,
  ExternalLink,
  Timer as TimerIcon,
  Vote,
  SmilePlus,
  Map as MapIcon,
  ArrowDownWideNarrow,
} from 'lucide-react';
import type { Board, Item, FrameFormat } from './model';
import { slideObjectAt, slideObjects } from './presentation-tools';
import { reactionChoices, sendReaction } from './collab-extras';
import { framePresets, presetSize } from './frame-presets';
import { presentationFrames, fitFrame, slideFrames, isHiddenSlide, frameNotes, FRAME_NOTES_LIMIT } from './navigation';
import { useLatest } from './use-latest';
import type { Camera } from './navigation';

/** Frame format controls in the selection bar: preset, orientation and custom size. */
export function FrameControls({
  item,
  onApply,
}: {
  item: Item;
  onApply: (preset: string, orientation: FrameFormat['orientation'], custom?: { w: number; h: number }) => void;
}) {
  const preset = item.frame?.preset ?? 'custom',
    orientation = item.frame?.orientation ?? (item.w >= item.h ? 'landscape' : 'portrait');
  const [w, setW] = useState(String(Math.round(item.w))),
    [h, setH] = useState(String(Math.round(item.h)));
  useEffect(() => {
    setW(String(Math.round(item.w)));
    setH(String(Math.round(item.h)));
  }, [item.w, item.h]);
  const commit = () => {
    const cw = Number(w),
      ch = Number(h);
    if (cw === Math.round(item.w) && ch === Math.round(item.h)) return;
    onApply('custom', cw >= ch ? 'landscape' : 'portrait', { w: cw, h: ch });
  };
  return (
    <div className="frame-controls" aria-label="Frame format">
      <select
        aria-label="Frame format"
        value={preset}
        onChange={e =>
          onApply(
            e.target.value,
            e.target.value === 'custom'
              ? orientation
              : presetSize(e.target.value, orientation)
                ? orientation
                : 'portrait',
          )
        }
      >
        {(['Custom', 'Presentation', 'Paper', 'Device'] as const).map(group => (
          <optgroup key={group} label={group}>
            {framePresets
              .filter(p => p.group === group)
              .map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                  {p.w ? ` · ${p.w}×${p.h}` : ''}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <div className="segmented" role="group" aria-label="Orientation">
        {(['portrait', 'landscape'] as const).map(o => (
          <button
            key={o}
            aria-pressed={orientation === o}
            className={orientation === o ? 'active' : ''}
            onClick={() => onApply(preset, o)}
          >
            {o === 'portrait' ? 'Portrait' : 'Landscape'}
          </button>
        ))}
      </div>
      <label className="size-field">
        W
        <input
          aria-label="Frame width"
          type="number"
          min={40}
          max={20000}
          value={w}
          onChange={e => setW(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
          }}
        />
      </label>
      <label className="size-field">
        H
        <input
          aria-label="Frame height"
          type="number"
          min={40}
          max={20000}
          value={h}
          onChange={e => setH(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit();
          }}
        />
      </label>
    </div>
  );
}

/** Presentation order editor with presenter notes and hide-from-presentation (gaps G1, G2). Changes are undoable. */
export function PresentationPanel({
  board,
  onMove,
  onStart,
  onShow,
  onClose,
  onAdd,
  onHide,
  onNotes,
  onSort,
}: {
  board: Board;
  onAdd?: () => void;
  /** Order the frames by their position on the board (track R5). */
  onSort?: () => void;
  onMove: (id: string, delta: number) => void;
  /** Index into the visible slides (hidden frames excluded). */
  onStart: (index: number) => void;
  onShow: (frame: Item) => void;
  onClose: () => void;
  onHide?: (id: string, hidden: boolean) => void;
  onNotes?: (id: string, notes: string) => void;
}) {
  const frames = presentationFrames(board),
    slides = frames.filter(f => !isHiddenSlide(f)),
    [notesFor, setNotesFor] = useState<string | null>(null);
  return (
    <aside
      className="presentation-panel floating"
      aria-label="Presentation"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel-heading">
        <h2>
          Presentation <span>{slides.length}</span>
        </h2>
        <button className="icon-button" aria-label="Close presentation" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      {frames.length ? (
        <>
          <ol className="slide-list">
            {frames.map((f, i) => {
              const hidden = isHiddenSlide(f),
                name = f.text || 'frame',
                notes = frameNotes(f);
              return (
                <React.Fragment key={f.id}>
                  <li className={hidden ? 'hidden-slide' : ''}>
                    <button
                      className="slide-name"
                      onClick={() => onShow(f)}
                      title={hidden ? 'Hidden from the presentation' : undefined}
                    >
                      <b>{hidden ? '–' : slides.indexOf(f) + 1}</b>
                      {f.text || 'Untitled frame'}
                      {hidden && <small className="slide-flag">Hidden</small>}
                    </button>
                    {onNotes && (
                      <button
                        className={`icon-button ${notes ? 'active' : ''}`}
                        aria-label={`Presenter notes for ${name}`}
                        aria-expanded={notesFor === f.id}
                        title={notes ? 'Edit presenter notes' : 'Add presenter notes'}
                        onClick={() => setNotesFor(notesFor === f.id ? null : f.id)}
                      >
                        <NotebookPen size={15} />
                      </button>
                    )}
                    {onHide && (
                      <button
                        className={`icon-button ${hidden ? 'active' : ''}`}
                        aria-label={hidden ? `Show ${name} in presentation` : `Hide ${name} from presentation`}
                        aria-pressed={hidden}
                        title={hidden ? 'Show in presentation' : 'Hide from presentation'}
                        onClick={() => onHide(f.id, !hidden)}
                      >
                        {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Move ${name} earlier`}
                      disabled={!i}
                      onClick={() => onMove(f.id, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${name} later`}
                      disabled={i === frames.length - 1}
                      onClick={() => onMove(f.id, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Present from ${name}`}
                      disabled={hidden}
                      onClick={() => onStart(slides.indexOf(f))}
                    >
                      <Play size={15} />
                    </button>
                  </li>
                  {onNotes && notesFor === f.id && (
                    <li className="slide-notes">
                      <NotesEditor
                        key={f.id}
                        value={notes}
                        label={`Presenter notes for ${name}`}
                        onSave={text => {
                          onNotes(f.id, text);
                          setNotesFor(null);
                        }}
                        onCancel={() => setNotesFor(null)}
                      />
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </ol>
          {onSort && frames.length > 1 && (
            <button className="add-frame" onClick={onSort} title="Order frames by rows, top to bottom, left to right">
              <ArrowDownWideNarrow size={15} /> Sort by position
            </button>
          )}
          <button className="primary present-start" disabled={!slides.length} onClick={() => onStart(0)}>
            <Play size={16} />
            Present from the start
          </button>
        </>
      ) : (
        <p>Add frames to build a presentation. Each frame becomes one slide.</p>
      )}
      {onAdd && (
        <button className="add-frame" onClick={onAdd}>
          <Plus size={15} /> Add frame
        </button>
      )}
    </aside>
  );
}

/** Text area for presenter notes with Save and Cancel; Ctrl+Enter saves. */
export function NotesEditor({
  value,
  label,
  onSave,
  onCancel,
}: {
  value: string;
  label: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  return (
    <form
      className="notes-editor"
      onSubmit={e => {
        e.preventDefault();
        onSave(text);
      }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onSave(text);
        }
      }}
    >
      <textarea
        autoFocus
        aria-label={label}
        placeholder="What to say on this slide"
        maxLength={FRAME_NOTES_LIMIT}
        rows={5}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      <div className="note-details-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={text === value}>
          Save notes
        </button>
      </div>
    </form>
  );
}

const NOTES_WINDOW = 'boardroom-presenter-notes';
/** Fill the pop-out notes window with DOM nodes only (no markup strings, no scripts). */
function renderNotesWindow(w: Window, frame: Item, position: string, next: Item | undefined) {
  const doc = w.document;
  doc.title = 'Presenter notes';
  const body = doc.body;
  body.replaceChildren();
  body.style.cssText =
    'margin:0;padding:24px;font:16px/1.6 Arial,Helvetica,sans-serif;background:#1d1e24;color:#f4f4f6';
  const small = doc.createElement('div');
  small.textContent = `Slide ${position}`;
  small.style.cssText = 'font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a9abb8';
  const title = doc.createElement('h1');
  title.textContent = frame.text || 'Untitled frame';
  title.style.cssText = 'font-size:22px;margin:4px 0 16px';
  const notes = doc.createElement('div');
  notes.textContent = frameNotes(frame) || 'No notes for this frame.';
  notes.style.cssText = `white-space:pre-wrap;font-size:20px;${frameNotes(frame) ? '' : 'color:#a9abb8'}`;
  const after = doc.createElement('p');
  after.textContent = next ? `Next: ${next.text || 'Untitled frame'}` : 'Last slide';
  after.style.cssText = 'margin-top:28px;color:#a9abb8;font-size:13px';
  body.append(small, title, notes, after);
}

/** Small schematic of a frame's contents for the slide overview: object rectangles in their colours. */
function SlideThumb({ board, frame }: { board: Board; frame: Item }) {
  const inside = board.items
    .filter(
      i =>
        i.id !== frame.id &&
        !i.hidden &&
        !['arrow', 'pen', 'frame'].includes(i.type) &&
        i.x + i.w / 2 >= frame.x &&
        i.x + i.w / 2 <= frame.x + frame.w &&
        i.y + i.h / 2 >= frame.y &&
        i.y + i.h / 2 <= frame.y + frame.h,
    )
    .slice(0, 200);
  return (
    <svg viewBox={`${frame.x} ${frame.y} ${Math.max(frame.w, 1)} ${Math.max(frame.h, 1)}`} aria-hidden="true">
      <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill={frame.fill} />
      {inside.map(i => (
        <rect
          key={i.id}
          x={i.x}
          y={i.y}
          width={i.w}
          height={i.h}
          rx={4}
          fill={i.type === 'text' ? '#d4d4d8' : i.fill}
        />
      ))}
    </svg>
  );
}

/**
 * Full-screen presentation. Editing is disabled; Esc restores the editing view. Frames hidden from the
 * presentation are skipped. The presenter can show notes (inline or in a pop-out window), open a slide
 * overview (G) to jump to a frame, and darken everything outside the current frame.
 */
export function PresentOverlay({
  board,
  start,
  size,
  onCamera,
  onExit,
  getOrigin = () => ({ x: 0, y: 0 }),
  onCanvas,
  timerOn,
  onTimer,
  onStartVote,
  onEndVote,
  onVote,
}: {
  board: Board;
  start: number;
  size: { w: number; h: number };
  onCamera: (c: Camera) => void;
  onExit: () => void;
  /** Screen position of the canvas, for click-to-zoom and vote badges. */
  getOrigin?: () => { x: number; y: number };
  /** Leave the presentation and stay on the current frame. */
  onCanvas?: (frame: Item) => void;
  timerOn?: boolean;
  onTimer?: () => void;
  /** Start a dot-voting session on the objects of the current slide. */
  onStartVote?: (ids: string[]) => void;
  onEndVote?: () => void;
  onVote?: (id: string, delta: 1 | -1) => void;
}) {
  const frames = useMemo(() => slideFrames(board), [board]),
    [index, setIndex] = useState(start),
    [grid, setGrid] = useState(false),
    [showNotes, setShowNotes] = useState(false),
    [dark, setDark] = useState(false),
    [blocked, setBlocked] = useState(false),
    [popup, setPopup] = useState<Window | null>(null),
    [reacting, setReacting] = useState(false),
    [zoomed, setZoomed] = useState<{ frame: string; item: Item } | null>(null),
    exit = useRef<HTMLButtonElement>(null);
  const safe = Math.max(0, Math.min(index, frames.length - 1)),
    frame = frames[safe],
    next = frames[safe + 1],
    zoom = zoomed && frame && zoomed.frame === frame.id ? zoomed.item : null,
    exitRef = useLatest(onExit),
    cameraRef = useLatest(onCamera),
    frameRef = useLatest(frame),
    gridRef = useLatest(grid),
    zoomRef = useLatest(zoom),
    frameKey = frame ? [frame.id, frame.x, frame.y, frame.w, frame.h].join('|') : '',
    zoomKey = zoom ? [zoom.id, zoom.x, zoom.y, zoom.w, zoom.h].join('|') : '';
  useEffect(() => {
    if (!frames.length) exitRef.current();
  }, [frames.length, exitRef]);
  useEffect(() => {
    const target = zoomRef.current ?? frameRef.current;
    if (target) cameraRef.current(fitFrame(target, { w: size.w, h: size.h }, zoomRef.current ? 96 : 48));
  }, [frameKey, zoomKey, size.w, size.h, frameRef, cameraRef, zoomRef]);
  useEffect(() => {
    exit.current?.focus();
  }, []);
  // Keep the pop-out window in step with the current slide.
  useEffect(() => {
    if (!popup || !frame) return;
    try {
      if (!popup.closed) renderNotesWindow(popup, frame, `${safe + 1} / ${frames.length}`, next);
    } catch {
      /* the window was closed or navigated away */
    }
  }, [popup, frame, next, safe, frames.length]);
  // Arrow keys in the pop-out window move the slides too; the window closes with the presentation.
  useEffect(() => {
    if (!popup) return;
    const forward = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) setIndex(i => Math.min(frames.length - 1, i + 1));
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) setIndex(i => Math.max(0, i - 1));
    };
    try {
      popup.document.addEventListener('keydown', forward);
    } catch {
      /* the window was closed */
    }
    return () => {
      try {
        popup.document.removeEventListener('keydown', forward);
      } catch {
        /* the window was closed */
      }
    };
  }, [popup, frames.length]);
  useEffect(
    () => () => {
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        /* nothing to close */
      }
    },
    [popup],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest?.('button')) {
        e.stopImmediatePropagation();
        return;
      }
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setIndex(i => Math.min(frames.length - 1, i + 1));
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setIndex(i => Math.max(0, i - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setIndex(frames.length - 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (gridRef.current) setGrid(false);
        else if (zoomRef.current) setZoomed(null);
        else exitRef.current();
      } else if (plain && (e.key === 'g' || e.key === 'G')) {
        e.stopImmediatePropagation();
        setGrid(g => !g);
      } else if (plain && (e.key === 'n' || e.key === 'N')) {
        e.stopImmediatePropagation();
        setShowNotes(s => !s);
      } else e.stopImmediatePropagation();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  }, [frames.length, exitRef, gridRef, zoomRef]);
  if (zoomed && frame && zoomed.frame !== frame.id) setZoomed(null);
  if (!frame) return null;
  const cam = zoom ? fitFrame(zoom, size, 96) : fitFrame(frame, size),
    hole = {
      left: frame.x * cam.z + cam.x,
      top: frame.y * cam.z + cam.y,
      width: frame.w * cam.z,
      height: frame.h * cam.z,
    };
  const popOut = () => {
    let w: Window | null;
    try {
      w = window.open('', NOTES_WINDOW, 'popup,width=520,height=640');
    } catch {
      w = null;
    }
    if (!w) {
      // Pop-ups blocked: keep the notes in the presentation itself.
      setBlocked(true);
      setShowNotes(true);
      return;
    }
    setBlocked(false);
    setPopup(w);
  };
  const notes = frameNotes(frame);
  const voting = board.voting?.active ? board.voting : null,
    onSlide = slideObjects(board, frame),
    voteTargets = voting ? onSlide.filter(i => voting.targets.includes(i.id)) : [],
    origin = getOrigin();
  /** Click an object on the slide to zoom to it; click again (or press Escape) to return. */
  const clickZoom = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target !== e.currentTarget && !target.classList.contains('present-hole')) return;
    if (zoom) return setZoomed(null);
    const hit = slideObjectAt(board, frame, {
      x: (e.clientX - origin.x - cam.x) / cam.z,
      y: (e.clientY - origin.y - cam.y) / cam.z,
    });
    if (hit) setZoomed({ frame: frame.id, item: hit });
  };
  return (
    <div
      className={`present-overlay ${zoom ? 'zoomed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Presentation mode"
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      onClick={clickZoom}
    >
      {dark && <div className="present-hole" style={hole} aria-hidden="true" />}
      {voteTargets.map(i => (
        <span
          key={i.id}
          className="present-vote"
          role="group"
          aria-label={`Votes for ${i.text?.trim().slice(0, 40) || i.type}`}
          style={{ left: origin.x + (i.x + i.w / 2) * cam.z + cam.x, top: origin.y + i.y * cam.z + cam.y }}
        >
          <button aria-label="Remove vote" onClick={() => onVote?.(i.id, -1)}>
            −
          </button>
          <b>{voting!.votes[i.id] ?? 0}</b>
          <button aria-label="Add vote" onClick={() => onVote?.(i.id, 1)}>
            +
          </button>
        </span>
      ))}
      {zoom && <p className="present-zoom-hint">Zoomed in. Click anywhere or press Esc to return to the slide.</p>}
      {showNotes && (
        <aside className="present-notes floating" aria-label="Presenter notes">
          <div className="panel-heading">
            <h2>Notes</h2>
            <span>
              <button
                className="icon-button"
                aria-label="Pop out notes"
                title="Open notes in a separate window"
                onClick={popOut}
              >
                <ExternalLink size={15} />
              </button>
              <button className="icon-button" aria-label="Hide presenter notes" onClick={() => setShowNotes(false)}>
                <X size={15} />
              </button>
            </span>
          </div>
          {blocked && <p className="present-notes-warning">The pop-up was blocked, so notes are shown here.</p>}
          <div className={`present-notes-text ${notes ? '' : 'empty'}`}>{notes || 'No notes for this frame.'}</div>
          {next && <small>Next: {next.text || 'Untitled frame'}</small>}
        </aside>
      )}
      {grid && (
        <div className="present-grid" role="dialog" aria-label="Slide overview">
          <div className="present-grid-head">
            <h2>Slides</h2>
            <button className="icon-button" aria-label="Close slide overview" onClick={() => setGrid(false)}>
              <X size={17} />
            </button>
          </div>
          <ol>
            {frames.map((f, i) => (
              <li key={f.id}>
                <button
                  autoFocus={i === safe}
                  className={i === safe ? 'current' : ''}
                  aria-current={i === safe ? 'true' : undefined}
                  aria-label={`Go to slide ${i + 1}: ${f.text || 'Untitled frame'}`}
                  onClick={() => {
                    setIndex(i);
                    setGrid(false);
                  }}
                >
                  <SlideThumb board={board} frame={f} />
                  <span>
                    <b>{i + 1}</b> {f.text || 'Untitled frame'}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="present-bar floating">
        <button
          className="icon-button"
          aria-label="Previous frame"
          disabled={safe === 0}
          onClick={() => setIndex(safe - 1)}
        >
          <ChevronLeft size={20} />
        </button>
        <span aria-live="polite">
          {frame.text || 'Untitled frame'} · {safe + 1} / {frames.length}
        </span>
        <button
          className="icon-button"
          aria-label="Next frame"
          disabled={safe === frames.length - 1}
          onClick={() => setIndex(safe + 1)}
        >
          <ChevronRight size={20} />
        </button>
        <span className="divider" />
        <button
          className={`icon-button ${grid ? 'active' : ''}`}
          aria-label="Slide overview"
          aria-pressed={grid}
          title="Slide overview (G)"
          onClick={() => setGrid(!grid)}
        >
          <LayoutGrid size={17} />
        </button>
        <button
          className={`icon-button ${showNotes ? 'active' : ''}`}
          aria-label="Presenter notes"
          aria-pressed={showNotes}
          title="Presenter notes (N)"
          onClick={() => setShowNotes(!showNotes)}
        >
          <NotebookPen size={17} />
        </button>
        <button
          className={`icon-button ${dark ? 'active' : ''}`}
          aria-label="Dark surround"
          aria-pressed={dark}
          title="Darken everything outside the frame"
          onClick={() => setDark(!dark)}
        >
          <Moon size={17} />
        </button>
        {onTimer && (
          <button
            className={`icon-button ${timerOn ? 'active' : ''}`}
            aria-label="Timer"
            aria-pressed={!!timerOn}
            title="Show or hide the timer"
            onClick={onTimer}
          >
            <TimerIcon size={17} />
          </button>
        )}
        {(onStartVote || onEndVote) && (
          <button
            className={`icon-button ${voting ? 'active' : ''}`}
            aria-label={voting ? 'End voting' : 'Vote on this slide'}
            aria-pressed={!!voting}
            title={voting ? 'End voting and keep the results' : 'Start dot voting on the objects of this slide'}
            disabled={!voting && !onSlide.length}
            onClick={() => (voting ? onEndVote?.() : onStartVote?.(onSlide.map(i => i.id)))}
          >
            <Vote size={17} />
          </button>
        )}
        <div className="present-react-wrap">
          <button
            className={`icon-button ${reacting ? 'active' : ''}`}
            aria-label="Reactions"
            aria-expanded={reacting}
            title="Send a reaction"
            onClick={() => setReacting(!reacting)}
          >
            <SmilePlus size={17} />
          </button>
          {reacting && (
            <span className="present-reactions floating" role="group" aria-label="Send a reaction">
              {reactionChoices.map(r => (
                <button key={r.emoji} aria-label={r.label} title={r.label} onClick={() => sendReaction(r.emoji)}>
                  {r.emoji}
                </button>
              ))}
            </span>
          )}
        </div>
        <span className="divider" />
        {onCanvas && (
          <button
            className="icon-button"
            aria-label="Go to canvas"
            title="Leave the presentation and stay on this frame"
            onClick={() => onCanvas(frame)}
          >
            <MapIcon size={17} />
          </button>
        )}
        <button ref={exit} onClick={onExit}>
          <X size={16} />
          Exit
        </button>
      </div>
    </div>
  );
}
