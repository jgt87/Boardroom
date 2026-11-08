// Whiteboard REST import extras: stacking by creation time, groups, mind maps, placeholders, the recreate file and
// one layer per frame. Fixtures are written by hand in the export's shape; no real board content.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseBoard } from '../src/model.ts';
import {
  importWhiteboardRest,
  topLevelFrameCount,
  whiteboardImportNote,
  WHITEBOARD_FORMAT,
} from '../src/whiteboard-import.ts';
import { byCreation, recreateFrom } from '../src/whiteboard-extras.ts';
import { BASE_LAYER } from '../src/layers.ts';

const at = (x: number, y: number, relative = false) => ({
  x,
  y,
  origin: 'center',
  relativeTo: relative ? 'parent_top_left' : 'canvas_center',
});
const box = (w: number, h: number) => ({ width: w, height: h });
const note = (id: string, x: number, createdAt?: string, parent?: string) => ({
  id,
  type: 'sticky_note',
  data: { content: id },
  position: at(x, 0, !!parent),
  geometry: box(100, 100),
  ...(createdAt ? { createdAt } : {}),
  ...(parent ? { parent: { id: parent } } : {}),
});
const exportOf = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  format: WHITEBOARD_FORMAT,
  board: { id: 'b1', name: 'Extras' },
  items,
  connectors: [],
  ...extra,
});
// A 1 x 1 PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('objects are stacked in creation order when every object has a creation time', () => {
  const { board } = importWhiteboardRest(
    exportOf([
      note('late', 0, '2026-03-01T00:00:00Z'),
      note('early', 200, '2026-01-01T00:00:00Z'),
      note('middle', 400, '2026-02-01T00:00:00Z'),
    ]),
  );
  assert.deepEqual(
    board.items.map(i => i.text),
    ['early', 'middle', 'late'],
  );
  // One object without a time keeps the listed order.
  const kept = byCreation([{ raw: { createdAt: '2026-02-01' } }, { raw: {} }, { raw: { createdAt: '2026-01-01' } }]);
  assert.deepEqual(
    kept.map(s => s.raw.createdAt),
    ['2026-02-01', undefined, '2026-01-01'],
  );
});

test('groups carry over; a group needs two imported members and an object joins one group', () => {
  const { board, report } = importWhiteboardRest(
    exportOf([note('a', 0), note('b', 200), note('c', 400)], {
      groups: [
        { id: 'g1', type: 'group', data: { items: ['a', 'b'] } },
        { id: 'g2', data: { items: ['b', 'missing'] } },
        { id: 'g3', items: [{ id: 'c' }, { id: 'a' }] },
      ],
    }),
  );
  const [a, b, c] = board.items;
  assert.ok(a.group && a.group === b.group);
  assert.equal(c.group, undefined);
  assert.deepEqual(board.groups, [{ id: a.group, parent: null }]);
  assert.equal(report.groups, 1);
  assert.match(whiteboardImportNote(report), /Kept 1 group\./);
});

test('mind map nodes become one mind map per root, with the topic text and tree', () => {
  const mindmapNodes = [
    {
      id: 'r',
      type: 'mindmap_node',
      data: { isRoot: true, nodeView: { data: { content: '<p>Plan</p>' } } },
      position: at(0, 0),
    },
    { id: 'k1', data: { nodeView: { data: { content: 'Goals' } } }, parent: { id: 'r' }, position: at(300, -80) },
    { id: 'k2', data: { nodeView: { data: { content: 'Risks' } } }, parent: { id: 'r' }, position: at(300, 80) },
    { id: 'g', data: { nodeView: { data: { content: 'Ship' } } }, parent: { id: 'k1' }, position: at(600, -80) },
    { id: 'other', data: { nodeView: { data: { content: 'Second map' } } }, position: at(0, 1000) },
  ];
  // The items list repeats the nodes without content; they are not imported twice.
  const items = mindmapNodes.map(n => ({ id: n.id, type: 'mindmap_node', position: n.position }));
  const { board, report } = importWhiteboardRest(exportOf(items, { mindmapNodes }));
  const maps = board.items.filter(i => i.type === 'mindmap');
  assert.equal(maps.length, 2);
  const nodes = maps[0].nodes!;
  const byText = new Map(nodes.map(n => [n.text, n]));
  assert.equal(byText.get('Plan')!.parent, null);
  assert.equal(byText.get('Goals')!.parent, byText.get('Plan')!.id);
  assert.equal(byText.get('Ship')!.parent, byText.get('Goals')!.id);
  assert.ok(maps[0].w >= 600 + 260 - 1 && maps[0].h >= 160);
  assert.equal(report.mindMaps, 2);
  assert.equal(report.imported.mindmap_node, 5);
  assert.equal(board.items.length, 2);
});

