// Colour menu (tracks R5 and R1a), shared by every colour control: object fill, line colour, border, text
// colours and the inspector. The trigger is a swatch of the current colour; the menu holds brand colours, a base
// palette of ten hues in five shades, a hex field, a custom picker, recent and saved colours, colours on this board
// and an eyedropper. The eyedropper uses the browser's EyeDropper API where it exists (Chromium over a secure
// context); elsewhere the "On this board" row is the fallback for picking an existing colour. The menu renders in
// a portal so panels that scroll or are transformed do not clip it.
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipette, Plus } from 'lucide-react';
import type { Board } from './model';
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
import { gridStep, paletteRows, parseHexInput } from './color-palette';
import { spokenColor } from './access-tools';
import { BrandSwatches, useBrandKit } from './brand-kit-panel';
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
const ROWS = paletteRows();
const MENU_WIDTH = 260;

export function ColorMenu({
  value,
  board,
  onPick,
  label = 'Object colour',
  disabled,
  mixed,
  variant = 'fill',
}: {
  value: string;
  board?: Board;
  onPick: (hex: string) => void;
  /** What the colour is for, e.g. "Border colour": names the trigger and the menu. */
  label?: string;
  disabled?: boolean;
  /** The selection has more than one colour. */
  mixed?: boolean;
  /** "border" draws the trigger as a ring, for border colours. */
  variant?: 'fill' | 'border';
}) {
  const [open, setOpen] = useState(false),
    [recent, setRecent] = useState<string[]>([]),
    [saved, setSaved] = useState<string[]>([]),
    [hexText, setHexText] = useState(''),
    [hexError, setHexError] = useState(''),
    [pos, setPos] = useState<{ left: number; top: number } | null>(null),
    trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null),
    errorId = useId(),
    brandKit = useBrandKit();
  const current = mixed ? '' : (normalizeHex(value) ?? '');
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);
  // Place the menu below the trigger (above it when there is no room below), inside the window.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current?.getBoundingClientRect(),
        m = menu.current;
      if (!t || !m) return;
      const h = m.offsetHeight,
        left = Math.max(8, Math.min(t.left, innerWidth - MENU_WIDTH - 8)),
        below = t.bottom + 8,
        top = below + h > innerHeight - 8 && t.top - h - 8 >= 8 ? t.top - h - 8 : Math.max(8, below);
      setPos(p => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    addEventListener('resize', place);
    return () => removeEventListener('resize', place);
  }, [open]);
  // Focus the chosen palette cell (else the first) when the menu opens.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[data-palette-cell][tabindex="0"]')?.focus({ preventScroll: true });
  }, [open]);

  const pick = (hex: string) => {
    const next = pushRecent(recent, hex);
    setRecent(next);
    storeColors(RECENT_COLORS_KEY, next);
    setHexText(hex);
    setHexError('');
    onPick(hex);
  };
  const applyHex = () => {
    const r = parseHexInput(hexText);
    if ('error' in r) setHexError(r.error);
    else pick(r.hex);
  };
  const swatch = (c: string, onRemove?: () => void) => (
    <span key={c} className="color-menu-swatch">
      <button
        type="button"
        style={{ background: c }}
        aria-label={`Use colour ${spokenColor(c)}`}
        aria-pressed={c === current}
        title={`${spokenColor(c)} ${c}`}
        onClick={() => pick(c)}
      />
      {onRemove && (
        <button
          type="button"
          className="color-menu-remove"
          aria-label={`Remove saved colour ${spokenColor(c)}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </span>
  );
  // One Tab stop in the palette: the chosen colour, else the first cell.
  let chosenRow = 0,
    chosenCol = 0;
  ROWS.forEach((row, r) => {
    const c = row.findIndex(cell => cell.hex === current);
    if (c >= 0) [chosenRow, chosenCol] = [r, c];
  });
  const paletteKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (!el.dataset.paletteCell) return;
    const next = gridStep(
      ROWS.length,
      ROWS[0].length,
      { row: Number(el.dataset.row), col: Number(el.dataset.col) },
      e.key,
    );
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    const cell = menu.current?.querySelector<HTMLButtonElement>(
      `[data-palette-cell][data-row="${next.row}"][data-col="${next.col}"]`,
    );
    if (!cell) return;
    for (const other of menu.current!.querySelectorAll<HTMLButtonElement>('[data-palette-cell]')) other.tabIndex = -1;
    cell.tabIndex = 0;
    cell.focus();
  };
  const Dropper = eyeDropper();
  const spoken = mixed ? 'Mixed' : spokenColor(value);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`color-menu-trigger ${variant}`}
        aria-label={`${label}: ${spoken}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`${label}: ${spoken}${mixed ? '' : ` ${value}`}`}
        disabled={disabled}
        onClick={() => {
          if (!open) {
            setRecent(loadColors(RECENT_COLORS_KEY, RECENT_LIMIT));
            setSaved(loadColors(SAVED_COLORS_KEY, SAVED_LIMIT));
            setHexText(current);
            setHexError('');
            setPos(null);
          }
          setOpen(!open);
        }}
      >
        <span
          className={mixed ? 'mixed' : ''}
          style={mixed ? undefined : variant === 'border' ? { borderColor: value } : { background: value }}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="color-menu"
            role="dialog"
            aria-label={`Colours for ${label.toLowerCase()}`}
            style={{
              position: 'fixed',
              width: MENU_WIDTH,
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            onPointerDown={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
                trigger.current?.focus();
              } else if (!(e.target as HTMLElement).matches('input,textarea,select')) e.stopPropagation();
            }}
          >
            {brandKit.colors.length > 0 && (
              <>
                <h3>Brand</h3>
                <div className="color-menu-row">
                  <BrandSwatches label="Brand colours" value={current} onPick={pick} />
                </div>
              </>
            )}
            <h3>Palette</h3>
            <div className="color-menu-palette" role="group" aria-label="Palette" onKeyDown={paletteKey}>
              {ROWS.map((row, r) => (
                <div key={r} className="color-menu-palette-row">
                  {row.map((cell, c) => (
                    <button
                      key={cell.hex}
                      type="button"
                      data-palette-cell="1"
                      data-row={r}
                      data-col={c}
                      tabIndex={r === chosenRow && c === chosenCol ? 0 : -1}
                      style={{ background: cell.hex }}
                      aria-label={`Use colour ${cell.name}`}
                      aria-pressed={cell.hex === current}
                      title={`${cell.name} ${cell.hex}`}
                      onClick={() => pick(cell.hex)}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="color-menu-hex">
              <label>
                <span>Hex</span>
                <input
                  type="text"
                  aria-label="Hex colour"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                  placeholder="#4262ff"
                  value={hexText}
                  aria-invalid={!!hexError}
                  aria-describedby={hexError ? errorId : undefined}
                  onChange={e => {
                    setHexText(e.target.value);
                    if (hexError) setHexError('');
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      applyHex();
                    }
                  }}
                />
              </label>
              <button type="button" onClick={applyHex}>
                Apply
              </button>
              <input
                type="color"
                aria-label="Custom colour"
                title="Custom colour"
                value={current || '#ffffff'}
                onChange={e => {
                  setHexText(e.target.value);
                  setHexError('');
                  onPick(e.target.value);
                }}
                onBlur={e => {
                  const next = pushRecent(recent, e.target.value);
                  setRecent(next);
                  storeColors(RECENT_COLORS_KEY, next);
                }}
              />
            </div>
            {hexError && (
              <p id={errorId} className="color-menu-error" role="alert">
                {hexError}
              </p>
            )}
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
            {board && (
              <>
                <h3>On this board</h3>
                <div className="color-menu-row" role="group" aria-label="Board colours">
                  {boardColors(board).map(c => swatch(c))}
                </div>
              </>
            )}
            <div className="color-menu-actions">
              <button
                type="button"
                onClick={() => {
                  const next = addSaved(saved, current);
                  setSaved(next);
                  storeColors(SAVED_COLORS_KEY, next);
                }}
                disabled={!current || saved.includes(current)}
              >
                <Plus size={13} />
                Save current
              </button>
              {Dropper && (
                <button
                  type="button"
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
          </div>,
          document.body,
        )}
    </>
  );
}
