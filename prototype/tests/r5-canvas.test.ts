// Track R5: Mermaid round trip, entity tables, diagram data extras, clustering containers, smart drawing,
// colour store, text auto-lists, frame workflow and touch/pen input rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  mermaidKind,
  mermaidToNative,
  parseFlowchart,
  parseSequence,
  parseClassDiagram,
  parseStateDiagram,
  parseErDiagram,
  nativeToMermaid,
} from '../src/mermaid-native.ts';
import { parseEntityRows, entityRowsText, entityHeight, validateEntity } from '../src/specs-entity.ts';
import { orgFromCsv, orgToCsv, orgBranchColor, validateOrgNodes, ORG_CSV_HEADER } from '../src/orgchart.ts';
import type { OrgNode } from '../src/orgchart.ts';
import { starterStoryMap, updateCard, storyCardMeta, validateStoryMap } from '../src/storymap.ts';
import { setMindTopic, mindShapeRx } from '../src/mindmap-style.ts';
import { validateMindNodes } from '../src/model.ts';
import type { MindNode } from '../src/model.ts';
import { clusterSelection, clusterAsOne } from '../src/cluster.ts';
import { frameMoveIds } from '../src/interactions.ts';
import { lineEnds, isScribble, scribbleTargets, recognizeStroke } from '../src/pen-smart.ts';
import {
  normalizeHex,
  pushRecent,
  addSaved,
  removeSaved,
  parseColorList,
  boardColors,
  RECENT_LIMIT,
  SAVED_LIMIT,
} from '../src/color-store.ts';
import { autoList } from '../src/text-auto.ts';
import {
  framesByPosition,
  sortFramesByPosition,
  setFrameTitleHidden,
  frameTitleHidden,
} from '../src/frame-workflow.ts';
import {
  makeCustomShape,
  parseCustomShapes,
  placeCustomShape,
  addCustomShape,
  removeCustomShape,
  renameCustomShape,
  customShapeName,
  SHAPE_LIMIT,
} from '../src/custom-shapes.ts';
import { newPenState, pointerPolicy, ignoreTouch, penDown, penUp, PALM_GRACE_MS } from '../src/pointer-input.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const roundTrip = (b: Board) => assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
const at = (type: Item['type'], x: number, y: number, extra: Partial<Item> = {}): Item => ({
  ...createItem(type, x, y),
  ...extra,
});
const within = (outer: Item, inner: Item) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

// ---- Mermaid round trip ------------------------------------------------------------------------
test('mermaid kinds are recognised from the header line', () => {
  assert.equal(mermaidKind('%% comment\nflowchart LR\nA-->B'), 'flowchart');
  assert.equal(mermaidKind('sequenceDiagram\nA->>B: hi'), 'sequence');
  assert.equal(mermaidKind('classDiagram\nclass A'), 'class');
  assert.equal(mermaidKind('stateDiagram-v2\n[*] --> A'), 'state');
  assert.equal(mermaidKind('erDiagram\nA ||--o{ B : has'), 'er');
  assert.equal(mermaidKind('pie\n"a": 1'), null);
});

test('flowchart subgraphs become frames around their nodes, nested and bound as edge targets', () => {
  const code = [
    'flowchart TB',
    '  A[Start] --> B',
    '  subgraph api [API layer]',
    '    C[Gateway] --> D[(Store)]',
    '    subgraph inner',
    '      E((Cache))',
    '    end',
    '  end',
    '  subgraph empty',
    '  end',
    '  B --> api',
  ].join('\n');
  const p = parseFlowchart(code);
  assert.deepEqual(
    p.groups.map(g => [g.id, g.title, g.parent]),
    [
      ['api', 'API layer', null],
      ['inner', 'inner', 'api'],
    ],
  );
  assert.equal(p.nodes.find(n => n.id === 'C')!.group, 'api');
  assert.equal(p.nodes.find(n => n.id === 'E')!.group, 'inner');
  assert.ok(!p.nodes.some(n => n.id === 'api'), 'subgraph id used in an edge is the frame, not a node');
  assert.match(p.notes.join(' '), /1 empty subgraph/);
  const { items } = mermaidToNative(code, { x: 0, y: 0 });
  const frames = items.filter(i => i.type === 'frame');
  assert.deepEqual(
    frames.map(f => f.text),
    ['API layer', 'inner'],
    'outer frame paints first',
  );
  const byText = (t: string) => items.find(i => i.text === t)!;
  assert.ok(within(frames[0], byText('Gateway')) && within(frames[0], byText('Store')));
  assert.ok(within(frames[1], byText('Cache')) && within(frames[0], frames[1]));
  assert.ok(!within(frames[0], byText('Start')), 'non-members stay outside');
  const toFrame = items.find(i => i.type === 'arrow' && i.to === frames[0].id);
  assert.ok(toFrame, 'edge to the subgraph binds to its frame');
  roundTrip(board(...items));
});

