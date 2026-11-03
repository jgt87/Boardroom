import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftTimelineRecord } from '../src/records.ts';
import { formatTools, toolCategories, catalog } from '../src/tool-catalog.ts';
import type { RecordRow } from '../src/model.ts';
import { mindLabelLines } from '../src/mindmap-style.ts';
test('mind-map labels retain explicit line breaks in both renderers', () => {
  assert.deepEqual(mindLabelLines('First\nSecond'), ['First', 'Second']);
  assert.deepEqual(mindLabelLines('First\n\nThird'), ['First', ' ', 'Third']);
  assert.equal(mindLabelLines('one\ntwo\nthree\nfour')[2], 'three…');
});
test('timeline gestures move UTC dates, clamp resized edges and retain dependencies', () => {
  const rows: RecordRow[] = [
    {
      id: 'a',
      title: 'A',
      status: 'Not started',
      assignee: '',
      start: '2026-03-28',
      end: '2026-03-30',
      dependsOn: ['b'],
    },
    { id: 'b', title: 'B', status: 'Complete', assignee: '', start: '2026-03-25', end: '2026-03-26' },
  ];
  const moved = shiftTimelineRecord(rows, 'a', 2);
  assert.equal(moved[0].start, '2026-03-30');
  assert.equal(moved[0].end, '2026-04-01');
  assert.deepEqual(moved[0].dependsOn, ['b']);
  assert.equal(shiftTimelineRecord(rows, 'a', 20, 'start')[0].start, '2026-03-30');
  assert.equal(shiftTimelineRecord(rows, 'a', -20, 'end')[0].end, '2026-03-28');
  assert.equal(rows[0].start, '2026-03-28');
  assert.equal(shiftTimelineRecord([{ ...rows[0], milestone: true, end: '' }], 'a', 1)[0].end, '');
});
test('catalog keeps the observed format order and all eleven tool groups', () => {
  assert.deepEqual(
    formatTools.slice(0, 5).map(e => e.label),
    ['Prototype', 'Diagram', 'Table', 'Timeline', 'Kanban'],
  );
  assert.equal(toolCategories.length, 11);
  assert.ok(catalog.Essentials.some(e => e.label === 'Grid' && e.kind === 'grid'));
  assert.ok(catalog.Other.some(e => e.kind === 'bulk'));
  assert.ok(catalog.Media.some(e => e.label === 'Upload'));
  for (const list of Object.values(catalog))
    for (const e of list) if (e.unavailable) assert.match(e.kind, /^unavailable:/);
});
