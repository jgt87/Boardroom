import { applyMindBounds, mindViewport } from '../src/mindmap-bounds.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import { mindLayout, manualMindNodes, moveMindBranch, mindDropTarget } from '../src/mindmap-style.ts';
const nodes = [
  { id: 'root', parent: null, text: 'Root' },
  { id: 'a', parent: 'root', text: 'A' },
  { id: 'b', parent: 'root', text: 'B' },
  { id: 'c', parent: 'a', text: 'C' },
];
test('manual positions move whole branches without changing topology or auto-layout positions', () => {
  const before = manualMindNodes(nodes),
    next = moveMindBranch(before, 'a', -50, 80);
  for (const id of ['a', 'c']) {
    assert.equal(next.find(n => n.id === id)!.position!.x, before.find(n => n.id === id)!.position!.x - 50);
    assert.equal(next.find(n => n.id === id)!.parent, before.find(n => n.id === id)!.parent);
  }
  assert.deepEqual(mindLayout(next), mindLayout(nodes));
  assert.notDeepEqual(mindLayout(next, false), mindLayout(nodes));
  parseBoard({ ...newBoard(), items: [{ ...createItem('mindmap', 0, 0), nodes: next, data: { autoLayout: false } }] });
});
test('branch targets reject self and descendants, and manual coordinate bounds survive imports', () => {
  const positions = mindLayout(nodes);
  const child = positions.get('c')!;
  assert.equal(mindDropTarget(nodes, 'a', { x: child.x + 10, y: child.y + 10 }, positions), null);
  const target = positions.get('b')!;
  assert.equal(mindDropTarget(nodes, 'a', { x: target.x + 10, y: target.y + 10 }, positions), 'b');
  const manual = manualMindNodes(nodes);
  assert.equal(moveMindBranch(manual, 'a', 1e6, 0), manual);
  assert.throws(() =>
    parseBoard({
      ...newBoard(),
      items: [{ ...createItem('mindmap', 0, 0), nodes: [{ ...nodes[0], position: { x: Infinity, y: 0 } }] }],
    }),
  );
});

test('manual map bounds grow left and right while untouched topic world positions stay fixed', () => {
  const item = {
    ...createItem('mindmap', 100, 100),
    id: 'm',
    nodes: manualMindNodes(nodes),
    data: { autoLayout: false },
  };
  const board = { ...newBoard(), items: [item] };
  const initial = applyMindBounds(board, board);
  const old = initial.items[0],
    view = mindViewport(old),
    scale = old.w / view.w;
  const world = (i: typeof old, id: string) => {
    const v = mindViewport(i),
      p = mindLayout(i.nodes!, false).get(id)!;
    return { x: i.x + ((p.x - v.x) * i.w) / v.w, y: i.y + ((p.y - v.y) * i.h) / v.h };
  };
  const moved = applyMindBounds(
    { ...initial, items: [{ ...old, nodes: moveMindBranch(old.nodes!, 'a', -700, 400) }] },
    initial,
  );
  assert.deepEqual(world(moved.items[0], 'b'), world(old, 'b'));
  assert.ok(moved.items[0].w > old.w);
  assert.equal(moved.items[0].w / mindViewport(moved.items[0]).w, scale);
  parseBoard(moved);
  assert.deepEqual(applyMindBounds(moved, moved), moved);
  const invalid = structuredClone(moved);
  invalid.items[0].data!.manualViewport.w = 0;
  assert.throws(() => parseBoard(invalid));
});
