// Decided open questions (round qA): sticky colour memory (P1-Q2), unknown card estimates (P1-Q6), T-shirt sizing
// gallery preset (P1-Q7) and minimal result tables (P1-Q8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { stickyColorFrom } from '../src/last-color.ts';
import { applyChip } from '../src/chips.ts';
import { cardsCsv, patchCards } from '../src/card-tools.ts';
import { cardPointsLabel, estimateTotals } from '../src/facilitation-widgets.ts';
import type { CardData, PollData } from '../src/facilitation-widgets.ts';
import { catalog, placementPreset } from '../src/tool-catalog.ts';
import { validateEstimatePalette } from '../src/chip-rules.ts';
import { pollToTable, votingResultToTable } from '../src/facilitation-results.ts';
import { castVote, endVoting, startVoting } from '../src/board-tools.ts';
import { voteLabel } from '../src/facilitation-rules.ts';
import { setBuiltInHidden, shownBuiltIns, validateRecordSchema } from '../src/record-schema.ts';
import type { RecordSchema } from '../src/record-schema.ts';
import { syncedCard } from '../src/record-canvas.ts';

const make = (type: Parameters<typeof createItem>[0], id: string, extra: Partial<Item> = {}): Item => ({
  ...createItem(type, 0, 0),
  id,
  ...extra,
});
const board = (items: Item[], extra: Partial<Board> = {}): Board => ({ ...newBoard(), items, ...extra });
const find = (b: Board, id: string) => b.items.find(i => i.id === id)!;
const card = (b: Board, id: string) => find(b, id).data as CardData;
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

test('P1-Q2 only a colour applied to sticky notes alone becomes the new-sticky colour', () => {
  const note = make('note', 'n'),
    other = make('note', 'm'),
    shape = make('rectangle', 'r'),
    text = make('text', 't');
  assert.equal(stickyColorFrom([note], '#FFB879'), '#ffb879');
  assert.equal(stickyColorFrom([note, other], '#abc'), '#aabbcc');
  assert.equal(stickyColorFrom([shape], '#ffb879'), null, 'shapes keep their own memory');
  assert.equal(stickyColorFrom([text], '#ffb879'), null);
  assert.equal(stickyColorFrom([note, shape], '#ffb879'), null, 'mixed selections do not count');
  assert.equal(stickyColorFrom([], '#ffb879'), null);
  assert.equal(stickyColorFrom([note], 'not a colour'), null);
});

test('P1-Q6 "?" stores an unknown estimate on cards that shows as "? pt" and is skipped by totals', () => {
  const b = board([make('card', 'a'), make('card', 'b'), make('card', 'c')]);
  let r = applyChip(b, ['a', 'b', 'c'], { kind: 'estimate', value: 'M' });
  r = applyChip(r.board, ['a'], { kind: 'estimate', value: '5' });
  r = applyChip(r.board, ['b'], { kind: 'estimate', value: '?' });
  assert.equal(card(r.board, 'b').pointsUnknown, true);
  assert.equal(card(r.board, 'b').points, undefined);
  assert.equal(card(r.board, 'b').size, 'M', 'a points chip keeps the size');
  assert.equal(cardPointsLabel(card(r.board, 'b')), '? pt');
  assert.equal(cardPointsLabel(card(r.board, 'a')), '5 pt');
  assert.equal(cardPointsLabel(card(r.board, 'c')), '');
  assert.deepEqual(estimateTotals(r.board.items), { points: 5, sizes: { M: 3 }, estimated: 1, unknown: 1 });
  assert.doesNotThrow(() => parseBoard(r.board));
  assert.match(cardsCsv(r.board.items), /,\?,M/);
  // A number replaces unknown; Clear removes both.
  const numbered = applyChip(r.board, ['b'], { kind: 'estimate', value: '3' }).board;
  assert.equal(card(numbered, 'b').points, 3);
  assert.ok(!('pointsUnknown' in card(numbered, 'b')));
  const cleared = applyChip(r.board, ['b'], { kind: 'estimate', value: '' }).board;
  assert.ok(!('pointsUnknown' in card(cleared, 'b')) && !('size' in card(cleared, 'b')));
  // The card bar's "?" goes through the same patch.
  assert.equal(card(patchCards(b, ['a'], { points: 'unknown' }), 'a').pointsUnknown, true);
});

test('P1-Q6 older boards without the flag load; invalid flags are refused', () => {
  const plain = make('card', 'a');
  assert.doesNotThrow(() => parseBoard(board([{ ...plain, data: { ...plain.data, points: 8 } }])));
  assert.throws(() => parseBoard(board([{ ...plain, data: { ...plain.data, pointsUnknown: 'yes' } }])));
  assert.throws(() => parseBoard(board([{ ...plain, data: { ...plain.data, pointsUnknown: false } }])));
  // With both present the number wins.
  assert.equal(cardPointsLabel({ points: 2, pointsUnknown: true }), '2 pt');
});