test('sequence diagrams become participants, lifelines, messages, notes and block frames', () => {
  const code = [
    'sequenceDiagram',
    '  participant A as Alice',
    '  actor B as Bob',
    '  A->>B: Hello',
    '  loop Every minute',
    '    B-->>A: Pong',
    '    B->>B: Think',
    '  end',
    '  Note right of B: Done',
    '  A-)B: async',
    '  activate A',
  ].join('\n');
  const s = parseSequence(code);
  assert.deepEqual(
    s.participants.map(p => [p.id, p.label, p.actor]),
    [
      ['A', 'Alice', false],
      ['B', 'Bob', true],
    ],
  );
  assert.equal(s.steps.length, 5);
  assert.deepEqual(
    s.blocks.map(b => [b.title, b.start, b.end]),
    [['loop Every minute', 1, 3]],
  );
  assert.equal(s.notes.length, 1, 'activate is reported');
  const { items } = mermaidToNative(code, { x: 0, y: 0 });
  const boxes = items.filter(i => i.text === 'Alice' || i.text === 'Bob');
  assert.equal(boxes.length, 4, 'top and bottom boxes per participant');
  const lifelines = items.filter(i => i.type === 'arrow' && i.from && i.to);
  assert.equal(lifelines.length, 2);
  assert.ok(lifelines.every(l => l.connector?.dash === 'dashed' && l.connector.endHead === 'none'));
  const hello = items.find(i => i.text === 'Hello')!,
    pong = items.find(i => i.text === 'Pong')!;
  assert.ok(hello.w > 0 && pong.w < 0 && pong.connector?.dash === 'dashed', 'reply runs back, dashed');
  assert.equal(items.find(i => i.text === 'async')!.connector?.endHead, 'open');
  assert.equal(items.find(i => i.text === 'Done')!.type, 'note');
  const loop = items.find(i => i.type === 'frame')!;
  assert.equal(loop.text, 'loop Every minute');
  assert.ok(loop.y < pong.y && loop.y + loop.h > items.find(i => i.text === 'Think')!.y);
  assert.ok(loop.y > hello.y, 'block starts after the first message');
  roundTrip(board(...items));
});

test('class diagrams become entity tables with members and decorated relations', () => {
  const code = [
    'classDiagram',
    '  class Animal {',
    '    +String name',
    '    +eat() void',
    '  }',
    '  Animal <|-- Duck',
    '  Duck : +swim()',
    '  Duck *-- Wing : has',
    '  Duck ..> Pond',
    '  style Duck fill:#f00',
  ].join('\n');
  const c = parseClassDiagram(code);
  assert.deepEqual(
    c.classes.map(k => [k.id, k.members]),
    [
      ['Animal', ['+String name', '+eat() void']],
      ['Duck', ['+swim()']],
      ['Wing', []],
      ['Pond', []],
    ],
  );
  assert.deepEqual(
    c.relations.map(r => [r.from, r.to, r.startHead, r.endHead, r.dash ?? 'solid', r.label]),
    [
      ['Animal', 'Duck', 'open', 'none', 'solid', ''],
      ['Duck', 'Wing', 'diamond', 'none', 'solid', 'has'],
      ['Pond', 'Duck', 'arrow', 'none', 'dashed', ''],
    ],
  );
  const { items, notes } = mermaidToNative(code, { x: 0, y: 0 });
  assert.equal(notes.length, 1);
  const tables = items.filter(i => i.type === 'entity');
  assert.equal(tables.length, 4);
  const animal = tables.find(t => t.text === 'Animal')!;
  assert.equal(animal.data!.rows.length, 2);
  assert.equal(animal.h, entityHeight(2));
  assert.ok(animal.y < tables.find(t => t.text === 'Duck')!.y, 'parent ranks above');
  roundTrip(board(...items));
});

