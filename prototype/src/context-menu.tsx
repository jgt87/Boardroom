// Right-click / long-press context menu (item 57). Evidence: the audit's "Context-menu selection,
// focus and popup behavior" module. Keyboard: arrows, Home/End, Enter, Esc; opened with
// Shift+F10 or the Menu key for the current selection.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuEntry =
  { label: string; shortcut?: string; disabled?: boolean; danger?: boolean; run: () => void } | 'separator';

export function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null),
    [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);
  useEffect(() => {
    const close = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) onClose();
    };
    const blur = () => onClose();
    addEventListener('pointerdown', close, true);
    addEventListener('wheel', close, { capture: true, passive: true });
    addEventListener('blur', blur);
    return () => {
      removeEventListener('pointerdown', close, true);
      removeEventListener('wheel', close, true);
      removeEventListener('blur', blur);
    };
  }, [onClose]);
  const move = (delta: number | 'first' | 'last') => {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (!buttons.length) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      delta === 'first' ? 0 : delta === 'last' ? buttons.length - 1 : (i + delta + buttons.length) % buttons.length;
    buttons[next].focus();
  };
  return (
    <div
      ref={menu}
      className="context-menu floating"
      role="menu"
      aria-label="Actions"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={e => e.preventDefault()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'ArrowDown') move(1);
        else if (e.key === 'ArrowUp') move(-1);
        else if (e.key === 'Home') move('first');
        else if (e.key === 'End') move('last');
        else if (e.key === 'Escape' || e.key === 'Tab') onClose();
        else return;
        e.preventDefault();
      }}
    >
      {entries.map((entry, k) =>
        entry === 'separator' ? (
          <div key={`s${k}`} className="context-separator" role="separator" />
        ) : (
          <button
            key={entry.label}
            role="menuitem"
            className={entry.danger ? 'danger' : undefined}
            disabled={entry.disabled}
            onClick={() => {
              onClose();
              entry.run();
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
