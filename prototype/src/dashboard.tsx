// Boards dashboard (item 56): open, create (blank, from a template or a saved template), rename,
// duplicate, star, file under spaces, filter by status, search titles, descriptions and board content,
// select several boards, move boards to the trash and restore them, and back up or restore the library.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Copy,
  Trash2,
  Pencil,
  Search,
  LayoutGrid,
  Star,
  RotateCcw,
  Download,
  Upload,
  FolderPlus,
  BookmarkPlus,
} from 'lucide-react';
import {
  cleanSpace,
  daysLeftInTrash,
  liveBoards,
  searchBoardContent,
  spacesOf,
  trashedBoards,
  TRASH_DAYS,
} from './board-library';
import type { BoardMeta, ContentCache, Library } from './board-library';
import { templateNames } from './board-tools';
import type { TemplateName } from './board-tools';
import { boardStatuses } from './board-settings';
import { loadTemplates } from './user-templates';
import type { UserTemplate } from './user-templates';
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

function StatusChip({ status }: { status?: string }) {
  const s = boardStatuses.find(x => x.id === status);
  if (!s) return null;
  return (
    <span className="board-status card-status" style={{ background: s.color }}>
      {s.label}
    </span>
  );
}

type SpaceChange = { create: string } | { rename: string; to: string } | { remove: string };

