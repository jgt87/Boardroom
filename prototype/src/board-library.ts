// Multiple boards stored locally (item 56). Evidence: the audit's "Dashboard space/template creation"
// module. Each board lives under its own key; an index records titles, timestamps and a small
// preview for the dashboard. The legacy single-board key always mirrors the active board so older
// copies and external tools keep working, and a newer legacy copy is adopted on load.
import type { Board, Item } from './model.ts';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type PreviewShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  kind: 'note' | 'frame' | 'line' | 'shape';
};
export type BoardMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  items: number;
  preview: PreviewShape[];
  /** Optional space (folder) the board is filed under, and whether it is starred (item 107). */
  space?: string;
  starred?: boolean;
  /** Board status and description copied from the board, for dashboard chips, filters and search. */
  status?: string;
  description?: string;
  /** Set while the board is in the trash; its stored data is kept until it is purged. */
  deletedAt?: string;
  /** 2 once status and description have been copied from the stored board (older indexes lack them). */
  v?: 2;
};
/**
 * `spaces` lists spaces created explicitly, so an empty space is kept; spaces named only by boards
 * (older indexes) still count. Every new field is optional, so older indexes load unchanged.
 */
export type Library = {
  version: 1;
  activeId: string;
  boards: BoardMeta[];
  spaces?: string[];
  /** Optional emoji and description per space name (track R3). */
  spaceInfo?: Record<string, SpaceInfo>;
};
export type SpaceInfo = { emoji?: string; description?: string };

export const INDEX_KEY = 'boardroom.boards.v1';
export const LEGACY_KEY = 'boardroom.document.v1';
export const boardKey = (id: string) => `boardroom.board.${id}`;
const uid = () => crypto.randomUUID();

/** Up to 60 of the largest objects, normalised to the board bounds (0..1), for dashboard thumbnails. */
export function previewOf(board: Board): PreviewShape[] {
  // A chosen thumbnail frame (gap C13) limits the preview to that frame's area.
  const f = board.thumbnailFrame
    ? board.items.find(i => i.id === board.thumbnailFrame && i.type === 'frame')
    : undefined;
  const inFrame = (i: Item) =>
    !f || (i.x < f.x + f.w && i.x + Math.abs(i.w) > f.x && i.y < f.y + f.h && i.y + Math.abs(i.h) > f.y);
  const shapes = board.items.filter(i => !i.hidden && i.type !== 'pen' && inFrame(i));
  if (!shapes.length) return [];
  const box = (i: Item) =>
    i.type === 'arrow'
      ? { x: Math.min(i.x, i.x + i.w), y: Math.min(i.y, i.y + i.h), w: Math.abs(i.w), h: Math.abs(i.h) }
      : i;
  const boxes = shapes.map(i => ({ i, b: box(i) }));
  const minX = Math.min(...boxes.map(({ b }) => b.x)),
    minY = Math.min(...boxes.map(({ b }) => b.y)),
    maxX = Math.max(...boxes.map(({ b }) => b.x + b.w)),
    maxY = Math.max(...boxes.map(({ b }) => b.y + b.h)),
    span = Math.max(maxX - minX, maxY - minY, 1);
  return boxes
    .filter(({ i }) => i.type !== 'arrow' || (!i.from && !i.to))
    .sort((a, b) => b.b.w * b.b.h - a.b.w * a.b.h)
    .slice(0, 60)
    .map(({ i, b }) => ({
      x: (b.x - minX) / span,
      y: (b.y - minY) / span,
      w: Math.max(0.004, b.w / span),
      h: Math.max(0.004, b.h / span),
      fill: /^#[0-9a-f]{6}$/i.test(i.fill) ? i.fill : '#d4d4da',
      kind: i.type === 'note' ? 'note' : i.type === 'frame' ? 'frame' : i.type === 'arrow' ? 'line' : 'shape',
    }));
}
/** Preview shapes from untrusted data (saved templates, imports): valid shapes only, or undefined. */
export function cleanPreview(v: unknown): PreviewShape[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 2;
  return v
    .filter(
      (s): s is PreviewShape =>
        !!s &&
        num(s.x) &&
        num(s.y) &&
        num(s.w) &&
        num(s.h) &&
        typeof s.fill === 'string' &&
        /^#[0-9a-f]{6}$/i.test(s.fill) &&
        ['note', 'frame', 'line', 'shape'].includes(s.kind),
    )
    .slice(0, 60)
    .map(s => ({ x: s.x, y: s.y, w: s.w, h: s.h, fill: s.fill, kind: s.kind }));
}
export const DESCRIPTION_MAX = 1000;
/** Copy the board's status and description onto its index entry (removing them when absent). */
function withBoardFacts(meta: BoardMeta, board: { status?: unknown; description?: unknown }): BoardMeta {
  const m: BoardMeta = { ...meta, v: 2 };
  if (typeof board.status === 'string' && board.status) m.status = board.status;
  else delete m.status;
  if (typeof board.description === 'string' && board.description.trim())
    m.description = board.description.slice(0, DESCRIPTION_MAX);
  else delete m.description;
  return m;
}
const metaFor = (id: string, board: Board, now: string, createdAt = now): BoardMeta =>
  withBoardFacts(
    {
      id,
      title: board.title || 'Untitled board',
      createdAt,
      updatedAt: now,
      items: board.items.length,
      preview: previewOf(board),
    },
    board,
  );
