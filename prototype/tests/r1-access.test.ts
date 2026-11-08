// Track R1: keyboard editing, assistive structure, accessibility report and object deep links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { checkAccessibility } from '../src/board-tools.ts';
import { tagPalette } from '../src/card-tools.ts';
import { personColors } from '../src/specs-people.ts';
import { parseDeepLink as parseLink } from '../src/deep-link.ts';
import {
  addInDirection,
  containerSiblings,
  deepLinkHash,
  deepLinkTarget,
  enterContainer,
  groupA11yIssues,
  itemAriaLabel,
  itemDetails,
  leaveContainer,
  nextNoteBeside,
  outlineByFrame,
  parseDeepLink,
  resizeBy,
  selectionSummary,
  spokenColor,
} from '../src/access-tools.ts';

const at = (type: Item['type'], id: string, x: number, y: number, extra: Partial<Item> = {}): Item => ({
  ...createItem(type, x, y),
  id,
  ...extra,
});
const board = (...items: Item[]): Board => ({ version: 1, title: 'Test', items });

test('item labels use the description, then the name, then the text', () => {
  assert.equal(itemAriaLabel(at('image', 'i', 0, 0, { alt: 'Team photo', text: '' })), 'Image: Team photo');
  assert.equal(itemAriaLabel(at('note', 'n', 0, 0, { name: 'Idea', text: 'Body' })), 'Sticky note: Idea');
  assert.equal(itemAriaLabel(at('note', 'n', 0, 0, { text: '  two\n lines ' })), 'Sticky note: two lines');
  assert.equal(itemAriaLabel(at('rectangle', 'r', 0, 0, { text: '' })), 'Rectangle: Untitled');
});

test('colours get spoken names, unique within each palette', () => {
  assert.equal(spokenColor('#FFF49B'), 'Light yellow');
  assert.equal(spokenColor('#000000'), 'Black');
  assert.equal(spokenColor('#ffffff'), 'White');
  assert.equal(spokenColor('#ffe3e6'), 'Light red');
  assert.equal(spokenColor('#808080'), 'Grey');
  assert.equal(spokenColor('#0b3d0b'), 'Dark green');
  assert.equal(spokenColor('not a colour'), 'not a colour');
  for (const palette of [tagPalette, personColors]) {
    const names = palette.map(spokenColor);
    assert.equal(new Set(names).size, names.length, names.join(', '));
    assert.ok(names.every(n => !n.startsWith('#')));
  }
});

test('Ctrl+Shift+Down/Up enter and leave groups as well as frames', () => {
  const frame = at('frame', 'f', 0, 0, { w: 1000, h: 1000, text: 'Plan' });
  const a = at('note', 'a', 100, 100, { group: 'g' }),
    b = at('note', 'b', 400, 100, { group: 'g' }),
    c = at('note', 'c', 100, 500);
  const doc: Board = { ...board(frame, a, b, c), groups: [{ id: 'g', parent: null }] };
  // A whole group is entered at its first member in reading order.
  assert.deepEqual(enterContainer(doc, ['b', 'a']), ['a']);
  // A single member leaves to the whole group, the whole group leaves to the frame.
  assert.deepEqual(leaveContainer(doc, ['b'])?.sort(), ['a', 'b']);
  assert.deepEqual(leaveContainer(doc, ['a', 'b']), ['f']);
  assert.deepEqual(enterContainer(doc, ['f']), ['a']);
  assert.equal(enterContainer(doc, ['c']), undefined);
  assert.equal(leaveContainer(board(c), ['c']), undefined);
});

