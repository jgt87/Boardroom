import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, edge, sideAnchor, endpoints } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  itemBounds,
  selectionBounds,
  selectWithin,
  resizeBounds,
  resizeRotated,
  rotateItems,
  rotationDelta,
  setRotation,
} from '../src/interactions.ts';
import {
  normalizeRotation,
  isValidRotation,
  rotatedBounds,
  rotatePoint,
  pointInBox,
  snapAngle,
  handleAngle,
  canRotate,
  stripRotation,
} from '../src/rotation.ts';
import { shapePath, cornerRadius } from '../src/shapes.ts';
import { setStyleField, mergeStyle } from '../src/inspector-model.ts';

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const boardOf = (...items: Item[]): Board => ({ ...newBoard(), items });
const rect = (x: number, y: number, w: number, h: number, rotation?: number): Item => ({
  ...createItem('rectangle', x, y),
  w,
  h,
  ...(rotation === undefined ? {} : { rotation }),
});

test('rotation normalises into [0, 360) and validates', () => {
  assert.equal(normalizeRotation(370), 10);
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(360), 0);
  assert.equal(normalizeRotation(-0), 0);
  assert.equal(normalizeRotation(359.999), 0);
  assert.equal(normalizeRotation(Number.NaN), 0);
  assert.equal(normalizeRotation(12.3456), 12.35);
  assert.ok(isValidRotation(0) && isValidRotation(359.5));
  assert.ok(!isValidRotation(360) && !isValidRotation(-1) && !isValidRotation('10') && !isValidRotation(Infinity));
  assert.equal(snapAngle(22), 15);
  assert.equal(snapAngle(23), 30);
  assert.equal(snapAngle(-8), -15);
});

test('parseBoard accepts optional rotation and rejects invalid or unrotatable ones', () => {
  const note = { ...createItem('note', 0, 0), rotation: 45 };
  assert.equal(parseBoard(boardOf(note)).items[0].rotation, 45);
  assert.equal(parseBoard(boardOf(createItem('note', 0, 0))).items[0].rotation, undefined);
  assert.throws(() => parseBoard(boardOf({ ...note, rotation: 360 })), /rotation/i);
  assert.throws(() => parseBoard(boardOf({ ...note, rotation: -5 })), /rotation/i);
  assert.throws(() => parseBoard(boardOf({ ...note, rotation: '45' as unknown as number })), /rotation/i);
  assert.throws(() => parseBoard(boardOf({ ...createItem('frame', 0, 0), rotation: 10 })), /rotation/i);
  assert.ok(!canRotate({ type: 'frame' }) && !canRotate({ type: 'arrow' }) && canRotate({ type: 'image' }));
  const stripped = stripRotation(boardOf({ ...createItem('frame', 0, 0), rotation: 10 }, note));
  assert.equal(stripped.items[0].rotation, undefined);
  assert.equal(stripped.items[1].rotation, 45);
  const untouched = boardOf(note);
  assert.equal(stripRotation(untouched), untouched);
});

test('rotated bounds are the axis-aligned box around the turned object', () => {
  const b = rotatedBounds({ x: 0, y: 0, w: 200, h: 100 }, 90);
  close(b.x, 50);
  close(b.y, -50);
  close(b.w, 100);
  close(b.h, 200);
  const d = rotatedBounds({ x: 0, y: 0, w: 100, h: 100 }, 45);
  close(d.w, Math.SQRT2 * 100);
  close(d.x, 50 - (Math.SQRT2 * 100) / 2);
  const item = rect(0, 0, 200, 100, 90);
  assert.deepEqual(itemBounds(item, [item]), b);
  assert.deepEqual(itemBounds(rect(0, 0, 200, 100), []), { x: 0, y: 0, w: 200, h: 100 });
  const sb = selectionBounds([item], [item.id])!;
  close(sb.h, 200);
  // Marquee uses the rotated box: a tall rotated object no longer fits a short marquee.
  assert.deepEqual(selectWithin([item], { x: -10, y: -10, w: 220, h: 120 }), []);
  assert.deepEqual(selectWithin([item], { x: 40, y: -60, w: 120, h: 220 }), [item.id]);
});