/** Boards not in the trash, in index order. */
export const liveBoards = (lib: Library) => lib.boards.filter(b => !b.deletedAt);
/** Boards in the trash, most recently deleted first. */
export const trashedBoards = (lib: Library) =>
  lib.boards.filter(b => b.deletedAt).sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!));
function readIndex(kv: KeyValueStore): Library | null {
  try {
    const raw = kv.getItem(INDEX_KEY);
    if (!raw) return null;
    const lib = JSON.parse(raw) as Library;
    if (lib?.version !== 1 || !Array.isArray(lib.boards) || typeof lib.activeId !== 'string') return null;
    return lib;
  } catch {
    return null;
  }
}
const writeIndex = (kv: KeyValueStore, lib: Library) => kv.setItem(INDEX_KEY, JSON.stringify(lib));
export const SPACE_MAX = 60;
export const cleanSpace = (name: string) =>
  [...name]
    .filter(ch => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SPACE_MAX);
/** Distinct spaces (created ones and those used by boards outside the trash), alphabetically. */
export const spacesOf = (lib: Library) =>
  [
    ...new Set([
      ...(lib.spaces ?? []).map(cleanSpace).filter(Boolean),
      ...liveBoards(lib)
        .map(b => b.space)
        .filter((s): s is string => !!s),
    ]),
  ].sort((a, b) => a.localeCompare(b));
const withSpaces = (lib: Library, spaces: string[]): Library => {
  const next = { ...lib };
  if (spaces.length) next.spaces = [...new Set(spaces)];
  else delete next.spaces;
  return next;
};
/** Create an empty space. Throws when the name is empty or already used. */
export function createSpace(kv: KeyValueStore, lib: Library, name: string): Library {
  const clean = cleanSpace(name);
  if (!clean) throw new Error('Give the space a name.');
  if (spacesOf(lib).some(s => s.toLowerCase() === clean.toLowerCase())) throw new Error('That space already exists.');
  const next = withSpaces(lib, [...(lib.spaces ?? []), clean]);
  writeIndex(kv, next);
  return next;
}
/** Rename a space; its boards (trashed ones included) move with it. Renaming onto an existing space merges them. */
export function renameSpace(kv: KeyValueStore, lib: Library, from: string, to: string): Library {
  const clean = cleanSpace(to);
  if (!clean) throw new Error('Give the space a name.');
  const listed = (lib.spaces ?? []).filter(s => s !== from && s !== clean);
  const info = lib.spaceInfo?.[from];
  let next = withSpaces({ ...lib, boards: lib.boards.map(b => (b.space === from ? { ...b, space: clean } : b)) }, [
    ...listed,
    clean,
  ]);
  if (info && from !== clean) next = withInfo(withInfo(next, from, null), clean, info);
  writeIndex(kv, next);
  return next;
}

