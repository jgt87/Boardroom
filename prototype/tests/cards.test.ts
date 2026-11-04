import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  CARD_ACCENT,
  boardPeople,
  boardTags,
  canBecomeCard,
  cardsCsv,
  convertToCards,
  patchCards,
  tagColors,
  toCard,
} from '../src/card-tools.ts';
import { renderMarkdown } from '../src/markdown.ts';

const board = (...items: Item[]): Board => ({ version: 1, title: 'Cards', items });

test('switch type converts notes, text and shapes to cards in bulk and skips locked or other objects', () => {
  const note = { ...createItem('note', 0, 0), text: 'Idea', tags: ['ux'] },
    text = { ...createItem('text', 0, 100), text: 'Heading' },
    shape = { ...createItem('rectangle', 0, 200), text: 'Box', fill: '#ffffff' },
    locked = { ...createItem('note', 0, 300), locked: true },
    frame = createItem('frame', 0, 400);
  const { board: next, converted } = convertToCards(board(note, text, shape, locked, frame), [
    note.id,
    text.id,
    shape.id,
    locked.id,
    frame.id,
  ]);
  assert.equal(converted, 3);
  const [a, b, c, d, e] = next.items;
  assert.deepEqual(
    [a, b, c].map(i => [i.id, i.type]),
    [
      [note.id, 'card'],
      [text.id, 'card'],
      [shape.id, 'card'],
    ],
  );
  assert.deepEqual(a.tags, ['ux']);
  assert.equal(b.fill, CARD_ACCENT, 'text colour is not used as an accent');
  assert.equal(c.fill, CARD_ACCENT, 'a white shape gets the default accent');
  assert.equal(d.type, 'note');
  assert.equal(e.type, 'frame');
  assert.equal(c.style, undefined);
  assert.equal(canBecomeCard(frame), false);
  parseBoard(JSON.parse(JSON.stringify(next)));
});

test('cards accept no status and a start date, up to 20,000 characters, and reject reversed dates', () => {
  const card = { ...toCard(createItem('note', 0, 0)), text: 'x'.repeat(20000) };
  card.data = { ...card.data, status: '', start: '2026-03-01', due: '2026-03-05', description: 'd'.repeat(20000) };
  parseBoard(board(card));
  assert.throws(() => parseBoard(board({ ...card, text: 'x'.repeat(20001) })));
  assert.throws(() => parseBoard(board({ ...card, data: { ...card.data, start: '2026-04-01' } })), /Invalid card/);
  assert.throws(() => parseBoard(board({ ...card, data: { ...card.data, status: 'Done' } })), /Invalid card/);
});

test('bulk card edits set status, assignee, dates and tags on unlocked cards only', () => {
  const a = createItem('card', 0, 0),
    b = createItem('card', 300, 0),
    locked = { ...createItem('card', 600, 0), locked: true },
    note = createItem('note', 0, 300);
  const ids = [a.id, b.id, locked.id, note.id];
  let next = patchCards(board(a, b, locked, note), ids, { status: 'In progress', assignee: '  Ada  ' });
  next = patchCards(next, ids, { start: '2026-01-02', due: '2026-01-09', addTag: 'Launch' });
  next = patchCards(next, ids, { addTag: 'Launch' });
  for (const i of next.items.slice(0, 2)) {
    assert.equal(i.data!.status, 'In progress');
    assert.equal(i.data!.assignee, 'Ada');
    assert.equal(i.data!.start, '2026-01-02');
    assert.deepEqual(i.tags, ['Launch'], 'adding an existing tag does not duplicate it');
  }
  assert.equal(next.items[2].data!.status, 'Not started');
  assert.equal(next.items[3].data, undefined);
  next = patchCards(next, ids, { status: '', removeTag: 'Launch', start: '' });
  assert.equal(next.items[0].data!.status, '');
  assert.equal(next.items[0].tags, undefined);
  assert.equal(next.items[0].data!.start, undefined);
  parseBoard(next);
  assert.throws(() => patchCards(next, ids, { start: '2026-02-01', due: '2026-01-01' }), /start date/);
  assert.throws(() => patchCards(next, ids, { due: '2026-02-30' }), /valid date/);
  assert.throws(() => patchCards(next, ids, { addTag: 'x'.repeat(33) }), /tag/);
});

test('assignee suggestions come from people lists, user cards and card assignees', () => {
  const people = { ...createItem('people', 0, 0) };
  people.data = { title: 'Team', members: [{ id: 'p1', name: 'Grace', color: '#4262ff' }] };
  const card = createItem('card', 0, 0);
  card.data = { ...card.data, assignee: 'Ada' };
  assert.deepEqual(boardPeople(board(people, card)), ['Ada', 'Grace']);
});

test('tag colours come from the board, default otherwise, and invalid colours are rejected', () => {
  const card = { ...createItem('card', 0, 0), tags: ['b', 'a'] };
  const b = { ...board(card), tagColors: { a: '#ffe3e6' } };
  assert.deepEqual(boardTags(b), ['a', 'b']);
  assert.equal(tagColors(b, 'a').background, '#ffe3e6');
  assert.equal(tagColors(b, 'a').color, '#ad2532');
  assert.equal(tagColors(b, 'b').background, '#edf0ff');
  parseBoard(b);
  assert.throws(() => parseBoard({ ...b, tagColors: { a: 'red' } }), /tag colours/);
});

test('card CSV exports every field and neutralises spreadsheet formulas', () => {
  const card = { ...createItem('card', 0, 0), text: '=SUM(A1)', tags: ['x', 'y'] };
  card.data = { ...card.data, description: 'Line, "quoted"', start: '2026-01-01', due: '2026-01-02', points: 3 };
  const [head, row] = cardsCsv([card, createItem('note', 0, 0)])
    .trim()
    .split('\r\n');
  assert.equal(head, 'Title,Description,Status,Assignee,Start date,Due date,Tags,Story points,Size');
  assert.equal(row, `"'=SUM(A1)","Line, ""quoted""",Not started,,2026-01-01,2026-01-02,"x, y",3,`);
});

test('card descriptions render underline and keep escaped plus signs literal', () => {
  assert.equal(renderMarkdown('++u++ and \\+\\+no\\+\\+').trim(), '<p><u>u</u> and ++no++</p>');
});
