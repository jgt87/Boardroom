// Boards dashboard (item 56): open, create (blank, from a template or a saved template), rename,
// duplicate, star, file under spaces, filter by status, search titles, descriptions and board content,
// select several boards, move boards to the trash and restore them, and back up or restore the library.
// Track R3: template previews, "Last opened" sort, a list layout, Ctrl+E for search, content matches that
// open the board at the object or comment, space emoji and descriptions, blueprints, bulk duplicate, and an
// overview with a recent-activity digest and the comments across boards.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Copy,
  Trash2,
  Pencil,
  Search,
  LayoutGrid,
  List,
  Star,
  RotateCcw,
  Download,
  Upload,
  FolderPlus,
  Activity as ActivityIcon,
} from 'lucide-react';
import {
  boardEmoji,
  cleanSpace,
  daysLeftInTrash,
  liveBoards,
  searchBoardMatches,
  spaceInfoOf,
  spacesOf,
  trashedBoards,
  TRASH_DAYS,
  SPACE_DESCRIPTION_MAX,
} from './board-library';
import type { BoardMeta, BoardMetaPatch, ContentCache, Library, OpenTarget, SpaceInfo } from './board-library';
import { templateNames } from './board-tools';
import { singleFormats } from './deep-link';
import type { SingleFormat } from './deep-link';
import type { TemplateName } from './board-tools';
import { badgeInk, boardStatuses } from './board-settings';
import { loadTemplates, templatePreview } from './user-templates';
import type { UserTemplate } from './user-templates';
import { useLatest } from './use-latest';
import { PreviewThumb, StarterThumb } from './board-thumb';
import { byLastOpened, activityDigest, commentsAcrossBoards } from './library-insights';
import { catchUpPeriods } from './activity';
import {
  addBlueprint,
  blueprintFromSpace,
  builtInBlueprints,
  loadBlueprints,
  removeBlueprint,
  storeBlueprints,
  type Blueprint,
} from './blueprints';
import { parseBoard } from './model';
import './library-r3.css';
import './library-r2.css';

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

function StatusChip({ status }: { status?: string }) {
  const s = boardStatuses.find(x => x.id === status);
  if (!s) return null;
  return (
    <span className="board-status card-status" style={{ background: s.color }}>
      {s.label}
    </span>
  );
}

/** Sensitivity badge on a board card (track R2-K). Index entries are not validated, so the colour is checked. */
function SensitivityTag({ value }: { value?: BoardMeta['sensitivity'] }) {
  if (!value || typeof value.label !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color ?? '')) return null;
  return (
    <span
      className="board-status card-status sensitivity-badge"
      style={{ background: value.color, color: badgeInk(value.color) }}
      title={`Sensitivity: ${value.label}`}
    >
      {value.label.slice(0, 40)}
    </span>
  );
}

/** Whether a board belongs to the dashboard's space filter. */
const inSpace = (b: BoardMeta, shown: string) =>
  shown === 'all' || (shown === 'starred' ? !!b.starred : shown === 'none' ? !b.space : b.space === shown);
type SpaceChange = { create: string } | { rename: string; to: string } | { remove: string };
type Layout = 'grid' | 'list';
const LAYOUT_KEY = 'boardroom.dashboard.layout';
const readLayout = (): Layout => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
};

