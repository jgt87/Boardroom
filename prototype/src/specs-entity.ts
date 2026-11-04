// ERD entity table (track R5): a titled box with one row per attribute (name, type, key) and optional
// alternate row shading. Mermaid ER and class diagrams convert to these. Pure: no React.
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';

export const entityKeys = ['PK', 'FK', 'UK'] as const;
export type EntityKey = (typeof entityKeys)[number];
export type EntityRow = { name: string; type: string; key?: EntityKey };
/** `stripes` shades every other row. */
export type EntityData = { rows: EntityRow[]; stripes?: boolean };
export const ENTITY_HEADER = 36,
  ENTITY_ROW = 28,
  ENTITY_MAX_ROWS = 60,
  ENTITY_MIN_W = 160;

export function validateEntity(item: Item): void {
  const d = item.data as EntityData | undefined;
  if (
    !d ||
    !Array.isArray(d.rows) ||
    d.rows.length > ENTITY_MAX_ROWS ||
    Object.keys(d).some(k => k !== 'rows' && k !== 'stripes') ||
    (d.stripes !== undefined && typeof d.stripes !== 'boolean') ||
    d.rows.some(
      r =>
        !r ||
        typeof r !== 'object' ||
        Object.keys(r).some(k => !['name', 'type', 'key'].includes(k)) ||
        typeof r.name !== 'string' ||
        r.name.length > 200 ||
        typeof r.type !== 'string' ||
        r.type.length > 100 ||
        (r.key !== undefined && !(entityKeys as readonly string[]).includes(r.key)),
    )
  )
    throw new Error('Invalid entity table.');
}

/** Height that fits the header and every row. */
export const entityHeight = (rows: number) => ENTITY_HEADER + Math.max(1, rows) * ENTITY_ROW;

/**
 * Attribute rows from text, one per line: "name type", optionally with a key marker (PK, FK or UK)
 * before or after, e.g. "PK id int" or "customer_id int FK". "name: type" also works. Blank lines are skipped.
 */
export function parseEntityRows(text: string): EntityRow[] {
  const rows: EntityRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const words = raw.replace(/:/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let key: EntityKey | undefined;
    const rest = words.filter(w => {
      const k = w.replace(/,$/, '').toUpperCase();
      if (!key && (entityKeys as readonly string[]).includes(k)) {
        key = k as EntityKey;
        return false;
      }
      return true;
    });
    if (!rest.length) continue;
    const row: EntityRow = { name: rest[0].slice(0, 200), type: rest.slice(1).join(' ').slice(0, 100) };
    if (key) row.key = key;
    rows.push(row);
    if (rows.length >= ENTITY_MAX_ROWS) break;
  }
  return rows;
}
export const entityRowsText = (rows: EntityRow[]) =>
  rows.map(r => [r.name, r.type, r.key ?? ''].filter(Boolean).join(' ')).join('\n');

export const entitySpec: WidgetSpec = {
  kind: 'entity',
  label: 'Entity table',
  description: 'Database entity with attribute rows',
  category: 'Diagramming',
  size: [240, entityHeight(3)],
  init: (item: Item) => ({
    ...item,
    fill: '#dfe5ff',
    text: item.text || 'Entity',
    data: {
      rows: [
        { name: 'id', type: 'int', key: 'PK' },
        { name: 'name', type: 'text' },
        { name: 'created', type: 'date' },
      ],
      stripes: true,
    },
  }),
  validate: validateEntity,
  searchText: (item: Item) => ((item.data?.rows ?? []) as EntityRow[]).map(r => `${r.name} ${r.type}`).join('\n'),
};
