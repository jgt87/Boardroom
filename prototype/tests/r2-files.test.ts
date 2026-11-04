// Track R2: export fidelity, file formats, web content and image editing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { areaBetween, exportIds, frameExportRegion, FRAME_TITLE_BAND } from '../src/export-area.ts';
import {
  adjustImages,
  adjustTransfer,
  cleanAdjust,
  createImageItem,
  decodeDataUrl,
  flipTransform,
  imageFileError,
  imageTypeOf,
  originalFileName,
  rasterSize,
  svgDeclaredSize,
  IMAGE_ACCEPT,
} from '../src/images.ts';
import { gridFromTable, GRID_MAX, newGrid } from '../src/grid.ts';
import type { GridData } from '../src/grid.ts';
import { gridImportNote, importIntoGrid, isTableFile, readTableFile } from '../src/table-file.ts';
import { droppedImage, droppedImageName, imageSourceInHtml } from '../src/web-drop.ts';
import { embedSource, isVideoProvider, mediaSpecs } from '../src/specs-media.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const asset = { mime: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=', width: 200, height: 100, name: 'a.png' };

// ---- Export regions -------------------------------------------------------------------------------
test('frame PDF pages include the title band above the frame', () => {
  const frame = { ...createItem('frame', 100, 200), w: 800, h: 600 };
  const r = frameExportRegion(frame);
  assert.deepEqual(r, { x: 100, y: 200 - FRAME_TITLE_BAND, w: 800, h: 600 + FRAME_TITLE_BAND });
  assert.ok(FRAME_TITLE_BAND >= 24);
});

test('a dragged area is normalised whichever way it was dragged', () => {
  assert.deepEqual(areaBetween({ x: 50, y: 80 }, { x: 10, y: 20 }), { x: 10, y: 20, w: 40, h: 60 });
});

test('selection-only exports keep frame contents and connectors between kept objects', () => {
  const frame = { ...createItem('frame', 0, 0), w: 500, h: 500 },
    a = createItem('note', 20, 20),
    b = createItem('note', 260, 20),
    outside = createItem('note', 900, 900),
    link = { ...createItem('arrow', 0, 0), from: a.id, to: b.id },
    stray = { ...createItem('arrow', 0, 0), from: a.id, to: outside.id };
  const items = [frame, a, b, outside, link, stray];
  const kept = exportIds(items, [frame.id]);
  assert.ok(kept.has(frame.id) && kept.has(a.id) && kept.has(b.id) && kept.has(link.id));
  assert.ok(!kept.has(outside.id) && !kept.has(stray.id));
  assert.deepEqual([...exportIds(items, [outside.id])], [outside.id]);
});

// ---- SVG and BMP images ---------------------------------------------------------------------------
test('SVG and BMP files are accepted and recognised by type or extension', () => {
  assert.equal(imageFileError({ type: 'image/svg+xml', size: 1000, name: 'logo.svg' }), null);
  assert.equal(imageFileError({ type: 'image/bmp', size: 3e6, name: 'scan.bmp' }), null);
  assert.equal(imageFileError({ type: '', size: 10, name: 'x.BMP' }), null);
  assert.match(imageFileError({ type: 'image/svg+xml', size: 6e6, name: 'big.svg' })!, /larger than 5 MB/);
  assert.match(imageFileError({ type: 'image/tiff', size: 10 })!, /SVG or BMP/);
  assert.equal(imageTypeOf({ type: 'image/x-ms-bmp' }), 'image/bmp');
  assert.equal(imageTypeOf({ type: '', name: 'icon.svg' }), 'image/svg+xml');
  assert.ok(IMAGE_ACCEPT.includes('.svg') && IMAGE_ACCEPT.includes('image/bmp'));
});

test('SVG size is read from attributes or the viewBox without building a DOM', () => {
  assert.deepEqual(svgDeclaredSize('<svg xmlns="x" width="120" height="40px">'), { width: 120, height: 40 });
  assert.deepEqual(svgDeclaredSize("<svg viewBox='0 0 300 150'><rect/></svg>"), { width: 300, height: 150 });
  assert.deepEqual(svgDeclaredSize('<svg width="200" viewBox="0 0 100 50">'), { width: 200, height: 100 });
  assert.equal(svgDeclaredSize('<svg width="100%" height="100%">'), null);
  assert.equal(svgDeclaredSize('<html>'), null);
  assert.equal(svgDeclaredSize('<svgfoo width="1" height="1">'), null);
});

test('vector images are rasterised large enough to stay sharp, bitmaps at their own size', () => {
  assert.deepEqual(rasterSize(24, 12, true), { width: 1024, height: 512 });
  assert.deepEqual(rasterSize(800, 600, false), { width: 800, height: 600 });
  assert.deepEqual(rasterSize(10000, 5000, false), { width: 4096, height: 2048 });
  assert.deepEqual(rasterSize(0, 0, true), { width: 1024, height: 512 });
});

