import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newJourney, moveJourneyContent, cellKey, newPlanner, movePlannerCard, moveRankBefore } from '../src/engage.ts';

test('Journey cell moves preserve destination text and leave emotion data unchanged', () => {
  const d = newJourney(),
    lane = d.lanes.find(l => l.kind === 'text')!;
  const from = cellKey(d.stages[0].id, lane.id),
    to = cellKey(d.stages[1].id, lane.id);
  d.cells[from] = 'First';
  d.cells[to] = 'Second';
  const next = moveJourneyContent(d, d.stages[0].id, lane.id, d.stages[1].id, lane.id);
  assert.equal(next.cells[from], undefined);
  assert.equal(next.cells[to], 'Second\nFirst');
  assert.equal(next.emotions, d.emotions);
  assert.equal(d.cells[from], 'First');
  d.cells[to] = 'X'.repeat(2000);
  assert.throws(() => moveJourneyContent(d, d.stages[0].id, lane.id, d.stages[1].id, lane.id));
  assert.throws(() =>
    moveJourneyContent(d, d.stages[0].id, lane.id, d.stages[1].id, d.lanes.find(l => l.kind === 'emotion')!.id),
  );
});

test('dropping Planner and Ranking entries back onto themselves preserves order', () => {
  const planner = newPlanner(),
    c = planner.cards[0];
  assert.equal(movePlannerCard(planner, c.id, c.team, c.iteration, c.id), planner);
  const ranking = {
    question: 'Order',
    items: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    order: ['a', 'b'],
  };
  assert.equal(moveRankBefore(ranking, 'a', 'a'), ranking);
});
