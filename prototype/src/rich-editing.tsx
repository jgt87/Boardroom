// Shared pieces for rich-text editing on the canvas and in Docs: the person list for @mentions, colour
// swatches, the inline link popover and the mention suggestion list. No browser dialogs are used.
import React, { useState } from 'react';
import type { Board } from './model';
import { boardPeople } from './card-tools';
import { AUTHOR_KEY, cleanAuthor } from './authors';
import { cleanMentionName, normalizeHref } from './rich-text';
import './rich-text.css';

/** People that can be mentioned: People widgets, user cards, card assignees and this device's profile name. */
export function mentionPeople(board: Board, author?: string): string[] {
  let own = author;
  if (own === undefined)
    try {
      own = cleanAuthor(localStorage.getItem(AUTHOR_KEY) ?? '');
    } catch {
      own = '';
    }
  return [...new Set([...boardPeople(board), ...(own ? [own] : [])].map(cleanMentionName).filter(Boolean))];
}

export const textColors = [
  { label: 'Red', value: '#d92d20' },
  { label: 'Orange', value: '#e8590c' },
  { label: 'Green', value: '#2b8a3e' },
  { label: 'Blue', value: '#1c64f2' },
  { label: 'Purple', value: '#7048e8' },
  { label: 'Grey', value: '#6b6b76' },
];
export const highlightColors = [
  { label: 'Yellow', value: '#fff27a' },
  { label: 'Green', value: '#c3f3c8' },
  { label: 'Blue', value: '#cfe2ff' },
  { label: 'Pink', value: '#ffd6e7' },
];

/** Keep the editor's selection when a control is pressed, and keep the press away from the canvas. */
export const keepSelection = {
  onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
};

/** A row of colour swatches plus "remove". */
export function SwatchRow({
  label,
  colors,
  onPick,
}: {
  label: string;
  colors: { label: string; value: string }[];
  onPick: (value: string | undefined) => void;
}) {
  return (
    <div className="rich-swatches" role="group" aria-label={label}>
      {colors.map(c => (
        <button
          key={c.value}
          type="button"
          className="rich-swatch"
          aria-label={`${label}: ${c.label}`}
          title={c.label}
          style={{ background: c.value }}
          {...keepSelection}
          onClick={e => {
            e.stopPropagation();
            onPick(c.value);
          }}
        />
      ))}
      <button
        type="button"
        className="rich-swatch rich-swatch-none"
        aria-label={`${label}: none`}
        title="None"
        {...keepSelection}
        onClick={e => {
          e.stopPropagation();
          onPick(undefined);
        }}
      >
        ×
      </button>
    </div>
  );
}

/** Inline popover to add, change or remove a link. Enter applies, Escape cancels. */
export function LinkPopover({
  initial,
  hasLink,
  style,
  onApply,
  onRemove,
  onCancel,
  onLeave,
}: {
  initial: string;
  hasLink: boolean;
  style?: React.CSSProperties;
  onApply: (href: string) => void;
  onRemove: () => void;
  onCancel: () => void;
  /** Focus left the popover for somewhere other than its own controls. */
  onLeave?: (to: Element | null) => void;
}) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState(false);
  const apply = () => {
    const href = normalizeHref(value);
    if (!href) return setError(true);
    onApply(href);
  };
  return (
    <div
      className="rich-link-popover"
      role="dialog"
      aria-label={hasLink ? 'Edit link' : 'Add link'}
      style={style}
      onPointerDown={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={e => {
        const to = e.relatedTarget as Element | null;
        if (!to || !e.currentTarget.contains(to)) onLeave?.(to);
      }}
    >
      <input
        autoFocus
        type="text"
        inputMode="url"
        aria-label="Link address"
        placeholder="https://example.com"
        aria-invalid={error || undefined}
        value={value}
        onChange={e => {
          setValue(e.target.value);
          setError(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      />
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={apply}>
        {hasLink ? 'Update' : 'Add link'}
      </button>
      {hasLink && (
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={onRemove}>
          Remove
        </button>
      )}
      {error && <small className="rich-link-error">Use a web or e-mail address.</small>}
    </div>
  );
}

/** Suggested people while an @name is typed. */
export function MentionMenu({
  names,
  active,
  style,
  className = '',
  onPick,
  onHover,
}: {
  names: string[];
  active: number;
  style?: React.CSSProperties;
  className?: string;
  onPick: (name: string) => void;
  onHover: (index: number) => void;
}) {
  return (
    <ul
      className={`rich-mention-menu ${className}`}
      role="listbox"
      aria-label="Mention someone"
      style={style}
      {...keepSelection}
    >
      {names.map((name, k) => (
        <li
          key={name}
          role="option"
          aria-selected={k === active}
          onMouseEnter={() => onHover(k)}
          onClick={e => {
            e.stopPropagation();
            onPick(name);
          }}
        >
          @{name}
        </li>
      ))}
    </ul>
  );
}
