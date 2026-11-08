// Visio (.vsdx) import as native shapes (decision Q18). Every fixture is a hand-written package built here with
// fflate; no real Visio file or third-party content is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { createItem, parseBoard, type Item } from '../src/model.ts';
import {
  VSDX_MAX_BYTES,
  VSDX_MAX_PAGES,
  visioColor,
  visioHead,
  visioKind,
  vsdxImportNote,
  vsdxToItems,
} from '../src/vsdx-import.ts';

const make = (t: Item['type'], x: number, y: number, f?: string) => createItem(t, x, y, f);
const NS = 'xmlns="http://schemas.microsoft.com/office/visio/2012/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const cell = (n: string, v: string | number) => `<Cell N="${n}" V="${v}"/>`;
const box = (x: number, y: number, w: number, h: number) =>
  cell('PinX', x) + cell('PinY', y) + cell('Width', w) + cell('Height', h);
const rectGeometry =
  '<Section N="Geometry" IX="0"><Row T="RelMoveTo" IX="1"/><Row T="RelLineTo" IX="2"/><Row T="RelLineTo" IX="3"/><Row T="RelLineTo" IX="4"/><Row T="RelLineTo" IX="5"/></Section>';
const shape = (id: number, attrs: string, body: string) => `<Shape ID="${id}" Type="Shape" ${attrs}>${body}</Shape>`;

type PageDef = { name: string; body: string; connects?: string; w?: number; h?: number };
function vsdx(pages: PageDef[], extra: Record<string, string> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'visio/document.xml': strToU8(
      `<VisioDocument ${NS}><StyleSheets><StyleSheet ID="0" NameU="No Style">${cell('LineColor', '#111111')}${cell('FillForegnd', '#ffffff')}</StyleSheet><StyleSheet ID="3" NameU="Normal" LineStyle="0" FillStyle="0" TextStyle="0">${cell('LineWeight', '0.02083333')}</StyleSheet></StyleSheets></VisioDocument>`,
    ),
    'visio/masters/masters.xml': strToU8(
      `<Masters ${NS} ${R}><Master ID="2" NameU="Process" Name="Process"><Rel r:id="rId1"/></Master><Master ID="3" NameU="Decision"><Rel r:id="rId2"/></Master><Master ID="4" NameU="Dynamic connector"><Rel r:id="rId3"/></Master><Master ID="5" NameU="Mystery widget"><Rel r:id="rId4"/></Master></Masters>`,
    ),
    'visio/masters/_rels/masters.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Target="master1.xml"/><Relationship Id="rId2" Target="master2.xml"/><Relationship Id="rId3" Target="master3.xml"/><Relationship Id="rId4" Target="master4.xml"/></Relationships>',
    ),
    'visio/masters/master1.xml': strToU8(
      `<MasterContents ${NS}><Shapes><Shape ID="5" Type="Shape" LineStyle="3" FillStyle="3" TextStyle="3">${cell('FillForegnd', '#dae8fc')}${rectGeometry}</Shape></Shapes></MasterContents>`,
    ),
    'visio/masters/master2.xml': strToU8(
      `<MasterContents ${NS}><Shapes><Shape ID="5" Type="Shape"><Section N="Geometry" IX="0"><Row T="MoveTo" IX="1"/><Row T="LineTo" IX="2"/><Row T="LineTo" IX="3"/></Section></Shape></Shapes></MasterContents>`,
    ),
    'visio/masters/master3.xml': strToU8(
      `<MasterContents ${NS}><Shapes><Shape ID="5" Type="Shape">${cell('BeginX', 0)}${cell('BeginY', 0)}${cell('EndX', 1)}${cell('EndY', 0)}${cell('EndArrow', 13)}</Shape></Shapes></MasterContents>`,
    ),
    'visio/masters/master4.xml': strToU8(
      `<MasterContents ${NS}><Shapes><Shape ID="5" Type="Shape"><Section N="Geometry" IX="0"><Row T="MoveTo" IX="1"/><Row T="ArcTo" IX="2"/><Row T="LineTo" IX="3"/></Section></Shape></Shapes></MasterContents>`,
    ),
    'visio/pages/pages.xml': strToU8(
      `<Pages ${NS} ${R}>${pages
        .map(
          (p, k) =>
            `<Page ID="${k}" NameU="${p.name}" Name="${p.name}"><PageSheet>${cell('PageWidth', p.w ?? 8.5)}${cell('PageHeight', p.h ?? 11)}</PageSheet><Rel r:id="rId${k + 1}"/></Page>`,
        )
        .join('')}</Pages>`,
    ),
    'visio/pages/_rels/pages.xml.rels': strToU8(
      `<Relationships>${pages.map((_, k) => `<Relationship Id="rId${k + 1}" Target="page${k + 1}.xml"/>`).join('')}</Relationships>`,
    ),
  };
  pages.forEach((p, k) => {
    files[`visio/pages/page${k + 1}.xml`] = strToU8(
      `<PageContents ${NS}><Shapes>${p.body}</Shapes>${p.connects ? `<Connects>${p.connects}</Connects>` : ''}</PageContents>`,
    );
  });
  for (const [k, v] of Object.entries(extra)) files[k] = strToU8(v);
  return zipSync(files);
}

