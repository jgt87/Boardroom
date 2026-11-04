// File and data handling gaps: XLSX sheet picker (Q16), ambiguous CSV dates (Q15), kept SVG/BMP originals
// (R2-Q3) and blueprints in library backups (R3-Q2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, ImageAsset, Item } from '../src/model.ts';
import { firstSheetPath, parseXlsx, workbookSheets, xlsxSheetNames } from '../src/office-import.ts';
import { readTableFile } from '../src/table-file.ts';
import { parseDate, slashedDateOrder } from '../src/cell-values.ts';
import { importRecordTable, inferFieldType } from '../src/record-import.ts';
import { defaultSchema } from '../src/record-schema.ts';
import {
  createImageItem,
  downloadableAsset,
  drawableAsset,
  itemAssetIds,
  keepsOriginal,
  originalAsset,
  originalFileName,
  referencedAssets,
  replaceImage,
  splitAssets,
  withAssets,
} from '../src/images.ts';
import { decodeBundle, encodeBundle } from '../src/media-bundle.ts';
import { assetRefsAcrossBoards, createBoard, openLibrary, saveActive } from '../src/board-library.ts';
import type { KeyValueStore } from '../src/board-library.ts';
import { decodeLibrary, encodeLibrary, readBackup } from '../src/library-backup.ts';
import {
  BLUEPRINT_LIMIT,
  BLUEPRINT_MAX_BYTES,
  mergeBlueprints,
  parseBlueprints,
  validBlueprints,
  type Blueprint,
} from '../src/blueprints.ts';
import { copySelection } from '../src/clipboard.ts';

const ids = (() => {
  let n = 0;
  return () => `id${++n}`;
})();

// ---- Q16 XLSX sheet picker --------------------------------------------------------------------------------

function workbook(sheets: { name: string; rows: string[][] }[]): Uint8Array {
  const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': xml('<Types/>'),
    'xl/workbook.xml': xml(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map((s, k) => `<sheet name="${s.name}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('') +
        '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': xml(
      '<Relationships>' +
        sheets
          .map(
            (_, k) =>
              `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/s${k + 1}.xml"/>`,
          )
          .join('') +
        '</Relationships>',
    ),
  };
  sheets.forEach((s, k) => {
    files[`xl/worksheets/s${k + 1}.xml`] = xml(
      '<worksheet><sheetData>' +
        s.rows
          .map(
            (r, ri) =>
              `<row r="${ri + 1}">` + r.map(c => `<c t="inlineStr"><is><t>${c}</t></is></c>`).join('') + '</row>',
          )
          .join('') +
        '</sheetData></worksheet>',
    );
  });
  return zipSync(files);
}
const twoSheets = () =>
  workbook([
    { name: 'Summary', rows: [['Total'], ['3']] },
    {
      name: 'Tasks &amp; owners',
      rows: [
        ['Title', 'Owner'],
        ['Ship', 'Ana'],
      ],
    },
  ]);
const xlsxFile = (bytes: Uint8Array, name = 'book.xlsx') => new File([bytes as BlobPart], name);

