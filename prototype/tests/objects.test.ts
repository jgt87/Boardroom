import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, removeItems, commit, undo, endpoints } from '../src/model.ts';
import type { Item, Board } from '../src/model.ts';
import { shapeKinds, shapePath, textBox, shapeContains, shapeEdge } from '../src/shapes.ts';
import {
  alignSelection,
  distributeSelection,
  canAlign,
  canDistribute,
  groupSelection,
  ungroupSelection,
  expandGroups,
  setLocked,
  editableIds,
  moveIds,
  duplicateItems,
} from '../src/arrange.ts';
import { translate, resizeItems, selectionBounds } from '../src/interactions.ts';
import { connectorGeometry } from '../src/connector-geometry.ts';

const box = (type: Item['type'], x: number, y: number, w = 100, h = 100): Item => ({ ...createItem(type, x, y), w, h });
const board = (...items: Item[]): Board => ({ ...newBoard(), items });

// Item 4 — borders
test('border settings persist independently of fill, old boards keep defaults, invalid values fail', () => {
  const shape = {
      ...box('rectangle', 0, 0),
      fill: '#a8cdff',
      style: { borderColor: '#ff0000', borderWidth: 4, borderStyle: 'dashed' as const, borderOpacity: 0.5 },
    },
    b = board(shape);
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
  assert.equal(parseBoard(board(box('ellipse', 0, 0))).items[0].style, undefined);
  for (const style of [
    { borderColor: 'red' },
    { borderWidth: 30 },
    { borderStyle: 'wavy' },
    { borderOpacity: 2 },
    null,
  ])
    assert.throws(() => parseBoard(board({ ...shape, style } as Item)));
});

// Item 5 — more shapes
test('every shape has finite geometry, an interior text box, and connector edges on its outline', () => {
  for (const kind of shapeKinds) {
    const item = createItem(kind, 10, 20);
    assert.ok(item.w > 0 && item.h > 0, kind);
    assert.ok(!/NaN|Infinity/.test(shapePath(kind, item.w, item.h)), kind);
    const t = textBox(kind, item.w, item.h);
    assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= item.w + 0.01 && t.y + t.h <= item.h + 0.01, kind);
    assert.ok(
      shapeContains(kind, item.w, item.h, { x: t.x + t.w / 2, y: t.y + t.h / 2 }),
      `${kind} text centre is inside`,
    );
    for (const toward of [
      { x: 1000, y: item.y + item.h / 2 },
      { x: item.x + item.w / 2, y: -1000 },
      { x: -1000, y: -1000 },
    ]) {
      const e = shapeEdge(kind, item, toward),
        local = { x: e.x - item.x, y: e.y - item.y };
      assert.ok(
        Number.isFinite(e.x) &&
          local.x >= -0.01 &&
          local.x <= item.w + 0.01 &&
          local.y >= -0.01 &&
          local.y <= item.h + 0.01,
        kind,
      );
    }
  }
  const tri = createItem('triangle', 0, 0),
    other = createItem('note', 600, -400),
    line = { ...createItem('arrow', 0, 0), from: tri.id, to: other.id },
    [a] = endpoints(line, [tri, other]);
  assert.ok(
    !shapeContains('triangle', tri.w, tri.h, { x: a.x + 3, y: a.y - 3 }) || a.y < tri.h,
    'attachment sits on the slanted edge',
  );
});
test('new shapes duplicate, resize, save and restore', () => {
  const items = shapeKinds.map((k, i) => ({ ...createItem(k, i * 300, 0), text: k }));
  let b = board(...items);
  b = duplicateItems(
    b,
    items.map(i => i.id),
  ).board;
  assert.equal(b.items.length, items.length * 2);
  b = resizeItems(b, [items[3].id], selectionBounds(b.items, [items[3].id])!, { x: 0, y: 0, w: 400, h: 300 });
  assert.equal(b.items[3].w, 400);
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
});

// Items 6–7 — alignment and distribution
test('alignment moves only selected objects to the selection bounds in one change', () => {
  const a = box('rectangle', 0, 0, 100, 50),
    b = box('rectangle', 300, 200, 60, 80),
    c = box('note', 800, 800),
    outside = box('ellipse', -500, -500),
    b0 = board(a, b, c, outside);
  const left = alignSelection(b0, [a.id, b.id, c.id], 'left');
  assert.deepEqual(
    left.items.slice(0, 3).map(i => i.x),
    [0, 0, 0],
  );
  assert.deepEqual(left.items[3], outside);
  const right = alignSelection(b0, [a.id, b.id, c.id], 'right');
  assert.deepEqual(
    right.items.slice(0, 3).map(i => i.x + i.w),
    [900, 900, 900],
  );
  const middle = alignSelection(b0, [a.id, b.id], 'middle');
  assert.deepEqual(
    middle.items.slice(0, 2).map(i => i.y + i.h / 2),
    [140, 140],
  );
  const center = alignSelection(b0, [a.id, b.id], 'center');
  assert.deepEqual(
    center.items.slice(0, 2).map(i => i.x + i.w / 2),
    [180, 180],
  );
  let h = { past: [], current: b0, future: [] } as { past: Board[]; current: Board; future: Board[] };
  h = commit(h, alignSelection(h.current, [a.id, b.id, c.id], 'bottom'));
  assert.deepEqual(undo(h).current, b0);
  assert.equal(canAlign(b0, [a.id]), false);
});
test('alignment carries frame contents, leaves attached connectors attached, and skips locked objects', () => {
  const frame = box('frame', 0, 0, 400, 300),
    inner = box('note', 50, 50),
    loose = box('rectangle', 600, 500),
    locked = { ...box('ellipse', 900, 900), locked: true },
    line = { ...createItem('arrow', 0, 0), from: inner.id, to: loose.id };
  const b = alignSelection(board(frame, inner, loose, locked, line), [frame.id, loose.id, locked.id, line.id], 'top');
  assert.equal(b.items[0].y, 0);
  assert.equal(b.items[2].y, 0);
  assert.deepEqual(b.items[3], locked);
  assert.equal(b.items[1].y, 50);
  assert.equal(b.items[4].from, inner.id);
});
test('distribution equalises gaps for varied sizes and keeps the outer objects fixed', () => {
  const a = box('rectangle', 0, 0, 100, 50),
    b = box('rectangle', 150, 0, 20, 50),
    c = box('rectangle', 170, 0, 200, 50),
    d = box('rectangle', 900, 0, 100, 50),
    b0 = board(c, a, d, b);
  const out = distributeSelection(b0, [a.id, b.id, c.id, d.id], 'horizontal'),
    get = (id: string) => out.items.find(i => i.id === id)!;
  const order = [a, b, c, d].map(i => get(i.id)),
    gaps = order.slice(1).map((i, k) => i.x - (order[k].x + order[k].w));
  assert.equal(get(a.id).x, 0);
  assert.equal(get(d.id).x, 900);
  assert.ok(gaps.every(g => Math.abs(g - gaps[0]) < 1e-9));
  assert.equal(canDistribute(b0, [a.id, b.id]), false);
  assert.equal(distributeSelection(b0, [a.id, b.id], 'vertical'), b0);
  const v = distributeSelection(
    board(box('note', 0, 0), box('note', 0, 90, 50, 10), box('note', 0, 500)),
    [],
    'vertical',
  );
  assert.ok(v);
});

