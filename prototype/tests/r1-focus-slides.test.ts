// Track D: focus views (start object setting), slide images, slide sorter and activity slide layouts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { startObjectChoices, startObjectOf, withSetting, validateBoardSettings } from '../src/board-settings.ts';
import {
  newSlide,
  setSlideLayout,
  duplicateSlide,
  resetVotes,
  hasResponses,
  rateScale,
  setScaleMax,
  scaleSummary,
  addWord,
  removeWord,
  wordCloudLayout,
  addAnswer,
  removeAnswer,
  reorderSlide,
  gridStep,
  validateDeck,
  slideText,
  SLIDE_WORDS_MAX,
  SLIDE_WORD_LEN,
  SLIDE_ANSWERS_MAX,
} from '../src/specs-activities.ts';
import type { DeckData, Slide } from '../src/specs-activities.ts';
import { slideSvg, slidePngName, wrapText, responseLines, SLIDE_PNG_W, SLIDE_PNG_H } from '../src/deck-tools.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const roundTrip = (b: Board) => assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
const deck = (...slides: Slide[]): DeckData => ({ slides, current: 0 });
const slidesItem = (d: DeckData): Item => ({ ...createItem('slides', 0, 0), data: d });

// ---- Start object ("Open in") --------------------------------------------------------------------------
test('start object choices list format objects with readable labels', () => {
  const table = { ...createItem('table', 0, 0), text: 'Backlog' },
    doc = { ...createItem('doc', 0, 0), text: 'Doc' },
    kanban = { ...createItem('kanban', 0, 0), text: '' },
    note = createItem('note', 0, 0),
    hidden = { ...createItem('timeline', 0, 0), hidden: true };
  const b = board(table, note, doc, kanban, hidden);
  assert.deepEqual(
    startObjectChoices(b).map(c => c.label),
    ['Table · Backlog', 'Doc', 'Kanban'],
  );
  assert.equal(startObjectOf(b), undefined);
  const set = withSetting(b, 'startObject', doc.id);
  assert.equal(startObjectOf(set), doc.id);
  assert.equal(startObjectOf(withSetting(b, 'startObject', note.id)), undefined, 'a sticky note does not qualify');
  assert.equal(startObjectOf({ ...set, items: [table] }), undefined, 'a deleted object is ignored');
  assert.equal('startObject' in withSetting(set, 'startObject', null), false);
});

test('the start object setting round-trips and is validated; old boards load unchanged', () => {
  const doc = createItem('doc', 0, 0),
    b = withSetting(board(doc), 'startObject', doc.id);
  roundTrip(b);
  roundTrip(board(doc));
  assert.throws(() => validateBoardSettings({ ...b, startObject: 42 as unknown as string }), /start object/);
  assert.throws(() => validateBoardSettings({ ...b, startObject: '' }), /start object/);
  assert.throws(() => parseBoard(JSON.parse(JSON.stringify({ ...b, startObject: 'x'.repeat(101) }))));
});

// ---- Scale ------------------------------------------------------------------------------------------------
test('scale slides tally ratings locally and switch between 1–5 and 1–10', () => {
  const s = newSlide('scale');
  assert.deepEqual(s.scale, { max: 5, votes: [0, 0, 0, 0, 0] });
  let d = deck(s);
  d = rateScale(rateScale(rateScale(d, s.id, 4), s.id, 4), s.id, 2);
  assert.deepEqual(d.slides[0].scale!.votes, [0, 1, 0, 2, 0]);
  assert.deepEqual(scaleSummary(d.slides[0].scale!), { total: 3, average: 3.3 });
  assert.deepEqual(rateScale(d, s.id, 6).slides[0].scale, d.slides[0].scale, 'out of range ratings are ignored');
  assert.equal(rateScale(d, s.id, 1, -1).slides[0].scale!.votes[0], 0, 'tallies never go negative');
  assert.ok(hasResponses(d.slides[0]));
  const ten = setScaleMax(d, s.id, 10).slides[0].scale!;
  assert.equal(ten.max, 10);
  assert.equal(ten.votes.length, 10);
  assert.ok(ten.votes.every(v => v === 0));
  assert.deepEqual(scaleSummary(ten), { total: 0, average: 0 });
  assert.deepEqual(resetVotes(d, s.id).slides[0].scale!.votes, [0, 0, 0, 0, 0]);
  validateDeck(d);
  assert.throws(() => validateDeck(deck({ ...s, scale: { max: 5, votes: [1, 2] } })), /scale/);
  assert.throws(() => validateDeck(deck({ ...s, scale: { max: 7 as 5, votes: Array(7).fill(0) } })), /scale/);
});

