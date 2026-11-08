// Diagrams converted from Mermaid stay linked to their code: conversion keeps the code, rebuilding keeps moved
// shapes, shape edits rewrite flowchart code, divergence is detected, and copies keep a working link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  codeFromShapes,
  convertToLinked,
  keepShapes,
  linkOf,
  linkState,
  linkedMembers,
  rebuildFromCode,
  storeCode,
  syncMermaidLinks,
  unlinkMermaid,
} from '../src/mermaid-link.ts';
import { duplicateItems } from '../src/arrange.ts';
import { copySelection, pastePayload } from '../src/clipboard.ts';
import { mermaidToNative, parseFlowchart } from '../src/mermaid-native.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B{Ready?}\n  B -->|yes| C(Ship)\n  B -- no --> D[(Backlog)]';
const linked = (code = FLOW): Board => ({ version: 1, title: 'T', items: convertToLinked(code, { x: 0, y: 0 }).items });
const frameOf = (b: Board) => b.items.find(i => linkOf(i))!;
const byKey = (b: Board, key: string) => b.items.find(i => i.mermaidNode?.id === key)!;
const setItem = (b: Board, id: string, change: Partial<Item>): Board => ({
  ...b,
  items: b.items.map(i => (i.id === id ? { ...i, ...change } : i)),
});

test('converting keeps the code on a frame that holds the marked shapes and connectors', () => {
  const b = linked(),
    frame = frameOf(b),
    link = linkOf(frame)!;
  assert.equal(frame.type, 'frame');
  assert.equal(frame.text, 'Flowchart');
  assert.equal(link.code, FLOW);
  assert.equal(link.kind, 'flowchart');
  assert.deepEqual(
    b.items
      .filter(i => i.type !== 'arrow' && i !== frame)
      .map(i => i.mermaidNode!.id)
      .sort(),
    ['A', 'B', 'C', 'D'],
  );
  assert.equal(b.items.filter(i => i.type === 'arrow' && i.mermaidNode?.frame === frame.id).length, 3);
  assert.equal(linkedMembers(b, frame).length, 7);
  assert.equal(linkState(b, frame.id), 'synced');
  assert.doesNotThrow(() => parseBoard(b));
  // The plain conversion is unchanged and still has no links.
  assert.ok(mermaidToNative(FLOW, { x: 0, y: 0 }).items.every(i => !i.mermaidNode));
});

test('rebuilding from code keeps moved nodes, adds and removes nodes, and rebuilds connectors', () => {
  let b = linked();
  const frame = frameOf(b),
    a = byKey(b, 'A');
  b = setItem(b, a.id, { x: a.x - 7, y: a.y + 13, fill: '#ffc9c9', w: 222 });
  b = syncMermaidLinks(b); // moving alone is not a code change
  assert.equal(linkOf(frameOf(b))!.code, FLOW);
  const code = 'flowchart LR\n  A[Begin] --> B{Ready?}\n  B -->|yes| E[New step]';
  const r = rebuildFromCode(b, frame.id, code).board;
  const a2 = byKey(r, 'A');
  assert.equal(a2.id, a.id, 'same object');
  assert.deepEqual([a2.x, a2.y, a2.w, a2.fill, a2.text], [a.x - 7, a.y + 13, 222, '#ffc9c9', 'Begin']);
  assert.ok(byKey(r, 'E'), 'new node placed');
  assert.equal(byKey(r, 'C'), undefined, 'removed node deleted');
  assert.equal(byKey(r, 'D'), undefined);
  const arrows = r.items.filter(i => i.type === 'arrow');
  assert.equal(arrows.length, 2);
  assert.ok(arrows.every(e => r.items.some(i => i.id === e.from) && r.items.some(i => i.id === e.to)));
  assert.equal(linkOf(frameOf(r))!.code, code);
  assert.equal(linkState(r, frame.id), 'synced');
  // Every object still sits in the (refitted) frame.
  assert.equal(linkedMembers(r, frameOf(r)).length, 5);
  assert.doesNotThrow(() => parseBoard(r));
});

test('shape edits on a linked flowchart rewrite its code with stable ids', () => {
  let b = linked();
  const frame = frameOf(b),
    c = byKey(b, 'C');
  b = setItem(b, c.id, { text: 'Ship it [now]' });
  assert.equal(linkState(b, frame.id), 'shapes');
  b = syncMermaidLinks(b);
  const code = linkOf(frameOf(b))!.code;
  assert.match(code, /^flowchart LR/);
  assert.match(code, /C\("Ship it #91;now#93;"\)/);
  assert.match(code, /A\[Start\]/);
  assert.match(code, /B -->\|yes\| C/);
  assert.equal(linkState(b, frame.id), 'synced');
  // The code parses back to the same label.
  assert.equal(parseFlowchart(code).nodes.find(n => n.id === 'C')!.label, 'Ship it [now]');
  // A shape drawn inside the frame joins the diagram with a fresh id, and a connector to it becomes an edge.
  const inside = { ...createItem('hexagon', frame.x + 60, frame.y + frame.h - 140), text: 'Extra' };
  const line = { ...createItem('arrow', 0, 0), from: c.id, to: inside.id };
  b = syncMermaidLinks({ ...b, items: [...b.items, inside, line] });
  const after = linkOf(frameOf(b))!.code;
  assert.match(after, /n1\{\{Extra\}\}/);
  assert.match(after, /C --> n1/);
  assert.equal(b.items.find(i => i.id === inside.id)!.mermaidNode!.id, 'n1');
  // Deleting a shape removes it and its edges from the code.
  b = syncMermaidLinks({ ...b, items: b.items.filter(i => i.id !== byKey(b, 'D').id) });
  assert.doesNotMatch(linkOf(frameOf(b))!.code, /\bD\b/);
});

