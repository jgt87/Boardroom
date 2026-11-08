// Help-center gap work in the core canvas (analysis/help-center/GAP-LIST.md, groups A, D and F).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { clearContent, duplicateItems, reorderZ } from '../src/arrange.ts';
import { checkAccessibility } from '../src/board-tools.ts';
import {
  classifyPaste,
  gridFromCells,
  itemsFromText,
  linkItem,
  notesFromLines,
  parseDelimited,
} from '../src/smart-paste.ts';
import { colorName, colors, parseBoard } from '../src/model.ts';
import { parseViewPrefs } from '../src/view-prefs.ts';
import { snapToGrid } from '../src/interactions.ts';
import { dataUrlBytes, downscaleSize } from '../src/images.ts';
import { MAX_VERSIONS, listVersions, maybeSnapshot } from '../src/versions.ts';
import {
  boardSummary,
  describeItem,
  nearestInDirection,
  readingOrder,
  replaceText,
  stepInOrder,
} from '../src/navigation.ts';
import {
  allOfType,
  connectItems,
  copyStyle,
  frameAround,
  onlyType,
  pasteStyle,
  switchType,
  typesIn,
} from '../src/switch-type.ts';

const board = (...items: Item[]): Board => ({ version: 1, title: 'Gaps', items });
const notes = (ids: string) => ids.split('').map(id => ({ ...createItem('note', 0, 0), id }));
const order = (b: Board) => b.items.map(i => i.id).join('');

test('A1: contrast check uses the text colour the renderer draws', () => {
  const dark = { ...createItem('note', 0, 0), text: 'Readable', fill: '#1a1a1a' },
    grey = { ...createItem('rectangle', 0, 0), text: 'Hard to read', fill: '#7a7a7a' };
  const issues = checkAccessibility(board(dark, grey)).filter(i => i.kind === 'contrast');
  assert.deepEqual(
    issues.map(i => i.id),
    [grey.id],
  );
});

test('F6: z-order moves runs one step, or to the front and back, and skips locked objects', () => {
  const b = board(...notes('abcde'));
  const cases: [string, Parameters<typeof reorderZ>[2], string][] = [
    ['b', 'forward', 'acbde'],
    ['bc', 'forward', 'adbce'],
    ['bd', 'forward', 'acbed'],
    ['bd', 'backward', 'badce'],
    ['e', 'forward', 'abcde'],
    ['a', 'backward', 'abcde'],
    ['b', 'front', 'acdeb'],
    ['d', 'back', 'dabce'],
  ];
  for (const [sel, how, want] of cases) assert.equal(order(reorderZ(b, sel.split(''), how)), want, `${sel} ${how}`);
  const locked = board(...notes('abc').map(i => (i.id === 'a' ? { ...i, locked: true } : i)));
  assert.equal(order(reorderZ(locked, ['a'], 'front')), 'abc');
});

test('F6: duplicate accepts a directional offset', () => {
  const a = { ...createItem('note', 10, 20), id: 'a' };
  const r = duplicateItems(board(a), ['a'], { x: 300, y: 0 });
  const copy = r.board.items.find(i => i.id === r.ids[0])!;
  assert.deepEqual([copy.x, copy.y], [310, 20]);
});

test('D6: clear content empties text on unlocked notes, shapes and cards, keeping everything else', () => {
  const note = { ...createItem('note', 0, 0), text: 'Idea', tags: ['x'] },
    card = { ...createItem('card', 0, 0), text: 'Task' },
    locked = { ...createItem('note', 0, 0), text: 'Keep', locked: true },
    frame = { ...createItem('frame', 0, 0), text: 'Frame title' };
  card.data = { ...card.data, description: 'Details' };
  const r = clearContent(board(note, card, locked, frame), [note.id, card.id, locked.id, frame.id]);
  assert.equal(r.cleared, 2);
  const [n, c, l, f] = r.board.items;
  assert.deepEqual([n.text, n.tags], ['', ['x']]);
  assert.deepEqual([c.text, c.data!.description, c.data!.status], ['', '', 'Not started']);
  assert.equal(l.text, 'Keep');
  assert.equal(f.text, 'Frame title');
  assert.equal(clearContent(r.board, [note.id]).cleared, 0);
});

