// Shared record operations for Table, Kanban and Timeline views.
// Evidence: TableRemoteGateway handles record insertion/update/deletion/movement; Timeline
// milestones are read from the Timeline view configuration.
import type { RecordRow } from './model.ts';

export const statuses: RecordRow['status'][] = ['Not started', 'In progress', 'Complete'];
const DAY = 86400000;

/** Move or resize a timeline record by whole UTC days, retaining dependency identities. */
export function shiftTimelineRecord(
  rows: RecordRow[],
  id: string,
  days: number,
  mode: 'move' | 'start' | 'end' = 'move',
): RecordRow[] {
  if (!Number.isFinite(days)) return rows;
  const delta = Math.round(days) * DAY;
  return rows.map(r => {
    if (r.id !== id || !(r.start || r.end)) return r;
    const a = Date.parse(r.start || r.end),
      b = Date.parse(r.end || r.start);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return r;
    const start = mode === 'end' ? a : mode === 'start' ? Math.min(a + delta, b) : a + delta;
    const end = mode === 'start' ? b : mode === 'end' ? Math.max(a, b + delta) : b + delta;
    const date = (n: number) => new Date(n).toISOString().slice(0, 10);
    if (start < Date.parse('0001-01-01') || end > Date.parse('9999-12-31')) return r;
    return {
      ...r,
      start: r.start || mode === 'start' ? date(start) : '',
      end: r.milestone ? '' : r.end || mode === 'end' ? date(end) : '',
    };
  });
}

/** Move a card to a status column, before another card (or to the end of that column). */
export function moveRecord(
  rows: RecordRow[],
  id: string,
  status: RecordRow['status'],
  beforeId: string | null,
  columns = statuses,
): RecordRow[] {
  const row = rows.find(r => r.id === id);
  if (!row) throw new Error('That record no longer exists.');
  if (!columns.includes(status)) throw new Error('Choose an existing status column.');
  if (beforeId === id) return row.status === status ? rows : rows.map(r => (r.id === id ? { ...r, status } : r));
  const rest = rows.filter(r => r.id !== id),
    moved = { ...row, status };
  let index = beforeId ? rest.findIndex(r => r.id === beforeId) : -1;
  if (index < 0) {
    const last = rest.map(r => r.status).lastIndexOf(status);
    index = last < 0 ? rest.length : last + 1;
  }
  const next = [...rest.slice(0, index), moved, ...rest.slice(index)];
  return next.every((r, i) => r === rows[i]) ? rows : next;
}

/** Keyboard alternative: move within a column (up/down) or between columns (left/right). */
export function shiftRecord(
  rows: RecordRow[],
  id: string,
  direction: 'up' | 'down' | 'left' | 'right',
  visible?: Set<string>,
  columns = statuses,
): RecordRow[] {
  const row = rows.find(r => r.id === id);
  if (!row) return rows;
  if (direction === 'up' || direction === 'down') {
    const column = rows.filter(r => r.status === row.status && (!visible || visible.has(r.id))),
      index = column.indexOf(row),
      target = column[direction === 'up' ? index - 1 : index + 1];
    if (!target) return rows;
    const next = [...rows],
      a = rows.indexOf(row),
      b = rows.indexOf(target);
    next[a] = target;
    next[b] = row;
    return next;
  }
  const column = columns.indexOf(row.status) + (direction === 'left' ? -1 : 1);
  return column < 0 || column >= columns.length ? rows : moveRecord(rows, id, columns[column], null, columns);
}

/**
 * Keyboard card creation (track C): insert `card` just above or below record `id`, in its column. The card
 * takes the record's status; columns keep their array order, so placing it next to the record in `rows`
 * places it next to the record in the column. Returns `rows` unchanged when the record is gone.
 */
export function insertRecordNear(
  rows: RecordRow[],
  id: string,
  where: 'above' | 'below',
  card: RecordRow,
): RecordRow[] {
  const index = rows.findIndex(r => r.id === id);
  if (index < 0) return rows;
  const at = where === 'above' ? index : index + 1;
  return [...rows.slice(0, at), { ...card, status: rows[index].status }, ...rows.slice(at)];
}

