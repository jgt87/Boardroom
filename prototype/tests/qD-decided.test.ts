// Decided questions P2-Q6 (Timeline flags shared per dataset), P2-Q13a (note templates insert at the caret)
// and P2-Q13b (Timeline starter templates).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item, RecordRow } from '../src/model.ts';
import { schemaOf, setRecordSchema } from '../src/record-schema.ts';
import type { TimelineFlag } from '../src/timeline-axis.ts';
import {
  datasetTimelineFlags,
  mergeTimelineFlags,
  migrateTimelineFlags,
  setDatasetTimelineFlags,
} from '../src/timeline-flags.ts';
import { insertBlocksAt } from '../src/doc-tools.ts';
import {
  applyRecordTemplate,
  dayFrom,
  isFreshDataset,
  recordTemplateData,
  recordTemplates,
  recordTemplatesFor,
  timelineTemplates,
} from '../src/record-templates.ts';
import { timelineBarIssue } from '../src/records.ts';

const starter: RecordRow = { id: 'r1', title: 'First task', status: 'Not started', assignee: '', start: '', end: '' };
const flag = (id: string, date: string, label = id, color = '#e5484d'): TimelineFlag => ({ id, date, label, color });
function timeline(id: string, datasetId: string, flags?: TimelineFlag[]): Item {
  return {
    ...createItem('timeline', 0, 0, '#ffffff'),
    id,
    datasetId,
    ...(flags ? { recordView: { timeline: { scale: 'weeks', flags } } } : {}),
  };
}
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ---- P2-Q6 ------------------------------------------------------------------------------------------------
test('P2-Q6: flags merge without loss: equal flags once, a clashing id renamed', () => {
  const merged = mergeTimelineFlags([
    [flag('a', '2026-01-01'), flag('b', '2026-02-01')],
    [flag('a', '2026-01-01'), flag('b', '2026-03-01', 'Other'), flag('c', '2026-02-01', 'b')],
    undefined,
  ]);
  assert.deepEqual(
    merged.map(f => [f.id, f.date, f.label]),
    [
      ['a', '2026-01-01', 'a'],
      ['b', '2026-02-01', 'b'],
      ['b-2', '2026-03-01', 'Other'],
    ],
  );
});

test('P2-Q6: older boards move per-Timeline flags to the dataset on load, merging two Timelines', () => {
  const old: Board = {
    ...newBoard(),
    items: [
      timeline('t1', 'd', [flag('f1', '2026-05-01', 'Launch')]),
      timeline('t2', 'd', [flag('f1', '2026-05-01', 'Launch'), flag('f2', '2026-06-01', 'Review', '#30a46c')]),
      timeline('t3', 'e'),
    ],
    datasets: { d: [starter], e: [{ ...starter, id: 'r2' }] },
  };
  const loaded = parseBoard(json(old));
  assert.deepEqual(
    schemaOf(loaded, 'd').timelineFlags?.map(f => f.label),
    ['Launch', 'Review'],
  );
  // The objects no longer carry flags but keep their other settings; the other dataset is untouched.
  for (const i of loaded.items.slice(0, 2)) assert.deepEqual(i.recordView, { timeline: { scale: 'weeks' } });
  assert.equal(loaded.recordSchemas?.e, undefined);
  // Default columns are kept, and the board loads again unchanged.
  assert.deepEqual(schemaOf(loaded, 'd').statuses, ['Not started', 'In progress', 'Complete']);
  assert.deepEqual(parseBoard(json(loaded)), loaded);
  // A board without old flags loads unchanged (no schema is created).
  const plain: Board = { ...newBoard(), items: [timeline('t', 'd')], datasets: { d: [starter] } };
  assert.equal(parseBoard(json(plain)).recordSchemas, undefined);
  assert.equal(migrateTimelineFlags(plain), plain);
});

test('P2-Q6: every Timeline of a dataset shows and edits the same flags; edits move leftover object flags', () => {
  let b: Board = {
    ...newBoard(),
    items: [timeline('t1', 'd'), timeline('t2', 'd'), timeline('t3', 'x')],
    datasets: { d: [starter], x: [{ ...starter, id: 'r9' }] },
  };
  b = setDatasetTimelineFlags(b, 'd', [flag('f1', '2026-05-01')]);
  assert.deepEqual(datasetTimelineFlags(b, 'd'), [flag('f1', '2026-05-01')]);
  assert.deepEqual(datasetTimelineFlags(b, 'x'), []);
  // A Timeline pasted from an older copy still carries its own flag: shown merged, moved by the next edit.
  b = { ...b, items: [...b.items, timeline('t4', 'd', [flag('old', '2026-07-01', 'Old')])] };
  assert.deepEqual(
    datasetTimelineFlags(b, 'd').map(f => f.id),
    ['f1', 'old'],
  );
  b = setDatasetTimelineFlags(
    b,
    'd',
    datasetTimelineFlags(b, 'd').filter(f => f.id !== 'f1'),
  );
  assert.deepEqual(
    schemaOf(b, 'd').timelineFlags?.map(f => f.id),
    ['old'],
  );
  assert.deepEqual(b.items[3].recordView?.timeline, { scale: 'weeks' });
  // Removing the last flag drops the field; schema edits keep flags.
  b = setRecordSchema(b, 'd', { ...schemaOf(b, 'd'), statuses: ['Open', 'Closed'] });
  assert.equal(schemaOf(b, 'd').timelineFlags?.length, 1);
  b = setDatasetTimelineFlags(b, 'd', []);
  assert.equal(schemaOf(b, 'd').timelineFlags, undefined);
  assert.doesNotThrow(() => parseBoard(json(b)));
  assert.throws(() => setDatasetTimelineFlags(b, 'gone', []), /no longer exists/);
  assert.throws(() => setDatasetTimelineFlags(b, 'd', [flag('bad id!', '2026-01-01')]), /Invalid Timeline flags/);
});

