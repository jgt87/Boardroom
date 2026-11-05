// Track R2-H: connector label drag and style, callout tails attached to objects, diagram templates,
// org chart custom fields, Timeline drop dates and draw.io import as native shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, strToU8 } from 'fflate';
import { createItem, newBoard, parseBoard, removeItems, calloutTailTip } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { addConnectorLabel } from '../src/diagram-gaps.ts';
import {
  moveConnectorLabel,
  setConnectorLabelStyle,
  setCalloutTail,
  resetCalloutTail,
  tailTip,
  defaultTailTip,
  calloutPaths,
} from '../src/diagram-extras.ts';
import { duplicateItems } from '../src/arrange.ts';
import { templateItems, templateNames } from '../src/board-tools.ts';
import { filterTemplates, templateCatalog } from '../src/starter-templates.ts';
import { diagramTemplateNames } from '../src/diagram-templates.ts';
import {
  orgFromCsv,
  orgToCsv,
  orgMeta,
  orgFieldNames,
  setOrgField,
  validateOrgNodes,
  validateOrgCardFields,
  ORG_CSV_HEADER,
} from '../src/orgchart.ts';
import type { OrgNode } from '../src/orgchart.ts';
import { copyToRecords, timelineDropDates } from '../src/record-canvas.ts';
import {
  drawioToItems,
  drawioModel,
  parseStyle,
  vertexKind,
  labelText,
  convertDrawioWidget,
  drawioImportNote,
} from '../src/drawio-shapes.ts';

const make = (t: Item['type'], x: number, y: number, f?: string) => createItem(t, x, y, f);
const boardWith = (...items: Item[]): Board => ({ ...newBoard(), items });
const roundTrip = (b: Board) => parseBoard(JSON.parse(JSON.stringify(b)));

// ---- 1. Connector labels -----------------------------------------------------------------------------

test('extra labels move along the line and take a colour and size; main label too', () => {
  const a = { ...createItem('rectangle', 0, 0), id: 'a' },
    b = { ...createItem('rectangle', 400, 0), id: 'b' },
    line = { ...createItem('arrow', 0, 0), id: 'l', from: 'a', to: 'b', text: 'Main' };
  let board = addConnectorLabel(boardWith(a, b, line), 'l', 'Extra', 0.25);
  const labelId = board.items.find(i => i.id === 'l')!.connector!.labels![0].id;
  board = moveConnectorLabel(board, 'l', labelId, 0.8123);
  assert.equal(board.items.find(i => i.id === 'l')!.connector!.labels![0].at, 0.812);
  board = moveConnectorLabel(board, 'l', null, 1.7);
  assert.equal(board.items.find(i => i.id === 'l')!.connector!.labelAt, 1);
  board = setConnectorLabelStyle(board, 'l', labelId, { color: '#d1242f', size: 20 });
  board = setConnectorLabelStyle(board, 'l', null, { color: '#4262ff', size: 18 });
  const c = board.items.find(i => i.id === 'l')!.connector!;
  assert.deepEqual([c.labels![0].color, c.labels![0].size, c.labelColor, c.labelSize], ['#d1242f', 20, '#4262ff', 18]);
  roundTrip(board);
  // Null restores the default.
  board = setConnectorLabelStyle(board, 'l', null, { color: null });
  assert.equal(board.items.find(i => i.id === 'l')!.connector!.labelColor, undefined);
  assert.throws(() => setConnectorLabelStyle(board, 'l', labelId, { size: 200 }), /label size/);
  assert.throws(() => setConnectorLabelStyle(board, 'l', labelId, { color: 'red' }), /colour/);
  // Locked connectors do not change.
  const locked = { ...board, items: board.items.map(i => (i.id === 'l' ? { ...i, locked: true } : i)) };
  assert.equal(moveConnectorLabel(locked, 'l', labelId, 0.1), locked);
  assert.equal(setConnectorLabelStyle(locked, 'l', labelId, { size: 12 }), locked);
});