test('B1: delimited parser handles quotes, embedded newlines, CRLF, BOM and delimiter detection', () => {
  assert.deepEqual(parseDelimited('\uFEFFa,"b, c","say ""hi"""\r\n1,"two\nlines",3\r\n\r\n'), [
    ['a', 'b, c', 'say "hi"'],
    ['1', 'two\nlines', '3'],
  ]);
  assert.deepEqual(parseDelimited('x\ty\n1\t2'), [
    ['x', 'y'],
    ['1', '2'],
  ]);
  assert.deepEqual(parseDelimited('a;b;c\n1;2;3'), [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
});

test('B2/B6/B7/B8: plain-text paste is classified and turned into valid objects', () => {
  assert.equal(classifyPaste('https://example.com/page'), 'url');
  assert.equal(classifyPaste('www.example.com'), 'url');
  assert.equal(classifyPaste('a\tb\n1\t2'), 'cells');
  assert.equal(classifyPaste('flowchart LR\n A --> B'), 'mermaid');
  assert.equal(classifyPaste('one\ntwo\n\nthree'), 'lines');
  assert.equal(classifyPaste('just a sentence'), 'text');
  assert.equal(classifyPaste('   '), null);
  const at = { x: 0, y: 0 };
  const all = [
    ...itemsFromText('a\tb\n1\t2', at)!.items,
    ...itemsFromText('https://www.youtube.com/watch?v=dQw4w9WgXcQ', at)!.items,
    ...itemsFromText('https://example.com/docs', at)!.items,
    ...itemsFromText('graph TD\n A-->B', at)!.items,
    ...itemsFromText('- first\n- second\n3. third', at)!.items,
    ...itemsFromText('hello', at)!.items,
  ];
  assert.deepEqual(
    all.map(i => i.type),
    ['grid', 'embed', 'bookmark', 'mermaid', 'note', 'note', 'note', 'note'],
  );
  // A single line becomes one sticky note too (decision Q3).
  assert.deepEqual(
    all.filter(i => i.type === 'note').map(i => i.text),
    ['first', 'second', 'third', 'hello'],
  );
  assert.equal(all[2].data!.title, 'example.com');
  parseBoard({ version: 1, title: 'Paste', items: all });
});

test('B2/B6: paste limits are enforced and reported', () => {
  // Grids hold up to 100 rows or columns and 2,500 cells (track J): every column that fits, then rows.
  const big = Array.from({ length: 120 }, (_, r) => Array.from({ length: 60 }, (_, c) => `${r}:${c}`));
  const g = gridFromCells(big, { x: 0, y: 0 });
  assert.equal(g.truncated, true);
  assert.deepEqual([g.item.data!.rows, g.item.data!.cols], [41, 60]);
  const n = notesFromLines(Array.from({ length: 150 }, (_, i) => `line ${i}`).join('\n'), { x: 0, y: 0 });
  assert.deepEqual([n.items.length, n.truncated], [100, true]);
  assert.throws(() => linkItem('javascript:alert(1)', { x: 0, y: 0 }));
  // A script address is never a link: it arrives as plain words on a sticky note.
  const unsafe = itemsFromText('javascript:alert(1)', { x: 0, y: 0 })!.items[0];
  assert.deepEqual([unsafe.type, unsafe.link, unsafe.data?.url], ['note', undefined, undefined]);
});

test('D3: switch type converts notes, text, shapes and cards both ways, keeping ids and text', () => {
  const note = { ...createItem('note', 0, 0), text: 'Idea', tags: ['t'] },
    text = { ...createItem('text', 0, 0), text: 'Label' },
    shape = { ...createItem('ellipse', 0, 0), text: 'Oval', fill: '#ffd02f' },
    locked = { ...createItem('note', 0, 0), locked: true },
    frame = createItem('frame', 0, 0);
  const all = [note.id, text.id, shape.id, locked.id, frame.id];
  const toShape = switchType(board(note, text, shape, locked, frame), all, 'rectangle');
  assert.equal(toShape.switched, 3);
  assert.deepEqual(
    toShape.board.items.map(i => i.type),
    ['rectangle', 'rectangle', 'rectangle', 'note', 'frame'],
  );
  assert.equal(toShape.board.items[1].fill, '#ffffff', 'text becomes a white shape');
  assert.deepEqual(toShape.board.items[0].tags, ['t']);
  const toNote = switchType(toShape.board, all, 'note').board;
  assert.equal(toNote.items[2].fill, '#ffd02f', 'coloured shapes keep their colour as notes');
  const toText = switchType(toNote, [note.id], 'text').board;
  assert.equal(toText.items[0].text, 'Idea');
  const card = switchType(toText, [note.id], 'card').board;
  const back = switchType(card, [note.id], 'note').board;
  assert.equal(back.items[0].data, undefined);
  for (const b of [toShape.board, toNote, toText, card, back]) parseBoard(JSON.parse(JSON.stringify(b)));
});

test('D7: paste style copies colour, text format, borders and line style to compatible objects only', () => {
  const src = { ...createItem('rectangle', 0, 0), fill: '#e5484d', format: { bold: true }, style: { borderWidth: 4 } };
  const shape = createItem('ellipse', 0, 0),
    note = createItem('note', 0, 0),
    text = createItem('text', 0, 0),
    image = createItem('image', 0, 0),
    locked = { ...createItem('rectangle', 0, 0), locked: true };
  const r = pasteStyle(
    board(shape, note, text, image, locked),
    [shape.id, note.id, text.id, image.id, locked.id],
    copyStyle(src as Item),
  );
  const [s, n, t, i, l] = r.board.items;
  assert.equal(r.styled, 3);
  assert.deepEqual([s.fill, s.format, s.style], ['#e5484d', { bold: true }, { borderWidth: 4 }]);
  assert.deepEqual([n.fill, n.style], ['#e5484d', undefined]);
  assert.deepEqual([t.fill, t.format], [text.fill, { bold: true }], 'text keeps its text colour');
  assert.equal(i, image);
  assert.equal(l, locked);
});

test('D10/D5: frame around a selection, and select only or all of a type', () => {
  const a = { ...createItem('note', 0, 0), id: 'a' },
    b = { ...createItem('note', 400, 300), id: 'b' },
    c = { ...createItem('rectangle', 900, 0), id: 'c' };
  const made = frameAround(board(a, b, c), ['a', 'b'])!;
  assert.equal(made.board.items[0].type, 'frame');
  const f = made.frame;
  assert.ok(f.x < a.x && f.y < a.y && f.x + f.w > b.x + b.w && f.y + f.h > b.y + b.h);
  parseBoard(made.board);
  const bb = board(a, b, c);
  assert.deepEqual(typesIn(bb, ['a', 'b', 'c']), [
    { type: 'note', count: 2 },
    { type: 'rectangle', count: 1 },
  ]);
  assert.deepEqual(onlyType(bb, ['a', 'b', 'c'], 'rectangle'), ['c']);
  assert.deepEqual(allOfType(bb, 'note'), ['a', 'b']);
});

test('D4: replace swaps exact matches (case rules, special characters), skipping locked objects', () => {
  const a = { ...createItem('note', 0, 0), text: 'Plan Q1. plan (draft)' },
    b = { ...createItem('note', 0, 0), text: 'plan', locked: true },
    m = { ...createItem('mindmap', 0, 0), nodes: [{ id: 'n', parent: null, text: 'Plan root' }] };
  let r = replaceText(board(a, b, m as Item), [a.id, b.id, m.id], 'plan', 'Goal');
  assert.deepEqual([r.count, r.objects], [3, 2]);
  assert.equal(r.board.items[0].text, 'Goal Q1. Goal (draft)');
  assert.equal(r.board.items[1].text, 'plan');
  assert.equal(r.board.items[2].nodes![0].text, 'Goal root');
  r = replaceText(board(a), [a.id], 'plan', 'x', true);
  assert.equal(r.board.items[0].text, 'Plan Q1. x (draft)');
  r = replaceText(board(a), [a.id], '(draft)', '[final $&]');
  assert.equal(r.board.items[0].text, 'Plan Q1. plan [final $&]', 'replacement text is literal');
  assert.equal(replaceText(board(a), [a.id], '', 'x').count, 0);
});

test('F1/F2/F3: reading order, Tab stepping, nearest object in a direction and spoken summaries', () => {
  const at = (id: string, x: number, y: number) => ({ ...createItem('note', x, y), id, text: id.toUpperCase() });
  // Row 1: a (x 0), b (x 400, slightly lower); row 2: c (x 0), d (x 400).
  const b = board(at('d', 400, 600), at('b', 400, 30), at('c', 0, 600), at('a', 0, 0));
  assert.deepEqual(readingOrder(b), ['a', 'b', 'c', 'd']);
  assert.equal(stepInOrder(b, undefined), 'a');
  assert.equal(stepInOrder(b, 'd'), 'a', 'wraps');
  assert.equal(stepInOrder(b, 'a', true), 'd');
  assert.equal(nearestInDirection(b, 'a', 'right'), 'b');
  assert.equal(nearestInDirection(b, 'a', 'down'), 'c');
  assert.equal(nearestInDirection(b, 'd', 'left'), 'c');
  assert.equal(nearestInDirection(b, 'a', 'left'), undefined);
  assert.equal(describeItem(b.items[3]), 'Sticky note, A');
  assert.equal(boardSummary(b), 'Gaps: 4 objects — 4 sticky notes.');
});

test('F8/F10: reduced motion follows the system until chosen; palette colours have names', () => {
  assert.equal(parseViewPrefs(null, true).reduceMotion, true);
  assert.equal(parseViewPrefs('{"grid":true}', true).reduceMotion, true);
  assert.equal(parseViewPrefs('{"reduceMotion":false}', true).reduceMotion, false);
  assert.equal(parseViewPrefs(null).reduceMotion, false);
  for (const c of colors) assert.notEqual(colorName(c), c, `${c} has a name`);
  assert.equal(colorName('#123456'), '#123456');
});

test('F7: checker flags low-contrast lines and outlines against the board, and untitled containers', () => {
  const line = { ...createItem('arrow', 0, 0), fill: '#e4e4e7' },
    dark = { ...createItem('arrow', 0, 0), fill: '#25252a' },
    outline = { ...createItem('rectangle', 0, 0), fill: '#ffffff', style: { borderWidth: 2, borderColor: '#eeeeee' } },
    frame = { ...createItem('frame', 0, 0), text: '' },
    named = { ...createItem('frame', 0, 0), text: 'Ideas' };
  const issues = checkAccessibility(board(line, dark, outline, frame, named));
  assert.deepEqual(
    issues.map(i => [i.id, i.kind]),
    [
      [line.id, 'contrast'],
      [outline.id, 'contrast'],
      [frame.id, 'empty'],
    ],
  );
  // On a dark board the dark line is the problem.
  const onDark = checkAccessibility({ ...board(dark), background: '#1f1f23' });
  assert.deepEqual(
    onDark.map(i => i.id),
    [dark.id],
  );
});

test('D2: snap to grid lands the selection corner on 40 px steps; preferences round-trip', () => {
  const a = { ...createItem('note', 13, 27), id: 'a' };
  assert.deepEqual(snapToGrid(board(a), ['a'], { x: 50, y: 0 }), { x: 67, y: 13 });
  assert.deepEqual(snapToGrid(board(a), ['a'], { x: -20, y: 30 }), { x: -13, y: 13 });
  const prefs = parseViewPrefs('{"snapGrid":true,"gridStyle":"dots"}');
  assert.deepEqual([prefs.snapGrid, prefs.gridStyle], [true, 'dots']);
  assert.equal(parseViewPrefs('{"gridStyle":"zigzag"}').gridStyle, 'lines');
});

test('B10: large images are scaled so the longest side is at most 4096 px', () => {
  assert.deepEqual(downscaleSize(8000, 6000), { width: 4096, height: 3072 });
  assert.deepEqual(downscaleSize(1000, 30000), { width: 137, height: 4096 });
  assert.deepEqual(downscaleSize(800, 600), { width: 800, height: 600 });
  assert.equal(dataUrlBytes('data:image/png;base64,' + 'A'.repeat(400)), 300);
});

test('F9: keyboard connect chains objects in order and skips connectors, duplicates and existing links', () => {
  const [a, b, c] = notes('abc'),
    line = { ...createItem('arrow', 0, 0), id: 'l', from: 'a', to: 'b' };
  const r = connectItems(board(a, b, c, line), ['a', 'b', 'l', 'c', 'c']);
  assert.deepEqual(
    r.connectors.map(x => [x.from, x.to]),
    [['b', 'c']],
  );
  parseBoard(r.board);
  assert.equal(connectItems(board(a), ['a']).connectors.length, 0);
});

test('C15: version snapshots are taken at most every 30 minutes, only on change, and capped', () => {
  const store = new Map<string, string>();
  const kv = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const t0 = Date.parse('2026-11-04T09:00:00Z'),
    at = (min: number) => new Date(t0 + min * 60_000);
  const b1 = board({ ...createItem('note', 0, 0), id: 'a', text: 'one' });
  assert.equal(maybeSnapshot(kv, 'x', b1, at(0)), true);
  assert.equal(maybeSnapshot(kv, 'x', { ...b1, title: 'renamed' }, at(40)), false, 'unchanged content');
  assert.equal(maybeSnapshot(kv, 'x', board({ ...b1.items[0], text: 'two' }), at(10)), false, 'too soon');
  assert.equal(maybeSnapshot(kv, 'x', board({ ...b1.items[0], text: 'two' }), at(31)), true);
  for (let k = 0; k < 15; k++) maybeSnapshot(kv, 'x', board({ ...b1.items[0], text: String(k) }), at(100 + k * 31));
  const v = listVersions(kv, 'x');
  assert.equal(v.length, MAX_VERSIONS);
  assert.equal(v[0].board.items[0].text, '14', 'newest first');
  assert.equal(maybeSnapshot(kv, 'y', board(), at(0)), false, 'empty boards are skipped');
  store.set('boardroom.versions.z', 'not json');
  assert.deepEqual(listVersions(kv, 'z'), []);
});

test('D14: the new fonts validate and map to installed font stacks', async () => {
  const { fontFamilies, fontStack } = await import('../src/model.ts');
  for (const f of fontFamilies) {
    parseBoard(board({ ...createItem('text', 0, 0), text: 'x', format: { fontFamily: f } }));
    assert.ok(fontStack(f).length > 0);
  }
  assert.match(fontStack('Handwriting'), /cursive$/);
  assert.throws(() => parseBoard(board({ ...createItem('text', 0, 0), format: { fontFamily: 'Papyrus' as never } })));
});

test('F12: pinned toolbar tools are kept as a short, unique list of kind ids', () => {
  assert.deepEqual(parseViewPrefs('{"pinned":["card","card","grid",5]}').pinned, ['card', 'grid']);
  assert.deepEqual(parseViewPrefs('{"pinned":"card"}').pinned, []);
  assert.equal(
    parseViewPrefs(JSON.stringify({ pinned: Array.from({ length: 30 }, (_, i) => `k${i}`) })).pinned.length,
    12,
  );
});

test('D9: named layers add, hide, lock, reorder, delete and receive new objects', async () => {
  const L = await import('../src/layers.ts');
  const { editableIds } = await import('../src/arrange.ts');
  const a = { ...createItem('note', 0, 0), id: 'a' },
    b = { ...createItem('note', 0, 0), id: 'b' };
  let bd = L.addLayer(board(a, b), 'Notes', 'n');
  assert.deepEqual(
    L.layersOf(bd).map(l => l.name),
    ['Layer 1', 'Notes'],
  );
  bd = L.moveToLayer(bd, ['a'], 'n');
  assert.deepEqual(
    bd.items.map(i => i.id),
    ['b', 'a'],
    'upper layer paints last',
  );
  bd = L.patchLayer(bd, 'n', { locked: true, hidden: true });
  assert.equal(L.inLockedLayer(bd, bd.items[1]), true);
  assert.equal(L.inHiddenLayer(bd, bd.items[1]), true);
  assert.deepEqual(editableIds(bd, ['a', 'b']), ['b']);
  parseBoard(JSON.parse(JSON.stringify(bd)));
  // New objects join the active layer.
  const c = { ...createItem('note', 0, 0), id: 'c' };
  const withC = L.assignNewToLayer(bd, { ...bd, items: [...bd.items, c] }, 'n');
  assert.equal(withC.items.find(i => i.id === 'c')!.layer, 'n');
  // Moving the layer down puts its objects first.
  assert.deepEqual(
    L.moveLayer(bd, 'n', -1).items.map(i => i.id),
    ['a', 'b'],
  );
  // Deleting the layer moves its objects to the layer below and drops the layer list when only the plain base remains.
  const gone = L.deleteLayer(bd, 'n');
  assert.equal(gone.items.find(i => i.id === 'a')!.layer, undefined);
  assert.equal(gone.layers, undefined);
  assert.throws(() => parseBoard({ ...board({ ...a, layer: 'missing' }) }), /missing layer/);
  assert.throws(() => L.moveToLayer(bd, ['b'], 'nope'), /no longer exists/);
});

test('F11: pinch zooms around the finger midpoint and pans with it', async () => {
  const { pinchCamera } = await import('../src/camera.ts');
  const start = { x: 0, y: 0, z: 1 };
  // Fingers spread from 100 px to 200 px apart around (150, 100): zoom 2x anchored there.
  const zoomed = pinchCamera(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 });
  assert.deepEqual(zoomed, { x: -150, y: -100, z: 2 });
  // Same distance, midpoint moved 30 px right: pure pan.
  const panned = pinchCamera(start, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 130, y: 100 }, { x: 230, y: 100 });
  assert.deepEqual(panned, { x: 30, y: 0, z: 1 });
  assert.deepEqual(pinchCamera(start, { x: 1, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 9, y: 9 }), start);
});