test('P1-Q6 a synced card keeps "?" until its record gets points', () => {
  const rows = [{ id: 'r', title: 'Task', status: 'Not started', assignee: '', start: '', end: '' }];
  const c = make('card', 'c', { data: { ...make('card', 'x').data, pointsUnknown: true } });
  const b = board([c], { datasets: { d: rows } });
  assert.equal((syncedCard(b, 'd', 'r', c)!.data as CardData).pointsUnknown, true);
  const pointed = board([c], { datasets: { d: [{ ...rows[0], points: 5 }] } });
  const synced = syncedCard(pointed, 'd', 'r', c)!.data as CardData;
  assert.equal(synced.points, 5);
  assert.ok(!('pointsUnknown' in synced));
});

test('P1-Q7 the T-shirt sizing gallery entry places the estimate palette in Sizes mode', () => {
  const entry = catalog.Planning.find(e => e.label === 'T-shirt sizing')!;
  const preset = placementPreset(entry.kind)!;
  assert.equal(preset.kind, 'estimates');
  assert.deepEqual(preset.data, { scale: 'tshirt' });
  const points = catalog.Planning.find(e => e.label === 'Story points')!;
  assert.equal(points.kind, 'estimates');
  assert.equal(placementPreset(points.kind), null);
  assert.equal(placementPreset('toString'), null);
  assert.equal(placementPreset(null), null);
  const palette = { ...createItem('estimates', 0, 0), data: { ...createItem('estimates', 0, 0).data, ...preset.data } };
  assert.doesNotThrow(() => validateEstimatePalette(palette));
  // Distinct kinds keep gallery keys and search results unique.
  const planningKinds = catalog.Planning.map(e => e.kind);
  assert.equal(new Set(planningKinds).size, planningKinds.length);
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

test('P1-Q8 poll and voting tables use a minimal schema without status, assignee or date columns', () => {
  const made = pollToTable(board([poll()]), 'p', ids());
  const schema = made.board.recordSchemas![made.item.datasetId!];
  assert.deepEqual(schema.hiddenBuiltIns, ['status', 'assignee', 'start', 'end']);
  assert.deepEqual(shownBuiltIns(schema), []);
  assert.deepEqual(
    schema.fields.map(f => f.name),
    ['Votes', 'Share (%)'],
  );
  assert.ok(made.item.w < 760, 'narrower than a full Table');
  assert.doesNotThrow(() => parseBoard(made.board));

  const a = { ...createItem('note', 0, 0), id: 'a', text: 'Alpha' },
    c = { ...createItem('note', 300, 0), id: 'c', text: 'Charlie' };
  let b = startVoting(board([a, c]), ['a', 'c'], 3);
  b = castVote(castVote(b, 'c', 1), 'c', 1);
  b = castVote(b, 'a', 1);
  b = endVoting(b, voteLabel).board;
  const voted = votingResultToTable(b, 0, { x: 0, y: 0, w: 0, h: 0 }, ids());
  const vs = voted.board.recordSchemas![voted.item.datasetId!];
  assert.deepEqual(shownBuiltIns(vs), []);
  assert.deepEqual(
    vs.fields.map(f => f.name),
    ['Votes', 'Rank'],
  );
  assert.doesNotThrow(() => parseBoard(voted.board));
});

test('P1-Q8 hidden built-in columns can be shown again and are validated', () => {
  const base: RecordSchema = { statuses: ['Not started'], fields: [] };
  const hidden = setBuiltInHidden(setBuiltInHidden(base, 'end', true), 'status', true);
  assert.deepEqual(hidden.hiddenBuiltIns, ['status', 'end'], 'kept in column order');
  assert.deepEqual(shownBuiltIns(hidden), ['assignee', 'start']);
  const shown = setBuiltInHidden(setBuiltInHidden(hidden, 'status', false), 'end', false);
  assert.ok(!('hiddenBuiltIns' in shown), 'an empty list is removed');
  assert.deepEqual(shownBuiltIns(base), ['status', 'assignee', 'start', 'end'], 'older schemas show every column');
  assert.throws(() => validateRecordSchema({ ...base, hiddenBuiltIns: ['title' as never] }), /hidden columns/);
  assert.throws(() => validateRecordSchema({ ...base, hiddenBuiltIns: ['end', 'end'] }), /hidden columns/);
  assert.throws(() => validateRecordSchema({ ...base, hiddenBuiltIns: 'end' as never }), /hidden columns/);
});
