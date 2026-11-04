// Import spreadsheet rows into Table records (gap list B3, B15). Pure: no React, no DOM.
// The header row maps to the built-in record fields (title, status, assignee, dates, points, description, tags,
// link); every other column becomes a custom field whose type is inferred from its values.
import type { Board, Item, Point, RecordRow } from './model.ts';
import { createItem, normalizeNoteLink } from './model.ts';
import type { RecordField, RecordSchema, RecordValues } from './record-schema.ts';
import { defaultSchema, schemaOf, validateRecordSchema, validateRecordValues } from './record-schema.ts';
import { parseDelimited } from './smart-paste.ts';
import { parseDate, parseNumber, slashedDateOrder } from './cell-values.ts';
import type { DateOrder } from './cell-values.ts';

export { parseDate, parseNumber, slashedDateOrder };

/** The order to read a column's slashed dates with, or undefined while it is unclear. */
const settledOrder = (o: ReturnType<typeof slashedDateOrder>): DateOrder | undefined =>
  o === 'dmy' || o === 'mdy' ? o : undefined;
/**
 * A note about how a column's slashed dates were read (gap Q15): the order inferred from the column, or why they
 * were left unread. Null when the column has no slashed dates.
 */
export function dateOrderNote(header: string, order: ReturnType<typeof slashedDateOrder>, keptAsText = false) {
  const name = `"${header.slice(0, 60) || 'Untitled'}"`,
    outcome = keptAsText ? 'the column was kept as text' : 'they were left empty';
  if (order === 'dmy') return `Dates in ${name} were read as day/month/year.`;
  if (order === 'mdy') return `Dates in ${name} were read as month/day/year.`;
  if (order === 'ambiguous') return `Dates in ${name} could be day/month or month/day, so ${outcome}.`;
  if (order === 'conflict') return `Dates in ${name} mix day/month and month/day order, so ${outcome}.`;
  return null;
}

/** Records per dataset (the board format limit). */
export const IMPORT_ROWS_MAX = 1000;
/** Custom fields per dataset (the schema limit). */
export const IMPORT_FIELDS_MAX = 30;
/** Columns read from a file; later columns are ignored. */
export const IMPORT_COLUMNS_MAX = 60;
/** Size limit for a CSV file. */
export const CSV_FILE_MAX = 5 * 1024 * 1024;

export type BuiltIn = 'title' | 'status' | 'assignee' | 'start' | 'end' | 'points' | 'description' | 'tags' | 'link';
const aliases: Record<BuiltIn, string[]> = {
  title: ['title', 'name', 'task', 'summary', 'item', 'subject', 'record'],
  status: ['status', 'state', 'stage', 'column'],
  assignee: ['assignee', 'owner', 'assigned to', 'assigned', 'person', 'responsible'],
  start: ['start', 'start date', 'begin', 'begins', 'from', 'starts'],
  end: ['end', 'end date', 'due', 'due date', 'finish', 'deadline', 'ends', 'to'],
  points: ['points', 'story points', 'estimate', 'sp'],
  description: ['description', 'details', 'notes', 'body'],
  tags: ['tags', 'labels', 'tag', 'label'],
  link: ['link', 'url', 'website'],
};
const normHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export type ColumnMapping = { index: number; header: string; target: BuiltIn | { field: string } };

/** Which record property each column fills. Each built-in is used once; without a title column the first free column is the title. */
export function mapColumns(header: string[]): ColumnMapping[] {
  const used = new Set<BuiltIn>(),
    out: ColumnMapping[] = [];
  header.slice(0, IMPORT_COLUMNS_MAX).forEach((raw, index) => {
    const h = normHeader(raw),
      builtIn = (Object.keys(aliases) as BuiltIn[]).find(k => !used.has(k) && aliases[k].includes(h));
    if (builtIn) used.add(builtIn);
    out.push({ index, header: raw.trim(), target: builtIn ?? { field: raw.trim() } });
  });
  if (!used.has('title')) {
    const first = out.find(c => typeof c.target === 'object');
    if (first) first.target = 'title';
  }
  return out;
}

const parseBool = (v: string) => {
  const t = v.trim().toLowerCase();
  return ['true', 'yes', 'y', 'x', '1', '✓', 'done'].includes(t)
    ? true
    : ['false', 'no', 'n', '0', ''].includes(t)
      ? false
      : null;
};
const parseUrl = (v: string) => {
  if (!/^(https?:\/\/|www\.)\S+$/i.test(v.trim())) return null;
  try {
    return normalizeNoteLink(v) ?? null;
  } catch {
    return null;
  }
};

/** The custom field type that fits every non-empty value. */
export function inferFieldType(values: string[]): { type: RecordField['type']; options?: string[] } {
  const filled = values.map(v => v.trim()).filter(Boolean);
  if (!filled.length) return { type: 'text' };
  if (filled.every(v => parseNumber(v) !== null)) return { type: 'number' };
  const order = settledOrder(slashedDateOrder(filled));
  if (filled.every(v => parseDate(v, order) !== null)) return { type: 'date' };
  if (filled.every(v => parseBool(v) !== null) && filled.some(v => /^(true|false|yes|no)$/i.test(v)))
    return { type: 'checkbox' };
  if (filled.every(v => parseUrl(v) !== null)) return { type: 'url' };
  const distinct = [...new Set(filled)];
  if (distinct.length <= 12 && distinct.length < filled.length && distinct.every(v => v.length <= 80))
    return { type: 'select', options: distinct };
  return { type: 'text' };
}

