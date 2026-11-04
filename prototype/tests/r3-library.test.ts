// Track R3: templates (description, rename, preview, export/import, backup), starter templates, object times,
// content search with locations and comments, space details, blueprints, cross-board views and the brand kit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  openLibrary,
  saveActive,
  createBoard,
  createSpace,
  renameSpace,
  deleteSpace,
  setSpaceInfo,
  spaceInfoOf,
  setBoardMeta,
  searchBoardMatches,
  searchBoardContent,
  boardContentText,
  cleanPreview,
  trashBoards,
  INDEX_KEY,
} from '../src/board-library.ts';
import type { KeyValueStore, Library } from '../src/board-library.ts';
import { encodeLibrary, decodeLibrary } from '../src/library-backup.ts';
import {
  boardFromTemplate,
  editTemplate,
  exportTemplates,
  makeTemplate,
  mergeTemplates,
  parseTemplates,
  readTemplatesFile,
  templatePreview,
  TEMPLATE_LIMIT,
  type UserTemplate,
} from '../src/user-templates.ts';
import { filterTemplates, starterNames } from '../src/starter-templates.ts';
import { templateItems, templateNames } from '../src/board-tools.ts';
import { stampTimes, timeLabel, validItemTimes } from '../src/item-times.ts';
import { activityKey, appendActivity, diffActivity, lastVisit, recordVisit } from '../src/activity.ts';
import { activityDigest, byLastOpened, commentsAcrossBoards } from '../src/library-insights.ts';
import {
  blueprintBoards,
  blueprintFromSpace,
  builtInBlueprints,
  createFromBlueprint,
  freeSpaceName,
  parseBlueprints,
  addBlueprint,
  removeBlueprint,
  type Blueprint,
} from '../src/blueprints.ts';
import {
  addBrandColor,
  brandFirst,
  cleanBrandKit,
  fontsBrandFirst,
  parseBrandKit,
  removeBrandColor,
  type BrandKit,
} from '../src/brand-kit.ts';

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
const note = (text: string, id?: string) => ({ ...createItem('note', 0, 0), text, ...(id ? { id } : {}) });
const make = (t: Item['type'], x: number, y: number, f?: string) => createItem(t, x, y, f);

function library() {
  const kv = new MemoryStore();
  let { library: lib } = openLibrary(kv, parseBoard, newBoard);
  lib = saveActive(kv, lib, board('Alpha', note('quarterly roadmap', 'n1')));
  const a = lib.activeId;
  const b = createBoard(kv, lib, board('Beta', note('retro ideas')));
  return { kv, lib: b.library, a, b: b.id };
}

// ---- Templates ---------------------------------------------------------------------------------------

test('saved templates get a preview; older templates without one get it computed', () => {
  const made = makeTemplate(board('Kickoff', note('a'), { ...note('b'), x: 400 }), 'Kickoff', 't1', new Date());
  assert.ok(!('error' in made));
  const t = made as UserTemplate;
  assert.ok(t.preview && t.preview.length === 2);
  const legacy = { ...t };
  delete legacy.preview;
  const [parsed] = parseTemplates(JSON.stringify([legacy]));
  assert.equal(parsed.preview, undefined);
  assert.equal(templatePreview(parsed).length, 2);
});

test('rename and describe templates; invalid optional fields are dropped, not the template', () => {
  const t = makeTemplate(board('X', note('a')), 'Plan', 't1', new Date()) as UserTemplate;
  let list = editTemplate([t], 't1', { name: '  Weekly  <b>sync</b> ', description: 'For Mondays' });
  assert.equal(list[0].name, 'Weekly bsync/b');
  assert.equal(list[0].description, 'For Mondays');
  list = editTemplate(list, 't1', { name: '   ', description: '' });
  assert.equal(list[0].name, 'Weekly bsync/b', 'an empty name keeps the old one');
  assert.equal(list[0].description, undefined);
  const odd = {
    ...t,
    description: 42,
    preview: [{ x: 'no' }, { x: 0, y: 0, w: 1, h: 1, fill: '#ffffff', kind: 'note' }],
  };
  const [parsed] = parseTemplates(JSON.stringify([odd]));
  assert.equal(parsed.description, undefined);
  assert.equal(parsed.preview?.length, 1);
  assert.equal(cleanPreview('nope'), undefined);
});

