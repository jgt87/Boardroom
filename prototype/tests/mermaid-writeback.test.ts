// Shapes to code for linked sequence, class, state and ER diagrams (decision R6c-Q2): each edit on the canvas
// patches the stored code, lines the shapes cannot show stay in place, unchanged shapes give the same code back,
// and rebuilding from the written code keeps every object.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  codeFromShapes,
  convertToLinked,
  linkOf,
  linkState,
  linkedMembers,
  rebuildFromCode,
  syncMermaidLinks,
} from '../src/mermaid-link.ts';
import { SEQ_ROW } from '../src/mermaid-native.ts';
import { LinePatch, align } from '../src/mermaid-patch.ts';

const linked = (code: string): Board => ({
  version: 1,
  title: 'T',
  items: convertToLinked(code, { x: 0, y: 0 }).items,
});
const frameOf = (b: Board) => b.items.find(i => linkOf(i))!;
const codeOf = (b: Board) => linkOf(frameOf(b))!.code;
const byKey = (b: Board, key: string) => b.items.find(i => i.mermaidNode?.id === key)!;
const setItem = (b: Board, id: string, change: Partial<Item>): Board => ({
  ...b,
  items: b.items.map(i => (i.id === id ? { ...i, ...change } : i)),
});
const without = (b: Board, ...ids: string[]): Board => ({
  ...b,
  items: b.items.filter(
    i => !ids.includes(i.id) && !(i.type === 'arrow' && (ids.includes(i.from!) || ids.includes(i.to!))),
  ),
});
const add = (b: Board, ...items: Item[]): Board => ({ ...b, items: [...b.items, ...items] });
const arrow = (from: Item, to: Item, text = ''): Item => ({
  ...createItem('arrow', 0, 0),
  from: from.id,
  to: to.id,
  text,
});
/** Apply a canvas edit, sync, and check that the shapes and code agree again. */
const edit = (b: Board, change: (b: Board) => Board): Board => {
  const next = syncMermaidLinks(change(b));
  assert.equal(linkState(next, frameOf(next).id), 'synced');
  assert.doesNotThrow(() => parseBoard(next));
  return next;
};
/** Rebuilding from the written code keeps every object (same ids, texts) and stays in sync. */
function roundTrips(b: Board) {
  const frame = frameOf(b),
    r = rebuildFromCode(b, frame.id, codeOf(b)).board;
  assert.equal(linkState(r, frame.id), 'synced', 'rebuilt shapes match the code');
  const ids = (x: Board) =>
    linkedMembers(x, frameOf(x))
      .filter(i => i.type !== 'arrow' && !i.mermaidNode?.id.startsWith('x:'))
      .map(i => `${i.id}|${i.text}`)
      .sort();
  assert.deepEqual(ids(r), ids(b));
  // Writing the code again from the rebuilt shapes changes nothing.
  assert.equal(codeFromShapes(r, frame.id).code, codeOf(r));
}

test('line patches keep indentation and comments, and align lists by their common entries', () => {
  const p = new LinePatch('a\n  b %% note\n  c\n\n');
  p.replace(1, 'B');
  p.remove(2);
  p.insertAfter(0, { text: '  x', tag: 'x' });
  p.append({ text: '  end', tag: 'end' });
  const out = p.build();
  assert.equal(out.code, 'a\n  x\n  B %% note\n  end\n\n');
  assert.equal(out.lineOf.get('x'), 1);
  assert.equal(out.lineOf.get('@1'), 2);
  assert.equal(out.lineOf.get('end'), 3);
  assert.deepEqual(
    align(['a', 'b', 'c'], ['a', 'x', 'c', 'd'], (x, y) => x === y),
    [{ old: 0, next: 0, same: true }, { old: 1, next: 1 }, { old: 2, next: 2, same: true }, { next: 3 }],
  );
});

const STATE = [
  'stateDiagram-v2',
  '  %% A lifecycle',
  '  direction LR',
  '  [*] --> Still',
  '  Still --> Moving : push',
  '  Moving --> Still',
  '  Moving --> [*]',
  '  note right of Moving : fast',
  '  classDef hot fill:#f96',
].join('\n');

test('state diagrams: unchanged shapes give the same code', () => {
  const b = linked(STATE);
  assert.equal(codeFromShapes(b, frameOf(b).id).code, STATE);
  assert.equal(syncMermaidLinks(b), b);
});

