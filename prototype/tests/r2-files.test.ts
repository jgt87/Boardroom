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
import {
  canAddColumn,
  canAddRow,
  gridFit,
  gridFromTable,
  GRID_CELLS_MAX,
  GRID_MAX,
  newGrid,
  validateGrid,
} from '../src/grid.ts';
import type { GridData } from '../src/grid.ts';
import { gridImportNote, importIntoGrid, isTableFile, readTableFile } from '../src/table-file.ts';
import { droppedImage, droppedImageName, imageSourceInHtml } from '../src/web-drop.ts';
import { embedSource, isVideoProvider, mediaSpecs } from '../src/specs-media.ts';
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { odpSlides, odtMarkdown, parseOdp, parseOdt } from '../src/opendoc-import.ts';
import { parseRtf, rtfMarkdown } from '../src/rtf-import.ts';
import { FILE_ASSET_MIME, fileData, fileKindOf, fileSpec, formatBytes, safeFileName } from '../src/specs-file.ts';
import { isValidAsset } from '../src/model-ext.ts';
import { decodeBundle, encodeBundle } from '../src/media-bundle.ts';
import { drawableAsset, referencedAssets } from '../src/images.ts';
import { duplicateLayer, layersOf, MAX_LAYERS } from '../src/layers.ts';
import { applyLayouts, gapFromHandle, gapHandle, setLayoutOption } from '../src/autolayout.ts';
import { exportLinks, standaloneHtml } from '../src/html-export.ts';

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
  const big = gridFromTable(Array.from({ length: 120 }, (_, r) => Array.from({ length: 35 }, (_, c) => `${r}:${c}`)));
  assert.equal(big.data.rows, 71);
  assert.equal(big.data.cols, 35);
  assert.ok(big.data.rows * big.data.cols <= 2500 && big.data.rows <= GRID_MAX);
  assert.equal(big.truncated, true);
  assert.match(gridImportNote(big.data, true), /first 71 rows and 35 columns/);
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

// ---- Track J: OpenDocument and RTF import ---------------------------------------------------------
const odfZip = (mime: string, content: string, styles = '') =>
  zipSync({
    mimetype: [strToU8(mime), { level: 0 }],
    'content.xml': strToU8(content),
    ...(styles ? { 'styles.xml': strToU8(styles) } : {}),
  });
const ODT_CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="o" xmlns:text="t" xmlns:style="s" xmlns:fo="f" xmlns:table="tb">
<office:automatic-styles>
  <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
  <style:style style:name="T2" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
  <style:style style:name="P9" style:family="paragraph" style:parent-style-name="Title"/>
  <text:list-style style:name="L1"><text:list-level-style-number text:level="1" style:num-format="1"/></text:list-style>
  <text:list-style style:name="L2"><text:list-level-style-bullet text:level="1"/></text:list-style>
</office:automatic-styles>
<office:body><office:text>
  <text:sequence-decls><text:sequence-decl text:name="Figure"/></text:sequence-decls>
  <text:p text:style-name="P9">Quarterly plan</text:p>
  <text:h text:outline-level="2">Goals &amp; risks</text:h>
  <text:p>Plain <text:span text:style-name="T1">bold</text:span> and <text:span text:style-name="Strong">strong</text:span><text:s text:c="2"/><text:span text:style-name="T2">italic</text:span><text:note><text:note-body><text:p>Footnote</text:p></text:note-body></text:note><office:annotation><text:p>Comment</text:p></office:annotation></text:p>
  <text:list text:style-name="L1">
    <text:list-item><text:p>First</text:p>
      <text:list><text:list-item><text:p>Nested</text:p></text:list-item></text:list>
    </text:list-item>
    <text:list-item><text:p>Second</text:p></text:list-item>
  </text:list>
  <text:list text:style-name="L2"><text:list-item><text:p>Bullet</text:p></text:list-item></text:list>
  <table:table><table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B|C</text:p></table:table-cell></table:table-row>
  <table:table-row><table:table-cell><text:p>1</text:p></table:table-cell><table:covered-table-cell/></table:table-row></table:table>
  <text:p>&lt;script&gt;alert(1)&lt;/script&gt;</text:p>
</office:text></office:body></office:document-content>`;
const ODT_STYLES = `<office:document-styles><office:styles>
  <style:style style:name="Title" style:family="paragraph"><style:text-properties fo:font-size="28pt"/></style:style>
  <style:style style:name="Strong" style:display-name="Strong Emphasis" style:family="text"><style:text-properties fo:font-weight="700"/></style:style>