test('invalid label styles are rejected on load', () => {
  const line = { ...createItem('arrow', 0, 0), connector: { labelSize: 4 } };
  assert.throws(() => roundTrip(boardWith(line)), /label style/);
  const bad = {
    ...createItem('arrow', 0, 0),
    connector: { labels: [{ id: 'x', text: 'A', at: 0.5, color: 'blue' }] },
  };
  assert.throws(() => roundTrip(boardWith(bad as Item)), /connector labels/);
});

// ---- 2. Callout tails ----------------------------------------------------------------------------------

test('a callout tail attaches to an object and follows it', () => {
  const bubble = { ...createItem('callout', 0, 0), id: 'c', w: 240, h: 150 },
    target = { ...createItem('rectangle', 500, 300), id: 't', w: 100, h: 80 };
  assert.deepEqual(tailTip(bubble, [bubble]), defaultTailTip(bubble));
  let board = setCalloutTail(boardWith(bubble, target), 'c', { x: 540, y: 320 }, 't');
  const tail = board.items.find(i => i.id === 'c')!.tail!;
  assert.equal(tail.target, 't');
  const tip = calloutTailTip(board.items[0], board.items)!;
  // The tip sits just outside the target's edge, on the side facing the callout.
  assert.ok(tip.x > 480 && tip.x < 520 && tip.y > 280 && tip.y < 320, JSON.stringify(tip));
  // Moving the target moves the tip.
  board = { ...board, items: board.items.map(i => (i.id === 't' ? { ...i, x: 900 } : i)) };
  const moved = calloutTailTip(board.items[0], board.items)!;
  assert.ok(moved.x > tip.x + 300);
  roundTrip(board);
  // Removing the target keeps the tail where it pointed.
  const removed = removeItems(board, ['t']);
  const kept = removed.items[0].tail!;
  assert.equal(kept.target, undefined);
  assert.ok(Math.abs(kept.x - moved.x) <= 1 && Math.abs(kept.y - moved.y) <= 1);
  // Free tails keep their local offset; resetting restores the built-in tail.
  const free = setCalloutTail(boardWith(bubble), 'c', { x: -60, y: 220 });
  assert.deepEqual(free.items[0].tail, { x: -60, y: 220 });
  assert.equal(resetCalloutTail(free, 'c').items[0].tail, undefined);
  // Paths: a body and a tail ending at the tip.
  const p = calloutPaths('callout', 240, 150, { x: -60, y: 220 });
  assert.match(p.tail, /L-60,220/);
  assert.ok(calloutPaths('thought', 240, 170, { x: 300, y: 300 }).tail.length > 0);
});

test('callout tails respect locks, stay valid and are remapped on duplicate', () => {
  const bubble = { ...createItem('ovalcallout', 0, 0), id: 'c', locked: true },
    target = { ...createItem('note', 400, 0), id: 't' };
  const board = boardWith(bubble, target);
  assert.equal(setCalloutTail(board, 'c', { x: 410, y: 10 }, 't'), board);
  const open = setCalloutTail(boardWith({ ...bubble, locked: false }, target), 'c', { x: 410, y: 10 }, 't');
  const copies = duplicateItems(open, ['c', 't'], 20);
  const copy = copies.board.items.find(i => i.id === copies.ids[0])!;
  assert.equal(copy.tail!.target, copies.ids[1]);
  for (const tail of [
    { x: 'a', y: 0 },
    { x: 0, y: 0, target: 'c' },
    { x: 0, y: 0, extra: 1 },
  ])
    assert.throws(() => roundTrip(boardWith({ ...bubble, tail } as unknown as Item)), /callout tail/);
});

// ---- 3. Diagram templates ----------------------------------------------------------------------------

