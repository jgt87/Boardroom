import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  MIXED,
  boardSummary,
  clearLink,
  geometryOf,
  moveLayer,
  setFill,
  setGeometry,
  setHiddenFlag,
  setStyleField,
  setTextField,
  setTextSize,
  shared,
} from '../src/inspector-model.ts';

const box = (type: Item['type'], x: number, y: number, w = 100, h = 100): Item => ({ ...createItem(type, x, y), w, h });
const board = (...items: Item[]): Board => ({ ...newBoard(), items });

test('single geometry edits set exact values and respect minimum sizes', () => {
  const a = box('rectangle', 10, 20);
  let b = setGeometry(board(a), [a.id], 'x', 300);
  assert.deepEqual([b.items[0].x, b.items[0].y], [300, 20]);
  b = setGeometry(b, [a.id], 'w', 250);
  assert.equal(b.items[0].w, 250);
  b = setGeometry(b, [a.id], 'h', 5);
  assert.equal(b.items[0].h, 30, 'height clamps to 30');
  b = setGeometry(b, [a.id], 'w', 1);
  assert.equal(b.items[0].w, 40, 'width clamps to 40');
});

test('multiple selection moves and scales as one box, keeping relative layout', () => {
  const a = box('rectangle', 0, 0, 100, 100),
    c = box('ellipse', 200, 100, 100, 100),
    other = box('note', 1000, 1000);
  const start = board(a, c, other);
  assert.deepEqual(geometryOf(start, [a.id, c.id]), { x: 0, y: 0, w: 300, h: 200 });
  const moved = setGeometry(start, [a.id, c.id], 'x', 50);
  assert.deepEqual(
    moved.items.map(i => i.x),
    [50, 250, 1000],
  );
  const scaled = setGeometry(start, [a.id, c.id], 'w', 600);
  assert.deepEqual(
    scaled.items.slice(0, 2).map(i => [i.x, i.w]),
    [
      [0, 200],
      [400, 200],
    ],
  );
  assert.deepEqual(scaled.items[2], other, 'unselected objects untouched');
});

test('locked items are never modified, invalid values and no-ops return the same board', () => {
  const a = { ...box('rectangle', 0, 0), locked: true },
    c = box('rectangle', 300, 0);
  const b = board(a, c);
  assert.equal(setGeometry(b, [a.id], 'x', 99), b);
  assert.equal(setGeometry(b, [a.id, c.id], 'y', 99), b, 'a locked member blocks a group geometry edit');
  assert.equal(setFill(b, [a.id], '#ff0000'), b);
  assert.equal(setGeometry(b, [c.id], 'x', 300), b, 'same value is a no-op');
  assert.equal(setGeometry(b, [c.id], 'x', Infinity), b);
  assert.equal(setGeometry(b, [c.id], 'x', 2e7), b);
  assert.equal(setFill(b, [c.id], 'red'), b);
  assert.equal(setTextSize(b, [c.id], 200), b);
  const filled = setFill(b, [a.id, c.id], '#ff0000');
  assert.equal(filled.items[0], a, 'locked item kept by reference');
  assert.equal(filled.items[1].fill, '#ff0000');
});

test('mixed-value detection', () => {
  const a = box('rectangle', 0, 0),
    c = { ...box('rectangle', 0, 0), fill: '#000000' };
  assert.equal(
    shared([a, a], i => i.fill),
    a.fill,
  );
  assert.equal(
    shared([a, c], i => i.fill),
    MIXED,
  );
  assert.equal(
    shared([], i => i.fill),
    undefined,
  );
});

test('style, text size, layer, visibility and metadata helpers', () => {
  const shape = box('rectangle', 0, 0),
    note = box('note', 200, 0),
    img = { ...box('image', 400, 0), assetId: 'a' },
    target = box('frame', 0, 500, 600, 400);
  let b = board(shape, note, img, target);
  b = setStyleField(b, [shape.id, note.id], 'borderWidth', 4);
  assert.equal(b.items[0].style?.borderWidth, 4);
  assert.equal(b.items[1].style, undefined, 'border only applies to shapes');
  assert.equal(setStyleField(b, [shape.id], 'borderWidth', 30), b);
  assert.equal(setStyleField(b, [shape.id], 'borderStyle', 'wavy' as never), b);
  b = setTextSize(b, [shape.id, note.id], 24);
  assert.deepEqual(
    b.items.slice(0, 2).map(i => i.format?.fontSize),
    [24, 24],
  );
  assert.equal(setTextSize(b, [img.id], 24), b, 'images carry no text');
  b = moveLayer(b, shape.id, 1);
  assert.deepEqual(
    b.items.map(i => i.id),
    [note.id, shape.id, img.id, target.id],
  );
  assert.equal(moveLayer(b, target.id, 1), b, 'already front-most');
  b = setHiddenFlag(b, [note.id], true);
  assert.equal(b.items[0].hidden, true);
  b = setHiddenFlag(b, [note.id], false);
  assert.equal('hidden' in b.items[0], false);
  b = setTextField(b, img.id, 'alt', '  Logo  ', 1000);
  assert.equal(b.items.find(i => i.id === img.id)?.alt, 'Logo');
  assert.equal(setTextField(b, shape.id, 'alt', 'x', 1000), b, 'alt only on media');
  b = setTextField(b, shape.id, 'name', 'Header', 200);
  assert.equal(b.items.find(i => i.id === shape.id)?.name, 'Header');
  b = setTextField(b, shape.id, 'name', '', 200);
  assert.equal('name' in b.items.find(i => i.id === shape.id)!, false);
  b = { ...b, items: b.items.map(i => (i.id === shape.id ? { ...i, linkTo: target.id } : i)) };
  b = clearLink(b, shape.id);
  assert.equal(b.items.find(i => i.id === shape.id)?.linkTo, undefined);
  assert.equal(clearLink(b, shape.id), b);
});

test('board summary counts objects, frames and connectors', () => {
  const a = box('note', 0, 0),
    f = box('frame', 0, 0),
    line = { ...createItem('arrow', 0, 0), from: a.id };
  assert.deepEqual(boardSummary({ ...board(a, f, line), title: 'Plan' }), {
    title: 'Plan',
    objects: 3,
    frames: 1,
    connectors: 1,
  });
});