</office:styles></office:document-styles>`;

test('ODT text becomes Doc Markdown with headings, lists, emphasis and tables; notes are left out', () => {
  const md = parseOdt(odfZip('application/vnd.oasis.opendocument.text', ODT_CONTENT, ODT_STYLES)).markdown;
  assert.equal(
    md,
    [
      '# Quarterly plan',
      '',
      '## Goals & risks',
      '',
      'Plain **bold** and **strong** *italic*',
      '',
      '1. First',
      '  - Nested',
      '1. Second',
      '- Bullet',
      '',
      '| A | B\\|C |',
      '| --- | --- |',
      '| 1 |  |',
      '',
      '<script>alert(1)</script>',
    ].join('\n'),
  );
  assert.doesNotMatch(md, /Footnote|Comment|Figure/);
  assert.equal(odtMarkdown('<office:text><text:p/></office:text>'), '');
});

test('ODT and ODP files are checked before import', () => {
  assert.throws(() => parseOdt(strToU8('not a zip')), /not a readable OpenDocument text/);
  assert.throws(
    () => parseOdt(odfZip('application/vnd.oasis.opendocument.spreadsheet', ODT_CONTENT)),
    /not a readable OpenDocument text/,
  );
  assert.throws(
    () => parseOdt(odfZip('application/vnd.oasis.opendocument.text', '<office:text></office:text>')),
    /no text/,
  );
  assert.throws(() => parseOdp(odfZip('application/vnd.oasis.opendocument.text', ODT_CONTENT)), /not a readable/);
});

test('ODP pages become slides with titles and text; notes, page numbers and footers are left out', () => {
  const content = `<office:document-content><office:body><office:presentation>
    <draw:page draw:name="page1">
      <draw:frame presentation:class="title"><draw:text-box><text:p>Kick-off</text:p></draw:text-box></draw:frame>
      <draw:frame presentation:class="subtitle"><draw:text-box><text:p>Team &amp; goals</text:p></draw:text-box></draw:frame>
      <presentation:notes><draw:frame presentation:class="notes"><draw:text-box><text:p>Speaker secret</text:p></draw:text-box></draw:frame></presentation:notes>
    </draw:page>
    <draw:page draw:name="page2">
      <draw:frame presentation:class="title"><draw:text-box><text:p>Agenda</text:p></draw:text-box></draw:frame>
      <draw:frame presentation:class="outline"><draw:text-box><text:list><text:list-item><text:p>One<text:line-break/>more</text:p></text:list-item><text:list-item><text:p>Two</text:p></text:list-item></text:list></draw:text-box></draw:frame>
      <draw:frame presentation:class="page-number"><draw:text-box><text:p>2</text:p></draw:text-box></draw:frame>
      <draw:frame presentation:class="footer"><draw:text-box><text:p>Confidential</text:p></draw:text-box></draw:frame>
    </draw:page>
    <draw:page draw:name="page3"/>
  </office:presentation></office:body></office:document-content>`;
  const slides = parseOdp(odfZip('application/vnd.oasis.opendocument.presentation', content));
  assert.deepEqual(
    slides.map(s => [s.layout, s.title, s.body]),
    [
      ['title', 'Kick-off', 'Team & goals'],
      ['content', 'Agenda', 'One\nmore\nTwo'],
      ['blank', '', ''],
    ],
  );
  assert.equal(odpSlides('<office:presentation></office:presentation>').length, 0);
  assert.throws(
    () => parseOdp(odfZip('application/vnd.oasis.opendocument.presentation', '<office:presentation/>')),
    /not a readable|No slides/,
  );
});

test('RTF text, paragraphs, emphasis, unicode and escapes become Markdown; font tables and pictures are skipped', () => {
  const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0 Arial;}}{\colortbl;\red255\green0\blue0;}
{\*\generator Writer;}{\info{\title Secret title}}
\pard\outlinelevel0\b Heading\b0\par
\pard Plain \b bold\b0  and \i italic\i0  caf\'e9 \u8364?5 \{braces\}\par
{\pict\pngblip 89504e470d0a}
\pard\ls1\ilvl0{\listtext\pard\plain \'b7\tab}Apples\par
{\listtext\pard\plain 2.\tab}Pears\par
\pard Link {\field{\*\fldinst HYPERLINK "https://example.com"}{\fldrslt here}}\par
{\header Page header}\pard Bytes {\*\objdata 0102}\bin3 xyzend\par}`;
  assert.equal(
    rtfMarkdown(rtf),
    [
      '# Heading',
      '',
      'Plain **bold** and *italic* café €5 {braces}',
      '',
      '- Apples',
      '1. Pears',
      '',
      'Link here',
      '',
      'Bytes end',
    ].join('\n'),
  );
  assert.equal(rtfMarkdown(String.raw`{\rtf1\uc0\u233 t\'e9\par}`), 'été');
  assert.throws(() => rtfMarkdown('Hello'), /not an RTF/);
  assert.throws(() => rtfMarkdown('{\\rtf1' + '{'.repeat(600) + '}'), /nested too deeply/);
  assert.throws(() => parseRtf(strToU8('{\\rtf1 {\\fonttbl{\\f0 Arial;}}}')), /no text/);
  assert.match(parseRtf(strToU8(String.raw`{\rtf1 Hi \u-3913?\par}`)).markdown, /^Hi /);
});

