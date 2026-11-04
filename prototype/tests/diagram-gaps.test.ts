// Diagramming gaps E1-E5, E7, E8, B13 and B14.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, connectorHeads } from '../src/model.ts';
import type { Board, Item, MindNode } from '../src/model.ts';
import {
  snap45,
  addConnectorLabel,
  updateConnectorLabel,
  removeConnectorLabel,
  addConnectedCopy,
  canQuickConnect,
  insertShapeOnConnector,
  quickConnectPoint,
  QUICK_GAP,
  MAX_CONNECTOR_LABELS,
} from '../src/diagram-gaps.ts';
import {
  mindLayout,
  mindHiddenIds,
  mindHiddenCount,
  toggleMindCollapse,
  revealMindNode,
  setMindColor,
  mindOutlineMarkdown,
  mindTopicColor,
  mindBranchPath,
  manualMindNodes,
  moveMindBranch,
  validateMindStyle,
  MIND_NODE_W,
  MIND_NODE_H,
} from '../src/mindmap-style.ts';
import { orgFromCsv, orgToCsv, orgMeta, validateOrgNodes, ORG_CSV_HEADER } from '../src/orgchart.ts';
import type { OrgNode } from '../src/orgchart.ts';
import { connectorGeometry } from '../src/connector-geometry.ts';
import { searchBoard } from '../src/navigation.ts';

const boardWith = (...items: Item[]): Board => ({ ...newBoard(), items });
const shape = (x: number, y: number, kind: Item['type'] = 'rectangle') => ({
  ...createItem(kind, x, y, '#ffffff'),
  text: 'A',
});
const arrow = (from?: string, to?: string, extra: Partial<Item> = {}): Item => ({
  ...createItem('arrow', 0, 0),
  ...(from ? { from } : {}),
  ...(to ? { to } : {}),
  ...extra,
});

// ---- E3 crow's-foot heads -------------------------------------------------------------------
test("crow's-foot heads are valid connector heads and unknown heads are rejected", () => {
  for (const head of ['one', 'many', 'zero-one', 'zero-many', 'one-many'] as const) {
    assert.ok(connectorHeads.includes(head));
    const b = boardWith({ ...arrow(), connector: { startHead: head, endHead: head } });
    assert.doesNotThrow(() => parseBoard(b));
  }
  assert.throws(() => parseBoard(boardWith({ ...arrow(), connector: { endHead: 'crow' as never } })));
});

// ---- E4 extra labels ------------------------------------------------------------------------
test('connector labels can be added, edited, moved and removed', () => {
  const a = shape(0, 0),
    b = shape(400, 0),
    c = arrow(a.id, b.id);
  let board = boardWith(a, b, c);
  board = addConnectorLabel(board, c.id, '1', 0.1);
  board = addConnectorLabel(board, c.id, 'N', 2);
  const labels = board.items.find(i => i.id === c.id)!.connector!.labels!;
  assert.equal(labels.length, 2);
  assert.equal(labels[1].at, 1, 'positions are clamped to 0..1');
  board = updateConnectorLabel(board, c.id, labels[0].id, { text: 'one', at: 0.2 });
  assert.deepEqual(board.items.find(i => i.id === c.id)!.connector!.labels![0], {
    id: labels[0].id,
    text: 'one',
    at: 0.2,
  });
  assert.doesNotThrow(() => parseBoard(board));
  board = removeConnectorLabel(board, c.id, labels[0].id);
  board = removeConnectorLabel(board, c.id, labels[1].id);
  assert.equal(board.items.find(i => i.id === c.id)!.connector!.labels, undefined, 'empty list is removed');
});
test('connector labels respect locks and the label limit', () => {
  const c = { ...arrow(), locked: true };
  const board = boardWith(c);
  assert.equal(addConnectorLabel(board, c.id), board);
  let open = boardWith(arrow());
  const id = open.items[0].id;
  for (let n = 0; n < MAX_CONNECTOR_LABELS; n++) open = addConnectorLabel(open, id, String(n));
  assert.throws(() => addConnectorLabel(open, id), /up to 10/);
});
test('connector label validation rejects bad payloads', () => {
  const bad = [
    [{ id: 'a', text: 'x', at: 1.5 }],
    [{ id: '', text: 'x', at: 0.5 }],
    [{ id: 'a', text: 1, at: 0.5 }],
    [
      { id: 'a', text: 'x', at: 0.5 },
      { id: 'a', text: 'y', at: 0.6 },
    ],
    'labels',
  ];
  for (const labels of bad)
    assert.throws(() => parseBoard(boardWith({ ...arrow(), connector: { labels: labels as never } })), /labels/);
  // Older boards without labels still load.
  assert.doesNotThrow(() => parseBoard(boardWith({ ...arrow(), connector: { labelAt: 0.3 } })));
});
test('search finds text in extra connector labels', () => {
  const c = arrow();
  const withLabel = addConnectorLabel(boardWith(c), c.id, 'cardinality');
  assert.equal(searchBoard(withLabel, 'cardinality')[0]?.id, c.id);
});

