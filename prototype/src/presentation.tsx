import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Play } from 'lucide-react';
import type { Board, Item, FrameFormat } from './model';
import { framePresets, presetSize } from './frame-presets';
import { presentationFrames, fitFrame } from './navigation';
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

/** Presentation order editor. Reordering is stored on the board and undoable. */
export function PresentationPanel({
  board,
  onMove,
  onStart,
  onShow,
  onClose,
}: {
  board: Board;
  onMove: (id: string, delta: number) => void;
  onStart: (index: number) => void;
  onShow: (frame: Item) => void;
  onClose: () => void;
}) {
  const frames = presentationFrames(board);
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
          Presentation <span>{frames.length}</span>
        </h2>
        <button className="icon-button" aria-label="Close presentation" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      {frames.length ? (
        <>
          <ol className="slide-list">
            {frames.map((f, i) => (
              <li key={f.id}>
                <button className="slide-name" onClick={() => onShow(f)}>
                  <b>{i + 1}</b>
                  {f.text || 'Untitled frame'}
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${f.text || 'frame'} earlier`}
                  disabled={!i}
                  onClick={() => onMove(f.id, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${f.text || 'frame'} later`}
                  disabled={i === frames.length - 1}
                  onClick={() => onMove(f.id, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Present from ${f.text || 'frame'}`}
                  onClick={() => onStart(i)}
                >
                  <Play size={15} />
                </button>
              </li>
            ))}
          </ol>
          <button className="primary present-start" onClick={() => onStart(0)}>
            <Play size={16} />
            Present from the start
          </button>
        </>
      ) : (
        <p>Add frames to build a presentation. Each frame becomes one slide.</p>
      )}
    </aside>
  );
}

/** Full-screen presentation. Editing is disabled; Esc restores the editing view. */
export function PresentOverlay({
  board,
  start,
  size,
  onCamera,
  onExit,
}: {
  board: Board;
  start: number;
  size: { w: number; h: number };
  onCamera: (c: Camera) => void;
  onExit: () => void;
}) {
  const frames = useMemo(() => presentationFrames(board), [board]),
    [index, setIndex] = useState(start),
    exit = useRef<HTMLButtonElement>(null);
  const safe = Math.min(index, frames.length - 1),
    frame = frames[safe],
    exitRef = useLatest(onExit),
    cameraRef = useLatest(onCamera),
    frameRef = useLatest(frame),
    frameKey = frame ? [frame.id, frame.x, frame.y, frame.w, frame.h].join('|') : '';
  useEffect(() => {
    if (!frames.length) exitRef.current();
  }, [frames.length, exitRef]);
  useEffect(() => {
    if (frameRef.current) cameraRef.current(fitFrame(frameRef.current, { w: size.w, h: size.h }));
  }, [frameKey, size.w, size.h, frameRef, cameraRef]);
  useEffect(() => {
    exit.current?.focus();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).closest?.('button')) {
        e.stopImmediatePropagation();
        return;
      }
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
        exitRef.current();
      } else e.stopImmediatePropagation();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  }, [frames.length, exitRef]);
  if (!frame) return null;
  return (
    <div
      className="present-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Presentation mode"
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
    >
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
        <button ref={exit} onClick={onExit}>
          <X size={16} />
          Exit
        </button>
      </div>
    </div>
  );
}