// ---- Space emoji and description (track R3) ---------------------------------------------------------
export const SPACE_DESCRIPTION_MAX = 500;
/** One short emoji or symbol (at most 16 code units, no markup or control characters), or ''. */
export const cleanEmoji = (v: string) =>
  [...v.trim()].some(ch => ch.charCodeAt(0) < 32 || ch === '<' || ch === '>') || v.trim().length > 16 ? '' : v.trim();
export const cleanSpaceDescription = (v: string) =>
  [...v]
    .filter(ch => (ch.charCodeAt(0) >= 32 || ch === '\n') && ch !== '<' && ch !== '>')
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, SPACE_DESCRIPTION_MAX);
/** A space's emoji and description, cleaned (the index is untrusted: it may come from older or edited data). */
export function spaceInfoOf(lib: Library, name: string): SpaceInfo {
  const raw = lib.spaceInfo && typeof lib.spaceInfo === 'object' ? lib.spaceInfo[name] : undefined;
  const out: SpaceInfo = {};
  if (raw && typeof raw.emoji === 'string' && cleanEmoji(raw.emoji)) out.emoji = cleanEmoji(raw.emoji);
  if (raw && typeof raw.description === 'string' && cleanSpaceDescription(raw.description))
    out.description = cleanSpaceDescription(raw.description);
  return out;
}
function withInfo(lib: Library, name: string, info: SpaceInfo | null): Library {
  const all = { ...(lib.spaceInfo ?? {}) };
  if (info && (info.emoji || info.description)) all[name] = info;
  else delete all[name];
  const next = { ...lib };
  if (Object.keys(all).length) next.spaceInfo = all;
  else delete next.spaceInfo;
  return next;
}
/** Set a space's emoji and/or description ('' removes one). The space is created when it does not exist yet. */
export function setSpaceInfo(kv: KeyValueStore, lib: Library, name: string, patch: SpaceInfo): Library {
  const space = cleanSpace(name);
  if (!space) throw new Error('Give the space a name.');
  const info = { ...spaceInfoOf(lib, space) };
  if (patch.emoji !== undefined) {
    const e = cleanEmoji(patch.emoji);
    if (e) info.emoji = e;
    else delete info.emoji;
  }
  if (patch.description !== undefined) {
    const d = cleanSpaceDescription(patch.description);
    if (d) info.description = d;
    else delete info.description;
  }
  let next = withInfo(lib, space, info);
  if (!spacesOf(next).includes(space)) next = withSpaces(next, [...(next.spaces ?? []), space]);
  writeIndex(kv, next);
  return next;
}
/** Delete a space. Its boards stay and move to "No space". */
export function deleteSpace(kv: KeyValueStore, lib: Library, name: string): Library {
  const next = withSpaces(
    {
      ...lib,
      boards: lib.boards.map(b => {
        if (b.space !== name) return b;
        const m = { ...b };
        delete m.space;
        return m;
      }),
    },
    (lib.spaces ?? []).filter(s => s !== name),
  );
  const cleaned = withInfo(next, name, null);
  writeIndex(kv, cleaned);
  return cleaned;
}
/** File boards under a space ('' or null removes it) and/or star them. Index-only; board data is untouched. */
export function setBoardMeta(
  kv: KeyValueStore,
  lib: Library,
  id: string | string[],
  patch: { space?: string | null; starred?: boolean },
): Library {
  const ids = new Set(Array.isArray(id) ? id : [id]);
  const next: Library = {
    ...lib,
    boards: lib.boards.map(b => {
      if (!ids.has(b.id)) return b;
      const m = { ...b };
      if (patch.space !== undefined) {
        const s = patch.space ? cleanSpace(patch.space) : '';
        if (s) m.space = s;
        else delete m.space;
      }
      if (patch.starred !== undefined) {
        if (patch.starred) m.starred = true;
        else delete m.starred;
      }
      return m;
    }),
  };
  writeIndex(kv, next);
  return next;
}

/**
 * Open the library: migrate a legacy single board on first run, adopt a legacy copy that is newer
 * than the stored active board, and never overwrite stored data that fails to parse.
 */
