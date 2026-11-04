// Board version snapshots (gap C15): a copy of the board is kept at most every 30 minutes while it is
// edited, up to 10 per board, in this browser's storage. Restoring opens a version as a new board. Pure.
import type { Board } from './model.ts';
import type { KeyValueStore } from './board-library.ts';

export type BoardVersion = { at: string; title: string; items: number; board: Board };
export const VERSION_INTERVAL_MS = 30 * 60 * 1000;
export const MAX_VERSIONS = 10;
/** Boards larger than this (serialised) are not snapshotted, to protect storage space. */
export const MAX_VERSION_BYTES = 1_000_000;
export const versionKey = (boardId: string) => `boardroom.versions.${boardId}`;

export function listVersions(kv: KeyValueStore, boardId: string): BoardVersion[] {
  try {
    const raw = JSON.parse(kv.getItem(versionKey(boardId)) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter(
          (v): v is BoardVersion =>
            !!v && typeof v.at === 'string' && typeof v.title === 'string' && !!v.board && Array.isArray(v.board.items),
        )
      : [];
  } catch {
    return [];
  }
}

const fingerprint = (b: Board) => JSON.stringify({ ...b, title: '' });

/**
 * Store a snapshot when the newest one is older than the interval and the board changed since.
 * Returns true when a snapshot was written. Storage errors (quota) are swallowed: versions are a convenience.
 */
export function maybeSnapshot(kv: KeyValueStore, boardId: string, board: Board, now = new Date()): boolean {
  const versions = listVersions(kv, boardId),
    newest = versions[0];
  if (newest && now.getTime() - Date.parse(newest.at) < VERSION_INTERVAL_MS) return false;
  if (newest && fingerprint(newest.board) === fingerprint(board)) return false;
  if (!board.items.length) return false;
  const snapshot: BoardVersion = { at: now.toISOString(), title: board.title, items: board.items.length, board };
  const next = [snapshot, ...versions].slice(0, MAX_VERSIONS);
  const text = JSON.stringify(next);
  if (JSON.stringify(snapshot).length > MAX_VERSION_BYTES) return false;
  try {
    kv.setItem(versionKey(boardId), text);
    return true;
  } catch {
    // Out of space: drop the oldest half and try once more.
    try {
      kv.setItem(versionKey(boardId), JSON.stringify(next.slice(0, Math.ceil(next.length / 2))));
      return true;
    } catch {
      return false;
    }
  }
}

export const deleteVersions = (kv: KeyValueStore, boardId: string) => kv.removeItem(versionKey(boardId));
