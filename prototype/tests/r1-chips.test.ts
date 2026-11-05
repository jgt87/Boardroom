import test from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  acceptsChip,
  dotsLeft,
  dotsPlaced,
  encodeChip,
  isEstimateValue,
  legacyEstimateChip,
  paletteValues,
  parseChip,
  validateChipFields,
} from '../src/chip-rules.ts';
import type { Chip } from '../src/chip-rules.ts';
import { applyChip, recolorDots, removeChipMark, returnAllDots } from '../src/chips.ts';

const make = (type: Parameters<typeof createItem>[0], id: string, extra: Partial<Item> = {}): Item => ({
  ...createItem(type, 0, 0),
  id,
  ...extra,
});
const board = (items: Item[]): Board => ({ ...newBoard(), items });
const find = (b: Board, id: string) => b.items.find(i => i.id === id)!;
const pile = (id = 'pile', total = 3) => make('dotpile', id, { data: { title: 'Votes', total, color: '#e8445a' } });

test('F chip payloads round-trip and foreign payloads are refused', () => {
  const chips: Chip[] = [
    { kind: 'estimate', value: '5' },
    { kind: 'estimate', value: '?' },
    { kind: 'estimate', value: 'XXL' },
    { kind: 'estimate', value: '' },
    { kind: 'dot', pile: 'p1' },
    { kind: 'person', name: 'Grace Hopper' },
  ];
  for (const c of chips) assert.deepEqual(parseChip(encodeChip(c)), c);
  for (const bad of ['', 'estimate:9999', 'estimate:huge', 'dot:', 'person:<b>', 'card:1', 'x'.repeat(400)])
    assert.equal(parseChip(bad), null, bad);
  assert.deepEqual(legacyEstimateChip('points:0.5'), { kind: 'estimate', value: '0.5' });
  assert.deepEqual(legacyEstimateChip('size:M'), { kind: 'estimate', value: 'M' });
  assert.equal(legacyEstimateChip('size:5'), null);
  assert.equal(legacyEstimateChip('points:M'), null);
});

