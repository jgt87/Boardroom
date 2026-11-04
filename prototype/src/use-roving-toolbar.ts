// Roving focus for toolbars (track R1): one Tab stop per toolbar; arrow keys, Home and End move between its
// controls. Controls inside popups (dialogs, menus, lists) and text fields keep their own keys.
import { useLayoutEffect, useRef } from 'react';
import type React from 'react';

const CONTROLS = 'button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled)';
const NESTED = '[role=dialog],[role=menu],[role=listbox],[role=radiogroup],dialog,aside';
const TYPING = 'input:not([type=color]):not([type=checkbox]):not([type=radio]),select,textarea';

const inPopup = (bar: HTMLElement, el: HTMLElement) => {
  const nested = el.closest(NESTED);
  return !!nested && bar.contains(nested);
};
/** The toolbar's own controls: not those of a nested toolbar or of a popup opened from it. */
const controls = (bar: HTMLElement): HTMLElement[] =>
  [...bar.querySelectorAll<HTMLElement>(CONTROLS)].filter(
    el => el.closest('[role=toolbar]') === bar && !inPopup(bar, el),
  );

export function useRovingToolbar<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // Keep exactly one control in the Tab order: the focused one, else the last one used, else the first.
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const list = controls(bar);
    if (!list.length) return;
    const current =
      list.find(el => el === document.activeElement) ?? list.find(el => el.dataset.rovingCurrent) ?? list[0];
    for (const el of list) {
      el.tabIndex = el === current ? 0 : -1;
      if (el === current) el.dataset.rovingCurrent = '1';
      else delete el.dataset.rovingCurrent;
    }
  });
  const onFocus = (e: React.FocusEvent<T>) => {
    const bar = ref.current,
      target = e.target as HTMLElement;
    if (!bar || inPopup(bar, target)) return;
    const list = controls(bar);
    if (!list.includes(target)) return;
    for (const el of list) {
      el.tabIndex = el === target ? 0 : -1;
      if (el === target) el.dataset.rovingCurrent = '1';
      else delete el.dataset.rovingCurrent;
    }
  };
  const onKeyDown = (e: React.KeyboardEvent<T>) => {
    const bar = ref.current,
      target = e.target as HTMLElement;
    if (!bar || e.altKey || e.ctrlKey || e.metaKey || inPopup(bar, target) || target.matches(TYPING)) return;
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp',
      forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (!back && !forward && e.key !== 'Home' && e.key !== 'End') return;
    const list = controls(bar);
    const at = list.indexOf(target);
    if (at < 0 || !list.length) return;
    e.preventDefault();
    // Keep board shortcuts (arrow keys move the selection) from seeing this key.
    e.stopPropagation();
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + (forward ? 1 : -1) + list.length) % list.length;
    list[next].focus();
  };
  return { ref, onFocus, onKeyDown };
}
