import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, commit, undo, redo, endpoints } from '../src/model.ts';
import type { Item, Board } from '../src/model.ts';
import {
  connectorGeometry,
  dragBend,
  addBend,
  removeBend,
  resetBends,
  setBendPoint,
  bendHandles,
  setConnectorConnections,
  moveConnectorEndpoint,
} from '../src/connector-geometry.ts';
import { routeOrthogonal, segmentHitsRect, polylineHits, bendsToPoints, pointsToBends } from '../src/routing.ts';
import { translate } from '../src/interactions.ts';

const box = (type: Item['type'], x: number, y: number, w = 100, h = 100): Item => ({ ...createItem(type, x, y), w, h });
const finite = (s: string) => !/NaN|Infinity/.test(s);
const numbers = (path: string) => [...path.matchAll(/-?\d+(\.\d+)?/g)].map(m => Number(m[0]));

// Item 1 — obstacle avoidance
test('elbow route avoids an intervening object with the configured clearance', () => {
  const a = box('rectangle', 0, 0),
    b = box('rectangle', 600, 0),
    wall = box('rectangle', 250, -100, 100, 300),
    line = { ...createItem('arrow', 0, 0), from: a.id, to: b.id, connector: { path: 'elbow' as const, clearance: 20 } };
  const g = connectorGeometry(line, [a, b, wall]);
  assert.ok(finite(g.path));
  assert.equal(g.blocked, false);
  const grown = { x: wall.x - 19, y: wall.y - 19, w: wall.w + 38, h: wall.h + 38 };
  assert.equal(polylineHits(g.nodes, [grown]), false, 'route keeps clearance');
  assert.deepEqual(g.start, { x: 100, y: 50 });
  assert.deepEqual(g.end, { x: 600, y: 50 });
  assert.ok(
    g.nodes.every((p, i) => i === 0 || p.x === g.nodes[i - 1].x || p.y === g.nodes[i - 1].y),
    'segments stay orthogonal',
  );
});
test('routes update after obstacles move or resize, and clear paths keep the original shape', () => {
  const a = box('rectangle', 0, 0),
    b = box('rectangle', 600, 0),
    wall = box('rectangle', 250, -100, 100, 300),
    line = { ...createItem('arrow', 0, 0), from: a.id, to: b.id, connector: { path: 'curved' as const } };
  const blocked = connectorGeometry(line, [a, b, wall]),
    moved = connectorGeometry(line, [a, b, { ...wall, y: 600 }]),
    taller = connectorGeometry(line, [a, b, { ...wall, y: -400, h: 900 }]);
  assert.notEqual(blocked.path, moved.path);
  assert.match(moved.path, /^M100,50 C/);
  assert.notEqual(blocked.path, taller.path);
  assert.ok(finite(taller.path));
  const off = { ...line, connector: { path: 'curved' as const, avoid: false } };
  assert.match(connectorGeometry(off, [a, b, wall]).path, /^M100,50 C/);
});
test('enclosed targets fall back to the unrouted path and overlapping/coincident objects stay finite', () => {
  const a = box('rectangle', 0, 0),
    b = box('rectangle', 600, 0),
    cage = [
      box('rectangle', 560, -60, 200, 20),
      box('rectangle', 560, 140, 200, 20),
      box('rectangle', 540, -60, 20, 220),
      box('rectangle', 760, -60, 20, 220),
    ];
  const line = {
      ...createItem('arrow', 0, 0),
      from: a.id,
      to: b.id,
      connector: { path: 'elbow' as const, clearance: 30 },
    },
    g = connectorGeometry(line, [a, b, ...cage]);
  assert.ok(finite(g.path));
  assert.equal(g.blocked, true);
  const c = box('rectangle', 0, 0),
    d = box('rectangle', 0, 0),
    e = box('rectangle', 20, 20);
  for (const path of ['straight', 'elbow', 'curved'] as const) {
    const h = connectorGeometry({ ...createItem('arrow', 0, 0), from: c.id, to: d.id, connector: { path } }, [c, d, e]);
    assert.ok(finite(h.path), path);
  }
});
test('router primitives: segment clipping and a large board remain responsive', () => {
  assert.equal(segmentHitsRect({ x: 0, y: 50 }, { x: 200, y: 50 }, { x: 50, y: 0, w: 50, h: 100 }), true);
  assert.equal(segmentHitsRect({ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 50, y: 0, w: 50, h: 100 }), false);
  const items: Item[] = [];
  for (let r = 0; r < 40; r++) for (let c = 0; c < 40; c++) items.push(box('rectangle', c * 160, r * 160, 100, 100));
  const lines = Array.from({ length: 60 }, (_, k) => ({
    ...createItem('arrow', 0, 0),
    from: items[k].id,
    to: items[items.length - 1 - k].id,
    connector: { path: 'elbow' as const },
  }));
  const started = performance.now();
  for (const l of lines) assert.ok(finite(connectorGeometry(l, [...items, ...lines]).path));
  assert.ok(performance.now() - started < 4000, '60 routed connectors across 1,600 objects');
  assert.equal(routeOrthogonal({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 300, y: 0 }, { x: -1, y: 0 }, [], 10)?.length, 2);
});