// ---- Download original ----------------------------------------------------------------------------
test('stored files decode back to their bytes and download under a matching name', () => {
  const png = decodeDataUrl('data:image/png;base64,AAEC');
  assert.equal(png.mime, 'image/png');
  assert.deepEqual([...png.bytes], [0, 1, 2]);
  const svg = decodeDataUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E');
  assert.equal(new TextDecoder().decode(svg.bytes), '<svg>');
  assert.throws(() => decodeDataUrl('https://example.com/a.png'));
  assert.equal(originalFileName({ name: 'Holiday.jpeg', mime: 'image/jpeg' }), 'Holiday.jpeg');
  assert.equal(originalFileName({ name: 'clip', mime: 'video/mp4' }), 'clip.mp4');
  assert.equal(originalFileName({ name: 'report.png', mime: 'application/pdf' }), 'report.pdf');
  assert.equal(originalFileName({ name: 'a/b:c.pdf', mime: 'application/pdf' }), 'a b c.pdf');
  assert.equal(originalFileName({ name: '', mime: 'image/webp' }, 'image'), 'image.webp');
});

// ---- Spreadsheets into a Grid ---------------------------------------------------------------------
test('spreadsheet rows become grid cells, capped at the grid limit', () => {
  const small = gridFromTable([['a', 'b'], ['c']]);
  assert.deepEqual(small.data.cells, [
    ['a', 'b'],
    ['c', ''],
  ]);
  assert.equal(small.truncated, false);
  const big = gridFromTable(Array.from({ length: 40 }, (_, r) => Array.from({ length: 35 }, (_, c) => `${r}:${c}`)));
  assert.equal(big.data.rows, GRID_MAX);
  assert.equal(big.data.cols, GRID_MAX);
  assert.equal(big.truncated, true);
  assert.match(gridImportNote(big.data, true), /first 30 rows and columns/);
  assert.equal(gridFromTable([]).data.rows, 1);
});

test('importing into an existing grid keeps its place, alignment and in-range anchors', () => {
  const base: GridData = {
    ...newGrid(3, 3),
    align: 'center',
    merges: [{ r: 0, c: 0, rs: 1, cs: 2 }],
    objects: [
      { id: 'n1', r: 0, c: 0 },
      { id: 'n2', r: 2, c: 2 },
    ],
  };
  const grid = { ...createItem('grid', 40, 60), data: base },
    locked = { ...createItem('grid', 0, 0), locked: true },
    doc = board(grid, locked, { ...createItem('note', 0, 0), id: 'n1' }, { ...createItem('note', 0, 0), id: 'n2' });
  const made = importIntoGrid(doc, grid.id, [
    ['Name', 'Score'],
    ['Ada', '3'],
  ])!;
  const next = made.board.items[0];
  assert.equal(next.x, 40);
  assert.equal(next.y, 60);
  assert.equal(next.data!.align, 'center');
  assert.deepEqual(next.data!.merges, []);
  assert.deepEqual(next.data!.objects, [{ id: 'n1', r: 0, c: 0 }]);
  assert.equal(next.data!.cells[1][0], 'Ada');
  assert.equal(importIntoGrid(doc, locked.id, [['x']]), null);
  assert.equal(importIntoGrid(doc, 'missing', [['x']]), null);
  parseBoard(JSON.parse(JSON.stringify(made.board)));
});

test('CSV files are read as rows; only spreadsheet names count as table files', async () => {
  const rows = await readTableFile(new File(['a,b\n"1,5",2\n'], 'scores.csv', { type: 'text/csv' }));
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['1,5', '2'],
  ]);
  assert.ok(isTableFile('x.xlsx') && isTableFile('x.TSV') && !isTableFile('x.docx'));
});

