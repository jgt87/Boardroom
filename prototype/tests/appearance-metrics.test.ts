import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import { setOpacity, setTextMetric } from '../src/inspector-model.ts';

test('appearance metrics round trip and reject invalid imported values', () => {
  const note = { ...createItem('note', 0, 0), opacity: 0.3, format: { fontWeight: 650, baselineOffsetY: -12 } };
  const board = { ...newBoard(), items: [note] };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))), board);
  for (const opacity of [-1, 1.01, NaN, '0.4'])
    assert.throws(() => parseBoard({ ...board, items: [{ ...note, opacity }] }));
  for (const fontWeight of [99, 901, 400.5, NaN, '700'])
    assert.throws(() => parseBoard({ ...board, items: [{ ...note, format: { fontWeight } }] }));
  for (const baselineOffsetY of [-201, 201, Infinity, '12'])
    assert.throws(() => parseBoard({ ...board, items: [{ ...note, format: { baselineOffsetY } }] }));
  assert.equal(parseBoard({ ...newBoard(), items: [createItem('note', 0, 0)] }).items[0].opacity, undefined);
});
test('appearance edits respect grouped locks, mixed kinds, and unchanged values', () => {
  const note = { ...createItem('note', 0, 0), id: 'n', group: 'g' },
    locked = { ...createItem('rectangle', 200, 0), id: 'l', group: 'g', locked: true },
    arrow = { ...createItem('arrow', 0, 0), id: 'a' };
  const board = { ...newBoard(), items: [note, locked, arrow] };
  assert.equal(setOpacity(board, ['n'], 0.5), board);
  assert.equal(setTextMetric(board, ['n'], 'fontWeight', 800), board);
  assert.equal(setOpacity(board, ['a'], 1), board);
  assert.equal(setOpacity(board, ['a'], NaN), board);
  assert.equal(setOpacity(board, ['a'], 0.5).items[2].opacity, 0.5);
  const editable = { ...board, items: [{ ...note, group: undefined }, arrow] };
  const changed = setTextMetric(editable, ['n', 'a'], 'fontWeight', 800);
  assert.deepEqual(changed.items[0].format, { fontWeight: 800, bold: true });
  assert.equal(changed.items[1], arrow);
  assert.equal(setTextMetric(editable, ['n'], 'baselineOffsetY', 201), editable);
  assert.equal(setTextMetric(changed, ['n'], 'fontWeight', 800), changed);
  const card = { ...createItem('card', 0, 0), id: 'card' };
  const widgetBoard = { ...newBoard(), items: [card] };
  assert.equal(setTextMetric(widgetBoard, ['card'], 'fontWeight', 800), widgetBoard);
});