function fieldValue(field: RecordField, raw: string, order?: DateOrder): string | number | boolean | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  switch (field.type) {
    case 'number':
      return parseNumber(v) ?? undefined;
    case 'date':
      return parseDate(v, order) ?? undefined;
    case 'checkbox':
      return parseBool(v) ?? undefined;
    case 'url':
      return parseUrl(v) ?? undefined;
    case 'select':
      return field.options?.includes(v) ? v : undefined;
    case 'text':
      return v.slice(0, 6000);
    default:
      return undefined;
  }
}

export type RecordImport = { rows: RecordRow[]; schema: RecordSchema; notes: string[]; skipped: number };

/**
 * Turn a table (header row first) into records for a dataset with `schema` and `existing` rows.
 * New statuses and custom fields are added to the schema; existing fields are matched by name.
 * Rows beyond the dataset limit and columns beyond the field limit are left out and reported in `notes`.
 */
export function importRecordTable(
  table: string[][],
  schema: RecordSchema,
  existing: RecordRow[] = [],
  makeId: () => string = () => crypto.randomUUID(),
): RecordImport {
  const notes: string[] = [];
  if (table.length < 2) throw new Error('The file needs a header row and at least one row of data.');
  const [header, ...body] = table,
    dataRows = body.filter(r => r.some(c => c.trim())),
    room = Math.max(0, IMPORT_ROWS_MAX - existing.length),
    kept = dataRows.slice(0, room);
  if (!room) throw new Error(`This table already holds ${IMPORT_ROWS_MAX} records.`);
  if (dataRows.length > kept.length)
    notes.push(`Only the first ${kept.length} rows were imported (a table holds up to ${IMPORT_ROWS_MAX} records).`);
  if (header.length > IMPORT_COLUMNS_MAX) notes.push(`Only the first ${IMPORT_COLUMNS_MAX} columns were read.`);
  const mapping = mapColumns(header);
  const fields = [...schema.fields],
    statuses = [...schema.statuses],
    fieldFor = new Map<number, RecordField>(),
    names = new Set(fields.map(f => f.name));
  let droppedColumns = 0;
  // Slashed dates (03/04/2026) are read in the day/month order the whole column settles (gap Q15).
  const dateNotes: string[] = [],
    orderFor = new Map<number, DateOrder | undefined>();
  const readOrder = (index: number) => {
    const order = slashedDateOrder(kept.map(r => r[index] ?? '')),
      note = dateOrderNote(header[index] ?? '', order);
    if (note) dateNotes.push(note);
    return settledOrder(order);
  };
  for (const col of mapping) {
    if (typeof col.target !== 'object') continue;
    const values = kept.map(r => r[col.index] ?? '');
    let name = (col.target.field || `Column ${col.index + 1}`).replace(/\s+/g, ' ').trim().slice(0, 80);
    const match = fields.find(f => f.name.toLowerCase() === name.toLowerCase() && f.type !== 'formula');
    if (match) {
      fieldFor.set(col.index, match);
      if (match.type === 'date') orderFor.set(col.index, readOrder(col.index));
      continue;
    }
    if (!values.some(v => v.trim())) continue;
    if (fields.length >= IMPORT_FIELDS_MAX) {
      droppedColumns++;
      continue;
    }
    for (let n = 2; names.has(name) || ['Title', 'Status', 'Assignee', 'Points'].includes(name); n++)
      name = `${name.slice(0, 74)} (${n})`;
    const inferred = inferFieldType(values),
      field: RecordField = {
        id: makeId(),
        name,
        type: inferred.type,
        ...(inferred.options ? { options: inferred.options } : {}),
      };
    fields.push(field);
    names.add(name);
    fieldFor.set(col.index, field);
    if (field.type === 'date') orderFor.set(col.index, readOrder(col.index));
    else if (field.type === 'text') {
      // A column of dates whose order stays unclear keeps its text rather than losing it.
      const order = slashedDateOrder(values),
        filled = values.map(v => v.trim()).filter(Boolean);
      if (
        (order === 'ambiguous' || order === 'conflict') &&
        filled.every(v => parseDate(v, 'dmy') !== null || parseDate(v, 'mdy') !== null)
      )
        dateNotes.push(dateOrderNote(header[col.index] ?? '', order, true)!);
    }
  }
  if (droppedColumns)
    notes.push(
      `${droppedColumns} column${droppedColumns === 1 ? ' was' : 's were'} skipped (a table holds up to ${IMPORT_FIELDS_MAX} custom fields).`,
    );
  const col = (k: BuiltIn) => mapping.find(c => c.target === k)?.index;
  const cols = Object.fromEntries((Object.keys(aliases) as BuiltIn[]).map(k => [k, col(k)])) as Record<
    BuiltIn,
    number | undefined
  >;
  const startOrder = cols.start === undefined ? undefined : readOrder(cols.start),
    endOrder = cols.end === undefined ? undefined : readOrder(cols.end);
  let skipped = 0;
  const cell = (r: string[], i: number | undefined) => (i === undefined ? '' : (r[i] ?? '').trim());
  const rows = kept.map(r => {
    let status = cell(r, cols.status);
    const known = statuses.find(s => s.toLowerCase() === status.toLowerCase());
    if (known) status = known;
    else if (status && statuses.length < 30) statuses.push((status = status.slice(0, 80)));
    else status = statuses[0];
    const start = cell(r, cols.start),
      end = cell(r, cols.end),
      startIso = start ? parseDate(start, startOrder) : '',
      endIso = end ? parseDate(end, endOrder) : '';
    if (startIso === null || endIso === null) skipped++;
    const row: RecordRow = {
      id: makeId(),
      title: cell(r, cols.title).slice(0, 6000),
      status,
      assignee: cell(r, cols.assignee).slice(0, 6000),
      start: startIso ?? '',
      end: endIso ?? '',
    };
    const points = parseNumber(cell(r, cols.points));
    if (points !== null && points >= 0 && points <= 1000) row.points = points;
    const description = cell(r, cols.description);
    if (description) row.description = description.slice(0, 6000);
    const tags = [
      ...new Set(
        cell(r, cols.tags)
          .split(/[,;|]/)
          .map(t => t.trim().slice(0, 32))
          .filter(Boolean),
      ),
    ].slice(0, 10);
    if (tags.length) row.tags = tags;
    const link = safeLink(cell(r, cols.link));
    if (link) row.link = link;
    const values: RecordValues = {};
    for (const [index, field] of fieldFor) {
      const v = fieldValue(field, r[index] ?? '', orderFor.get(index));
      if (v !== undefined) values[field.id] = v;
      else if ((r[index] ?? '').trim()) skipped++;
    }
    if (Object.keys(values).length) row.values = values;
    return row;
  });
  notes.push(...dateNotes);
  if (skipped)
    notes.push(
      `${skipped} value${skipped === 1 ? ' was' : 's were'} left empty because they did not fit the column type.`,
    );
  const nextSchema: RecordSchema = { ...schema, statuses, fields };
  validateRecordSchema(nextSchema);
  validateRecordValues(rows, nextSchema);
  return { rows, schema: nextSchema, notes, skipped };
}
const safeLink = (v: string) => {
  try {
    return normalizeNoteLink(v) ?? null;
  } catch {
    return null;
  }
};

