// Board library gaps C1–C12: trash, auto-purge, library backup, import as new, status, description,
// duplicate with a name, user templates, multi-select, content search and spaces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  openLibrary,
  saveActive,
  createBoard,
  duplicateBoard,
  trashBoards,
  restoreBoards,
  purgeBoards,
  purgeTrash,
  daysLeftInTrash,
  liveBoards,
  trashedBoards,
  addBoards,
  setBoardMeta,
  spacesOf,
  createSpace,
  renameSpace,
  deleteSpace,
  boardContentText,
  searchBoardContent,
  assetRefsAcrossBoards,
  boardKey,
  INDEX_KEY,
} from '../src/board-library.ts';
import type { KeyValueStore, Library } from '../src/board-library.ts';
import { encodeLibrary, decodeLibrary, isLibraryBackup, readBackup } from '../src/library-backup.ts';
import { encodeBundle } from '../src/media-bundle.ts';
import { boardStatuses, cleanDescription, isBoardStatus, withSetting } from '../src/board-settings.ts';
import { boardFromTemplate, makeTemplate } from '../src/user-templates.ts';

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
const note = (text: string) => ({ ...createItem('note', 0, 0), text });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function threeBoards() {
  const kv = new MemoryStore();
  let { library } = openLibrary(kv, parseBoard, newBoard);
  library = saveActive(kv, library, board('Alpha', note('quarterly roadmap')));
  const a = library.activeId;
  const b = createBoard(kv, library, board('Beta', note('retro ideas')));
  const c = createBoard(kv, b.library, board('Gamma'));
  return { kv, library: c.library, a, b: b.id, c: c.id };
}

test('C1 trashing keeps board data, hides it from live boards and restores it', () => {
  const { kv, library, a, c } = threeBoards();
  const trashed = trashBoards(kv, library, [a], parseBoard, newBoard, '2026-11-01T00:00:00.000Z');
  assert.equal(trashed.board, undefined, 'trashing another board keeps the active one');
  assert.ok(kv.getItem(boardKey(a)), 'stored data is kept');
  assert.deepEqual(
    trashedBoards(trashed.library).map(b => b.id),
    [a],
  );
  assert.ok(!liveBoards(trashed.library).some(b => b.id === a));
  const restored = restoreBoards(kv, trashed.library, [a]);
  assert.ok(liveBoards(restored).some(b => b.id === a));
  assert.ok(!('deletedAt' in restored.boards.find(b => b.id === a)!));
  // Trashing the active board opens another live board.
  const active = trashBoards(kv, restored, [c], parseBoard, newBoard);
  assert.ok(active.board);
  assert.notEqual(active.library.activeId, c);
  assert.ok(!active.library.boards.find(b => b.id === active.library.activeId)!.deletedAt);
});

test('C1 trashing every board leaves one new blank board; purge removes data and entries', () => {
  const { kv, library, a, b, c } = threeBoards();
  const all = trashBoards(kv, library, [a, b, c], parseBoard, newBoard);
  assert.equal(liveBoards(all.library).length, 1);
  assert.equal(all.board?.items.length, 0);
  const purged = purgeBoards(kv, all.library, [a, all.library.activeId]);
  assert.equal(kv.getItem(boardKey(a)), null);
  assert.ok(kv.getItem(boardKey(all.library.activeId)), 'live boards are never purged');
  assert.equal(purged.boards.length, 3);
});

test('C1 media of trashed boards is protected from pruning until purge', () => {
  const kv = new MemoryStore();
  let { library } = openLibrary(kv, parseBoard, newBoard);
  library = saveActive(kv, library, board('Main'));
  const withImage = createBoard(kv, library, board('Pics', { ...createItem('image', 0, 0), assetId: 'asset-t' }));
  let lib = trashBoards(kv, withImage.library, [withImage.id], parseBoard, newBoard).library;
  assert.ok(assetRefsAcrossBoards(kv, lib).has('asset-t'));
  lib = purgeBoards(kv, lib, [withImage.id]);
  assert.ok(!assetRefsAcrossBoards(kv, lib).has('asset-t'));
});

