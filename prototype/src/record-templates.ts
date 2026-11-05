// Starter column sets for Table and Kanban formats (track L) and Timeline formats (P2-Q13b): statuses, custom
// fields and a few example records, offered while a new format still holds only its starter record. Timeline
// templates also carry dates (days from today), dependencies, flags and a scale. Pure.
import type { Board, Item, RecordRow } from './model.ts';
import type { RecordField, RecordSchema } from './record-schema.ts';
import { schemaOf, validateRecordSchema, validateRecordValues } from './record-schema.ts';
import type { TimelineScale } from './timeline-axis.ts';
import { mergeTimelineFlags } from './timeline-flags.ts';

type FieldDef = Omit<RecordField, 'id'> & { id: string };
type RowDef = {
  title: string;
  status: string;
  assignee?: string;
  points?: number;
  values?: Record<string, unknown>;
  /** Days from today of the start and end dates (Timeline templates). */
  start?: number;
  end?: number;
  milestone?: boolean;
  /** Indexes of earlier rows this one depends on. */
  after?: number[];
};
export type RecordTemplate = {
  id: string;
  label: string;
  about: string;
  statuses: string[];
  fields: FieldDef[];
  rows: RowDef[];
  /** Timeline flags, `day` days from today. */
  flags?: { day: number; label: string; color: string }[];
  /** Scale a Timeline object takes when the template is applied. */
  scale?: TimelineScale;
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
  if (board.recordSchemas && Object.hasOwn(board.recordSchemas, datasetId)) {
    // Shared Timeline flags (P2-Q6) create a schema of default columns; that dataset is still fresh.
    const s = board.recordSchemas[datasetId];
    if (
      Object.keys(s).some(k => !['statuses', 'fields', 'timelineFlags'].includes(k)) ||
      s.fields.length ||
      s.statuses.join('\u0000') !== defaultStatuses.join('\u0000')
    )
      return false;
  }
  const rows = board.datasets?.[datasetId] ?? [];
  if (rows.length > 1) return false;
  const r = rows[0];
  return !r || (r.title === STARTER_TITLE && !r.values && !r.assignee && !r.start && !r.end && !r.description);
}
const defaultStatuses = ['Not started', 'In progress', 'Complete'];

/** A local calendar day `days` after `today`, as YYYY-MM-DD. */
export function dayFrom(today: Date, days: number): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The schema and example records of a template, with fresh record ids and dates counted from `today`. */
export function recordTemplateData(
  t: RecordTemplate,
  makeId: () => string,
  today: Date = new Date(),
): { schema: RecordSchema; rows: RecordRow[] } {
  const schema: RecordSchema = { statuses: [...t.statuses], fields: t.fields.map(f => ({ ...f })) };
  const rows: RecordRow[] = t.rows.map(r => {
    const row: RecordRow = {
      id: makeId(),
      title: r.title,
      status: r.status,
      assignee: r.assignee ?? '',
      start: r.start === undefined ? '' : dayFrom(today, r.start),
      end: r.end === undefined ? '' : dayFrom(today, r.end),
    };
    if (r.milestone) row.milestone = true;
    if (r.points !== undefined) row.points = r.points;
    if (r.values) row.values = { ...(r.values as RecordRow['values']) };
    return row;
  });
  t.rows.forEach((r, k) => {
    if (r.after?.length) rows[k].dependsOn = r.after.map(n => rows[n].id);
  });
  if (t.flags?.length)
    schema.timelineFlags = t.flags.map(f => ({
      id: makeId(),
      date: dayFrom(today, f.day),
      label: f.label,
      color: f.color,
    }));
  validateRecordSchema(schema);
  validateRecordValues(rows, schema);
  return { schema, rows };
}

/** Every starter template, Table and Kanban sets first. */
export const allRecordTemplates = (): RecordTemplate[] => [...recordTemplates, ...timelineTemplates];
/** The templates a format offers: Timeline templates on a Timeline, the column sets on a Table or Kanban. */
export const recordTemplatesFor = (type: Item['type']): RecordTemplate[] =>
  type === 'timeline' ? timelineTemplates : recordTemplates;

/**
 * Apply a starter template to a format object's dataset (one undo step for the caller). The object takes
 * the template's name while it still has its default name, and a Timeline takes the template's scale. Flags
 * the dataset already had are kept. Returns the board unchanged when the dataset is no longer fresh or the
 * template is unknown.
 */
