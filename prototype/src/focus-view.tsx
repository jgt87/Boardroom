// Full-viewport focus view (track D): the shared shell for record formats (Table, Kanban, Timeline), Mermaid
// and mind map editing, Docs and the slide sorter. It covers the canvas, keeps a header with the title and a
// clear Close (Esc), traps Tab focus inside, and returns focus to the opener on close.
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLatest } from './use-latest';

const FOCUSABLE =
  'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]';

/** Keep Tab and Shift+Tab inside `box`. */
export function trapTab(e: React.KeyboardEvent, box: HTMLElement | null) {
  if (e.key !== 'Tab' || !box) return;
  const focusable = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0],
    last = focusable[focusable.length - 1],
    active = document.activeElement;
  if (e.shiftKey && (active === first || !box.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !box.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

export function FocusView({
  title,
  hint,
  label,
  closeLabel = 'Close',
  onClose,
  onKeyDown,
  initialFocus,
  headerExtra,
  className = '',
  children,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  /** Accessible name of the dialog (defaults to the title when it is a string). */
  label?: string;
  closeLabel?: string;
  onClose: () => void;
  /** Extra key handling (runs before Escape and Tab handling; call preventDefault to skip them). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Selector of the element focused on open; the close button when absent or not found. */
  initialFocus?: string;
  /** Controls shown in the header next to Close (for example view switches). */
  headerExtra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null),
    focusSelector = useLatest(initialFocus);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    // Like a modal: the canvas and chrome behind the view leave the tab order and the accessibility tree.
    const hidden: { el: Element; aria: boolean }[] = [];
    for (let node: Element | null = box.current?.parentElement ?? null; node && node !== document.body;) {
      const parent: Element | null = node.parentElement;
      for (const sibling of parent?.children ?? [])
        if (
          sibling !== node &&
          !sibling.hasAttribute('inert') &&
          !sibling.matches('script,style,[aria-live],[role="status"],[role="alert"]')
        ) {
          const aria = !sibling.hasAttribute('aria-hidden');
          sibling.setAttribute('inert', '');
          if (aria) sibling.setAttribute('aria-hidden', 'true');
          hidden.push({ el: sibling, aria });
        }
      node = parent;
    }
    const first = focusSelector.current ? box.current?.querySelector<HTMLElement>(focusSelector.current) : null;
    (first ?? close.current)?.focus();
    return () => {
      for (const { el, aria } of hidden) {
        el.removeAttribute('inert');
        if (aria) el.removeAttribute('aria-hidden');
      }
      if (prior?.isConnected) prior.focus();
    };
  }, [focusSelector]);
  return (
    <div
      className="format-overlay focus-view"
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        } else trapTab(e, box.current);
      }}
    >
      <div
        ref={box}
        className={`format-editor focus-view-panel ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      >
        <header className="focus-view-header">
          <div className="focus-view-title">
            <h2>{title}</h2>
            {hint && <p>{hint}</p>}
          </div>
          {headerExtra}
          <span className="focus-view-esc" aria-hidden="true">
            <kbd>Esc</kbd> closes
          </span>
          <button
            ref={close}
            className="icon-button focus-view-close"
            aria-label={closeLabel}
            title={`${closeLabel} (Esc)`}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