test('templates export to a file and import back without duplicates; id clashes get new ids', () => {
  const a = makeTemplate(board('A', note('a')), 'A', 'ta', new Date()) as UserTemplate;
  const b = makeTemplate(board('B', note('b')), 'B', 'tb', new Date()) as UserTemplate;
  const file = exportTemplates([a, b]);
  const read = readTemplatesFile(file);
  assert.equal(read.templates.length, 2);
  assert.equal(read.skipped, 0);
  let n = 0;
  const same = mergeTemplates([a, b], read.templates, () => `new${++n}`);
  assert.equal(same.added, 0);
  assert.equal(same.skipped, 2);
  const clash = mergeTemplates([{ ...a, html: b.html }], [a], () => `new${++n}`);
  assert.equal(clash.added, 1);
  assert.notEqual(clash.list[0].id, 'ta');
  assert.throws(() => readTemplatesFile('{"format":"other"}'), /not a Boardroom templates file/);
  assert.throws(() => readTemplatesFile('not json'), /not a Boardroom templates file/);
  const many = Array.from({ length: TEMPLATE_LIMIT }, (_, k) => ({ ...a, id: `m${k}`, html: a.html + ' '.repeat(k) }));
  const full = mergeTemplates(many, [b], () => 'x');
  assert.equal(full.list.length, TEMPLATE_LIMIT);
  assert.equal(full.dropped, 1);
  assert.equal(full.list[0].id, 'tb');
});

test('the library backup carries saved templates and space details', () => {
  const { kv, lib: start } = library();
  let lib = setSpaceInfo(kv, start, 'Team', { emoji: '🚀', description: 'Our team space' });
  lib = setBoardMeta(kv, lib, lib.activeId, { space: 'Team' });
  const t = makeTemplate(board('A', note('a')), 'Agenda', 'ta', new Date()) as UserTemplate;
  const made = encodeLibrary(kv, lib, {}, undefined, [t]);
  assert.equal(made.templates, 1);
  const back = decodeLibrary(made.bytes, parseBoard);
  assert.equal(back.templates.length, 1);
  assert.equal(back.templates[0].name, 'Agenda');
  assert.deepEqual(back.spaceInfo, { Team: { emoji: '🚀', description: 'Our team space' } });
  // Backups without the new fields still read.
  const plain = decodeLibrary(encodeLibrary(kv, { ...lib, spaceInfo: undefined }, {}).bytes, parseBoard);
  assert.deepEqual(plain.templates, []);
  assert.deepEqual(plain.spaceInfo, {});
});

test('new starter templates build valid boards and are searchable', () => {
  for (const name of ['RICE scoring', 'PI planning', 'Meeting agenda', 'Icebreaker', 'Brainwriting', 'User story map'])
    assert.ok((starterNames as string[]).includes(name), name);
  for (const name of templateNames) {
    const items = templateItems(name, { x: 0, y: 0 }, make);
    parseBoard(JSON.parse(JSON.stringify(board(name, ...items))));
  }
  assert.deepEqual(
    filterTemplates('', 'Meetings').map(t => t.name),
    ['Meeting agenda', 'Icebreaker'],
  );
  assert.deepEqual(
    filterTemplates('prioritise').map(t => t.name),
    ['RICE scoring'],
  );
  const fresh = boardFromTemplate(
    makeTemplate(board('A', note('a')), 'A', 'x', new Date()) as UserTemplate,
    newBoard(),
  );
  assert.equal(fresh?.items.length, 1);
});

// ---- Object times --------------------------------------------------------------------------------------