const flowPage: PageDef = {
  name: 'Flow',
  body:
    shape(1, 'Master="2" NameU="Process.1"', box(2, 10, 2, 1) + '<Text>Start here</Text>') +
    shape(
      2,
      'Master="3"',
      box(5, 10, 2, 1) +
        cell('FillForegnd', '#ffcc00') +
        cell('LineColor', '#ff0000') +
        cell('LinePattern', 2) +
        '<Section N="Character"><Row IX="0">' +
        cell('Color', '#0000ff') +
        cell('Style', 1) +
        '</Row></Section><Text>Ok?</Text>',
    ) +
    shape(
      3,
      'Master="4"',
      cell('BeginX', 3) + cell('BeginY', 10) + cell('EndX', 4) + cell('EndY', 10) + '<Text>yes</Text>',
    ) +
    shape(4, 'NameU="Label"', box(2, 8, 2, 0.5) + '<Text>Just text</Text>') +
    shape(5, 'NameU="Turned"', box(2, 6, 2, 1) + cell('Angle', Math.PI / 6) + rectGeometry + '<Text>Tilted</Text>'),
  connects:
    '<Connect FromSheet="3" FromCell="BeginX" ToSheet="1"/><Connect FromSheet="3" FromCell="EndX" ToSheet="2"/>',
};
const groupPage: PageDef = {
  name: 'Parts',
  body:
    `<Shape ID="10" Type="Group" NameU="Pair">${box(5, 5, 2, 1)}<Shapes>` +
    shape(11, '', box(0.5, 0.5, 1, 1) + rectGeometry + '<Text>Left</Text>') +
    shape(12, '', box(1.5, 0.5, 1, 1) + '<Section N="Geometry" IX="0"><Row T="Ellipse" IX="1"/></Section>') +
    '</Shapes></Shape>' +
    shape(13, 'NameU="Line"', cell('BeginX', 1) + cell('BeginY', 1) + cell('EndX', 3) + cell('EndY', 2)) +
    '<Shape ID="14" Type="Foreign"><ForeignData ForeignType="Bitmap"/></Shape>' +
    shape(15, 'Master="5"', box(6, 2, 1, 1)) +
    '<Shape ID="16" Type="Guide"/>',
};

test('Visio pages become named frames side by side with shapes, text and glued connectors', () => {
  const r = vsdxToItems(vsdx([flowPage, groupPage]), { x: 0, y: 0 }, make);
  assert.equal(r.pages, 2);
  assert.equal(r.imported, 2);
  const frames = r.items.filter(i => i.type === 'frame');
  assert.deepEqual(
    frames.map(f => f.text),
    ['Flow', 'Parts'],
  );
  assert.equal(frames[0].w, 816);
  assert.equal(frames[0].h, 1056);
  assert.ok(frames[1].x >= frames[0].x + frames[0].w + 100, 'pages sit side by side');
  const [f1] = frames;
  const byText = (t: string) => r.items.find(i => i.text === t)!;
  // Process master: rectangle at its pin, fill from the master, line weight from the style sheet.
  const start = byText('Start here');
  assert.equal(start.type, 'rectangle');
  assert.deepEqual([start.x - f1.x, start.y - f1.y, start.w, start.h], [96, 48, 192, 96]);
  assert.equal(start.fill, '#dae8fc');
  assert.equal(start.style?.borderColor, '#111111');
  assert.equal(start.style?.borderWidth, 2);
  const decision = byText('Ok?');
  assert.equal(decision.type, 'diamond');
  assert.equal(decision.fill, '#ffcc00');
  assert.deepEqual(decision.style, { borderColor: '#ff0000', borderStyle: 'dashed' });
  assert.equal(decision.format?.bold, true);
  assert.equal(decision.spans?.[0].color, '#0000ff');
  const link = byText('yes');
  assert.equal(link.type, 'arrow');
  assert.equal(link.from, start.id);
  assert.equal(link.to, decision.id);
  assert.equal(link.connector?.path, 'elbow');
  assert.equal(link.connector?.endHead, 'arrow');
  assert.equal(byText('Just text').type, 'text');
  const tilted = byText('Tilted');
  assert.equal(tilted.rotation, 330);
  // Group: two members in one Boardroom group, at positions relative to the group.
  assert.equal(r.groups.length, 1);
  const left = byText('Left'),
    right = r.items.find(i => i.type === 'ellipse')!;
  assert.equal(left.group, r.groups[0].id);
  assert.equal(right.group, r.groups[0].id);
  const f2 = frames[1];
  assert.deepEqual([left.x - f2.x, left.y - f2.y], [384, 528]);
  assert.deepEqual([right.x - left.x, right.y - left.y], [96, 0]);
  // Unglued line: a free line with no ends attached.
  const free = r.items.filter(i => i.type === 'arrow' && !i.from && !i.to);
  assert.equal(free.length, 1);
  assert.deepEqual([free[0].w, free[0].h, free[0].connector?.endHead], [192, -96, 'none']);
  // Unknown master drawn as a rectangle and reported.
  assert.equal(r.approximated, 1);
  assert.equal(r.embedded, 1);
  assert.equal(r.unsupported, 1);
  assert.deepEqual([r.shapes, r.connectors, r.lines], [7, 1, 1]);
  // Everything loads as one board.
  const board = parseBoard({ version: 1, title: 'Visio', items: r.items, groups: r.groups });
  assert.equal(board.items.length, r.items.length);
  const note = vsdxImportNote(r);
  assert.match(note, /^Imported 7 shapes, 1 connector and 1 line from 2 pages, each in a frame named after it\./);
  assert.match(note, /Left out: 1 picture or embedded object, 1 unsupported shape\./);
  assert.match(note, /1 shape of an unknown type is drawn as rectangles\./);
});