// ---- Web content ----------------------------------------------------------------------------------
test('pictures dragged from web pages are recognised; links and text stay links and text', () => {
  const data = 'data:image/png;base64,iVBORw0KGgo=';
  assert.deepEqual(droppedImage(`<meta charset="utf-8"><img src="${data}" alt="x">`, ''), { kind: 'data', url: data });
  assert.deepEqual(
    droppedImage('<img alt=a src="https://cdn.example.com/p?id=1&amp;s=2">', 'https://example.com/page'),
    {
      kind: 'remote',
      url: 'https://cdn.example.com/p?id=1&s=2',
    },
  );
  assert.deepEqual(droppedImage('', 'https://example.com/photos/cat.JPG?w=200'), {
    kind: 'remote',
    url: 'https://example.com/photos/cat.JPG?w=200',
  });
  assert.equal(droppedImage('', 'https://example.com/article'), null);
  assert.equal(droppedImage('<a href="https://example.com">Example</a>', 'https://example.com'), null);
  assert.equal(imageSourceInHtml(`<p>${'Long selected text. '.repeat(20)}<img src="a.png"></p>`), undefined);
  assert.equal(droppedImage('<img src="javascript:alert(1)">', ''), null);
  assert.equal(droppedImage('<img src="data:text/html,<b>x</b>">', ''), null);
  assert.equal(droppedImage('', 'https://user:pw@example.com/a.png'), null);
  assert.equal(droppedImageName('https://example.com/img/cat%20photo', 'image/jpeg'), 'cat photo.jpg');
  assert.equal(droppedImageName(data, 'image/svg+xml'), 'Dropped image.svg');
});

test('published and shared Google documents and Loom videos embed through the allow-list', () => {
  const id = '2PACX-1vT' + 'a'.repeat(30);
  assert.deepEqual(embedSource(`https://docs.google.com/document/d/e/${id}/pub`), {
    provider: 'gdocs',
    url: `https://docs.google.com/document/d/e/${id}/pub`,
    src: `https://docs.google.com/document/d/e/${id}/pub?embedded=true`,
  });
  assert.equal(
    embedSource(`https://docs.google.com/spreadsheets/d/e/${id}/pubhtml`).src,
    `https://docs.google.com/spreadsheets/d/e/${id}/pubhtml?widget=true&headers=false`,
  );
  assert.equal(
    embedSource('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#slide=id.p').src,
    'https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/preview',
  );
  const loom = embedSource('https://www.loom.com/share/0123456789abcdef0123456789abcdef');
  assert.equal(loom.src, 'https://www.loom.com/embed/0123456789abcdef0123456789abcdef');
  assert.ok(isVideoProvider('loom'));
  for (const bad of [
    'https://docs.google.com/forms/d/e/abcdefghijklmnopqrstuvwxyz/viewform',
    'https://docs.google.com/document/d/short/edit',
    'https://docs.google.com.evil.io/document/d/e/abcdefghijklmnopqrstuvwxyz/pub',
    'https://www.loom.com/share/not-hex!',
    'https://www.loom.com/looms/videos',
  ])
    assert.throws(() => embedSource(bad), bad);
  const embed = mediaSpecs.find(s => s.kind === 'embed')!,
    item = { ...createItem('embed', 0, 0), data: { url: loom.url, provider: 'loom' } };
  embed.validate!(item);
});

// ---- Image adjustments ----------------------------------------------------------------------------
test('flip, brightness and contrast are stored without defaults and validated on load', () => {
  const img = createImageItem('asset-1', asset, { x: 0, y: 0 }),
    doc = board(img, createItem('note', 0, 0));
  const flipped = adjustImages(doc, [img.id, doc.items[1].id], a => ({ ...a, flipX: !a.flipX, brightness: 130 }));
  assert.deepEqual(flipped.items[0].adjust, { flipX: true, brightness: 130 });
  assert.equal(flipped.items[1].adjust, undefined);
  const reset = adjustImages(flipped, [img.id], a => ({ ...a, flipX: false, brightness: 100 }));
  assert.equal('adjust' in reset.items[0], false);
  assert.deepEqual(cleanAdjust({ brightness: 999, contrast: -5 }), { brightness: 200, contrast: 0 });
  const backup = { ...flipped, assets: { 'asset-1': asset } };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(backup))).items[0].adjust, { flipX: true, brightness: 130 });
  for (const bad of [{ brightness: 300 }, { flipX: 'yes' }, { blur: 3 }, []])
    assert.throws(() => parseBoard({ ...backup, items: [{ ...img, adjust: bad }] }), /adjustment/);
  assert.throws(() => parseBoard(board({ ...createItem('note', 0, 0), adjust: { flipX: true } })), /adjustment/);
});

test('adjustments map to an SVG flip transform and a linear colour transfer', () => {
  assert.equal(flipTransform(undefined, 100, 50), undefined);
  assert.equal(flipTransform({ flipX: true }, 100, 50), 'translate(100 0) scale(-1 1)');
  assert.equal(flipTransform({ flipX: true, flipY: true }, 100, 50), 'translate(100 50) scale(-1 -1)');
  assert.equal(adjustTransfer({}), null);
  assert.deepEqual(adjustTransfer({ brightness: 150 }), { slope: 1.5, intercept: 0 });
  assert.deepEqual(adjustTransfer({ contrast: 50 }), { slope: 0.5, intercept: 0.25 });
  assert.deepEqual(adjustTransfer({ brightness: 0 }), { slope: 0, intercept: 0 });
});
