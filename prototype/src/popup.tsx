// One behaviour for every menu and pop-up (item 142, from the CommonShared el-menu and el-popover rules):
// closes on a pointer press outside, Esc, Tab out, scrolling or wheeling outside it, and window resize; Esc
// returns focus to whatever had focus when it opened (its trigger); opening can focus the first row; arrow keys,
// Home and End move between rows. Callers keep their own markup and placement.
import { useEffect, useRef } from 'react';
import type React from 'react';
import { menuKeyTarget } from './menu-keys';

/** Focusable menu rows inside `root` (not those of nested submenus). */
const rowsOf = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter(
    el => el.closest('[role="menu"]') === (root.matches('[role="menu"]') ? root : root.querySelector('[role="menu"]')),
  );

export type PopupOptions = {
  /** Focus the first row when it opens (menus opened from a button). Default false. */
  focusFirst?: boolean;
  /** Close on window resize and on scroll or wheel outside the pop-up. Default true. */
  closeOnScroll?: boolean;
  /** Close when Tab leaves a row. Default true; false for a pop-up that also holds fields to Tab into. */
  closeOnTab?: boolean;
  /**
   * The button that opens it, when it sits outside `ref` (rail pop-outs): pressing it is not an outside press (it
   * toggles the pop-out itself), and Esc returns focus to it.
   */
  trigger?: () => HTMLElement | null;
};

/**
 * Dismissal and focus for a pop-up rooted at `ref` (the trigger may sit inside it). Esc is consumed, so it does
 * not also reach the board's shortcuts (which would clear the selection).
 */
export function usePopup(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
  close: () => void,
  { focusFirst = false, closeOnScroll = true, closeOnTab = true, trigger }: PopupOptions = {},
) {
  const closeRef = useRef(close),
    triggerRef = useRef(trigger);
  useEffect(() => {
    closeRef.current = close;
    triggerRef.current = trigger;
  });
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inside = (t: EventTarget | null) => !!ref.current && t instanceof Node && ref.current.contains(t);
    if (focusFirst) {
      const root = ref.current;
      // The first menu row, else the first field or button (a gallery's search box).
      const first = root
        ? (rowsOf(root)[0] ?? root.querySelector<HTMLElement>('input, select, textarea, button'))
        : undefined;
      first?.focus({ preventScroll: true });
    }
    // Scrolling closes it only when the pop-up actually moved with the page (focus can scroll a container
    // without moving anything on screen, which must not close it).
    const at = ref.current?.getBoundingClientRect();
    const down = (e: PointerEvent) => {
      const own = triggerRef.current?.();
      if (!inside(e.target) && !(own && e.target instanceof Node && own.contains(e.target))) closeRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        // Back to the trigger, never to the page body. The trigger is the first element in the root that
        // announces a pop-up; a list that focused its own first row before this effect ran must not win.
        const back =
          triggerRef.current?.() ?? ref.current?.querySelector<HTMLElement>('[aria-haspopup], [aria-expanded]');
        if (back) back.focus();
        else if (opener?.isConnected && !inside(opener)) opener.focus();
      } else if (closeOnTab && e.key === 'Tab' && inside(document.activeElement)) closeRef.current();
    };
    const away = (e: Event) => {
      if (inside(e.target)) return;
      if (e.type === 'wheel') return closeRef.current();
      const now = ref.current?.getBoundingClientRect();
      if (!at || !now || Math.abs(now.top - at.top) > 1 || Math.abs(now.left - at.left) > 1) closeRef.current();
    };
    const resize = () => closeRef.current();
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    if (closeOnScroll) {
      document.addEventListener('scroll', away, true);
      document.addEventListener('wheel', away, { capture: true, passive: true });
      addEventListener('resize', resize);
    }
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('scroll', away, true);
      document.removeEventListener('wheel', away, true);
      removeEventListener('resize', resize);
    };
  }, [open, ref, focusFirst, closeOnScroll, closeOnTab]);
}

/** onKeyDown for a menu panel: arrow keys (wrapping), Home and End move between its rows. */
export function onMenuKeys(e: React.KeyboardEvent<HTMLElement>) {
  const rows = rowsOf(e.currentTarget);
  const next = menuKeyTarget(e.key, rows.indexOf(document.activeElement as HTMLElement), rows.length);
  if (next === null) return;
  e.preventDefault();
  e.stopPropagation();
  rows[next]?.focus();
}
