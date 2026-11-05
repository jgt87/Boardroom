// Starter column sets for Table and Kanban formats (track L): statuses, custom fields and a few example
// records, offered while a new format still holds only its starter record. Pure.
import type { Board, Item, RecordRow } from './model.ts';
import type { RecordField, RecordSchema } from './record-schema.ts';
import { validateRecordSchema, validateRecordValues } from './record-schema.ts';

type FieldDef = Omit<RecordField, 'id'> & { id: string };
type RowDef = { title: string; status: string; assignee?: string; points?: number; values?: Record<string, unknown> };
export type RecordTemplate = {
  id: string;
  label: string;
  about: string;
  statuses: string[];
  fields: FieldDef[];
  rows: RowDef[];
};

export const recordTemplates: RecordTemplate[] = [
  {
    id: 'bugs',
    label: 'Bug tracker',
    about: 'Reported to fixed, with severity and component',
    statuses: ['Reported', 'Triaged', 'In progress', 'In review', 'Fixed'],
    fields: [
      { id: 'severity', name: 'Severity', type: 'select', options: ['Critical', 'Major', 'Minor'] },
      { id: 'component', name: 'Component', type: 'text' },
      { id: 'reported', name: 'Reported', type: 'date' },
    ],
    rows: [
      { title: 'Login button does nothing on mobile', status: 'Reported', values: { severity: 'Major' } },
      { title: 'Typo on the pricing page', status: 'Triaged', values: { severity: 'Minor', component: 'Website' } },
    ],
  },
  {
    id: 'sprint',
    label: 'Sprint backlog',
    about: 'Backlog to done, with priority and story points',
    statuses: ['Backlog', 'To do', 'In progress', 'Done'],
    fields: [
      { id: 'priority', name: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] },
      { id: 'sprint', name: 'Sprint', type: 'text' },
    ],
    rows: [
      { title: 'As a user I can reset my password', status: 'To do', points: 3, values: { priority: 'High' } },
      { title: 'Export the report as CSV', status: 'Backlog', points: 2, values: { priority: 'Medium' } },
    ],
  },
  {
    id: 'content',
    label: 'Content calendar',
    about: 'Idea to published, with channel and publish date',
    statuses: ['Idea', 'Drafting', 'Editing', 'Scheduled', 'Published'],
    fields: [
      { id: 'channel', name: 'Channel', type: 'select', options: ['Blog', 'Newsletter', 'Social', 'Video'] },
      { id: 'publish', name: 'Publish date', type: 'date' },
      { id: 'link', name: 'Link', type: 'url' },
    ],
    rows: [
      { title: 'Launch announcement', status: 'Drafting', values: { channel: 'Blog' } },
      { title: 'Customer story', status: 'Idea', values: { channel: 'Newsletter' } },
    ],
  },
  {
    id: 'crm',
    label: 'CRM pipeline',
    about: 'Lead to won or lost, with company, deal value and next step',
    statuses: ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Won', 'Lost'],
    fields: [
      { id: 'company', name: 'Company', type: 'text' },
      { id: 'value', name: 'Deal value', type: 'number', format: 'currency', currency: 'USD' },
      { id: 'next', name: 'Next step', type: 'date' },
    ],
    rows: [
      { title: 'Intro call', status: 'Lead', values: { company: 'Northwind', value: 12000 } },
      { title: 'Pilot proposal', status: 'Proposal', values: { company: 'Contoso', value: 30000 } },
    ],
  },
];

const STARTER_TITLE = 'First task';
const formatNames = ['', 'Table', 'Kanban', 'Timeline', 'Records'];
/**
 * True while a format's dataset is as it was created: default columns (no schema) and at most the one
 * untouched starter record. Templates are only offered then, so applying one never discards real work.
 */
export function isFreshDataset(board: Board, datasetId: string | undefined): boolean {
  if (!datasetId) return false;
  if (board.recordSchemas && Object.hasOwn(board.recordSchemas, datasetId)) return false;
  const rows = board.datasets?.[datasetId] ?? [];
  if (rows.length > 1) return false;
  const r = rows[0];
  return !r || (r.title === STARTER_TITLE && !r.values && !r.assignee && !r.start && !r.end && !r.description);
}

/** The schema and example records of a template, with fresh record ids. */
export function recordTemplateData(
  t: RecordTemplate,
  makeId: () => string,
): { schema: RecordSchema; rows: RecordRow[] } {
  const schema: RecordSchema = { statuses: [...t.statuses], fields: t.fields.map(f => ({ ...f })) };
  const rows: RecordRow[] = t.rows.map(r => {
    const row: RecordRow = {
      id: makeId(),
      title: r.title,
      status: r.status,
      assignee: r.assignee ?? '',
      start: '',
      end: '',
    };
    if (r.points !== undefined) row.points = r.points;
    if (r.values) row.values = { ...(r.values as RecordRow['values']) };
    return row;
  });
  validateRecordSchema(schema);
  validateRecordValues(rows, schema);
  return { schema, rows };
}

/**
 * Apply a starter column set to a format object's dataset (one undo step for the caller). The object takes
 * the template's name while it still has its default name. Returns the board unchanged when the dataset is
 * no longer fresh or the template is unknown.
 */
export function applyRecordTemplate(board: Board, item: Item, templateId: string, makeId: () => string): Board {
  const t = recordTemplates.find(x => x.id === templateId),
    id = item.datasetId;
  if (!t || !id || !isFreshDataset(board, id)) return board;
  const { schema, rows } = recordTemplateData(t, makeId);
  return {
    ...board,
    datasets: { ...board.datasets, [id]: rows },
    recordSchemas: { ...board.recordSchemas, [id]: schema },
    items: board.items.map(i =>
      i.id === item.id && formatNames.includes((i.text ?? '').trim()) ? { ...i, text: t.label } : i,
    ),
  };
}
