import type { Board, RecordRow } from './model.ts';
import { isIsoDate } from './facilitation-widgets.ts';
import { cleanRecordView } from './record-query.ts';

export type RecordField = {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  options?: string[];
  hidden?: boolean;
};
export type RecordSchema = { statuses: string[]; fields: RecordField[] };
export type RecordValues = Record<string, string | number | boolean>;
export const defaultSchema: RecordSchema = { statuses: ['Not started', 'In progress', 'Complete'], fields: [] };
export const schemaOf = (board: Board, id: string): RecordSchema =>
  board.recordSchemas && Object.hasOwn(board.recordSchemas, id) ? board.recordSchemas[id] : defaultSchema;
const nameOK = (s: unknown) => typeof s === 'string' && !!s.trim() && s === s.trim() && s.length <= 80;
export function validateRecordSchema(schema: RecordSchema): void {
  if (
    !schema ||
    !Array.isArray(schema.statuses) ||
    schema.statuses.length < 1 ||
    schema.statuses.length > 30 ||
    schema.statuses.some(s => !nameOK(s)) ||
    new Set(schema.statuses).size !== schema.statuses.length
  )
    throw new Error('Use 1–30 unique status names, up to 80 characters each.');
  if (!Array.isArray(schema.fields) || schema.fields.length > 30) throw new Error('Use up to 30 custom fields.');
  const ids = new Set<string>(),
    names = new Set<string>();
  for (const f of schema.fields) {
    if (
      !f ||
      !nameOK(f.id) ||
      ids.has(f.id) ||
      !nameOK(f.name) ||
      names.has(f.name) ||
      !['text', 'number', 'date', 'select', 'checkbox'].includes(f.type) ||
      (f.hidden !== undefined && typeof f.hidden !== 'boolean')
    )
      throw new Error('Custom fields need unique names and identities.');
    ids.add(f.id);
    names.add(f.name);
    if (
      f.type === 'select' &&
      (!Array.isArray(f.options) ||
        !f.options.length ||
        f.options.length > 30 ||
        f.options.some(o => !nameOK(o)) ||
        new Set(f.options).size !== f.options.length)
    )
      throw new Error('A single-select field needs 1–30 unique options.');
  }
}
export function validFieldValue(field: RecordField, value: unknown): boolean {
  if (value === undefined || value === '') return true;
  switch (field.type) {
    case 'text':
      return typeof value === 'string' && value.length <= 6000;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'date':
      return typeof value === 'string' && isIsoDate(value);
    case 'select':
      return typeof value === 'string' && !!field.options?.includes(value);
    case 'checkbox':
      return typeof value === 'boolean';
  }
}
export function validateRecordValues(rows: RecordRow[], schema: RecordSchema): void {
  const fields = new Map(schema.fields.map(f => [f.id, f]));
  for (const row of rows) {
    if (!schema.statuses.includes(row.status)) throw new Error('Record refers to a missing status.');
    if (row.values === undefined) continue;
    if (
      !row.values ||
      typeof row.values !== 'object' ||
      Array.isArray(row.values) ||
      Object.keys(row.values).length > 30 ||
      Object.entries(row.values).some(([id, v]) => !fields.has(id) || !validFieldValue(fields.get(id)!, v))
    )
      throw new Error('Invalid custom field value.');
  }
}
/** Remove obsolete values with schema changes, preserving values when a field is only renamed/reordered/hidden. */
export function setRecordSchema(
  board: Board,
  datasetId: string,
  schema: RecordSchema,
  rename?: { from: string; to: string },
): Board {
  validateRecordSchema(schema);
  if (!board.datasets?.[datasetId]) throw new Error('That dataset no longer exists.');
  const rows = board.datasets[datasetId].map(r => ({
    ...r,
    status:
      rename && r.status === rename.from
        ? rename.to
        : schema.statuses.includes(r.status)
          ? r.status
          : schema.statuses[0],
    ...(r.values
      ? {
          values: Object.fromEntries(
            Object.entries(r.values).filter(([id, v]) => {
              const f = schema.fields.find(f => f.id === id);
              return f && validFieldValue(f, v);
            }),
          ),
        }
      : {}),
  }));
  return {
    ...board,
    datasets: { ...board.datasets, [datasetId]: rows },
    recordSchemas: { ...board.recordSchemas, [datasetId]: schema },
    items: board.items.map(i =>
      i.datasetId !== datasetId
        ? i
        : {
            ...i,
            recordGroup:
              i.recordGroup && !schema.fields.some(f => f.id === i.recordGroup && f.type === 'select')
                ? undefined
                : i.recordGroup,
            ...(i.recordView
              ? {
                  recordView: cleanRecordView(
                    {
                      ...i.recordView,
                      filters: i.recordView.filters?.map(f =>
                        rename && f.field === 'status' && ['is', 'not'].includes(f.op) && f.value === rename.from
                          ? { ...f, value: rename.to }
                          : f,
                      ),
                      hiddenGroups:
                        rename && i.recordView.group === 'status'
                          ? i.recordView.hiddenGroups?.map(value => (value === rename.from ? rename.to : value))
                          : i.recordView.hiddenGroups,
                    },
                    schema,
                  ),
                }
              : {}),
          },
    ),
  };
}