test('object times: new objects get both times, edits update the modified time, the rest keep identity', () => {
  const a = note('a', 'a'),
    b = note('b', 'b');
  const prev = board('T', a, b);
  const added = stampTimes(prev, { ...prev, items: [a, b, note('c', 'c')] }, '2026-01-01T10:00:00.000Z');
  assert.equal(added.items[0], a, 'untouched objects keep their identity');
  assert.equal(added.items[2].createdAt, '2026-01-01T10:00:00.000Z');
  assert.equal(added.items[2].modifiedAt, '2026-01-01T10:00:00.000Z');
  const edited = stampTimes(
    added,
    { ...added, items: added.items.map(i => (i.id === 'c' ? { ...i, text: 'changed' } : i)) },
    '2026-01-02T10:00:00.000Z',
  );
  assert.equal(edited.items[2].createdAt, '2026-01-01T10:00:00.000Z');
  assert.equal(edited.items[2].modifiedAt, '2026-01-02T10:00:00.000Z');
  // A copy with the same fields is not an edit; no change returns the same board.
  const copy = { ...edited, items: edited.items.map(i => ({ ...i })) };
  assert.equal(stampTimes(edited, copy, 'x'), copy);
  assert.equal(stampTimes(edited, edited, 'x'), edited);
  // Pasted copies (new ids) are new objects even when they carry times.
  const pasted = stampTimes(
    edited,
    { ...edited, items: [...edited.items, { ...edited.items[2], id: 'd' }] },
    '2026-03-01T00:00:00.000Z',
  );
  assert.equal(pasted.items[3].createdAt, '2026-03-01T00:00:00.000Z');
  // The times validate and boards with or without them load.
  parseBoard(JSON.parse(JSON.stringify(pasted)));
  assert.throws(() => parseBoard({ ...prev, items: [{ ...a, createdAt: 'yesterday' }] }), /Invalid object times/);
  assert.ok(validItemTimes({}));
  assert.equal(timeLabel(undefined), 'Unknown');
  assert.notEqual(timeLabel('2026-01-01T10:00:00.000Z'), 'Unknown');
});

test('object times stay cheap at 2,000 objects', () => {
  const items = Array.from({ length: 2000 }, (_, k) => note(`n${k}`, `i${k}`));
  const prev = board('Big', ...items);
  const next = { ...prev, items: items.map((i, k) => (k === 5 ? { ...i, x: 10 } : i)) };
  const start = performance.now();
  for (let r = 0; r < 20; r++) stampTimes(prev, next, '2026-01-01T00:00:00.000Z');
  assert.ok((performance.now() - start) / 20 < 15, 'one stamp pass stays well under a frame');
});

// ---- Search ----------------------------------------------------------------------------------------------

test('content search reports the object or comment thread of the match and covers comments', () => {
  const kv = new MemoryStore();
  let { library: lib } = openLibrary(kv, parseBoard, newBoard);
  const withComment: Board = {
    ...board('Alpha', note('quarterly roadmap', 'n1')),
    comments: [
      {
        id: 'th1',
        itemId: 'n1',
        x: 0,
        y: 0,
        messages: [{ id: 'm', text: 'Please check the budget', at: '2026-01-01T00:00:00.000Z' }],
      },
    ],
  };
  lib = saveActive(kv, lib, withComment);
  const id = lib.activeId;
  const cache = new Map();
  assert.deepEqual(searchBoardMatches(kv, lib, 'roadmap', cache).get(id)?.itemId, 'n1');
  const hit = searchBoardMatches(kv, lib, 'BUDGET', cache).get(id);
  assert.equal(hit?.threadId, 'th1');
  assert.equal(hit?.itemId, 'n1');
  assert.match(hit!.excerpt, /budget/);
  assert.equal(searchBoardMatches(kv, lib, 'alpha', cache).get(id)?.itemId, undefined, 'title matches have no object');
  assert.match(searchBoardContent(kv, lib, 'budget').get(id)!, /check the budget/);
  assert.match(boardContentText(withComment), /quarterly roadmap[\s\S]*budget/);
});

// ---- Spaces and blueprints ------------------------------------------------------------------------------

