// Right-click / long-press context menu (item 57). Evidence: the audit's "Context-menu selection,
// focus and popup behavior" module. Keyboard: arrows, Home/End, Enter, Esc; opened with
// Shift+F10 or the Menu key for the current selection.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fitMenu } from './menu-fit';
import { useLatest } from './use-latest';

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
  const latestClose = useLatest(onClose);
  const menu = useRef<HTMLDivElement>(null),
    [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number }>({ left: x, top: y });
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    // Item 147: keep the whole menu on screen. A menu taller than the window gets a max height and scrolls inside
    // (fitMenu), so every row stays reachable on short windows.
    const r = el.getBoundingClientRect();
    const fit = fitMenu({ x, y, w: r.width, h: el.scrollHeight }, null, { w: innerWidth, h: innerHeight }, true)!;
    setPos({ left: fit.x, top: fit.y, maxHeight: fit.maxH });
    el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [x, y]);
  // Registered once; the current onClose is read through useLatest, so a re-render (the app re-renders on resize)
  // never swaps the listeners out while an event is being handled.
  useEffect(() => {
    const close = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) latestClose.current();
    };
    const blur = () => latestClose.current();
    addEventListener('pointerdown', close, true);
    addEventListener('wheel', close, { capture: true, passive: true });
    // Scrolling the page or a panel under it, or resizing the window, closes it (the rows scroll inside it).
    addEventListener('scroll', close, true);
    addEventListener('resize', blur);
    addEventListener('blur', blur);
    return () => {
      removeEventListener('pointerdown', close, true);
      removeEventListener('wheel', close, true);
      removeEventListener('scroll', close, true);
      removeEventListener('resize', blur);
      removeEventListener('blur', blur);
    };
  }, [latestClose]);
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
      style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
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
