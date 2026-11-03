import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineAxis, validateTimelineSettings, reorderTimelineRow } from '../src/timeline-axis.ts';
import { timelineGeometry } from '../src/records.ts';
const rows = [
  { id: 'a', title: 'A', status: 'Not started', assignee: '', start: '2024-02-28', end: '2024-03-02' },
  { id: 'b', title: 'B', status: 'Complete', assignee: '', start: '2024-03-04', end: '2024-03-05', dependsOn: ['a'] },
];
test('calendar scales align UTC weeks, leap months, quarters and years', () => {
  const week = timelineAxis(rows, { scale: 'weeks' }, 600);
  assert.equal(new Date(week.min).getUTCDay(), 1);
  const month = timelineAxis(rows, { scale: 'months' }, 600);
  assert.equal(new Date(month.min).toISOString().slice(0, 10), '2024-02-01');
  assert.equal(new Date(month.max).toISOString().slice(0, 10), '2024-03-31');
  assert.equal(timelineAxis(rows, { scale: 'quarters' }, 600).ticks[0].label, 'Q1 2024');
  assert.equal(timelineAxis(rows, { scale: 'years' }, 600).ticks[0].label, '2024');
});
test('manual ranges scroll while Autofit uses available width and bounded tick counts', () => {
  const wide = timelineAxis(rows, { scale: 'days', start: '2024-01-01', end: '2024-12-31', fit: false }, 600);
  assert.ok(wide.width > 600);
  assert.ok(wide.ticks.length <= 401);
  assert.equal(timelineAxis(rows, { scale: 'days', fit: true }, 600).width, 600);
  const geometry = timelineGeometry(rows, wide);
  assert.ok(geometry.bars[0].left > 0);
  assert.equal(geometry.links.length, 1);
  assert.throws(() => validateTimelineSettings({ start: '2024-03-01', end: '2024-02-01' }));
});
test('row reordering is identity-preserving and self-drops are no-ops', () => {
  const next = reorderTimelineRow(rows, 'b', 'a');
  assert.deepEqual(
    next.map(r => r.id),
    ['b', 'a'],
  );
  assert.equal(next[0], rows[1]);
  assert.equal(reorderTimelineRow(rows, 'a', 'a'), rows);
});