// ---- Word cloud -------------------------------------------------------------------------------------------
test('word clouds group words ignoring case and spacing and size them by frequency', () => {
  const s = newSlide('wordcloud');
  let d = deck(s);
  for (const w of ['Calm', ' calm ', 'Busy', 'CALM', 'fun  times', 'Fun times', '   ']) d = addWord(d, s.id, w);
  const words = d.slides[0].words!;
  assert.deepEqual(words, [
    { text: 'Calm', count: 3 },
    { text: 'Busy', count: 1 },
    { text: 'fun times', count: 2 },
  ]);
  const layout = wordCloudLayout(words, 1, 5);
  assert.deepEqual(
    layout.map(w => w.text),
    ['Calm', 'fun times', 'Busy'],
  );
  assert.equal(layout[0].size, 5);
  assert.equal(layout[2].size, 1);
  assert.ok(layout[1].size > 1 && layout[1].size < 5);
  assert.deepEqual(wordCloudLayout([{ text: 'a', count: 2 }], 1, 5)[0].size, 3, 'a single size sits in the middle');
  assert.equal(addWord(d, s.id, 'x'.repeat(80)).slides[0].words!.at(-1)!.text.length, SLIDE_WORD_LEN);
  assert.deepEqual(
    removeWord(d, s.id, 'CALM').slides[0].words!.map(w => w.text),
    ['Busy', 'fun times'],
  );
  let full = deck({ ...s, words: Array.from({ length: SLIDE_WORDS_MAX }, (_, k) => ({ text: `w${k}`, count: 1 })) });
  full = addWord(full, s.id, 'new');
  assert.equal(full.slides[0].words!.length, SLIDE_WORDS_MAX, 'a full cloud ignores new words');
  validateDeck(d);
  assert.throws(
    () =>
      validateDeck(
        deck({
          ...s,
          words: [
            { text: 'a', count: 1 },
            { text: 'A', count: 1 },
          ],
        }),
      ),
    /word/,
  );
  assert.throws(() => validateDeck(deck({ ...s, words: [{ text: 'a', count: 0 }] })), /word/);
  assert.ok(slideText(d.slides[0]).includes('fun times'));
});

// ---- Open-ended -------------------------------------------------------------------------------------------
test('open-ended slides collect trimmed answers as a list', () => {
  const s = newSlide('answers');
  let d = deck(s);
  d = addAnswer(addAnswer(addAnswer(d, s.id, '  More demos '), s.id, ''), s.id, 'Shorter meetings');
  assert.deepEqual(
    d.slides[0].answers!.map(a => a.text),
    ['More demos', 'Shorter meetings'],
  );
  const first = d.slides[0].answers![0].id;
  assert.deepEqual(
    removeAnswer(d, s.id, first).slides[0].answers!.map(a => a.text),
    ['Shorter meetings'],
  );
  const full = deck({
    ...s,
    answers: Array.from({ length: SLIDE_ANSWERS_MAX }, (_, k) => ({ id: `a${k}`, text: 'x' })),
  });
  assert.equal(addAnswer(full, s.id, 'one more').slides[0].answers!.length, SLIDE_ANSWERS_MAX);
  const copy = duplicateSlide(d, 0).slides[1];
  assert.notEqual(copy.answers![0].id, first, 'duplicated answers get new ids');
  assert.deepEqual(resetVotes(d, s.id).slides[0].answers, []);
  validateDeck(d);
  assert.throws(() => validateDeck(deck({ ...s, answers: [{ id: 'a', text: '  ' }] })), /answers/);
});

test('switching layouts adds the fields the activity needs and decks round-trip through parseBoard', () => {
  let d = deck(newSlide('content'));
  const id = d.slides[0].id;
  d = setSlideLayout(d, id, 'scale');
  d = setSlideLayout(d, id, 'wordcloud');
  d = setSlideLayout(d, id, 'answers');
  assert.ok(d.slides[0].scale && d.slides[0].words && d.slides[0].answers);
  d = addWord(addAnswer(rateScale(d, id, 3), id, 'An answer'), id, 'Word');
  roundTrip(board(slidesItem(d)));
});

