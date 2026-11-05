// Track C: partial-overlap selection, touch long press, Kanban and story map keyboard creation, and entering
// the board from the keyboard with nothing selected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard } from '../src/model.ts';
import type { Board, Item, RecordRow } from '../src/model.ts';
import { intersects, selectWithin } from '../src/interactions.ts';
import { parseViewPrefs, defaultViewPrefs } from '../src/view-prefs.ts';
import { LONG_PRESS_MS, LONG_PRESS_SLOP, longPressApplies, longPressMoved } from '../src/pointer-input.ts';
import { insertRecordNear } from '../src/records.ts';
import { addCardNear, cellCards, starterStoryMap, STORY_LIMITS } from '../src/storymap.ts';
import { enterContainer } from '../src/access-tools.ts';

const at = (type: Item['type'], id: string, x: number, y: number, w = 100, h = 100): Item => ({
  ...createItem(type, x, y),
  id,
  w,
  h,
});

test('the selection box can pick objects it only touches', () => {
  const a = at('note', 'a', 0, 0),
    b = at('note', 'b', 150, 0),
    frame = at('frame', 'f', -100, -100, 600, 400);
  const box = { x: 50, y: 50, w: 140, h: 20 };
  // Default: full containment only, so neither note is picked.
  assert.deepEqual(selectWithin([frame, a, b], box), []);
  // Touch mode: both notes overlap the box; the frame encloses it, so it is not picked.
  assert.deepEqual(selectWithin([frame, a, b], box, true), ['a', 'b']);
  // A box that covers the frame fully still picks it in either mode.
  assert.deepEqual(selectWithin([frame], { x: -200, y: -200, w: 900, h: 700 }, true), ['f']);
  // An object the box misses is never picked.
  assert.deepEqual(selectWithin([a], { x: 200, y: 200, w: 10, h: 10 }, true), []);
  assert.ok(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 5, h: 5 }));
  assert.ok(!intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 }));
});

test('the touch selection preference defaults off and is validated', () => {
  assert.equal(defaultViewPrefs.marqueeTouch, false);
  assert.equal(parseViewPrefs(null).marqueeTouch, false);
  assert.equal(parseViewPrefs('{"marqueeTouch":true}').marqueeTouch, true);
  assert.equal(parseViewPrefs('{"marqueeTouch":"yes"}').marqueeTouch, false);
});

test('a long press needs one still finger in the select tool', () => {
  assert.equal(LONG_PRESS_MS, 500);
  assert.ok(longPressApplies('touch', 'default', 'select', 1));
  assert.ok(!longPressApplies('mouse', 'default', 'select', 1));
  assert.ok(!longPressApplies('pen', 'default', 'select', 1));
  // A palm (ignored) or a finger panning in the pen tool never opens a menu.
  assert.ok(!longPressApplies('touch', 'ignore', 'select', 1));
  assert.ok(!longPressApplies('touch', 'pan', 'pen', 1));
  assert.ok(!longPressApplies('touch', 'default', 'note', 1));
  assert.ok(!longPressApplies('touch', 'default', 'select', 2));
  assert.ok(!longPressMoved({ x: 10, y: 10 }, { x: 10 + LONG_PRESS_SLOP, y: 10 }));
  assert.ok(longPressMoved({ x: 10, y: 10 }, { x: 17, y: 17 }));
});

test('Kanban cards are inserted next to the focused card in its column', () => {
  const row = (id: string, status: string): RecordRow => ({ id, title: id, status, assignee: '', start: '', end: '' });
  const rows = [row('a', 'To do'), row('b', 'Doing'), row('c', 'To do')];
  const card = { ...row('n', ''), title: 'New task' };
  const below = insertRecordNear(rows, 'a', 'below', card);
  assert.deepEqual(
    below.map(r => r.id),
    ['a', 'n', 'b', 'c'],
  );
  assert.equal(below[1].status, 'To do');
  assert.deepEqual(
    below.filter(r => r.status === 'To do').map(r => r.id),
    ['a', 'n', 'c'],
  );
  const above = insertRecordNear(rows, 'c', 'above', card);
  assert.deepEqual(
    above.filter(r => r.status === 'To do').map(r => r.id),
    ['a', 'n', 'c'],
  );
  assert.equal(insertRecordNear(rows, 'missing', 'below', card), rows);
});

test('story map cards can be added beside, above and below a card', () => {
  const m = starterStoryMap(),
    [a1, a2, a3] = m.activities,
    r1 = m.releases[0],
    first = cellCards(m, a1.id, r1.id)[0];
  const below = addCardNear(m, first.id, 'below');
  assert.deepEqual(
    cellCards(below.map, a1.id, r1.id).map(c => c.id),
    [first.id, below.id],
  );
  const above = addCardNear(below.map, first.id, 'above');
  assert.deepEqual(
    cellCards(above.map, a1.id, r1.id).map(c => c.id),
    [above.id, first.id, below.id],
  );
  const right = addCardNear(m, first.id, 'right');
  const placed = right.map.cards.find(c => c.id === right.id)!;
  assert.equal(placed.activity, a2.id);
  assert.equal(placed.release, r1.id);
  // From the last activity, a new activity is added for the sibling.
  const last = addCardNear(m, first.id, 'right').map,
    third = { id: 'x', title: 'End', activity: a3.id, release: r1.id },
    withThird = { ...last, cards: [...last.cards, third] },
    grown = addCardNear(withThird, 'x', 'right');
  assert.equal(grown.map.activities.length, 4);
  assert.equal(grown.map.cards.find(c => c.id === grown.id)!.activity, grown.map.activities[3].id);
  assert.throws(() => addCardNear(m, 'missing', 'below'));
  const full = {
    ...m,
    cards: Array.from({ length: STORY_LIMITS.cards }, (_, i) => ({ ...first, id: `c${i}` })),
  };
  assert.throws(() => addCardNear(full, 'c0', 'below'), /500/);
});

test('entering the board with nothing selected picks the first object in reading order', () => {
  const board: Board = {
    ...newBoard(),
    items: [at('note', 'late', 300, 300), at('note', 'right', 200, 0), at('note', 'left', 0, 10)],
  };
  assert.deepEqual(enterContainer(board, []), ['left']);
  assert.equal(enterContainer(newBoard(), []), undefined);
});
