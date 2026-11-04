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
};
export type Library = { version: 1; activeId: string; boards: BoardMeta[] };

export const INDEX_KEY = 'boardroom.boards.v1';
export const LEGACY_KEY = 'boardroom.document.v1';
export const boardKey = (id: string) => `boardroom.board.${id}`;
const uid = () => crypto.randomUUID();

/** Up to 60 of the largest objects, normalised to the board bounds (0..1), for dashboard thumbnails. */
export function previewOf(board: Board): PreviewShape[] {
  const shapes = board.items.filter(i => !i.hidden && i.type !== 'pen');
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
const metaFor = (id: string, board: Board, now: string, createdAt = now): BoardMeta => ({
  id,
  title: board.title || 'Untitled board',
  createdAt,
  updatedAt: now,
  items: board.items.length,
  preview: previewOf(board),
});
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
/** Distinct spaces in use, alphabetically. */
export const spacesOf = (lib: Library) =>
  [...new Set(lib.boards.map(b => b.space).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b));
/** File a board under a space ('' or null removes it) and/or star it. Index-only; board data is untouched. */
export function setBoardMeta(
  kv: KeyValueStore,
  lib: Library,
  id: string,
  patch: { space?: string | null; starred?: boolean },
): Library {
  const next: Library = {
    ...lib,
    boards: lib.boards.map(b => {
      if (b.id !== id) return b;
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
  if (!lib.boards.some(b => b.id === lib!.activeId)) lib = { ...lib, activeId: lib.boards[0]?.id ?? uid() };
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
  const next: Library = { version: 1, activeId: id, boards: [metaFor(id, board, now), ...lib.boards] };
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
/** Copy a board (new id, " copy" title). The current active board stays active. */
export function duplicateBoard(
  kv: KeyValueStore,
  lib: Library,
  id: string,
  parse: (raw: unknown) => Board,
  now = new Date().toISOString(),
): { library: Library; id: string } {
  const source = loadBoard(kv, id, parse),
    copyId = uid(),
    board = { ...source, title: `${source.title || 'Untitled board'} copy`.slice(0, 200) };
  kv.setItem(boardKey(copyId), JSON.stringify(board));
  const index = lib.boards.findIndex(b => b.id === id);
  const boards = [...lib.boards];
  boards.splice(index + 1, 0, metaFor(copyId, board, now));
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
  let next: Library = { ...lib, boards: lib.boards.filter(b => b.id !== id) };
  if (id !== lib.activeId) {
    writeIndex(kv, next);
    return { library: next };
  }
  if (!next.boards.length) {
    const created = createBoard(kv, next, blank(), now);
    return { library: created.library, board: blank() };
  }
  next = { ...next, activeId: next.boards[0].id };
  const opened = switchTo(kv, next, next.activeId, parse);
  return { library: opened.library, board: opened.board };
}
/** Asset ids referenced by any stored board, so shared image/video/PDF storage is never pruned too early. */
export function assetRefsAcrossBoards(kv: KeyValueStore, lib: Library): Set<string> {
  const out = new Set<string>();
  for (const b of lib.boards) {
    const raw = kv.getItem(boardKey(b.id));
    if (!raw) continue;
    for (const m of raw.matchAll(/"assetId":"([^"\\]{1,100})"/g)) out.add(m[1]);
  }
  return out;
}