test('Alt+Home/End siblings: group members, then frame contents, then loose objects', () => {
  const frame = at('frame', 'f', 0, 0, { w: 1000, h: 1000 });
  const a = at('note', 'a', 100, 100),
    b = at('note', 'b', 400, 100),
    out1 = at('note', 'o1', 2000, 0),
    out2 = at('note', 'o2', 2400, 0);
  const doc = board(frame, a, b, out1, out2);
  assert.deepEqual(containerSiblings(doc, 'b'), ['a', 'b']);
  assert.deepEqual(containerSiblings(doc, 'o2'), ['f', 'o1', 'o2']);
  const grouped: Board = {
    ...board({ ...a, group: 'g' }, { ...b, group: 'g' }, at('note', 'x', 100, 400)),
    groups: [{ id: 'g', parent: null }],
  };
  assert.deepEqual(containerSiblings(grouped, 'b'), ['a', 'b']);
  assert.deepEqual(containerSiblings(grouped, 'missing'), []);
});

test('Ctrl+Shift+Arrow adds the nearest object in that direction to the selection', () => {
  const doc = board(at('note', 'a', 0, 0), at('note', 'b', 300, 0), at('note', 'c', 600, 0));
  assert.deepEqual(addInDirection(doc, ['a'], 'right'), ['a', 'b']);
  assert.deepEqual(addInDirection(doc, ['a', 'b'], 'right'), ['a', 'b', 'c']);
  assert.equal(addInDirection(doc, ['a', 'b', 'c'], 'right'), undefined);
  // Already selected objects are skipped.
  assert.deepEqual(addInDirection(doc, ['b', 'c'], 'left'), ['b', 'c', 'a']);
  assert.equal(addInDirection(doc, [], 'left'), undefined);
});

test('keyboard resize grows and shrinks, keeps media proportions and respects locks', () => {
  const note = at('note', 'n', 0, 0, { w: 200, h: 200 }),
    image = at('image', 'i', 0, 0, { w: 200, h: 100 }),
    locked = at('note', 'l', 0, 0, { w: 200, h: 200, locked: true });
  const r = resizeBy(board(note, image, locked), ['n', 'i', 'l'], 10, 0);
  assert.equal(r.resized, 2);
  const byId = new Map(r.board.items.map(i => [i.id, i]));
  assert.deepEqual([byId.get('n')!.w, byId.get('n')!.h], [210, 200]);
  assert.deepEqual([byId.get('i')!.w, byId.get('i')!.h], [210, 105]);
  assert.equal(byId.get('l')!.w, 200);
  // Never below the minimum size.
  const tiny = resizeBy(board(at('note', 't', 0, 0, { w: 12, h: 12 })), ['t'], -10, -10);
  assert.deepEqual([tiny.board.items[0].w, tiny.board.items[0].h], [8, 8]);
  // Nothing editable: the board is unchanged.
  const none = resizeBy(board(locked), ['l'], 10, 10);
  assert.equal(none.resized, 0);
});

test('Tab in a sticky note makes an empty note of the same size and colour beside it', () => {
  const source = at('note', 'n', 10, 20, { w: 300, h: 250, fill: '#a8cdff', text: 'Hi', format: { align: 'left' } });
  const next = nextNoteBeside(source);
  assert.notEqual(next.id, 'n');
  assert.deepEqual([next.x, next.y, next.w, next.h, next.fill, next.text], [334, 20, 300, 250, '#a8cdff', '']);
  assert.deepEqual(next.format, { align: 'left' });
});

test('Alt+I details mention position, size, colour, frame, connections and comments', () => {
  const frame = at('frame', 'f', 0, 0, { w: 1000, h: 1000, text: 'Sprint' });
  const a = at('note', 'a', 100, 120, { text: 'Ship it', fill: '#fff49b', w: 200, h: 200 }),
    b = at('note', 'b', 600, 120);
  const line = at('arrow', 'l', 0, 0, { from: 'a', to: 'b' });
  const doc: Board = {
    ...board(frame, a, b, line),
    comments: [{ id: 't', itemId: 'a', x: 0, y: 0, messages: [{ id: 'm', text: 'ok', at: '' }] }],
  };
  const text = itemDetails(doc, 'a');
  for (const part of ['Sticky note, Ship it', 'x 100, y 120', '200 by 200', 'Light yellow', 'in frame Sprint']) {
    assert.ok(text.includes(part), `${part} in ${text}`);
  }
  assert.ok(text.includes('1 connection,') && text.includes('1 comment'));
  assert.equal(selectionSummary(doc, []), 'Nothing selected.');
  assert.equal(selectionSummary(doc, ['a', 'b']), '2 objects selected.');
});

