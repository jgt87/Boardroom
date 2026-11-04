// Colour menu for the selection bar (track R5): recent colours, saved custom colours, colours on this board
// and an eyedropper. The eyedropper uses the browser's EyeDropper API where it exists (Chromium over a secure
// context); elsewhere the "On this board" row is the fallback for picking an existing colour.
import React, { useEffect, useRef, useState } from 'react';
import { Palette, Pipette, Plus } from 'lucide-react';
import type { Board } from './model';
import { colorName } from './model';
import {
  RECENT_COLORS_KEY,
  SAVED_COLORS_KEY,
  RECENT_LIMIT,
  SAVED_LIMIT,
  addSaved,
  boardColors,
  loadColors,
  normalizeHex,
  pushRecent,
  removeSaved,
  storeColors,
} from './color-store';
import './r5-canvas.css';

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
const eyeDropper = (): EyeDropperCtor | null =>
  typeof window !== 'undefined' && 'EyeDropper' in window
    ? ((window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper ?? null)
    : null;
/** "#rrggbb" or "rgb(r, g, b)" from the eyedropper as #rrggbb. */
const toHex = (value: string) => {
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  return rgb
    ? '#' +
        rgb
          .slice(1, 4)
          .map(n => Number(n).toString(16).padStart(2, '0'))
          .join('')
    : normalizeHex(value);
};

export function ColorMenu({ value, board, onPick }: { value: string; board: Board; onPick: (hex: string) => void }) {
  const [open, setOpen] = useState(false),
    [recent, setRecent] = useState<string[]>([]),
    [saved, setSaved] = useState<string[]>([]),
    wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  const pick = (hex: string) => {
    const next = pushRecent(recent, hex);
    setRecent(next);
    storeColors(RECENT_COLORS_KEY, next);
    onPick(hex);
  };
  const swatch = (c: string, onRemove?: () => void) => (
    <span key={c} className="color-menu-swatch">
      <button
        style={{ background: c }}
        aria-label={`Use colour ${colorName(c)}`}
        aria-pressed={c === value.toLowerCase()}
        title={colorName(c)}
        onClick={() => pick(c)}
      />
      {onRemove && (
        <button className="color-menu-remove" aria-label={`Remove saved colour ${colorName(c)}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
  const Dropper = eyeDropper();
  return (
    <span className="color-menu-wrap" ref={wrap}>
      <button
        className="icon-button"
        aria-label="More colours"
        aria-expanded={open}
        title="Recent, saved and board colours"
        onClick={() => {
          if (!open) {
            setRecent(loadColors(RECENT_COLORS_KEY, RECENT_LIMIT));
            setSaved(loadColors(SAVED_COLORS_KEY, SAVED_LIMIT));
          }
          setOpen(!open);
        }}
      >
        <Palette size={16} />
      </button>
      {open && (
        <div
          className="color-menu"
          role="dialog"
          aria-label="Colours"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <h3>Recent</h3>
          <div className="color-menu-row" role="group" aria-label="Recent colours">
            {recent.length ? recent.map(c => swatch(c)) : <p>Colours you use appear here.</p>}
          </div>
          <h3>Saved</h3>
          <div className="color-menu-row" role="group" aria-label="Saved colours">
            {saved.map(c =>
              swatch(c, () => {
                const next = removeSaved(saved, c);
                setSaved(next);
                storeColors(SAVED_COLORS_KEY, next);
              }),
            )}
            {!saved.length && <p>Save colours to reuse them on any board.</p>}
          </div>
          <h3>On this board</h3>
          <div className="color-menu-row" role="group" aria-label="Board colours">
            {boardColors(board).map(c => swatch(c))}
          </div>
          <div className="color-menu-actions">
            <button
              onClick={() => {
                const next = addSaved(saved, value);
                setSaved(next);
                storeColors(SAVED_COLORS_KEY, next);
              }}
              disabled={!normalizeHex(value) || saved.includes(value.toLowerCase())}
            >
              <Plus size={13} />
              Save current
            </button>
            {Dropper && (
              <button
                onClick={async () => {
                  try {
                    const hex = toHex((await new Dropper().open()).sRGBHex);
                    if (hex) pick(hex);
                  } catch {
                    /* cancelled with Esc */
                  }
                }}
              >
                <Pipette size={13} />
                Pick from screen
              </button>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
