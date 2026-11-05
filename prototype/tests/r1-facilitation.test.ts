// Track R1-E: multi-statement scales, poll hide/reveal and Table export, voting results as a Table and the
// extended Action Shortcut actions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  normalizeScale,
  rangeScale,
  resetScale,
  scaleStatements,
  scaleStats,
  scaleTotal,
  setPollHidden,
  tallyScale,
  validateScaleData,
  votePoll,
  SCALE_STATEMENTS_MAX,
} from '../src/facilitation-widgets.ts';
import type { PollData, ScaleData } from '../src/facilitation-widgets.ts';
import { pollTable, pollToTable, votedArea, votingResultToTable, votingTable } from '../src/facilitation-results.ts';
import { startVoting, castVote, endVoting } from '../src/board-tools.ts';
import { voteLabel } from '../src/facilitation-rules.ts';
import { shortcutActions, shortcutGroups, shortcutUsesTarget } from '../src/specs-shortcut.ts';
import { widgetSpecs } from '../src/widget-specs.ts';

const board = (items: Item[], extra: Partial<Board> = {}): Board => ({ ...newBoard(), items, ...extra });
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const legacy: ScaleData = { label: 'How aligned?', min: 1, max: 5, value: 4, leftLabel: 'No', rightLabel: 'Yes' };

test('scale: older single-marker data still loads and reads as one statement', () => {
  const item = { ...createItem('scale', 0, 0), id: 's', data: legacy };
  assert.doesNotThrow(() => parseBoard(board([item])));
  const [only] = scaleStatements(legacy);
  assert.equal(only.text, 'How aligned?');
  assert.deepEqual(only.tallies, [0, 0, 0, 1, 0]);
  const n = normalizeScale(legacy);
  assert.equal(n.value, undefined);
  assert.equal(n.statements?.length, 1);
  assert.doesNotThrow(() => validateScaleData(n));
  assert.throws(() => validateScaleData({ ...legacy, value: 9 }), /Invalid scale/);
});

test('scale: new scales start with one statement and validate', () => {
  const s = createItem('scale', 0, 0),
    d = s.data as ScaleData;
  assert.equal(d.statements?.length, 1);
  assert.equal(d.value, undefined);
  assert.doesNotThrow(() => parseBoard(board([s])));
  assert.ok(widgetSpecs.find(w => w.kind === 'scale')!.searchText!(s).includes('We agree on the goal'));
});

test('scale: tallies, averages and distribution per statement', () => {
  let d: ScaleData = {
    ...normalizeScale(legacy),
    statements: [
      { id: 'a', text: 'Goal', tallies: [0, 0, 0, 0, 0] },
      { id: 'b', text: 'Plan', tallies: [0, 0, 0, 0, 0] },
    ],
  };
  d = tallyScale(tallyScale(tallyScale(d, 'a', 5), 'a', 4), 'a', 4);
  d = tallyScale(d, 'b', 1);
  const a = scaleStats(d.statements![0], d.min),
    b = scaleStats(d.statements![1], d.min);
  assert.deepEqual([a.count, a.average], [3, 4.3]);
  assert.deepEqual(
    a.shares.map(x => Math.round(x * 100)),
    [0, 0, 0, 67, 33],
  );
  assert.deepEqual([b.count, b.average], [1, 1]);
  assert.equal(scaleStats({ id: 'x', text: '', tallies: [0, 0] }, 0).average, null);
  assert.equal(scaleTotal(d), 4);
  // Removing never goes below zero; unknown steps and statements are refused.
  assert.equal(tallyScale(d, 'b', 2, -1).statements![1].tallies[1], 0);
  assert.throws(() => tallyScale(d, 'a', 6), /not on the scale/);
  assert.throws(() => tallyScale(d, 'zz', 3), /no longer exists/);
  // Tallying an older scale migrates it.
  const migrated = tallyScale(legacy, 'statement-1', 2);
  assert.equal(migrated.value, undefined);
  assert.deepEqual(migrated.statements![0].tallies, [0, 1, 0, 1, 0]);
  assert.equal(scaleTotal(resetScale(d)), 0);
});

test('scale: changing the range keeps responses still on the scale', () => {
  const d: ScaleData = { ...normalizeScale(legacy), statements: [{ id: 'a', text: 'A', tallies: [1, 2, 3, 4, 5] }] };
  const r = rangeScale(d, 3, 7);
  assert.deepEqual(r.statements![0].tallies, [3, 4, 5, 0, 0]);
  assert.doesNotThrow(() => validateScaleData(r));
  assert.throws(() => rangeScale(d, 5, 5), /below maximum/);
  assert.throws(() => rangeScale(d, 0, 200), /100 steps/);
});

test('scale: validation limits statements and tally shape', () => {
  const base = normalizeScale(legacy);
  const many = Array.from({ length: SCALE_STATEMENTS_MAX + 1 }, (_, k) => ({
    id: `s${k}`,
    text: 'x',
    tallies: [0, 0, 0, 0, 0],
  }));
  assert.throws(() => validateScaleData({ ...base, statements: many }), /1 to 6/);
  assert.throws(() => validateScaleData({ ...base, statements: [] }), /1 to 6/);
  assert.throws(() => validateScaleData({ ...base, statements: [{ id: 'a', text: 'x', tallies: [0, 0] }] }), /1 to 6/);
  assert.throws(() => validateScaleData({ ...base, statements: [{ id: 'a', text: 'x', tallies: [0, -1, 0, 0, 0] }] }));
  const dup = { id: 'a', text: 'x', tallies: [0, 0, 0, 0, 0] };
  assert.throws(() => validateScaleData({ ...base, statements: [dup, dup] }));
});