// ---- E5 45-degree snapping ------------------------------------------------------------------
test('snap45 rounds to 45-degree steps and keeps the length', () => {
  assert.deepEqual(snap45(100, 10), { x: Math.hypot(100, 10), y: 0 });
  assert.deepEqual(snap45(-5, 80), { x: 0, y: Math.hypot(5, 80) });
  const d = snap45(100, 90);
  assert.ok(Math.abs(d.x - d.y) < 1e-9 && d.x > 0);
  assert.ok(Math.abs(Math.hypot(d.x, d.y) - Math.hypot(100, 90)) < 1e-9);
  const up = snap45(-100, -95);
  assert.ok(up.x < 0 && Math.abs(up.x - up.y) < 1e-9);
  assert.deepEqual(snap45(0, 0), { x: 0, y: 0 });
});

// ---- E1 quick connect -----------------------------------------------------------------------
test('addConnectedCopy places an empty copy on the chosen side with a connector', () => {
  const s = { ...shape(100, 100, 'ellipse'), style: { borderColor: '#ff0000' } };
  for (const side of ['right', 'left', 'top', 'bottom'] as const) {
    const r = addConnectedCopy(boardWith(s), s.id, side);
    assert.equal(r.item.type, 'ellipse');
    assert.equal(r.item.text, '');
    assert.deepEqual([r.item.w, r.item.h], [s.w, s.h]);
    assert.deepEqual(r.item.style, s.style);
    assert.equal(r.connector.from, s.id);
    assert.equal(r.connector.to, r.item.id);
    assert.equal(r.connector.connector?.startSide, side);
    if (side === 'right') assert.equal(r.item.x, s.x + s.w + QUICK_GAP);
    if (side === 'left') assert.equal(r.item.x, s.x - QUICK_GAP - s.w);
    if (side === 'top') assert.equal(r.item.y, s.y - QUICK_GAP - s.h);
    if (side === 'bottom') assert.equal(r.item.y, s.y + s.h + QUICK_GAP);
    assert.doesNotThrow(() => parseBoard(r.board));
  }
});
test('addConnectedCopy moves the copy sideways past occupied space', () => {
  const s = shape(0, 0),
    blocker = { ...shape(s.w + QUICK_GAP, 0), w: s.w, h: s.h };
  const r = addConnectedCopy(boardWith(s, blocker), s.id, 'right');
  assert.ok(r.item.y >= blocker.y + blocker.h, 'moved below the blocker');
  assert.equal(r.item.x, s.x + s.w + QUICK_GAP);
});
test('quick connect works for notes, text and shapes but not frames or connectors', () => {
  assert.ok(canQuickConnect(createItem('note', 0, 0)));
  assert.ok(canQuickConnect(createItem('text', 0, 0)));
  assert.ok(canQuickConnect(createItem('diamond', 0, 0)));
  assert.ok(!canQuickConnect(createItem('frame', 0, 0)));
  const f = createItem('frame', 0, 0);
  assert.throws(() => addConnectedCopy(boardWith(f), f.id, 'right'));
  assert.throws(() => addConnectedCopy(boardWith(), 'missing', 'right'));
});
test('quickConnectPoint sits outside the selection outline at a constant screen distance', () => {
  const b = { x: 0, y: 0, w: 100, h: 50 };
  const r1 = quickConnectPoint(b, 'right', 1),
    r2 = quickConnectPoint(b, 'right', 2);
  assert.ok(r1.x > 100 && r1.y === 25);
  assert.equal((r1.x - 100) / 2, r2.x - 100);
  assert.ok(quickConnectPoint(b, 'top', 1).y < 0);
});