// Item 2 — editable bends
test('bends are stored relative to the endpoints and transform with them', () => {
  const a = { x: 0, y: 0 },
    b = { x: 200, y: 0 },
    pts = [{ x: 100, y: 50 }],
    bends = pointsToBends(a, b, pts);
  assert.deepEqual(bendsToPoints(a, b, bends), pts);
  assert.deepEqual(bendsToPoints({ x: 0, y: 0 }, { x: 400, y: 0 }, bends), [{ x: 200, y: 100 }]);
  assert.ok(
    bendsToPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, [{ u: 0.5, v: 0.25 }]).every(
      p => Number.isFinite(p.x) && Number.isFinite(p.y),
    ),
  );
});
test('dragging handles creates, moves and resets manual routing; elbow segments stay orthogonal', () => {
  const a = box('rectangle', 0, 0),
    b = box('rectangle', 500, 200),
    line = { ...createItem('arrow', 0, 0), from: a.id, to: b.id, connector: { path: 'elbow' as const } };
  let board: Board = { ...newBoard(), items: [a, b, line] };
  const g = connectorGeometry(line, board.items),
    segment = bendHandles(line, g).find(h => h.kind === 'segment' && h.index === 1)!;
  board = dragBend(board, line.id, segment, { x: segment.at.x + 80, y: segment.at.y });
  const edited = board.items[2],
    eg = connectorGeometry(edited, board.items);
  assert.ok(edited.connector?.bends?.length);
  assert.equal(eg.manual, true);
  assert.deepEqual(eg.start, g.start);
  assert.ok(
    eg.nodes.every(
      (p, i) => i === 0 || Math.abs(p.x - eg.nodes[i - 1].x) < 1e-6 || Math.abs(p.y - eg.nodes[i - 1].y) < 1e-6,
    ),
  );
  assert.ok(eg.nodes.some(p => Math.abs(p.x - (segment.at.x + 80)) < 1e-6));
  const movedBoard = translate(board, [a.id, b.id, line.id], { x: 40, y: 10 }),
    mg = connectorGeometry(movedBoard.items[2], movedBoard.items);
  assert.deepEqual(
    mg.nodes.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    eg.nodes.map(p => ({ x: Math.round(p.x + 40), y: Math.round(p.y + 10) })),
  );
  assert.equal(resetBends(board, line.id).items[2].connector?.bends, undefined);
  const round = parseBoard(JSON.parse(JSON.stringify(board)));
  assert.deepEqual(round.items[2].connector?.bends, edited.connector?.bends);
});
test('curve control points can be inserted, moved precisely, removed, and undone', () => {
  const line = { ...createItem('arrow', 0, 0), w: 300, h: 0, connector: { path: 'curved' as const } };
  let h = { past: [], current: { ...newBoard(), items: [line] }, future: [] } as {
    past: Board[];
    current: Board;
    future: Board[];
  };
  h = commit(h, addBend(h.current, line.id));
  assert.equal(h.current.items[0].connector?.bends?.length, 1);
  h = commit(h, setBendPoint(h.current, line.id, 0, { x: 150, y: -90 }));
  const g = connectorGeometry(h.current.items[0], h.current.items);
  assert.deepEqual(g.nodes[1], { x: 150, y: -90 });
  assert.match(g.path, / C/);
  h = commit(h, removeBend(h.current, line.id, 0));
  assert.equal(h.current.items[0].connector?.bends, undefined);
  h = undo(h);
  assert.deepEqual(connectorGeometry(h.current.items[0], h.current.items).nodes[1], { x: 150, y: -90 });
  h = redo(h);
  assert.equal(h.current.items[0].connector?.bends, undefined);
  assert.throws(() => parseBoard({ ...newBoard(), items: [{ ...line, connector: { bends: [{ u: NaN, v: 0 }] } }] }));
});

// Item 3 — self-loops
test('self-loops leave and re-enter distinct faces, stay visible and survive JSON round trips', () => {
  const a = box('note', 100, 100, 200, 200);
  let board: Board = { ...newBoard(), items: [a, { ...createItem('arrow', 0, 0), text: 'retry' }] };
  board = setConnectorConnections(board, board.items[1].id, a.id, a.id, 'retry');
  const loop = board.items[1],
    g = connectorGeometry(loop, board.items);
  assert.equal(g.loop, true);
  assert.deepEqual(g.start, { x: 300, y: 200 });
  assert.deepEqual(g.end, { x: 200, y: 100 });
  const xs = g.nodes.map(p => p.x),
    ys = g.nodes.map(p => p.y);
  assert.ok(Math.max(...xs) > 300 && Math.min(...ys) < 100, 'loop extends outside the object');
  assert.ok(g.mid.x > 200 && g.mid.y < 200, 'label sits on the loop');
  const moved = translate(board, [a.id], { x: 50, y: 0 });
  assert.equal(moved.items[1].from, a.id);
  assert.equal(connectorGeometry(moved.items[1], moved.items).start.x, 350);
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))), board);
  const opposite = setConnectorConnections(board, loop.id, a.id, a.id, '', { start: 'left', end: 'right' }),
    og = connectorGeometry(opposite.items[1], opposite.items);
  assert.ok(og.nodes.every(p => Number.isFinite(p.x)));
  assert.ok(Math.min(...og.nodes.map(p => p.y)) < 100);
  const same = setConnectorConnections(board, loop.id, a.id, a.id, '', { start: 'top', end: 'top' }),
    sg = connectorGeometry(same.items[1], same.items);
  assert.notDeepEqual(sg.start, sg.end);
  const plain = { ...createItem('arrow', 0, 0), from: a.id, to: box('note', 600, 100).id };
  assert.equal(plain.connector, undefined);
  assert.throws(() => parseBoard({ ...board, items: [a, { ...loop, connector: { startSide: 'middle' } }] }));
  assert.equal(
    endpoints(loop, board.items).every(p => Number.isFinite(p.x)),
    true,
  );
});