test('state diagrams: renames, labels, new and deleted states and transitions rewrite the code', () => {
  let b = linked(STATE);
  b = edit(b, x => setItem(x, byKey(x, 'Still').id, { text: 'Standing still' }));
  assert.match(codeOf(b), /\n {2}Still : Standing still$/);
  b = edit(b, x => setItem(x, byKey(x, 'Still>Moving#0').id, { text: 'kick' }));
  assert.match(codeOf(b), /\n {2}Still --> Moving : kick\n/);
  b = edit(b, x => without(x, byKey(x, 'Moving>Still#0').id));
  assert.doesNotMatch(codeOf(b), /Moving --> Still/);
  const frame = frameOf(b),
    moving = byKey(b, 'Moving');
  const crashed = { ...createItem('roundrect', frame.x + 40, frame.y + frame.h - 90), w: 120, h: 50, text: 'Crashed' };
  b = edit(b, x => add(x, crashed, arrow(moving, crashed, 'oops')));
  assert.match(codeOf(b), /state Crashed\n {2}Moving --> Crashed : oops/);
  assert.equal(b.items.find(i => i.id === crashed.id)!.mermaidNode!.id, 'Crashed');
  // Comments, directions, notes and styling stay where they were.
  for (const line of [
    '  %% A lifecycle',
    '  direction LR',
    '  note right of Moving : fast',
    '  classDef hot fill:#f96',
  ])
    assert.ok(codeOf(b).split('\n').includes(line), line);
  roundTrips(b);
  // Deleting a state removes its transitions too.
  b = edit(b, x => without(x, byKey(x, 'Moving').id));
  assert.doesNotMatch(codeOf(b), /Moving -->|--> Moving/);
  roundTrips(b);
});

test('state diagrams: composite state titles and states drawn inside them', () => {
  const code =
    'stateDiagram-v2\n  [*] --> Active\n  state Active {\n    [*] --> Idle\n    Idle --> Busy : job\n  }\n  Active --> [*]';
  let b = linked(code);
  assert.equal(codeFromShapes(b, frameOf(b).id).code, code);
  b = edit(b, x => setItem(x, byKey(x, 'Active').id, { text: 'Working' }));
  assert.match(codeOf(b), /state "Working" as Active \{/);
  const group = byKey(b, 'Active'),
    busy = byKey(b, 'Busy');
  const done = { ...createItem('roundrect', group.x + 10, group.y + group.h - 80), w: 120, h: 50, text: 'Done' };
  b = edit(b, x => add(x, done, arrow(busy, done)));
  assert.match(codeOf(b), /Idle --> Busy : job\n {4}state Done\n {4}Busy --> Done\n {2}\}/);
  roundTrips(b);
});

const CLASS = [
  'classDiagram',
  '  %% A zoo',
  '  Animal <|-- Duck',
  '  Animal "1" *-- "many" Leg : has',
  '  class Duck {',
  '    <<bird>>',
  '    +swim()',
  '  }',
  '  Animal : +int age',
  '  note for Duck "quacks"',
].join('\n');

test('class diagrams: unchanged shapes give the same code', () => {
  const b = linked(CLASS);
  assert.equal(codeFromShapes(b, frameOf(b).id).code, CLASS);
});

test('class diagrams: titles, members, relations and new or deleted classes rewrite the code', () => {
  let b = linked(CLASS);
  const duck = () => byKey(b, 'Duck');
  b = edit(b, x =>
    setItem(x, duck().id, {
      data: {
        ...duck().data,
        rows: [
          { name: '+swim()', type: '' },
          { name: '+quack()', type: '' },
        ],
      },
    }),
  );
  assert.match(codeOf(b), / {4}\+swim\(\)\n {4}\+quack\(\)\n {2}\}/);
  const animal = byKey(b, 'Animal');
  b = edit(b, x => setItem(x, animal.id, { data: { ...animal.data, rows: [{ name: '+int years', type: '' }] } }));
  assert.match(codeOf(b), /\n {2}Animal : \+int years\n/);
  b = edit(b, x => setItem(x, duck().id, { text: 'Mallard' }));
  assert.match(codeOf(b), /class Duck\["Mallard"\] \{/);
  // A changed label keeps the cardinalities and the composition mark.
  b = edit(b, x => setItem(x, byKey(x, 'Animal>Leg#0').id, { text: 'owns' }));
  assert.match(codeOf(b), /Animal "1" \*-- "many" Leg : owns/);
  // A new class with a connector from it.
  const frame = frameOf(b);
  const egg = { ...createItem('entity', frame.x + 30, frame.y + frame.h - 150), text: 'Egg', data: { rows: [] } };
  b = edit(b, x => add(x, egg, { ...arrow(byKey(x, 'Duck'), egg, 'lays'), connector: { endHead: 'none' } }));
  assert.match(codeOf(b), /\n {2}class Egg\n {2}Duck -- Egg : lays$/);
  roundTrips(b);
  // Deleting a class removes its block, its relations and the note for it.
  b = edit(b, x => without(x, duck().id));
  assert.doesNotMatch(codeOf(b), /Duck/);
  assert.match(codeOf(b), /%% A zoo/);
  roundTrips(b);
});

