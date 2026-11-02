import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, removeItems } from '../src/model.ts';
import type { Item, Board } from '../src/model.ts';
import {
  layoutOrgChart,
  addChild,
  addSibling,
  removeNode,
  moveSibling,
  reparent,
  toggleCollapse,
  validateOrgNodes,
  visibleOrgNodes,
  ORG_NODE_W,
  ORG_NODE_H,
} from '../src/orgchart.ts';
import type { OrgNode } from '../src/orgchart.ts';
import {
  starterStoryMap,
  addActivity,
  addRelease,
  removeLane,
  addCard,
  moveCard,
  shiftCard,
  cellCards,
  validateStoryMap,
} from '../src/storymap.ts';
import {
  applyLayouts,
  adoptIntoContainers,
  moveChild,
  removeChild,
  setLayoutOption,
  AUTOLAYOUT_HEADER,
} from '../src/autolayout.ts';
import { parseFlowchart, mermaidToNative } from '../src/mermaid-native.ts';
import { validateMindStyle, mindLayout, mindBranchPath } from '../src/mindmap-style.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const roundTrip = (b: Board) => assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);

// Item 35 — org charts
test('org chart layout has no overlaps at 200 people and respects collapsed branches', () => {
  let nodes: OrgNode[] = [{ id: 'root', parent: null, name: 'Root', role: '' }];
  for (let i = 1; i < 200; i++) {
    const parent = nodes[Math.floor(Math.sqrt(i * 7)) % nodes.length].id;
    nodes = addChild(nodes, parent).nodes;
  }
  assert.equal(nodes.length, 200);
  validateOrgNodes(nodes);
  const { positions, width, height } = layoutOrgChart(nodes),
    boxes = [...positions.values()];
  assert.equal(boxes.length, 200);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      assert.ok(
        !(a.x < b.x + ORG_NODE_W && b.x < a.x + ORG_NODE_W && a.y < b.y + ORG_NODE_H && b.y < a.y + ORG_NODE_H),
        'overlap',
      );
    }
  assert.ok(boxes.every(p => p.x >= 0 && p.x + ORG_NODE_W <= width + 1e-6 && p.y + ORG_NODE_H <= height + 1e-6));
  assert.throws(() => addChild(nodes, 'root'), /200/);
  const collapsed = toggleCollapse(nodes, 'root');
  assert.equal(visibleOrgNodes(collapsed).length, 1);
  assert.equal(layoutOrgChart(collapsed).positions.size, 1);
});
test('org chart operations: siblings, reorder, reparent with cycle rejection, remove subtree', () => {
  let nodes: OrgNode[] = [
    { id: 'r', parent: null, name: 'R', role: '' },
    { id: 'a', parent: 'r', name: 'A', role: '' },
    { id: 'b', parent: 'r', name: 'B', role: '' },
  ];
  const before = addSibling(nodes, 'b', 'before');
  assert.deepEqual(
    before.nodes.filter(n => n.parent === 'r').map(n => n.id),
    ['a', before.id, 'b'],
  );
  assert.throws(() => addSibling(nodes, 'r', 'after'), /top person/);
  assert.deepEqual(
    moveSibling(nodes, 'b', -1)
      .filter(n => n.parent === 'r')
      .map(n => n.id),
    ['b', 'a'],
  );
  assert.equal(moveSibling(nodes, 'a', -1), nodes);
  nodes = reparent(nodes, 'b', 'a');
  assert.equal(nodes.find(n => n.id === 'b')!.parent, 'a');
  assert.throws(() => reparent(nodes, 'a', 'b'), /own team/);
  assert.throws(() => reparent(nodes, 'r', 'a'), /top person/);
  assert.deepEqual(
    removeNode(nodes, 'a').map(n => n.id),
    ['r'],
  );
  assert.throws(() => removeNode(nodes, 'r'));
  for (const bad of [
    [],
    [{ id: 'x', parent: 'y', name: '', role: '' }],
    [
      { id: 'a', parent: null, name: '', role: '' },
      { id: 'b', parent: null, name: '', role: '' },
    ],
    [
      { id: 'r', parent: null, name: '', role: '' },
      { id: 'a', parent: 'b', name: '', role: '' },
      { id: 'b', parent: 'a', name: '', role: '' },
    ],
  ])
    assert.throws(() => validateOrgNodes(bad));
});

