import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, endpoints } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  openLibrary,
  saveActive,
  createBoard,
  switchTo,
  renameBoard,
  duplicateBoard,
  deleteBoard,
  assetRefsAcrossBoards,
  previewOf,
  INDEX_KEY,
  LEGACY_KEY,
  boardKey,
} from '../src/board-library.ts';
import type { KeyValueStore } from '../src/board-library.ts';
import { copySelection, clipboardFormats, readClipboardHtml, pastePayload } from '../src/clipboard.ts';
import { groupSelection, expandGroups } from '../src/arrange.ts';

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
const board = (title: string, ...items: Item[]): Board => ({ ...newBoard(), title, items });

test('56 first run migrates the legacy single board into the library', () => {
  const kv = new MemoryStore(),
    legacy = board('Legacy', createItem('note', 0, 0));
  kv.setItem(LEGACY_KEY, JSON.stringify(legacy));
  const { library, board: b, error } = openLibrary(kv, parseBoard, newBoard);
  assert.equal(error, '');
  assert.equal(b.title, 'Legacy');
  assert.equal(library.boards.length, 1);
  assert.equal(library.boards[0].items, 1);
  assert.ok(kv.getItem(INDEX_KEY));
  assert.equal(kv.getItem(boardKey(library.activeId)), JSON.stringify(legacy));
});

test('56 a newer legacy copy is adopted; unparseable data is never overwritten', () => {
  const kv = new MemoryStore();
  const { library } = openLibrary(kv, parseBoard, newBoard);
  saveActive(kv, library, board('Saved'));
  kv.setItem(LEGACY_KEY, JSON.stringify(board('Written elsewhere')));
  assert.equal(openLibrary(kv, parseBoard, newBoard).board.title, 'Written elsewhere');
  const broken = new MemoryStore();
  broken.setItem(LEGACY_KEY, '{not json');
  const r = openLibrary(broken, parseBoard, newBoard);
  assert.match(r.error, /could not be loaded/);
  assert.equal(broken.getItem(LEGACY_KEY), '{not json');
  assert.equal(broken.getItem(INDEX_KEY), null);
});

test('56 create, switch, rename, duplicate and delete boards', () => {
  const kv = new MemoryStore();
  let { library } = openLibrary(kv, parseBoard, newBoard);
  library = saveActive(kv, library, board('First', createItem('note', 0, 0)));
  const first = library.activeId;
  const created = createBoard(kv, library, board('Second'));
  library = created.library;
  assert.equal(library.activeId, created.id);
  assert.equal(library.boards[0].title, 'Second');
  const back = switchTo(kv, library, first, parseBoard);
  library = back.library;
  assert.equal(back.board.title, 'First');
  assert.equal(JSON.parse(kv.getItem(LEGACY_KEY)!).title, 'First');
  library = renameBoard(kv, library, created.id, '  Renamed  ', parseBoard);
  assert.equal(library.boards.find(b => b.id === created.id)!.title, 'Renamed');
  assert.throws(() => renameBoard(kv, library, created.id, '   ', parseBoard));
  const dup = duplicateBoard(kv, library, first, parseBoard);
  library = dup.library;
  assert.equal(library.boards.length, 3);
  assert.equal(JSON.parse(kv.getItem(boardKey(dup.id))!).title, 'First copy');
  assert.equal(library.activeId, first);
  const removed = deleteBoard(kv, library, first, parseBoard, newBoard);
  library = removed.library;
  assert.equal(kv.getItem(boardKey(first)), null);
  assert.ok(removed.board);
  assert.notEqual(library.activeId, first);
  let lib = library;
  for (const b of [...lib.boards]) lib = deleteBoard(kv, lib, b.id, parseBoard, newBoard).library;
  assert.equal(lib.boards.length, 1, 'deleting the last board leaves a new blank one');
});

