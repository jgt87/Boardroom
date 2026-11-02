import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, endpoints, commit, undo, redo } from '../src/model.ts';
import { connectorGeometry, moveConnectorEndpoint, setConnectorConnections } from '../src/connector-geometry.ts';
test('straight, elbow and curved connectors route attached objects and follow movement', () => {
  const a = { ...createItem('rectangle', 0, 0), w: 100, h: 100 },
    b = { ...createItem('ellipse', 400, 200), w: 100, h: 100 },
    line = { ...createItem('arrow', 0, 0), from: a.id, to: b.id };
  assert.match(connectorGeometry(line, [a, b]).path, / L/);
  for (const path of ['elbow', 'curved'] as const) {
    const routed = { ...line, connector: { path } },
      g = connectorGeometry(routed, [a, b]);
    assert.deepEqual(g.start, { x: 100, y: 50 });
    assert.deepEqual(g.end, { x: 400, y: 250 });
    assert.ok(!/NaN|Infinity/.test(g.path));
    assert.match(g.path, path === 'elbow' ? / H.* V/ : / C/);
    assert.notEqual(connectorGeometry(routed, [a, { ...b, x: 600 }]).path, g.path);
  }
});
test('vertical, reverse and coincident free routes remain finite', () => {
  for (const path of ['straight', 'elbow', 'curved'] as const)
    for (const [w, h] of [
      [0, 200],
      [-200, -100],
      [0, 0],
    ]) {
      const line = { ...createItem('arrow', 30, 40), w, h, connector: { path } },
        g = connectorGeometry(line, []);
      assert.ok(!/NaN|Infinity/.test(g.path));
      assert.deepEqual(g.end, { x: 30 + w, y: 40 + h });
    }
});
test('routed segments leave the same face chosen by attached anchors', () => {
  const a = { ...createItem('rectangle', 0, 0), w: 300, h: 100 },
    b = { ...createItem('rectangle', 400, 300), w: 300, h: 100 },
    line = { ...createItem('arrow', 0, 0), from: a.id, to: b.id, connector: { path: 'elbow' as const } },
    g = connectorGeometry(line, [a, b]);
  assert.deepEqual(g.start, { x: 300, y: 50 });
  assert.match(g.path, /^M300,50 H/);
});
test('connector styling and labels persist and invalid imported styles fail', () => {
  const line = {
      ...createItem('arrow', 0, 0),
      text: 'Approved',
      fill: '#4262ff',
      connector: {
        path: 'curved' as const,
        width: 4,
        dash: 'dashed' as const,
        startHead: 'circle' as const,
        endHead: 'open' as const,
      },
    },
    board = { ...newBoard(), items: [line] };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))), board);
  for (const connector of [
    null,
    { path: 'unknown' },
    { width: Infinity },
    { width: 0 },
    { width: 13 },
    { dash: 'bad' },
    { endHead: 'javascript' },
  ])
    assert.throws(() => parseBoard({ ...board, items: [{ ...line, connector }] }));
  assert.equal(parseBoard({ ...newBoard(), items: [createItem('arrow', 0, 0)] }).items[0].connector, undefined);
});
test('endpoint drag attaches, follows the target and detaches with Alt semantics', () => {
  const a = createItem('note', 0, 0),
    b = createItem('note', 400, 200),
    line = { ...createItem('arrow', 0, 0), x: 210, y: 105, w: 150, h: 0, from: a.id },
    board = { ...newBoard(), items: [a, b, line] };
  const attached = moveConnectorEndpoint(board, line.id, 'end', { x: 450, y: 250 }, 12),
    next = attached.items[2];
  assert.equal(next.from, a.id);
  assert.equal(next.to, b.id);
  assert.equal(board.items[2].to, undefined);
  const shifted = attached.items.map(i => (i.id === b.id ? { ...i, x: i.x + 100 } : i));
  assert.notDeepEqual(endpoints(next, shifted), endpoints(next, attached.items));
  const free = moveConnectorEndpoint(attached, line.id, 'end', { x: 450, y: 250 }, 12, false).items[2];
  assert.equal(free.to, undefined);
  assert.equal(free.from, a.id);
  assert.deepEqual(endpoints(free, [a, b, free])[1], { x: 450, y: 250 });
  const h = commit({ past: [], current: board, future: [] }, attached);
  assert.deepEqual(undo(h).current, board);
  assert.equal(redo(undo(h)).current.items[2].to, b.id);
});
test('endpoint dragging preserves the stationary free point and permits a self-loop', () => {
  const a = createItem('rectangle', 100, 100),
    line = { ...createItem('arrow', 0, 0), x: 25, y: 35, w: 200, h: 100, to: a.id },
    board = { ...newBoard(), items: [a, line] },
    original = endpoints(line, board.items)[1];
  const moved = moveConnectorEndpoint(board, line.id, 'start', { x: 500, y: 600 }, 0, false).items[1];
  assert.deepEqual({ x: moved.x, y: moved.y }, { x: 500, y: 600 });
  assert.equal(moved.to, a.id);
  const self = moveConnectorEndpoint(board, line.id, 'start', { x: 150, y: 150 }).items[1];
  assert.equal(self.from, a.id);
  assert.equal(self.to, a.id);
  assert.equal(original.x > 0, true);
});
test('keyboard connection editor updates both bindings atomically and validates targets', () => {
  const a = createItem('note', 0, 0),
    b = createItem('note', 500, 0),
    line = { ...createItem('arrow', 0, 0), from: a.id, to: b.id },
    board = { ...newBoard(), items: [a, b, line] };
  const changed = setConnectorConnections(board, line.id, b.id, a.id, 'Reversed');
  assert.equal(changed.items[2].from, b.id);
  assert.equal(changed.items[2].to, a.id);
  assert.equal(changed.items[2].text, 'Reversed');
  const loop = setConnectorConnections(board, line.id, a.id, a.id, '');
  assert.equal(loop.items[2].from, loop.items[2].to);
  assert.deepEqual([loop.items[2].connector?.startSide, loop.items[2].connector?.endSide], ['right', 'top']);
  assert.throws(() => setConnectorConnections(board, line.id, 'missing', b.id, ''));
  assert.throws(() => setConnectorConnections(board, line.id, a.id, b.id, 'x'.repeat(201)));
  const free = setConnectorConnections(board, line.id, '', '', line.text);
  assert.deepEqual(endpoints(free.items[2], free.items), endpoints(line, board.items));
});
