// Presentation and facilitation gaps G1-G11: presenter notes, hidden slides, timer, voting rules,
// clustering, notes to doc, frame styles, comment polish, spinner and flip-card helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  pdfFrames,
  presentationFrames,
  slideFrames,
  frameNotes,
  isHiddenSlide,
  setFrameNotes,
  setHiddenSlide,
} from '../src/navigation.ts';
import { startVoting, castVote, endVoting, addThread, replyThread } from '../src/board-tools.ts';
import {
  parseClock,
  addTime,
  TIMER_MAX,
  votingExpired,
  votingTimeLeft,
  renameVotingResult,
  deleteVotingResult,
  editMessage,
  setPinned,
  toggleReaction,
  orderThreads,
  voteLabel,
} from '../src/facilitation-rules.ts';
import { tokenize, keywordClusters, clusterNotes, clusterSelection, colorName } from '../src/cluster.ts';
import { notesToMarkdown, notesToDoc } from '../src/notes.ts';
import { applyFrameStyle, removeFrameStyle, framePalettes, validateFrameData } from '../src/frame-styles.ts';
import {
  removePicked,
  fillFromPeople,
  peopleNames,
  shuffleFlipCards,
  randomIndex,
} from '../src/facilitation-widgets.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const at = (type: Parameters<typeof createItem>[0], x: number, y: number, extra: Partial<Item> = {}): Item => ({
  ...createItem(type, x, y),
  ...extra,
});
/** Deterministic random source cycling through the given values. */
const seq = (...values: number[]) => {
  let k = 0;
  return (buf: Uint32Array) => {
    buf[0] = values[k++ % values.length];
    return buf;
  };
};