test('state diagrams become states, start/end dots, choices and composite frames', () => {
  const code = [
    'stateDiagram-v2',
    '  [*] --> Idle',
    '  state "Waiting for input" as Idle',
    '  Idle --> Busy : start',
    '  state Busy {',
    '    [*] --> Working',
    '    Working --> Check',
    '    state Check <<choice>>',
    '  }',
    '  Busy --> [*]',
    '  note right of Idle : hint',
  ].join('\n');
  const s = parseStateDiagram(code);
  assert.deepEqual(s.groups, [{ id: 'Busy', title: 'Busy', parent: null }]);
  assert.equal(s.states.find(x => x.id === 'Idle')!.label, 'Waiting for input');
  assert.equal(s.states.find(x => x.id === 'Check')!.kind, 'choice');
  assert.equal(s.states.filter(x => x.kind === 'start').length, 2, 'one start per scope');
  assert.ok(!s.states.some(x => x.id === 'Busy'), 'composite state is its frame');
  const { items } = mermaidToNative(code, { x: 0, y: 0 });
  const frame = items.find(i => i.type === 'frame')!;
  assert.equal(frame.text, 'Busy');
  assert.ok(
    within(
      frame,
      items.find(i => i.text === 'Working')!,
    ),
  );
  assert.ok(
    items.some(i => i.type === 'arrow' && i.from === frame.id),
    'transition out of the composite',
  );
  assert.ok(items.some(i => i.type === 'diamond'));
  assert.equal(items.filter(i => i.type === 'ellipse' && i.fill === '#25252a').length, 2);
  roundTrip(board(...items));
});

test('ER diagrams become entity tables with keys and crow foot connectors', () => {
  const code = [
    'erDiagram',
    '  CUSTOMER ||--o{ ORDER : places',
    '  ORDER ||--|{ LINE-ITEM : contains',
    '  CUSTOMER }|..|{ DELIVERY-ADDRESS : uses',
    '  CUSTOMER {',
    '    string name',
    '    int id PK "the key"',
    '    int address_id FK',
    '  }',
  ].join('\n');
  const er = parseErDiagram(code);
  assert.deepEqual(er.entities.find(e => e.id === 'CUSTOMER')!.rows, [
    { name: 'name', type: 'string' },
    { name: 'id', type: 'int', key: 'PK' },
    { name: 'address_id', type: 'int', key: 'FK' },
  ]);
  assert.deepEqual(
    er.relations.map(r => [r.from, r.to, r.startHead, r.endHead, r.dash ?? 'solid']),
    [
      ['CUSTOMER', 'ORDER', 'one', 'zero-many', 'solid'],
      ['ORDER', 'LINE-ITEM', 'one', 'one-many', 'solid'],
      ['CUSTOMER', 'DELIVERY-ADDRESS', 'one-many', 'one-many', 'dashed'],
    ],
  );
  const { items } = mermaidToNative(code, { x: 10, y: 20 });
  assert.equal(items.filter(i => i.type === 'entity').length, 4);
  const lines = items.filter(i => i.type === 'arrow');
  assert.equal(lines[0].connector?.startHead, 'one');
  assert.equal(lines[0].connector?.endHead, 'zero-many');
  assert.equal(lines[0].text, 'places');
  roundTrip(board(...items));
});