test('hit tests and connector edges follow the rotated outline', () => {
  const item = rect(0, 0, 200, 40, 90); // centre (100, 20); now 40 wide and 200 tall
  assert.ok(pointInBox(item, { x: 100, y: 100 }));
  assert.ok(!pointInBox(item, { x: 180, y: 20 }));
  assert.ok(pointInBox(item, { x: 125, y: 20 }, 10));
  const right = edge(item, { x: 500, y: 20 });
  close(right.x, 120);
  close(right.y, 20);
  const below = edge(item, { x: 100, y: 500 });
  close(below.x, 100);
  close(below.y, 120);
  // The object's own top face turns with it: after 90 degrees it faces right.
  const top = sideAnchor(item, 'top');
  close(top.x, 120);
  close(top.y, 20);
  const other = createItem('note', 400, -80);
  const arrow = { ...createItem('arrow', 0, 0), from: item.id, to: other.id };
  const [a] = endpoints(arrow, [item, other, arrow]);
  assert.ok(pointInBox(item, a, 0.01), 'connector start sits on the rotated outline');
});

test('rotating a single object turns it in place', () => {
  const a = rect(0, 0, 100, 50);
  const next = rotateItems(boardOf(a), [a.id], 30, { x: 50, y: 25 });
  assert.equal(next.items[0].rotation, 30);
  close(next.items[0].x, 0);
  close(next.items[0].y, 0);
  const back = rotateItems(next, [a.id], -30, { x: 50, y: 25 });
  assert.equal(back.items[0].rotation, undefined);
});

test('rotating a multi-selection orbits centres around the group centre', () => {
  const a = rect(0, 0, 100, 100),
    b = rect(200, 0, 100, 100),
    frame = createItem('frame', 400, 400),
    pivot = { x: 150, y: 50 };
  const next = rotateItems(boardOf(a, b, frame), [a.id, b.id, frame.id], 90, pivot);
  const [na, nb, nf] = next.items;
  close(na.x + 50, 150);
  close(na.y + 50, -50);
  close(nb.x + 50, 150);
  close(nb.y + 50, 150);
  assert.equal(na.rotation, 90);
  assert.equal(nb.rotation, 90);
  assert.equal(nf.rotation, undefined, 'frames orbit but never rotate');
  const fc = rotatePoint({ x: 400 + frame.w / 2, y: 400 + frame.h / 2 }, pivot, 90);
  close(nf.x + nf.w / 2, fc.x);
  // A free connector turns with the selection.
  const line = { ...createItem('arrow', 0, 0), w: 100, h: 0 };
  const turned = rotateItems(boardOf(line), [line.id], 90, { x: 0, y: 0 }).items[0];
  close(turned.x, 0);
  close(turned.w, 0, 1e-9);
  close(turned.h, 100);
});

test('rotation snapping and handle angles', () => {
  close(handleAngle({ x: 0, y: 0 }, { x: 0, y: -10 }), 0);
  close(handleAngle({ x: 0, y: 0 }, { x: 10, y: 0 }), 90);
  assert.equal(rotationDelta(22, false, 0), 22);
  assert.equal(rotationDelta(22, true, 0), 15);
  assert.equal(10 + rotationDelta(10, true, 10), 15, 'single objects land on a 15 degree multiple');
  assert.equal(rotationDelta(37, true, null), 30, 'groups turn in 15 degree steps');
});

test('setRotation sets an absolute angle and skips unrotatable kinds', () => {
  const a = rect(0, 0, 100, 50),
    f = createItem('frame', 0, 0);
  const next = setRotation(boardOf(a, f), [a.id, f.id], -45);
  assert.equal(next.items[0].rotation, 315);
  assert.equal(next.items[1].rotation, undefined);
  assert.equal(setRotation(next, [a.id], 0).items[0].rotation, undefined);
});