// Item 36 — story map
test('story map moves cards between cells and with keyboard; removing lanes keeps cards', () => {
  let m = starterStoryMap();
  const [a1, a2, a3] = m.activities,
    [r1, r2] = m.releases;
  const added = addCard(m, a1.id, r1.id, 'Third');
  m = added.map;
  assert.deepEqual(
    cellCards(m, a1.id, r1.id).map(c => c.title),
    ['Find the board', 'Third'],
  );
  m = moveCard(m, added.id, a1.id, r1.id, cellCards(m, a1.id, r1.id)[0].id);
  assert.deepEqual(
    cellCards(m, a1.id, r1.id).map(c => c.title),
    ['Third', 'Find the board'],
  );
  m = moveCard(m, added.id, a3.id, r2.id, null);
  assert.equal(cellCards(m, a3.id, r2.id)[0].id, added.id);
  m = shiftCard(m, added.id, 'left');
  assert.equal(m.cards.find(c => c.id === added.id)!.activity, a2.id);
  m = shiftCard(m, added.id, 'up');
  assert.equal(m.cards.find(c => c.id === added.id)!.release, r1.id);
  m = shiftCard(m, added.id, 'up');
  assert.equal(cellCards(m, a2.id, r1.id)[0].id, added.id, 'moves up within the cell');
  assert.equal(shiftCard(m, added.id, 'up'), m, 'top of the first release');
  const count = m.cards.length;
  m = removeLane(m, 'activity', a2.id);
  assert.equal(m.cards.length, count);
  assert.ok(m.cards.every(c => c.activity !== a2.id));
  m = addRelease(addActivity(m));
  assert.equal(m.activities.length, 3);
  assert.equal(m.releases.length, 3);
  assert.throws(() => removeLane({ ...m, releases: [m.releases[0]], cards: [] }, 'release', m.releases[0].id));
  validateStoryMap(m);
  assert.throws(() => validateStoryMap({ ...m, cards: [{ id: 'x', title: '', activity: 'missing', release: r1.id }] }));
});

// Item 39 — auto-layout
test('auto-layout positions children in order, wraps, grows and is idempotent', () => {
  const c = { ...createItem('autolayout', 0, 0), w: 300 };
  const kids = [1, 2, 3].map(i => ({ ...createItem('note', 500 * i, 500), w: 100, h: 80 }));
  let b = board(c, ...kids);
  b = {
    ...b,
    items: b.items.map(i => (i.id === c.id ? { ...i, data: { ...i.data, children: kids.map(k => k.id) } } : i)),
  };
  const once = applyLayouts(b),
    twice = applyLayouts(once);
  assert.equal(twice, once, 'idempotent');
  const get = (bd: Board, id: string) => bd.items.find(i => i.id === id)!,
    d = c.data!;
  assert.deepEqual([get(once, kids[0].id).x, get(once, kids[0].id).y], [d.padding, AUTOLAYOUT_HEADER + d.padding]);
  assert.equal(get(once, kids[1].id).x, d.padding + 100 + d.gap);
  assert.equal(get(once, kids[2].id).x, d.padding, 'third wraps');
  assert.equal(get(once, kids[2].id).y, AUTOLAYOUT_HEADER + d.padding + 80 + d.gap);
  assert.equal(get(once, c.id).h, AUTOLAYOUT_HEADER + d.padding * 2 + 80 * 2 + d.gap);
  const column = setLayoutOption(once, c.id, { direction: 'column' });
  assert.deepEqual(
    kids.map(k => get(column, k.id).x),
    [d.padding, d.padding, d.padding],
  );
  const other = createItem('rectangle', 2000, 2000),
    withOther = applyLayouts({ ...once, items: [...once.items, other] });
  assert.deepEqual(get(withOther, other.id), other);
  const deleted = applyLayouts(removeItems(once, [kids[1].id]));
  assert.deepEqual(get(deleted, c.id).data!.children, [kids[0].id, kids[2].id]);
  assert.equal(applyLayouts(board(createItem('note', 0, 0))).items.length, 1);
});
test('moved objects are adopted at their position, reordered, released, and containers never adopt themselves', () => {
  const c = { ...createItem('autolayout', 0, 0), w: 600 },
    a = { ...createItem('note', 0, 0), w: 100, h: 80 },
    b2 = { ...createItem('note', 0, 0), w: 100, h: 80 },
    frame = createItem('frame', 40, 40),
    line = createItem('arrow', 100, 100);
  let b = board(c, a, b2, frame, line);
  b = adoptIntoContainers({ ...b, items: b.items.map(i => (i.id === a.id ? { ...i, x: 30, y: 40 } : i)) }, [a.id]);
  assert.deepEqual(b.items[0].data!.children, [a.id]);
  b = adoptIntoContainers({ ...b, items: b.items.map(i => (i.id === b2.id ? { ...i, x: 5, y: 40 } : i)) }, [b2.id]);
  assert.deepEqual(b.items[0].data!.children, [b2.id, a.id], 'inserted before by position');
  b = moveChild(b, c.id, b2.id, 1);
  assert.deepEqual(b.items[0].data!.children, [a.id, b2.id]);
  b = adoptIntoContainers({ ...b, items: b.items.map(i => (i.id === a.id ? { ...i, x: 3000, y: 3000 } : i)) }, [a.id]);
  assert.deepEqual(b.items[0].data!.children, [b2.id], 'released');
  b = adoptIntoContainers(b, [frame.id, line.id, c.id]);
  assert.deepEqual(b.items[0].data!.children, [b2.id]);
  b = removeChild(b, c.id, b2.id);
  assert.deepEqual(b.items[0].data!.children, []);
  assert.ok(b.items.find(i => i.id === b2.id)!.x >= c.x + c.w);
  roundTrip(b);
  assert.throws(() => parseBoard(board({ ...c, data: { ...c.data, direction: 'diagonal' } })));
});