/** Why a dependency (id depends on dependency) cannot be added, or null when it is valid. */
export function dependencyError(rows: RecordRow[], id: string, dependency: string): string | null {
  const map = new Map(rows.map(r => [r.id, r]));
  if (!map.has(id) || !map.has(dependency)) return 'Choose an existing record.';
  if (id === dependency) return 'A task cannot depend on itself.';
  if (map.get(id)!.dependsOn?.includes(dependency)) return 'That dependency already exists.';
  const stack = [dependency],
    seen = new Set<string>();
  while (stack.length) {
    const next = stack.pop()!;
    if (next === id) return 'This dependency would create a cycle.';
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...(map.get(next)?.dependsOn ?? []));
  }
  return null;
}
export function addDependency(rows: RecordRow[], id: string, dependency: string): RecordRow[] {
  const error = dependencyError(rows, id, dependency);
  if (error) throw new Error(error);
  return rows.map(r => (r.id === id ? { ...r, dependsOn: [...(r.dependsOn ?? []), dependency] } : r));
}
export function removeDependency(rows: RecordRow[], id: string, dependency: string): RecordRow[] {
  return rows.map(r =>
    r.id === id && r.dependsOn
      ? withDependencies(
          r,
          r.dependsOn.filter(d => d !== dependency),
        )
      : r,
  );
}
function withDependencies(row: RecordRow, dependsOn: string[]): RecordRow {
  const next: RecordRow = { ...row, dependsOn };
  if (!dependsOn.length) delete next.dependsOn;
  return next;
}
/**
 * Delete a record and drop references to it, so no dependency points at a missing record.
 * Children of a deleted record are re-parented to its nearest surviving ancestor (never deleted).
 */
export function deleteRecord(rows: RecordRow[], id: string): RecordRow[] {
  return reparentOrphans(
    rows,
    new Set([id]),
    rows
      .filter(r => r.id !== id)
      .map(r =>
        r.dependsOn?.includes(id)
          ? withDependencies(
              r,
              r.dependsOn.filter(d => d !== id),
            )
          : r,
      ),
  );
}
/** Point children of removed records at the nearest ancestor that was not removed (or make them top level). */
export function reparentOrphans(before: RecordRow[], removed: Set<string>, after: RecordRow[]): RecordRow[] {
  if (!after.some(r => r.parent && removed.has(r.parent))) return after;
  const parentOf = new Map(before.map(r => [r.id, r.parent]));
  return after.map(r => {
    if (!r.parent || !removed.has(r.parent)) return r;
    let next: string | undefined = r.parent;
    const seen = new Set<string>();
    while (next && removed.has(next) && !seen.has(next)) {
      seen.add(next);
      next = parentOf.get(next);
    }
    const row: RecordRow = { ...r, parent: next && !removed.has(next) ? next : undefined };
    if (!row.parent) delete row.parent;
    return row;
  });
}

/** Load of a Kanban column: its number of cards, or the sum of their story points. */
export function columnLoad(cards: RecordRow[], mode: 'count' | 'points' = 'count'): number {
  return mode === 'points' ? cards.reduce((sum, r) => sum + (r.points ?? 0), 0) : cards.length;
}

/** Why `parent` cannot become the parent of `id` (missing, itself, or a descendant), or null when valid. */
export function parentError(rows: RecordRow[], id: string, parent: string): string | null {
  const map = new Map(rows.map(r => [r.id, r]));
  if (!map.has(id) || !map.has(parent)) return 'Choose an existing record.';
  if (id === parent) return 'A record cannot be its own parent.';
  const seen = new Set<string>();
  for (let at: string | undefined = parent; at; at = map.get(at)?.parent) {
    if (at === id) return 'A record cannot be nested inside its own child.';
    if (seen.has(at)) break;
    seen.add(at);
  }
  return null;
}
/** Set or clear (parent undefined) a record's parent. */
export function setParent(rows: RecordRow[], id: string, parent?: string): RecordRow[] {
  if (parent) {
    const error = parentError(rows, id, parent);
    if (error) throw new Error(error);
  }
  return rows.map(r => {
    if (r.id !== id) return r;
    const next: RecordRow = { ...r, parent };
    if (!parent) delete next.parent;
    return next;
  });
}
/** Ids of a record's descendants, in no particular order. */
export function descendantIds(rows: RecordRow[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const r of rows) if (r.parent) children.set(r.parent, [...(children.get(r.parent) ?? []), r.id]);
  const out = new Set<string>(),
    stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (out.has(next) || next === id) continue;
    out.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return out;
}
/** Insert a child record after its parent's last descendant. */
export function addChildRecord(rows: RecordRow[], parentId: string, child: RecordRow): RecordRow[] {
  if (rows.length >= 1000) throw new Error('A record view supports up to 1,000 records.');
  if (!rows.some(r => r.id === parentId)) throw new Error('That record no longer exists.');
  const family = descendantIds(rows, parentId);
  family.add(parentId);
  let at = -1;
  rows.forEach((r, k) => {
    if (family.has(r.id)) at = k;
  });
  return [...rows.slice(0, at + 1), { ...child, parent: parentId }, ...rows.slice(at + 1)];
}
export type RecordTreeEntry = { row: RecordRow; depth: number; children: number; collapsed: boolean };
/**
 * Records in outline order: each record is followed by its children (in input order). A record whose
 * parent is not in `rows` (filtered out) is shown at the top level. Descendants of collapsed records are skipped.
 */