test('native shapes, connectors and frames convert back to Mermaid and round-trip', () => {
  const frame = at('frame', 0, 0, { id: 'f', w: 700, h: 300, text: 'Core' });
  const a = at('rectangle', 40, 60, { id: 'a', text: 'Start "here"' }),
    b = at('diamond', 360, 60, { id: 'b', text: 'Ready?' }),
    c = at('ellipse', 900, 60, { id: 'c', text: 'Line 1\nLine 2' });
  const ab = { ...at('arrow', 0, 0), id: 'ab', from: 'a', to: 'b', text: 'go' },
    bc = { ...at('arrow', 0, 0), id: 'bc', from: 'b', to: 'c', connector: { dash: 'dotted' as const } },
    loose = { ...at('arrow', 0, 0), id: 'x', from: 'a', to: 'zzz' };
  const b0 = board(frame, a, b, c, ab, bc, loose);
  const code = nativeToMermaid(b0, ['f', 'c', 'ab', 'bc']);
  assert.equal(
    code,
    [
      'flowchart LR',
      '  subgraph g1 ["Core"]',
      '    n1["Start #quot;here#quot;"]',
      '    n2{"Ready?"}',
      '  end',
      '  n3(("Line 1<br/>Line 2"))',
      '  n1 -->|"go"| n2',
      '  n2 -.-> n3',
    ].join('\n'),
  );
  const back = mermaidToNative(code, { x: 0, y: 0 }).items;
  assert.deepEqual(
    back.filter(i => i.type === 'frame').map(f => f.text),
    ['Core'],
  );
  assert.deepEqual(
    back.filter(i => i.type !== 'arrow' && i.type !== 'frame').map(i => [i.type, i.text]),
    [
      ['rectangle', 'Start "here"'],
      ['diamond', 'Ready?'],
      ['ellipse', 'Line 1\nLine 2'],
    ],
  );
  assert.equal(back.filter(i => i.type === 'arrow').length, 2);
  assert.throws(() => nativeToMermaid(b0, ['ab']), /Select shapes/);
});

// ---- Entity tables -----------------------------------------------------------------------------
test('entity rows parse from text with keys in either position and validate', () => {
  const rows = parseEntityRows('PK id int\ncustomer_id int FK\n\nname: varchar(80)\nUK email text');
  assert.deepEqual(rows, [
    { name: 'id', type: 'int', key: 'PK' },
    { name: 'customer_id', type: 'int', key: 'FK' },
    { name: 'name', type: 'varchar(80)' },
    { name: 'email', type: 'text', key: 'UK' },
  ]);
  assert.equal(entityRowsText(rows).split('\n')[0], 'id int PK');
  const e = createItem('entity', 0, 0);
  assert.equal(e.text, 'Entity');
  assert.equal(e.data!.rows.length, 3);
  roundTrip(board(e));
  assert.throws(() => validateEntity({ ...e, data: { rows: [{ name: 'x', type: 'y', key: 'ZZ' }] } }));
  assert.throws(() => parseBoard(JSON.parse(JSON.stringify(board({ ...e, data: { rows: 'x' } })))));
});

// ---- Diagram data extras -----------------------------------------------------------------------
test('org charts read PersonID, SupervisorID and Hiring headers and keep hiring, description and colours', () => {
  const nodes = orgFromCsv(
    'PersonID,Name,Title,SupervisorID,Hiring,Description\n1,Ada,CEO,,,Founder\n2,,Engineer,1,yes,\n3,Bo,Designer,1,no,Pixels',
  );
  assert.equal(nodes.length, 3);
  const [ceo, open, bo] = nodes;
  assert.equal(ceo.parent, null);
  assert.equal(open.parent, ceo.id);
  assert.equal(open.hiring, true);
  assert.equal(bo.hiring, undefined);
  assert.equal(ceo.description, 'Founder');
  assert.ok(orgToCsv(nodes).startsWith(ORG_CSV_HEADER.join(',')));
  assert.match(orgToCsv(nodes), /Yes/);
  const coloured: OrgNode[] = nodes.map(n => (n.id === ceo.id ? { ...n, color: '#e5484d' } : n));
  validateOrgNodes(coloured);
  assert.equal(orgBranchColor(coloured, bo.id), '#e5484d', 'reports inherit the branch colour');
  assert.equal(orgBranchColor(nodes, bo.id), undefined);
  assert.throws(() => validateOrgNodes([{ ...ceo, hiring: 'yes' as unknown as boolean }]));
  assert.throws(() => validateOrgNodes([{ ...ceo, color: 'red' }]));
  assert.throws(() => validateOrgNodes([{ ...ceo, description: 'x'.repeat(1001) }]));
});