export function openLibrary(
  kv: KeyValueStore,
  parse: (raw: unknown) => Board,
  blank: () => Board,
  now = new Date().toISOString(),
): { library: Library; board: Board; error: string } {
  const legacy = kv.getItem(LEGACY_KEY);
  let lib = readIndex(kv);
  if (!lib) {
    const id = uid();
    let board = blank(),
      error = '';
    if (legacy) {
      try {
        board = parse(JSON.parse(legacy));
      } catch {
        error =
          'Saved board could not be loaded. Import a JSON backup to recover it. The saved copy has not been overwritten.';
        return { library: { version: 1, activeId: id, boards: [metaFor(id, board, now)] }, board, error };
      }
    }
    lib = { version: 1, activeId: id, boards: [metaFor(id, board, now)] };
    kv.setItem(boardKey(id), JSON.stringify(board));
    writeIndex(kv, lib);
    return { library: lib, board, error };
  }
  lib = purgeTrash(kv, lib, TRASH_DAYS, now);
  lib = backfillFacts(kv, lib);
  if (!liveBoards(lib).some(b => b.id === lib!.activeId)) lib = { ...lib, activeId: liveBoards(lib)[0]?.id ?? uid() };
  const stored = kv.getItem(boardKey(lib.activeId));
  const source = legacy && legacy !== stored ? legacy : stored;
  try {
    const board = source ? parse(JSON.parse(source)) : blank();
    if (source !== stored) kv.setItem(boardKey(lib.activeId), JSON.stringify(board));
    if (!lib.boards.some(b => b.id === lib!.activeId))
      lib = { ...lib, boards: [metaFor(lib.activeId, board, now), ...lib.boards] };
    return { library: lib, board, error: '' };
  } catch {
    return {
      library: lib,
      board: blank(),
      error:
        'Saved board could not be loaded. Import a JSON backup to recover it. The saved copy has not been overwritten.',
    };
  }
}
/** Persist the active board and refresh its index entry. Throws when storage is full. */
export function saveActive(kv: KeyValueStore, lib: Library, board: Board, now = new Date().toISOString()): Library {
  const json = JSON.stringify(board);
  kv.setItem(boardKey(lib.activeId), json);
  kv.setItem(LEGACY_KEY, json);
  const old = lib.boards.find(b => b.id === lib.activeId);
  const meta = metaFor(lib.activeId, board, now, old?.createdAt);
  if (old?.space) meta.space = old.space;
  if (old?.starred) meta.starred = true;
  if (old?.deletedAt) meta.deletedAt = old.deletedAt;
  const next: Library = { ...lib, boards: [meta, ...lib.boards.filter(b => b.id !== lib.activeId)] };
  writeIndex(kv, next);
  return next;
}
export function loadBoard(kv: KeyValueStore, id: string, parse: (raw: unknown) => Board): Board {
  const raw = kv.getItem(boardKey(id));
  if (!raw) throw new Error('That board is no longer stored in this browser.');
  return parse(JSON.parse(raw));
}
/** Make another board active (the caller saves the current one first). */
export function switchTo(
  kv: KeyValueStore,
  lib: Library,
  id: string,
  parse: (raw: unknown) => Board,
): { library: Library; board: Board } {
  const board = loadBoard(kv, id, parse),
    next = { ...lib, activeId: id };
  kv.setItem(LEGACY_KEY, JSON.stringify(board));
  writeIndex(kv, next);
  return { library: next, board };
}
/** Store a new board and make it active. */
export function createBoard(
  kv: KeyValueStore,
  lib: Library,
  board: Board,
  now = new Date().toISOString(),
): { library: Library; id: string } {
  const id = uid();
  kv.setItem(boardKey(id), JSON.stringify(board));
  kv.setItem(LEGACY_KEY, JSON.stringify(board));
  const next: Library = { ...lib, version: 1, activeId: id, boards: [metaFor(id, board, now), ...lib.boards] };
  writeIndex(kv, next);
  return { library: next, id };
}
export function renameBoard(
  kv: KeyValueStore,
  lib: Library,
  id: string,
  title: string,
  parse: (raw: unknown) => Board,
  now = new Date().toISOString(),
): Library {
  const clean = title.trim().slice(0, 200);
  if (!clean) throw new Error('Give the board a name.');
  const board = { ...loadBoard(kv, id, parse), title: clean };
  kv.setItem(boardKey(id), JSON.stringify(board));
  if (id === lib.activeId) kv.setItem(LEGACY_KEY, JSON.stringify(board));
  const next: Library = {
    ...lib,
    boards: lib.boards.map(b => (b.id === id ? { ...b, title: clean, updatedAt: now } : b)),
  };
  writeIndex(kv, next);
  return next;
}
/** Copy a board (new id, the given title or a " copy" title, same space). The current active board stays active. */
export function duplicateBoard(
  kv: KeyValueStore,
  lib: Library,
  id: string,
  parse: (raw: unknown) => Board,
  now = new Date().toISOString(),
  title?: string,
): { library: Library; id: string } {
  const source = loadBoard(kv, id, parse),
    copyId = uid(),
    board = { ...source, title: (title?.trim() || `${source.title || 'Untitled board'} copy`).slice(0, 200) };
  kv.setItem(boardKey(copyId), JSON.stringify(board));
  const index = lib.boards.findIndex(b => b.id === id);
  const boards = [...lib.boards];
  const meta = metaFor(copyId, board, now),
    space = lib.boards[index]?.space;
  if (space) meta.space = space;
  boards.splice(index + 1, 0, meta);
  const next: Library = { ...lib, boards };
  writeIndex(kv, next);
  return { library: next, id: copyId };
}
/** Delete a board. Deleting the active board activates the most recent remaining one (or a new blank board). */
export function deleteBoard(
  kv: KeyValueStore,
  lib: Library,
  id: string,
  parse: (raw: unknown) => Board,
  blank: () => Board,
  now = new Date().toISOString(),
): { library: Library; board?: Board } {
  kv.removeItem(boardKey(id));
  kv.removeItem(`boardroom.versions.${id}`);
  const next: Library = { ...lib, boards: lib.boards.filter(b => b.id !== id) };
  if (id !== lib.activeId) {
    writeIndex(kv, next);
    return { library: next };
  }
  return activateFallback(kv, next, parse, blank, now);
}
/** After the active board left the library: open the most recent live board, or a new blank one. */
function activateFallback(
  kv: KeyValueStore,
  lib: Library,
  parse: (raw: unknown) => Board,
  blank: () => Board,
  now: string,
): { library: Library; board: Board } {
  for (const candidate of liveBoards(lib)) {
    try {
      const opened = switchTo(kv, { ...lib, activeId: candidate.id }, candidate.id, parse);
      return { library: opened.library, board: opened.board };
    } catch {
      // Unreadable or missing data: try the next board.
    }
  }
  const board = blank(),
    created = createBoard(kv, lib, board, now);
  return { library: created.library, board };
}