export function recordTree(rows: RecordRow[], collapsed: Iterable<string> = []): RecordTreeEntry[] {
  const ids = new Set(rows.map(r => r.id)),
    closed = new Set(collapsed),
    children = new Map<string, RecordRow[]>(),
    roots: RecordRow[] = [];
  for (const r of rows)
    if (r.parent && ids.has(r.parent) && r.parent !== r.id)
      children.set(r.parent, [...(children.get(r.parent) ?? []), r]);
    else roots.push(r);
  const out: RecordTreeEntry[] = [],
    seen = new Set<string>();
  const walk = (row: RecordRow, depth: number) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    const kids = children.get(row.id) ?? [];
    out.push({ row, depth, children: kids.length, collapsed: closed.has(row.id) && kids.length > 0 });
    if (!closed.has(row.id)) for (const kid of kids) walk(kid, depth + 1);
    else for (const id of descendantIds(rows, row.id)) seen.add(id);
  };
  for (const r of roots) walk(r, 0);
  // Records caught in a parent cycle (invalid data) still appear rather than vanish.
  for (const r of rows) if (!seen.has(r.id)) walk(r, 0);
  return out;
}
/** Make a record a child of the previous sibling shown above it in the outline. */
export function indentRecord(rows: RecordRow[], order: RecordTreeEntry[], id: string): RecordRow[] {
  const index = order.findIndex(e => e.row.id === id);
  if (index < 0) return rows;
  const depth = order[index].depth;
  for (let k = index - 1; k >= 0; k--) {
    if (order[k].depth < depth) break;
    if (order[k].depth === depth) return setParent(rows, id, order[k].row.id);
  }
  return rows;
}
/** Move a record up one level, to its grandparent (or the top level). */
export function outdentRecord(rows: RecordRow[], id: string): RecordRow[] {
  const row = rows.find(r => r.id === id);
  if (!row?.parent) return rows;
  return setParent(rows, id, rows.find(r => r.id === row.parent)?.parent);
}
/** Set or clear a milestone. A milestone is a single dated point, so its end date is cleared. */
export function setMilestone(rows: RecordRow[], id: string, milestone: boolean): RecordRow[] {
  return rows.map(r => {
    if (r.id !== id) return r;
    if (milestone && !r.start) throw new Error('Give the milestone a date first.');
    const next: RecordRow = { ...r, milestone, end: milestone ? '' : r.end };
    if (!milestone) delete next.milestone;
    return next;
  });
}

/** A YYYY-MM-DD string that names a real calendar day (not, say, February 31). */
const isRealDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
/**
 * Why a record's Timeline bar cannot be trusted as shown (track R2-I), or null: a date that is not a real day,
 * an end before the start, a milestone with an end date, or a start before a record it depends on ends.
 * `rows` (the whole dataset) resolves dependency names.
 */
export function timelineBarIssue(row: RecordRow, rows: RecordRow[] = []): string | null {
  for (const [name, value] of [
    ['start', row.start],
    ['end', row.end],
  ] as const)
    if (value && !isRealDate(value)) return `The ${name} date ${value} is not a real calendar day.`;
  if (row.start && row.end && row.end < row.start) return 'Ends before it starts.';
  if (row.milestone && row.end && row.end !== row.start) return 'A milestone must be a single date.';
  const start = row.start || row.end;
  if (start)
    for (const id of row.dependsOn ?? []) {
      const dep = rows.find(r => r.id === id),
        depEnd = dep && (dep.milestone ? dep.start : dep.end || dep.start);
      // Same rule as the dashed "late" dependency line: the bar must start after the day the other one ends.
      if (depEnd && depEnd >= start) return `Starts before “${dep!.title || 'Untitled record'}” ends.`;
    }
  return null;
}