test('story cards take colour, tags, assignee and link; empty values are removed', () => {
  const m = starterStoryMap(),
    id = m.cards[0].id;
  let next = updateCard(m, id, { color: '#a8cdff', tags: ' ux, ux , mvp,', assignee: ' Sam ', link: 'example.com/a' });
  const card = next.cards[0];
  assert.deepEqual(
    { color: card.color, tags: card.tags, assignee: card.assignee, link: card.link },
    { color: '#a8cdff', tags: ['ux', 'mvp'], assignee: 'Sam', link: 'https://example.com/a' },
  );
  assert.deepEqual(storyCardMeta(card), ['@Sam', '#ux', '#mvp']);
  validateStoryMap(next);
  next = updateCard(next, id, { color: '', tags: '', assignee: '', link: '' });
  assert.deepEqual(Object.keys(next.cards[0]).sort(), ['activity', 'id', 'release', 'title']);
  assert.throws(() => updateCard(m, id, { link: 'javascript:alert(1)' }), /http/);
  assert.throws(() => validateStoryMap({ ...m, cards: [{ ...m.cards[0], tags: ['a', 'a'] }] }));
  validateStoryMap(m);
});

test('mind map topics take a shape and a web link; older maps still validate', () => {
  const nodes: MindNode[] = [
    { id: 'r', parent: null, text: 'Root' },
    { id: 'a', parent: 'r', text: 'A' },
  ];
  validateMindNodes(nodes);
  let next = setMindTopic(nodes, 'a', { shape: 'pill', link: 'example.org' });
  assert.deepEqual(next[1], { id: 'a', parent: 'r', text: 'A', shape: 'pill', link: 'https://example.org/' });
  validateMindNodes(next);
  next = setMindTopic(next, 'a', { shape: 'rounded', link: '' });
  assert.deepEqual(next[1], nodes[1], 'default shape and empty link are not stored');
  assert.throws(() => setMindTopic(nodes, 'a', { link: 'ftp://x' }));
  assert.throws(() => validateMindNodes([nodes[0], { ...nodes[1], shape: 'star' as MindNode['shape'] }]));
  assert.throws(() => validateMindNodes([nodes[0], { ...nodes[1], link: 'javascript:x' }]));
  assert.equal(mindShapeRx('rect'), 0);
  assert.equal(mindShapeRx(undefined), 9);
  const map = { ...createItem('mindmap', 0, 0), nodes: setMindTopic(nodes, 'a', { shape: 'underline' }) };
  roundTrip(board(map));
});

// ---- Clustering into containers ----------------------------------------------------------------
test('clusters become frames that contain and move their notes', () => {
  const notes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, k) =>
    at('note', k * 300, (k % 3) * 250, { id, fill: k < 7 ? '#a8cdff' : '#fff49b', text: id }),
  );
  const r = clusterSelection(
    board(...notes),
    notes.map(n => n.id),
    'color',
  );
  const frames = r.titleIds.map(id => r.board.items.find(i => i.id === id)!);
  assert.deepEqual(
    frames.map(f => [f.type, f.text]),
    [
      ['frame', 'Light blue (7)'],
      ['frame', 'Light yellow (1)'],
    ],
  );
  const blue = frames[0];
  const inside = frameMoveIds(r.board.items, [blue.id]).filter(id => id !== blue.id);
  assert.deepEqual(inside.sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  const xs = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => r.board.items.find(i => i.id === id)!.x));
  assert.equal(xs.size, 2, 'seven notes wrap into two columns of up to six');
  assert.ok(
    r.board.items.findIndex(i => i.id === blue.id) < r.board.items.findIndex(i => i.id === 'a'),
    'frames paint behind their notes',
  );
  roundTrip(r.board);
  const one = clusterAsOne(board(...notes), ['a', 'b', 'c', 'd']);
  const frame = one.board.items.find(i => i.id === one.frameId)!;
  assert.equal(frame.text, 'Cluster (4)');
  assert.deepEqual(
    frameMoveIds(one.board.items, [frame.id])
      .filter(id => id !== frame.id)
      .sort(),
    ['a', 'b', 'c', 'd'],
  );
  assert.throws(() => clusterAsOne(board({ ...notes[0], locked: true }), ['a']), /unlocked/);
});

