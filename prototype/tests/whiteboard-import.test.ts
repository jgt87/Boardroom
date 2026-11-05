// Whiteboard REST export import: fixtures written by hand from the public API reference's JSON shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoard } from '../src/model.ts';
import { activeSpans } from '../src/rich-text.ts';
import {
  htmlToRich,
  importWhiteboardRest,
  isWhiteboardRestExport,
  whiteboardImportNote,
  WHITEBOARD_FORMAT,
} from '../src/whiteboard-import.ts';

const at = (x: number, y: number, relative = false) => ({
  x,
  y,
  origin: 'center',
  relativeTo: relative ? 'parent_top_left' : 'canvas_center',
});
const exportOf = (items: unknown[], connectors: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  format: WHITEBOARD_FORMAT,
  board: { id: 'uXjVO123=', name: 'Sprint <b>planning</b>', description: 'Q3 board' },
  items,
  connectors,
  exportedAt: '2026-11-05T10:00:00Z',
  ...extra,
});

const FIXTURE = exportOf(
  [
    {
      id: '3458764517517819000',
      type: 'frame',
      data: { title: 'Outer', format: 'custom', type: 'freeform' },
      style: { fillColor: '#ffffff' },
      position: at(0, 0),
      geometry: { width: 1000, height: 800 },
    },
    {
      id: '3458764517517819001',
      type: 'frame',
      data: { title: 'Inner' },
      style: { fillColor: '#f5f6f8' },
      position: at(300, 200, true),
      geometry: { width: 400, height: 300 },
      parent: { id: '3458764517517819000' },
    },
    {
      id: 'note-1',
      type: 'sticky_note',
      data: { content: '<p>Hello <strong>world</strong></p><p>Second</p>', shape: 'square' },
      style: { fillColor: 'light_green', textAlign: 'left', textAlignVertical: 'top' },
      position: at(100, 100, true),
      geometry: { width: 200, height: 200 },
      parent: { id: '3458764517517819001' },
    },
    {
      id: 'shape-1',
      type: 'shape',
      data: { content: '<p>Decide</p>', shape: 'rhombus' },
      style: {
        fillColor: '#ff9d48',
        fillOpacity: '1.0',
        borderColor: '#1a1a1a',
        borderWidth: '3.0',
        borderOpacity: '1.0',
        borderStyle: 'dashed',
        color: '#ffffff',
        fontSize: '24',
        fontFamily: 'georgia',
        textAlign: 'center',
        textAlignVertical: 'middle',
      },
      position: at(600, 0),
      geometry: { width: 200, height: 150, rotation: 45 },
    },
    {
      id: 'shape-2',
      type: 'shape',
      data: { content: '', shape: 'left_brace' },
      style: {},
      position: at(-600, 0),
      geometry: { width: 50, height: 200 },
    },
    {
      id: 'text-1',
      type: 'text',
      data: { content: '<p>Plain <a href="https://example.com/x">link</a></p>' },
      style: { color: '#e5484d', fontSize: '18' },
      position: at(0, -500),
      geometry: { width: 300 },
    },
    {
      id: 'card-1',
      type: 'card',
      data: {
        title: '<p>Ship it</p>',
        description: 'Before Friday',
        dueDate: '2026-11-20T12:00:00Z',
        assigneeId: '3074457362577955300',
      },
      style: { cardTheme: '#2d9bf0' },
      position: at(0, 600),
      geometry: { width: 320, height: 94 },
    },
    {
      id: 'app-1',
      type: 'app_card',
      data: {
        title: 'Ticket 42',
        description: 'Synced',
        status: 'connected',
        fields: [{ value: 'High', tooltip: 'Priority' }],
      },
      style: { fillColor: '#2d9bf0' },
      position: at(400, 600),
      geometry: { width: 320, height: 94 },
    },
    {
      id: 'img-1',
      type: 'image',
      data: { imageUrl: 'https://api.example.com/v2/boards/b/resources/images/1?format=preview', title: 'Logo' },
      position: at(-400, 600),
      geometry: { width: 120, height: 80 },
    },
    {
      id: 'embed-1',
      type: 'embed',
      data: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mode: 'inline', providerName: 'YouTube' },
      position: at(-800, 600),
      geometry: { width: 480, height: 270 },
    },
    {
      id: 'embed-2',
      type: 'embed',
      data: { url: 'https://example.org/page', title: 'Some page' },
      position: at(-1300, 600),
      geometry: { width: 300, height: 200 },
    },
    {
      id: 'doc-1',
      type: 'document',
      data: { documentUrl: 'https://api.example.com/v2/boards/b/resources/documents/1', title: 'Spec.pdf' },
      position: at(-1300, 0),
      geometry: { width: 200, height: 280 },
    },
    { id: 'mm-1', type: 'mindmap_node', data: {}, position: at(0, 0) },
    { id: 'mm-2', type: 'mindmap_node', data: {}, position: at(0, 0) },
    { id: 'mm-3', type: 'mindmap_node', data: {}, position: at(0, 0) },
    { id: 'tbl-1', type: 'data_table_format', position: at(0, 0) },
  ],
  [
    {
      id: 'c-1',
      shape: 'elbowed',
      startItem: { id: 'note-1', position: { x: '100%', y: '50%' } },
      endItem: { id: 'shape-1', position: { x: '50%', y: '0%' } },
      style: {
        startStrokeCap: 'none',
        endStrokeCap: 'filled_triangle',
        strokeColor: '#4262ff',
        strokeWidth: '2.0',
        strokeStyle: 'dashed',
        color: '#e5484d',
        fontSize: '16',
      },
      captions: [
        { content: '<p>yes</p>', position: '30%' },
        { content: 'second', position: '80%' },
      ],
    },
    {
      id: 'c-2',
      shape: 'curved',
      startItem: { id: 'card-1' },
      endItem: { id: 'app-1' },
      style: { startStrokeCap: 'erd_one', endStrokeCap: 'erd_zero_or_many' },
    },
    { id: 'c-3', startItem: { id: 'mm-1' }, endItem: { id: 'note-1' } },
  ],
  {
    tags: [{ id: 't1', title: 'Urgent', fillColor: 'red', type: 'tag' }],
    itemTags: { 'note-1': ['t1'], 'card-1': ['t1', 'missing'] },
  },
);

