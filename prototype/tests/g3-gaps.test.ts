// Canvas gaps, round g3: locked linked Mermaid frames keep their code, cut takes a linked diagram whole, the shape
// inserted on a connector follows its source, resize cursors follow rotation, and multi-selection resize keeps
// rotated objects unskewed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, removeItems } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { convertToLinked, linkOf, linkState, linkedMembers, syncMermaidLinks } from '../src/mermaid-link.ts';
import { copySelection, cutIds, pastePayload } from '../src/clipboard.ts';
import { insertKindFor, insertShapeOnConnector } from '../src/diagram-gaps.ts';
import { resizeCursor, resizeItems, selectionBounds } from '../src/interactions.ts';
import { rotatedBounds } from '../src/rotation.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B{Ready?}\n  B -->|yes| C(Ship)';
const linked = (): Board => ({ version: 1, title: 'T', items: convertToLinked(FLOW, { x: 0, y: 0 }).items });
const frameOf = (b: Board) => b.items.find(i => linkOf(i))!;
const byKey = (b: Board, key: string) => b.items.find(i => i.mermaidNode?.id === key)!;
const setItem = (b: Board, id: string, change: Partial<Item>): Board => ({
  ...b,
  items: b.items.map(i => (i.id === id ? { ...i, ...change } : i)),
});

test('a locked linked frame keeps its code when an unlocked shape inside changes', () => {
  let b = linked();
  const frame = frameOf(b);
  b = setItem(b, frame.id, { locked: true });
  b = setItem(b, byKey(b, 'C').id, { text: 'Ship it' });
  const synced = syncMermaidLinks(b);
  assert.equal(linkOf(frameOf(synced))!.code, FLOW, 'code untouched');
  assert.equal(linkState(synced, frame.id), 'shapes', 'badge shows the shapes were edited');
  // Unlocking lets the next change sync again.
  const open = syncMermaidLinks(setItem(synced, frame.id, { locked: false }));
  assert.match(linkOf(frameOf(open))!.code, /C\(Ship it\)/);
  assert.equal(linkState(open, frame.id), 'synced');
});

test('a frame on a locked layer also keeps its code', () => {
  let b = linked();
  const frame = frameOf(b);
  b = { ...setItem(b, frame.id, { layer: 'L1' }), layers: [{ id: 'L1', name: 'Locked', locked: true }] } as Board;
  b = setItem(b, byKey(b, 'A').id, { text: 'Begin' });
  assert.equal(linkOf(frameOf(syncMermaidLinks(b)))!.code, FLOW);
});

test('cut on a linked frame deletes exactly what copy takes, and paste brings it back once', () => {
  const b = linked(),
    frame = frameOf(b),
    members = linkedMembers(b, frame);
  const payload = copySelection(b, [frame.id])!;
  const ids = cutIds(b, [frame.id]);
  assert.deepEqual(new Set(ids), new Set(payload.items.map(i => i.id)));
  const after = removeItems(b, ids);
  assert.equal(after.items.length, 0, 'frame, shapes and connectors gone');
  const pasted = pastePayload(after, payload, { x: 0, y: 0 }).board;
  assert.equal(pasted.items.length, members.length + 1, 'no duplicated shapes');
  assert.equal(linkState(pasted, frameOf(pasted).id), 'synced');
});

test('cut of a plain frame or other objects deletes only the selection', () => {
  const frame = { ...createItem('frame', 0, 0), w: 800, h: 600 },
    inside = createItem('rectangle', 100, 100),
    note = createItem('note', 1000, 0);
  const b: Board = { version: 1, title: '', items: [frame, inside, note] };
  assert.deepEqual(cutIds(b, [frame.id]), [frame.id]);
  assert.deepEqual(cutIds(b, [note.id, inside.id]), [note.id, inside.id]);
  // A locked linked frame does not pull in its diagram.
  const l = linked(),
    lf = frameOf(l);
  assert.deepEqual(cutIds(setItem(l, lf.id, { locked: true }), [lf.id]), [lf.id]);
});

test('the shape inserted on a connector defaults to the source kind', () => {
  const diamond = createItem('diamond', 0, 0),
    note = createItem('note', 0, 400),
    target = createItem('rectangle', 600, 0);
  const fromDiamond = { ...createItem('arrow', 0, 0), from: diamond.id, to: target.id },
    fromNote = { ...createItem('arrow', 0, 0), from: note.id, to: target.id },
    free = createItem('arrow', 0, 0);
  const b: Board = { version: 1, title: '', items: [diamond, note, target, fromDiamond, fromNote, free] };
  assert.equal(insertKindFor(b, fromDiamond.id), 'diamond');
  assert.equal(insertKindFor(b, fromNote.id), 'rectangle');
  assert.equal(insertKindFor(b, free.id), 'rectangle');
  const r = insertShapeOnConnector(b, fromDiamond.id, 'ellipse');
  assert.equal(r.shape.type, 'ellipse');
  assert.equal(r.second.from, r.shape.id);
});

test('resize cursors follow rotation, rounded to the nearest of eight', () => {
  assert.equal(resizeCursor('e'), 'ew-resize');
  assert.equal(resizeCursor('n'), 'ns-resize');
  assert.equal(resizeCursor('nw'), 'nwse-resize');
  assert.equal(resizeCursor('ne'), 'nesw-resize');
  assert.equal(resizeCursor('e', 90), 'ns-resize');
  assert.equal(resizeCursor('e', 45), 'nwse-resize');
  assert.equal(resizeCursor('se', 45), 'ns-resize');
  assert.equal(resizeCursor('n', 30), 'nesw-resize');
  assert.equal(resizeCursor('n', 20), 'ns-resize');
  assert.equal(resizeCursor('w', -45), 'nesw-resize');
  assert.equal(resizeCursor('e', 180), 'ew-resize');
  assert.equal(resizeCursor('nw', 359), 'nwse-resize');
});

test('a non-uniform multi-selection resize keeps rotated objects unskewed', () => {
  const turned: Item = { ...createItem('rectangle', 0, 0), w: 200, h: 100, rotation: 90 },
    plain = createItem('rectangle', 400, 0);
  const b: Board = { version: 1, title: '', items: [turned, plain] };
  const ids = [turned.id, plain.id],
    before = selectionBounds(b.items, ids)!,
    after = { ...before, h: before.h * 2 };
  const r = resizeItems(b, ids, before, after, true);
  const t = r.items.find(i => i.id === turned.id)!;
  // Turned 90 degrees, the object's own width runs vertically, so a taller selection makes it wider.
  assert.equal(t.rotation, 90);
  assert.ok(Math.abs(t.w - 400) < 1e-6 && Math.abs(t.h - 100) < 1e-6, `${t.w}x${t.h}`);
  const box = rotatedBounds(t, 90),
    old = rotatedBounds(turned, 90);
  assert.ok(Math.abs(box.w - old.w) < 1e-6, 'screen width unchanged');
  assert.ok(Math.abs(box.h - old.h * 2) < 1e-6, 'screen height doubled');
  // Without the flag (a single object resized in its own frame) the old behaviour stays.
  const local = resizeItems(b, [turned.id], turned, { ...turned, h: 200 });
  assert.equal(local.items.find(i => i.id === turned.id)!.h, 200);
});
