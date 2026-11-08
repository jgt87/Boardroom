import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, colors } from '../src/model.ts';
import { addMember, removeMember, colorFor, PEOPLE_MAX } from '../src/specs-people.ts';
import type { PeopleData } from '../src/specs-people.ts';
import { isSafeLink } from '../src/specs-shortcut.ts';
import {
  makeTemplate,
  parseTemplates,
  addTemplate,
  removeTemplate,
  templatePayload,
  TEMPLATE_LIMIT,
} from '../src/user-templates.ts';
import { pastePayload } from '../src/clipboard.ts';
import { readableTextOn, contrastRatio } from '../src/board-tools.ts';
import { catalog, formatTools } from '../src/tool-catalog.ts';

const roundTrip = (items: ReturnType<typeof createItem>[]) =>
  parseBoard(JSON.parse(JSON.stringify({ ...newBoard(), items })));

test('people lists add unique members with stable colours and validate on load', () => {
  let d: PeopleData = { title: 'Team', members: [] };
  d = addMember(d, '  Sam   Lee ', 'a', 'Designer');
  d = addMember(d, 'sam lee', 'b');
  d = addMember(d, '', 'c');
  assert.equal(d.members.length, 1);
  assert.deepEqual(d.members[0], { id: 'a', name: 'Sam Lee', role: 'Designer', color: colorFor('Sam Lee') });
  assert.equal(colorFor('Sam Lee'), colorFor('Sam Lee'));
  assert.equal(removeMember(d, 'a').members.length, 0);
  let full: PeopleData = { title: 'All', members: [] };
  for (let i = 0; i < PEOPLE_MAX + 5; i++) full = addMember(full, `Person ${i}`, String(i));
  assert.equal(full.members.length, PEOPLE_MAX);

  const people = { ...createItem('people', 0, 0), data: d };
  assert.equal(roundTrip([people]).items[0].type, 'people');
  assert.throws(() =>
    roundTrip([{ ...people, data: { title: 'Team', members: [{ id: 'x', name: '<b>', color: '#000000' }] } }]),
  );
});

test('user cards need a name and a valid optional email', () => {
  const card = createItem('usercard', 0, 0);
  assert.equal(roundTrip([card]).items.length, 1);
  assert.throws(() => roundTrip([{ ...card, data: { ...card.data, name: '' } }]));
  assert.throws(() => roundTrip([{ ...card, data: { ...card.data, email: 'not an email' } }]));
  assert.equal(roundTrip([{ ...card, data: { ...card.data, email: 'sam@example.com' } }]).items.length, 1);
});

test('action shortcuts only open web links and need a label', () => {
  assert.ok(isSafeLink('https://example.com/a'));
  assert.ok(isSafeLink('mailto:sam@example.com'));
  assert.ok(!isSafeLink('javascript:alert(1)'));
  assert.ok(!isSafeLink('data:text/html,hi'));
  const s = createItem('shortcut', 0, 0);
  assert.equal(roundTrip([s]).items.length, 1);
  assert.throws(() => roundTrip([{ ...s, data: { action: 'link', target: 'javascript:alert(1)' } }]));
  assert.throws(() => roundTrip([{ ...s, data: { action: 'launch', target: '' } }]));
  assert.throws(() => roundTrip([{ ...s, text: '' }]));
});

test('board templates keep objects and connectors, skip media and insert with new ids', () => {
  const a = { ...createItem('note', 0, 0), text: 'A' },
    b = { ...createItem('note', 400, 0), text: 'B' },
    arrow = { ...createItem('arrow', 0, 0), from: a.id, to: b.id },
    image = { ...createItem('image', 0, 300), assetId: 'asset-1' };
  const board = { ...newBoard(), title: 'Retro <b>', items: [a, b, arrow, image] };
  const t = makeTemplate(board, board.title, 't1', new Date('2026-11-03T10:00:00Z'));
  assert.ok(!('error' in t));
  if ('error' in t) return;
  assert.equal(t.name, 'Retro b');
  assert.equal(t.count, 3);
  const payload = templatePayload(t)!;
  const result = pastePayload(newBoard(), payload, { x: 1000, y: 1000 });
  assert.equal(result.ids.length, 3);
  const pasted = result.board.items;
  assert.ok(pasted.every(i => ![a.id, b.id, arrow.id].includes(i.id)));
  const link = pasted.find(i => i.type === 'arrow')!;
  assert.ok(pasted.some(i => i.id === link.from) && pasted.some(i => i.id === link.to));

  assert.deepEqual(makeTemplate(newBoard(), 'Empty', 't2', new Date()), {
    error: 'Add something to the board before saving it as a template.',
  });
  let list = [t];
  for (let i = 0; i < TEMPLATE_LIMIT + 3; i++) list = addTemplate(list, { ...t, id: `x${i}` });
  assert.equal(list.length, TEMPLATE_LIMIT);
  assert.equal(removeTemplate(list, list[0]!.id).length, TEMPLATE_LIMIT - 1);
  assert.equal(parseTemplates(JSON.stringify([t, { id: 'bad' }, { ...t, id: 'broken', html: '<p>x</p>' }])).length, 1);
  assert.deepEqual(parseTemplates('nope'), []);
});

