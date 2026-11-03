import type { RecordRow } from './model.ts';
import type { RecordSchema } from './record-schema.ts';
import { validateTimelineSettings } from './timeline-axis.ts';

export type RecordFilter = { field: string; op: 'contains' | 'is' | 'not' | 'gt' | 'lt' | 'empty'; value: string };
export type RecordViewConfig = {
  timeline?: import('./timeline-axis.ts').TimelineSettings;
  filters?: RecordFilter[];
  match?: 'all' | 'any';
  sort?: { field: string; direction: 'asc' | 'desc' };
  group?: string;
  hiddenGroups?: string[];
};
export const recordFieldOptions = (schema: RecordSchema) => [
  { id: 'title', name: 'Title' },
  { id: 'status', name: 'Status' },
  { id: 'assignee', name: 'Assignee' },
  { id: 'start', name: 'Start date' },
  { id: 'end', name: 'End date' },
  { id: 'points', name: 'Points' },
  ...schema.fields.map(f => ({ id: `field:${f.id}`, name: f.name })),
];
export function recordValue(row: RecordRow, field: string): string | number | boolean {
  if (field.startsWith('field:')) return row.values?.[field.slice(6)] ?? '';
  return (
    (
      {
        title: row.title,
        status: row.status,
        assignee: row.assignee,
        start: row.start,
        end: row.end,
        points: row.points ?? '',
      } as Record<string, string | number>
    )[field] ?? ''
  );
}

