// Decided open questions (round 2): remembered video speed (P2-Q1), cuts drawn on the Talktrack waveform (P2-Q3),
// hit-testable callout tails (P2-Q5), status chips on Mermaid-linked frames (P2-Q7) and multi-page draw.io
// import as native shapes (P2-Q4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  PLAYBACK_RATES,
  cutEdgeAt,
  cutFromDrag,
  storedRate,
  timeAtX,
  validRate,
  withRate,
} from '../src/media-playback.ts';
import { mediaSpecs } from '../src/specs-media.ts';
import { calloutTailAt, pointOnCalloutTail, setCalloutTail } from '../src/diagram-extras.ts';
import { moveConnectorEndpoint } from '../src/connector-geometry.ts';
import { convertToLinked, linkState, unlinkMermaid } from '../src/mermaid-link.ts';
import { withItemStatus } from '../src/board-settings.ts';
import { drawioImportNote, drawioPages, drawioToItems, convertDrawioWidget } from '../src/drawio-shapes.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const roundTrip = (b: Board) => parseBoard(JSON.parse(JSON.stringify(b)));
const make = (t: Item['type'], x: number, y: number, f?: string) => createItem(t, x, y, f);

// ---- P2-Q1: remembered playback speed ------------------------------------------------------------------
test('a video remembers one of the offered speeds; normal speed removes the field', () => {
  assert.ok(PLAYBACK_RATES.every(r => validRate(r)));
  assert.equal(validRate(3), false);
  assert.equal(validRate('1.5'), false);
  assert.equal(storedRate(undefined), 1);
  assert.equal(storedRate(1.5), 1.5);
  assert.equal(storedRate(7), 1);
  const data: { duration: number; rate?: number } = { duration: 4 };
  const fast = withRate(data, 1.5);
  assert.deepEqual(fast, { duration: 4, rate: 1.5 });
  assert.equal(withRate(fast, 1.5), fast, 'unchanged data is returned as is');
  assert.deepEqual(withRate(fast, 1), { duration: 4 });
  assert.equal(withRate(data, 1), data);
  assert.deepEqual(withRate(data, 9), data, 'unknown speeds are not stored');
});

test('the remembered speed survives a reload and bad speeds are refused', () => {
  const video = { ...createItem('video', 0, 0), assetId: 'v1', data: { duration: 4, rate: 0.75 } };
  assert.equal(roundTrip(board(video)).items[0].data?.rate, 0.75);
  const spec = mediaSpecs.find(s => s.kind === 'video')!;
  assert.throws(() => spec.validate!({ ...video, data: { rate: 1.1 } }), /speed/);
  assert.throws(() => roundTrip(board({ ...video, data: { rate: 'fast' } })), /speed/);
});

// ---- P2-Q3: cuts drawn on the waveform -----------------------------------------------------------------
test('pointer positions on the waveform map to tenths of a second inside the recording', () => {
  assert.equal(timeAtX(50, 200, 10), 2.5);
  assert.equal(timeAtX(-20, 200, 10), 0);
  assert.equal(timeAtX(400, 200, 10), 10);
  assert.equal(timeAtX(33, 200, 10), 1.7);
  assert.equal(timeAtX(10, 0, 10), 0);
  assert.equal(timeAtX(10, 200, 0), 0);
});

test('a drag draws a cut either way round, and a drag on a cut edge moves only that edge', () => {
  assert.deepEqual(cutFromDrag(4, 2.04, 10), { start: 2, end: 4 });
  assert.deepEqual(cutFromDrag(8, 12, 10), { start: 8, end: 10 });
  assert.deepEqual(cutFromDrag(1, -3, 10), { start: 0, end: 1 });
  const cuts = [
    { start: 1, end: 2 },
    { start: 5, end: 6 },
  ];
  assert.deepEqual(cutEdgeAt(2.05, cuts, 0.2), { index: 0, edge: 'end', anchor: 1 });
  assert.deepEqual(cutEdgeAt(4.9, cuts, 0.2), { index: 1, edge: 'start', anchor: 6 });
  assert.equal(cutEdgeAt(3.5, cuts, 0.2), null);
  // Half-typed cuts (not yet times on both ends) are never grabbed: they have no anchor.
  assert.equal(cutEdgeAt(1, [{ start: NaN, end: 1 }], 0.2), null);
  // Dragging the end edge of cut 0 to 3 keeps its start as the anchor.
  const grab = cutEdgeAt(2, cuts, 0.2)!;
  assert.deepEqual(cutFromDrag(grab.anchor, 3, 10), { start: 1, end: 3 });
  // Dragged across the anchor, the edge becomes the start.
  assert.deepEqual(cutFromDrag(grab.anchor, 0.5, 10), { start: 0.5, end: 1 });
});