test('C2 boards older than 30 days in the trash are purged at startup', () => {
  const { kv, library, a, b } = threeBoards();
  let lib = trashBoards(kv, library, [a], parseBoard, newBoard, '2026-09-01T00:00:00.000Z').library;
  lib = trashBoards(kv, lib, [b], parseBoard, newBoard, '2026-10-20T00:00:00.000Z').library;
  assert.equal(purgeTrash(kv, lib, 30, '2026-09-30T00:00:00.000Z'), lib, 'nothing expired yet');
  const reopened = openLibrary(kv, parseBoard, newBoard, '2026-11-04T00:00:00.000Z');
  assert.ok(!reopened.library.boards.some(x => x.id === a), 'expired board purged');
  assert.equal(kv.getItem(boardKey(a)), null);
  assert.ok(
    reopened.library.boards.some(x => x.id === b && x.deletedAt),
    'recent trash kept',
  );
  assert.equal(daysLeftInTrash('2026-10-20T00:00:00.000Z', Date.parse('2026-11-04T00:00:00.000Z')), 15);
  assert.equal(daysLeftInTrash('2026-01-01T00:00:00.000Z'), 0);
});

test('older indexes load unchanged and get status and description copied in', () => {
  const kv = new MemoryStore();
  const id = 'old-board';
  kv.setItem(boardKey(id), JSON.stringify({ ...board('Old'), status: 'review', description: 'Kept notes' }));
  kv.setItem(
    INDEX_KEY,
    JSON.stringify({
      version: 1,
      activeId: id,
      boards: [{ id, title: 'Old', createdAt: 'x', updatedAt: 'y', items: 0, preview: [] }],
    }),
  );
  const { library, board: b, error } = openLibrary(kv, parseBoard, newBoard);
  assert.equal(error, '');
  assert.equal(b.title, 'Old');
  assert.deepEqual(
    [library.boards[0].status, library.boards[0].description, library.boards[0].v],
    ['review', 'Kept notes', 2],
  );
});

test('C3 library backup round trip adds boards with new ids on conflict, keeping spaces and media', () => {
  const { kv, library, a } = threeBoards();
  let lib = setBoardMeta(kv, library, a, { space: 'Plans', starred: true });
  lib = createSpace(kv, lib, 'Empty space');
  const img = { ...createItem('image', 0, 0), assetId: 'asset-1' };
  lib = createBoard(kv, lib, board('With image', img)).library;
  lib = trashBoards(kv, lib, [a], parseBoard, newBoard).library;
  const made = encodeLibrary(kv, lib, {
    'asset-1': { mime: 'image/png', data: PNG, width: 1, height: 1, name: 'dot.png' },
    unused: { mime: 'image/png', data: PNG, width: 1, height: 1, name: 'x.png' },
  });
  assert.equal(made.boards, 4);
  assert.equal(made.media, 1);
  assert.ok(isLibraryBackup(made.bytes));
  const decoded = decodeLibrary(made.bytes, parseBoard);
  assert.equal(decoded.entries.length, 4);
  assert.equal(decoded.skipped, 0);
  assert.deepEqual(Object.keys(decoded.assets), ['asset-1']);
  assert.deepEqual(decoded.spaces, ['Empty space']);
  // Restoring into the same library: every id is taken, so all boards are added under new ids.
  const before = lib.boards.length;
  const added = addBoards(kv, lib, decoded.entries);
  assert.equal(added.library.boards.length, before + 4);
  assert.ok(added.ids.every(id => !lib.boards.some(b => b.id === id)));
  const alpha = added.library.boards.find(b => added.ids.includes(b.id) && b.title === 'Alpha')!;
  assert.deepEqual([alpha.space, alpha.starred, !!alpha.deletedAt], ['Plans', true, true]);
  assert.equal(added.library.activeId, lib.activeId, 'restoring never switches boards');
  // Into an empty library the original ids are kept.
  const fresh = new MemoryStore();
  const freshLib = openLibrary(fresh, parseBoard, newBoard).library;
  const kept = addBoards(fresh, freshLib, decoded.entries);
  assert.deepEqual(
    kept.ids,
    decoded.entries.map(e => e.id),
  );
});