test('detects REST exports and rejects other JSON', () => {
  assert.equal(isWhiteboardRestExport(FIXTURE), true);
  assert.equal(isWhiteboardRestExport({ version: 1, title: 'x', items: [] }), false);
  assert.equal(isWhiteboardRestExport({ items: [{ id: '1', type: 'shape', position: at(0, 0) }] }), true);
  assert.equal(isWhiteboardRestExport(null), false);
  assert.equal(isWhiteboardRestExport([]), false);
  assert.throws(() => importWhiteboardRest({ version: 1, title: 'x', items: [] }), /not a whiteboard JSON export/);
});

test('maps items, nested frame positions, paint order and the board title', () => {
  const { board, report } = importWhiteboardRest(FIXTURE);
  parseBoard(board);
  assert.equal(board.title, 'Sprint planning');
  assert.equal(board.description, 'Q3 board');
  const [outer, inner] = board.items;
  assert.equal(outer.type, 'frame');
  assert.equal(outer.text, 'Outer');
  assert.deepEqual([outer.x, outer.y, outer.w, outer.h], [-500, -400, 1000, 800]);
  // Inner centre (300, 200) from the outer top-left (-500, -400): centre (-200, -200), size 400x300.
  assert.equal(inner.text, 'Inner');
  assert.deepEqual([inner.x, inner.y], [-400, -350]);
  assert.equal(inner.fill, '#f5f6f8');
  const note = board.items.find(i => i.type === 'note')!;
  // Note centre (100, 100) from the inner top-left (-400, -350).
  assert.deepEqual([note.x, note.y, note.w, note.h], [-400, -350, 200, 200]);
  assert.equal(note.fill, '#d1ec9c');
  assert.equal(note.text, 'Hello world\nSecond');
  assert.deepEqual(
    activeSpans(note).map(s => [s.start, s.end, s.bold]),
    [[6, 11, true]],
  );
  assert.equal(note.format?.align, 'left');
  assert.deepEqual(note.tags, ['Urgent']);
  assert.deepEqual(board.tagColors, { Urgent: '#ffe3e6' });
  // Frames come first in paint order.
  assert.deepEqual(
    board.items.slice(0, 2).map(i => i.type),
    ['frame', 'frame'],
  );
  assert.equal(report.imported.sticky_note, 1);
  assert.equal(report.skipped.mindmap_node, 3);
  assert.equal(report.skipped.data_table_format, 1);
});