export function applyRecordTemplate(
  board: Board,
  item: Item,
  templateId: string,
  makeId: () => string,
  today: Date = new Date(),
): Board {
  const t = allRecordTemplates().find(x => x.id === templateId),
    id = item.datasetId;
  if (!t || !id || !isFreshDataset(board, id)) return board;
  const { schema, rows } = recordTemplateData(t, makeId, today);
  const kept = schemaOf(board, id).timelineFlags;
  if (kept?.length) schema.timelineFlags = mergeTimelineFlags([kept, schema.timelineFlags]);
  return {
    ...board,
    datasets: { ...board.datasets, [id]: rows },
    recordSchemas: { ...board.recordSchemas, [id]: schema },
    items: board.items.map(i => {
      if (i.id !== item.id) return i;
      let next = formatNames.includes((i.text ?? '').trim()) ? { ...i, text: t.label } : i;
      if (t.scale && i.type === 'timeline')
        next = {
          ...next,
          recordView: { ...next.recordView, timeline: { ...next.recordView?.timeline, scale: t.scale } },
        };
      return next;
    }),
  };
}

/** Timeline starter templates (P2-Q13b): dated records with dependencies, counted from the day of use. */
export const timelineTemplates: RecordTemplate[] = [
  {
    id: 'roadmap',
    label: 'Project roadmap',
    about: 'Discovery to launch over about three months, with theme and progress',
    statuses: ['Planned', 'In progress', 'At risk', 'Done'],
    fields: [
      { id: 'theme', name: 'Theme', type: 'select', options: ['Product', 'Platform', 'Growth'] },
      { id: 'progress', name: 'Progress', type: 'number', display: 'progress', min: 0, max: 100 },
    ],
    rows: [
      {
        title: 'Discovery and research',
        status: 'In progress',
        start: 0,
        end: 20,
        values: { theme: 'Product', progress: 40 },
      },
      { title: 'Design', status: 'Planned', start: 21, end: 48, after: [0], values: { theme: 'Product', progress: 0 } },
      { title: 'Build the beta', status: 'Planned', start: 49, end: 90, after: [1], values: { theme: 'Platform' } },
      { title: 'Marketing site', status: 'Planned', start: 60, end: 90, values: { theme: 'Growth' } },
      { title: 'Beta launch', status: 'Planned', start: 91, milestone: true, after: [2, 3] },
    ],
    flags: [{ day: 45, label: 'Mid-project review', color: '#4262ff' }],
    scale: 'months',
  },
  {
    id: 'release',
    label: 'Release plan',
    about: 'Feature work, code freeze, testing and release over about four weeks',
    statuses: ['To do', 'In progress', 'Done'],
    fields: [
      { id: 'area', name: 'Area', type: 'select', options: ['Backend', 'Frontend', 'QA', 'Docs'] },
      { id: 'version', name: 'Version', type: 'text' },
    ],
    rows: [
      { title: 'Feature work', status: 'In progress', start: 0, end: 13, values: { area: 'Frontend', version: '2.0' } },
      { title: 'Code freeze', status: 'To do', start: 14, milestone: true, after: [0] },
      { title: 'Testing and bug fixes', status: 'To do', start: 15, end: 24, after: [1], values: { area: 'QA' } },
      { title: 'Release notes', status: 'To do', start: 18, end: 24, values: { area: 'Docs' } },
      { title: 'Release', status: 'To do', start: 25, milestone: true, after: [2, 3] },
    ],
    flags: [{ day: 24, label: 'Go / no-go', color: '#e5484d' }],
    scale: 'weeks',
  },
  {
    id: 'event',
    label: 'Event schedule',
    about: 'Venue, speakers, registration and promotion up to the event day, about six weeks out',
    statuses: ['Planned', 'Booked', 'Done'],
    fields: [
      { id: 'location', name: 'Location', type: 'text' },
      { id: 'budget', name: 'Budget', type: 'number', format: 'currency', currency: 'USD' },
    ],
    rows: [
      { title: 'Book the venue', status: 'Planned', start: 0, end: 6, values: { budget: 5000 } },
      { title: 'Invite speakers', status: 'Planned', start: 3, end: 20 },
      { title: 'Open registration', status: 'Planned', start: 21, milestone: true, after: [0] },
      { title: 'Promote the event', status: 'Planned', start: 21, end: 40, after: [0], values: { budget: 1500 } },
      { title: 'Event day', status: 'Planned', start: 42, milestone: true, after: [1, 3] },
    ],
    flags: [{ day: 38, label: 'Registration closes', color: '#f76b15' }],
    scale: 'weeks',
  },
];