const ER = [
  'erDiagram',
  '  CUSTOMER ||--o{ ORDER : places',
  '  CUSTOMER {',
  '    int id PK "the id"',
  '    string name',
  '  }',
  '  ORDER ||--|{ LINE-ITEM : contains',
].join('\n');

test('ER diagrams: unchanged shapes give the same code', () => {
  const b = linked(ER);
  assert.equal(codeFromShapes(b, frameOf(b).id).code, ER);
});

test('ER diagrams: names, rows, relationships and deleted entities rewrite the code', () => {
  let b = linked(ER);
  const customer = () => byKey(b, 'CUSTOMER');
  b = edit(b, x =>
    setItem(x, customer().id, {
      data: {
        ...customer().data,
        rows: [
          { name: 'id', type: 'int', key: 'PK' },
          { name: 'fullName', type: 'string' },
        ],
      },
    }),
  );
  assert.match(codeOf(b), / {4}int id PK "the id"\n {4}string fullName\n/);
  b = edit(b, x => setItem(x, customer().id, { text: 'Client' }));
  assert.match(codeOf(b), /CUSTOMER\["Client"\] \{/);
  // An entity named only in relationships gets an attribute block.
  const order = byKey(b, 'ORDER');
  b = edit(b, x =>
    setItem(x, order.id, { data: { ...order.data, rows: [{ name: 'number', type: 'int', key: 'PK' }] } }),
  );
  assert.match(codeOf(b), /\n {2}ORDER \{\n {4}int number PK\n {2}\}$/);
  const line = byKey(b, 'CUSTOMER>ORDER#0');
  b = edit(b, x =>
    setItem(x, line.id, { text: 'places many', connector: { ...line.connector, endHead: 'one-many', dash: 'dashed' } }),
  );
  assert.match(codeOf(b), /CUSTOMER \|\|\.\.\|\{ ORDER : "places many"/);
  roundTrips(b);
  b = edit(b, x => without(x, byKey(x, 'LINE-ITEM').id));
  assert.doesNotMatch(codeOf(b), /LINE-ITEM/);
  roundTrips(b);
});

const SEQ = [
  'sequenceDiagram',
  '  autonumber',
  '  participant A as Alice',
  '  A->>B: Hello',
  '  loop Every minute',
  '    B-->>A: Ping',
  '    A-x B: Ack',
  '  end',
  '  Note over A,B: done',
  '  %% the end',
].join('\n');

test('sequence diagrams: unchanged shapes give the same code', () => {
  const b = linked(SEQ);
  assert.equal(codeFromShapes(b, frameOf(b).id).code, SEQ);
  assert.equal(syncMermaidLinks(b), b);
});

test('sequence diagrams: participants, messages and notes rewrite the code', () => {
  let b = linked(SEQ);
  b = edit(b, x => setItem(x, byKey(x, 'p:A').id, { text: 'Alicia' }));
  assert.match(codeOf(b), /\n {2}participant A as Alicia\n/);
  // B has no declaration: one is added after A's, so the columns keep their order.
  b = edit(b, x => setItem(x, byKey(x, 'p:B').id, { text: 'Bob', type: 'roundrect' }));
  assert.match(codeOf(b), /participant A as Alicia\n {2}actor B as Bob\n {2}A->>B: Hello/);
  // A changed label keeps the arrow as written.
  b = edit(b, x => setItem(x, byKey(x, 's:2').id, { text: 'Acked' }));
  assert.match(codeOf(b), /\n {4}A-xB: Acked\n/);
  // A dashed line and an open head.
  const hello = byKey(b, 's:0');
  b = edit(b, x => setItem(x, hello.id, { connector: { ...hello.connector, dash: 'dashed', endHead: 'open' } }));
  assert.match(codeOf(b), /\n {2}A--\)B: Hello\n/);
  // A new message drawn below the note goes last; the comment stays before it.
  const frame = frameOf(b),
    a = byKey(b, 'p:A'),
    bob = byKey(b, 'p:B');
  const y = byKey(b, 's:3').y + 80;
  const bye = { ...createItem('arrow', a.x + a.w / 2, y), w: bob.x - a.x, h: 0, text: 'Bye' };
  assert.ok(frame.y + frame.h > y);
  b = edit(b, x => add(x, bye));
  assert.match(codeOf(b), /Note over A,B: done\n {2}%% the end\n {2}A->>B: Bye$/);
  roundTrips(b);
});

test('sequence diagrams: moving a message line up or down reorders the messages', () => {
  let b = linked(SEQ);
  const hello = byKey(b, 's:0'),
    ack = byKey(b, 's:2');
  // Hello moves below Ack, still inside the loop.
  b = edit(b, x => setItem(x, hello.id, { y: ack.y + SEQ_ROW / 4 }));
  assert.match(codeOf(b), /loop Every minute\n {4}B-->>A: Ping\n {4}A-x B: Ack\n {4}A->>B: Hello\n {2}end/);
  assert.equal(byKey(b, 's:2').id, hello.id, 'keys follow the new order');
  // Ping moves above the loop.
  const ping = byKey(b, 's:0');
  b = edit(b, x => setItem(x, ping.id, { y: ping.y - SEQ_ROW * 1.5 }));
  assert.match(codeOf(b), /participant A as Alice\n {2}B-->>A: Ping\n {2}loop Every minute\n/);
  roundTrips(b);
});

test('sequence diagrams: dragging a message end to another column changes who receives it', () => {
  const code = 'sequenceDiagram\n  Alice->>Bob: Hi\n  Bob->>Carol: Pass\n  Carol-->>Alice: Done';
  let b = linked(code);
  const hi = byKey(b, 's:0'),
    carol = byKey(b, 'p:Carol');
  b = edit(b, x => setItem(x, hi.id, { w: carol.x + carol.w / 2 - hi.x + 20 }));
  assert.equal(codeOf(b), 'sequenceDiagram\n  Alice->>Carol: Hi\n  Bob->>Carol: Pass\n  Carol-->>Alice: Done');
  // A small nudge that stays near the same column changes nothing.
  const pass = byKey(b, 's:1');
  const nudged = syncMermaidLinks(setItem(b, pass.id, { x: pass.x + 12 }));
  assert.equal(codeOf(nudged), codeOf(b));
  roundTrips(b);
});

test('when both sides changed, writing from the shapes lets the shapes win', () => {
  let b = linked(STATE);
  const id = frameOf(b).id;
  b = {
    ...b,
    items: b.items.map(i =>
      i.id === id ? { ...i, data: { mermaid: { ...linkOf(i)!, code: STATE + '\n  Still --> Gone' } } } : i,
    ),
  };
  b = setItem(b, byKey(b, 'Moving').id, { text: 'Rolling' });
  assert.equal(syncMermaidLinks(b), b, 'no automatic sync while the code has its own edits');
  const r = codeFromShapes(b, id).board;
  assert.match(codeOf(r), /Moving : Rolling/);
  assert.doesNotMatch(codeOf(r), /Gone/, 'code-only edits give way to the shapes');
  assert.equal(linkState(r, id), 'synced');
});

test('sequence diagrams: deleting a participant removes its messages; blocks stay unless their frame goes', () => {
  let b = linked(SEQ);
  b = edit(b, x => without(x, byKey(x, 'b:0').id));
  assert.doesNotMatch(codeOf(b), /loop|^\s*end$/m);
  assert.match(
    codeOf(b),
    /\n {2}A->>B: Hello\n {2}B-->>A: Ping\n {2}A-x B: Ack\n {2}Note/,
    'steps of a deleted block stay',
  );
  b = edit(b, x => without(x, byKey(x, 'p:B').id));
  assert.doesNotMatch(codeOf(b), /->>B|B-->>|A-x B/);
  assert.match(codeOf(b), /Note over A: done/);
  roundTrips(b);
});

test('a locked frame keeps its code for every diagram kind', () => {
  for (const code of [STATE, CLASS, ER, SEQ]) {
    let b = linked(code);
    const frame = frameOf(b),
      node = linkedMembers(b, frame).find(m => m.type !== 'arrow' && m.type !== 'frame')!;
    b = setItem(setItem(b, frame.id, { locked: true }), node.id, { text: 'Renamed' });
    const synced = syncMermaidLinks(b);
    assert.equal(codeOf(synced), code);
    assert.equal(linkState(synced, frame.id), 'shapes');
  }
});