export function BoardsDashboard({
  library,
  onOpen,
  onCreate,
  onCreateFromTemplate,
  onRename,
  onDuplicate,
  onDelete,
  onRestore,
  onPurge,
  onSpace,
  onImport,
  onBackupAll,
  onClose,
  onMeta,
}: {
  library: Library;
  onOpen: (id: string) => void;
  onCreate: (template: TemplateName | null, space?: string) => void;
  onCreateFromTemplate?: (template: UserTemplate, space?: string) => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  /** Move boards to the trash. */
  onDelete: (ids: string[]) => void;
  onRestore?: (ids: string[]) => void;
  onPurge?: (ids: string[]) => void;
  onSpace?: (change: SpaceChange) => boolean;
  onImport?: (file: File) => void;
  onBackupAll?: () => void;
  onClose: () => void;
  onMeta?: (id: string | string[], patch: { starred?: boolean; space?: string | null }) => void;
}) {
  const [query, setQuery] = useState(''),
    [renaming, setRenaming] = useState<string | null>(null),
    [confirming, setConfirming] = useState<string | null>(null),
    [sort, setSort] = useState<'recent' | 'name' | 'created'>('recent'),
    [space, setSpace] = useState<string>('all'),
    [status, setStatus] = useState<string>('any'),
    [view, setView] = useState<'boards' | 'trash'>('boards'),
    [picked, setPicked] = useState<string[]>([]),
    [spaceEdit, setSpaceEdit] = useState<'new' | 'rename' | null>(null),
    [spaceName, setSpaceName] = useState(''),
    dialog = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    contentCache = useRef<ContentCache>(new Map());
  const [userTemplates] = useState<UserTemplate[]>(() => loadTemplates());
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
  const live = useMemo(() => liveBoards(library), [library]),
    trash = useMemo(() => trashedBoards(library), [library]),
    spaces = useMemo(() => spacesOf(library), [library]);
  // A space that was renamed or deleted falls back to all boards.
  const shownSpace = ['all', 'starred', 'none'].includes(space) || spaces.includes(space) ? space : 'all';
  const contentHits = useMemo(() => {
    try {
      return searchBoardContent(localStorage, library, query, contentCache.current);
    } catch {
      return new Map<string, string>();
    }
  }, [library, query]);
  const boards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (view === 'trash' ? trash : live).filter(
      b =>
        (!q ||
          b.title.toLowerCase().includes(q) ||
          !!b.description?.toLowerCase().includes(q) ||
          contentHits.has(b.id)) &&
        (view === 'trash' ||
          ((shownSpace === 'all' ||
            (shownSpace === 'starred' ? b.starred : shownSpace === 'none' ? !b.space : b.space === shownSpace)) &&
            (status === 'any' || (status === 'none' ? !b.status : b.status === status)))),
    );
    if (view === 'trash') return list;
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
  }, [live, trash, view, query, sort, shownSpace, status, contentHits]);
  const visiblePicked = picked.filter(id => boards.some(b => b.id === id));
  const togglePick = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const switchView = (next: 'boards' | 'trash') => {
    setView(next);
    setPicked([]);
    setConfirming(null);
  };
  const newIn = ['all', 'starred', 'none'].includes(shownSpace) ? undefined : shownSpace;
  const submitSpace = (e: React.FormEvent) => {
    e.preventDefault();
    const name = spaceName.trim();
    if (!name || !onSpace) return;
    const ok = spaceEdit === 'rename' && newIn ? onSpace({ rename: newIn, to: name }) : onSpace({ create: name });
    if (ok) {
      setSpace(cleanSpace(name));
      setSpaceEdit(null);
      setSpaceName('');
    }
  };
  return (
    <div
      className="format-overlay dashboard-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          if (renaming) setRenaming(null);
          else if (confirming) setConfirming(null);
          else if (spaceEdit) setSpaceEdit(null);
          else onClose();
        }
      }}
    >
      <div ref={dialog} className="format-editor dashboard" role="dialog" aria-modal="true" aria-label="Boards">
        <header>
          <div>
            <h2>
              <LayoutGrid size={20} /> {view === 'trash' ? 'Trash' : 'Boards'}
            </h2>
            <p>
              {view === 'trash'
                ? `Boards in the trash are deleted permanently after ${TRASH_DAYS} days.`
                : `${live.length} ${live.length === 1 ? 'board' : 'boards'} stored in this browser`}
            </p>
          </div>
          <div className="dashboard-header-actions">
            {onImport && (
              <button
                className="text-button"
                onClick={() => importInput.current?.click()}
                title="Add boards from a backup file"
              >
                <Upload size={15} /> Import
              </button>
            )}
            {onBackupAll && (
              <button className="text-button" onClick={onBackupAll} title="Save every board in one file">
                <Download size={15} /> Back up all boards
              </button>
            )}
            {onRestore && (
              <button
                className={`text-button ${view === 'trash' ? 'active' : ''}`}
                aria-pressed={view === 'trash'}
                onClick={() => switchView(view === 'trash' ? 'boards' : 'trash')}
              >
                <Trash2 size={15} /> Trash{trash.length ? ` (${trash.length})` : ''}
              </button>
            )}
            <button className="icon-button" aria-label="Close boards" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </header>
        {onImport && (
          <input
            ref={importInput}
            type="file"
            hidden
            aria-label="Choose a backup to import"
            accept=".json,application/json,.boardroom,application/zip"
            onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onImport(f);
            }}
          />
        )}
        {view === 'boards' && (
          <section className="dashboard-new" aria-label="New board">
            <button className="new-board" onClick={() => onCreate(null, newIn)}>
              <Plus size={22} />
              <span>{newIn ? `Blank board in ${newIn}` : 'Blank board'}</span>
            </button>
            {templateNames.map(t => (
              <button key={t} className="new-board template" onClick={() => onCreate(t, newIn)}>
                <LayoutGrid size={20} />
                <span>{t}</span>
              </button>
            ))}
            {(onCreateFromTemplate ? userTemplates : []).map(t => (
              <button
                key={t.id}
                className="new-board template user-template"
                title={`My template · ${t.count} ${t.count === 1 ? 'object' : 'objects'}`}
                onClick={() => onCreateFromTemplate?.(t, newIn)}
              >
                <BookmarkPlus size={20} />
                <span>{t.name}</span>
              </button>
            ))}
          </section>
        )}
        <div className="dashboard-tools">
          <label className="gallery-search">
            <Search size={16} />
            <input
              ref={search}
              aria-label="Find a board"
              placeholder={view === 'trash' ? 'Find in trash' : 'Find a board or its content'}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          {view === 'boards' && (
            <>
              <select aria-label="Show boards" value={shownSpace} onChange={e => setSpace(e.target.value)}>
                <option value="all">All boards</option>
                <option value="starred">Starred</option>
                <option value="none">No space</option>
                {spaces.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="any">Any status</option>
                <option value="none">No status</option>
                {boardStatuses.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select aria-label="Sort boards" value={sort} onChange={e => setSort(e.target.value as typeof sort)}>
                <option value="recent">Last edited</option>
                <option value="created">Newest</option>
                <option value="name">Name</option>
              </select>
              {onSpace && (
                <button
                  className="icon-button"
                  aria-label="New space"
                  title="New space"
                  onClick={() => {
                    setSpaceEdit('new');
                    setSpaceName('');
                  }}
                >
                  <FolderPlus size={17} />
                </button>
              )}
            </>
          )}
        </div>
        {view === 'boards' && onSpace && (spaceEdit || newIn) && (
          <div className="dashboard-space" aria-label="Space">
            {spaceEdit ? (
              <form onSubmit={submitSpace}>
                <input
                  autoFocus
                  aria-label={spaceEdit === 'new' ? 'New space name' : 'Space name'}
                  placeholder="Space name"
                  maxLength={60}
                  value={spaceName}
                  onChange={e => setSpaceName(e.target.value)}
                />
                <button type="submit" className="primary-button" disabled={!spaceName.trim()}>
                  {spaceEdit === 'new' ? 'Create space' : 'Rename space'}
                </button>
                <button type="button" onClick={() => setSpaceEdit(null)}>
                  Cancel
                </button>
              </form>
            ) : confirming === `space:${newIn}` ? (
              <div className="board-confirm" role="alert">
                <span>Delete the space “{newIn}”? Its boards move to No space.</span>
                <button
                  className="danger-button"
                  onClick={() => {
                    setConfirming(null);
                    if (newIn && onSpace({ remove: newIn })) setSpace('all');
                  }}
                >
                  Delete space
                </button>
                <button onClick={() => setConfirming(null)}>Keep</button>
              </div>
            ) : (
              <>
                <strong>{newIn}</strong>
                <button
                  onClick={() => {
                    setSpaceEdit('rename');
                    setSpaceName(newIn ?? '');
                  }}
                >
                  Rename space
                </button>
                <button onClick={() => setConfirming(`space:${newIn}`)}>Delete space</button>
              </>
            )}
          </div>
        )}
        {visiblePicked.length > 0 && (
          <div className="dashboard-bulk" role="toolbar" aria-label="Selected boards">
            <span>{visiblePicked.length} selected</span>
            {view === 'boards' ? (
              <>
                {onMeta && (
                  <select
                    aria-label="Move selected boards to space"
                    value=""
                    onChange={e => {
                      const v = e.target.value;
                      if (!v) return;
                      onMeta(visiblePicked, { space: v === '\u0000none' ? null : v });
                      setPicked([]);
                    }}
                  >
                    <option value="">Move to space…</option>
                    <option value={'\u0000none'}>No space</option>
                    {spaces.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="danger"
                  onClick={() => {
                    onDelete(visiblePicked);
                    setPicked([]);
                  }}
                >
                  <Trash2 size={15} /> Move to trash
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    onRestore?.(visiblePicked);
                    setPicked([]);
                  }}
                >
                  <RotateCcw size={15} /> Restore
                </button>
                {confirming === 'bulk' ? (
                  <span className="board-confirm" role="alert">
                    <span>Delete {visiblePicked.length} permanently?</span>
                    <button
                      className="danger-button"
                      onClick={() => {
                        setConfirming(null);
                        onPurge?.(visiblePicked);
                        setPicked([]);
                      }}
                    >
                      Delete forever
                    </button>
                    <button onClick={() => setConfirming(null)}>Keep</button>
                  </span>
                ) : (
                  <button className="danger" onClick={() => setConfirming('bulk')}>
                    Delete forever
                  </button>
                )}
              </>
            )}
            <button onClick={() => setPicked([])}>Clear selection</button>
          </div>
        )}
        {view === 'trash' && trash.length > 0 && !visiblePicked.length && (
          <div className="dashboard-bulk">
            {confirming === 'empty' ? (
              <span className="board-confirm" role="alert">
                <span>Delete all {trash.length} boards in the trash permanently?</span>
                <button
                  className="danger-button"
                  onClick={() => {
                    setConfirming(null);
                    onPurge?.(trash.map(b => b.id));
                  }}
                >
                  Empty trash
                </button>
                <button onClick={() => setConfirming(null)}>Keep</button>
              </span>
            ) : (
              <button className="danger" onClick={() => setConfirming('empty')}>
                Empty trash
              </button>
            )}
          </div>
        )}
        <ul className="board-grid" aria-label={view === 'trash' ? 'Boards in the trash' : 'Your boards'}>
          {boards.map(b => {
            const hit = query.trim() && contentHits.get(b.id);
            const isPicked = picked.includes(b.id);
            return (
              <li
                key={b.id}
                className={`board-card ${b.id === library.activeId ? 'current' : ''} ${isPicked ? 'picked' : ''}`}
                title={b.description || undefined}
              >
                <input
                  type="checkbox"
                  className="board-pick"
                  aria-label={`Select ${b.title}`}
                  checked={isPicked}
                  onChange={() => togglePick(b.id)}
                />
                {view === 'trash' ? (
                  <div className="board-open trashed" aria-hidden="true">
                    <Thumbnail meta={b} />
                  </div>
                ) : (
                  <button
                    className="board-open"
                    aria-label={`Open ${b.title}${b.id === library.activeId ? ' (open now)' : ''}`}
                    onClick={() => onOpen(b.id)}
                  >
                    <Thumbnail meta={b} />
                  </button>
                )}
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
                    <span className="board-card-title">
                      <strong title={b.title}>{b.title}</strong>
                      <StatusChip status={b.status} />
                    </span>
                  )}
                  {b.description && <p className="board-description">{b.description}</p>}
                  {hit && (
                    <p className="board-match" aria-label={`Content match in ${b.title}`}>
                      Matches “{hit}”
                    </p>
                  )}
                  <small>
                    {view === 'trash' && b.deletedAt
                      ? `Deleted ${relative(b.deletedAt)} · ${daysLeftInTrash(b.deletedAt)} days left`
                      : `${b.items} ${b.items === 1 ? 'object' : 'objects'} · ${relative(b.updatedAt)}`}
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
                          onPurge?.([b.id]);
                        }}
                      >
                        Delete forever
                      </button>
                      <button onClick={() => setConfirming(null)}>Keep</button>
                    </div>
                  ) : view === 'trash' ? (
                    <div className="board-actions">
                      <button
                        className="text-button"
                        aria-label={`Restore ${b.title}`}
                        onClick={() => onRestore?.([b.id])}
                      >
                        <RotateCcw size={14} /> Restore
                      </button>
                      <button
                        className="text-button danger"
                        aria-label={`Delete ${b.title} forever`}
                        onClick={() => setConfirming(b.id)}
                      >
                        Delete forever
                      </button>
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
                        title="Move to trash"
                        onClick={() => onDelete([b.id])}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {!boards.length && (
            <li className="board-empty">
              {view === 'trash' && !trash.length
                ? 'The trash is empty.'
                : query.trim()
                  ? `No boards match “${query}”.`
                  : 'No boards match these filters.'}
            </li>
          )}
        </ul>
        <footer>
          <span>Boards and their images stay in this browser. Back up all boards to keep a copy or move them.</span>
        </footer>
      </div>
    </div>
  );
}