test('C3 library backups reject foreign files and skip unreadable boards', () => {
  const { kv, library } = threeBoards();
  const broken = new MemoryStore();
  for (const [k, v] of kv.map) broken.setItem(k, v);
  broken.setItem(boardKey(library.boards[1].id), '{"version":1,"title":"bad","items":"nope"}');
  const decoded = decodeLibrary(encodeLibrary(broken, library, {}).bytes, parseBoard);
  assert.equal(decoded.entries.length, 2);
  assert.equal(decoded.skipped, 1);
  assert.throws(() => decodeLibrary(new Uint8Array([1, 2, 3]), parseBoard), /damaged|ZIP/);
});

test('C4 readBackup reads JSON boards, single-board bundles and library backups', () => {
  const img = { ...createItem('image', 0, 0), assetId: 'asset-j' };
  const asset = { mime: 'image/png', data: PNG, width: 1, height: 1, name: 'a.png' };
  const json = new TextEncoder().encode(JSON.stringify({ ...board('Json', img), assets: { 'asset-j': asset } }));
  const fromJson = readBackup(json, parseBoard);
  assert.equal(fromJson.kind, 'board');
  if (fromJson.kind === 'board') {
    assert.equal(fromJson.board.title, 'Json');
    assert.equal(fromJson.board.assets, undefined);
    assert.deepEqual(Object.keys(fromJson.assets), ['asset-j']);
  }
  const bundle = readBackup(encodeBundle(board('Bundle', img), { 'asset-j': asset }), parseBoard);
  assert.equal(bundle.kind, 'board');
  assert.equal(isLibraryBackup(encodeBundle(board('Bundle'), {})), false);
  const { kv, library } = threeBoards();
  assert.equal(readBackup(encodeLibrary(kv, library, {}).bytes, parseBoard).kind, 'library');
  assert.throws(() => readBackup(new TextEncoder().encode('not json'), parseBoard), /not a Boardroom backup/);
  // Import as new: the board is added next to the others and the current one is untouched.
  const added = addBoards(kv, library, [{ board: board('Imported') }]);
  assert.equal(added.library.boards.length, library.boards.length + 1);
  assert.equal(added.library.activeId, library.activeId);
});

test('C5/C6 status is copied to the index; Done and Outdated are valid statuses', () => {
  assert.ok(isBoardStatus('done') && isBoardStatus('outdated'));
  assert.ok(boardStatuses.some(s => s.label === 'Outdated'));
  assert.doesNotThrow(() => parseBoard({ ...board('S'), status: 'done' }));
  const kv = new MemoryStore();
  let { library } = openLibrary(kv, parseBoard, newBoard);
  library = saveActive(kv, library, withSetting(board('S'), 'status', 'outdated'));
  assert.equal(library.boards[0].status, 'outdated');
  library = saveActive(kv, library, board('S'));
  assert.ok(!('status' in library.boards[0]));
});

test('C7 descriptions are validated, cleaned, stored on the index and searchable', () => {
  assert.equal(cleanDescription('  Plan\u0007 for Q4\nnext  '), 'Plan for Q4\nnext');
  assert.equal(cleanDescription('x'.repeat(2000)).length, 1000);
  assert.throws(() => parseBoard({ ...board('D'), description: 5 }), /description/);
  assert.throws(() => parseBoard({ ...board('D'), description: 'x'.repeat(1001) }), /description/);
  const b = withSetting(board('D'), 'description', 'Planning space');
  assert.equal(parseBoard(b).description, 'Planning space');
  assert.ok(!('description' in withSetting(b, 'description', null)));
  assert.ok(!('description' in withSetting(b, 'description', '')));
  const kv = new MemoryStore();
  const lib = saveActive(kv, openLibrary(kv, parseBoard, newBoard).library, b);
  assert.equal(lib.boards[0].description, 'Planning space');
  assert.match(boardContentText(b), /planning space/);
});