/** Append imported rows to an existing dataset (one undo step in the caller). */
export function importIntoDataset(
  board: Board,
  datasetId: string,
  table: string[][],
  makeId?: () => string,
): { board: Board; count: number; notes: string[] } {
  const existing = board.datasets?.[datasetId];
  if (!existing) throw new Error('That table no longer exists.');
  const result = importRecordTable(table, schemaOf(board, datasetId), existing, makeId);
  return {
    board: {
      ...board,
      datasets: { ...board.datasets, [datasetId]: [...existing, ...result.rows] },
      recordSchemas: { ...board.recordSchemas, [datasetId]: result.schema },
    },
    count: result.rows.length,
    notes: result.notes,
  };
}

/** A new Table view (and dataset) holding the imported rows, centred on `at`. */
export function tableFromImport(
  board: Board,
  table: string[][],
  title: string,
  at: Point,
  makeId: () => string = () => crypto.randomUUID(),
): { board: Board; item: Item; count: number; notes: string[] } {
  if (board.items.length >= 2000) throw new Error('This prototype supports up to 2,000 objects per board.');
  const result = importRecordTable(table, defaultSchema, [], makeId),
    datasetId = makeId(),
    item: Item = { ...createItem('table', at.x, at.y, '#ffffff'), datasetId, text: title.slice(0, 200) };
  const columns = 4 + Math.min(6, result.schema.fields.length);
  item.w = Math.max(item.w, columns * 150);
  item.h = Math.max(item.h, Math.min(900, 140 + result.rows.length * 36));
  item.x = at.x - item.w / 2;
  item.y = at.y - item.h / 2;
  return {
    board: {
      ...board,
      items: [...board.items, item],
      datasets: { ...board.datasets, [datasetId]: result.rows },
      recordSchemas: { ...board.recordSchemas, [datasetId]: result.schema },
    },
    item,
    count: result.rows.length,
    notes: result.notes,
  };
}

/** Rows of a CSV or TSV file, with a size check. */
export function csvTable(text: string): string[][] {
  if (text.length > CSV_FILE_MAX) throw new Error('CSV files up to 5 MB can be imported.');
  if (text.includes(String.fromCharCode(0))) throw new Error('This file does not contain CSV text.');
  return parseDelimited(text);
}
/** A table title from a file name. */
export const importTitle = (fileName: string) =>
  fileName
    .replace(/\.(csv|tsv|txt|xlsx)$/i, '')
    .replace(/[_]+/g, ' ')
    .trim()
    .slice(0, 200) || 'Imported table';