export const TRASH_DAYS = 30;
/**
 * Move boards to the trash; their stored data is kept until purged. Trashing the active board opens
 * the most recent remaining board, or a new blank one.
 */
export function trashBoards(
  kv: KeyValueStore,
  lib: Library,
  ids: string[],
  parse: (raw: unknown) => Board,
  blank: () => Board,
  now = new Date().toISOString(),
): { library: Library; board?: Board } {
  const set = new Set(ids);
  const next: Library = {
    ...lib,
    boards: lib.boards.map(b => (set.has(b.id) && !b.deletedAt ? { ...b, deletedAt: now } : b)),
  };
  if (!set.has(lib.activeId)) {
    writeIndex(kv, next);
    return { library: next };
  }
  return activateFallback(kv, next, parse, blank, now);
}
/** Take boards out of the trash, back into their space. */
export function restoreBoards(kv: KeyValueStore, lib: Library, ids: string[]): Library {
  const set = new Set(ids);
  const next: Library = {
    ...lib,
    boards: lib.boards.map(b => {
      if (!set.has(b.id) || !b.deletedAt) return b;
      const m = { ...b };
      delete m.deletedAt;
      return m;
    }),
  };
  writeIndex(kv, next);
  return next;
}
/** Permanently delete trashed boards (data and index entry). Boards outside the trash are left alone. */
export function purgeBoards(kv: KeyValueStore, lib: Library, ids: string[]): Library {
  const wanted = new Set(ids),
    gone = new Set(lib.boards.filter(b => b.deletedAt && wanted.has(b.id)).map(b => b.id));
  if (!gone.size) return lib;
  for (const id of gone) {
    kv.removeItem(boardKey(id));
    kv.removeItem(`boardroom.versions.${id}`);
  }
  const next: Library = { ...lib, boards: lib.boards.filter(b => !gone.has(b.id)) };
  writeIndex(kv, next);
  return next;
}
/** Purge boards that have been in the trash for `days` days or longer (unreadable dates count as expired). */
export function purgeTrash(
  kv: KeyValueStore,
  lib: Library,
  days = TRASH_DAYS,
  now = new Date().toISOString(),
): Library {
  const cutoff = Date.parse(now) - days * 86_400_000;
  const expired = lib.boards.filter(b => b.deletedAt && !(Date.parse(b.deletedAt) > cutoff)).map(b => b.id);
  return expired.length ? purgeBoards(kv, lib, expired) : lib;
}
/** Days left before a trashed board is purged (0 when due). */
export const daysLeftInTrash = (deletedAt: string, now = Date.now(), days = TRASH_DAYS) =>
  Math.max(0, Math.ceil((Date.parse(deletedAt) + days * 86_400_000 - now) / 86_400_000) || 0);
