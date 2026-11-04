// Board activity (item 106): History and Catch up. Pure: diffs board changes into entries.
// Entries live per board in this browser; deleted objects are kept so they can be restored.
import type { Board, Item } from './model.ts';

export type Activity = {
  id: string;
  at: string;
  action: 'added' | 'deleted' | 'edited';
  itemId: string;
  type: string;
  label: string;
  /** Snapshot of a deleted object, for Restore. */
  item?: Item;
};
export const ACTIVITY_LIMIT = 300;
export const activityKey = (boardId: string) => `boardroom.activity.${boardId}`;

const typeName: Record<string, string> = { note: 'sticky note', arrow: 'connector', pen: 'drawing', text: 'text' };
export const describeType = (type: string) => typeName[type] ?? type;
const label = (i: Item) => (i.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
/** Fields that change while dragging or resizing are edits too, but grouped per change. */
const same = (a: Item, b: Item) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Entries for one board change. `makeId` supplies unique ids; `at` is the change time. */
export function diffActivity(prev: Board, next: Board, at: string, makeId: () => string): Activity[] {
  if (prev.items === next.items) return [];
  const before = new Map(prev.items.map(i => [i.id, i])),
    after = new Map(next.items.map(i => [i.id, i])),
    out: Activity[] = [];
  for (const [id, i] of after) {
    const old = before.get(id);
    if (!old) out.push({ id: makeId(), at, action: 'added', itemId: id, type: i.type, label: label(i) });
    else if (!same(old, i)) out.push({ id: makeId(), at, action: 'edited', itemId: id, type: i.type, label: label(i) });
  }
  for (const [id, i] of before)
    if (!after.has(id))
      out.push({ id: makeId(), at, action: 'deleted', itemId: id, type: i.type, label: label(i), item: i });
  return out;
}

/**
 * Add new entries (newest first). Consecutive edits of the same object within a minute merge
 * into one entry, so dragging or typing does not flood the history.
 */
export function appendActivity(log: Activity[], entries: Activity[]): Activity[] {
  let next = log;
  for (const e of entries) {
    const top = next[0];
    if (
      e.action === 'edited' &&
      top?.action === 'edited' &&
      top.itemId === e.itemId &&
      Date.parse(e.at) - Date.parse(top.at) < 60_000
    )
      next = [{ ...top, at: e.at, label: e.label }, ...next.slice(1)];
    else next = [e, ...next];
  }
  return next.slice(0, ACTIVITY_LIMIT);
}

export function parseActivity(raw: string | null): Activity[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v)
      ? v
          .filter(
            e =>
              e &&
              typeof e.id === 'string' &&
              typeof e.at === 'string' &&
              ['added', 'deleted', 'edited'].includes(e.action) &&
              typeof e.itemId === 'string' &&
              typeof e.type === 'string' &&
              typeof e.label === 'string',
          )
          .slice(0, ACTIVITY_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export const catchUpPeriods = [
  { id: 'day', label: 'Last 24 hours', ms: 864e5 },
  { id: 'week', label: 'Last week', ms: 7 * 864e5 },
  { id: 'month', label: 'Last 30 days', ms: 30 * 864e5 },
] as const;

/** Counts of added, edited and deleted objects since `since`, by object type. */
export function catchUp(log: Activity[], since: number) {
  const recent = log.filter(e => Date.parse(e.at) >= since);
  const summary = { added: 0, edited: 0, deleted: 0, byType: {} as Record<string, number>, total: recent.length };
  for (const e of recent) {
    summary[e.action]++;
    summary.byType[e.type] = (summary.byType[e.type] ?? 0) + 1;
  }
  return summary;
}

/** Put a deleted object back (unless an object with its id already exists). */
export function restoreDeleted(board: Board, entry: Activity): Board | null {
  if (entry.action !== 'deleted' || !entry.item || board.items.some(i => i.id === entry.item!.id)) return null;
  return { ...board, items: [...board.items, entry.item] };
}

/** Local day label for grouping ("Today", "Yesterday" or a date). */
export function dayLabel(at: string, now: Date): string {
  const d = new Date(at),
    start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(),
    days = Math.round((start(now) - start(d)) / 864e5);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString();
}
