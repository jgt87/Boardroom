// Object info (recheck b4, "Object Info"): when each object was created and last modified on this device.
// Pure. Stamped centrally in update(): new objects get both times, changed objects get a new modified time.
// Unchanged objects keep their identity, so render caches and undo snapshots are untouched.
import type { Board, Item } from './model.ts';

/** True when `b` differs from `a` in any top-level field other than the modified time. */
function differs(a: Item, b: Item): boolean {
  const ra = a as Record<string, unknown>,
    rb = b as Record<string, unknown>;
  for (const k in rb) if (k !== 'modifiedAt' && rb[k] !== ra[k]) return true;
  for (const k in ra) if (k !== 'modifiedAt' && !(k in rb)) return true;
  return false;
}

/**
 * Stamp `createdAt`/`modifiedAt` (ISO) on the objects this change added or edited. Objects that only got a new
 * identity with the same fields are left alone. Returns `next` itself when nothing needs a stamp.
 */
export function stampTimes(prev: Board, next: Board, now: string): Board {
  if (prev.items === next.items) return next;
  const before = new Map<string, Item>();
  for (const i of prev.items) before.set(i.id, i);
  let items: Item[] | null = null;
  for (let k = 0; k < next.items.length; k++) {
    const i = next.items[k],
      old = before.get(i.id);
    if (old === i) continue;
    let stamped: Item | null = null;
    // A new id is a new object (pasted and duplicated copies too), whatever times it carried.
    if (!old) stamped = { ...i, createdAt: now, modifiedAt: now };
    else if (differs(old, i)) {
      stamped = { ...i, modifiedAt: now };
      if (old.createdAt && !i.createdAt) stamped.createdAt = old.createdAt;
    }
    if (!stamped) continue;
    items ??= next.items.slice();
    items[k] = stamped;
  }
  return items ? { ...next, items } : next;
}

const isTime = (v: unknown) => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
/** Validation for the optional object times (parseBoard). */
export function validItemTimes(i: { createdAt?: unknown; modifiedAt?: unknown }): boolean {
  return (i.createdAt === undefined || isTime(i.createdAt)) && (i.modifiedAt === undefined || isTime(i.modifiedAt));
}

/** "4 Nov 2026, 14:05" style label, or 'Unknown' (objects from before times were recorded). */
export function timeLabel(iso: string | undefined): string {
  if (!iso || !isTime(iso)) return 'Unknown';
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
