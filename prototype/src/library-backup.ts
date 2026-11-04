// Whole-library backup (gap C3) and backup-file reading for "import as a new board" (gap C4).
// A library backup is a ZIP like the single-board bundle (media-bundle.ts): library.json holds the
// format marker, the index details and the media manifest; boards/<id>.json holds each stored board;
// media/<assetId>.<ext> holds raw media bytes. Restoring adds boards and never replaces existing ones.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { Zippable } from 'fflate';
import type { Board, ImageAsset } from './model.ts';
import { assetRefsAcrossBoards, boardKey, cleanSpace } from './board-library.ts';
import type { BoardMeta, KeyValueStore, Library } from './board-library.ts';
import {
  assetsFromManifest,
  dataUrlBytes,
  decodeBundle,
  extByMime,
  ID,
  isBundle,
  MAX_BUNDLE_BYTES,
  MEDIA_ENTRY,
} from './media-bundle.ts';
import { MAX_MEDIA_BYTES } from './model-ext.ts';
import type { ManifestAsset } from './media-bundle.ts';

export const LIBRARY_FORMAT = 'boardroom-library';
export const LIBRARY_VERSION = 1;
export const LIBRARY_MANIFEST = 'library.json';
export const MAX_LIBRARY_ENTRIES = 5000;
const BOARD_ENTRY = /^boards\/([A-Za-z0-9_-]{1,100})\.json$/;

type SavedMeta = Pick<BoardMeta, 'id' | 'title' | 'createdAt' | 'updatedAt' | 'space' | 'starred' | 'deletedAt'>;
type LibraryManifest = {
  format: string;
  version: number;
  exportedAt: string;
  spaces: string[];
  boards: SavedMeta[];
  assets: Record<string, ManifestAsset>;
};
export type LibraryEntry = { id: string; board: Board; meta: Partial<BoardMeta> };
export type BackupContents =
  | { kind: 'library'; entries: LibraryEntry[]; spaces: string[]; assets: Record<string, ImageAsset>; skipped: number }
  | { kind: 'board'; board: Board; assets: Record<string, ImageAsset> };

/** Bundle every stored board (trash included), the index details and all referenced media. */
export function encodeLibrary(
  kv: KeyValueStore,
  lib: Library,
  assets: Record<string, ImageAsset>,
  now = new Date().toISOString(),
): { bytes: Uint8Array; boards: number; media: number } {
  const files: Zippable = {};
  const manifest: LibraryManifest = {
    format: LIBRARY_FORMAT,
    version: LIBRARY_VERSION,
    exportedAt: now,
    spaces: lib.spaces ?? [],
    boards: [],
    assets: {},
  };
  for (const b of lib.boards) {
    const raw = kv.getItem(boardKey(b.id));
    if (!raw || !ID.test(b.id)) continue;
    files[`boards/${b.id}.json`] = [strToU8(raw), { level: 6 }];
    const saved: SavedMeta = { id: b.id, title: b.title, createdAt: b.createdAt, updatedAt: b.updatedAt };
    if (b.space) saved.space = b.space;
    if (b.starred) saved.starred = true;
    if (b.deletedAt) saved.deletedAt = b.deletedAt;
    manifest.boards.push(saved);
  }
  for (const id of assetRefsAcrossBoards(kv, lib)) {
    const a = assets[id],
      ext = a && extByMime[a.mime];
    if (!a || !ext || !ID.test(id)) continue;
    const file = `media/${id}.${ext}`;
    files[file] = [dataUrlBytes(a.data, a.mime), { level: 0 }];
    manifest.assets[id] = { mime: a.mime, width: a.width, height: a.height, name: a.name, file };
  }
  files[LIBRARY_MANIFEST] = [strToU8(JSON.stringify(manifest)), { level: 6 }];
  return { bytes: zipSync(files), boards: manifest.boards.length, media: Object.keys(manifest.assets).length };
}