// Item 8 — groups
test('groups select, move, resize and duplicate as one unit and ungroup one level at a time', () => {
  const a = box('note', 0, 0),
    b = box('note', 200, 0),
    c = box('note', 400, 0),
    d = box('note', 600, 0);
  let b0 = board(a, b, c, d);
  const inner = groupSelection(b0, [a.id, b.id]);
  b0 = inner.board;
  const outer = groupSelection(b0, [a.id, c.id]);
  b0 = outer.board;
  assert.deepEqual(new Set(expandGroups(b0, [b.id])), new Set([a.id, b.id, c.id]));
  const moved = translate(b0, expandGroups(b0, [a.id]), { x: 10, y: 0 });
  assert.deepEqual(
    moved.items.map(i => i.x),
    [10, 210, 410, 600],
  );
  const dup = duplicateItems(b0, expandGroups(b0, [a.id]));
  assert.equal(dup.board.groups?.length, 4);
  assert.deepEqual(new Set(expandGroups(dup.board, [dup.ids[0]])), new Set(dup.ids));
  const once = ungroupSelection(b0, [a.id]);
  assert.deepEqual(new Set(expandGroups(once, [a.id])), new Set([a.id, b.id]));
  assert.deepEqual(expandGroups(once, [c.id]), [c.id]);
  assert.deepEqual(
    once.items.map(i => [i.x, i.y]),
    b0.items.map(i => [i.x, i.y]),
  );
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b0))), b0);
  assert.throws(() => groupSelection(b0, [a.id]));
  assert.throws(() => ungroupSelection(board(d), [d.id]));
  const removed = removeItems(once, [a.id, b.id]);
  assert.equal(removed.groups, undefined);
  assert.throws(() => parseBoard({ ...b0, groups: [{ id: 'x', parent: 'x' }] }));
  assert.throws(() => parseBoard({ ...b0, items: [{ ...a, group: 'missing' }] }));
});
test('grouped connectors keep their attachments when the group moves', () => {
  const a = box('rectangle', 0, 0),
    b = box('rectangle', 300, 0),
    line = { ...createItem('arrow', 0, 0), from: a.id, to: b.id };
  let b0 = board(a, b, line);
  b0 = groupSelection(b0, [a.id, b.id, line.id]).board;
  const moved = translate(b0, expandGroups(b0, [a.id]), { x: 0, y: 40 });
  assert.equal(moved.items[2].from, a.id);
  assert.equal(connectorGeometry(moved.items[2], moved.items).start.y, 90);
});

// Item 9 — locking
test('locked objects (and groups containing them) cannot be moved, edited or deleted by ordinary editing', () => {
  const a = box('note', 0, 0),
    b = box('note', 200, 0),
    c = box('note', 400, 0);
  let b0 = board(a, b, c);
  b0 = groupSelection(b0, [b.id, c.id]).board;
  b0 = setLocked(b0, [a.id], true);
  assert.deepEqual(editableIds(b0, [a.id, b.id]).sort(), [b.id, c.id].sort());
  const locked = setLocked(b0, [b.id], true);
  assert.equal(locked.items[2].locked, true, 'whole group locks');
  assert.deepEqual(editableIds(locked, [b.id]), []);
  const frame = box('frame', -50, -50, 800, 300);
  assert.deepEqual(moveIds(board(frame, ...b0.items), [frame.id]).sort(), [frame.id, b.id, c.id].sort());
  assert.throws(() => groupSelection(b0, [a.id, b.id]));
  let h = { past: [], current: b0, future: [] } as { past: Board[]; current: Board; future: Board[] };
  h = commit(h, setLocked(h.current, [a.id], false));
  assert.equal(h.current.items[0].locked, undefined);
  assert.equal(undo(h).current.items[0].locked, true);
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b0))), b0);
  assert.throws(() => parseBoard(board({ ...a, locked: 'yes' } as unknown as Item)));
  assert.equal(duplicateItems(b0, [a.id]).board.items.at(-1)!.locked, undefined);
});