test('space emoji and description: set, cleaned, moved on rename, removed on delete; old indexes load', () => {
  const { kv, lib: start } = library();
  let lib = createSpace(kv, start, 'Team');
  lib = setSpaceInfo(kv, lib, 'Team', { emoji: ' 🚀 ', description: 'Plans <b>and</b> notes' });
  assert.deepEqual(spaceInfoOf(lib, 'Team'), { emoji: '🚀', description: 'Plans band/b notes' });
  lib = setSpaceInfo(kv, lib, 'Team', { emoji: '<script>' });
  assert.deepEqual(spaceInfoOf(lib, 'Team'), { description: 'Plans band/b notes' });
  lib = setSpaceInfo(kv, lib, 'Brand new', { emoji: '✨' });
  assert.ok(lib.spaces?.includes('Brand new'), 'details on an unknown space create it');
  lib = renameSpace(kv, lib, 'Team', 'Crew');
  assert.deepEqual(spaceInfoOf(lib, 'Crew'), { description: 'Plans band/b notes' });
  assert.deepEqual(spaceInfoOf(lib, 'Team'), {});
  lib = deleteSpace(kv, lib, 'Crew');
  assert.deepEqual(spaceInfoOf(lib, 'Crew'), {});
  const stored = JSON.parse(kv.getItem(INDEX_KEY)!) as Library;
  assert.deepEqual(Object.keys(stored.spaceInfo ?? {}), ['Brand new']);
  // Garbage in the index is ignored rather than trusted.
  assert.deepEqual(spaceInfoOf({ ...lib, spaceInfo: { X: { emoji: 5 as unknown as string } } }, 'X'), {});
  // An index without the field reopens unchanged.
  const legacy = { ...stored };
  delete legacy.spaceInfo;
  kv.setItem(INDEX_KEY, JSON.stringify(legacy));
  assert.equal(openLibrary(kv, parseBoard, newBoard).library.spaceInfo, undefined);
});

test('a blueprint creates a space with its boards; a space saves as a blueprint without media', () => {
  const { kv, lib: start } = library();
  const sprint = builtInBlueprints[0];
  const made = createFromBlueprint(kv, start, sprint);
  assert.equal(made.space, 'Sprint');
  assert.equal(made.ids.length, sprint.boards.length);
  assert.deepEqual(spaceInfoOf(made.library, 'Sprint').emoji, sprint.emoji);
  const inSpace = made.library.boards.filter(b => b.space === 'Sprint');
  assert.equal(inSpace.length, 3);
  assert.ok(
    inSpace.every(b => b.items > 0),
    'template boards have content',
  );
  assert.equal(made.library.activeId, start.activeId, 'the open board stays open');
  assert.equal(freeSpaceName(made.library, 'sprint'), 'sprint 2');
  const again = createFromBlueprint(kv, made.library, sprint);
  assert.equal(again.space, 'Sprint 2');

  // Save a space (with a media object and a connector to it) as a blueprint.
  const media = { ...createItem('image', 0, 0), id: 'img', assetId: 'asset1' };
  const keep = note('keep', 'k');
  const arrow = { ...createItem('arrow', 0, 0), id: 'ar', from: 'k', to: 'img' };
  const c = createBoard(kv, again.library, board('With media', keep, media, arrow));
  const filed = setBoardMeta(kv, c.library, c.id, { space: 'Sprint' });
  const bp = blueprintFromSpace(kv, filed, 'Sprint', parseBoard, 'bp1', new Date(), { emoji: '🏃' }) as Blueprint;
  assert.ok(!('error' in bp));
  assert.equal(bp.boards.length, 4);
  const withMedia = bp.boards.find(b => b.title === 'With media')!;
  assert.deepEqual(
    withMedia.board!.items.map(i => i.id),
    ['k'],
  );
  assert.ok('error' in blueprintFromSpace(kv, filed, 'Nowhere', parseBoard, 'x'));
  // Stored blueprints round-trip; bad boards are dropped.
  const stored = JSON.stringify([bp, { id: 'bad', name: 'Bad', boards: [{ title: 'x', board: { version: 2 } }] }]);
  const parsed = parseBlueprints(stored, parseBoard);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].boards.length, 4);
  assert.equal(blueprintBoards(parsed[0]).length, 4);
  assert.deepEqual(parseBlueprints('garbage', parseBoard), []);
  assert.equal(removeBlueprint(addBlueprint([], bp), 'bp1').length, 0);
});