export function withRecordValue(row: RecordRow, field: string, value: string, schema: RecordSchema): RecordRow {
  if (field.startsWith('field:')) {
    const id = field.slice(6),
      f = schema.fields.find(f => f.id === id);
    if (!f) throw new Error('That field no longer exists.');
    const typed =
      f.type === 'number' && value !== '' ? Number(value) : f.type === 'checkbox' ? value === 'true' : value;
    if (typeof typed === 'number' && !Number.isFinite(typed)) throw new Error('Enter a finite number.');
    return { ...row, values: { ...row.values, [id]: typed } };
  }
  if (field === 'points') {
    if (value !== '' && !Number.isFinite(Number(value))) throw new Error('Enter a finite estimate.');
    return { ...row, points: value === '' ? undefined : Math.max(0, Math.min(1000, Number(value))) };
  }
  if (!['title', 'status', 'assignee', 'start', 'end'].includes(field)) throw new Error('Choose an existing field.');
  return { ...row, [field]: value };
}
export function cleanRecordView(view: RecordViewConfig, schema: RecordSchema): RecordViewConfig {
  const valid = new Set(recordFieldOptions(schema).map(f => f.id));
  return {
    ...view,
    filters: view.filters?.filter(f => valid.has(f.field)),
    sort: view.sort && valid.has(view.sort.field) ? view.sort : undefined,
    group: view.group && valid.has(view.group) ? view.group : undefined,
  };
}
export function validateRecordView(view: RecordViewConfig, schema: RecordSchema): void {
  if (view?.timeline !== undefined) validateTimelineSettings(view.timeline);
  const valid = new Set(recordFieldOptions(schema).map(f => f.id));
  if (
    !view ||
    typeof view !== 'object' ||
    Array.isArray(view) ||
    (view.match !== undefined && !['all', 'any'].includes(view.match)) ||
    (view.filters !== undefined &&
      (!Array.isArray(view.filters) ||
        view.filters.length > 10 ||
        view.filters.some(
          f =>
            !f ||
            !valid.has(f.field) ||
            !['contains', 'is', 'not', 'gt', 'lt', 'empty'].includes(f.op) ||
            typeof f.value !== 'string' ||
            f.value.length > 6000,
        ))) ||
    (view.sort !== undefined &&
      (!view.sort || !valid.has(view.sort.field) || !['asc', 'desc'].includes(view.sort.direction))) ||
    (view.group !== undefined && !valid.has(view.group)) ||
    (view.hiddenGroups !== undefined &&
      (!Array.isArray(view.hiddenGroups) ||
        view.hiddenGroups.length > 1000 ||
        view.hiddenGroups.some(v => typeof v !== 'string' || v.length > 6000)))
  )
    throw new Error('Invalid record view settings.');
}
function matches(row: RecordRow, filter: RecordFilter): boolean {
  const value = recordValue(row, filter.field),
    a = String(value).toLocaleLowerCase(),
    b = filter.value.toLocaleLowerCase();
  if (['gt', 'lt'].includes(filter.op) && (a === '' || !b.trim())) return false;
  switch (filter.op) {
    case 'contains':
      return a.includes(b);
    case 'is':
      return a === b;
    case 'not':
      return a !== b;
    case 'empty':
      return a === '';
    case 'gt':
      return typeof value === 'number' ? Number.isFinite(Number(b)) && value > Number(b) : a > b;
    case 'lt':
      return typeof value === 'number' ? Number.isFinite(Number(b)) && value < Number(b) : a < b;
  }
}
export function queryRecords(rows: RecordRow[], view: RecordViewConfig, search = ''): RecordRow[] {
  const query = search.trim().toLocaleLowerCase(),
    filters = view.filters ?? [];
  const result = rows.filter(
    row =>
      (!query ||
        [
          row.title,
          row.status,
          row.assignee,
          row.description,
          row.start,
          row.end,
          ...(row.tags ?? []),
          ...Object.values(row.values ?? {}),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)) &&
      (!filters.length ||
        (view.match === 'any' ? filters.some(f => matches(row, f)) : filters.every(f => matches(row, f)))),
  );
  if (!view.sort) return result;
  const sort = view.sort;
  return result
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = recordValue(a.row, sort.field),
        y = recordValue(b.row, sort.field);
      const compare =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), undefined, { numeric: true });
      return (sort.direction === 'desc' ? -compare : compare) || a.index - b.index;
    })
    .map(v => v.row);
}
export function groupedRecords(rows: RecordRow[], field?: string): { value: string; rows: RecordRow[] }[] {
  if (!field) return [{ value: '', rows }];
  const groups = new Map<string, RecordRow[]>();
  for (const row of rows) {
    const value = String(recordValue(row, field));
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return [...groups].map(([value, rows]) => ({ value, rows }));
}
export function deleteRecords(rows: RecordRow[], ids: string[]): RecordRow[] {
  const removed = new Set(ids);
  return rows
    .filter(r => !removed.has(r.id))
    .map(r =>
      r.dependsOn?.some(id => removed.has(id)) ? { ...r, dependsOn: r.dependsOn.filter(id => !removed.has(id)) } : r,
    );
}
export function duplicateRecords(
  rows: RecordRow[],
  ids: string[],
  makeId: () => string = () => crypto.randomUUID(),
): RecordRow[] {
  const selected = rows.filter(r => ids.includes(r.id));
  if (rows.length + selected.length > 1000) throw new Error('A record view supports up to 1,000 records.');
  const map = new Map(selected.map(r => [r.id, makeId()]));
  return [
    ...rows,
    ...selected.map(r => ({
      ...structuredClone(r),
      id: map.get(r.id)!,
      dependsOn: r.dependsOn?.map(id => map.get(id) ?? id),
    })),
  ];
}

/** Apply visible-row edits/reorders without dropping records excluded by a query. */
export function mergeRecordSubset(full: RecordRow[], visible: RecordRow[], edited: RecordRow[]): RecordRow[] {
  const visibleIds = new Set(visible.map(r => r.id)),
    editedIds = new Set(edited.map(r => r.id));
  const base = deleteRecords(
    full,
    visible.filter(r => !editedIds.has(r.id)).map(r => r.id),
  );
  const queue = [...edited];
  const next = base.flatMap(row => (visibleIds.has(row.id) ? (queue.length ? [queue.shift()!] : []) : [row]));
  return deleteRecords(
    [...next, ...queue],
    visible.filter(r => !editedIds.has(r.id)).map(r => r.id),
  );
}
