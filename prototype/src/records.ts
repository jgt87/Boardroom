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
/** Delete a record and drop references to it, so no dependency points at a missing record. */
export function deleteRecord(rows: RecordRow[], id: string): RecordRow[] {
  return rows
    .filter(r => r.id !== id)
    .map(r =>
      r.dependsOn?.includes(id)
        ? withDependencies(
            r,
            r.dependsOn.filter(d => d !== id),
          )
        : r,
    );
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

/** First validation problem in a record set, or null. Used by the editor and by import. */
export function recordsError(rows: RecordRow[]): string | null {
  if (rows.length > 1000) return 'A record view supports up to 1,000 records.';
  const ids = new Set(rows.map(r => r.id));
  for (const r of rows) {
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