/** Recent changes and comments across the boards in view (track R3). */
function Overview({ boards, onOpen }: { boards: BoardMeta[]; onOpen: (id: string, target?: OpenTarget) => void }) {
  const [period, setPeriod] = useState<(typeof catchUpPeriods)[number]['id']>('week'),
    [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const ms = catchUpPeriods.find(p => p.id === period)!.ms;
  const [now] = useState(() => Date.now());
  const digest = useMemo(() => {
    try {
      return activityDigest(localStorage, boards, now - ms);
    } catch {
      return { boards: [], added: 0, edited: 0, deleted: 0, total: 0 };
    }
  }, [boards, ms, now]);
  const comments = useMemo(() => {
    try {
      return commentsAcrossBoards(localStorage, boards, filter);
    } catch {
      return [];
    }
  }, [boards, filter]);
  return (
    <div className="dashboard-overview">
      <section aria-label="Recent activity">
        <div className="overview-heading">
          <h3>Recent activity</h3>
          <select
            aria-label="Activity period"
            value={period}
            onChange={e => setPeriod(e.target.value as typeof period)}
          >
            {catchUpPeriods.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {digest.total ? (
          <>
            <p className="overview-summary">
              {digest.total} {digest.total === 1 ? 'change' : 'changes'} on {digest.boards.length}{' '}
              {digest.boards.length === 1 ? 'board' : 'boards'}: {digest.added} added, {digest.edited} edited,{' '}
              {digest.deleted} deleted.
            </p>
            <ol className="overview-list" aria-label="Changes by board">
              {digest.boards.map(d => (
                <li key={d.id}>
                  <button onClick={() => onOpen(d.id)}>
                    <strong>{d.title}</strong>
                    <small>
                      {d.added} added · {d.edited} edited · {d.deleted} deleted · last {relative(d.last)}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="overview-summary">No changes in this period.</p>
        )}
      </section>
      <section aria-label="Comments across boards">
        <div className="overview-heading">
          <h3>Comments</h3>
          <select aria-label="Show comments" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </div>
        {comments.length ? (
          <ol className="overview-list" aria-label="Comment threads">
            {comments.map(c => (
              <li key={`${c.boardId}:${c.threadId}`}>
                <button onClick={() => onOpen(c.boardId, { threadId: c.threadId, itemId: c.itemId })}>
                  <strong>{c.text || '(no text)'}</strong>
                  <small>
                    {c.boardTitle} · {c.messages} {c.messages === 1 ? 'message' : 'messages'}
                    {c.at ? ` · ${relative(c.at)}` : ''}
                    {c.resolved ? ' · resolved' : ''}
                  </small>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="overview-summary">No {filter === 'all' ? '' : `${filter} `}comments on these boards.</p>
        )}
      </section>
    </div>
  );
}

export function BoardsDashboard({
  library,
  onOpen,
  onCreate,
  onCreateFromTemplate,
  onCreateFormat,
  onRename,
  onDuplicate,
  onDuplicateMany,
  onDelete,
  onRestore,
  onPurge,
  onSpace,
  onSpaceInfo,
  onBlueprint,
  onFlush,
  onImport,
  onBackupAll,
  onBackup,
  onClose,
  onMeta,
}: {
  library: Library;
  onOpen: (id: string, target?: OpenTarget) => void;
  onCreate: (template: TemplateName | null, space?: string) => void;
  onCreateFromTemplate?: (template: UserTemplate, space?: string) => void;
  /** Create a board holding one format (Kanban, Table, Timeline or Doc) and open it in focus. */
  onCreateFormat?: (kind: SingleFormat, space?: string) => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDuplicateMany?: (ids: string[]) => void;
  /** Move boards to the trash. */
  onDelete: (ids: string[]) => void;
  onRestore?: (ids: string[]) => void;
  onPurge?: (ids: string[]) => void;
  onSpace?: (change: SpaceChange) => boolean;
  onSpaceInfo?: (name: string, info: SpaceInfo) => boolean;
  /** Create a space from a blueprint; returns the new space name. */
  onBlueprint?: (bp: Blueprint) => string | null;
  /** Save the open board and return the current library (before saving a space as a blueprint). */
  onFlush?: () => Library;
  /** Import a backup; a library backup may add blueprints, so the list is reloaded when it settles. */
  onImport?: (file: File) => void | Promise<unknown>;
  onBackupAll?: () => void;
  /** Back up one or the selected boards in the library backup format (track R2-I). */
  onBackup?: (ids: string[]) => void;
  onClose: () => void;
  onMeta?: (id: string | string[], patch: BoardMetaPatch) => void;
}) {
  const [query, setQuery] = useState(''),
    [renaming, setRenaming] = useState<string | null>(null),
    [confirming, setConfirming] = useState<string | null>(null),
    [sort, setSort] = useState<'recent' | 'opened' | 'name' | 'created'>('recent'),
    [space, setSpace] = useState<string>('all'),
    [status, setStatus] = useState<string>('any'),
    [view, setView] = useState<'boards' | 'trash' | 'overview'>('boards'),
    [layout, setLayoutState] = useState<Layout>(readLayout),
    [picked, setPicked] = useState<string[]>([]),
    [spaceEdit, setSpaceEdit] = useState<'new' | 'rename' | 'about' | null>(null),
    [spaceName, setSpaceName] = useState(''),
    [spaceEmoji, setSpaceEmoji] = useState(''),
    [spaceAbout, setSpaceAbout] = useState(''),
    [notice, setNotice] = useState(''),
    dialog = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    contentCache = useRef<ContentCache>(new Map());
  const [userTemplates] = useState<UserTemplate[]>(() => loadTemplates());
  const [savedBlueprints, setSavedBlueprints] = useState<Blueprint[]>(() => loadBlueprints(parseBoard));
  const templatePreviews = useMemo(() => new Map(userTemplates.map(t => [t.id, templatePreview(t)])), [userTemplates]);
  const setLayout = (next: Layout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      /* Per-browser convenience only. */
    }
  };
  // Escape closes the dashboard even after focus was lost (for example when a deleted card's button disappears);
  // Ctrl+E focuses the search from anywhere.
  const closeRef = useLatest(onClose);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        e.stopImmediatePropagation();
        search.current?.focus();
        search.current?.select();
        return;
      }
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
      return searchBoardMatches(localStorage, library, query, contentCache.current);
    } catch {
      return new Map<string, { excerpt: string } & OpenTarget>();
    }
  }, [library, query]);
  const scoped = useMemo(() => live.filter(b => inSpace(b, shownSpace)), [live, shownSpace]);
  const boards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (view === 'trash' ? trash : live).filter(
      b =>
        (!q ||
          b.title.toLowerCase().includes(q) ||
          !!b.description?.toLowerCase().includes(q) ||
          contentHits.has(b.id)) &&
        (view === 'trash' ||
          (inSpace(b, shownSpace) && (status === 'any' || (status === 'none' ? !b.status : b.status === status)))),
    );
    if (view === 'trash') return list;
    let opened: Map<string, number> | null = null;
    if (sort === 'opened')
      try {
        opened = new Map(byLastOpened(localStorage, list).map((b, k) => [b.id, k]));
      } catch {
        opened = null;
      }
    // Starred boards come first (item 107), then the chosen order.
    return [...list].sort(
      (a, b) =>
        Number(!!b.starred) - Number(!!a.starred) ||
        (sort === 'name'
          ? a.title.localeCompare(b.title)
          : sort === 'created'
            ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
            : sort === 'opened' && opened
              ? opened.get(a.id)! - opened.get(b.id)!
              : Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    );
  }, [live, trash, view, query, sort, shownSpace, status, contentHits]);
  const visiblePicked = picked.filter(id => boards.some(b => b.id === id));
  const togglePick = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const switchView = (next: 'boards' | 'trash' | 'overview') => {
    setView(next);
    setPicked([]);
    setConfirming(null);
  };
  const newIn = ['all', 'starred', 'none'].includes(shownSpace) ? undefined : shownSpace;
  const info = newIn ? spaceInfoOf(library, newIn) : {};
  const blueprints = [...savedBlueprints, ...builtInBlueprints];
  const submitSpace = (e: React.FormEvent) => {
    e.preventDefault();
    if (spaceEdit === 'about' && newIn) {
      if (onSpaceInfo?.(newIn, { emoji: spaceEmoji, description: spaceAbout })) setSpaceEdit(null);
      return;
    }
    const name = spaceName.trim();
    if (!name || !onSpace) return;
    const ok = spaceEdit === 'rename' && newIn ? onSpace({ rename: newIn, to: name }) : onSpace({ create: name });
    if (ok) {
      if (spaceEdit === 'new' && (spaceEmoji.trim() || spaceAbout.trim()))
        onSpaceInfo?.(cleanSpace(name), { emoji: spaceEmoji, description: spaceAbout });
      setSpace(cleanSpace(name));
      setSpaceEdit(null);
      setSpaceName('');
    }
  };
  const saveBlueprint = () => {
    if (!newIn) return;
    const lib = onFlush?.() ?? library;
    const made = blueprintFromSpace(localStorage, lib, newIn, parseBoard, crypto.randomUUID(), new Date(), info);
    if ('error' in made) return setNotice(made.error);
    const next = addBlueprint(savedBlueprints, made);
    if (!storeBlueprints(next)) return setNotice('The blueprint could not be stored (browser storage is full).');
    setSavedBlueprints(next);
    setNotice(`Saved “${made.name}” as a blueprint with ${made.boards.length} boards.`);
  };
  const spaceLabel = (s: string) => {
    const e = spaceInfoOf(library, s).emoji;
    return e ? `${e} ${s}` : s;
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
              <LayoutGrid size={20} /> {view === 'trash' ? 'Trash' : view === 'overview' ? 'Overview' : 'Boards'}
            </h2>
            <p>
              {view === 'trash'
                ? `Boards in the trash are deleted permanently after ${TRASH_DAYS} days.`
                : view === 'overview'
                  ? `Recent changes and comments on ${scoped.length} ${scoped.length === 1 ? 'board' : 'boards'}${newIn ? ` in ${newIn}` : ''}.`
                  : `${live.length} ${live.length === 1 ? 'board' : 'boards'} stored in this browser`}
            </p>
          </div>
          <div className="dashboard-header-actions">
            <button
              className={`text-button ${view === 'overview' ? 'active' : ''}`}
              aria-pressed={view === 'overview'}
              onClick={() => switchView(view === 'overview' ? 'boards' : 'overview')}
              title="Recent activity and comments across boards"
            >
              <ActivityIcon size={15} /> Overview
            </button>
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
              if (f) void Promise.resolve(onImport(f)).then(() => setSavedBlueprints(loadBlueprints(parseBoard)));
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
              <button key={t} className="new-board template with-preview" onClick={() => onCreate(t, newIn)}>
                <span className="new-board-thumb">
                  <StarterThumb name={t} />
                </span>
                <span>{t}</span>
              </button>
            ))}
            {(onCreateFormat ? singleFormats : []).map(f => (
              <button
                key={f.kind}
                className="new-board template format-board"
                title="A board with one large format object, opened in focus"
                onClick={() => onCreateFormat?.(f.kind, newIn)}
              >
                <LayoutGrid size={20} />
                <span>{f.label}</span>
              </button>
            ))}
            {(onCreateFromTemplate ? userTemplates : []).map(t => (
              <button
                key={t.id}
                className="new-board template user-template with-preview"
                title={`My template · ${t.count} ${t.count === 1 ? 'object' : 'objects'}${t.description ? ` · ${t.description}` : ''}`}
                onClick={() => onCreateFromTemplate?.(t, newIn)}
              >
                <span className="new-board-thumb">
                  <PreviewThumb preview={templatePreviews.get(t.id) ?? []} empty="" />
                </span>
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
              aria-keyshortcuts="Control+E"
              placeholder={view === 'trash' ? 'Find in trash' : 'Find a board or its content (Ctrl E)'}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          {view !== 'trash' && (
            <>
              <select aria-label="Show boards" value={shownSpace} onChange={e => setSpace(e.target.value)}>
                <option value="all">All boards</option>
                <option value="starred">Starred</option>
                <option value="none">No space</option>
                {spaces.map(s => (
                  <option key={s} value={s}>
                    {spaceLabel(s)}
                  </option>
                ))}
              </select>
              {view === 'boards' && (
                <>
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
                    <option value="opened">Last opened</option>
                    <option value="created">Newest</option>
                    <option value="name">Name</option>
                  </select>
                  <button
                    className="icon-button"
                    aria-label={layout === 'grid' ? 'Show as list' : 'Show as grid'}
                    title={layout === 'grid' ? 'Show as list' : 'Show as grid'}
                    onClick={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
                  >
                    {layout === 'grid' ? <List size={17} /> : <LayoutGrid size={17} />}
                  </button>
                </>
              )}
              {onSpace && (
                <button
                  className="icon-button"
                  aria-label="New space"
                  title="New space"
                  onClick={() => {
                    setSpaceEdit('new');
                    setSpaceName('');
                    setSpaceEmoji('');
                    setSpaceAbout('');
                  }}
                >
                  <FolderPlus size={17} />
                </button>
              )}
            </>
          )}
        </div>
        {view !== 'trash' && onSpace && (spaceEdit || newIn) && (
          <div className="dashboard-space" aria-label="Space">
            {spaceEdit ? (
              <form onSubmit={submitSpace} className="space-form">
                {spaceEdit !== 'about' && (
                  <input
                    autoFocus
                    aria-label={spaceEdit === 'new' ? 'New space name' : 'Space name'}
                    placeholder="Space name"
                    maxLength={60}
                    value={spaceName}
                    onChange={e => setSpaceName(e.target.value)}
                  />
                )}
                {spaceEdit !== 'rename' && (
                  <>
                    <input
                      className="space-emoji-input"
                      aria-label="Space emoji"
                      placeholder="Emoji"
                      maxLength={16}
                      value={spaceEmoji}
                      onChange={e => setSpaceEmoji(e.target.value)}
                    />
                    <textarea
                      aria-label="Space description"
                      placeholder="What is this space for?"
                      rows={2}
                      maxLength={SPACE_DESCRIPTION_MAX}
                      value={spaceAbout}
                      onChange={e => setSpaceAbout(e.target.value)}
                    />
                  </>
                )}
                <button type="submit" className="primary-button" disabled={spaceEdit !== 'about' && !spaceName.trim()}>
                  {spaceEdit === 'new' ? 'Create space' : spaceEdit === 'rename' ? 'Rename space' : 'Save details'}
                </button>
                <button type="button" onClick={() => setSpaceEdit(null)}>
                  Cancel
                </button>
                {spaceEdit === 'new' && onBlueprint && (
                  <div className="blueprint-list" role="group" aria-label="Start from a blueprint">
                    <span>Or start from a blueprint:</span>
                    {blueprints.map(bp => (
                      <span key={bp.id} className="blueprint-entry">
                        <button
                          type="button"
                          title={`${bp.description ?? ''}${bp.description ? ' · ' : ''}${bp.boards.map(b => b.title).join(', ')}`}
                          onClick={() => {
                            const made = onBlueprint(bp);
                            if (made) {
                              setSpace(made);
                              setSpaceEdit(null);
                            }
                          }}
                        >
                          {bp.emoji ? `${bp.emoji} ` : ''}
                          {bp.name} ({bp.boards.length} boards)
                        </button>
                        {!bp.builtIn && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Delete blueprint ${bp.name}`}
                            onClick={() => {
                              const next = removeBlueprint(savedBlueprints, bp.id);
                              if (storeBlueprints(next)) setSavedBlueprints(next);
                            }}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
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
                <span className="space-title">
                  <strong>
                    {info.emoji ? <span aria-hidden="true">{info.emoji} </span> : null}
                    {newIn}
                  </strong>
                  {info.description && <small className="space-description">{info.description}</small>}
                </span>
                <button
                  onClick={() => {
                    setSpaceEdit('rename');
                    setSpaceName(newIn ?? '');
                  }}
                >
                  Rename space
                </button>
                {onSpaceInfo && (
                  <button
                    onClick={() => {
                      setSpaceEdit('about');
                      setSpaceEmoji(info.emoji ?? '');
                      setSpaceAbout(info.description ?? '');
                    }}
                  >
                    Edit details
                  </button>
                )}
                <button onClick={saveBlueprint}>Save as blueprint</button>
                <button onClick={() => setConfirming(`space:${newIn}`)}>Delete space</button>
              </>
            )}
          </div>
        )}
        {notice && (
          <p className="dashboard-notice" role="alert">
            {notice}{' '}
            <button className="icon-button" aria-label="Dismiss" onClick={() => setNotice('')}>
              <X size={13} />
            </button>
          </p>
        )}
        {view === 'overview' && <Overview boards={scoped} onOpen={onOpen} />}
        {view !== 'overview' && visiblePicked.length > 0 && (
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
                        {spaceLabel(s)}
                      </option>
                    ))}
                  </select>
                )}
                {onDuplicateMany && (
                  <button
                    onClick={() => {
                      onDuplicateMany(visiblePicked);
                      setPicked([]);
                    }}
                  >
                    <Copy size={15} /> Duplicate
                  </button>
                )}
                {onBackup && (
                  <button title="Save the selected boards in one backup file" onClick={() => onBackup(visiblePicked)}>
                    <Download size={15} /> Back up
                  </button>
                )}
                {confirming === 'trash-bulk' ? (
                  <span className="board-confirm" role="alert">
                    <span>
                      Move {visiblePicked.length} {visiblePicked.length === 1 ? 'board' : 'boards'} to the trash?
                    </span>
                    <button
                      className="danger-button"
                      onClick={() => {
                        setConfirming(null);
                        onDelete(visiblePicked);
                        setPicked([]);
                      }}
                    >
                      Move to trash
                    </button>
                    <button onClick={() => setConfirming(null)}>Keep</button>
                  </span>
                ) : (
                  <button className="danger" onClick={() => setConfirming('trash-bulk')}>
                    <Trash2 size={15} /> Move to trash
                  </button>
                )}
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
        {view !== 'overview' && (
          <ul
            className={`board-grid ${layout === 'list' && view === 'boards' ? 'board-list' : ''}`}
            aria-label={view === 'trash' ? 'Boards in the trash' : 'Your boards'}
          >
            {boards.map(b => {
              const hit = query.trim() ? contentHits.get(b.id) : undefined;
              const target: OpenTarget | undefined =
                hit && (hit.itemId || hit.threadId) ? { itemId: hit.itemId, threadId: hit.threadId } : undefined;
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
                      <PreviewThumb preview={b.preview} />
                    </div>
                  ) : (
                    <button
                      className="board-open"
                      aria-label={`Open ${b.title}${b.id === library.activeId ? ' (open now)' : ''}`}
                      onClick={() => onOpen(b.id, target)}
                    >
                      <PreviewThumb preview={b.preview} />
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
                        {boardEmoji(b) && (
                          <span className="board-emoji" data-board-emoji aria-hidden="true">
                            {boardEmoji(b)}
                          </span>
                        )}
                        <strong title={b.title}>{b.title}</strong>
                        <StatusChip status={b.status} />
                        <SensitivityTag value={b.sensitivity} />
                      </span>
                    )}
                    {b.description && <p className="board-description">{b.description}</p>}
                    {hit && (
                      <p className="board-match" aria-label={`Content match in ${b.title}`}>
                        {hit.threadId ? 'Comment matches' : 'Matches'} “{hit.excerpt}”
                      </p>
                    )}
                    {hit && target && view === 'boards' && (
                      <button
                        className="text-button board-match-open"
                        aria-label={`Show the match in ${b.title}`}
                        onClick={() => onOpen(b.id, target)}
                      >
                        <Search size={13} /> Show match
                      </button>
                    )}
                    <small>
                      {view === 'trash' && b.deletedAt
                        ? `Deleted ${relative(b.deletedAt)} · ${daysLeftInTrash(b.deletedAt)} days left`
                        : `${b.items} ${b.items === 1 ? 'object' : 'objects'} · ${relative(b.updatedAt)}`}
                      {b.id === library.activeId ? ' · open now' : ''}
                      {b.space ? ` · ${spaceLabel(b.space)}` : ''}
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
                    ) : confirming === `trash:${b.id}` ? (
                      <div className="board-confirm" role="alert">
                        <span>Move to the trash?</span>
                        <button
                          className="danger-button"
                          onClick={() => {
                            setConfirming(null);
                            onDelete([b.id]);
                          }}
                        >
                          Move to trash
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
                        {onBackup && (
                          <button
                            className="icon-button"
                            aria-label={`Back up ${b.title}`}
                            title="Back up this board"
                            onClick={() => onBackup([b.id])}
                          >
                            <Download size={15} />
                          </button>
                        )}
                        <button
                          className="icon-button danger"
                          aria-label={`Delete ${b.title}`}
                          title="Move to trash"
                          onClick={() => setConfirming(`trash:${b.id}`)}
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
        )}
        <footer>
          <span>Boards and their images stay in this browser. Back up all boards to keep a copy or move them.</span>
        </footer>
      </div>
    </div>
  );
}
