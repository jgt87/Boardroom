import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, endpoints, commit, undo, redo } from '../src/model.ts';
import {
  frameMoveIds,
  translate,
  resizeBounds,
  resizeItems,
  selectWithin,
  selectionBounds,
  snapMove,
} from '../src/interactions.ts';
test('dragging an attached connector alone detaches and visibly moves both endpoints', () => {
  const a = createItem('note', 0, 0),
    b = createItem('note', 400, 50),
    arrow = { ...createItem('arrow', 0, 0), from: a.id, to: b.id },
    board = { ...newBoard(), items: [a, b, arrow] },
    before = endpoints(arrow, board.items),
    moved = translate(board, [arrow.id], { x: 30, y: 40 }),
    line = moved.items[2];
  assert.equal(line.from, undefined);
  assert.equal(line.to, undefined);
  assert.deepEqual(
    endpoints(line, moved.items),
    before.map(p => ({ x: p.x + 30, y: p.y + 40 })),
  );
  assert.equal(board.items[2].from, a.id);
  assert.deepEqual(moved.items[0], a);
});
test('moving a frame carries nested contents once, leaves overlaps and outsiders alone', () => {
  const frame = { ...createItem('frame', 0, 0), w: 600, h: 500 },
    nested = { ...createItem('frame', 50, 50), w: 400, h: 350 },
    note = createItem('note', 100, 100),
    overlap = createItem('note', 550, 100),
    outside = createItem('note', 900, 0);
  const board = { ...newBoard(), items: [frame, nested, note, overlap, outside] },
    ids = frameMoveIds(board.items, [frame.id, nested.id, note.id]);
  assert.equal(ids.length, 3);
  const moved = translate(board, ids, { x: 80, y: -20 });
  assert.equal(moved.items[2].x, 180);
  assert.equal(moved.items[3].x, 550);
  assert.equal(board.items[0].x, 0);
  const h = commit({ past: [], current: board, future: [] }, moved);
  assert.deepEqual(undo(h).current, board);
  assert.deepEqual(redo(undo(h)).current, moved);
});
test('frame movement keeps internal connector attached and external endpoint stationary', () => {
  const frame = { ...createItem('frame', 0, 0), w: 600, h: 500 },
    a = createItem('note', 50, 50),
    b = createItem('note', 330, 100),
    outside = createItem('note', 800, 0);
  const inside = { ...createItem('arrow', 0, 0), from: a.id, to: b.id },
    external = { ...createItem('arrow', 0, 0), from: b.id, to: outside.id };
  const board = { ...newBoard(), items: [frame, a, b, outside, inside, external] },
    before = endpoints(external, board.items)[1];
  const moved = translate(board, frameMoveIds(board.items, [frame.id]), { x: 100, y: 0 });
  assert.ok(frameMoveIds(board.items, [frame.id]).includes(inside.id));
  assert.ok(!frameMoveIds(board.items, [frame.id]).includes(external.id));
  assert.equal(endpoints(inside, moved.items)[0].x, endpoints(inside, board.items)[0].x + 100);
  assert.equal(endpoints(external, moved.items)[1].x, before.x);
  assert.deepEqual(
    moved.items.find(i => i.id === outside.id),
    outside,
  );
});
test('resizing a frame alone changes its bounds without scaling contents', () => {
  const frame = createItem('frame', 100, 100),
    note = createItem('note', 150, 150),
    board = { ...newBoard(), items: [frame, note] },
    before = selectionBounds(board.items, [frame.id])!;
  const resized = resizeItems(board, [frame.id], before, resizeBounds(before, 'nw', { x: -50, y: -30 }));
  assert.equal(resized.items[0].x, 50);
  assert.equal(resized.items[0].w, 700);
  assert.deepEqual(resized.items[1], note);
});
test('group resizing scales positions and pen points, keeps corner anchor and proportions', () => {
  const a = { ...createItem('note', 0, 0), w: 100, h: 100 },
    pen = {
      ...createItem('pen', 200, 0),
      w: 100,
      h: 100,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
    };
  const board = { ...newBoard(), items: [a, pen] },
    ids = board.items.map(i => i.id),
    before = selectionBounds(board.items, ids)!,
    after = resizeBounds(before, 'se', { x: 300, y: 0 }, true),
    resized = resizeItems(board, ids, before, after);
  assert.deepEqual(after, { x: 0, y: 0, w: 600, h: 200 });
  assert.equal(resized.items[1].x, 400);
  assert.deepEqual(resized.items[1].points![1], { x: 200, y: 200 });
  assert.deepEqual(pen.points[1], { x: 100, y: 100 });
});
test('resize edges cannot invert; northwest Shift keeps opposite corner fixed', () => {
  const b = { x: 100, y: 200, w: 200, h: 100 };
  const clamped = resizeBounds(b, 'w', { x: 900, y: 0 });
  assert.deepEqual(clamped, { x: 260, y: 200, w: 40, h: 100 });
  const aspect = resizeBounds(b, 'nw', { x: -100, y: 0 }, true);
  assert.equal(aspect.x + aspect.w, 300);
  assert.equal(aspect.y + aspect.h, 300);
  assert.equal(aspect.w / aspect.h, 2);
});
test('snapping uses edge and center distances, Alt bypass and Shift axis constraint', () => {
  const a = { ...createItem('note', 0, 0), w: 100, h: 100 },
    b = { ...createItem('note', 300, 200), w: 100, h: 100 },
    board = { ...newBoard(), items: [a, b] };
  const snapped = snapMove(board, [a.id], { x: 197, y: 99 }, 6);
  assert.deepEqual(snapped.delta, { x: 200, y: 100 });
  assert.equal(snapped.guides.length, 2);
  assert.deepEqual(snapMove(board, [a.id], { x: 197, y: 99 }, 6, true).delta, { x: 197, y: 99 });
  assert.deepEqual(snapMove(board, [a.id], { x: 197, y: 99 }, 6, false, true).delta, { x: 200, y: 0 });
  assert.equal(snapMove(board, [a.id], { x: 190, y: 90 }, 3).guides.length, 0);
});
test('marquee uses actual connector geometry including signed arrow dimensions', () => {
  const a = createItem('note', 50, 50),
    b = createItem('note', 400, 50),
    arrow = { ...createItem('arrow', 0, 0), from: a.id, to: b.id };
  assert.deepEqual(selectWithin([a, b, arrow], { x: 40, y: 40, w: 600, h: 250 }), [a.id, b.id, arrow.id]);
  const backwards = { ...createItem('arrow', 300, 200), w: -100, h: -50 };
  assert.deepEqual(selectWithin([backwards], { x: 190, y: 140, w: 120, h: 70 }), [backwards.id]);
});