// ---- Cross-board views -----------------------------------------------------------------------------------

test('activity digest and comments across boards; last-opened order', () => {
  const { kv, lib, a, b } = library();
  const now = Date.parse('2026-06-10T12:00:00.000Z');
  const log = (boardId: string, prev: Board, next: Board, at: string) =>
    kv.setItem(
      activityKey(boardId),
      JSON.stringify(
        appendActivity(
          [],
          diffActivity(prev, next, at, () => Math.random().toString(36)),
        ),
      ),
    );
  log(a, board('A'), board('A', note('x', 'x'), note('y', 'y')), '2026-06-10T10:00:00.000Z');
  log(b, board('B'), board('B', note('z', 'z')), '2026-05-01T10:00:00.000Z');
  const digest = activityDigest(kv, lib.boards, now - 7 * 864e5);
  assert.equal(digest.boards.length, 1);
  assert.equal(digest.boards[0].id, a);
  assert.equal(digest.added, 2);
  assert.equal(activityDigest(kv, lib.boards, now - 60 * 864e5).boards.length, 2);

  const commented: Board = {
    ...board('Beta', note('n', 'n')),
    comments: [
      {
        id: 't1',
        itemId: 'n',
        x: 0,
        y: 0,
        messages: [{ id: 'm1', text: 'Open question', at: '2026-06-01T00:00:00.000Z' }],
      },
      { id: 't2', x: 0, y: 0, resolved: true, messages: [{ id: 'm2', text: 'Done', at: '2026-06-02T00:00:00.000Z' }] },
    ],
  };
  kv.setItem(`boardroom.board.${b}`, JSON.stringify(commented));
  const open = commentsAcrossBoards(kv, lib.boards);
  assert.deepEqual(
    open.map(c => [c.threadId, c.itemId, c.boardTitle]),
    [['t1', 'n', 'Beta']],
  );
  assert.equal(commentsAcrossBoards(kv, lib.boards, 'resolved')[0].threadId, 't2');
  assert.equal(commentsAcrossBoards(kv, lib.boards, 'all').length, 2);

  recordVisit(kv, b, new Date('2026-06-01T00:00:00.000Z'));
  recordVisit(kv, a, new Date('2026-06-05T00:00:00.000Z'));
  assert.equal(lastVisit(kv, a), '2026-06-05T00:00:00.000Z');
  assert.deepEqual(
    byLastOpened(kv, lib.boards).map(m => m.id),
    [a, b],
  );
  const trashed = trashBoards(kv, lib, [b], parseBoard, newBoard).library;
  assert.equal(trashed.boards.find(m => m.id === b)?.deletedAt !== undefined, true);
});

// ---- Brand kit -------------------------------------------------------------------------------------------

test('brand kit: cleaned palette and font, shown first', () => {
  const kit = cleanBrandKit({ colors: ['#FF0000', '#ff0000', 'red', '#00ff00'], font: 'Georgia' });
  assert.deepEqual(kit, { colors: ['#ff0000', '#00ff00'], font: 'Georgia' });
  assert.deepEqual(cleanBrandKit({ font: 'Comic Sans' }), { colors: [] });
  assert.deepEqual(parseBrandKit('nope'), { colors: [] });
  assert.deepEqual(brandFirst(kit, ['#00FF00', '#0000ff']), ['#ff0000', '#00ff00', '#0000ff']);
  assert.equal(fontsBrandFirst(kit)[0], 'Georgia');
  assert.equal(fontsBrandFirst({ colors: [] })[0], 'Arial');
  const more = addBrandColor(kit, '#123456');
  assert.equal(more.colors.length, 3);
  assert.deepEqual(removeBrandColor(more, '#FF0000').colors, ['#00ff00', '#123456']);
  let full: BrandKit = kit;
  for (let k = 0; k < 20; k++) full = addBrandColor(full, `#0000${(k + 16).toString(16)}`);
  assert.equal(full.colors.length, 12);
});