/** Copy status and description from stored boards into index entries written by older versions. */
function backfillFacts(kv: KeyValueStore, lib: Library): Library {
  if (lib.boards.every(b => b.v === 2)) return lib;
  const next: Library = {
    ...lib,
    boards: lib.boards.map(b => {
      if (b.v === 2) return b;
      try {
        const raw = JSON.parse(kv.getItem(boardKey(b.id)) ?? 'null');
        return raw && typeof raw === 'object' ? withBoardFacts(b, raw) : b;
      } catch {
        return b;
      }
    }),
  };
  try {
    writeIndex(kv, next);
  } catch {
    // Storage full: the details are copied again next time.
  }
  return next;
}

/**
 * Store boards without opening them (import as a new board, restore a library backup). A suggested id
 * is kept when it is free, otherwise the board gets a new one. Saved index details (space, star, dates,
 * trash) are kept when valid. Returns the ids used, in entry order.
 */
export function addBoards(
  kv: KeyValueStore,
  lib: Library,
  entries: { board: Board; id?: string; meta?: Partial<BoardMeta> }[],
  now = new Date().toISOString(),
): { library: Library; ids: string[] } {
  const taken = new Set(lib.boards.map(b => b.id)),
    added: BoardMeta[] = [],
    ids: string[] = [];
  const iso = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined);
  for (const { board, id: wanted, meta: m } of entries) {
    const id = wanted && /^[A-Za-z0-9_-]{1,100}$/.test(wanted) && !taken.has(wanted) ? wanted : uid();
    taken.add(id);
    kv.setItem(boardKey(id), JSON.stringify(board));
    const updated = iso(m?.updatedAt) ?? now;
    const meta = metaFor(id, board, updated, iso(m?.createdAt) ?? updated);
    const space = typeof m?.space === 'string' ? cleanSpace(m.space) : '';
    if (space) meta.space = space;
    if (m?.starred === true) meta.starred = true;
    const deleted = iso(m?.deletedAt);
    if (deleted) meta.deletedAt = deleted;
    added.push(meta);
    ids.push(id);
  }
  const next: Library = {
    ...lib,
    boards: [...added.filter(b => !b.deletedAt), ...lib.boards, ...added.filter(b => b.deletedAt)],
  };
  writeIndex(kv, next);
  return { library: next, ids };
}

/** Where a piece of searchable text comes from: an object, a comment thread, or the board itself (neither). */
export type ContentPart = { text: string; itemId?: string; threadId?: string };
/**
 * Searchable pieces of a board, lower-case with markup removed: title, description, item text, short strings
 * in widget data, and comment messages (track R3), each with the object or thread it belongs to.
 */