test('Alt resize grows from the centre', () => {
  const b = { x: 100, y: 100, w: 200, h: 100 };
  assert.deepEqual(resizeBounds(b, 'e', { x: 20, y: 0 }, false, true), { x: 80, y: 100, w: 240, h: 100 });
  assert.deepEqual(resizeBounds(b, 'nw', { x: -10, y: -10 }, false, true), { x: 90, y: 90, w: 220, h: 120 });
  const aspect = resizeBounds(b, 'se', { x: 100, y: 0 }, true, true);
  close(aspect.w / aspect.h, 2);
  close(aspect.x + aspect.w / 2, 200);
  close(aspect.y + aspect.h / 2, 150);
  // Shrinking stops at the minimum size and stays centred.
  const small = resizeBounds(b, 'e', { x: -500, y: 0 }, false, true);
  assert.equal(small.w, 40);
  close(small.x + small.w / 2, 200);
  // Without Alt the old behaviour is unchanged.
  assert.deepEqual(resizeBounds(b, 'e', { x: 20, y: 0 }), { x: 100, y: 100, w: 220, h: 100 });
});

test('a rotated object resizes along its own axes and keeps the opposite side fixed', () => {
  const item = rect(0, 0, 200, 100, 90); // local east side now points down
  const next = resizeRotated(item, 'e', { x: 0, y: 50 });
  close(next.w, 250);
  close(next.h, 100);
  // The local west side (screen top) stays where it was.
  const westBefore = rotatePoint({ x: 0, y: 50 }, { x: 100, y: 50 }, 90),
    westAfter = rotatePoint({ x: next.x, y: next.y + 50 }, { x: next.x + next.w / 2, y: next.y + next.h / 2 }, 90);
  close(westAfter.x, westBefore.x);
  close(westAfter.y, westBefore.y);
  const centred = resizeRotated(item, 'e', { x: 0, y: 50 }, false, true);
  close(centred.w, 300);
  close(centred.x + centred.w / 2, 100);
  close(centred.y + centred.h / 2, 50);
});

test('corner radius is validated, capped and drawn', () => {
  const shape = { ...createItem('rectangle', 0, 0), style: { radius: 30 } };
  assert.equal(parseBoard(boardOf(shape)).items[0].style?.radius, 30);
  assert.throws(() => parseBoard(boardOf({ ...shape, style: { radius: -1 } })), /border/i);
  assert.throws(() => parseBoard(boardOf({ ...shape, style: { radius: 501 } })), /border/i);
  assert.equal(cornerRadius('rectangle', 100, 40), 4);
  assert.equal(cornerRadius('roundrect', 100, 40), 20);
  assert.equal(cornerRadius('rectangle', 100, 40, 80), 20);
  assert.match(shapePath('roundrect', 100, 40, 10), /^M10,0 H90 A10,10/);
  assert.match(shapePath('roundrect', 100, 40), /^M10,0/, 'default roundrect radius is unchanged');
  assert.match(shapePath('rectangle', 100, 40, 0), /^M0,0 H100/);
  const board = boardOf(createItem('rectangle', 0, 0), createItem('note', 0, 0));
  const next = setStyleField(
    board,
    board.items.map(i => i.id),
    'radius',
    12,
  );
  assert.equal(next.items[0].style?.radius, 12);
  assert.equal(next.items[1].style, undefined);
  assert.equal(setStyleField(board, [board.items[0].id], 'radius', 9999), board);
});

test('images take a border, a radius and a circle crop', () => {
  const image = { ...createItem('image', 0, 0), assetId: 'a1', style: { borderWidth: 3, mask: 'circle' as const } };
  assert.equal(parseBoard(boardOf(image)).items[0].style?.mask, 'circle');
  assert.throws(() => parseBoard(boardOf({ ...image, style: { mask: 'blob' as unknown as 'circle' } })), /border/i);
  const board = boardOf({ ...createItem('image', 0, 0), assetId: 'a1' });
  const id = board.items[0].id;
  const circled = setStyleField(board, [id], 'mask', 'circle');
  assert.equal(circled.items[0].style?.mask, 'circle');
  const plain = setStyleField(circled, [id], 'mask', undefined);
  assert.equal(plain.items[0].style, undefined, 'removing the only style key drops the style');
  const bordered = setStyleField(board, [id], 'borderWidth', 4);
  assert.equal(bordered.items[0].style?.borderWidth, 4);
  assert.deepEqual(mergeStyle({ radius: 4, mask: 'circle' }, { mask: undefined }), { radius: 4 });
});