const poll = (): Item => ({
  ...createItem('poll', 100, 50),
  id: 'p',
  data: {
    question: 'Lunch?',
    options: [
      { id: 'a', label: 'Pizza', votes: 3 },
      { id: 'b', label: 'Salad', votes: 1 },
    ],
  } satisfies PollData,
});

test('poll: results can be hidden until revealed', () => {
  const d = poll().data as PollData;
  const hidden = setPollHidden(d, true);
  assert.equal(hidden.resultsHidden, true);
  assert.doesNotThrow(() => parseBoard(board([{ ...poll(), data: hidden }])));
  // Voting still counts while hidden.
  assert.equal(votePoll(hidden, 'a').options[0].votes, 4);
  assert.equal('resultsHidden' in setPollHidden(hidden, false), false);
  assert.throws(() => parseBoard(board([{ ...poll(), data: { ...d, resultsHidden: 'yes' } }])));
});

test('poll: export to Table builds a dataset beside the poll in one change', () => {
  assert.deepEqual(pollTable(poll().data as PollData), [
    ['Option', 'Votes', 'Share (%)'],
    ['Pizza', '3', '75'],
    ['Salad', '1', '25'],
  ]);
  const b = board([poll()]),
    made = pollToTable(b, 'p', ids());
  const p = poll();
  assert.equal(made.item.type, 'table');
  assert.equal(made.item.text, 'Lunch?');
  assert.ok(made.item.x >= p.x + p.w, 'placed to the right of the poll');
  assert.equal(made.item.y, p.y);
  const rows = made.board.datasets![made.item.datasetId!];
  assert.deepEqual(
    rows.map(r => r.title),
    ['Pizza', 'Salad'],
  );
  const fields = made.board.recordSchemas![made.item.datasetId!].fields;
  const votes = fields.find(f => f.name === 'Votes')!;
  assert.equal(votes.type, 'number');
  assert.deepEqual(
    rows.map(r => r.values?.[votes.id]),
    [3, 1],
  );
  assert.doesNotThrow(() => parseBoard(made.board));
  assert.throws(() => pollToTable(b, 'missing'), /no longer exists/);
});

test('voting results become a ranked Table beside the voted area', () => {
  const a = { ...createItem('note', 0, 0), id: 'a', text: 'Alpha' },
    c = { ...createItem('note', 300, 200), id: 'c', text: 'Charlie' },
    x = { ...createItem('note', 600, 0), id: 'x', text: 'Bravo' };
  let b = startVoting(board([a, c, x]), ['a', 'c', 'x'], 5);
  for (const [id, n] of [
    ['c', 2],
    ['a', 1],
    ['x', 1],
  ] as const)
    for (let k = 0; k < n; k++) b = castVote(b, id, 1);
  b = endVoting(b, voteLabel).board;
  const result = b.votingResults![0];
  assert.deepEqual(votingTable(result), [
    ['Item', 'Votes', 'Rank'],
    ['Charlie', '2', '1'],
    ['Alpha', '1', '2'],
    ['Bravo', '1', '2'],
  ]);
  const area = votedArea(b, result)!;
  const made = votingResultToTable(b, 0, { x: 5000, y: 5000, w: 0, h: 0 }, ids());
  assert.equal(made.board.items.length, 4, 'one new object');
  assert.ok(made.item.x > area.x + area.w && made.item.y === area.y);
  const rows = made.board.datasets![made.item.datasetId!];
  assert.deepEqual(
    rows.map(r => r.title),
    ['Charlie', 'Alpha', 'Bravo'],
  );
  assert.doesNotThrow(() => parseBoard(made.board));
  // When the voted objects are gone, the fallback box is used.
  const gone = { ...b, items: [] };
  assert.equal(votingResultToTable(gone, 0, { x: 5000, y: 40, w: 0, h: 0 }, ids()).item.y, 40);
  assert.throws(() => votingResultToTable(b, 3, { x: 0, y: 0, w: 0, h: 0 }), /no longer exists/);
  assert.throws(
    () => votingResultToTable({ ...b, votingResults: [{ ...result, totals: [] }] }, 0, { x: 0, y: 0, w: 0, h: 0 }),
    /no voted objects/,
  );
});

test('action shortcuts: about twenty grouped actions, targets only for links and frames', () => {
  assert.ok(shortcutActions.length >= 15 && shortcutActions.length <= 24);
  assert.equal(new Set(shortcutActions.map(a => a.id)).size, shortcutActions.length);
  const groups = shortcutGroups();
  assert.deepEqual(
    groups.flatMap(g => g.actions.map(a => a.id)),
    shortcutActions.map(a => a.id),
    'every action appears once, in order',
  );
  assert.ok(groups.length >= 5);
  assert.deepEqual(
    shortcutActions.filter(a => shortcutUsesTarget(a.id)).map(a => a.id),
    ['link', 'frame'],
  );
  for (const action of ['voting', 'comments', 'grid', 'viewonly', 'tool-note', 'export-png']) {
    const s = { ...createItem('shortcut', 0, 0), data: { action, target: '' } };
    assert.doesNotThrow(() => parseBoard(board([s])), action);
  }
  const bad = { ...createItem('shortcut', 0, 0), data: { action: 'format-disk', target: '' } };
  assert.throws(() => parseBoard(board([bad])), /Invalid action shortcut/);
});