test('the outline lists frames as headings with their objects in reading order', () => {
  const f1 = at('frame', 'f1', 0, 0, { w: 1000, h: 600, text: '', name: 'Ideas' }),
    f2 = at('frame', 'f2', 0, 800, { w: 1000, h: 600, text: 'Empty' });
  const doc = board(
    f1,
    f2,
    at('note', 'b', 500, 100, { text: 'Second' }),
    at('note', 'a', 100, 100, { text: 'First' }),
    at('note', 'z', 3000, 0, { text: 'Loose' }),
    at('arrow', 'l', 0, 0, { from: 'a', to: 'b' }),
  );
  const out = outlineByFrame(doc);
  assert.deepEqual(
    out.map(s => [s.frame?.title ?? null, s.items.map(i => i.id)]),
    [
      ['Ideas', ['a', 'b']],
      ['Empty', []],
      [null, ['z']],
    ],
  );
  assert.equal(out[0].items[0].label, 'Sticky note: First');
  assert.deepEqual(outlineByFrame(board()), []);
});

test('accessibility issues carry a severity and group into Descriptions, Contrast and Text', () => {
  const issues = checkAccessibility(
    board(
      at('note', 'grey', 0, 0, { fill: '#7a7a7a', text: 'low contrast' }),
      at('image', 'img', 0, 0, { assetId: 'x' }),
      at('text', 'tiny', 0, 0, { text: 'tiny', format: { fontSize: 10 } }),
      at('frame', 'f', 0, 0, { text: '' }),
    ),
  );
  const byKind = Object.fromEntries(issues.map(i => [i.kind, i.severity]));
  assert.deepEqual(byKind, { contrast: 'warning', alt: 'error', 'small-text': 'warning', empty: 'warning' });
  const veryLow = checkAccessibility(
    board(at('text', 't', 0, 0, { text: 'pale', fill: '#eeeeee', format: { background: '#ffffff' } })),
  );
  assert.equal(veryLow[0].severity, 'error');
  const groups = groupA11yIssues(issues);
  assert.deepEqual(
    groups.map(g => [g.section, g.issues.map(i => i.kind)]),
    [
      ['Descriptions', ['alt', 'empty']],
      ['Contrast', ['contrast']],
      ['Text', ['small-text']],
    ],
  );
  assert.deepEqual(groupA11yIssues([]), []);
});

test('deep links: hash format, parsing and target lookup', () => {
  const note = at('note', 'note-1', 0, 0),
    frame = at('frame', 'frame-1', 0, 0);
  // One written format for objects and frames (R4-Q6), the one deep-link.ts opens.
  assert.equal(deepLinkHash(note, 'b1'), '#board=b1&object=note-1');
  assert.equal(deepLinkHash(frame), '#object=frame-1');
  assert.deepEqual(parseLink(deepLinkHash(note, 'b1')), { board: 'b1', object: 'note-1' });
  // Older item= / frame= links still parse here.
  assert.deepEqual(parseDeepLink('#board=b1&item=note-1'), { board: 'b1', item: 'note-1' });
  assert.deepEqual(parseDeepLink('frame=frame-1'), { frame: 'frame-1' });
  assert.equal(parseDeepLink(''), undefined);
  assert.equal(parseDeepLink('#board=b1'), undefined);
  // Malformed ids are ignored.
  assert.equal(parseDeepLink('#item=%3Cscript%3E'), undefined);
  const doc = board(note, frame);
  assert.equal(deepLinkTarget(doc, { item: 'note-1' })?.id, 'note-1');
  assert.equal(deepLinkTarget(doc, { frame: 'frame-1' })?.id, 'frame-1');
  assert.equal(deepLinkTarget(doc, { frame: 'note-1' }), undefined);
  assert.equal(deepLinkTarget(doc, { item: 'gone' }), undefined);
});