// ---- Track J: File objects --------------------------------------------------------------------------
test('file objects show a type icon and size, and download under a safe name', () => {
  assert.equal(fileKindOf('Budget.XLSX'), 'spreadsheet');
  assert.equal(fileKindOf('deck.odp'), 'presentation');
  assert.equal(fileKindOf('notes', 'text/plain'), 'text');
  assert.equal(fileKindOf('blob', 'application/x-unknown'), 'other');
  assert.deepEqual(
    [formatBytes(1), formatBytes(999), formatBytes(12_400), formatBytes(3_456_789)],
    ['1 byte', '999 bytes', '12 KB', '3.5 MB'],
  );
  assert.equal(safeFileName('../a/b:c?.doc'), 'a b c .doc');
  assert.equal(safeFileName('  '), 'file');
  assert.deepEqual(fileData({ name: 'Report.Docx', size: 10, type: 'bogus type' }), { size: 10, ext: 'docx' });
  const item: Item = {
    ...createItem('file', 0, 0),
    assetId: 'file-1',
    text: 'Report.docx',
    data: fileData({ name: 'Report.docx', size: 10, type: 'application/msword' }),
  };
  fileSpec.validate(item);
  assert.throws(() => fileSpec.validate({ ...item, assetId: undefined }), /file reference/);
  assert.throws(() => fileSpec.validate({ ...item, data: { size: -1, ext: 'doc' } }), /Invalid file/);
  assert.throws(() => fileSpec.validate({ ...item, data: { size: 1, ext: '../x' } }), /Invalid file/);
});

test('kept files are stored as opaque bytes, pruned by reference and carried in backups and bundles', () => {
  const kept = {
    mime: FILE_ASSET_MIME,
    data: `data:${FILE_ASSET_MIME};base64,AAEC`,
    width: 1,
    height: 1,
    name: 'x.odg',
  };
  assert.ok(isValidAsset(kept));
  assert.ok(!drawableAsset(kept), 'a kept file is never drawn as a picture');
  const item: Item = {
    ...createItem('file', 0, 0),
    assetId: 'file-1',
    text: 'x.odg',
    data: { size: 3, ext: 'odg' },
  };
  const doc = board(item);
  assert.deepEqual([...referencedAssets(doc)], ['file-1']);
  const loaded = parseBoard(JSON.parse(JSON.stringify({ ...doc, assets: { 'file-1': kept } })));
  assert.equal(loaded.items[0].type, 'file');
  const round = decodeBundle(encodeBundle(doc, { 'file-1': kept }));
  assert.deepEqual(round.assets['file-1'], kept);
  assert.deepEqual(round.missing, []);
  assert.throws(() => parseBoard({ ...doc, assets: { 'file-1': { ...kept, mime: 'text/html' } } }));
});