test('C14: last visit is remembered per board; reloads within 30 minutes keep the earlier visit', async () => {
  const { recordVisit, previousVisit, changedSince } = await import('../src/activity.ts');
  const store = new Map<string, string>(),
    kv = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const t = (h: number) => new Date(Date.parse('2026-11-04T08:00:00Z') + h * 3600_000);
  assert.equal(recordVisit(kv, 'b', t(0)), undefined);
  assert.equal(recordVisit(kv, 'b', t(5)), t(0).toISOString());
  assert.equal(recordVisit(kv, 'b', t(5.2)), t(0).toISOString(), 'reload in the same visit');
  assert.equal(previousVisit(kv, 'b'), t(0).toISOString());
  const log = [
    { id: '1', at: t(1).toISOString(), action: 'added' as const, itemId: 'x', type: 'note', label: '' },
    { id: '2', at: t(2).toISOString(), action: 'edited' as const, itemId: 'x', type: 'note', label: '' },
    { id: '3', at: t(2).toISOString(), action: 'deleted' as const, itemId: 'y', type: 'note', label: '' },
    { id: '4', at: t(-1).toISOString(), action: 'added' as const, itemId: 'z', type: 'note', label: '' },
  ];
  assert.deepEqual(changedSince(log, t(0).getTime(), new Set(['x', 'y', 'z'])), ['x']);
});