test('Visio import is centred on the drop point and respects the remaining object room', () => {
  const r = vsdxToItems(vsdx([flowPage]), { x: 1000, y: -500 }, make);
  const f = r.items[0];
  assert.equal(f.type, 'frame');
  assert.deepEqual([f.x + f.w / 2, f.y + f.h / 2], [1000, -500]);
  const small = vsdxToItems(vsdx([flowPage]), { x: 0, y: 0 }, make, 3);
  assert.equal(small.items.length, 3);
  assert.ok(small.overLimit > 0);
  assert.match(vsdxImportNote(small), /past the 2,000-object limit/);
  // The connector lost one of its shapes: it is left out rather than pointing at nothing.
  assert.ok(small.items.every(i => !i.from || small.items.some(j => j.id === i.from)));
});

test('Visio pages past the page cap are reported, and shapes drawn off the page grow its frame', () => {
  const pages = Array.from({ length: VSDX_MAX_PAGES + 1 }, (_, k) => ({
    name: `P${k}`,
    body: shape(1, '', box(1, 1, 1, 1) + rectGeometry),
  }));
  const r = vsdxToItems(vsdx(pages), { x: 0, y: 0 }, make);
  assert.equal(r.imported, VSDX_MAX_PAGES);
  assert.equal(r.pagesLeftOut, 1);
  assert.match(vsdxImportNote(r), /1 page \(empty, unreadable or past the 50-page cap\)/);
  const wide = vsdxToItems(
    vsdx([{ name: 'Wide', body: shape(1, '', box(20, 1, 2, 1) + rectGeometry) }]),
    { x: 0, y: 0 },
    make,
  );
  assert.ok(wide.items[0].w > 816 + 1000);
});

test('Visio import rejects other files, oversized files and ZIP bombs with readable messages', () => {
  assert.throws(() => vsdxToItems(strToU8('not a zip'), { x: 0, y: 0 }, make), /not a Visio/);
  assert.throws(() => vsdxToItems(zipSync({ 'a.txt': strToU8('x') }), { x: 0, y: 0 }, make), /not a Visio/);
  assert.throws(() => vsdxToItems(new Uint8Array(VSDX_MAX_BYTES + 1), { x: 0, y: 0 }, make), /up to 50 MB/);
  const bomb = vsdx([{ name: 'B', body: '' }], {
    'visio/pages/page1.xml': `<PageContents>${' '.repeat(21 * 1024 * 1024)}</PageContents>`,
  });
  assert.ok(bomb.length < 1024 * 1024, 'the fixture compresses well');
  assert.throws(() => vsdxToItems(bomb, { x: 0, y: 0 }, make), /more data than can be imported safely/);
  assert.throws(
    () => vsdxToItems(vsdx([{ name: 'Pics', body: '<Shape ID="1" Type="Foreign"/>' }]), { x: 0, y: 0 }, make),
    /only pictures or embedded objects/,
  );
  // Embedded parts (media, OLE objects) are never decompressed, whatever their size.
  const withMedia = vsdx([flowPage], { 'visio/media/image1.png': 'x'.repeat(30 * 1024 * 1024) });
  assert.doesNotThrow(() => vsdxToItems(withMedia, { x: 0, y: 0 }, make));
});

test('Visio cell helpers map colours, arrowheads and names', () => {
  assert.equal(visioColor('#AbC'), '#aabbcc');
  assert.equal(visioColor('2'), '#ff0000');
  assert.equal(visioColor('Themed', 'RGB(0, 128, 255)'), '#0080ff');
  assert.equal(visioColor('THEMEVAL()'), undefined);
  assert.equal(visioHead(0, 'arrow'), 'none');
  assert.equal(visioHead(undefined, 'arrow'), 'arrow');
  assert.equal(visioHead(20, 'none'), 'circle');
  assert.equal(visioKind('Decision.12'), 'diamond');
  assert.equal(visioKind('Start/End'), 'terminator');
  assert.equal(visioKind('Database'), 'cylinder');
  assert.equal(visioKind('Data'), 'parallelogram');
  assert.equal(visioKind('Rounded rectangle'), 'roundrect');
  assert.equal(visioKind('Something else'), undefined);
});