test('maps shapes with fill, border, text colour, font and rotation', () => {
  const { board, report } = importWhiteboardRest(FIXTURE);
  const diamond = board.items.find(i => i.type === 'diamond')!;
  assert.equal(diamond.fill, '#ff9d48');
  assert.deepEqual(diamond.style, { borderColor: '#1a1a1a', borderWidth: 3, borderStyle: 'dashed' });
  assert.equal(diamond.text, 'Decide');
  assert.equal(activeSpans(diamond)[0].color, '#ffffff');
  assert.equal(diamond.format?.fontSize, 24);
  assert.equal(diamond.format?.fontFamily, 'Georgia');
  assert.equal(diamond.format?.valign, 'middle');
  assert.equal(diamond.rotation, 45);
  assert.deepEqual([diamond.x, diamond.y], [500, -75]);
  // left_brace has no counterpart: drawn as a rectangle and counted.
  assert.equal(report.approximated, 1);
  assert.ok(board.items.some(i => i.type === 'rectangle' && i.w === 50));
});

test('maps text, cards, app cards, images, embeds and documents', () => {
  const { board, report } = importWhiteboardRest(FIXTURE);
  const text = board.items.find(i => i.type === 'text')!;
  assert.equal(text.text, 'Plain link');
  assert.equal(text.fill, '#e5484d');
  assert.equal(activeSpans(text)[0].href, 'https://example.com/x');
  const [card, app] = board.items.filter(i => i.type === 'card');
  assert.equal(card.text, 'Ship it');
  assert.equal(card.data?.description, 'Before Friday');
  assert.equal(card.data?.due, '2026-11-20');
  assert.equal(card.data?.assignee, '');
  assert.equal(card.fill, '#2d9bf0');
  assert.deepEqual(card.tags, ['Urgent']);
  assert.equal(app.text, 'Ticket 42');
  assert.equal(app.data?.description, 'Synced\nHigh: Priority');
  assert.equal(report.unnamedAssignees, 1);
  const embed = board.items.find(i => i.type === 'embed')!;
  assert.equal(embed.data?.provider, 'youtube');
  const bookmarks = board.items.filter(i => i.type === 'bookmark');
  assert.deepEqual(bookmarks.map(b => b.data?.title).sort(), ['Logo', 'Some page', 'Spec.pdf']);
  assert.equal(report.imageLinks, 1);
});

test('maps connectors: remapped ends, sides, path, caps, stroke and captions', () => {
  const { board, report } = importWhiteboardRest(FIXTURE);
  const note = board.items.find(i => i.type === 'note')!,
    diamond = board.items.find(i => i.type === 'diamond')!;
  const lines = board.items.filter(i => i.type === 'arrow');
  assert.equal(lines.length, 2);
  const [a, b] = lines;
  assert.equal(a.from, note.id);
  assert.equal(a.to, diamond.id);
  assert.equal(a.fill, '#4262ff');
  assert.equal(a.text, 'yes');
  assert.deepEqual(
    { ...a.connector, labels: a.connector?.labels?.map(l => [l.text, l.at]) },
    {
      path: 'elbow',
      startHead: 'none',
      endHead: 'arrow',
      width: 2,
      dash: 'dashed',
      startSide: 'right',
      endSide: 'top',
      labelColor: '#e5484d',
      labelSize: 16,
      labelAt: 0.3,
      labels: [['second', 0.8]],
    },
  );
  assert.equal(b.connector?.path, 'curved');
  assert.equal(b.connector?.startHead, 'one');
  assert.equal(b.connector?.endHead, 'zero-many');
  // The connector to a skipped mind map node is left out.
  assert.equal(report.danglingConnectors, 1);
  // Connectors are painted above the objects they join.
  assert.ok(board.items.indexOf(a) > board.items.indexOf(diamond));
});