test('56 previews are normalised and assets are tracked across every board', () => {
  const kv = new MemoryStore();
  let { library } = openLibrary(kv, parseBoard, newBoard);
  const img = { ...createItem('image', 0, 0), assetId: 'asset-a' };
  library = saveActive(kv, library, board('With image', img, createItem('note', 1000, 500)));
  library = createBoard(kv, library, board('Other', { ...createItem('image', 0, 0), assetId: 'asset-b' })).library;
  assert.deepEqual([...assetRefsAcrossBoards(kv, library)].sort(), ['asset-a', 'asset-b']);
  const p = previewOf(board('x', createItem('note', 0, 0), createItem('frame', 500, 500)));
  assert.ok(p.every(s => s.x >= 0 && s.y >= 0 && s.x + s.w <= 1.001 && s.y + s.h <= 1.001));
  assert.deepEqual(previewOf(newBoard()), []);
});

test('58 copy and paste keeps connectors, groups, links and datasets with fresh ids', () => {
  const a = createItem('note', 0, 0),
    b = createItem('note', 400, 0),
    outside = createItem('note', 0, 600),
    line = { ...createItem('arrow', 0, 0), from: a.id, to: b.id },
    dangling = { ...createItem('arrow', 0, 0), from: a.id, to: outside.id },
    linked = { ...createItem('note', 0, 300), linkTo: b.id },
    table = { ...createItem('table', 800, 0), datasetId: 'd1' };
  let src: Board = {
    ...board('src', a, b, outside, line, dangling, linked, table),
    datasets: { d1: [{ id: 'r', title: 'Row', status: 'Not started', assignee: '', start: '', end: '' }] },
  };
  src = groupSelection(src, [a.id, b.id]).board;
  const ids = expandGroups(src, [a.id, line.id, dangling.id, linked.id, table.id]);
  const payload = copySelection(src, ids)!;
  const round = readClipboardHtml(clipboardFormats(payload).html)!;
  assert.deepEqual(round, payload);

  // Paste into another board: the end attached to an object that is not there becomes a free end
  // at the same relative place.
  const pasted = pastePayload(board('target'), round, { x: 5000, y: 5000 });
  const out = pasted.board;
  parseBoard(JSON.parse(JSON.stringify(out)));
  const newLine = out.items.find(i => i.type === 'arrow' && i.from && i.to)!;
  assert.ok(pasted.ids.includes(newLine.from!) && pasted.ids.includes(newLine.to!));
  const freeEnd = out.items.find(i => i.type === 'arrow' && i.from && !i.to)!;
  const [, end] = endpoints(freeEnd, out.items);
  const [, originalEnd] = endpoints(dangling, src.items);
  assert.ok(Math.abs(end.x - (originalEnd.x + 5000 - payload.bounds.x)) < 1);
  assert.ok(Math.abs(end.y - (originalEnd.y + 5000 - payload.bounds.y)) < 1);
  assert.equal(out.groups?.length, 1);
  assert.equal(new Set(out.items.filter(i => i.group).map(i => i.group)).size, 1);
  assert.ok(pasted.ids.includes(out.items.find(i => i.linkTo)!.linkTo!));
  assert.equal(pasted.datasets, 1);
  const pastedTable = out.items.find(i => i.type === 'table')!;
  assert.notEqual(pastedTable.datasetId, 'd1');
  assert.equal(out.datasets![pastedTable.datasetId!][0].title, 'Row');
  assert.ok(out.items.every(i => !src.items.some(s => s.id === i.id)));

  // Same-board paste: an attachment to an object that exists here is kept.
  const again = pastePayload(src, payload, { x: 40, y: 40 }).board;
  assert.ok(again.items.some(i => i.type === 'arrow' && i.to === outside.id && i.id !== dangling.id));
  assert.equal(readClipboardHtml('<p>other app</p>'), null);
  assert.equal(readClipboardHtml('<div data-boardroom-objects="!!!"></div>'), null);
  assert.equal(copySelection(src, []), null);
});
