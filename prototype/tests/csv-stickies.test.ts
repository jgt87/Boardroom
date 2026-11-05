// CSV to sticky notes (import from other whiteboards).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newBoard, parseBoard } from '../src/model.ts';
import {
  csvStickiesNote,
  csvToStickies,
  looksLikeStickyRows,
  nearestStickyColour,
  rowsToStickies,
  stickyColour,
  stickyColumns,
  stickyTags,
} from '../src/csv-stickies.ts';
import { BOARD_OBJECT_LIMIT } from '../src/drawio-shapes.ts';

const at = { x: 1000, y: -500 };
const notesOf = (r: ReturnType<typeof csvToStickies>) => r.items.filter(i => i.type === 'note');
const framesOf = (r: ReturnType<typeof csvToStickies>) => r.items.filter(i => i.type === 'frame');
const valid = (r: ReturnType<typeof csvToStickies>) => parseBoard({ ...newBoard(), items: r.items });

test('a header picks the text column by name, in priority order', () => {
  const r = csvToStickies('Name,Content,Votes\nAda,First idea,3\nLin,Second idea,1\n', { center: at });
  assert.equal(r.header, true);
  assert.equal(r.textColumn, 'Content');
  assert.deepEqual(
    notesOf(r).map(n => n.text),
    ['First idea', 'Second idea'],
  );
  assert.equal(r.frames, 0);
  assert.equal(csvStickiesNote(r), 'Added 2 sticky notes from the "Content" column.');
  valid(r);
});

test('a header without a text name uses the first non-empty column that has no other role', () => {
  const cols = stickyColumns([
    ['Colour', 'ID', 'Summary'],
    ['yellow', '', 'Hello'],
  ]);
  assert.equal(cols?.named, false);
  assert.equal(cols?.text, 2);
  assert.equal(cols?.colour, 0);
  assert.equal(stickyColumns([['Buy milk', 'Call Ben']]), null);
});

test('no header: every non-empty cell is a note and each CSV column a column of notes', () => {
  const r = csvToStickies('Buy milk,Call Ben\n,Book flights\n\nWrite report,\n', { center: { x: 0, y: 0 } });
  assert.equal(r.header, false);
  const notes = notesOf(r);
  assert.deepEqual(
    notes.map(n => n.text),
    ['Buy milk', 'Write report', 'Call Ben', 'Book flights'],
  );
  // Two columns: the first holds "Buy milk" above "Write report" (the gap is closed up).
  assert.equal(notes[0].x, notes[1].x);
  assert.ok(notes[1].y > notes[0].y);
  assert.ok(notes[2].x > notes[0].x);
  assert.equal(notes[2].y, notes[0].y);
  assert.equal(r.skipped, 1);
  // Centred on the view centre.
  const x0 = Math.min(...notes.map(n => n.x)),
    x1 = Math.max(...notes.map(n => n.x + n.w));
  assert.ok(Math.abs((x0 + x1) / 2) <= 1);
});

test('a single column without a header wraps into a tidy grid', () => {
  const r = csvToStickies(Array.from({ length: 12 }, (_, k) => `Idea ${k + 1}`).join('\n'), { center: at });
  const xs = new Set(notesOf(r).map(n => n.x));
  assert.equal(notesOf(r).length, 12);
  assert.equal(xs.size, 5);
});

test('quoted fields keep commas, quotes and line breaks; BOM and CRLF are read', () => {
  const csv = '\uFEFFText,Tags\r\n"Hello, world","a; b"\r\n"Line one\r\nline two","say ""hi"""\r\n';
  const r = csvToStickies(csv, { center: at });
  assert.equal(r.textColumn, 'Text');
  assert.deepEqual(
    notesOf(r).map(n => n.text),
    ['Hello, world', 'Line one\nline two'],
  );
  assert.deepEqual(notesOf(r)[0].tags, ['a', 'b']);
  assert.deepEqual(notesOf(r)[1].tags, ['say "hi"']);
});

test('colours: hex codes and names map to the nearest sticky colour, others keep the default', () => {
  assert.equal(stickyColour('#FFE36E'), '#ffe36e');
  assert.equal(stickyColour('ffe36e'), '#ffe36e');
  assert.equal(stickyColour('#ff0'), nearestStickyColour('#ffff00'));
  assert.equal(stickyColour('light_yellow'), '#fff49b');
  assert.equal(stickyColour('Light Blue'), '#a8cdff');
  assert.equal(stickyColour('dark-green'), '#166534');
  assert.equal(stickyColour('grey'), '#e4e4e7');
  assert.equal(stickyColour('lightpink'), '#f7c5ef');
  assert.equal(stickyColour('banana'), undefined);
  assert.equal(stickyColour(''), undefined);
  assert.equal(nearestStickyColour('#000000'), '#1f1f23');
  const r = csvToStickies('Text,Color\nA,blue\nB,#a9e8bb\nC,banana\n', { center: at, fill: '#ffb879' });
  assert.deepEqual(
    notesOf(r).map(n => n.fill),
    ['#a8cdff', '#a9e8bb', '#ffb879'],
  );
});

