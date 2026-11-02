import React, { useEffect, useRef, useState } from 'react';
import type { Item } from './model';
import { normalizeNoteLink, normalizeNoteTags } from './model';
import { X, ExternalLink, Link2 } from 'lucide-react';
export function NoteSizeControl({ item, onChange }: { item: Item; onChange: (patch: Partial<Item>) => void }) {
  const value = item.w === item.h && [140, 210, 300].includes(item.w) ? item.w : 'custom';
  return (
    <select
      className="note-size-control"
      aria-label="Sticky note size"
      value={value}
      onChange={e => {
        const size = Number(e.target.value);
        onChange({ x: item.x + (item.w - size) / 2, y: item.y + (item.h - size) / 2, w: size, h: size });
      }}
    >
      <option value="custom" disabled>
        Custom
      </option>
      <option value="140">Small</option>
      <option value="210">Medium</option>
      <option value="300">Large</option>
    </select>
  );
}
export function NoteDetails({
  item,
  onApply,
  onClose,
}: {
  item: Item;
  onApply: (patch: Partial<Item>) => void;
  onClose: () => void;
}) {
  const [link, setLink] = useState(item.link ?? ''),
    [tags, setTags] = useState(item.tags?.join(', ') ?? ''),
    [error, setError] = useState(''),
    field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    field.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <aside
      className="note-details floating"
      aria-label="Sticky note links and tags"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel-heading">
        <h2>Links and tags</h2>
        <button className="icon-button" aria-label="Close note details" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <form
        onSubmit={e => {
          e.preventDefault();
          try {
            onApply({ link: normalizeNoteLink(link), tags: normalizeNoteTags(tags) });
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label>
          Website link
          <input
            ref={field}
            aria-label="Note website link"
            placeholder="https://example.com"
            maxLength={2048}
            value={link}
            onChange={e => {
              setLink(e.target.value);
              setError('');
            }}
          />
        </label>
        <label>
          Tags
          <input
            aria-label="Note tags"
            placeholder="Research, Priority"
            maxLength={400}
            value={tags}
            onChange={e => {
              setTags(e.target.value);
              setError('');
            }}
          />
        </label>
        <p>Separate tags with commas. Clear a field to remove it.</p>
        {item.link && (
          <a className="note-open-link" href={item.link} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} />
            Open saved link
          </a>
        )}
        {error && (
          <p className="format-error" role="alert">
            {error}
          </p>
        )}
        <div className="note-details-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Apply
          </button>
        </div>
      </form>
    </aside>
  );
}
export function NoteBadges({ item }: { item: Item }) {
  return (
    <g pointerEvents="none">
      {item.link && <Link2 x={item.w - 17} y={-20} width={14} height={14} color="#334fd8" />}
      {!!item.tags?.length && (
        <foreignObject y={item.h + 8} width={item.w} height={30}>
          <div className="note-tags">
            {item.tags.slice(0, 3).map(t => (
              <span key={t}>{t}</span>
            ))}
            {item.tags.length > 3 && <span>+{item.tags.length - 3}</span>}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