test('P2-Q6: invalid dataset flags are rejected on load', () => {
  const board = (timelineFlags: unknown) =>
    json({
      ...newBoard(),
      items: [timeline('t', 'd')],
      datasets: { d: [starter] },
      recordSchemas: { d: { statuses: ['Not started'], fields: [], timelineFlags } },
    });
  assert.doesNotThrow(() => parseBoard(board([flag('a', '2026-01-01')])));
  assert.throws(() => parseBoard(board([flag('a', '2026-02-30')])));
  assert.throws(() => parseBoard(board([flag('a', '2026-01-01', 'x', 'red')])));
  assert.throws(() => parseBoard(board([flag('a', '2026-01-01'), flag('a', '2026-01-02')])));
  assert.throws(() => parseBoard(board('flags')));
});

// ---- P2-Q13a ----------------------------------------------------------------------------------------------
test('P2-Q13a: a note template goes in at the caret block, or at the end without a caret', () => {
  const blocks = ['# Notes', 'First paragraph', '', 'Last'];
  const t = '## Agenda\n\n- item';
  assert.equal(insertBlocksAt(blocks, null, t), '# Notes\n\nFirst paragraph\n\nLast\n\n## Agenda\n\n- item');
  assert.equal(
    insertBlocksAt(blocks, { index: 1, place: 'after' }, t),
    '# Notes\n\nFirst paragraph\n\n## Agenda\n\n- item\n\nLast',
  );
  assert.equal(
    insertBlocksAt(blocks, { index: 1, place: 'before' }, t),
    '# Notes\n\n## Agenda\n\n- item\n\nFirst paragraph\n\nLast',
  );
  // An empty block is replaced by the template.
  assert.equal(
    insertBlocksAt(blocks, { index: 2, place: 'replace' }, t),
    '# Notes\n\nFirst paragraph\n\n## Agenda\n\n- item\n\nLast',
  );
  // Empty notes simply become the template; a spot out of range falls back to the end.
  assert.equal(insertBlocksAt([''], null, t), t);
  assert.equal(insertBlocksAt(['A'], { index: 5, place: 'after' }, t), `A\n\n${t}`);
});

// ---- P2-Q13b ----------------------------------------------------------------------------------------------
const ids = (() => {
  let n = 0;
  return () => `id${++n}`;
})();
const today = new Date(2026, 10, 5);

test('P2-Q13b: Timeline templates hold dated records, valid dependencies, flags and a scale', () => {
  assert.deepEqual(
    timelineTemplates.map(t => t.id),
    ['roadmap', 'release', 'event'],
  );
  assert.equal(dayFrom(today, 0), '2026-11-05');
  assert.equal(dayFrom(today, 30), '2026-12-05');
  for (const t of timelineTemplates) {
    const { schema, rows } = recordTemplateData(t, ids, today);
    assert.ok(rows.length >= 4, t.id);
    assert.ok(
      rows.every(r => r.start >= '2026-11-05'),
      t.id,
    );
    // No bar has a warning: real dates, milestones on one day, dependencies end before the next starts.
    for (const r of rows) assert.equal(timelineBarIssue(r, rows), null, `${t.id}: ${r.title}`);
    assert.ok(
      rows.some(r => r.dependsOn?.length),
      t.id,
    );
    assert.ok(
      rows.some(r => r.milestone),
      t.id,
    );
    assert.ok(schema.timelineFlags?.length, t.id);
    assert.ok(t.scale, t.id);
  }
});

test('P2-Q13b: a fresh Timeline offers Timeline templates; applying one is a single board change', () => {
  assert.equal(recordTemplatesFor('timeline'), timelineTemplates);
  assert.equal(recordTemplatesFor('kanban'), recordTemplates);
  assert.equal(recordTemplatesFor('table'), recordTemplates);
  const item = { ...timeline('t', 'd'), text: 'Timeline' };
  let board: Board = { ...newBoard(), items: [item], datasets: { d: [starter] } };
  // A flag added before choosing a template keeps the dataset fresh and survives the template.
  board = setDatasetTimelineFlags(board, 'd', [flag('mine', '2026-11-20', 'Mine')]);
  assert.equal(isFreshDataset(board, 'd'), true);
  const next = applyRecordTemplate(board, board.items[0], 'release', ids, today);
  assert.notEqual(next, board);
  assert.equal(next.items[0].text, 'Release plan');
  assert.equal(next.items[0].recordView?.timeline?.scale, 'weeks');
  assert.deepEqual(schemaOf(next, 'd').statuses, ['To do', 'In progress', 'Done']);
  assert.equal(next.datasets!.d[0].start, '2026-11-05');
  assert.deepEqual(
    schemaOf(next, 'd').timelineFlags?.map(f => f.label),
    ['Mine', 'Go / no-go'],
  );
  assert.equal(isFreshDataset(next, 'd'), false);
  assert.equal(applyRecordTemplate(next, next.items[0], 'roadmap', ids, today), next);
  assert.doesNotThrow(() => parseBoard(json(next)));
  // A renamed Timeline keeps its name; Table and Kanban sets still apply to a Timeline by id.
  const named: Board = { ...board, items: [{ ...board.items[0], text: 'Launch' }] };
  assert.equal(applyRecordTemplate(named, named.items[0], 'event', ids, today).items[0].text, 'Launch');
  // A dataset whose schema changed columns is no longer fresh.
  const edited = setRecordSchema(board, 'd', { ...schemaOf(board, 'd'), statuses: ['Open'] });
  assert.equal(isFreshDataset(edited, 'd'), false);
});
