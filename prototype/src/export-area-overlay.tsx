import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from './board-app';
import { useLatest } from './use-latest';
import { areaBetween, MIN_AREA_PX, type Region } from './export-area';
import './export-tools.css';

type Screen = { x: number; y: number };

/**
 * Drag-to-define export area (gap b3-4). A transparent layer over the canvas takes one drag; the chosen
 * area can then be exported as PNG, JPG, SVG or PDF, or printed. Escape or Cancel leaves without changes.
 */
export function ExportAreaOverlay({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (format: 'png' | 'jpg' | 'svg' | 'pdf' | 'print', area: Region) => void;
}) {
  const { toWorld } = useApp(),
    [start, setStart] = useState<Screen | null>(null),
    [end, setEnd] = useState<Screen | null>(null),
    [done, setDone] = useState(false),
    layer = useRef<HTMLDivElement>(null),
    close = useLatest(onClose);
  useEffect(() => {
    layer.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [close]);
  const box = start && end ? areaBetween(start, end) : null;
  const world = () => {
    const a = toWorld(start!.x, start!.y),
      b = toWorld(end!.x, end!.y);
    return areaBetween(a, b);
  };
  return (
    <div
      ref={layer}
      className={`export-area-layer ${done ? 'done' : ''}`}
      tabIndex={-1}
      role="application"
      aria-label="Drag to choose the area to export. Press Escape to cancel."
      onPointerDown={e => {
        if (done || e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setStart({ x: e.clientX, y: e.clientY });
        setEnd({ x: e.clientX, y: e.clientY });
      }}
      onPointerMove={e => {
        if (start && !done) setEnd({ x: e.clientX, y: e.clientY });
      }}
      onPointerUp={e => {
        if (!start || done) return;
        const next = { x: e.clientX, y: e.clientY },
          b = areaBetween(start, next);
        setEnd(next);
        if (b.w < MIN_AREA_PX || b.h < MIN_AREA_PX) {
          setStart(null);
          setEnd(null);
          return;
        }
        setDone(true);
      }}
    >
      {!done && <div className="export-area-hint floating">Drag over the area to export · Esc to cancel</div>}
      {box && <div className="export-area-box" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
      {done && box && (
        <div
          className="export-area-bar floating"
          role="toolbar"
          aria-label="Export area"
          style={{ left: box.x, top: Math.min(box.y + box.h + 8, window.innerHeight - 52) }}
          onPointerDown={e => e.stopPropagation()}
        >
          {(
            [
              ['png', 'PNG'],
              ['jpg', 'JPG'],
              ['svg', 'SVG'],
              ['pdf', 'PDF'],
              ['print', 'Print'],
            ] as const
          ).map(([format, label]) => (
            <button key={format} onClick={() => onExport(format, world())}>
              {label}
            </button>
          ))}
          <button className="icon-button" aria-label="Cancel area export" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