// ---- Smart drawing ------------------------------------------------------------------------------
test('a smart line between two objects binds both ends; scribbles erase ink under them', () => {
  const a = at('rectangle', 0, 0, { id: 'a', w: 100, h: 80 }),
    b = at('rectangle', 400, 0, { id: 'b', w: 100, h: 80 }),
    frame = at('frame', -50, -50, { id: 'f', w: 700, h: 300 });
  const line = recognizeStroke([
    { x: 50, y: 40 },
    { x: 150, y: 41 },
    { x: 300, y: 40 },
    { x: 450, y: 40 },
  ])!;
  assert.equal(line.kind, 'line');
  assert.deepEqual(lineEnds([frame, a, b], line), { from: 'a', to: 'b' });
  assert.deepEqual(lineEnds([frame, a], line), { from: 'a' });
  assert.deepEqual(lineEnds([frame], line), {});
  const zigzag = Array.from({ length: 12 }, (_, k) => ({ x: (k % 2) * 120, y: k * 6 }));
  assert.ok(isScribble(zigzag));
  assert.ok(!isScribble(Array.from({ length: 10 }, (_, k) => ({ x: k * 50, y: 0 }))));
  const ink = at('pen', 30, 20, { id: 'ink', w: 40, h: 20 }),
    far = at('pen', 900, 900, { id: 'far', w: 40, h: 20 });
  assert.deepEqual(scribbleTargets([ink, far, a], zigzag), ['ink']);
});

// ---- Colour store ------------------------------------------------------------------------------
test('recent and saved colours dedupe, cap and survive bad storage; board colours rank by use', () => {
  assert.equal(normalizeHex('#ABC'), '#aabbcc');
  assert.equal(normalizeHex('red'), null);
  let recent: string[] = [];
  for (let k = 0; k < 14; k++) recent = pushRecent(recent, `#00000${k.toString(16)}`);
  assert.equal(recent.length, RECENT_LIMIT);
  assert.equal(recent[0], '#00000d');
  recent = pushRecent(recent, '#000005');
  assert.equal(recent[0], '#000005');
  assert.equal(new Set(recent).size, recent.length);
  let saved: string[] = [];
  for (let k = 0; k < 20; k++) saved = addSaved(saved, `#1000${k.toString(16).padStart(2, '0')}`);
  assert.equal(saved.length, SAVED_LIMIT);
  assert.equal(addSaved(saved, saved[0]), saved);
  assert.deepEqual(removeSaved(['#111111', '#222222'], '#111111'), ['#222222']);
  assert.deepEqual(parseColorList('["#FFF","nope",3,"#ffffff"]', 5), ['#ffffff']);
  assert.deepEqual(parseColorList('{bad', 5), []);
  const b = board(
    at('note', 0, 0, { fill: '#a8cdff' }),
    at('note', 0, 0, { fill: '#a8cdff' }),
    at('note', 0, 0, { fill: '#fff49b' }),
  );
  assert.deepEqual(boardColors(b), ['#a8cdff', '#fff49b']);
});

// ---- Text and frames ---------------------------------------------------------------------------
test('typed list markers become bullet or numbered lists', () => {
  assert.deepEqual(autoList('- one\n- two', undefined), { text: 'one\ntwo', format: { list: 'bullet' } });
  assert.deepEqual(autoList('1. a\n\n2) b', { bold: true }), { text: 'a\nb', format: { bold: true, list: 'number' } });
  assert.equal(autoList('- one\ntwo', undefined), null);
  assert.equal(autoList('- one', { list: 'number' }), null);
  assert.equal(autoList('-one', undefined), null);
});

test('frames sort by rows then columns and can hide their title', () => {
  const f = (id: string, x: number, y: number) => at('frame', x, y, { id, w: 400, h: 300 });
  const frames = [f('c', 0, 420), f('b', 500, 10), f('a', 0, 0), f('d', 520, 400)];
  assert.deepEqual(
    framesByPosition(frames).map(x => x.id),
    ['a', 'b', 'c', 'd'],
  );
  const b0 = sortFramesByPosition(board(...frames));
  assert.deepEqual(b0.presentation, ['a', 'b', 'c', 'd']);
  const hidden = setFrameTitleHidden(b0, 'a', true);
  assert.ok(frameTitleHidden(hidden.items.find(i => i.id === 'a')!));
  roundTrip(hidden);
  assert.ok(!frameTitleHidden(setFrameTitleHidden(hidden, 'a', false).items.find(i => i.id === 'a')!));
  assert.throws(() => parseBoard(JSON.parse(JSON.stringify(board({ ...frames[0], data: { hideTitle: 'yes' } })))));
});