test('the sticky palette has 16 colours and text stays readable on each', () => {
  assert.equal(colors.length, 16);
  for (const c of colors) assert.ok(contrastRatio(c, readableTextOn(c)) >= 4.5, `contrast on ${c}`);
  assert.equal(readableTextOn('#1f1f23'), '#ffffff');
  assert.equal(readableTextOn('#fff49b'), '#22232b');
  assert.equal(readableTextOn(undefined), '#22232b');
});

test('account-style catalogue tools are now available', () => {
  const entries = [...formatTools, ...Object.values(catalog).flat()];
  for (const label of ['People', 'User card', 'Talktrack', 'Photobooth', 'Spellchecker', 'Action Shortcut'])
    assert.ok(
      entries.some(e => e.label === label && !e.unavailable),
      label,
    );
});

test('validation report finds loose connectors, unlabelled, isolated and overlapping shapes', async () => {
  const { validateDiagram } = await import('../src/diagram-validation.ts');
  const a = { ...createItem('rectangle', 0, 0), id: 'a', text: 'Start' },
    b = { ...createItem('rectangle', 400, 0), id: 'b', text: '' },
    c = { ...createItem('rectangle', 410, 10), id: 'c', text: 'Alone' },
    hidden = { ...createItem('rectangle', 900, 0), id: 'h', text: '', hidden: true },
    ok = { ...createItem('arrow', 0, 0), id: 'ok', from: 'a', to: 'b' },
    loose = { ...createItem('arrow', 0, 0), id: 'loose', from: 'a', to: 'gone' };
  const issues = validateDiagram({ ...newBoard(), items: [a, b, c, hidden, ok, loose] });
  const summary = issues.map(i => `${i.kind}:${i.id}`).sort();
  assert.deepEqual(summary, ['dangling:loose', 'isolated:c', 'overlap:c', 'unlabelled:b']);
  assert.deepEqual(validateDiagram({ ...newBoard(), items: [a] }), []);
});

test('stickies capture finds coloured notes in a photo and keeps their layout', async () => {
  const { detectStickies, placeNotes, nearestColor } = await import('../src/sticky-detect.ts');
  const W = 120,
    H = 80,
    data = new Uint8ClampedArray(W * H * 4).fill(235); // light grey background
  const paint = (x0: number, y0: number, w: number, h: number, rgb: number[]) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set([...rgb, 255], (y * W + x) * 4);
  };
  paint(10, 10, 25, 25, [255, 236, 110]); // yellow
  paint(60, 12, 24, 24, [255, 160, 167]); // pink
  paint(12, 50, 22, 22, [140, 227, 235]); // cyan
  paint(100, 70, 2, 2, [255, 0, 0]); // speck: ignored
  const found = detectStickies({ width: W, height: H, data }, colors);
  assert.equal(found.length, 3);
  assert.deepEqual(
    found.map(f => f.color),
    ['#ffe36e', '#ffa0a7', '#8ce3eb'],
  );
  assert.deepEqual(found[0], { x: 10, y: 10, w: 25, h: 25, color: '#ffe36e' });
  const placed = placeNotes(found, { x: 100, y: 100 });
  assert.equal(placed[0]!.x, 100);
  assert.ok(placed[1]!.x > placed[0]!.x && placed[2]!.y > placed[0]!.y);
  assert.equal(nearestColor([30, 30, 34], colors), '#1f1f23');
});

test('board settings validate background, start view and status, and clear cleanly', async () => {
  const { withSetting, DEFAULT_BACKGROUND, boardBackgrounds } = await import('../src/board-settings.ts');
  const load = (extra: object) => parseBoard(JSON.parse(JSON.stringify({ ...newBoard(), ...extra })));
  assert.equal(boardBackgrounds.length, 11);
  assert.equal(load({ background: '#18181b', status: 'review', startView: { x: 10, y: -5, z: 1.5 } }).status, 'review');
  assert.throws(() => load({ background: '#123456' }), /background/);
  assert.throws(() => load({ status: 'shipped' }), /status/);
  assert.throws(() => load({ startView: { x: 0, y: 0, z: 99 } }), /start view/);
  const b = withSetting(newBoard(), 'status', 'draft');
  assert.equal(b.status, 'draft');
  assert.ok(!('status' in withSetting(b, 'status', null)));
  assert.ok(!('background' in withSetting(newBoard(), 'background', DEFAULT_BACKGROUND)));
});