test('objects without content keep their place as dashed placeholders; connectors still attach', () => {
  const json = exportOf(
    [
      note('n', 0),
      { id: 't', type: 'data_table_format', position: at(500, 0), geometry: box(600, 300) },
      { id: 'd', type: 'doc_format', position: at(0, 600), geometry: box(400, 500) },
      { id: 'blank', type: 'mindmap_node', position: at(900, 900), geometry: box(120, 40) },
      { id: 'nogeo', type: 'usm', position: at(0, 0) },
    ],
    { connectors: [{ id: 'c', startItem: { id: 'n' }, endItem: { id: 't' }, shape: 'straight' }] },
  );
  const { board, report } = importWhiteboardRest(json);
  const table = board.items.find(i => i.name === 'Table placeholder')!;
  assert.equal(table.type, 'rectangle');
  assert.equal(table.style?.borderStyle, 'dashed');
  assert.deepEqual([table.x, table.y, table.w, table.h], [200, -150, 600, 300]);
  assert.equal(table.text, 'Table (not exported)');
  assert.deepEqual(report.placeholders, { data_table_format: 1, doc_format: 1, mindmap_node: 1 });
  assert.equal(report.skipped.usm, 1);
  const line = board.items.find(i => i.type === 'arrow')!;
  assert.equal(line.to, table.id);
  assert.match(whiteboardImportNote(report), /Placeholders mark 1 table, 1 doc, 1 mind map node that could not be/);
});

test('recreate entries rebuild tables, kanban, docs, mind maps, story maps, notes, images and raw objects', () => {
  const items = [
    { id: 'frame', type: 'frame', data: { title: 'F' }, position: at(0, 0), geometry: box(4000, 4000) },
    ...['tbl', 'kb', 'doc', 'mm', 'usm', 'pen', 'pic', 'raw'].map((id, k) => ({
      id,
      type: id === 'tbl' ? 'data_table_format' : 'unsupported',
      position: at(200 + k * 400, 200, true),
      geometry: box(300, 200),
      parent: { id: 'frame' },
    })),
  ];
  const recreate = [
    {
      sourceId: 'tbl',
      content: { kind: 'table', title: 'Backlog', csv: 'Title,Status\nLogin,In progress\nSearch,Complete' },
    },
    {
      sourceId: 'kb',
      content: {
        kind: 'kanban',
        rows: [
          ['Title', 'Status'],
          ['Card', 'Not started'],
        ],
      },
    },
    { sourceId: 'doc', content: { kind: 'doc', markdown: '# Notes\n\n- one' } },
    {
      sourceId: 'mm',
      content: {
        kind: 'mindmap',
        nodes: [
          { id: '1', text: 'Root' },
          { id: '2', parent: '1', text: 'Child' },
        ],
      },
    },
    {
      sourceId: 'usm',
      content: {
        kind: 'storymap',
        activities: ['Find'],
        releases: ['MVP'],
        cards: [{ title: 'Search', activity: 'Find' }],
      },
    },
    { sourceId: 'pen', content: { kind: 'note', text: 'Sketch of the flow' } },
    { sourceId: 'pic', content: { kind: 'image', dataUrl: PNG, title: 'Sketch' } },
    {
      sourceId: 'raw',
      content: {
        kind: 'items',
        items: [
          { id: 'a', type: 'rectangle', x: 0, y: 0, w: 80, h: 40, text: 'A', fill: '#ffffff' },
          { id: 'b', type: 'ellipse', x: 200, y: 0, w: 80, h: 40, text: 'B', fill: '#ffffff' },
          { id: 'l', type: 'arrow', x: 40, y: 20, w: 200, h: 0, text: '', fill: '#25252a', from: 'a', to: 'b' },
        ],
      },
    },
    { type: 'text', position: { x: 5000, y: 5000 }, geometry: box(200, 60), content: { kind: 'text', text: 'Extra' } },
  ];
  const { board, report, assets } = importWhiteboardRest(exportOf(items, { recreate }));
  const of = (type: string) => board.items.filter(i => i.type === type);
  const table = of('table')[0];
  assert.equal(table.text, 'Backlog');
  assert.deepEqual(
    board.datasets![table.datasetId!].map(r => [r.title, r.status]),
    [
      ['Login', 'In progress'],
      ['Search', 'Complete'],
    ],
  );
  // Placed where the source was: frame-relative centre (200, 200) inside a frame whose top-left is (-2000, -2000).
  assert.deepEqual([table.x, table.y], [-1950, -1900]);
  assert.equal(of('kanban').length, 1);
  assert.equal(of('doc')[0].data?.markdown, '# Notes\n\n- one');
  assert.deepEqual(
    of('mindmap')[0].nodes!.map(n => n.text),
    ['Root', 'Child'],
  );
  assert.equal(of('storymap')[0].data?.cards[0].title, 'Search');
  assert.equal(of('note')[0].text, 'Sketch of the flow');
  assert.equal(Object.keys(assets).length, 1);
  const [a, b] = [of('rectangle')[0], of('ellipse')[0]];
  const line = of('arrow')[0];
  assert.deepEqual([line.from, line.to], [a.id, b.id]);
  assert.equal(b.x - a.x, 200);
  assert.equal(of('text')[0].text, 'Extra');
  assert.equal(report.recreated, 11);
  assert.deepEqual(report.placeholders, {});
  assert.match(whiteboardImportNote(report), /11 objects were recreated from the recreate file\./);
  parseBoard(JSON.parse(JSON.stringify(board)));
});