// ---- E2 insert shape on connector -----------------------------------------------------------
test('insertShapeOnConnector splits the connector at its midpoint', () => {
  const a = shape(0, 0),
    b = shape(600, 0),
    c = arrow(a.id, b.id, {
      text: 'flow',
      connector: { startHead: 'circle', endHead: 'arrow', bends: [{ u: 0.5, v: 0.2 }], labelAt: 0.4 },
    });
  const board = boardWith(a, b, c),
    mid = connectorGeometry(c, board.items).mid;
  const r = insertShapeOnConnector(board, c.id, 'diamond');
  const first = r.board.items.find(i => i.id === c.id)!;
  assert.equal(r.shape.type, 'diamond');
  assert.equal(first.from, a.id);
  assert.equal(first.to, r.shape.id);
  assert.equal(first.text, 'flow');
  assert.equal(first.connector?.bends, undefined);
  assert.equal(first.connector?.labelAt, undefined);
  assert.equal(r.second.from, r.shape.id);
  assert.equal(r.second.to, b.id);
  assert.equal(r.second.connector?.startHead, undefined);
  assert.equal(r.second.connector?.endHead, 'arrow');
  assert.equal(r.second.text, '');
  assert.ok(Math.abs(r.shape.x + r.shape.w / 2 - mid.x) < 1e-6 && Math.abs(r.shape.y + r.shape.h / 2 - mid.y) < 1e-6);
  assert.equal(r.board.items.length, 5);
  assert.doesNotThrow(() => parseBoard(r.board));
});
test('insertShapeOnConnector keeps free ends in place and refuses locked connectors', () => {
  const c = { ...arrow(), x: 0, y: 0, w: 200, h: 0 };
  const r = insertShapeOnConnector(boardWith(c), c.id);
  const first = r.board.items.find(i => i.id === c.id)!;
  assert.deepEqual([first.x, first.y], [0, 0]);
  assert.equal(r.second.x + r.second.w, 200);
  assert.equal(r.shape.x + r.shape.w / 2, 100);
  assert.throws(() => insertShapeOnConnector(boardWith({ ...c, locked: true }), c.id), /Unlock/);
  const s = shape(0, 0);
  assert.throws(() => insertShapeOnConnector(boardWith(s), s.id), /connector/);
});

// ---- E7 mind maps ---------------------------------------------------------------------------
const mind = (): MindNode[] => [
  { id: 'r', parent: null, text: 'Root' },
  { id: 'a', parent: 'r', text: 'A' },
  { id: 'a1', parent: 'a', text: 'A1' },
  { id: 'a2', parent: 'a', text: 'A2\nmore' },
  { id: 'b', parent: 'r', text: 'B' },
  { id: 'c', parent: 'r', text: '' },
];
test('collapsed topics hide their descendants from the layout', () => {
  const nodes = toggleMindCollapse(mind(), 'a');
  assert.equal(nodes.find(n => n.id === 'a')!.collapsed, true);
  assert.deepEqual([...mindHiddenIds(nodes)].sort(), ['a1', 'a2']);
  assert.equal(mindHiddenCount(nodes, 'a'), 2);
  const p = mindLayout(nodes);
  assert.ok(!p.has('a1') && !p.has('a2') && p.has('a'));
  assert.equal(toggleMindCollapse(nodes, 'a').find(n => n.id === 'a')!.collapsed, undefined);
  const leaf = mind();
  assert.equal(toggleMindCollapse(leaf, 'b'), leaf, 'leaves cannot collapse');
});
test('revealMindNode expands collapsed ancestors', () => {
  const nodes = toggleMindCollapse(toggleMindCollapse(mind(), 'a'), 'r');
  const open = revealMindNode(nodes, 'a1');
  assert.ok(open.every(n => !n.collapsed));
  const plain = mind();
  assert.equal(revealMindNode(plain, 'a1'), plain);
});
test('manual positions and branch moves cope with hidden topics', () => {
  const nodes = toggleMindCollapse(mind(), 'a');
  const manual = manualMindNodes(nodes);
  assert.deepEqual(manual.find(n => n.id === 'a1')!.position, manual.find(n => n.id === 'a')!.position);
  const moved = moveMindBranch(manual, 'a', 10, 5);
  assert.equal(moved.find(n => n.id === 'a1')!.position!.x, manual.find(n => n.id === 'a1')!.position!.x + 10);
});
test('topic colours are validated and override the branch colour', () => {
  const nodes = setMindColor(mind(), 'b', '#E5484D');
  assert.equal(nodes.find(n => n.id === 'b')!.color, '#e5484d');
  assert.equal(mindTopicColor(nodes, 'b', false), '#e5484d');
  assert.notEqual(mindTopicColor(nodes, 'a', false), '#e5484d');
  assert.equal(setMindColor(nodes, 'b', '').find(n => n.id === 'b')!.color, undefined);
  assert.throws(() => setMindColor(nodes, 'b', 'red'));
  const item = { ...createItem('mindmap', 0, 0), nodes };
  assert.doesNotThrow(() => parseBoard(boardWith(item)));
  const bad = { ...item, nodes: [{ ...nodes[0], color: 'red' }, ...nodes.slice(1)] };
  assert.throws(() => parseBoard(boardWith(bad)));
  const badFold = { ...item, nodes: [{ ...nodes[0], collapsed: 'yes' }, ...nodes.slice(1)] };
  assert.throws(() => parseBoard(boardWith(badFold as Item)));
});
test('two-sided layout puts later top-level branches on the left', () => {
  const p = mindLayout(mind(), true, 'both');
  assert.equal(p.get('r')!.x, 0);
  assert.ok(p.get('a')!.x > 0 && p.get('b')!.x > 0, 'first half on the right');
  assert.ok(p.get('c')!.x < 0, 'second half on the left');
  const right = mindLayout(mind());
  assert.ok(
    [...right.values()].every(q => q.x >= 0),
    'default grows right',
  );
  const path = mindBranchPath('curved', p.get('r')!, p.get('c')!);
  assert.ok(path.startsWith(`M0 `), 'left branches leave from the left edge');
});
test('top-down layout stacks depths vertically', () => {
  const p = mindLayout(mind(), true, 'down');
  assert.equal(p.get('r')!.y, 0);
  assert.ok(p.get('a')!.y > 0 && p.get('a1')!.y > p.get('a')!.y);
  assert.ok(p.get('a1')!.x < p.get('a2')!.x);
  const path = mindBranchPath('elbow', p.get('r')!, p.get('a')!, 'down');
  assert.ok(path.startsWith(`M${p.get('r')!.x + MIND_NODE_W / 2} ${MIND_NODE_H}`));
});
test('mind map layout option is validated', () => {
  const m = { ...createItem('mindmap', 0, 0), nodes: mind() };
  validateMindStyle({ ...m, data: { layout: 'both' } });
  assert.throws(() => validateMindStyle({ ...m, data: { layout: 'spiral' } }));
});