/** First validation problem in a record set, or null. Used by the editor and by import. */
export function recordsError(rows: RecordRow[]): string | null {
  if (rows.length > 1000) return 'A record view supports up to 1,000 records.';
  const ids = new Set(rows.map(r => r.id));
  for (const r of rows) {
    if (r.parent !== undefined) {
      if (typeof r.parent !== 'string' || !ids.has(r.parent))
        return `"${r.title || 'Untitled record'}" has a missing parent record.`;
      if (r.parent === r.id) return `"${r.title || 'Untitled record'}" cannot be its own parent.`;
    }
    if (r.start && r.end && r.end < r.start) return `"${r.title || 'Untitled record'}" ends before it starts.`;
    if (r.milestone && !r.start) return `Milestone "${r.title || 'Untitled record'}" needs a date.`;
    if (r.milestone && r.end && r.end !== r.start)
      return `Milestone "${r.title || 'Untitled record'}" must be a single date.`;
    for (const d of r.dependsOn ?? []) {
      if (!ids.has(d)) return `"${r.title || 'Untitled record'}" depends on a missing record.`;
      if (d === r.id) return `"${r.title || 'Untitled record'}" cannot depend on itself.`;
    }
  }
  const map = new Map(rows.map(r => [r.id, r])),
    state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) return true;
    state.set(id, 1);
    for (const d of map.get(id)?.dependsOn ?? []) if (visit(d)) return true;
    state.set(id, 2);
    return false;
  };
  for (const r of rows) if (visit(r.id)) return 'Dependencies cannot form a cycle.';
  const done = new Set<string>();
  for (const r of rows) {
    const path = new Set<string>();
    for (let at: string | undefined = r.id; at && !done.has(at); at = map.get(at)?.parent) {
      if (path.has(at)) return 'Parent records cannot form a cycle.';
      path.add(at);
    }
    for (const id of path) done.add(id);
  }
  return null;
}

export type TimelineBar = { id: string; row: number; left: number; width: number; milestone: boolean };
export type TimelineLink = {
  from: string;
  to: string;
  fromRow: number;
  toRow: number;
  x1: number;
  x2: number;
  late: boolean;
};
/** Timeline geometry as fractions of the scale width, derived only from stored dates. */
export function timelineGeometry(
  rows: RecordRow[],
  range?: { min: number; max: number },
): {
  min: number;
  max: number;
  bars: TimelineBar[];
  links: TimelineLink[];
} {
  const dated = rows.filter(r => (r.start || r.end) && Number.isFinite(Date.parse(r.start || r.end)));
  if (!dated.length && !range) return { min: NaN, max: NaN, bars: [], links: [] };
  const startOf = (r: RecordRow) => Date.parse(r.start || r.end),
    endOf = (r: RecordRow) => (r.milestone ? Date.parse(r.start) : Date.parse(r.end || r.start));
  const min = range?.min ?? Math.min(...dated.map(startOf)),
    max = range?.max ?? Math.max(...dated.map(endOf)),
    span = max - min + DAY;
  const bars: TimelineBar[] = [];
  rows.forEach((r, row) => {
    if (!(r.start || r.end) || !Number.isFinite(Date.parse(r.start || r.end))) return;
    const left = (startOf(r) - min) / span;
    bars.push(
      r.milestone
        ? { id: r.id, row, left: left + DAY / span / 2, width: 0, milestone: true }
        : { id: r.id, row, left, width: (endOf(r) - startOf(r) + DAY) / span, milestone: false },
    );
  });
  const byId = new Map(bars.map(b => [b.id, b])),
    links: TimelineLink[] = [];
  for (const r of rows)
    for (const d of r.dependsOn ?? []) {
      const a = byId.get(d),
        b = byId.get(r.id);
      if (a && b)
        links.push({
          from: d,
          to: r.id,
          fromRow: a.row,
          toRow: b.row,
          x1: a.left + a.width,
          x2: b.left,
          late: b.left < a.left + a.width - 1e-9,
        });
    }
  return { min, max, bars, links };
}