test('workbook sheets are listed in order with their part paths', () => {
  const bytes = twoSheets();
  assert.deepEqual(xlsxSheetNames(bytes), ['Summary', 'Tasks & owners']);
  const sheets = workbookSheets(
    '<sheets><sheet name="A" r:id="r1"/><sheet name="" r:id="missing"/></sheets>',
    '<Relationship Id="r1" Target="/xl/worksheets/a.xml"/>',
  );
  assert.deepEqual(sheets, [
    { name: 'A', path: 'xl/worksheets/a.xml' },
    { name: 'Sheet2', path: 'xl/worksheets/sheet2.xml' },
  ]);
  assert.deepEqual(firstSheetPath('<workbook/>', ''), { name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' });
});

test('parseXlsx reads the first sheet by default and a chosen one by index', () => {
  const bytes = twoSheets();
  assert.deepEqual(parseXlsx(bytes).rows, [['Total'], ['3']]);
  const second = parseXlsx(bytes, 1);
  assert.equal(second.sheet, 'Tasks & owners');
  assert.deepEqual(second.rows, [
    ['Title', 'Owner'],
    ['Ship', 'Ana'],
  ]);
  assert.throws(() => parseXlsx(bytes, 5), /not in the file/);
  const empty = workbook([
    { name: 'One', rows: [['a']] },
    { name: 'Blank', rows: [] },
  ]);
  assert.throws(() => parseXlsx(empty, 1), /The worksheet "Blank" is empty/);
});

test('readTableFile asks which sheet only when a workbook has several', async () => {
  const asked: string[][] = [];
  const choose = async (names: string[]) => {
    asked.push(names);
    return 1;
  };
  assert.deepEqual(await readTableFile(xlsxFile(twoSheets()), choose), [
    ['Title', 'Owner'],
    ['Ship', 'Ana'],
  ]);
  assert.deepEqual(asked, [['Summary', 'Tasks & owners']]);
  // Cancelling resolves with null; a single sheet imports straight away; no chooser reads the first.
  assert.equal(await readTableFile(xlsxFile(twoSheets()), async () => null), null);
  const single = workbook([{ name: 'Only', rows: [['x']] }]);
  assert.deepEqual(await readTableFile(xlsxFile(single), choose), [['x']]);
  assert.equal(asked.length, 1);
  assert.deepEqual(await readTableFile(xlsxFile(twoSheets())), [['Total'], ['3']]);
});

// ---- Q15 Ambiguous CSV dates ------------------------------------------------------------------------------

test('a column settles its day/month order from any part over 12', () => {
  assert.equal(slashedDateOrder(['03/04/2026', '25/04/2026']), 'dmy');
  assert.equal(slashedDateOrder(['03/04/2026', '04/25/2026']), 'mdy');
  assert.equal(slashedDateOrder(['03/04/2026', '05/06/2026']), 'ambiguous');
  assert.equal(slashedDateOrder(['25/04/2026', '04/25/2026']), 'conflict');
  assert.equal(slashedDateOrder(['05/05/2026', '']), 'dmy', 'equal parts read the same either way');
  assert.equal(slashedDateOrder(['2026-01-02', 'text']), null);
  assert.equal(parseDate('03/04/2026'), null, 'without an order a slashed date is not guessed');
  assert.equal(parseDate('03/04/2026', 'dmy'), '2026-04-03');
  assert.equal(parseDate('03/04/2026', 'mdy'), '2026-03-04');
  assert.equal(parseDate('03-04-2026', 'dmy'), '2026-04-03');
  assert.equal(parseDate('31/02/2026', 'dmy'), null, 'impossible dates stay unread');
  assert.equal(parseDate('2026-04-03', 'mdy'), '2026-04-03', 'ISO dates ignore the order');
});

test('start and end columns read slashed dates in the order the column settles', () => {
  const made = importRecordTable(
    [
      ['Title', 'Start', 'End'],
      ['A', '03/04/2026', '04/03/2026'],
      ['B', '25/04/2026', '04/25/2026'],
    ],
    defaultSchema,
    [],
    ids,
  );
  assert.deepEqual(
    made.rows.map(r => [r.start, r.end]),
    [
      ['2026-04-03', '2026-04-03'],
      ['2026-04-25', '2026-04-25'],
    ],
  );
  assert.equal(made.skipped, 0);
  const notes = made.notes.join(' ');
  assert.match(notes, /"Start" were read as day\/month\/year/);
  assert.match(notes, /"End" were read as month\/day\/year/);
});

test('an unclear or contradictory date column is left empty and reported', () => {
  const made = importRecordTable(
    [
      ['Title', 'Start', 'Due'],
      ['A', '03/04/2026', '25/04/2026'],
      ['B', '05/06/2026', '04/25/2026'],
    ],
    defaultSchema,
    [],
    ids,
  );
  assert.deepEqual(
    made.rows.map(r => [r.start, r.end]),
    [
      ['', ''],
      ['', ''],
    ],
  );
  assert.equal(made.skipped, 2);
  const notes = made.notes.join(' ');
  assert.match(notes, /"Start" could be day\/month or month\/day, so they were left empty/);
  assert.match(notes, /"Due" mix day\/month and month\/day order/);
  assert.match(notes, /2 values were left empty/);
});

test('custom date columns use the inferred order; unclear ones keep their text', () => {
  assert.equal(inferFieldType(['03/04/2026', '13/04/2026']).type, 'date');
  assert.equal(inferFieldType(['03/04/2026', '05/06/2026']).type, 'text');
  const made = importRecordTable(
    [
      ['Title', 'Signed', 'Reviewed'],
      ['A', '03/04/2026', '03/04/2026'],
      ['B', '13/04/2026', '05/06/2026'],
    ],
    defaultSchema,
    [],
    ids,
  );
  const signed = made.schema.fields.find(f => f.name === 'Signed')!,
    reviewed = made.schema.fields.find(f => f.name === 'Reviewed')!;
  assert.equal(signed.type, 'date');
  assert.equal(made.rows[0].values?.[signed.id], '2026-04-03');
  assert.equal(made.rows[1].values?.[signed.id], '2026-04-13');
  assert.equal(reviewed.type, 'text');
  assert.equal(made.rows[1].values?.[reviewed.id], '05/06/2026');
  assert.match(made.notes.join(' '), /"Reviewed" could be day\/month or month\/day, so the column was kept as text/);
  // An existing date field reads with the order the imported column settles.
  const again = importRecordTable(
    [
      ['Title', 'Signed'],
      ['C', '04/30/2026'],
    ],
    made.schema,
    made.rows,
    ids,
  );
  assert.equal(again.rows[0].values?.[signed.id], '2026-04-30');
});

// ---- R2-Q3 Kept SVG and BMP originals -------------------------------------------------------------------

const png: ImageAsset = {
  mime: 'image/png',
  data: 'data:image/png;base64,iVBORw0KGgo=',
  width: 40,
  height: 20,
  name: 'logo.png',
};
const svgBytes = strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect/></svg>');
const svg = originalAsset(svgBytes, 'image/svg+xml', 'logo.svg', png)!;
const bmp = originalAsset(new Uint8Array([0x42, 0x4d, 1, 2, 3]), 'image/bmp', 'photo.bmp', png)!;

test('an SVG or BMP original is kept beside its PNG, within the size limits', () => {
  assert.equal(svg.mime, 'image/svg+xml');
  assert.ok(svg.data.startsWith('data:image/svg+xml;base64,'));
  assert.equal(atob(svg.data.split(',')[1]), new TextDecoder().decode(svgBytes));
  assert.deepEqual([svg.width, svg.height, svg.name], [40, 20, 'logo.svg']);
  assert.equal(bmp.mime, 'image/bmp');
  assert.equal(originalAsset(svgBytes, 'image/png', 'x.png', png), null, 'only converted types');
  assert.ok(keepsOriginal('image/svg+xml', 5_000_000) && !keepsOriginal('image/svg+xml', 5_000_001));
  assert.ok(keepsOriginal('image/bmp', 25_000_000) && !keepsOriginal('image/bmp', 25_000_001));
  assert.equal(originalFileName(svg), 'logo.svg');
  assert.equal(originalFileName({ ...bmp, name: 'photo' }), 'photo.bmp');
});

test('an image item refers to its original; validation, pruning and downloads follow it', () => {
  const item = { ...createImageItem('a1', png, { x: 0, y: 0 }, 'o1'), id: 'img' };
  assert.equal(item.originalAssetId, 'o1');
  assert.deepEqual(itemAssetIds(item), ['a1', 'o1']);
  const board: Board = { ...newBoard(), items: [item] };
  assert.deepEqual([...referencedAssets(board)], ['a1', 'o1']);
  parseBoard(JSON.parse(JSON.stringify(board)));
  for (const bad of [{ originalAssetId: 5 }, { originalAssetId: 'a1' }, { originalAssetId: '../x' }])
    assert.throws(() => parseBoard({ ...board, items: [{ ...item, ...bad }] }), /original image/);
  assert.throws(
    () => parseBoard({ ...board, items: [{ ...createItem('note', 0, 0), originalAssetId: 'o1' }] }),
    /original image/,
  );
  // "Download original" returns the original; without one it falls back to the stored picture.
  assert.equal(downloadableAsset(item, { a1: png, o1: svg }), svg);
  assert.equal(downloadableAsset(item, { a1: png }), png);
  assert.equal(downloadableAsset({ assetId: 'a1', originalAssetId: 'a1' }, { a1: png }), png);
  // Originals are never drawn.
  assert.ok(drawableAsset(png) && !drawableAsset(svg) && !drawableAsset(bmp));
  // Replacing the picture drops or swaps the original.
  assert.equal(replaceImage(board, 'img', 'a2', png).items[0].originalAssetId, undefined);
  assert.equal(replaceImage(board, 'img', 'a2', png, 'o2').items[0].originalAssetId, 'o2');
  // Pruning across stored boards keeps the original while it is referenced.
  const kv = new MemoryStore();
  let { library: lib } = openLibrary(kv, parseBoard, newBoard);
  lib = saveActive(kv, lib, board);
  lib = createBoard(kv, lib, { ...newBoard(), title: 'Other' }).library;
  assert.deepEqual([...assetRefsAcrossBoards(kv, lib)].sort(), ['a1', 'o1']);
});

test('originals travel in JSON backups, .boardroom bundles, library backups and copies', () => {
  const item = { ...createImageItem('a1', png, { x: 0, y: 0 }, 'o1'), id: 'img' },
    bmpItem = { ...createImageItem('a2', png, { x: 0, y: 0 }, 'o2'), id: 'img2' },
    board: Board = { ...newBoard(), items: [item, bmpItem] },
    assets = { a1: png, o1: svg, a2: png, o2: bmp };
  // JSON backup with base64 assets.
  const json = withAssets(board, assets);
  assert.deepEqual(Object.keys(json.assets!).sort(), ['a1', 'a2', 'o1', 'o2']);
  const parsed = parseBoard(JSON.parse(JSON.stringify(json)));
  assert.equal(parsed.assets!.o1.data, svg.data);
  assert.equal(splitAssets(parsed, {}).missing, 0);
  // A missing original is not reported as a missing image.
  assert.equal(splitAssets({ ...board }, { a1: png, a2: png }).missing, 0);
  assert.throws(
    () => parseBoard({ ...json, assets: { ...json.assets, o1: { ...svg, data: 'data:image/png;base64,AAAA' } } }),
    /Invalid image asset/,
  );
  // .boardroom ZIP with media files under their real extensions.
  const bundle = decodeBundle(encodeBundle(board, assets));
  assert.deepEqual(bundle.missing, []);
  assert.equal(bundle.assets.o1.data, svg.data);
  assert.equal(bundle.assets.o2.data, bmp.data);
  assert.equal(decodeBundle(encodeBundle(board, { a1: png, a2: png })).missing.length, 0);
  // Library backup.
  const kv = new MemoryStore();
  let { library: lib } = openLibrary(kv, parseBoard, newBoard);
  lib = saveActive(kv, lib, board);
  const back = decodeLibrary(encodeLibrary(kv, lib, assets).bytes, parseBoard);
  assert.equal(back.assets.o1.data, svg.data);
  assert.equal(back.assets.o2.mime, 'image/bmp');
  // Copy and paste carries the original with the picture.
  const clip = copySelection(board, ['img'], assets);
  assert.deepEqual(Object.keys(clip!.assets ?? {}).sort(), ['a1', 'o1']);
});

// ---- R3-Q2 Blueprints in library backups ----------------------------------------------------------------

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
const note = (text: string): Item => ({ ...createItem('note', 0, 0), text });
const blueprint = (id: string, name: string, text = 'plan'): Blueprint => ({
  id,
  name,
  emoji: '🧭',
  created: '2026-11-01T00:00:00.000Z',
  boards: [
    { title: 'Agenda', template: 'Meeting agenda' },
    { title: 'Notes', board: { ...newBoard(), title: 'Notes', items: [note(text)] } },
  ],
});
function storedLibrary() {
  const kv = new MemoryStore();
  let { library: lib } = openLibrary(kv, parseBoard, newBoard);
  lib = saveActive(kv, lib, { ...newBoard(), title: 'Alpha', items: [note('a')] });
  return { kv, lib };
}

test('library backups carry saved blueprints and read them back validated', () => {
  const { kv, lib } = storedLibrary();
  const made = encodeLibrary(
    kv,
    lib,
    {},
    undefined,
    [],
    [blueprint('bp1', 'Offsite'), { ...blueprint('b', 'Built'), builtIn: true }],
  );
  assert.equal(made.blueprints, 1, 'built-in blueprints are not backed up');
  const back = decodeLibrary(made.bytes, parseBoard);
  assert.equal(back.blueprints.length, 1);
  assert.equal(back.blueprints[0].name, 'Offsite');
  assert.equal(back.blueprints[0].boards[1].board!.items[0].text, 'plan');
  const read = readBackup(made.bytes, parseBoard);
  assert.ok(read.kind === 'library' && read.blueprints.length === 1);
  // Backups without blueprints still read, and add none.
  const plain = decodeLibrary(encodeLibrary(kv, lib, {}).bytes, parseBoard);
  assert.deepEqual(plain.blueprints, []);
});

test('restored blueprints are validated: bad boards, media and oversize entries are dropped', () => {
  const media = { ...createItem('image', 0, 0), id: 'pic', assetId: 'asset1' };
  const list = validBlueprints(
    [
      blueprint('ok', 'Fine'),
      { id: 'bad', name: 'Bad', boards: [{ title: 'x', board: { version: 2 } }] },
      { id: 'media', name: 'Media', boards: [{ title: 'M', board: { ...newBoard(), items: [note('k'), media] } }] },
      {
        id: 'big',
        name: 'Big',
        boards: [
          { title: 'B', board: { ...newBoard(), items: Array.from({ length: 8 }, () => note('x'.repeat(4000))) } },
        ],
      },
      'junk',
      { id: 5 },
    ],
    parseBoard,
    20_000,
  );
  assert.deepEqual(
    list.map(b => b.id),
    ['ok', 'media'],
  );
  assert.deepEqual(
    list[1].boards[0].board!.items.map(i => i.text),
    ['k'],
    'media objects are left out',
  );
  assert.ok(BLUEPRINT_MAX_BYTES >= 4_000_000);
  // Stored blueprints still load as before.
  assert.equal(parseBlueprints(JSON.stringify([blueprint('s', 'Stored')]), parseBoard).length, 1);
});

test('merging restored blueprints never replaces or drops saved ones', () => {
  const saved = [blueprint('bp1', 'Offsite')];
  // Restored from a backup of this browser: the same content under the same id.
  const same = mergeBlueprints(saved, [structuredClone(saved[0])], ids);
  assert.equal(same.added, 0);
  assert.equal(same.skipped, 1, 'an identical blueprint is skipped');
  const changed = mergeBlueprints(
    saved,
    [blueprint('bp1', 'Offsite', 'changed'), blueprint('bp2', 'Sprint')],
    () => 'new',
  );
  assert.equal(changed.added, 2);
  assert.deepEqual(
    changed.list.map(b => b.id),
    ['new', 'bp2', 'bp1'],
    'a different blueprint with a taken id gets a new id',
  );
  const full = Array.from({ length: BLUEPRINT_LIMIT }, (_, k) => blueprint(`f${k}`, `F${k}`));
  const over = mergeBlueprints(full, [blueprint('x', 'Extra')], ids);
  assert.equal(over.added, 0);
  assert.equal(over.full, 1);
  assert.equal(over.list.length, BLUEPRINT_LIMIT);
  assert.deepEqual(over.list, full);
});

test('pasted and backed-up assets share one check: wrong type, bad data or oversized files are refused', async () => {
  const { isValidAsset } = await import('../src/model-ext.ts');
  const ok = { mime: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=', width: 10, height: 10, name: 'a.png' };
  assert.equal(isValidAsset(ok), true);
  assert.equal(isValidAsset({ ...ok, mime: 'text/html', data: 'data:text/html;base64,PGI+' }), false);
  assert.equal(isValidAsset({ ...ok, data: 'data:image/png;base64,<script>' }), false);
  assert.equal(isValidAsset({ ...ok, data: 'data:image/jpeg;base64,AAAA' }), false);
  assert.equal(isValidAsset({ ...ok, width: 0 }), false);
  assert.equal(isValidAsset({ ...ok, name: 'x'.repeat(201) }), false);
  assert.equal(isValidAsset(null), false);
});