export function boardContentParts(board: {
  title?: unknown;
  description?: unknown;
  items?: unknown;
  comments?: unknown;
}): ContentPart[] {
  const parts: ContentPart[] = [];
  const add = (v: unknown, where: Omit<ContentPart, 'text'> = {}) => {
    if (typeof v !== 'string' || !v.trim() || v.length > 20000) return;
    const text = v
      .replace(/<[^>]*>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .toLowerCase();
    if (text.trim()) parts.push({ text, ...where });
  };
  add(board.title);
  add(board.description);
  for (const raw of Array.isArray(board.items) ? board.items : []) {
    const i = raw as { id?: unknown; text?: unknown; data?: unknown } | null;
    const where = typeof i?.id === 'string' ? { itemId: i.id } : {};
    add(i?.text, where);
    if (i?.data && typeof i.data === 'object' && !Array.isArray(i.data))
      for (const v of Object.values(i.data as Record<string, unknown>))
        if (typeof v === 'string' && v.length <= 2000) add(v, where);
  }
  for (const raw of Array.isArray(board.comments) ? board.comments : []) {
    const t = raw as { id?: unknown; itemId?: unknown; messages?: unknown } | null;
    if (typeof t?.id !== 'string') continue;
    const where: Omit<ContentPart, 'text'> = { threadId: t.id };
    if (typeof t.itemId === 'string') where.itemId = t.itemId;
    for (const m of Array.isArray(t.messages) ? t.messages : []) add((m as { text?: unknown } | null)?.text, where);
  }
  return parts;
}
/** Lower-case searchable text of a board: title, description, item text, widget strings and comments. */
export const boardContentText = (board: Parameters<typeof boardContentParts>[0]): string =>
  boardContentParts(board)
    .map(p => p.text)
    .join('\n');
export type ContentCache = Map<string, { stamp: string; parts: ContentPart[] }>;
/** Where to land when a board is opened from a search or comment match. */
export type OpenTarget = { itemId?: string; threadId?: string };
/** A content match: a short excerpt and, when the match is in an object or a comment, where it is. */
export type ContentMatch = { excerpt: string; itemId?: string; threadId?: string };
/**
 * Boards outside the trash whose content matches `query`, with an excerpt around the first match and the
 * object or comment thread it is in. Board text is read from storage once per saved version and kept in `cache`.
 */
export function searchBoardMatches(
  kv: KeyValueStore,
  lib: Library,
  query: string,
  cache: ContentCache = new Map(),
): Map<string, ContentMatch> {
  const q = query.trim().toLowerCase(),
    out = new Map<string, ContentMatch>();
  if (!q) return out;
  for (const b of liveBoards(lib)) {
    let entry = cache.get(b.id);
    if (!entry || entry.stamp !== b.updatedAt) {
      let parts: ContentPart[] = [];
      try {
        parts = boardContentParts(JSON.parse(kv.getItem(boardKey(b.id)) ?? 'null') ?? {});
      } catch {
        // Unreadable board: nothing to match.
      }
      entry = { stamp: b.updatedAt, parts };
      cache.set(b.id, entry);
    }
    for (const p of entry.parts) {
      const at = p.text.indexOf(q);
      if (at < 0) continue;
      const start = Math.max(0, at - 30),
        end = Math.min(p.text.length, at + q.length + 30),
        excerpt = p.text.slice(start, end).replace(/\s+/g, ' ').trim();
      const match: ContentMatch = { excerpt: `${start ? '…' : ''}${excerpt}${end < p.text.length ? '…' : ''}` };
      if (p.itemId) match.itemId = p.itemId;
      if (p.threadId) match.threadId = p.threadId;
      out.set(b.id, match);
      break;
    }
  }
  return out;
}
/** Boards outside the trash whose content matches `query`, each with a short excerpt around the first match. */
export function searchBoardContent(
  kv: KeyValueStore,
  lib: Library,
  query: string,
  cache: ContentCache = new Map(),
): Map<string, string> {
  return new Map([...searchBoardMatches(kv, lib, query, cache)].map(([id, m]) => [id, m.excerpt]));
}

/**
 * Asset ids referenced by any stored board (trashed boards included, until they are purged), so shared
 * image/video/PDF storage is never pruned too early.
 */
export function assetRefsAcrossBoards(kv: KeyValueStore, lib: Library): Set<string> {
  const out = new Set<string>();
  for (const b of lib.boards) {
    const raw = kv.getItem(boardKey(b.id));
    if (!raw) continue;
    for (const m of raw.matchAll(/"assetId":"([^"\\]{1,100})"/g)) out.add(m[1]);
  }
  return out;
}
