// Cross-board views (track R3): a recent-activity digest and a comments list across the boards of a space
// (or the whole library), plus the "Last opened" order for the dashboard. Pure: reads the per-board activity
// logs, visit times and stored boards through a key-value store.
import { activityKey, lastVisit, parseActivity } from './activity.ts';
import { boardKey, type BoardMeta, type KeyValueStore } from './board-library.ts';

export type BoardDigest = {
  id: string;
  title: string;
  added: number;
  edited: number;
  deleted: number;
  total: number;
  /** Time of the most recent change in the period (ISO). */
  last: string;
};
/**
 * Changes per board since `since` (ms), most recently changed board first. Boards without changes in the
 * period are left out. Counts come from each board's History log in this browser.
 */
export function activityDigest(
  kv: Pick<KeyValueStore, 'getItem'>,
  boards: BoardMeta[],
  since: number,
): { boards: BoardDigest[]; added: number; edited: number; deleted: number; total: number } {
  const out: BoardDigest[] = [];
  for (const b of boards) {
    let log;
    try {
      log = parseActivity(kv.getItem(activityKey(b.id)));
    } catch {
      continue;
    }
    const d: BoardDigest = { id: b.id, title: b.title, added: 0, edited: 0, deleted: 0, total: 0, last: '' };
    for (const e of log) {
      const at = Date.parse(e.at);
      if (!(at >= since)) continue;
      d[e.action]++;
      d.total++;
      if (!d.last || at > Date.parse(d.last)) d.last = e.at;
    }
    if (d.total) out.push(d);
  }
  out.sort((a, b) => Date.parse(b.last) - Date.parse(a.last));
  const sum = (k: 'added' | 'edited' | 'deleted' | 'total') => out.reduce((n, d) => n + d[k], 0);
  return { boards: out, added: sum('added'), edited: sum('edited'), deleted: sum('deleted'), total: sum('total') };
}

export type CrossComment = {
  boardId: string;
  boardTitle: string;
  threadId: string;
  itemId?: string;
  /** First message of the thread (plain, at most 200 characters). */
  text: string;
  messages: number;
  resolved: boolean;
  /** Time of the latest message (ISO). */
  at: string;
};
export const CROSS_COMMENTS_LIMIT = 200;
/** Comment threads across boards, newest activity first. `filter` picks open, resolved or all threads. */
export function commentsAcrossBoards(
  kv: Pick<KeyValueStore, 'getItem'>,
  boards: BoardMeta[],
  filter: 'open' | 'resolved' | 'all' = 'open',
): CrossComment[] {
  const out: CrossComment[] = [];
  for (const b of boards) {
    let raw: { comments?: unknown } | null;
    try {
      raw = JSON.parse(kv.getItem(boardKey(b.id)) ?? 'null');
    } catch {
      continue;
    }
    for (const t of Array.isArray(raw?.comments) ? raw.comments : []) {
      if (!t || typeof t.id !== 'string' || !Array.isArray(t.messages) || !t.messages.length) continue;
      const resolved = t.resolved === true;
      if ((filter === 'open' && resolved) || (filter === 'resolved' && !resolved)) continue;
      const texts = t.messages.filter((m: unknown) => m && typeof (m as { text?: unknown }).text === 'string');
      if (!texts.length) continue;
      const times = texts.map((m: { at?: unknown }) => (typeof m.at === 'string' ? Date.parse(m.at) : NaN));
      const latest = Math.max(...times.filter(Number.isFinite), 0);
      const c: CrossComment = {
        boardId: b.id,
        boardTitle: b.title,
        threadId: t.id,
        text: String(texts[0].text).replace(/\s+/g, ' ').trim().slice(0, 200),
        messages: texts.length,
        resolved,
        at: latest ? new Date(latest).toISOString() : '',
      };
      if (typeof t.itemId === 'string') c.itemId = t.itemId;
      out.push(c);
    }
  }
  return out.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)).slice(0, CROSS_COMMENTS_LIMIT);
}

/** Boards ordered by when they were last opened in this browser (never-opened boards last, by last edit). */
export function byLastOpened(kv: Pick<KeyValueStore, 'getItem'>, boards: BoardMeta[]): BoardMeta[] {
  const opened = new Map(boards.map(b => [b.id, Date.parse(lastVisit(kv, b.id) ?? '') || 0]));
  return [...boards].sort(
    (a, b) => opened.get(b.id)! - opened.get(a.id)! || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}