// ---- Track J: Office Online and Power BI embeds -----------------------------------------------------
test('Office Online and Power BI embed links are allowed; other links from those services are not', () => {
  const od = embedSource('https://onedrive.live.com/embed?resid=ABC%21123&authkey=xyz&em=2');
  assert.equal(od.provider, 'office');
  assert.equal(od.src, od.url);
  const sp = embedSource(
    'https://contoso.sharepoint.com/:w:/r/sites/x/_layouts/15/Doc.aspx?sourcedoc=%7B1%7D&action=embedview',
  );
  assert.equal(sp.provider, 'office');
  assert.equal(
    embedSource('https://contoso-my.sharepoint.com/personal/a/_layouts/15/Doc.aspx?action=embedview').provider,
    'office',
  );
  assert.equal(embedSource('https://app.powerbi.com/view?r=eyJrIjoiMSJ9').provider, 'powerbi');
  assert.equal(embedSource('https://app.powerbi.com/reportEmbed?reportId=1&autoAuth=true').provider, 'powerbi');
  for (const bad of [
    'https://onedrive.live.com/edit?id=1',
    'https://contoso.sharepoint.com/sites/x/Doc.aspx?action=edit',
    'https://contoso.sharepoint.com.evil.example/x?action=embedview',
    'https://evil.example/contoso.sharepoint.com?action=embedview',
    'https://app.powerbi.com/groups/me/reports/1',
    'http://app.powerbi.com/view?r=1',
  ])
    assert.throws(() => embedSource(bad), Error, bad);
  const embed = mediaSpecs.find(s => s.kind === 'embed')!;
  embed.validate({ ...createItem('embed', 0, 0), data: { url: od.url, provider: 'office' } });
  assert.throws(() => embed.validate({ ...createItem('embed', 0, 0), data: { url: od.url, provider: 'powerbi' } }));
  const csp = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  for (const origin of ['https://onedrive.live.com', 'https://*.sharepoint.com', 'https://app.powerbi.com'])
    assert.ok(csp.includes(`'${origin}'`), `frame-src allows ${origin}`);
});

// ---- Track J: duplicate layer -----------------------------------------------------------------------
const arrowBetween = (from: string, to: string): Item => ({ ...createItem('arrow', 0, 0), from, to });
test('duplicating a layer copies its objects with new ids and re-points references between copies', () => {
  const a: Item = { ...createItem('rectangle', 0, 0), layer: 'L', group: 'g1' },
    b: Item = { ...createItem('rectangle', 300, 0), layer: 'L', group: 'g1', linkTo: a.id },
    outside = createItem('note', 600, 0),
    inner = { ...arrowBetween(a.id, b.id), layer: 'L' },
    across = { ...arrowBetween(a.id, outside.id), layer: 'L' },
    child = { ...createItem('note', 0, 400), layer: 'L' },
    baseChild = createItem('note', 0, 600),
    box: Item = {
      ...createItem('autolayout', 0, 300),
      layer: 'L',
      data: { direction: 'row', gap: 16, padding: 20, wrap: true, children: [child.id, baseChild.id] },
    };
  const doc = parseBoard(
    JSON.parse(
      JSON.stringify({
        ...board(outside, a, b, inner, across, box, child, baseChild),
        layers: [
          { id: 'base', name: 'Layer 1' },
          { id: 'L', name: 'Shapes', locked: true },
          { id: 'top', name: 'Top' },
        ],
        groups: [{ id: 'g1', parent: null }],
      }),
    ),
  );
  let n = 0;
  const made = duplicateLayer(doc, 'L', 'L2', () => `copy-${++n}`);
  assert.deepEqual(
    layersOf(made.board).map(l => [l.id, l.name, !!l.locked]),
    [
      ['base', 'Layer 1', false],
      ['L', 'Shapes', true],
      ['L2', 'Shapes copy', false],
      ['top', 'Top', false],
    ],
  );
  assert.equal(made.ids.length, 6);
  const originals = doc.items.filter(i => i.layer === 'L'),
    copies = made.board.items.filter(i => i.layer === 'L2'),
    copyOf = (id: string) => copies[originals.findIndex(i => i.id === id)];
  assert.ok(copies.every(c => !doc.items.some(i => i.id === c.id)));
  const ca = copyOf(a.id),
    cb = copyOf(b.id);
  assert.deepEqual([copyOf(inner.id).from, copyOf(inner.id).to], [ca.id, cb.id]);
  assert.deepEqual([copyOf(across.id).from, copyOf(across.id).to], [ca.id, outside.id]);
  assert.equal(cb.linkTo, ca.id);
  assert.ok(ca.group && ca.group !== 'g1' && ca.group === cb.group);
  assert.deepEqual(copyOf(box.id).data!.children, [copyOf(child.id).id]);
  const order = made.board.items.map(i => i.layer ?? 'base');
  assert.ok(order.lastIndexOf('L') < order.indexOf('L2'), 'the copy paints above the original layer');
  parseBoard(JSON.parse(JSON.stringify(made.board)));
  const full: Board = {
    ...doc,
    layers: Array.from({ length: MAX_LAYERS }, (_, k) => ({ id: k ? `x${k}` : 'base', name: `Layer ${k + 1}` })),
  };
  assert.throws(() => duplicateLayer(full, 'base', 'new'), /up to 30 layers/);
  assert.throws(() => duplicateLayer(doc, 'missing', 'new'), /no longer exists/);
});