// Item 40 — Mermaid to native, mind-map style
test('mermaid flowcharts convert to shapes and bound connectors with labels, chains and styles', () => {
  const code =
    'flowchart LR\n  A([Start]) --> B{Ready?}\n  B -->|yes| C[(Store)]\n  B -- no --> D((Retry)) -.-> A\n  C ==> E(Done); E --- F\n  subgraph Group\n  end\n  style A fill:#f00';
  const p = parseFlowchart(code);
  assert.deepEqual(
    p.nodes.map(n => [n.id, n.shape, n.label]),
    [
      ['A', 'terminator', 'Start'],
      ['B', 'diamond', 'Ready?'],
      ['C', 'cylinder', 'Store'],
      ['D', 'ellipse', 'Retry'],
      ['E', 'roundrect', 'Done'],
      ['F', 'rectangle', 'F'],
    ],
  );
  assert.deepEqual(
    p.edges.map(e => [e.from, e.to, e.label, e.style, e.arrow]),
    [
      ['A', 'B', '', 'solid', true],
      ['B', 'C', 'yes', 'solid', true],
      ['B', 'D', 'no', 'solid', true],
      ['D', 'A', '', 'dotted', true],
      ['C', 'E', '', 'thick', true],
      ['E', 'F', '', 'solid', false],
    ],
  );
  assert.equal(p.notes.length, 2);
  const { items } = mermaidToNative(code, { x: 100, y: 50 }),
    shapes = items.filter(i => i.type !== 'arrow'),
    lines = items.filter(i => i.type === 'arrow');
  assert.equal(shapes.length, 6);
  assert.equal(lines.length, 6);
  assert.ok(
    lines.every(
      l => shapes.some(s => s.id === l.from) && shapes.some(s => s.id === l.to) && l.connector?.path === 'elbow',
    ),
  );
  const byText = (t: string) => shapes.find(s => s.text === t)!;
  assert.ok(byText('Ready?').x > byText('Start').x, 'LR ranks increase to the right');
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i],
        c = shapes[j];
      assert.ok(!(a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h), 'no overlap');
    }
  roundTrip(board(...items));
  const td = mermaidToNative('graph TD\nA-->B-->C', { x: 0, y: 0 }).items.filter(i => i.type !== 'arrow');
  assert.ok(td[1].y > td[0].y && td[2].y > td[1].y);
  assert.throws(() => mermaidToNative('sequenceDiagram\nA->>B: hi', { x: 0, y: 0 }), /flowcharts/);
  assert.throws(() => parseFlowchart('flowchart TD\n'), /no nodes/);
});
test('mind-map styles validate and shape branches; older maps keep defaults', () => {
  const m = {
    ...createItem('mindmap', 0, 0),
    nodes: [
      { id: 'r', parent: null, text: 'R' },
      { id: 'c', parent: 'r', text: 'C' },
    ],
  };
  validateMindStyle(m);
  validateMindStyle({ ...m, data: { branchStyle: 'elbow', colorful: true } });
  assert.throws(() => validateMindStyle({ ...m, data: { branchStyle: 'zigzag' } }));
  assert.throws(() => validateMindStyle({ ...m, data: { colorful: 'yes' } }));
  const pos = mindLayout(m.nodes);
  assert.match(mindBranchPath('elbow', pos.get('r')!, pos.get('c')!), / H.* V/);
  assert.match(mindBranchPath('straight', pos.get('r')!, pos.get('c')!), / L/);
});
test('diagram widgets create with defaults and round-trip; invalid payloads are rejected', () => {
  const org = createItem('orgchart', 0, 0),
    story = createItem('storymap', 0, 0),
    auto = createItem('autolayout', 0, 0);
  assert.equal(org.data!.nodes.length, 3);
  assert.equal(story.data!.activities.length, 3);
  assert.equal(auto.data!.direction, 'row');
  roundTrip(board(org, story, auto));
  assert.throws(() => parseBoard(board({ ...org, data: { nodes: [] } })));
  assert.throws(() => parseBoard(board({ ...story, data: { ...story.data, releases: [] } })));
  assert.throws(() => parseBoard(board({ ...auto, data: { ...auto.data, children: 'x' } })));
});