// ---- B14 outline export ---------------------------------------------------------------------
test('mindOutlineMarkdown writes a heading and nested bullets', () => {
  assert.equal(mindOutlineMarkdown(mind()), '# Root\n\n- A\n  - A1\n  - A2 more\n- B\n- Untitled topic\n');
  assert.equal(mindOutlineMarkdown([]), '');
});

// ---- E8 and B13 org chart -------------------------------------------------------------------
const org = (): OrgNode[] => [
  { id: 'r', parent: null, name: 'Ada', role: 'Director', team: 'Leadership', location: 'London' },
  { id: 'x', parent: 'r', name: 'Bo', role: '=Lead', team: 'Delivery' },
  { id: 'y', parent: 'x', name: 'Cy, Jr.', role: 'Engineer', location: 'Remote' },
];
test('org nodes accept optional team and location', () => {
  assert.doesNotThrow(() => validateOrgNodes(org()));
  assert.throws(() => validateOrgNodes([{ ...org()[0], team: 5 }]));
  assert.throws(() => validateOrgNodes([{ ...org()[0], location: 'x'.repeat(201) }]));
  assert.equal(orgMeta(org()[0]), 'Leadership · London');
  assert.equal(orgMeta(org()[2]), 'Remote');
});
test('org chart CSV round-trips names, roles, teams, locations and reporting lines', () => {
  const csv = orgToCsv(org());
  assert.ok(csv.startsWith(ORG_CSV_HEADER.join(',') + '\r\n'));
  assert.ok(csv.includes(`"'=Lead"`), 'formula-like cells are neutralised');
  const back = orgFromCsv(csv);
  assert.equal(back.length, 3);
  const by = (name: string) => back.find(n => n.name === name)!;
  assert.equal(by('Ada').parent, null);
  assert.equal(by('Bo').parent, by('Ada').id);
  assert.equal(by('Bo').role, '=Lead');
  assert.equal(by('Cy, Jr.').parent, by('Bo').id);
  assert.equal(by('Cy, Jr.').location, 'Remote');
  assert.equal(by('Cy, Jr.').team, undefined);
});
test('org CSV import matches managers by name and attaches extra top people to the first', () => {
  const nodes = orgFromCsv(
    'Name\tTitle\tDepartment\tReports to\nAda\tCEO\tBoard\t\nBo\tCTO\tTech\tAda\nEve\tAdvisor\t\t\n',
  );
  assert.equal(nodes.length, 3);
  const ada = nodes.find(n => n.name === 'Ada')!;
  assert.equal(ada.parent, null);
  assert.equal(nodes.find(n => n.name === 'Bo')!.parent, ada.id);
  assert.equal(nodes.find(n => n.name === 'Bo')!.team, 'Tech');
  assert.equal(nodes.find(n => n.name === 'Eve')!.parent, ada.id);
});
test('org CSV import rejects files without names, duplicates and cycles', () => {
  assert.throws(() => orgFromCsv('Role\nCEO\n'), /Name column/);
  assert.throws(() => orgFromCsv('Name\n'), /header row/);
  assert.throws(() => orgFromCsv('ID,Name\n1,A\n1,B\n'), /more than once/);
  assert.throws(() => orgFromCsv('ID,Name,Manager ID\n1,A,2\n2,B,1\n'), /cycle/);
  const many = 'Name\n' + Array.from({ length: 201 }, (_, i) => `P${i}`).join('\n');
  assert.throws(() => orgFromCsv(many), /200/);
});