// ---- P2-Q5: callout tails are hit-testable --------------------------------------------------------------
test('a point on a custom callout tail hits the callout; the built-in tail needs no extra test', () => {
  const bubble = { ...createItem('callout', 0, 0), id: 'c', w: 200, h: 100 };
  assert.equal(pointOnCalloutTail(bubble, [bubble], { x: 40, y: 99 }), false, 'built-in tail: box hit test');
  const b = setCalloutTail(board(bubble), 'c', { x: 100, y: 300 });
  const c = b.items[0];
  // The tail runs from the bubble centre (100, 39) to (100, 300): a point near the tip is on it.
  assert.equal(pointOnCalloutTail(c, b.items, { x: 100, y: 290 }), true);
  assert.equal(pointOnCalloutTail(c, b.items, { x: 103, y: 260 }), true);
  assert.equal(pointOnCalloutTail(c, b.items, { x: 160, y: 260 }), false);
  // A few units of tolerance beyond the tip.
  assert.equal(pointOnCalloutTail(c, b.items, { x: 100, y: 303 }), true);
  assert.equal(pointOnCalloutTail(c, b.items, { x: 100, y: 303 }, 1), false);
  assert.equal(calloutTailAt(b.items, { x: 100, y: 290 })?.id, 'c');
  assert.equal(calloutTailAt(b.items, { x: 400, y: 400 }), undefined);
  // Hidden callouts and other kinds are never hit.
  assert.equal(pointOnCalloutTail({ ...c, hidden: true }, b.items, { x: 100, y: 290 }), false);
  assert.equal(pointOnCalloutTail({ ...c, type: 'rectangle' }, b.items, { x: 100, y: 290 }), false);
});

test('rotated callouts and thought bubbles are hit along their tails', () => {
  const bubble = { ...createItem('callout', 0, 0), id: 'c', w: 200, h: 100 };
  const b = setCalloutTail(board(bubble), 'c', { x: 100, y: 300 });
  // Turned half a turn about its centre (100, 50): the tail now points up, ending near (100, -200).
  const turned = { ...b.items[0], rotation: 180 };
  assert.equal(pointOnCalloutTail(turned, [turned], { x: 100, y: -190 }), true);
  assert.equal(pointOnCalloutTail(turned, [turned], { x: 100, y: 290 }), false);
  const cloud = { ...createItem('thought', 0, 0), id: 't', w: 200, h: 100 };
  const tb = setCalloutTail(board(cloud), 't', { x: 100, y: 300 });
  assert.equal(pointOnCalloutTail(tb.items[0], tb.items, { x: 100, y: 295 }), true);
  assert.equal(pointOnCalloutTail(tb.items[0], tb.items, { x: 150, y: 250 }), false);
});

test('a connector end dropped on a callout tail attaches to the callout', () => {
  const bubble = { ...createItem('callout', 0, 0), id: 'c', w: 200, h: 100 };
  const line = { ...createItem('arrow', 500, 500), id: 'l', w: 100, h: 0 };
  const b = setCalloutTail(board(bubble, line), 'c', { x: 100, y: 300 });
  const moved = moveConnectorEndpoint(b, 'l', 'end', { x: 100, y: 280 });
  assert.equal(moved.items.find(i => i.id === 'l')!.to, 'c');
});

// ---- P2-Q7: status chip on Mermaid-linked frames --------------------------------------------------------
test('a Mermaid-linked frame keeps a status that survives reload, sync and unlinking', () => {
  const linked = convertToLinked('flowchart TD\n  A[Start] --> B[End]', { x: 0, y: 0 });
  let b = board(...linked.items);
  const frameId = linked.frame.id;
  b = {
    ...b,
    items: b.items.map(i => (i.id === frameId ? { ...i, data: withItemStatus(i.data ?? {}, 'review') } : i)),
  };
  const loaded = roundTrip(b);
  assert.equal(loaded.items.find(i => i.id === frameId)!.data?.status, 'review');
  // The status is not part of the diagram: the link stays in sync.
  assert.equal(linkState(loaded, frameId), linkState(board(...linked.items), frameId));
  // Bad statuses are refused on frames as on Mermaid objects.
  const bad = {
    ...b,
    items: b.items.map(i => (i.id === frameId ? { ...i, data: { ...i.data, status: 'someday' } } : i)),
  };
  assert.throws(() => roundTrip(bad), /status/i);
  // Unlinking keeps the status, so the chip never hides a stored value.
  const unlinked = unlinkMermaid(loaded, frameId);
  assert.deepEqual(unlinked.items.find(i => i.id === frameId)!.data, { status: 'review' });
  roundTrip(unlinked);
});