/** True for a ZIP whose entries include the library manifest (names are read without inflating). */
export function isLibraryBackup(bytes: Uint8Array): boolean {
  if (!isBundle(bytes)) return false;
  let found = false;
  try {
    unzipSync(bytes, {
      filter: f => {
        if (f.name === LIBRARY_MANIFEST) found = true;
        return false;
      },
    });
  } catch {
    return false;
  }
  return found;
}

/** Read a library backup. Damaged or invalid boards are skipped and counted; everything else is checked strictly. */
export function decodeLibrary(
  bytes: Uint8Array,
  parse: (raw: unknown) => Board,
): Extract<BackupContents, { kind: 'library' }> {
  let count = 0,
    total = 0,
    entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: file => {
        if (++count > MAX_LIBRARY_ENTRIES) throw new Error('The backup contains too many files.');
        if (file.name.endsWith('/') && file.originalSize === 0) return false;
        const media = MEDIA_ENTRY.test(file.name);
        if (file.name !== LIBRARY_MANIFEST && !media && !BOARD_ENTRY.test(file.name))
          throw new Error(`Unexpected file in backup: ${file.name.slice(0, 80)}`);
        if (file.originalSize > (media ? MAX_MEDIA_BYTES : 60_000_000)) throw new Error(`${file.name} is too large.`);
        total += file.originalSize;
        if (total > MAX_BUNDLE_BYTES) throw new Error('The backup is larger than 300 MB.');
        return true;
      },
    });
  } catch (err) {
    throw err instanceof Error && !/invalid|unexpected EOF|zip/i.test(err.message)
      ? err
      : new Error('The backup is damaged or not a ZIP file.');
  }
  let manifest: LibraryManifest;
  try {
    manifest = JSON.parse(strFromU8(entries[LIBRARY_MANIFEST] ?? new Uint8Array()));
  } catch {
    throw new Error('The backup has no readable library list.');
  }
  if (
    !manifest ||
    manifest.format !== LIBRARY_FORMAT ||
    manifest.version !== LIBRARY_VERSION ||
    !Array.isArray(manifest.boards) ||
    !manifest.assets ||
    typeof manifest.assets !== 'object' ||
    Array.isArray(manifest.assets)
  )
    throw new Error('Unsupported library backup format.');
  const assets = assetsFromManifest(manifest.assets, entries);
  const out: LibraryEntry[] = [];
  let skipped = 0;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  for (const m of manifest.boards) {
    const id = m && typeof m.id === 'string' && ID.test(m.id) ? m.id : '';
    const data = id ? entries[`boards/${id}.json`] : undefined;
    if (!data) {
      skipped++;
      continue;
    }
    try {
      const board = parse(JSON.parse(strFromU8(data)));
      delete board.assets;
      out.push({
        id,
        board,
        meta: {
          createdAt: str(m.createdAt),
          updatedAt: str(m.updatedAt),
          space: str(m.space),
          starred: m.starred === true,
          deletedAt: str(m.deletedAt),
        },
      });
    } catch {
      skipped++;
    }
  }
  const spaces = Array.isArray(manifest.spaces)
    ? manifest.spaces
        .filter((s): s is string => typeof s === 'string')
        .map(cleanSpace)
        .filter(Boolean)
    : [];
  return { kind: 'library', entries: out, spaces, assets, skipped };
}

/** Read any backup file: a library backup, a single-board .boardroom bundle or a JSON board (with embedded media). */
export function readBackup(bytes: Uint8Array, parse: (raw: unknown) => Board): BackupContents {
  if (isBundle(bytes)) {
    if (isLibraryBackup(bytes)) return decodeLibrary(bytes, parse);
    const bundle = decodeBundle(bytes);
    const board = parse(bundle.board);
    delete board.assets;
    return { kind: 'board', board, assets: bundle.assets };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('This file is not a Boardroom backup.');
  }
  const board = { ...parse(raw) },
    assets = board.assets ?? {};
  delete board.assets;
  return { kind: 'board', board, assets };
}