test('diagram templates build valid connected diagrams from native shapes', () => {
  assert.ok(diagramTemplateNames.length >= 7);
  for (const name of diagramTemplateNames) {
    assert.ok(templateNames.includes(name), name);
    assert.equal(templateCatalog.find(t => t.name === name)?.category, 'Diagramming');
    const items = templateItems(name, { x: 100, y: 100 }, make);
    roundTrip(boardWith(...items));
    const ids = new Set(items.map(i => i.id));
    const lines = items.filter(i => i.type === 'arrow');
    assert.ok(lines.length >= 3, name);
    // Every connector end that names an object points at one in the template.
    for (const l of lines) for (const end of [l.from, l.to]) if (end) assert.ok(ids.has(end), name);
    assert.ok(items.filter(i => i.type !== 'arrow' && i.type !== 'text').length >= 4, name);
  }
  assert.deepEqual(
    filterTemplates('', 'Diagramming').map(t => t.name),
    ['Flowchart', 'Cross-functional flowchart', ...diagramTemplateNames],
  );
  assert.deepEqual(
    filterTemplates('entity').map(t => t.name),
    ['ER diagram'],
  );
  const er = templateItems('ER diagram', { x: 0, y: 0 }, make).filter(i => i.type === 'arrow');
  assert.ok(er.some(l => l.connector?.endHead === 'zero-many' && l.connector.startHead === 'one'));
});

// ---- 4. Org chart custom fields ---------------------------------------------------------------------

const people = (): OrgNode[] => [
  { id: 'a', parent: null, name: 'Ada', role: 'Lead', team: 'Core' },
  { id: 'b', parent: 'a', name: 'Bo', role: 'Dev' },
];

test('people get custom fields; cards show the chosen fields', () => {
  let nodes = setOrgField(people(), 'b', null, { name: 'Email', value: 'bo@example.com' });
  nodes = setOrgField(nodes, 'b', null, { name: 'Start date', value: '2024-01-02' });
  validateOrgNodes(nodes);
  assert.deepEqual(orgFieldNames(nodes), ['Email', 'Start date']);
  assert.throws(() => setOrgField(nodes, 'b', null, { name: 'email', value: 'x' }), /already has/);
  assert.throws(() => setOrgField(nodes, 'b', null, { name: 'Team', value: 'x' }), /built-in/);
  nodes = setOrgField(nodes, 'b', 0, { name: 'Mail', value: 'bo@example.com' });
  assert.equal(nodes[1].fields![0].name, 'Mail');
  const bo = nodes[1];
  assert.equal(orgMeta(bo), '');
  assert.equal(orgMeta(bo, ['Mail']), 'bo@example.com');
  assert.equal(orgMeta(nodes[0], ['Team', 'Mail']), 'Core');
  nodes = setOrgField(nodes, 'b', 0, null);
  assert.deepEqual(
    nodes[1].fields?.map(f => f.name),
    ['Start date'],
  );
  validateOrgCardFields(['Team', 'Start date']);
  assert.throws(() => validateOrgCardFields(['Team', 'team']), /card fields/);
  assert.throws(() => validateOrgNodes([{ ...people()[0], fields: [{ name: '', value: '' }] }]), /node/);
});

test('org chart CSV maps unknown columns to custom fields and exports them back', () => {
  const nodes = orgFromCsv('Name,Role,Manager,Email,Desk\nAda,Lead,,ada@x.org,4A\nBo,Dev,Ada,,5B\n');
  assert.deepEqual(nodes[0].fields, [
    { name: 'Email', value: 'ada@x.org' },
    { name: 'Desk', value: '4A' },
  ]);
  assert.deepEqual(nodes[1].fields, [{ name: 'Desk', value: '5B' }]);
  const csv = orgToCsv(nodes);
  assert.equal(csv.split(/\r?\n/)[0], [...ORG_CSV_HEADER, 'Email', 'Desk'].join(','));
  const again = orgFromCsv(csv);
  assert.deepEqual(
    again.map(n => n.fields),
    nodes.map(n => n.fields),
  );
  const chart = { ...createItem('orgchart', 0, 0), data: { nodes, cardFields: ['Email'] } };
  roundTrip(boardWith(chart));
  assert.throws(() => roundTrip(boardWith({ ...chart, data: { nodes, cardFields: 'Email' } })), /card fields/);
});

// ---- 5. Timeline drop dates ----------------------------------------------------------------------

