// Boards dashboard (item 56): open, create (blank or from a template), rename, duplicate and delete.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, Copy, Trash2, Pencil, Search, LayoutGrid, Star } from 'lucide-react';
import { spacesOf } from './board-library';
import type { BoardMeta, Library } from './board-library';
import { templateNames } from './board-tools';
import type { TemplateName } from './board-tools';
import { useLatest } from './use-latest';

const relative = (iso: string) => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString();
};

function Thumbnail({ meta }: { meta: BoardMeta }) {
  return (
    <svg className="board-thumb" viewBox="-0.05 -0.05 1.1 1.1" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={-0.05} y={-0.05} width={1.1} height={1.1} fill="#fafafb" />
      {meta.preview.map((s, k) =>
        s.kind === 'line' ? (
          <line key={k} x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} stroke="#8a8a94" strokeWidth={0.006} />
        ) : (
          <rect
            key={k}
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            rx={s.kind === 'note' ? 0 : 0.006}
            fill={s.kind === 'frame' ? '#ffffff' : s.fill}
            stroke={s.kind === 'frame' ? '#c5c5ce' : s.kind === 'shape' ? '#52525b' : 'none'}
            strokeWidth={0.004}
          />
        ),
      )}
      {!meta.preview.length && (
        <text x={0.5} y={0.52} textAnchor="middle" fontSize={0.07} fill="#8a8a94">
          Empty board
        </text>
      )}
    </svg>
  );
}

export function BoardsDashboard({
  library,
  onOpen,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
  onMeta,
}: {
  onMeta?: (id: string, patch: { starred?: boolean }) => void;
  library: Library;
  onOpen: (id: string) => void;
  onCreate: (template: TemplateName | null) => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    [renaming, setRenaming] = useState<string | null>(null),
    [confirming, setConfirming] = useState<string | null>(null),
    [sort, setSort] = useState<'recent' | 'name' | 'created'>('recent'),
    [space, setSpace] = useState<string>('all'),
    dialog = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  // Escape closes the dashboard even after focus was lost (for example when a deleted card's button disappears).
  const closeRef = useLatest(onClose);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dialog.current?.contains(document.activeElement)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRef.current();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  }, [closeRef]);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    search.current?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  const boards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = library.boards.filter(
      b =>
        (!q || b.title.toLowerCase().includes(q)) &&
        (space === 'all' || (space === 'starred' ? b.starred : space === 'none' ? !b.space : b.space === space)),
    );
    // Starred boards come first (item 107), then the chosen order.
    return [...list].sort(
      (a, b) =>
        Number(!!b.starred) - Number(!!a.starred) ||
        (sort === 'name'
          ? a.title.localeCompare(b.title)
          : sort === 'created'
            ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
            : Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    );
  }, [library.boards, query, sort, space]);
  return (
    <div
      className="format-overlay dashboard-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          if (renaming) setRenaming(null);
          else if (confirming) setConfirming(null);
          else onClose();
        }
      }}
    >
      <div ref={dialog} className="format-editor dashboard" role="dialog" aria-modal="true" aria-label="Boards">
        <header>
          <div>
            <h2>
              <LayoutGrid size={20} /> Boards
            </h2>
            <p>
              {library.boards.length} {library.boards.length === 1 ? 'board' : 'boards'} stored in this browser
            </p>
          </div>
          <button className="icon-button" aria-label="Close boards" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <section className="dashboard-new" aria-label="New board">
          <button className="new-board" onClick={() => onCreate(null)}>
            <Plus size={22} />
            <span>Blank board</span>
          </button>
          {templateNames.map(t => (
            <button key={t} className="new-board template" onClick={() => onCreate(t)}>
              <LayoutGrid size={20} />
              <span>{t}</span>
            </button>
          ))}
        </section>
        <div className="dashboard-tools">
          <label className="gallery-search">
            <Search size={16} />
            <input
              ref={search}
              aria-label="Find a board"
              placeholder="Find a board"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          <select aria-label="Show boards" value={space} onChange={e => setSpace(e.target.value)}>
            <option value="all">All boards</option>
            <option value="starred">Starred</option>
            <option value="none">No space</option>
            {spacesOf(library).map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select aria-label="Sort boards" value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
            <option value="recent">Last edited</option>
            <option value="created">Newest</option>
            <option value="name">Name</option>
          </select>
        </div>
        <ul className="board-grid" aria-label="Your boards">
          {boards.map(b => (
            <li key={b.id} className={`board-card ${b.id === library.activeId ? 'current' : ''}`}>
              <button
                className="board-open"
                aria-label={`Open ${b.title}${b.id === library.activeId ? ' (open now)' : ''}`}
                onClick={() => onOpen(b.id)}
              >
                <Thumbnail meta={b} />
              </button>
              <div className="board-card-body">
                {renaming === b.id ? (
                  <input
                    className="board-rename"
                    autoFocus
                    aria-label="Board name"
                    defaultValue={b.title}
                    maxLength={200}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v && v !== b.title) onRename(b.id, v);
                      setRenaming(null);
                    }}
                  />
                ) : (
                  <strong title={b.title}>{b.title}</strong>
                )}
                <small>
                  {b.items} {b.items === 1 ? 'object' : 'objects'} · {relative(b.updatedAt)}
                  {b.id === library.activeId ? ' · open now' : ''}
                  {b.space ? ` · ${b.space}` : ''}
                </small>
                {confirming === b.id ? (
                  <div className="board-confirm" role="alert">
                    <span>Delete permanently?</span>
                    <button
                      className="danger-button"
                      onClick={() => {
                        setConfirming(null);
                        onDelete(b.id);
                      }}
                    >
                      Delete
                    </button>
                    <button onClick={() => setConfirming(null)}>Keep</button>
                  </div>
                ) : (
                  <div className="board-actions">
                    {onMeta && (
                      <button
                        className={`icon-button ${b.starred ? 'active' : ''}`}
                        aria-label={`${b.starred ? 'Unstar' : 'Star'} ${b.title}`}
                        aria-pressed={!!b.starred}
                        title={b.starred ? 'Unstar' : 'Star'}
                        onClick={() => onMeta(b.id, { starred: !b.starred })}
                      >
                        <Star size={15} fill={b.starred ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label={`Rename ${b.title}`}
                      title="Rename"
                      onClick={() => setRenaming(b.id)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Duplicate ${b.title}`}
                      title="Duplicate"
                      onClick={() => onDuplicate(b.id)}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Delete ${b.title}`}
                      title="Delete"
                      onClick={() => setConfirming(b.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
          {!boards.length && <li className="board-empty">No boards match “{query}”.</li>}
        </ul>
        <footer>
          <span>Boards and their images stay in this browser. Export a board to back it up or move it.</span>
        </footer>
      </div>
    </div>
  );
}