// ---- Slide sorter -----------------------------------------------------------------------------------------
test('reorderSlide moves a slide to a drop position and keeps it current', () => {
  const d = deck(
    newSlide('title', { title: 'A' }),
    newSlide('content', { title: 'B' }),
    newSlide('quote', { title: 'C' }),
  );
  const moved = reorderSlide(d, 0, 2);
  assert.deepEqual(
    moved.slides.map(s => s.title),
    ['B', 'C', 'A'],
  );
  assert.equal(moved.current, 2);
  assert.deepEqual(
    reorderSlide(d, 2, 0).slides.map(s => s.title),
    ['C', 'A', 'B'],
  );
  assert.equal(reorderSlide(d, 1, 1), d);
  assert.deepEqual(
    reorderSlide(d, 0, 99).slides.map(s => s.title),
    ['B', 'C', 'A'],
    'drop positions are clamped',
  );
});

test('gridStep moves through a slide grid with arrow keys, Home and End', () => {
  // 7 slides in 3 columns: 0 1 2 / 3 4 5 / 6
  assert.equal(gridStep(1, 7, 3, 'ArrowRight'), 2);
  assert.equal(gridStep(1, 7, 3, 'ArrowLeft'), 0);
  assert.equal(gridStep(1, 7, 3, 'ArrowDown'), 4);
  assert.equal(gridStep(4, 7, 3, 'ArrowUp'), 1);
  assert.equal(gridStep(4, 7, 3, 'ArrowDown'), null, 'no slide below');
  assert.equal(gridStep(0, 7, 3, 'ArrowLeft'), null);
  assert.equal(gridStep(3, 7, 3, 'End'), 6);
  assert.equal(gridStep(3, 7, 3, 'Home'), 0);
  assert.equal(gridStep(3, 7, 3, 'Enter'), null);
});

// ---- Slide images -----------------------------------------------------------------------------------------
test('slideSvg draws every layout as a 1920×1080 SVG with escaped text', () => {
  const layouts = [
    'title',
    'content',
    'section',
    'two',
    'quote',
    'blank',
    'activity',
    'scale',
    'wordcloud',
    'answers',
  ] as const;
  for (const layout of layouts) {
    const svg = slideSvg(newSlide(layout, { title: 'R&D <plan>' }), { index: 0, count: 3 });
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'), layout);
    assert.ok(svg.includes(`width="${SLIDE_PNG_W}" height="${SLIDE_PNG_H}"`), layout);
    assert.ok(svg.includes('R&amp;D &lt;plan&gt;'), `${layout} escapes its title`);
    assert.ok(!svg.includes('<plan>'), layout);
    assert.ok(svg.includes('1 / 3'), `${layout} shows the page number`);
    // Browsers refuse to decode an SVG image with a repeated attribute.
    for (const tag of svg.match(/<[a-z]+ [^>]*>/g) ?? []) {
      const names = [...tag.matchAll(/ ([a-z-]+)="/g)].map(a => a[1]);
      assert.equal(new Set(names).size, names.length, `${layout}: ${tag}`);
    }
  }
  let d = deck(newSlide('wordcloud'));
  d = addWord(addWord(addWord(d, d.slides[0].id, 'big'), d.slides[0].id, 'big'), d.slides[0].id, 'small');
  const cloud = slideSvg(d.slides[0]);
  const size = (word: string) => Number(new RegExp(`font-size="(\\d+)"[^>]*>${word}<`).exec(cloud)![1]);
  assert.ok(size('big') > size('small'), 'frequent words are larger');
  const dark = slideSvg(newSlide('section'));
  assert.ok(dark.includes('fill="#ffffff"'), 'dark slides use white text');
});

test('wrapText, file names and response lines', () => {
  const lines = wrapText('one two three four five six seven eight', 10, 60);
  assert.ok(lines.length > 1);
  assert.ok(lines.every(l => l.length <= Math.floor(60 / 5.4)));
  assert.equal(wrapText('a b c d e f g h', 10, 20, 2).length, 2);
  assert.ok(wrapText('a b c d e f g h', 10, 20, 2)[1].endsWith('…'));
  assert.equal(slidePngName('Q3 / review', 2, 12), 'Q3 review - slide 03.png');
  assert.equal(slidePngName('', 0, 150), 'Slides - slide 001.png');
  let d = deck(newSlide('scale'));
  d = rateScale(rateScale(d, d.slides[0].id, 5), d.slides[0].id, 3);
  assert.equal(responseLines(d.slides[0])[0], 'Scale 1–5: 2 ratings, average 4');
  assert.deepEqual(responseLines(addAnswer(deck(newSlide('answers')), 'x', 'n').slides[0]), []);
});