test('a drop on a Timeline sets the start under the pointer and a default end', () => {
  const min = Date.parse('2026-03-02'),
    max = Date.parse('2026-03-29');
  assert.deepEqual(timelineDropDates(min, max, 'weeks', 0), { start: '2026-03-02', end: '2026-03-08' });
  assert.deepEqual(timelineDropDates(min, max, 'days', 0.5), { start: '2026-03-16', end: '2026-03-16' });
  assert.deepEqual(timelineDropDates(min, max, 'days', 1), { start: '2026-03-29', end: '2026-03-29' });
  assert.equal(timelineDropDates(NaN, max, 'days', 0.2), null);

  const board: Board = {
    ...newBoard(),
    datasets: { d: [] },
    items: [
      { ...createItem('timeline', 0, 0), id: 'tl', datasetId: 'd' },
      { ...createItem('note', 900, 0), id: 'n', text: 'Launch' },
      {
        ...createItem('card', 900, 300),
        id: 'k',
        text: 'Ship',
        data: { description: '', assignee: '', due: '2026-04-30', status: 'Not started' },
      },
    ],
  };
  const out = copyToRecords(board, ['n', 'k'], { targetId: 'tl', start: '2026-03-16', end: '2026-03-22' });
  const rows = out.datasets!.d;
  assert.deepEqual(
    rows.map(r => [r.title, r.start, r.end]),
    [
      ['Launch', '2026-03-16', '2026-03-22'],
      ['Ship', '2026-03-16', '2026-04-30'],
    ],
  );
  // Without a date (table, kanban or the label column) the old behaviour stays.
  const plain = copyToRecords(board, ['n'], { targetId: 'tl' });
  assert.deepEqual([plain.datasets!.d[0].start, plain.datasets!.d[0].end], ['', '']);
});

// ---- 6. draw.io import as native shapes ------------------------------------------------------------