// ---- G1, G2 presenter notes and hidden frames ------------------------------------------------------
test('presenter notes and hidden frames are stored on the frame and survive validation', () => {
  const a = at('frame', 0, 0, { id: 'a', text: 'Intro' }),
    b = at('frame', 900, 0, { id: 'b', text: 'Details' }),
    c = at('frame', 1800, 0, { id: 'c', text: 'Outro' });
  let doc = board(a, b, c);
  doc = setFrameNotes(doc, 'a', 'Welcome everyone.\nMention the agenda.');
  doc = setHiddenSlide(doc, 'b', true);
  const parsed = parseBoard(JSON.parse(JSON.stringify(doc)));
  const byId = (id: string) => parsed.items.find(i => i.id === id)!;
  assert.equal(frameNotes(byId('a')), 'Welcome everyone.\nMention the agenda.');
  assert.equal(isHiddenSlide(byId('b')), true);
  assert.deepEqual(
    presentationFrames(parsed).map(f => f.id),
    ['a', 'b', 'c'],
    'the panel still lists hidden frames',
  );
  assert.deepEqual(
    slideFrames(parsed).map(f => f.id),
    ['a', 'c'],
    'presenting skips hidden frames',
  );
  // PDF export keeps hidden frames (decision Q7); a selection of frames still wins.
  assert.deepEqual(
    pdfFrames(parsed, []).map(f => f.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    pdfFrames(parsed, ['c', 'x']).map(f => f.id),
    ['c'],
  );
  // Clearing removes the keys and the empty data object.
  doc = setHiddenSlide(setFrameNotes(doc, 'a', '   '), 'b', false);
  assert.equal(doc.items.find(i => i.id === 'a')!.data, undefined);
  assert.equal(doc.items.find(i => i.id === 'b')!.data, undefined);
});

test('presenter notes respect locks and limits; invalid frame data is rejected', () => {
  const f = at('frame', 0, 0, { id: 'f', locked: true });
  assert.throws(() => setFrameNotes(board(f), 'f', 'x'), /Unlock/);
  assert.throws(() => setFrameNotes(board({ ...f, locked: false }), 'f', 'x'.repeat(10001)), /10,000/);
  assert.throws(() => setHiddenSlide(board(at('note', 0, 0, { id: 'n' })), 'n', true), /frame/);
  for (const data of [
    { notes: 5 },
    { skipInPresentation: 'yes' },
    { other: true },
    { notes: 'x'.repeat(10001) },
    { style: { id: 'nope', prev: {} } },
    { style: { id: 'ocean', prev: { a: { fill: 'red' } } } },
  ])
    assert.throws(() => validateFrameData(data), /Invalid frame settings/, JSON.stringify(data).slice(0, 60));
  validateFrameData({ contentHidden: true, notes: 'ok', skipInPresentation: true });
});

// ---- G4 timer -------------------------------------------------------------------------------------
test('timer accepts exact mm:ss and adds time while running', () => {
  assert.equal(parseClock('7:30'), 450000);
  assert.equal(parseClock('07:05'), 425000);
  assert.equal(parseClock('12'), 720000);
  assert.equal(parseClock('99:59'), TIMER_MAX);
  for (const bad of ['', '0', '0:00', '1:60', 'abc', '100', '1:2:3', '-1']) assert.equal(parseClock(bad), null, bad);
  const now = 1_000_000;
  const running = { duration: 60000, endsAt: now + 30000, remaining: 60000 };
  assert.equal(addTime(running, 60000, now).endsAt, now + 90000);
  const paused = { duration: 60000, endsAt: null, remaining: 20000 };
  assert.deepEqual(addTime(paused, 300000, now), { duration: 320000, endsAt: null, remaining: 320000 });
  assert.equal(addTime({ ...running, endsAt: now + TIMER_MAX - 1000 }, 300000, now).endsAt, now + TIMER_MAX);
});

// ---- G5 voting --------------------------------------------------------------------------------------
test('timed voting ends, one vote per object is enforced, and results can be renamed or deleted', () => {
  const a = at('note', 0, 0, { id: 'a', text: 'Alpha' }),
    b = at('note', 300, 0, { id: 'b', text: 'Beta' });
  const t0 = Date.parse('2026-01-01T10:00:00Z');
  let doc = startVoting(board(a, b), ['a', 'b'], 3, { minutes: 5, onePerObject: true }, t0);
  assert.equal(doc.voting!.endsAt, '2026-01-01T10:05:00.000Z');
  assert.equal(doc.voting!.onePerObject, true);
  doc = castVote(doc, 'a', 1, t0 + 1000);
  assert.throws(() => castVote(doc, 'a', 1, t0 + 2000), /one vote per object/);
  doc = castVote(doc, 'b', 1, t0 + 2000);
  assert.equal(votingTimeLeft(doc, t0 + 60000), 240000);
  assert.equal(votingExpired(doc, t0 + 299999), false);
  assert.equal(votingExpired(doc, t0 + 300000), true);
  assert.throws(() => castVote(doc, 'a', -1, t0 + 300000), /time is over/);
  parseBoard(JSON.parse(JSON.stringify(doc)));
  assert.throws(
    () => parseBoard({ ...doc, voting: { ...doc.voting!, votes: { a: 2 } } }),
    /Invalid voting session/,
    'one-per-object sessions cannot hold two votes on an object',
  );
  assert.throws(() => startVoting(board(a), ['a'], 3, { minutes: -1 }), /voting time/);
  // Untimed sessions without the rule behave as before.
  let plain = startVoting(board(a, b), ['a', 'b'], 2);
  assert.equal(plain.voting!.endsAt, undefined);
  plain = castVote(castVote(plain, 'a', 1), 'a', 1);
  assert.equal(plain.voting!.votes.a, 2);

  let done = endVoting(doc, voteLabel).board;
  done = endVoting(startVoting(done, ['a'], 1), voteLabel).board;
  assert.equal(done.votingResults!.length, 2);
  done = renameVotingResult(done, 0, '  Round   one ');
  assert.equal(done.votingResults![0].name, 'Round one');
  parseBoard(JSON.parse(JSON.stringify(done)));
  done = renameVotingResult(done, 0, '');
  assert.equal('name' in done.votingResults![0], false);
  done = deleteVotingResult(done, 1);
  assert.equal(done.votingResults!.length, 1);
  done = deleteVotingResult(done, 0);
  assert.equal(done.votingResults, undefined);
  assert.throws(() => deleteVotingResult(done, 0), /no longer exists/);
  assert.throws(() => parseBoard({ ...doc, votingResults: [{ endedAt: '', budget: 1, totals: [], name: 5 }] }));
});

// ---- G6 clustering ----------------------------------------------------------------------------------
test('tokenize drops stop words, short words and numbers and folds plurals and accents', () => {
  assert.deepEqual(tokenize('The onboarding emails are TOO long, and 2024 Café tables'), [
    'onboarding',
    'email',
    'long',
    'cafe',
    'table',
  ]);
  assert.deepEqual(tokenize('Stories about status'), ['story', 'status']);
});

test('keyword clustering is deterministic and groups notes by shared terms', () => {
  const notes = [
    { id: '1', text: 'Onboarding emails are confusing' },
    { id: '2', text: 'Pricing page is unclear' },
    { id: '3', text: 'Too many onboarding steps' },
    { id: '4', text: 'Pricing tiers overlap' },
    { id: '5', text: 'Onboarding video is great' },
    { id: '6', text: 'Dark mode please' },
  ];
  const expected = [
    { title: 'Onboarding', ids: ['1', '3', '5'] },
    { title: 'Pricing', ids: ['2', '4'] },
    { title: 'Other', ids: ['6'] },
  ];
  assert.deepEqual(keywordClusters(notes), expected);
  assert.deepEqual(keywordClusters([...notes]), expected, 'same input, same output');
  // Ties are broken alphabetically, not by input order.
  assert.deepEqual(
    keywordClusters([
      { id: 'a', text: 'zebra apple' },
      { id: 'b', text: 'apple zebra' },
    ]).map(c => c.title),
    ['Apple'],
  );
});

test('clustering by colour, tag and author keeps reading order', () => {
  const n = (id: string, x: number, y: number, extra: Partial<Item>) => at('note', x, y, { id, ...extra });
  const doc = board(
    n('a', 300, 0, { fill: '#a8cdff', tags: ['ux'], author: 'Sam' }),
    n('b', 0, 0, { fill: '#fff49b', author: 'Alex' }),
    n('c', 0, 300, { fill: '#a8cdff', tags: ['ux', 'bug'] }),
  );
  assert.deepEqual(clusterNotes(doc, ['a', 'b', 'c'], 'color'), [
    { title: 'Light yellow', ids: ['b'] },
    { title: 'Light blue', ids: ['a', 'c'] },
  ]);
  assert.deepEqual(clusterNotes(doc, ['a', 'b', 'c'], 'tag'), [
    { title: 'No tag', ids: ['b'] },
    { title: '#ux', ids: ['a', 'c'] },
  ]);
  assert.deepEqual(
    clusterNotes(doc, ['a', 'b', 'c'], 'author').map(c => c.title),
    ['Alex', 'Sam', 'No author'],
  );
  assert.equal(colorName('#ABCDEF'), '#abcdef');
});

test('clusterSelection lays clusters out in titled columns in one change and skips locked notes', () => {
  const notes = [
    at('note', 500, 500, { id: 'a', fill: '#a8cdff' }),
    at('note', 900, 100, { id: 'b', fill: '#fff49b' }),
    at('note', 100, 900, { id: 'c', fill: '#a8cdff' }),
    at('note', 100, 100, { id: 'd', fill: '#fff49b', locked: true }),
  ];
  const r = clusterSelection(board(...notes), ['a', 'b', 'c', 'd'], 'color');
  assert.deepEqual(
    r.clusters.map(c => c.ids),
    [['b'], ['a', 'c']],
  );
  assert.equal(r.titleIds.length, 2);
  const get = (id: string) => r.board.items.find(i => i.id === id)!;
  const titles = r.titleIds.map(get);
  assert.deepEqual(
    titles.map(t => t.text),
    ['Light yellow (1)', 'Light blue (2)'],
  );
  assert.ok(titles.every(t => t.type === 'frame' && t.y === 100));
  // Cluster frames start at the selection's top-left; notes sit inside them, stacked.
  assert.equal(titles[0].x, 100);
  assert.equal(get('b').x, 124);
  assert.equal(get('a').x, get('c').x);
  assert.ok(get('a').x > get('b').x);
  assert.ok(get('a').y > titles[1].y && get('c').y >= get('a').y + get('a').h);
  assert.deepEqual(get('d'), notes[3], 'locked note untouched');
  parseBoard(JSON.parse(JSON.stringify(r.board)));
  assert.throws(() => clusterSelection(board(notes[0]), ['a'], 'color'), /at least two/);
});

// ---- G7 notes to doc ----------------------------------------------------------------------------------
test('notes become a Markdown outline grouped by colour or frame', () => {
  const frame = at('frame', 0, 0, { id: 'f', text: 'Ideas', w: 1000, h: 600 });
  const doc = board(
    frame,
    at('note', 400, 100, { id: 'b', text: 'Second\nline', fill: '#fff49b' }),
    at('note', 100, 100, { id: 'a', text: 'First', fill: '#a8cdff', tags: ['ux'] }),
    at('note', 100, 900, { id: 'c', text: '', fill: '#a8cdff' }),
  );
  assert.equal(
    notesToMarkdown(doc, ['a', 'b', 'c'], 'color'),
    '# Notes summary\n\n## Light blue\n\n- First #ux\n- (empty note)\n\n## Light yellow\n\n- Second line\n',
  );
  assert.equal(
    notesToMarkdown(doc, ['a', 'b', 'c'], 'frame'),
    '# Notes summary\n\n## Ideas\n\n- First #ux\n- Second line\n\n## Not in a frame\n\n- (empty note)\n',
  );
  const r = notesToDoc(doc, ['a', 'b', 'c'], 'frame');
  const created = r.board.items.find(i => i.id === r.docId)!;
  assert.equal(created.type, 'doc');
  assert.match(created.data!.markdown, /## Ideas/);
  assert.equal(created.x, 400 + 210 + 80);
  parseBoard(JSON.parse(JSON.stringify(r.board)));
  assert.throws(() => notesToMarkdown(doc, ['f'], 'color'), /Select sticky notes/);
});

// ---- G8 frame styles ----------------------------------------------------------------------------------
test('frame styles recolour contents and removing the style restores the previous colours', () => {
  const frame = at('frame', 0, 0, { id: 'f', w: 1000, h: 800 });
  const items = [
    frame,
    at('note', 10, 10, { id: 'n1', fill: '#fff49b' }),
    at('note', 300, 10, { id: 'n2', fill: '#a8cdff' }),
    at('note', 600, 10, { id: 'n3', fill: '#fff49b' }),
    at('rectangle', 10, 400, { id: 's1', fill: '#ffffff', style: { borderColor: '#000000', borderWidth: 2 } }),
    at('ellipse', 400, 400, { id: 's2', fill: '#e4e4e7' }),
    at('text', 10, 700, { id: 't', fill: '#25252a' }),
    at('note', 700, 400, { id: 'locked', fill: '#ffa0a7', locked: true }),
    at('note', 2000, 0, { id: 'outside', fill: '#ffa0a7' }),
  ];
  const before = board(...items);
  const ocean = framePalettes.find(p => p.id === 'ocean')!;
  const styled = applyFrameStyle(before, ['f'], 'ocean');
  const get = (b: Board, id: string) => b.items.find(i => i.id === id)!;
  assert.equal(get(styled, 'f').fill, ocean.frame);
  assert.equal(get(styled, 'n1').fill, ocean.notes[0]);
  assert.equal(get(styled, 'n2').fill, ocean.notes[1]);
  assert.equal(get(styled, 'n3').fill, ocean.notes[0], 'same original colour, same new colour');
  assert.equal(get(styled, 's1').style!.borderColor, ocean.border);
  assert.equal(get(styled, 's1').style!.borderWidth, 2);
  assert.equal(get(styled, 't').fill, ocean.text);
  assert.equal(get(styled, 'locked').fill, '#ffa0a7');
  assert.equal(get(styled, 'outside').fill, '#ffa0a7');
  parseBoard(JSON.parse(JSON.stringify(styled)));
  // A second palette maps from the original colours, and removal still restores the originals.
  const night = applyFrameStyle(styled, ['f'], 'night');
  assert.equal(get(night, 'n2').fill, framePalettes.find(p => p.id === 'night')!.notes[1]);
  const restored = removeFrameStyle(night, ['f']);
  assert.deepEqual(restored.items, before.items);
  assert.throws(() => removeFrameStyle(restored, ['f']), /no style/);
  assert.throws(() => applyFrameStyle(before, ['n1'], 'ocean'), /unlocked frame/);
  assert.throws(() => applyFrameStyle(before, ['f'], 'nope'), /Unknown/);
});

// ---- G9 comments ------------------------------------------------------------------------------------
test('comment messages can be edited, reacted to and threads pinned', () => {
  let doc = addThread(board(), { x: 0, y: 0 }, 'First').board;
  doc = addThread(doc, { x: 10, y: 0 }, 'Second').board;
  const [t1, t2] = doc.comments!;
  doc = replyThread(doc, t1.id, 'Reply');
  const m = doc.comments![0].messages[0];
  doc = editMessage(doc, t1.id, m.id, '  First, edited  ', new Date('2026-02-02T00:00:00Z'));
  assert.equal(doc.comments![0].messages[0].text, 'First, edited');
  assert.equal(doc.comments![0].messages[0].editedAt, '2026-02-02T00:00:00.000Z');
  assert.equal(doc.comments![0].messages[1].editedAt, undefined);
  assert.equal(
    editMessage(doc, t1.id, m.id, 'First, edited', new Date('2026-03-03T00:00:00Z')).comments![0].messages[0].editedAt,
    '2026-02-02T00:00:00.000Z',
    'saving unchanged text keeps the edit time',
  );
  assert.throws(() => editMessage(doc, t1.id, m.id, '  '), /cannot be empty/);
  assert.throws(() => editMessage(doc, t1.id, 'missing', 'x'), /no longer exists/);
  doc = toggleReaction(doc, t1.id, m.id, '👍');
  doc = toggleReaction(doc, t1.id, m.id, '🎉');
  assert.deepEqual(doc.comments![0].messages[0].reactions, ['👍', '🎉']);
  doc = toggleReaction(doc, t1.id, m.id, '👍');
  assert.deepEqual(doc.comments![0].messages[0].reactions, ['🎉']);
  assert.throws(() => toggleReaction(doc, t1.id, m.id, '<b>'), /offered reactions/);
  doc = setPinned(doc, t2.id, true);
  assert.deepEqual(
    orderThreads(doc.comments!).map(t => t.id),
    [t2.id, t1.id],
  );
  parseBoard(JSON.parse(JSON.stringify(doc)));
  doc = setPinned(doc, t2.id, false);
  assert.equal('pinned' in doc.comments![1], false);
  const bad = (patch: object) => ({
    ...doc,
    comments: [{ ...doc.comments![0], messages: [{ ...doc.comments![0].messages[0], ...patch }] }],
  });
  assert.throws(() => parseBoard(bad({ reactions: ['👍', '👍'] })), /reactions/);
  assert.throws(() => parseBoard(bad({ reactions: ['x'] })), /reactions/);
  assert.throws(() => parseBoard(bad({ editedAt: 'yesterday' })), /comments/);
  assert.throws(() => parseBoard({ ...doc, comments: [{ ...doc.comments![0], pinned: 'yes' }] }), /comments/);
});

// ---- G11 spinner and flip cards -------------------------------------------------------------------
test('spinner removes the picked option and fills from People widgets', () => {
  assert.deepEqual(removePicked({ options: ['A', 'B', 'C'], result: 'B' }), { options: ['A', 'C'] });
  assert.throws(() => removePicked({ options: ['A', 'B'] }), /Spin/);
  assert.throws(() => removePicked({ options: ['A'], result: 'A' }), /at least one/);
  const people = at('people', 0, 0, {
    data: {
      title: 'Team',
      members: [
        { id: '1', name: 'Alex', color: '#4262ff' },
        { id: '2', name: 'sam', color: '#4262ff' },
      ],
    },
  });
  const card = at('usercard', 0, 300, { data: { name: 'Sam', role: '', email: '', team: '', color: '#4262ff' } });
  const card2 = at('usercard', 0, 600, { data: { name: 'Riley', role: '', email: '', team: '', color: '#4262ff' } });
  assert.deepEqual(peopleNames(board(people, card, card2)), ['Alex', 'sam', 'Riley']);
  assert.deepEqual(fillFromPeople(board(people)), { options: ['Alex', 'sam'] });
  assert.throws(() => fillFromPeople(board()), /People/);
});

test('shuffling flip cards permutes their positions and shows the fronts', () => {
  const cards = [0, 1, 2].map(k => at('flipcard', k * 300, 0, { id: `c${k}`, data: { back: 'b', flipped: k === 1 } }));
  const locked = at('flipcard', 900, 0, { id: 'L', locked: true, data: { back: '', flipped: true } });
  const doc = board(...cards, locked);
  // With a fixed source the permutation is reproducible.
  const r = shuffleFlipCards(doc, ['c0', 'c1', 'c2', 'L'], seq(0, 0));
  const xs = ['c0', 'c1', 'c2'].map(id => r.items.find(i => i.id === id)!.x);
  assert.deepEqual(
    [...xs].sort((a, b) => a - b),
    [0, 300, 600],
  );
  assert.deepEqual(xs, [300, 600, 0]);
  assert.ok(['c0', 'c1', 'c2'].every(id => r.items.find(i => i.id === id)!.data!.flipped === false));
  assert.deepEqual(
    r.items.find(i => i.id === 'L'),
    locked,
  );
  assert.throws(() => shuffleFlipCards(doc, ['c0'], seq(0)), /at least two/);
  assert.equal(randomIndex(3, seq(5)), 2);
});