test('tags and authors are cleaned and stay valid', () => {
  assert.deepEqual(stickyTags('a, b; a ,, ' + 'x'.repeat(40)), ['a', 'b', 'x'.repeat(32)]);
  assert.equal(stickyTags(Array.from({ length: 15 }, (_, k) => `t${k}`).join(',')).length, 10);
  const r = csvToStickies('Sticky note,Tag,Assignee\nShip it,"urgent, web",  Ana  <b>\n', { center: at });
  const [n] = notesOf(r);
  assert.deepEqual(n.tags, ['urgent', 'web']);
  assert.equal(n.author, 'Ana b');
  valid(r);
});

test('a group column puts each group in its own frame, side by side; ungrouped rows follow unframed', () => {
  const csv = 'Idea,Category\nA,Wins\nB,Risks\nC,Wins\nD,\nE,Risks\n';
  const r = csvToStickies(csv, { center: at });
  const frames = framesOf(r),
    notes = notesOf(r);
  assert.equal(r.frames, 2);
  assert.deepEqual(
    frames.map(f => f.text),
    ['Wins', 'Risks'],
  );
  assert.ok(frames[1].x > frames[0].x + frames[0].w);
  assert.equal(frames[0].y, frames[1].y);
  const inside = (f: (typeof frames)[0], t: string) => {
    const n = notes.find(i => i.text === t)!;
    return n.x >= f.x && n.y >= f.y && n.x + n.w <= f.x + f.w && n.y + n.h <= f.y + f.h;
  };
  assert.ok(inside(frames[0], 'A') && inside(frames[0], 'C'));
  assert.ok(inside(frames[1], 'B') && inside(frames[1], 'E'));
  assert.ok(!inside(frames[0], 'D') && !inside(frames[1], 'D'));
  // Frames come before their notes in paint order.
  assert.ok(r.items.indexOf(frames[0]) < r.items.indexOf(notes.find(i => i.text === 'A')!));
  assert.equal(csvStickiesNote(r), 'Added 5 sticky notes in 2 frames from the "Idea" column.');
  valid(r);
});

test('rows without text are skipped and reported', () => {
  const r = csvToStickies('Title,Color\nOne,yellow\n,red\n\n  ,\nTwo,\n', { center: at });
  assert.equal(r.notes, 2);
  assert.equal(r.skipped, 3);
  assert.match(csvStickiesNote(r), /Skipped 3 rows without text\./);
});

test('empty input adds nothing', () => {
  for (const text of ['', '\uFEFF', '\r\n\r\n', 'Text,Colour\n']) {
    const r = csvToStickies(text, { center: at });
    assert.equal(r.items.length, 0);
    assert.equal(r.notes, 0);
  }
  assert.equal(csvStickiesNote(csvToStickies('', { center: at })), 'The file has no text to turn into sticky notes.');
});

test('huge input is capped at the board object limit, frames included', () => {
  const rows = Array.from({ length: 3000 }, (_, k) => `Note ${k},G${k % 3}`);
  const r = csvToStickies(['Text,Group', ...rows].join('\n'), { center: at });
  assert.equal(r.items.length, BOARD_OBJECT_LIMIT);
  assert.equal(r.frames, 3);
  assert.equal(r.notes, BOARD_OBJECT_LIMIT - 3);
  assert.equal(r.capped, 3000 - r.notes);
  assert.match(csvStickiesNote(r), /left out: a board holds up to 2,000 objects/);
  const small = csvToStickies('a\nb\nc\n', { center: at, room: 2 });
  assert.equal(small.notes, 2);
  assert.equal(small.capped, 1);
  const none = csvToStickies('a\n', { center: at, room: 0 });
  assert.match(csvStickiesNote(none), /no sticky notes were added/);
  assert.throws(() => csvToStickies('x'.repeat(6 * 1024 * 1024), { center: at }), /5 MB/);
});

test('pasted rows are offered as notes only with a header naming the text column', () => {
  assert.equal(
    looksLikeStickyRows([
      ['Text', 'Colour'],
      ['Hi', 'blue'],
    ]),
    true,
  );
  assert.equal(looksLikeStickyRows([['Ideas'], ['One'], ['Two']]), true);
  assert.equal(
    looksLikeStickyRows([
      ['Colour', 'Owner'],
      ['blue', 'Ana'],
    ]),
    false,
  );
  assert.equal(looksLikeStickyRows([['Buy milk', 'Call Ben']]), false);
  assert.equal(looksLikeStickyRows([['Text', 'Colour']]), false);
  const r = rowsToStickies(
    [
      ['Text', 'Colour'],
      ['Hi', 'blue'],
    ],
    { center: at },
  );
  assert.equal(notesOf(r)[0].fill, '#a8cdff');
});
