import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queryRecords,
  groupedRecords,
  mergeRecordSubset,
  duplicateRecords,
  deleteRecords,
  validateRecordView,
} from '../src/record-query.ts';
import { defaultSchema } from '../src/record-schema.ts';
const rows = [
  { id: 'a', title: 'Alpha', status: 'Not started', assignee: 'Alex', start: '', end: '', values: { cost: 2 } },
  {
    id: 'b',
    title: 'Beta',
    status: 'Complete',
    assignee: 'Blair',
    start: '',
    end: '',
    values: { cost: 10 },
    dependsOn: ['a'],
  },
  { id: 'c', title: 'Alpha', status: 'Complete', assignee: '', start: '', end: '', values: { cost: 2 } },
];
test('record queries search custom data, compare typed numbers, and sort stably without mutating records', () => {
  assert.deepEqual(
    queryRecords(rows, {}, 'Blair').map(r => r.id),
    ['b'],
  );
  assert.deepEqual(
    queryRecords(rows, { filters: [{ field: 'field:cost', op: 'gt', value: '5' }] }).map(r => r.id),
    ['b'],
  );
  assert.deepEqual(
    queryRecords(rows, { sort: { field: 'field:cost', direction: 'asc' } }).map(r => r.id),
    ['a', 'c', 'b'],
  );
  assert.deepEqual(
    rows.map(r => r.id),
    ['a', 'b', 'c'],
  );
  assert.equal(groupedRecords(rows, 'status')[1].rows.length, 2);
  assert.equal(
    queryRecords([{ ...rows[0], values: {} }], { filters: [{ field: 'field:cost', op: 'lt', value: '5' }] }).length,
    0,
  );
  assert.equal(queryRecords(rows, { filters: [{ field: 'field:cost', op: 'gt', value: '' }] }).length, 0);
});
test('filtered edits and deletions retain hidden records and clean dependency references', () => {
  const merged = mergeRecordSubset(rows, [rows[0]], [{ ...rows[0], title: 'Changed' }]);
  assert.deepEqual(
    merged.map(r => r.title),
    ['Changed', 'Beta', 'Alpha'],
  );
  const removed = mergeRecordSubset(rows, [rows[0]], []);
  assert.deepEqual(
    removed.map(r => r.id),
    ['b', 'c'],
  );
  assert.deepEqual(removed[0].dependsOn, []);
  assert.deepEqual(deleteRecords(rows, ['a'])[0].dependsOn, []);
  assert.deepEqual(mergeRecordSubset(rows, [rows[0], rows[1]], [rows[1]])[0].dependsOn, []);
});
test('bulk duplication remaps selected dependencies and enforces record capacity', () => {
  let k = 0;
  const next = duplicateRecords(rows, ['a', 'b'], () => `new${k++}`);
  assert.equal(next.length, 5);
  assert.deepEqual(next[4].dependsOn, ['new0']);
  assert.throws(() =>
    duplicateRecords(
      Array.from({ length: 1000 }, (_, k) => ({ ...rows[0], id: String(k) })),
      ['0'],
    ),
  );
  assert.throws(() => validateRecordView({ filters: [{ field: 'missing', op: 'is', value: '' }] }, defaultSchema));
});