const MODEL = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="s" value="Start" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="d" value="Ready?&lt;br&gt;Check" style="rhombus;fillColor=#FFF2CC;fontColor=#D79B00;fontSize=16;fontStyle=1" vertex="1" parent="1"><mxGeometry x="240" y="30" width="120" height="80" as="geometry"/></mxCell>
<mxCell id="r" value="Rounded" style="rounded=1;strokeColor=none" vertex="1" parent="1"><mxGeometry x="440" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="t" value="Note text" style="text;html=1;fontColor=#333" vertex="1" parent="1"><mxGeometry x="40" y="160" width="100" height="30" as="geometry"/></mxCell>
<mxCell id="u" value="Odd" style="shape=mxgraph.weird.thing;fillColor=#123" vertex="1" parent="1"><mxGeometry x="240" y="160" width="80" height="40" as="geometry"/></mxCell>
<mxCell id="e1" value="go" style="edgeStyle=orthogonalEdgeStyle;endArrow=open;strokeColor=#ff0000;dashed=1" edge="1" parent="1" source="s" target="d"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e2" style="endArrow=none;curved=1" edge="1" parent="1" source="d" target="r"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e3" edge="1" parent="1" source="r"><mxGeometry relative="1" as="geometry"><mxPoint x="600" y="200" as="targetPoint"/></mxGeometry></mxCell>
<mxCell id="e4" edge="1" parent="1" source="missing" target="r"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel>`;

test('draw.io vertices become native shapes with their colours, edges become connectors', () => {
  const r = drawioToItems(`<mxfile><diagram id="p" name="Page-1">${MODEL}</diagram></mxfile>`, { x: 0, y: 0 }, make);
  assert.equal(r.shapes, 5);
  assert.equal(r.connectors, 3);
  const byText = (t: string) => r.items.find(i => i.text === t)!;
  assert.equal(byText('Start').type, 'ellipse');
  assert.equal(byText('Start').fill, '#dae8fc');
  assert.equal(byText('Start').style?.borderColor, '#6c8ebf');
  const d = byText('Ready?\nCheck');
  assert.equal(d.type, 'diamond');
  assert.equal(d.fill, '#fff2cc');
  assert.equal(d.spans?.[0].color, '#d79b00');
  assert.deepEqual([d.format?.fontSize, d.format?.bold], [16, true]);
  assert.equal(byText('Rounded').type, 'roundrect');
  assert.equal(byText('Rounded').style?.borderWidth, 0);
  assert.equal(byText('Note text').type, 'text');
  assert.equal(byText('Note text').fill, '#333333');
  assert.equal(byText('Odd').type, 'rectangle');
  const [e1, e2, e3] = r.items.filter(i => i.type === 'arrow');
  assert.deepEqual([e1.from, e1.to], [byText('Start').id, d.id]);
  assert.deepEqual(
    [e1.connector?.path, e1.connector?.endHead, e1.connector?.dash, e1.fill, e1.text],
    ['elbow', 'open', 'dashed', '#ff0000', 'go'],
  );
  assert.deepEqual([e2.connector?.path, e2.connector?.endHead], ['curved', 'none']);
  assert.equal(e3.to, undefined);
  // Centred on the drop point.
  const shapes = r.items.filter(i => i.type !== 'arrow');
  const minX = Math.min(...shapes.map(i => i.x)),
    maxX = Math.max(...shapes.map(i => i.x + i.w));
  assert.ok(Math.abs((minX + maxX) / 2) <= 1);
  roundTrip(boardWith(...r.items));
});

test('compressed draw.io pages are expanded; containers offset their children; the object cap holds', () => {
  const nested = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="g" value="Pool" style="swimlane;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="300" height="200" as="geometry"/></mxCell>
<mxCell id="a" value="Inside" style="whiteSpace=wrap;" vertex="1" parent="g"><mxGeometry x="20" y="40" width="80" height="40" as="geometry"/></mxCell>
<UserObject label="Wrapped" id="w"><mxCell style="ellipse" vertex="1" parent="1"><mxGeometry x="500" y="100" width="60" height="60" as="geometry"/></mxCell></UserObject>
</root></mxGraphModel>`;
  const packed = Buffer.from(deflateSync(strToU8(encodeURIComponent(nested)))).toString('base64');
  const file = `<?xml version="1.0"?><mxfile><diagram id="a" name="One">${packed}</diagram><diagram id="b" name="Two">${packed}</diagram></mxfile>`;
  assert.equal(drawioModel(file).pages, 2);
  const r = drawioToItems(file, { x: 0, y: 0 }, make);
  const pool = r.items.find(i => i.text === 'Pool')!,
    inside = r.items.find(i => i.text === 'Inside')!;
  assert.equal(pool.type, 'frame');
  assert.equal(r.items[0].id, pool.id, 'containers come first');
  assert.deepEqual([inside.x - pool.x, inside.y - pool.y], [20, 40]);
  assert.equal(r.items.find(i => i.text === 'Wrapped')?.type, 'ellipse');
  assert.match(drawioImportNote(r), /first of 2 pages/);
  const capped = drawioToItems(file, { x: 0, y: 0 }, make, 2);
  assert.equal(capped.items.length, 2);
  assert.equal(capped.skipped, 1);
  assert.match(drawioImportNote(capped), /did not fit/);
  assert.throws(() => drawioToItems('<mxfile><diagram>%%%</diagram></mxfile>', { x: 0, y: 0 }, make), /could not/);
  assert.throws(
    () => drawioToItems('<mxfile><diagram><mxGraphModel></diagram></mxfile>', { x: 0, y: 0 }, make),
    /malformed/,
  );
});

test('style parsing, label text and widget conversion', () => {
  const s = parseStyle('ellipse;whiteSpace=wrap;fillColor=#fff;');
  assert.equal(s.get('ellipse'), '1');
  assert.equal(vertexKind(parseStyle('shape=cylinder3;')), 'cylinder');
  assert.equal(vertexKind(parseStyle('shape=mxgraph.flowchart.terminator;')), 'terminator');
  assert.equal(vertexKind(parseStyle('group')), 'skip');
  assert.equal(labelText('<b>A</b><div>B &amp; C</div>'), 'A\nB & C');
  const widget = {
    ...createItem('drawio', 0, 0),
    id: 'w',
    data: { xml: `<mxfile><diagram>${MODEL}</diagram></mxfile>` },
  };
  const made = convertDrawioWidget(boardWith(widget), 'w', make)!;
  assert.equal(
    made.board.items.some(i => i.id === 'w'),
    false,
  );
  assert.equal(made.board.items.length, 8);
  assert.equal(convertDrawioWidget(boardWith({ ...widget, locked: true }), 'w', make), null);
});