test('rebuilding the rewritten code round-trips without changes', () => {
  let b = linked('flowchart TB\n  subgraph G1 [Group]\n    A --> B\n  end\n  B -.-> C\n  C ==> A\n  style A fill:#f9f');
  const frame = frameOf(b);
  b = setItem(b, byKey(b, 'B').id, { text: 'Bee' });
  b = syncMermaidLinks(b);
  const code = linkOf(frameOf(b))!.code;
  assert.match(code, /subgraph G1 \[Group\]/);
  assert.match(code, /B -\.-> C/);
  assert.match(code, /C ==> A/);
  assert.match(code, /style A fill:#f9f/);
  const r = rebuildFromCode(b, frame.id, code).board;
  assert.equal(linkState(r, frame.id), 'synced');
  assert.deepEqual(
    r.items.filter(i => i.type !== 'arrow').map(i => [i.id, i.x, i.y, i.text]),
    b.items.filter(i => i.type !== 'arrow').map(i => [i.id, i.x, i.y, i.text]),
  );
});

test('divergence: code edited, shapes edited, or both, and the two ways to resolve it', () => {
  let b = linked();
  const id = frameOf(b).id;
  b = storeCode(b, id, FLOW + '\n  D --> A');
  assert.equal(linkState(b, id), 'code');
  // Shapes change while the code is ahead: no automatic sync, both sides are flagged.
  b = setItem(b, byKey(b, 'A').id, { text: 'Kick-off' });
  assert.equal(syncMermaidLinks(b), b);
  assert.equal(linkState(b, id), 'both');
  const fromShapes = codeFromShapes(b, id).board;
  assert.equal(linkState(fromShapes, id), 'synced');
  assert.match(linkOf(frameOf(fromShapes))!.code, /A\[Kick-off\]/);
  assert.doesNotMatch(linkOf(frameOf(fromShapes))!.code, /D --> A/);
  const fromCode = rebuildFromCode(b, id, linkOf(frameOf(b))!.code).board;
  assert.equal(linkState(fromCode, id), 'synced');
  assert.equal(byKey(fromCode, 'A').text, 'Start');
  assert.ok(fromCode.items.some(i => i.mermaidNode?.id === 'D>A#0'));
  // An empty frame (diagram deleted) is reported instead of writing empty code.
  const empty = { ...b, items: b.items.filter(i => !i.mermaidNode) };
  assert.equal(linkState(empty, id), 'empty');
  assert.equal(syncMermaidLinks(empty), empty);
});

test('sequence diagrams sync both ways (decision R6c-Q2)', () => {
  let b = linked('sequenceDiagram\n  Alice->>Bob: Hi\n  Bob-->>Alice: Hello');
  const id = frameOf(b).id;
  assert.equal(linkOf(frameOf(b))!.kind, 'sequence');
  b = setItem(b, byKey(b, 'p:Alice').id, { text: 'Alicia', fill: '#d0ebff' });
  assert.equal(linkState(b, id), 'shapes');
  assert.equal(linkState(keepShapes(b, id), id), 'synced', 'shape edits can still be accepted without a rewrite');
  b = syncMermaidLinks(b);
  assert.match(linkOf(frameOf(b))!.code, /participant Alice as Alicia\n {2}participant Bob\n {2}Alice->>Bob: Hi/);
  assert.equal(byKey(b, 'p:Alice:end').text, 'Alicia', 'the bottom box shows the new name too');
  assert.equal(linkState(b, id), 'synced');
  const r = rebuildFromCode(
    b,
    id,
    'sequenceDiagram\n  Alice->>Bob: Hi\n  Bob-->>Alice: Hello\n  Alice->>Bob: Bye',
  ).board;
  const alice = byKey(r, 'p:Alice');
  assert.deepEqual([alice.text, alice.fill], ['Alice', '#d0ebff']);
  assert.equal(r.items.filter(i => i.type === 'arrow' && i.text).length, 3);
  assert.equal(linkState(r, id), 'synced');
});

test('class, state and ER diagrams keep moved objects and take rows and labels from the code', () => {
  let b = linked('erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    int id PK\n  }');
  const id = frameOf(b).id,
    customer = byKey(b, 'CUSTOMER');
  b = setItem(b, customer.id, { x: customer.x + 30 });
  const r = rebuildFromCode(
    b,
    id,
    'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    int id PK\n    string name\n  }',
  ).board;
  const c2 = byKey(r, 'CUSTOMER');
  assert.deepEqual([c2.id, c2.x], [customer.id, customer.x + 30]);
  assert.equal(c2.data!.rows.length, 2);
  assert.equal(r.items.find(i => i.type === 'arrow')!.text, 'places');
  for (const code of ['classDiagram\n  Animal <|-- Duck', 'stateDiagram-v2\n  [*] --> Still\n  Still --> Moving']) {
    const s = linked(code);
    assert.equal(linkState(s, frameOf(s).id), 'synced');
    assert.equal(linkState(rebuildFromCode(s, frameOf(s).id, code).board, frameOf(s).id), 'synced');
  }
});

test('locks block a rebuild and unlinking', () => {
  const b = linked(),
    id = frameOf(b).id;
  const locked = setItem(b, byKey(b, 'A').id, { locked: true });
  assert.throws(() => rebuildFromCode(locked, id, FLOW), /Unlock/);
  assert.throws(() => unlinkMermaid(setItem(b, id, { locked: true }), id), /Unlock the frame/);
});

test('unlinking keeps the shapes and drops the code and keys', () => {
  const b = linked(),
    id = frameOf(b).id;
  const u = unlinkMermaid(b, id);
  assert.equal(u.items.length, b.items.length);
  assert.ok(u.items.every(i => !i.mermaidNode && !linkOf(i)));
  assert.equal(u.items.find(i => i.id === id)!.data, undefined);
  assert.doesNotThrow(() => parseBoard(u));
});

test('parseBoard accepts links and rejects malformed ones', () => {
  const b = linked();
  assert.doesNotThrow(() => parseBoard(b));
  const frame = frameOf(b),
    link = linkOf(frame)!;
  const withLink = (mermaid: unknown) =>
    parseBoard({ ...b, items: b.items.map(i => (i.id === frame.id ? { ...i, data: { mermaid } } : i)) });
  assert.throws(() => withLink({ ...link, code: 'x'.repeat(6001) }), /Mermaid link/);
  assert.throws(() => withLink({ ...link, kind: 'pie' }), /Mermaid link/);
  assert.throws(() => withLink({ ...link, codeHash: 'zz' }), /Mermaid link/);
  assert.throws(() => withLink({ ...link, extra: 1 }), /Mermaid link/);
  assert.throws(() => withLink('flowchart'), /Mermaid link/);
  const node = (mermaidNode: unknown) =>
    parseBoard({ ...b, items: b.items.map((i, k) => (k === 1 ? { ...i, mermaidNode } : i)) });
  assert.throws(() => node({ frame: frame.id, id: '' }), /Mermaid diagram reference/);
  assert.throws(() => node({ frame: frame.id, id: 'x'.repeat(201) }), /Mermaid diagram reference/);
  assert.throws(() => node({ frame: frame.id, id: 'a\nb' }), /Mermaid diagram reference/);
  assert.throws(() => node({ frame: 7, id: 'A' }), /Mermaid diagram reference/);
  assert.throws(() => node('A'), /Mermaid diagram reference/);
});

test('duplicate and paste copy the whole diagram with a working, independent link', () => {
  const b = linked(),
    frame = frameOf(b);
  const check = (board: Board, ids: string[]) => {
    const copy = board.items.find(i => ids.includes(i.id) && linkOf(i))!;
    assert.ok(copy && copy.id !== frame.id);
    const members = linkedMembers(board, copy);
    assert.equal(members.length, 7);
    assert.ok(members.every(m => ids.includes(m.id)));
    assert.ok(members.filter(m => m.type !== 'arrow').every(m => m.mermaidNode!.frame === copy.id));
    assert.equal(linkState(board, copy.id), 'synced');
    assert.equal(linkState(board, frame.id), 'synced');
    assert.doesNotThrow(() => parseBoard(board));
  };
  const dup = duplicateItems(b, [frame.id], { x: frame.w + 100, y: 0 });
  assert.equal(dup.ids.length, 8);
  check(dup.board, dup.ids);
  const payload = copySelection(b, [frame.id])!;
  assert.equal(payload.items.length, 8);
  const pasted = pastePayload(b, payload, { x: 5000, y: 0 });
  check(pasted.board, pasted.ids);
  // A single copied shape leaves the diagram reference behind; dropped into the frame, it joins with a new id.
  const one = duplicateItems(b, [byKey(b, 'A').id], { x: 0, y: 0 });
  const copy = one.board.items.find(i => i.id === one.ids[0])!;
  assert.equal(copy.mermaidNode, undefined);
  const synced = syncMermaidLinks(one.board);
  assert.equal(synced.items.find(i => i.id === copy.id)!.mermaidNode!.id, 'n1');
  assert.match(linkOf(frameOf(synced))!.code, /n1\[Start\]/);
});