test('command matching needs every word and ranks label prefixes first', async () => {
  const { matchCommands } = await import('../src/commands.ts');
  const cmds = [
    { id: '1', label: 'Show grid', group: 'View' },
    { id: '2', label: 'Grid', group: 'Tools', keywords: 'organize table' },
    { id: '3', label: 'Timer', group: 'Facilitation' },
  ];
  assert.deepEqual(
    matchCommands(cmds, 'grid').map(c => c.id),
    ['2', '1'],
  );
  assert.deepEqual(
    matchCommands(cmds, 'view grid').map(c => c.id),
    ['1'],
  );
  assert.deepEqual(
    matchCommands(cmds, 'organize').map(c => c.id),
    ['2'],
  );
  assert.equal(matchCommands(cmds, '').length, 3);
  assert.equal(matchCommands(cmds, 'zzz').length, 0);
});

test('activity history diffs changes, merges rapid edits, restores deleted objects and summarises', async () => {
  const { diffActivity, appendActivity, restoreDeleted, catchUp, parseActivity } = await import('../src/activity.ts');
  let n = 0;
  const id = () => `e${++n}`;
  const a = { ...createItem('note', 0, 0), id: 'a', text: 'Hello' },
    b = { ...createItem('rectangle', 0, 0), id: 'b', text: '' };
  const b0 = { ...newBoard(), items: [a] },
    b1 = { ...b0, items: [{ ...a, text: 'Hello there' }, b] },
    b2 = { ...b1, items: [b1.items[1]!] };
  const t0 = '2026-11-04T10:00:00.000Z',
    t1 = '2026-11-04T10:00:30.000Z';
  const e1 = diffActivity(b0, b1, t0, id);
  assert.deepEqual(
    e1.map(e => `${e.action}:${e.itemId}`),
    ['edited:a', 'added:b'],
  );
  let log = appendActivity([], e1);
  log = appendActivity(log, diffActivity(b1, { ...b1, items: [b1.items[0]!, { ...b, x: 5 }] }, t1, id));
  log = appendActivity(log, diffActivity(b1, { ...b1, items: [b1.items[0]!, { ...b, x: 9 }] }, t1, id));
  assert.equal(log.filter(e => e.itemId === 'b' && e.action === 'edited').length, 1);
  const del = diffActivity(b1, b2, t1, id);
  assert.equal(del[0]!.action, 'deleted');
  const restored = restoreDeleted(b2, del[0]!)!;
  assert.ok(restored.items.some(i => i.id === 'a'));
  assert.equal(restoreDeleted(restored, del[0]!), null);
  const s = catchUp(appendActivity(log, del), Date.parse('2026-11-04T00:00:00Z'));
  assert.deepEqual([s.added, s.deleted, s.byType.note], [1, 1, 2]);
  assert.deepEqual(parseActivity('[{"id":1}]'), []);
  assert.equal(diffActivity(b0, b0, t0, id).length, 0);
});

test('library spaces and stars are kept on save and listed', async () => {
  const { openLibrary, saveActive, setBoardMeta, spacesOf } = await import('../src/board-library.ts');
  const store = new Map<string, string>();
  const kv = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const opened = openLibrary(kv, b => b as ReturnType<typeof newBoard>, newBoard);
  let lib = setBoardMeta(kv, opened.library, opened.library.activeId, { space: '  Design <b> team ', starred: true });
  assert.equal(lib.boards[0]!.space, 'Design b team');
  lib = saveActive(kv, lib, { ...opened.board, title: 'Renamed' });
  assert.deepEqual([lib.boards[0]!.space, lib.boards[0]!.starred], ['Design b team', true]);
  assert.deepEqual(spacesOf(lib), ['Design b team']);
  lib = setBoardMeta(kv, lib, lib.activeId, { space: null, starred: false });
  assert.ok(!('space' in lib.boards[0]!) && !('starred' in lib.boards[0]!));
});

test('the command palette finds recent boards by title or space, newest first, without the open or trashed ones (R1-Q3)', async () => {
  const { matchCommands: match, recentBoardCommands } = await import('../src/commands.ts');
  const boards = [
    { id: 'a', title: 'Roadmap', updatedAt: '2026-11-01T00:00:00Z', space: 'Product' },
    { id: 'b', title: 'Retro', updatedAt: '2026-11-07T00:00:00Z' },
    { id: 'c', title: 'Open now', updatedAt: '2026-11-08T00:00:00Z' },
    { id: 'd', title: 'Old', updatedAt: '2026-11-06T00:00:00Z', deletedAt: '2026-11-06T00:00:00Z' },
  ];
  const cmds = recentBoardCommands(boards, 'c');
  assert.deepEqual(
    cmds.map(c => c.label),
    ['Open board: Retro', 'Open board: Roadmap'],
  );
  assert.deepEqual(
    match(cmds, 'product').map(c => c.id),
    ['board:a'],
  );
  assert.equal(match(cmds, 'board retro')[0].id, 'board:b');
  assert.equal(recentBoardCommands(boards, 'c', 1).length, 1);
});
