import type { Board, RecordRow } from './model.ts';
import { isIsoDate } from './facilitation-widgets.ts';
import { cleanRecordView, validateRecordView } from './record-query.ts';
import type { RecordViewConfig } from './record-query.ts';
import { formulaRefs, parseFormula, renameFormulaRef } from './record-formula.ts';

export const fieldTypes = ['text', 'number', 'date', 'select', 'checkbox', 'formula', 'url'] as const;
export type RecordField = {
  id: string;
  name: string;
  type: (typeof fieldTypes)[number];
  options?: string[];
  hidden?: boolean;
  /** Formula fields: arithmetic over {Field name} references; values are computed, never stored. */
  formula?: string;
  /** Number and formula fields: show the value as a progress bar between min (default 0) and max (default 100). */
  display?: 'progress';
  min?: number;
  max?: number;
  /** Number and formula fields: show values as a percentage or an amount of money. */
  format?: 'percent' | 'currency';
  /** ISO 4217 code for the currency format (default USD). */
  currency?: string;
  /** Progress bar colour (#rrggbb). */
  color?: string;
  /** Hide the number next to a progress bar. */
  hideLabel?: boolean;
  /** Conditional colours: the first matching rule colours the value. */
  rules?: NumberColorRule[];
};
export const ruleOps = ['gt', 'gte', 'lt', 'lte', 'eq'] as const;
export type NumberColorRule = { op: (typeof ruleOps)[number]; value: number; color: string };
export const ruleOpLabels: Record<NumberColorRule['op'], string> = {
  gt: 'Above',
  gte: 'At least',
  lt: 'Below',
  lte: 'At most',
  eq: 'Equal to',
};
/** Light record colours: dark text stays readable on every one of them. */
export const recordColors = [
  { name: 'Red', value: '#ffc9c9' },
  { name: 'Orange', value: '#ffd8a8' },
  { name: 'Yellow', value: '#fff3bf' },
  { name: 'Green', value: '#c3fae8' },
  { name: 'Blue', value: '#d0ebff' },
  { name: 'Purple', value: '#e5dbff' },
  { name: 'Grey', value: '#e9ecef' },
];
/** The colour of the first rule a value matches, or undefined. */
export function ruleColor(field: RecordField, value: number | null): string | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  return field.rules?.find(r =>
    r.op === 'gt'
      ? value > r.value
      : r.op === 'gte'
        ? value >= r.value
        : r.op === 'lt'
          ? value < r.value
          : r.op === 'lte'
            ? value <= r.value
            : value === r.value,
  )?.color;
}
const plainNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
/** A number in the field's format: "45%", "$1,200.00" or plain. Empty values show a dash. */
export function formatFieldNumber(field: Pick<RecordField, 'format' | 'currency'>, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (field.format === 'percent') return `${plainNumber(value)}%`;
  if (field.format === 'currency')
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: field.currency ?? 'USD' }).format(value);
    } catch {
      return `${field.currency ?? 'USD'} ${plainNumber(value)}`;
    }
  return plainNumber(value);
}
function validateNumberDisplay(f: RecordField): void {
  const numeric = ['number', 'formula'].includes(f.type);
  if (
    (f.format !== undefined && (!numeric || !['percent', 'currency'].includes(f.format))) ||
    (f.currency !== undefined &&
      (f.format !== 'currency' || typeof f.currency !== 'string' || !/^[A-Z]{3}$/.test(f.currency))) ||
    (f.color !== undefined && (!numeric || typeof f.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(f.color))) ||
    (f.hideLabel !== undefined && (typeof f.hideLabel !== 'boolean' || f.display !== 'progress'))
  )
    throw new Error('Invalid number format.');
  if (f.rules !== undefined) {
    if (!numeric || !Array.isArray(f.rules) || f.rules.length > 10) throw new Error('Use up to 10 colour rules.');
    for (const r of f.rules)
      if (
        !r ||
        typeof r !== 'object' ||
        Object.keys(r).some(k => !['op', 'value', 'color'].includes(k)) ||
        !ruleOps.includes(r.op) ||
        typeof r.value !== 'number' ||
        !Number.isFinite(r.value) ||
        typeof r.color !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(r.color)
      )
        throw new Error('Colour rules need a comparison, a number and a #rrggbb colour.');
  }
}
/** Kanban status column settings: a header colour and an optional capacity. */
export type RecordColumnSettings = { color?: string; limit?: number };
/** A named filter/sort/group configuration shared by every view of the dataset. */
export type SavedRecordView = { id: string; name: string; config: RecordViewConfig };
export type RecordSchema = {
  statuses: string[];
  fields: RecordField[];
  columns?: Record<string, RecordColumnSettings>;
  /** What a column capacity counts: cards (default) or story points. */
  capacity?: 'count' | 'points';
  views?: SavedRecordView[];
};
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
      !fieldTypes.includes(f.type) ||
      (f.hidden !== undefined && typeof f.hidden !== 'boolean')
    )
      throw new Error('Custom fields need unique names and identities.');
    if (f.type === 'formula') {
      if (typeof f.formula !== 'string') throw new Error('A formula field needs a formula.');
      parseFormula(f.formula);
    } else if (f.formula !== undefined) throw new Error('Only formula fields have a formula.');
    if (
      (f.display !== undefined && (f.display !== 'progress' || !['number', 'formula'].includes(f.type))) ||
      (f.min !== undefined && (typeof f.min !== 'number' || !Number.isFinite(f.min))) ||
      (f.max !== undefined && (typeof f.max !== 'number' || !Number.isFinite(f.max))) ||
      (f.min ?? 0) >= (f.max ?? 100)
    )
      throw new Error('A progress bar needs a minimum below its maximum.');
    validateNumberDisplay(f);
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
  if (formulaCycle(schema.fields)) throw new Error('Formula fields cannot refer to each other in a cycle.');
  if (schema.capacity !== undefined && !['count', 'points'].includes(schema.capacity))
    throw new Error('Invalid column capacity setting.');
  if (schema.columns !== undefined) {
    if (!schema.columns || typeof schema.columns !== 'object' || Array.isArray(schema.columns))
      throw new Error('Invalid column settings.');
    for (const [status, c] of Object.entries(schema.columns))
      if (
        !schema.statuses.includes(status) ||
        !c ||
        typeof c !== 'object' ||
        Array.isArray(c) ||
        Object.keys(c).some(k => k !== 'color' && k !== 'limit') ||
        (c.color !== undefined && (typeof c.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.color))) ||
        (c.limit !== undefined && (!Number.isInteger(c.limit) || c.limit < 1 || c.limit > 100000))
      )
        throw new Error('Column colours need #rrggbb values and capacities whole numbers above 0.');
  }
  if (schema.views !== undefined) {
    if (!Array.isArray(schema.views) || schema.views.length > 20) throw new Error('Use up to 20 saved views.');
    const viewIds = new Set<string>(),
      viewNames = new Set<string>();
    for (const v of schema.views) {
      if (!v || !nameOK(v.id) || viewIds.has(v.id) || !nameOK(v.name) || viewNames.has(v.name))
        throw new Error('Saved views need unique names.');
      viewIds.add(v.id);
      viewNames.add(v.name);
      validateRecordView(v.config, schema);
    }
  }
}
/** True when formula fields refer to each other in a loop (including a field referring to itself). */
export function formulaCycle(fields: RecordField[]): boolean {
  const byName = new Map(fields.map(f => [f.name, f])),
    refs = new Map<string, string[]>();
  for (const f of fields)
    if (f.type === 'formula' && typeof f.formula === 'string') {
      try {
        refs.set(
          f.name,
          [...formulaRefs(parseFormula(f.formula))].filter(n => byName.get(n)?.type === 'formula'),
        );
      } catch {
        refs.set(f.name, []);
      }
    }
  const state = new Map<string, 1 | 2>();
  const visit = (name: string): boolean => {
    if (state.get(name) === 2) return false;
    if (state.get(name) === 1) return true;
    state.set(name, 1);
    for (const next of refs.get(name) ?? []) if (visit(next)) return true;
    state.set(name, 2);
    return false;
  };
  return [...refs.keys()].some(visit);
}
/** Why a formula cannot be used for a field (unknown or non-numeric references, cycles), or null. */
export function formulaError(schema: RecordSchema, formula: string, fieldId?: string): string | null {
  try {
    const refs = formulaRefs(parseFormula(formula));
    for (const name of refs) {
      const f = schema.fields.find(f => f.name === name);
      if (name !== 'Points' && (!f || !['number', 'formula'].includes(f.type)))
        return `"${name}" is not a number field. Use {Points} or the name of a number or formula field.`;
      if (f && f.id === fieldId) return 'A formula cannot refer to its own field.';
    }
    const fields = fieldId
      ? schema.fields.map(f => (f.id === fieldId ? { ...f, formula } : f))
      : [...schema.fields, { id: '', name: '', type: 'formula' as const, formula }];
    return formulaCycle(fields) ? 'Formula fields cannot refer to each other in a cycle.' : null;
  } catch (error) {
    return (error as Error).message;
  }
}
/** The part of a view configuration a saved view keeps (not the Timeline range or the active view marker). */
export function savedViewConfig(view: RecordViewConfig): RecordViewConfig {
  const rest = { ...view };
  delete rest.timeline;
  delete rest.activeView;
  return rest;
}
/** Save a view under a name; saving under an existing name replaces that view's settings. */
export function saveRecordView(
  schema: RecordSchema,
  name: string,
  view: RecordViewConfig,
  makeId: () => string = () => crypto.randomUUID(),
): { schema: RecordSchema; id: string } {
  const label = name.trim();
  if (!nameOK(label)) throw new Error('Name the view (up to 80 characters).');
  const views = schema.views ?? [],
    existing = views.find(v => v.name === label);
  if (!existing && views.length >= 20) throw new Error('Use up to 20 saved views.');
  const id = existing?.id ?? makeId(),
    entry = { id, name: label, config: savedViewConfig(view) };
  return {
    schema: { ...schema, views: existing ? views.map(v => (v.id === id ? entry : v)) : [...views, entry] },
    id,
  };
}
export function renameRecordView(schema: RecordSchema, id: string, name: string): RecordSchema {
  const label = name.trim();
  if (!nameOK(label)) throw new Error('Name the view (up to 80 characters).');
  if (schema.views?.some(v => v.name === label && v.id !== id)) throw new Error('A view with that name exists.');
  return { ...schema, views: schema.views?.map(v => (v.id === id ? { ...v, name: label } : v)) };
}
export function deleteRecordView(schema: RecordSchema, id: string): RecordSchema {
  const views = schema.views?.filter(v => v.id !== id) ?? [];
  const next: RecordSchema = { ...schema, views };
  if (!views.length) delete next.views;
  return next;
}
/** Load a saved view into a widget's configuration, keeping its own Timeline range. */
export function applySavedView(current: RecordViewConfig, saved: SavedRecordView): RecordViewConfig {
  return {
    ...structuredClone(saved.config),
    ...(current.timeline ? { timeline: current.timeline } : {}),
    activeView: saved.id,
  };
}
/** Rename a field and update formula references to it. */
export function renameRecordField(schema: RecordSchema, id: string, name: string): RecordSchema {
  const old = schema.fields.find(f => f.id === id);
  if (!old) return schema;
  return {
    ...schema,
    fields: schema.fields.map(f =>
      f.id === id
        ? { ...f, name }
        : f.type === 'formula' && f.formula
          ? { ...f, formula: renameFormulaRef(f.formula, old.name, name) }
          : f,
    ),
  };
}
/** Normalise a link field value to an http(s) URL; throws on anything else. */
export function normalizeRecordUrl(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (text.length > 2048) throw new Error('Use a link shorter than 2,048 characters.');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text);
  } catch {
    throw new Error('Enter a valid website link.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error('Use an http or https website link without embedded credentials.');
  if (url.href.length > 2048) throw new Error('Use a link shorter than 2,048 characters.');
  return url.href;
}
const validUrl = (value: string) => {
  try {
    return normalizeRecordUrl(value) === value;
  } catch {
    return false;
  }
};
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
    case 'url':
      return typeof value === 'string' && validUrl(value);
    case 'formula':
      return false;
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
/** Carry column settings across a status rename and drop settings and saved views that no longer apply. */
function cleanSchema(schema: RecordSchema, rename?: { from: string; to: string }): RecordSchema {
  const next: RecordSchema = { ...schema };
  if (schema.columns) {
    const columns = Object.fromEntries(
      Object.entries(schema.columns)
        .map(([status, c]) => [rename && status === rename.from ? rename.to : status, c] as const)
        .filter(([status]) => schema.statuses.includes(status)),
    );
    if (Object.keys(columns).length) next.columns = columns;
    else delete next.columns;
  }
  if (schema.views)
    next.views = schema.views.map(v => ({
      ...v,
      config: cleanRecordView(
        {
          ...v.config,
          filters: v.config.filters?.map(f =>
            rename && f.field === 'status' && ['is', 'not'].includes(f.op) && f.value === rename.from
              ? { ...f, value: rename.to }
              : f,
          ),
        },
        schema,
      ),
    }));
  return next;
}
/** Remove obsolete values with schema changes, preserving values when a field is only renamed/reordered/hidden. */
export function setRecordSchema(
  board: Board,
  datasetId: string,
  schema: RecordSchema,
  rename?: { from: string; to: string },
): Board {
  schema = cleanSchema(schema, rename);
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