test('B17: the web page export escapes the title and neutralises script endings in the SVG', async () => {
  const { standaloneHtml } = await import('../src/html-export.ts');
  const html = standaloneHtml(
    '<svg width="10" height="10"><text></script>x</text></svg>',
    '<b>Plan</b> & co',
    new Date('2026-11-04T10:00:00Z'),
  );
  assert.match(html, /<title>&lt;b&gt;Plan&lt;\/b&gt; &amp; co<\/title>/);
  assert.equal((html.match(/<\/script>/gi) ?? []).length, 1, 'only the viewer script closes a script tag');
  assert.match(html, /exported 2026-11-04 10:00/);
});

test('B18: encrypted backups round-trip with the passphrase and refuse a wrong one or a changed file', async () => {
  const { encryptBackup, decryptBackup, isEncryptedBackup } = await import('../src/encrypted-backup.ts');
  const text = JSON.stringify(board({ ...createItem('note', 0, 0), text: 'Secret plan ✓' }));
  const locked = await encryptBackup(text, 'correct horse');
  assert.ok(isEncryptedBackup(locked));
  assert.ok(!JSON.stringify(locked).includes('Secret'));
  assert.equal(await decryptBackup(locked, 'correct horse'), text);
  await assert.rejects(decryptBackup(locked, 'wrong horse'), /Wrong passphrase/);
  const tampered = { ...locked, data: locked.data.slice(0, -4) + (locked.data.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
  await assert.rejects(decryptBackup(tampered, 'correct horse'), /Wrong passphrase|changed/);
  await assert.rejects(encryptBackup(text, 'short'), /at least 8/);
  await assert.rejects(decryptBackup({ ...locked, iterations: 5 }, 'correct horse'), /damaged/);
});

test('D13: sticky-note reactions count up and down; sticker counts validate', async () => {
  const { reactToNotes } = await import('../src/notes.ts');
  const n = { ...createItem('note', 0, 0), id: 'n' },
    locked = { ...createItem('note', 0, 0), id: 'l', locked: true };
  let b = reactToNotes(board(n, locked), ['n', 'l'], '👍', 1);
  b = reactToNotes(b, ['n'], '👍', 1);
  b = reactToNotes(b, ['n'], '🎉', 1);
  assert.deepEqual(b.items[0].reactions, { '👍': 2, '🎉': 1 });
  assert.equal(b.items[1].reactions, undefined);
  b = reactToNotes(reactToNotes(b, ['n'], '🎉', -1), ['n'], '👍', -1);
  assert.deepEqual(b.items[0].reactions, { '👍': 1 });
  parseBoard(b);
  assert.equal(reactToNotes(b, ['n'], '👍', -1).items[0].reactions, undefined);
  assert.throws(() => reactToNotes(b, ['n'], 'not an emoji at all, far too long to be one', 1));
  assert.throws(() => parseBoard(board({ ...n, reactions: { '👍': 0 } })), /reactions/);
  assert.throws(() => parseBoard(board({ ...createItem('rectangle', 0, 0), reactions: { '👍': 1 } })), /reactions/);
  const stamp = createItem('stamp', 0, 0);
  parseBoard(board({ ...stamp, data: { ...stamp.data, count: 5 } }));
  assert.throws(() => parseBoard(board({ ...stamp, data: { ...stamp.data, count: 0 } })), /sticker count/);
});

test('C13: a thumbnail frame limits the dashboard preview to its area', async () => {
  const { previewOf } = await import('../src/board-library.ts');
  const frame = { ...createItem('frame', 0, 0), id: 'f', w: 500, h: 400 },
    inside = { ...createItem('note', 50, 50), id: 'in' },
    outside = { ...createItem('note', 2000, 2000), id: 'out' };
  const b = board(frame, inside, outside);
  assert.equal(previewOf(b).length, 3);
  const thumb = { ...b, thumbnailFrame: 'f' };
  assert.equal(previewOf(thumb).length, 2);
  parseBoard(thumb);
  assert.equal(previewOf({ ...b, thumbnailFrame: 'gone' }).length, 3, 'a deleted frame falls back to the whole board');
});

test('G10: @mentions suggest names, insert them and are found in text', async () => {
  const { mentionQuery, mentionMatches, insertMention, splitMentions } = await import('../src/mentions.ts');
  assert.deepEqual(mentionQuery('Hi @gr', 6), { start: 3, query: 'gr' });
  assert.equal(mentionQuery('mail a@b', 8), null, 'emails are not mentions');
  assert.deepEqual(mentionMatches(['Grace Hopper', 'Ada Lovelace', 'Margaret'], 'ho'), ['Grace Hopper']);
  assert.deepEqual(mentionMatches(['Grace Hopper', 'Margaret'], 'gar'), ['Margaret']);
  assert.deepEqual(insertMention('Hi @gr!', 3, 6, 'Grace Hopper'), { text: 'Hi @Grace Hopper !', caret: 17 });
  assert.deepEqual(splitMentions('Ask @grace hopper and @Ada (not @Adam).', ['Grace Hopper', 'Ada']), [
    { text: 'Ask ' },
    { text: '@grace hopper', mention: true },
    { text: ' and ' },
    { text: '@Ada', mention: true },
    { text: ' (not @Adam).' },
  ]);
});

test('G12: estimate chips set and clear story points and T-shirt sizes on cards', async () => {
  const { estimatePatch, patchCards } = await import('../src/card-tools.ts');
  assert.deepEqual(estimatePatch('points:5'), { points: 5 });
  assert.deepEqual(estimatePatch('size:M'), { size: 'M' });
  // XXL joined the sizes with the estimate palette (track F).
  assert.deepEqual(estimatePatch('size:XXL'), { size: 'XXL' });
  assert.equal(estimatePatch('size:XXXL'), null);
  assert.equal(estimatePatch('points:-1'), null);
  assert.equal(estimatePatch('rm -rf'), null);
  const c = { ...createItem('card', 0, 0), id: 'c' };
  let b = patchCards(board(c), ['c'], { points: 8, size: 'L' });
  assert.deepEqual([b.items[0].data!.points, b.items[0].data!.size], [8, 'L']);
  parseBoard(b);
  b = patchCards(b, ['c'], { points: null, size: null });
  assert.deepEqual([b.items[0].data!.points, b.items[0].data!.size], [undefined, undefined]);
});

test('G13: frames become slides with their title and the text inside as bullets', async () => {
  const { framesToDeck, deckItemFor } = await import('../src/deck-tools.ts');
  const f1 = { ...createItem('frame', 0, 0), id: 'f1', text: 'Goals', w: 800, h: 600 },
    f2 = { ...createItem('frame', 1000, 0), id: 'f2', text: '', w: 800, h: 600 },
    a = { ...createItem('note', 400, 50), id: 'a', text: 'Second\nline' },
    b = { ...createItem('note', 20, 50), id: 'b', text: 'First' },
    out = { ...createItem('note', 3000, 0), id: 'o', text: 'Outside' };
  const deck = framesToDeck(board(f1, f2, a, b, out), ['f1', 'f2']);
  assert.deepEqual(
    deck.slides.map(s => [s.title, s.body]),
    [
      ['Goals', '- First\n- Second line'],
      ['Slide 2', ''],
    ],
  );
  const item = deckItemFor(board(f1, f2, a, b, out), ['f1', 'f2', 'a'])!;
  assert.equal(item.type, 'slides');
  assert.ok(item.x > 1800);
  parseBoard(board(item));
});

test('G14: video trims validate (start before end, finite seconds)', () => {
  const v = { ...createItem('video', 0, 0), assetId: 'x', data: { duration: 30 } };
  parseBoard(board({ ...v, data: { duration: 30, trim: { start: 2, end: 12.5 } } }));
  assert.throws(() => parseBoard(board({ ...v, data: { duration: 30, trim: { start: 5, end: 5 } } })), /trim/);
  assert.throws(() => parseBoard(board({ ...v, data: { duration: 30, trim: { start: -1, end: 5 } } })), /trim/);
  assert.throws(() => parseBoard(board({ ...v, data: { duration: 30, trim: 'all' } })), /trim/);
});

test('D2: resizing with snap to grid snaps only the moved edges, keeping at least one cell', async () => {
  const { snapResize } = await import('../src/interactions.ts');
  const prev = { x: 13, y: 27, w: 200, h: 100 };
  // Dragging the bottom-right handle: right and bottom snap, left and top stay.
  assert.deepEqual(snapResize(prev, { x: 13, y: 27, w: 251, h: 118 }), { x: 13, y: 27, w: 267, h: 133 });
  // Dragging the left edge: only left snaps.
  assert.deepEqual(snapResize(prev, { x: -9, y: 27, w: 222, h: 100 }), { x: 0, y: 27, w: 213, h: 100 });
  // Shrinking below one cell keeps a 40 px minimum.
  assert.deepEqual(snapResize(prev, { x: 13, y: 27, w: 5, h: 100 }), { x: 13, y: 27, w: 40, h: 100 });
});

test('F2: enter a frame to its first object and leave back to the smallest frame around it', async () => {
  const { firstInFrame, frameAroundItem } = await import('../src/navigation.ts');
  const big = { ...createItem('frame', 0, 0), id: 'big', w: 1000, h: 800 },
    small = { ...createItem('frame', 50, 50), id: 'small', w: 500, h: 400 },
    a = { ...createItem('note', 300, 100), id: 'a' },
    b = { ...createItem('note', 60, 100), id: 'b' };
  const bd = board(big, small, a, b);
  assert.equal(firstInFrame(bd, 'small'), 'b');
  assert.equal(frameAroundItem(bd, 'a'), 'small');
  assert.equal(frameAroundItem(bd, 'small'), 'big');
  assert.equal(frameAroundItem(bd, 'big'), undefined);
  assert.equal(firstInFrame(bd, 'a'), undefined);
});