test('C8 duplicate takes a name and keeps the space', () => {
  const { kv, library, a } = threeBoards();
  const lib = setBoardMeta(kv, library, a, { space: 'Plans' });
  const named = duplicateBoard(kv, lib, a, parseBoard, undefined, '  Alpha v2 ');
  const copy = named.library.boards.find(b => b.id === named.id)!;
  assert.deepEqual([copy.title, copy.space], ['Alpha v2', 'Plans']);
  const unnamed = duplicateBoard(kv, lib, a, parseBoard, undefined, '   ');
  assert.equal(unnamed.library.boards.find(b => b.id === unnamed.id)!.title, 'Alpha copy');
});

test('C9 a saved template becomes a new board with fresh ids', () => {
  const source = board('Retro', note('Went well'), note('To improve'));
  const t = makeTemplate(source, 'Retro kit', 't1', new Date());
  assert.ok(!('error' in t));
  if ('error' in t) return;
  const made = boardFromTemplate(t, newBoard())!;
  assert.equal(made.title, 'Retro kit');
  assert.equal(made.items.length, 2);
  assert.ok(made.items.every(i => !source.items.some(s => s.id === i.id)));
  assert.doesNotThrow(() => parseBoard(made));
  assert.equal(boardFromTemplate({ ...t, html: '<p>nope</p>' }, newBoard()), null);
});

test('C10 several boards are moved to a space or to the trash at once', () => {
  const { kv, library, a, b, c } = threeBoards();
  const moved = setBoardMeta(kv, library, [a, b], { space: 'Team' });
  assert.deepEqual(
    moved.boards
      .filter(x => x.space === 'Team')
      .map(x => x.id)
      .sort(),
    [a, b].sort(),
  );
  const trashed = trashBoards(kv, moved, [a, b], parseBoard, newBoard).library;
  assert.deepEqual(
    liveBoards(trashed).map(x => x.id),
    [c],
  );
  assert.deepEqual(spacesOf(trashed), [], 'spaces used only by trashed boards are hidden');
});

test('C11 content search matches note text with an excerpt and caches by version', () => {
  const { kv, library, a, b } = threeBoards();
  const cache = new Map();
  const hits = searchBoardContent(kv, library, 'ROADMAP', cache);
  assert.deepEqual([...hits.keys()], [a]);
  assert.match(hits.get(a)!, /quarterly roadmap/);
  assert.equal(searchBoardContent(kv, library, '  ', cache).size, 0);
  // A cached entry is reused while the board's updatedAt is unchanged.
  kv.setItem(boardKey(b), JSON.stringify(board('Beta', note('roadmap too'))));
  assert.ok(!searchBoardContent(kv, library, 'roadmap', cache).has(b));
  const touched: Library = {
    ...library,
    boards: library.boards.map(x => (x.id === b ? { ...x, updatedAt: 'later' } : x)),
  };
  assert.ok(searchBoardContent(kv, touched, 'roadmap', cache).has(b));
  // Trashed boards are not searched; widget data and HTML text are.
  const trashed = trashBoards(kv, library, [a], parseBoard, newBoard).library;
  assert.ok(!searchBoardContent(kv, trashed, 'roadmap').has(a));
  const card = { ...createItem('note', 0, 0), text: '<b>Bold</b> idea', data: { title: 'Card title' } } as Item;
  assert.match(boardContentText(board('x', card)), /bold idea[\s\S]*card title/);
});

test('C12 spaces are created, renamed and deleted (boards go to No space)', () => {
  const { kv, library, a, b } = threeBoards();
  let lib = createSpace(kv, library, ' Design ');
  assert.deepEqual(spacesOf(lib), ['Design']);
  assert.throws(() => createSpace(kv, lib, 'design'), /already exists/);
  assert.throws(() => createSpace(kv, lib, '  '), /name/);
  lib = setBoardMeta(kv, lib, [a, b], { space: 'Design' });
  lib = renameSpace(kv, lib, 'Design', 'Product');
  assert.deepEqual(spacesOf(lib), ['Product']);
  assert.equal(lib.boards.filter(x => x.space === 'Product').length, 2);
  lib = deleteSpace(kv, lib, 'Product');
  assert.deepEqual(spacesOf(lib), []);
  assert.ok(lib.boards.every(x => !x.space));
  assert.ok(!('spaces' in lib));
  assert.deepEqual(JSON.parse(kv.getItem(INDEX_KEY)!).boards.length, 3);
});