test('unusable recreate entries are reported and fall back to a placeholder', () => {
  const { board, report } = importWhiteboardRest(
    exportOf([{ id: 't', type: 'data_table_format', position: at(0, 0), geometry: box(300, 200) }], {
      recreate: [{ sourceId: 't', content: { kind: 'table', csv: 'Title only' } }],
    }),
  );
  assert.equal(board.items[0].name, 'Table placeholder');
  assert.equal(report.recreateFailed.length, 1);
  assert.match(report.recreateFailed[0], /^table: A table needs "rows" or "csv"/);
  assert.throws(() => recreateFrom({ kind: 'video' }, { x: 0, y: 0, w: 1, h: 1 }), /Unknown content kind "video"/);
  assert.throws(
    () => recreateFrom({ kind: 'mindmap', nodes: [{ id: '1' }, { id: '2' }] }, { x: 0, y: 0, w: 1, h: 1 }),
    /exactly one root/,
  );
  assert.throws(() =>
    recreateFrom({ kind: 'image', dataUrl: 'data:image/svg+xml;base64,AA' }, { x: 0, y: 0, w: 1, h: 1 }),
  );
});

test('one layer per top-level frame, named after the frame; loose objects stay on top', () => {
  const json = exportOf(
    [
      { id: 'f1', type: 'frame', data: { title: 'Ideas' }, position: at(0, 0), geometry: box(1000, 1000) },
      { id: 'f2', type: 'frame', data: { title: 'Plan' }, position: at(2000, 0), geometry: box(1000, 1000) },
      {
        id: 'inner',
        type: 'frame',
        data: { title: 'Inner' },
        position: at(500, 500, true),
        geometry: box(300, 300),
        parent: { id: 'f1' },
      },
      note('deep', 100, undefined, 'inner'),
      note('n2', 100, undefined, 'f2'),
      note('loose', 5000),
    ],
    {
      connectors: [
        { id: 'c1', startItem: { id: 'deep' }, endItem: { id: 'inner' } },
        { id: 'c2', startItem: { id: 'deep' }, endItem: { id: 'n2' } },
      ],
    },
  );
  assert.equal(topLevelFrameCount(json), 2);
  const { board, report } = importWhiteboardRest(json, undefined, { layersPerFrame: true });
  assert.deepEqual(
    board.layers!.map(l => l.name),
    ['Ideas', 'Plan', 'Outside frames'],
  );
  assert.equal(board.layers!.at(-1)!.id, BASE_LAYER);
  const layerOf = (text: string) => board.items.find(i => i.text === text)!.layer;
  const [ideas, plan] = board.layers!;
  assert.equal(layerOf('Ideas'), ideas.id);
  assert.equal(layerOf('Inner'), ideas.id);
  assert.equal(layerOf('deep'), ideas.id);
  assert.equal(layerOf('n2'), plan.id);
  assert.equal(layerOf('loose'), undefined);
  const lines = board.items.filter(i => i.type === 'arrow');
  assert.deepEqual(
    lines.map(l => l.layer),
    [ideas.id, undefined],
  );
  // Paint order follows the layers: the base layer (loose objects, the cross-frame line) last.
  assert.equal(board.items.at(-1)!.layer, undefined);
  assert.equal(report.layers, 2);
  assert.match(whiteboardImportNote(report), /Made 2 layers, one per frame\./);
  // Without the option nothing changes.
  assert.equal(importWhiteboardRest(json).board.layers, undefined);
});