// ---- Track J: larger grids --------------------------------------------------------------------------
test('grids hold up to 100 rows or columns and 2,500 cells', () => {
  assert.equal(GRID_CELLS_MAX, 2500);
  assert.deepEqual(gridFit(500, 3), { rows: 100, cols: 3 });
  assert.deepEqual(gridFit(80, 80), { rows: 31, cols: 80 });
  assert.deepEqual(gridFit(2, 400), { rows: 2, cols: 100 });
  validateGrid(newGrid(100, 25));
  validateGrid(newGrid(50, 50));
  assert.throws(() => validateGrid(newGrid(51, 50)), /2,500 cells/);
  assert.throws(() => validateGrid(newGrid(101, 1)), /2,500 cells/);
  assert.ok(canAddRow(newGrid(49, 50)) && !canAddRow(newGrid(50, 50)) && !canAddRow(newGrid(100, 1)));
  assert.ok(canAddColumn(newGrid(25, 99)) && !canAddColumn(newGrid(25, 100)));
});

// ---- Track J: auto-layout spacing handle -------------------------------------------------------------
test('the spacing handle sits in the first gap and sets the gap from its dragged position', () => {
  const kids = [0, 1, 2].map(() => ({ ...createItem('note', 0, 0), w: 100, h: 100 }));
  const row: Item = {
    ...createItem('autolayout', 0, 0),
    x: 0,
    y: 0,
    w: 600,
    data: { direction: 'row', gap: 16, padding: 20, wrap: true, children: kids.map(k => k.id) },
  };
  const doc = applyLayouts(board(row, ...kids));
  const h = gapHandle(doc, row.id)!;
  assert.deepEqual(h, { x: 128, y: 100, axis: 'x', anchor: 120, gap: 16 });
  assert.equal(gapFromHandle(h, 140), 40);
  assert.equal(gapFromHandle(h, 100), 0);
  assert.equal(gapFromHandle(h, 9999), 400);
  assert.equal(gapFromHandle(h, 143, 8), 48);
  const wider = setLayoutOption(doc, row.id, { gap: 40 });
  assert.deepEqual(
    wider.items.slice(1).map(i => i.x),
    [20, 160, 300],
  );
  const column = setLayoutOption(doc, row.id, { direction: 'column' });
  assert.deepEqual(gapHandle(column, row.id), { x: 70, y: 158, axis: 'y', anchor: 150, gap: 16 });
  // A narrow wrapping row: the second child wraps, so the handle sits between the rows.
  const narrow = applyLayouts({ ...doc, items: doc.items.map(i => (i.id === row.id ? { ...i, w: 150 } : i)) });
  const wrapped = gapHandle(narrow, row.id)!;
  assert.equal(wrapped.axis, 'y');
  assert.equal(wrapped.anchor, 150);
  assert.equal(gapHandle(board({ ...row, data: { ...row.data!, children: [kids[0].id] } }, kids[0]), row.id), null);
});

// ---- Track J: HTML export click-through --------------------------------------------------------------
test('linked objects become click-through hotspots in the exported page', () => {
  const frame = { ...createItem('frame', 1000, 0), w: 400, h: 300, name: 'Step "2" <b>' },
    button = { ...createItem('rectangle', 100, 50), linkTo: frame.id },
    hidden = { ...createItem('rectangle', 0, 0), linkTo: frame.id, hidden: true },
    dangling = { ...createItem('rectangle', 0, 0), linkTo: 'gone' };
  const doc = board(frame, button, hidden, dangling);
  const links = exportLinks(doc, { x: -30, y: -45, w: 1500, h: 500 });
  assert.equal(links.length, 1);
  assert.deepEqual(
    { ...links[0], label: '' },
    { x: button.x + 30, y: button.y + 45, w: button.w, h: button.h, tx: 1030, ty: 45, tw: 400, th: 300, label: '' },
  );
  assert.equal(exportLinks(doc, { x: 0, y: 0, w: 500, h: 500 }).length, 0, 'targets outside the export are left out');
  const html = standaloneHtml('<svg width="10" height="10"></svg>', 'Plan', new Date('2026-11-05T00:00:00Z'), links);
  assert.match(html, /<button class="hotspot" type="button" style="left:/);
  assert.match(html, /data-x="1030" data-y="45" data-w="400" data-h="300"/);
  assert.match(html, /aria-label="Go to Step &quot;2&quot; &lt;b&gt;"/);
  assert.match(html, /id="back" hidden/);
  assert.equal((html.match(/<\/script>/gi) ?? []).length, 1);
  assert.doesNotMatch(html, /<script src=/);
});