test('F the palette offers story points with "?" and T-shirt sizes XS to XXL', () => {
  assert.deepEqual(paletteValues.points, ['0', '1', '2', '3', '5', '8', '13', '21', '?']);
  assert.deepEqual([...paletteValues.tshirt], ['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  for (const v of [...paletteValues.points, ...paletteValues.tshirt, '0.5', '1000']) assert.ok(isEstimateValue(v), v);
  for (const v of ['1001', '-1', '1.25', 'XXXL', '']) assert.ok(!isEstimateValue(v), v);
});

test('F an estimate chip sets card points or size, and stores an estimate badge on a sticky note', () => {
  const b = board([make('card', 'c'), make('note', 'n'), make('rectangle', 'r')]);
  let r = applyChip(b, ['c', 'n'], { kind: 'estimate', value: '8' });
  assert.equal(r.applied, 2);
  assert.equal(find(r.board, 'c').data!.points, 8);
  assert.equal(find(r.board, 'n').estimate, '8');
  r = applyChip(r.board, ['c'], { kind: 'estimate', value: 'L' });
  assert.equal(find(r.board, 'c').data!.size, 'L');
  assert.equal(find(r.board, 'c').data!.points, 8, 'a size chip keeps the points');
  // "?" and Clear remove a card's numeric estimate; "?" is kept on a sticky.
  r = applyChip(r.board, ['c', 'n'], { kind: 'estimate', value: '?' });
  assert.equal(find(r.board, 'c').data!.points, undefined);
  assert.equal(find(r.board, 'n').estimate, '?');
  r = applyChip(r.board, ['n'], { kind: 'estimate', value: '' });
  assert.ok(!('estimate' in find(r.board, 'n')));
  // Shapes do not take estimates.
  assert.throws(() => applyChip(b, ['r'], { kind: 'estimate', value: '1' }), /card or sticky note/);
  // The original board is unchanged (one immutable change per call).
  assert.equal(find(b, 'n').estimate, undefined);
});

test('F a person chip assigns cards and puts a person chip on sticky notes', () => {
  const b = board([make('card', 'c'), make('note', 'n')]);
  const r = applyChip(b, ['c', 'n'], { kind: 'person', name: 'Ada Lovelace' });
  assert.equal(find(r.board, 'c').data!.assignee, 'Ada Lovelace');
  assert.equal(find(r.board, 'n').assignee, 'Ada Lovelace');
  const cleared = removeChipMark(r.board, 'n', 'assignee');
  assert.ok(!('assignee' in find(cleared, 'n')));
  assert.equal(parseBoard(r.board).items[1]!.assignee, 'Ada Lovelace');
});

test('F locked objects refuse chips; unlocked ones in the same selection still take them', () => {
  const b = board([make('note', 'a', { locked: true }), make('note', 'b')]);
  assert.throws(() => applyChip(b, ['a'], { kind: 'estimate', value: '3' }), /locked/);
  const r = applyChip(b, ['a', 'b'], { kind: 'estimate', value: '3' });
  assert.equal(r.applied, 1);
  assert.equal(find(r.board, 'a').estimate, undefined);
  assert.equal(find(r.board, 'b').estimate, '3');
  const dotted = board([pile(), make('note', 'n', { locked: true, dots: [{ pile: 'pile', color: '#e8445a', n: 1 }] })]);
  assert.throws(() => removeChipMark(dotted, 'n', 'dot:pile'), /locked/);
  assert.throws(() => applyChip(dotted, ['n'], { kind: 'dot', pile: 'pile' }), /locked/);
});

test('F dots from a pile land on any object, the pile counts down, and a click returns one', () => {
  let b = board([pile('pile', 3), make('note', 'n'), make('ellipse', 'e'), make('frame', 'f')]);
  const dot: Chip = { kind: 'dot', pile: 'pile' };
  assert.equal(dotsLeft(b, find(b, 'pile')), 3);
  b = applyChip(b, ['n'], dot).board;
  b = applyChip(b, ['n'], dot).board;
  b = applyChip(b, ['e'], dot).board;
  assert.deepEqual(find(b, 'n').dots, [{ pile: 'pile', color: '#e8445a', n: 2 }]);
  assert.equal(dotsPlaced(b, 'pile'), 3);
  assert.equal(dotsLeft(b, find(b, 'pile')), 0);
  assert.throws(() => applyChip(b, ['f'], dot), /No dots left/);
  // Returning a dot makes it available again.
  b = removeChipMark(b, 'e', 'dot:pile');
  assert.ok(!('dots' in find(b, 'e')));
  assert.equal(dotsLeft(b, find(b, 'pile')), 1);
  // Several selected objects need one dot each.
  assert.throws(() => applyChip(b, ['e', 'f'], dot), /Only 1 dot is left/);
  // The pile itself and connectors do not take dots.
  assert.throws(() => applyChip(b, ['pile'], dot), /Drop the dot/);
  assert.ok(!acceptsChip(make('arrow', 'a'), dot));
  // A deleted pile cannot hand out dots.
  assert.throws(() => applyChip(board([make('note', 'x')]), ['x'], dot), /no longer on the board/);
  assert.doesNotThrow(() => parseBoard(b));
});

test('F returning all dots and recolouring a pile only touch that pile', () => {
  const other = { pile: 'other', color: '#4262ff', n: 1 };
  const b = board([
    pile(),
    make('note', 'n', { dots: [{ pile: 'pile', color: '#e8445a', n: 2 }, other] }),
    make('note', 'm', { dots: [{ pile: 'pile', color: '#e8445a', n: 1 }] }),
  ]);
  const recolored = recolorDots(b, 'pile', '#2c9f5b');
  assert.equal(find(recolored, 'n').dots![0]!.color, '#2c9f5b');
  assert.deepEqual(find(recolored, 'n').dots![1], other);
  const back = returnAllDots(b, 'pile');
  assert.deepEqual(find(back, 'n').dots, [other]);
  assert.ok(!('dots' in find(back, 'm')));
});

test('F chip fields are validated on load', () => {
  const ok = (extra: Partial<Item>, type: Parameters<typeof createItem>[0] = 'note') =>
    validateChipFields(make(type, 'i', extra));
  assert.doesNotThrow(() => ok({ estimate: '13', assignee: 'Sam', dots: [{ pile: 'p', color: '#112233', n: 4 }] }));
  assert.throws(() => ok({ estimate: '13' }, 'rectangle'), /estimate/);
  assert.throws(() => ok({ estimate: 'huge' }), /estimate/);
  assert.throws(() => ok({ assignee: ' padded ' }), /assignee/);
  assert.throws(() => ok({ dots: [] }), /dots/);
  assert.throws(() => ok({ dots: [{ pile: 'p', color: 'red', n: 1 }] }), /dots/);
  assert.throws(() => ok({ dots: [{ pile: 'p', color: '#112233', n: 0 }] }), /dots/);
  assert.throws(
    () =>
      ok({
        dots: [
          { pile: 'p', color: '#112233', n: 1 },
          { pile: 'p', color: '#112233', n: 1 },
        ],
      }),
    /dots/,
  );
  assert.throws(() => ok({ dots: [{ pile: 'p', color: '#112233', n: 1 }] }, 'arrow'), /dots/);
  // Widgets: palette scale and pile size.
  assert.throws(() => parseBoard(board([make('estimates', 'e', { data: { scale: 'fibonacci' } })])), /palette/);
  assert.throws(() => parseBoard(board([pile('p', 0)])), /1 to 99/);
  assert.doesNotThrow(() => parseBoard(board([make('estimates', 'e'), pile()])));
  // Older boards without chip fields load unchanged.
  const plain = board([make('note', 'n'), make('card', 'c')]);
  assert.deepEqual(parseBoard(plain).items, plain.items);
});