test('merge-recreate embeds images and CSV files, keeps null entries out and refuses paths outside the folder', async () => {
  const { mergeRecreate, sniffImage, RECREATE_FORMAT } = await import(
    new URL('../scripts/merge-recreate.mjs', import.meta.url).href
  );
  const png = Buffer.from(PNG.split(',')[1], 'base64');
  assert.equal(sniffImage(png), 'image/png');
  assert.equal(sniffImage(Buffer.from('<svg/>')), null);
  const base = path.resolve('fixture-dir');
  const files: Record<string, Buffer> = {
    [path.join(base, 'sketch.png')]: png,
    [path.join(base, 'rows.csv')]: Buffer.from('﻿Title,Status\nA,Complete'),
    [path.join(base, 'fake.png')]: Buffer.from('not an image'),
  };
  const read = async (p: string) => {
    if (!files[p]) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return files[p];
  };
  const exported = exportOf([{ id: 't', type: 'data_table_format', position: at(0, 0), geometry: box(300, 200) }]);
  const recreate = {
    format: RECREATE_FORMAT,
    entries: [
      { sourceId: 't', type: 'data_table_format', content: { kind: 'table', csvFile: 'rows.csv' } },
      { sourceId: 'x', type: 'unsupported', content: { kind: 'image', file: 'sketch.png' } },
      { sourceId: 'y', type: 'doc_format', content: null },
    ],
  };
  const { merged, used, empty } = await mergeRecreate(exported, recreate, base, read);
  assert.deepEqual([used, empty], [2, 1]);
  assert.equal(merged.recreate[0].content.csv, 'Title,Status\nA,Complete');
  assert.equal(merged.recreate[0].content.title, 'rows');
  assert.match(merged.recreate[1].content.dataUrl, /^data:image\/png;base64,/);
  assert.equal(merged.recreate[1].content.file, undefined);
  // The merged file imports with the rebuilt table.
  const { board } = importWhiteboardRest(merged);
  assert.equal(board.items[0].type, 'table');
  for (const [file, message] of [
    ['../secret.png', /must be in the recreate file's folder/],
    [path.resolve('/abs.png'), /relative to the recreate file/],
    ['fake.png', /is not a PNG, JPEG, GIF or WebP image/],
    ['gone.png', /could not read a file \(ENOENT\)/],
  ] as const)
    await assert.rejects(
      mergeRecreate(exported, { format: RECREATE_FORMAT, entries: [{ content: { kind: 'image', file } }] }, base, read),
      message,
    );
  await assert.rejects(mergeRecreate(exported, { entries: [] }, base, read), /not a recreate file/);
});

test('the export script writes a recreate template for objects without content', async () => {
  const { recreateTemplate } = await import(new URL('../scripts/export-whiteboard.mjs', import.meta.url).href);
  const result = {
    board: { id: 'b1', name: 'B' },
    items: [
      note('n', 0),
      { id: 'd', type: 'doc_format', position: at(0, 0), geometry: box(10, 10), parent: { id: 'f' } },
      { id: 'm', type: 'mindmap_node', position: at(0, 0) },
    ],
    mindmapNodes: [{ id: 'm' }],
  };
  const template = recreateTemplate(result);
  assert.equal(template.format, 'boardroom-recreate-v1');
  assert.deepEqual(template.entries, [
    {
      sourceId: 'd',
      type: 'doc_format',
      position: at(0, 0),
      geometry: box(10, 10),
      parent: { id: 'f' },
      content: null,
    },
  ]);
  assert.equal(recreateTemplate({ ...result, items: [note('n', 0)] }), null);
  // Without the mind map export, nodes are listed too.
  assert.equal(recreateTemplate({ ...result, mindmapNodes: [] }).entries.length, 2);
});