test('the report reads as one message', () => {
  const note = whiteboardImportNote(importWhiteboardRest(FIXTURE).report);
  assert.match(note, /^Imported 14 objects as a new board \(2 frames, 2 shapes, 2 embeds, 2 connectors, 1 sticky note/);
  assert.match(note, /3 mind map nodes/);
  assert.match(note, /1 table\b/);
  assert.match(note, /1 connector was left out/);
  assert.match(note, /1 shape is drawn as the nearest shape/);
  assert.match(note, /1 image is kept as a link/);
  assert.match(note, /1 card assignee could not be named/);
});

test('images carried as data URLs become image objects with assets', () => {
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { board, assets, report } = importWhiteboardRest(
    exportOf([
      {
        id: 'i',
        type: 'image',
        data: { imageDataUrl: png, altText: 'Dot' },
        position: at(0, 0),
        geometry: { width: 10, height: 10 },
      },
      { id: 'j', type: 'image', data: { imageDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }, position: at(0, 0) },
    ]),
  );
  const image = board.items.find(i => i.type === 'image')!;
  assert.equal(image.alt, 'Dot');
  assert.equal(assets[image.assetId!].mime, 'image/png');
  // The second has neither a usable file nor a link.
  assert.equal(report.skipped.image, 1);
  parseBoard({ ...board, assets });
});

test('HTML content is read as data: scripts dropped, unknown tags unwrapped, unsafe links ignored', () => {
  const r = htmlToRich(
    '<p onclick="x()">Hi<script>alert(1)</script> <em>there</em></p><ul><li>one</li><li>two</li></ul>' +
      '<ol><li>first</li></ol><a href="javascript:alert(1)">bad</a> <span style="color: rgb(255, 0, 0)">red</span>' +
      '<style>p{}</style> <custom-tag>kept</custom-tag> &amp; &lt;b&gt;',
  );
  assert.equal(r.text, 'Hi there\n• one\n• two\n1. first\nbad red kept & <b>');
  assert.ok(!r.text.includes('alert'));
  assert.ok(r.spans.some(s => s.italic));
  assert.ok(r.spans.some(s => s.color === '#ff0000'));
  assert.ok(!r.spans.some(s => s.href));
  assert.equal(htmlToRich('<p></p><p></p><p>a</p><p></p><p></p><p></p><p>b</p>').text, 'a\n\nb');
  assert.equal(htmlToRich('<ul><li><p>one</p></li><li><p>two</p></li></ul><p>after</p>').text, '• one\n• two\nafter');
  assert.equal(htmlToRich('a<br>b<br/>c').text, 'a\nb\nc');
  assert.equal(htmlToRich('x'.repeat(10), 4).text, 'xxxx');
  assert.equal(htmlToRich('<b>' + 'y'.repeat(50) + '</b>', 5).spans[0].end, 5);
});

test('bad values and malformed entries are skipped, never thrown', () => {
  const { board, report } = importWhiteboardRest(
    exportOf(
      [
        null,
        42,
        'text',
        { type: 'shape' },
        { id: 'dup', type: 'sticky_note', data: { content: 'a' }, position: at(0, 0) },
        { id: 'dup', type: 'sticky_note', data: { content: 'b' }, position: at(0, 0) },
        {
          id: 's',
          type: 'shape',
          data: { content: 7, shape: { evil: true } },
          style: { fillColor: 'url(javascript:1)', borderWidth: 'NaN', fontSize: '9999', borderStyle: 'wavy' },
          position: { x: 'abc', y: Infinity },
          geometry: { width: -5, height: 1e30, rotation: 'spin' },
        },
        {
          id: 'n',
          type: 'sticky_note',
          data: { content: '<p>' + 'z'.repeat(9000) + '</p>' },
          style: { fillColor: 'neon' },
          position: at(1e12, -1e12),
          parent: { id: 'missing' },
        },
        { id: 'loop-a', type: 'frame', data: {}, position: at(1, 1, true), parent: { id: 'loop-b' } },
        { id: 'loop-b', type: 'frame', data: {}, position: at(1, 1, true), parent: { id: 'loop-a' } },
        { id: 't', type: 'text', data: { content: '<p> </p>' }, position: at(0, 0) },
        { id: 'e', type: 'embed', data: { url: 'ftp://nope' }, position: at(0, 0) },
        { id: 'c', type: 'card', data: { title: 'x', dueDate: 'tomorrow' }, position: at(0, 0) },
      ],
      [
        null,
        { startItem: 'x' },
        { id: 'k', startItem: { id: 'dup' }, endItem: { id: 'dup' }, style: { strokeWidth: '99' } },
      ],
      { tags: 'nope', itemTags: [] },
    ),
  );
  parseBoard(board);
  const types = board.items.map(i => i.type);
  assert.equal(types.filter(t => t === 'note').length, 2);
  const huge = board.items.find(i => i.type === 'note' && i.text.length > 10)!;
  assert.equal(huge.text.length, 6000);
  assert.equal(huge.fill, '#fff49b');
  assert.ok(Math.abs(huge.x) <= 1e7);
  const shape = board.items.find(i => i.type === 'rectangle')!;
  assert.equal(shape.fill, '#ffffff');
  assert.equal(shape.format?.fontSize, 96);
  assert.equal(shape.rotation, undefined);
  assert.ok(shape.w > 0 && shape.h <= 1e6);
  assert.equal(types.filter(t => t === 'frame').length, 2);
  assert.equal(board.items.find(i => i.type === 'card')!.data?.due, '');
  const loop = board.items.find(i => i.type === 'arrow')!;
  assert.equal(loop.connector?.width, 12);
  assert.ok((report.skipped.unsupported ?? 0) >= 3);
  assert.equal(report.skipped.shape, 1);
  assert.equal(report.skipped.sticky_note, 1);
  assert.equal(report.skipped.text, 1);
  assert.equal(report.skipped.embed, 1);
  assert.equal(report.skipped.connector, 1);
});

test('the object limit caps the import and is reported', () => {
  const many = Array.from({ length: 30 }, (_, k) => ({
    id: `n${k}`,
    type: 'sticky_note',
    data: { content: `${k}` },
    position: at(k * 250, 0),
  }));
  const { board, report } = importWhiteboardRest(
    exportOf(many, [{ startItem: { id: 'n0' }, endItem: { id: 'n1' } }]),
    10,
  );
  assert.equal(board.items.length, 10);
  assert.equal(report.overLimit, 21);
  assert.match(whiteboardImportNote(report), /21 objects did not fit/);
});

test('random junk never throws past the format check', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const junk = (depth: number): unknown => {
    const r = rand();
    if (depth > 3 || r < 0.2) return [null, true, -1, 1e308, '', '<p>x</p>', '#fff', '50%'][Math.floor(rand() * 8)];
    if (r < 0.4) return Array.from({ length: Math.floor(rand() * 4) }, () => junk(depth + 1));
    const keys = ['id', 'type', 'data', 'style', 'position', 'geometry', 'parent', 'content', 'x', 'y', 'width'];
    return Object.fromEntries(keys.filter(() => rand() < 0.5).map(k => [k, junk(depth + 1)]));
  };
  const types = ['sticky_note', 'shape', 'text', 'frame', 'card', 'app_card', 'image', 'embed', 'document', 'x'];
  for (let n = 0; n < 200; n++) {
    const items = Array.from({ length: 8 }, (_, k) => {
      const base = junk(0);
      return rand() < 0.8 && base && typeof base === 'object' && !Array.isArray(base)
        ? { ...base, id: `i${k}`, type: types[Math.floor(rand() * types.length)] }
        : base;
    });
    const connectors = Array.from({ length: 3 }, () => ({
      startItem: { id: `i${Math.floor(rand() * 8)}`, position: junk(1) },
      endItem: { id: `i${Math.floor(rand() * 8)}` },
      style: junk(1),
      captions: junk(1),
      shape: junk(1),
    }));
    const { board } = importWhiteboardRest(exportOf(items, connectors));
    parseBoard(board);
  }
});
