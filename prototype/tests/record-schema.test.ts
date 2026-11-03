import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import { defaultSchema, setRecordSchema, validateRecordSchema, validateRecordValues } from '../src/record-schema.ts';
import { copySelection, pastePayload } from '../src/clipboard.ts';
import { moveRecord } from '../src/records.ts';

const fixture = () => ({
  ...newBoard(),
  items: [{ ...createItem('kanban', 0, 0), id: 'w', datasetId: 'd' }],
  datasets: { d: [{ id: 'r', title: 'Task', status: 'Not started', assignee: '', start: '', end: '' }] },
});

test('schema status renaming migrates records; deletion falls back and old boards still load', () => {
  const b = fixture();
  parseBoard(b);
  const next = setRecordSchema(
    b,
    'd',
    { statuses: ['Ready', 'Done'], fields: [] },
    { from: 'Not started', to: 'Ready' },
  );
  assert.equal(next.datasets!.d[0].status, 'Ready');
  parseBoard(next);
  const moved = moveRecord(next.datasets!.d, 'r', 'Done', null, ['Ready', 'Done']);
  assert.equal(moved[0].status, 'Done');
  assert.equal(
    setRecordSchema({ ...next, datasets: { d: moved } }, 'd', { statuses: ['Ready'], fields: [] }).datasets!.d[0]
      .status,
    'Ready',
  );
});

test('typed fields validate imports and schema changes retain identity or remove obsolete values', () => {
  const schema = {
    ...defaultSchema,
    fields: [{ id: 'priority', name: 'Priority', type: 'select' as const, options: ['High', 'Low'] }],
  };
  const b = setRecordSchema(fixture(), 'd', schema);
  b.datasets!.d[0].values = { priority: 'High' };
  b.items[0].recordGroup = 'priority';
  parseBoard(b);
  const renamed = setRecordSchema(b, 'd', {
    ...schema,
    fields: [{ ...schema.fields[0], name: 'Urgency', hidden: true }],
  });
  assert.equal(renamed.datasets!.d[0].values!.priority, 'High');
  const removed = setRecordSchema(b, 'd', { ...schema, fields: [] });
  assert.deepEqual(removed.datasets!.d[0].values, {});
  assert.equal(removed.items[0].recordGroup, undefined);
  parseBoard(removed);
  assert.throws(() => validateRecordValues([{ ...b.datasets!.d[0], values: { priority: 'Missing' } }], schema));
  assert.throws(() => validateRecordSchema({ ...schema, statuses: ['Ready', 'Ready'] }));
});

test('custom schemas and values survive clipboard remapping', () => {
  const b = setRecordSchema(fixture(), 'd', {
    statuses: ['Ready'],
    fields: [{ id: 'n', name: 'Effort', type: 'number' }],
  });
  b.datasets!.d[0].values = { n: 3 };
  const pasted = pastePayload(newBoard(), copySelection(b, ['w'])!, { x: 0, y: 0 }).board;
  const id = pasted.items[0].datasetId!;
  assert.equal(pasted.recordSchemas![id].fields[0].name, 'Effort');
  assert.equal(pasted.datasets![id][0].values!.n, 3);
  parseBoard(pasted);
  pasted.datasets![id][0].values!.n = 'bad';
  assert.throws(() => parseBoard(pasted));
});