// ---- P2-Q4: every page of a draw.io file ----------------------------------------------------------------
const page = (name: string, label: string, x = 0) =>
  `<diagram id="${name}" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
  `<mxCell id="a" value="${label} A" vertex="1" parent="1"><mxGeometry x="${x}" y="0" width="120" height="60" as="geometry"/></mxCell>` +
  `<mxCell id="b" value="${label} B" vertex="1" parent="1"><mxGeometry x="${x + 200}" y="100" width="120" height="60" as="geometry"/></mxCell>` +
  `<mxCell id="e" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>` +
  `</root></mxGraphModel></diagram>`;

test('every page of a draw.io file is read with its name; unreadable pages are counted', () => {
  const file = `<mxfile>${page('Overview', 'O')}<diagram name="Broken">%%%</diagram>${page('Detail', 'D')}</mxfile>`;
  const r = drawioPages(file);
  assert.deepEqual(
    r.pages.map(p => p.name),
    ['Overview', 'Detail'],
  );
  assert.equal(r.unreadable, 1);
  assert.throws(() => drawioPages('<mxfile><diagram>%%%</diagram></mxfile>'), /could not/);
  // A bare model is one unnamed page.
  assert.equal(drawioPages('<mxGraphModel><root/></mxGraphModel>').pages.length, 1);
});

test('a multi-page draw.io file becomes one frame per page, side by side, centred on the drop point', () => {
  const file = `<mxfile>${page('Overview', 'O')}${page('Detail', 'D', 500)}<diagram name="Empty"><mxGraphModel><root><mxCell id="0"/></root></mxGraphModel></diagram></mxfile>`;
  const r = drawioToItems(file, { x: 1000, y: 500 }, make);
  const frames = r.items.filter(i => i.type === 'frame');
  assert.deepEqual(
    frames.map(f => f.text),
    ['Overview', 'Detail'],
  );
  assert.equal(r.shapes, 4);
  assert.equal(r.connectors, 2);
  assert.equal(r.pages, 3);
  assert.equal(r.imported, 2);
  assert.equal(r.unreadable, 1, 'the empty page is left out');
  // Each page's objects sit inside its frame, with padding; the frames do not overlap.
  const [one, two] = frames;
  const inside = (f: Item, i: Item) => i.x >= f.x && i.y >= f.y && i.x + i.w <= f.x + f.w && i.y + i.h <= f.y + f.h;
  const shapes = r.items.filter(i => i.type === 'rectangle');
  assert.ok(shapes.filter(s => s.text.startsWith('O')).every(s => inside(one, s)));
  assert.ok(shapes.filter(s => s.text.startsWith('D')).every(s => inside(two, s)));
  assert.ok(two.x >= one.x + one.w + 100);
  assert.equal(one.y, two.y);
  // Connectors keep their ends on the same page.
  for (const line of r.items.filter(i => i.type === 'arrow')) {
    const from = r.items.find(i => i.id === line.from)!,
      to = r.items.find(i => i.id === line.to)!;
    assert.equal(from.text[0], to.text[0]);
  }
  // Frames come before their contents; the whole row is centred on the drop point.
  assert.equal(r.items[0].type, 'frame');
  const minX = Math.min(...frames.map(f => f.x)),
    maxX = Math.max(...frames.map(f => f.x + f.w));
  assert.ok(Math.abs((minX + maxX) / 2 - 1000) <= 1);
  assert.match(drawioImportNote(r), /2 pages sit side by side/);
  assert.match(drawioImportNote(r), /1 of 3 pages was left out/);
  roundTrip(board(...r.items));
  // A single-page file still imports without a page frame.
  const single = drawioToItems(`<mxfile>${page('Only', 'S')}</mxfile>`, { x: 0, y: 0 }, make);
  assert.equal(single.items.filter(i => i.type === 'frame').length, 0);
  assert.doesNotMatch(drawioImportNote(single), /pages/);
});

test('converting a multi-page draw.io object keeps every page', () => {
  const file = `<mxfile>${page('One', 'O')}${page('Two', 'T')}</mxfile>`;
  const widget = { ...createItem('drawio', 0, 0), id: 'w', data: { xml: file } };
  const made = convertDrawioWidget(board(widget), 'w', make)!;
  assert.deepEqual(
    made.board.items.filter(i => i.type === 'frame').map(f => f.text),
    ['One', 'Two'],
  );
  assert.ok(!made.board.items.some(i => i.id === 'w'));
});