// ---- Custom shapes -----------------------------------------------------------------------------
test('a selection saves as a custom shape and places again as one group with fresh ids', () => {
  const a = at('rectangle', 0, 0, { id: 'a', text: 'Server' }),
    b = at('ellipse', 300, 0, { id: 'b' }),
    ab = { ...at('arrow', 0, 0), id: 'ab', from: 'a', to: 'b' };
  const src = board(a, b, ab);
  assert.equal(customShapeName(src, ['a']), 'Server');
  assert.equal(customShapeName(src, ['a', 'b']), 'Custom shape');
  const shape = makeCustomShape(src, ['a', 'b'], 'shape-1', new Date('2026-01-01'));
  if ('error' in shape) throw new Error(shape.error);
  assert.equal(shape.count, 3, 'the connector between them is kept');
  const list = parseCustomShapes(JSON.stringify(addCustomShape([], shape)));
  assert.equal(list.length, 1);
  assert.deepEqual(parseCustomShapes('[{"id":1}]'), []);
  assert.equal(renameCustomShape(list, 'shape-1', '  Rack  ')[0].name, 'Rack');
  assert.deepEqual(removeCustomShape(list, 'shape-1'), []);
  let many = list;
  for (let k = 0; k < SHAPE_LIMIT + 3; k++) many = addCustomShape(many, { ...shape, id: 's' + k });
  assert.equal(many.length, SHAPE_LIMIT);
  const placed = placeCustomShape(board(), list[0], { x: 1000, y: 1000 })!;
  assert.equal(placed.ids.length, 3);
  const items = placed.board.items;
  assert.ok(items.every(i => !['a', 'b', 'ab'].includes(i.id)));
  const groups = new Set(items.map(i => i.group));
  assert.equal(groups.size, 1);
  assert.ok([...groups][0]);
  roundTrip(placed.board);
  assert.ok('error' in makeCustomShape(src, [], 'x', new Date()));
});

// ---- Touch and pen input -----------------------------------------------------------------------
test('pen draws, one finger pans in the pen tool, and the palm is ignored while the pen is down', () => {
  const touch = { pointerType: 'touch', pointerId: 7 },
    pen = { pointerType: 'pen', pointerId: 2 },
    mouse = { pointerType: 'mouse', pointerId: 1 };
  let s = newPenState();
  assert.equal(pointerPolicy(s, touch, 'pen', 0), 'default', 'finger-only devices keep drawing');
  assert.equal(pointerPolicy(s, mouse, 'pen', 0), 'default');
  s = penDown(s, pen);
  assert.equal(pointerPolicy(s, touch, 'pen', 10), 'ignore', 'palm while drawing');
  assert.ok(ignoreTouch(s, touch, 10));
  assert.ok(!ignoreTouch(s, pen, 10));
  s = penUp(s, pen, 100);
  assert.equal(s.penDown, null);
  assert.equal(pointerPolicy(s, touch, 'pen', 100 + PALM_GRACE_MS - 1), 'ignore', 'grace after lifting the pen');
  assert.equal(pointerPolicy(s, touch, 'pen', 100 + PALM_GRACE_MS + 1), 'pan', 'finger pans once a pen is known');
  assert.equal(pointerPolicy(s, touch, 'select', 100 + PALM_GRACE_MS + 1), 'default');
  assert.equal(pointerPolicy(s, pen, 'pen', 100), 'default');
  assert.deepEqual(penUp(s, { pointerType: 'pen', pointerId: 9 }, 500), s, 'other pen ids are ignored');
});

test('older boards without R5 fields load unchanged', () => {
  roundTrip(
    board(
      at('frame', 0, 0, { id: 'f' }),
      { ...createItem('mindmap', 0, 0), id: 'm', nodes: [{ id: 'r', parent: null, text: 'Root', color: '#4262ff' }] },
      { ...createItem('orgchart', 0, 0), id: 'o' },
      { ...createItem('storymap', 0, 0), id: 's' },
    ),
  );
});
