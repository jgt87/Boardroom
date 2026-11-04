// Track R4: presentation polish, record view extras, Doc shortcuts, deep links, frame copies and comment extras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, CommentThread, RecordRow } from '../src/model.ts';
import { slideObjectAt, slideObjects } from '../src/presentation-tools.ts';
import { validateDeck, newSlide } from '../src/specs-activities.ts';
import type { DeckData } from '../src/specs-activities.ts';
import {
  formatFieldNumber,
  recordColors,
  ruleColor,
  validateRecordSchema,
  defaultSchema,
} from '../src/record-schema.ts';
import type { RecordField } from '../src/record-schema.ts';
import { toggleHiddenColumn, validateRecordView } from '../src/record-query.ts';
import { barSide, jumpToRecord, timelineAxis } from '../src/timeline-axis.ts';
import { docShortcut, docShortcutHelp, emojiQuery } from '../src/doc-tools.ts';
import { deepLinkHash, deepLinkUrl, parseDeepLink } from '../src/deep-link.ts';
import { copyFrame, shuffleFrameStyle, FRAME_COPIES_MAX } from '../src/frame-tools.ts';
import { frameStyleOf } from '../src/frame-styles.ts';
import {
  commentColors,
  isUnread,
  readStoredMap,
  setCommentColor,
  threadUpdatedAt,
  votingResultText,
  withDraft,
} from '../src/facilitation-rules.ts';

const row = (patch: Partial<RecordRow> = {}): RecordRow => ({
  id: 'r1',
  title: 'Task',
  status: 'Not started',
  assignee: '',
  start: '',
  end: '',
  ...patch,
});

// ---- Presentation -------------------------------------------------------------------------------------
test('slide objects are those centred in the frame; the topmost one is picked for zoom', () => {
  const frame = { ...createItem('frame', 0, 0), w: 400, h: 300 },
    a = { ...createItem('note', 20, 20), w: 100, h: 100 },
    b = { ...createItem('rectangle', 60, 60), w: 100, h: 100 },
    out = createItem('note', 900, 900),
    hidden = { ...createItem('note', 30, 30), hidden: true };
  const board: Board = { ...newBoard(), items: [frame, a, b, out, hidden] };
  assert.deepEqual(
    slideObjects(board, frame).map(i => i.id),
    [a.id, b.id],
  );
  assert.equal(slideObjectAt(board, frame, { x: 80, y: 80 })?.id, b.id);
  assert.equal(slideObjectAt(board, frame, { x: 30, y: 30 })?.id, a.id);
  assert.equal(slideObjectAt(board, frame, { x: 390, y: 290 }), null);
});

test('slides keep optional presenter notes, validated by length', () => {
  const deck: DeckData = { slides: [{ ...newSlide('content'), notes: 'Say hello' }], current: 0 };
  validateDeck(deck);
  assert.throws(() => validateDeck({ ...deck, slides: [{ ...deck.slides[0], notes: 'x'.repeat(2001) }] }));
  validateDeck({ slides: [newSlide('title')], current: 0 });
});

// ---- Records ------------------------------------------------------------------------------------------
test('record colour is optional and validated on load', () => {
  const board = parseBoard({
    ...newBoard(),
    datasets: { d: [row({ color: recordColors[0].value })] },
  });
  assert.equal(board.datasets!.d[0].color, recordColors[0].value);
  assert.throws(() => parseBoard({ ...newBoard(), datasets: { d: [row({ color: 'red' })] } }));
  assert.equal(parseBoard({ ...newBoard(), datasets: { d: [row()] } }).datasets!.d[0].color, undefined);
});

test('hidden Kanban columns toggle and validate', () => {
  let view = toggleHiddenColumn({}, 'Complete');
  assert.deepEqual(view.hiddenColumns, ['Complete']);
  view = toggleHiddenColumn(view, '');
  assert.deepEqual(view.hiddenColumns, ['Complete', '']);
  validateRecordView(view, defaultSchema);
  view = toggleHiddenColumn(toggleHiddenColumn(view, 'Complete'), '');
  assert.equal('hiddenColumns' in view, false);
  assert.throws(() => validateRecordView({ hiddenColumns: ['a', 'a'] }, defaultSchema));
  assert.throws(() => validateRecordView({ hiddenColumns: [3 as unknown as string] }, defaultSchema));
});

test('number formats, progress colour and conditional colour rules', () => {
  const field: RecordField = {
    id: 'f',
    name: 'Budget',
    type: 'number',
    format: 'currency',
    currency: 'EUR',
    display: 'progress',
    color: '#2fb36b',
    hideLabel: true,
    rules: [
      { op: 'gt', value: 1000, color: '#f0524f' },
      { op: 'lte', value: 10, color: '#4262ff' },
    ],
  };
  validateRecordSchema({ ...defaultSchema, fields: [field] });
  assert.match(formatFieldNumber(field, 1200), /1,200\.00/);
  assert.equal(formatFieldNumber({ format: 'percent' }, 45.5), '45.5%');
  assert.equal(formatFieldNumber({}, 3), '3');
  assert.equal(formatFieldNumber({ format: 'percent' }, null), '—');
  assert.equal(ruleColor(field, 1200), '#f0524f');
  assert.equal(ruleColor(field, 10), '#4262ff');
  assert.equal(ruleColor(field, 500), undefined);
  assert.equal(ruleColor(field, null), undefined);
  const bad = (patch: Partial<RecordField>) =>
    assert.throws(() => validateRecordSchema({ ...defaultSchema, fields: [{ ...field, ...patch }] }));
  bad({ currency: 'euro' });
  bad({ format: 'percent' }); // a currency code without the currency format
  bad({ rules: [{ op: 'near' as 'gt', value: 1, color: '#000000' }] });
  bad({ rules: Array.from({ length: 11 }, () => ({ op: 'gt' as const, value: 1, color: '#000000' })) });
  bad({ display: undefined }); // hide label needs the progress display
  assert.throws(() =>
    validateRecordSchema({ ...defaultSchema, fields: [{ id: 't', name: 'Text', type: 'text', format: 'percent' }] }),
  );
});

test('Timeline jump brings an out-of-view bar into the range and keeps its length', () => {
  const settings = { start: '2026-01-01', end: '2026-01-31' };
  const axis = timelineAxis([], settings, 600);
  const late = row({ start: '2026-06-10', end: '2026-06-12' });
  assert.equal(barSide(late, axis), 'after');
  assert.equal(barSide(row({ start: '2025-01-01', end: '2025-01-02' }), axis), 'before');
  assert.equal(barSide(row({ start: '2026-01-05', end: '2026-01-06' }), axis), 'inside');
  assert.equal(barSide(row(), axis), null);
  const jumped = jumpToRecord(settings, axis, late);
  const next = timelineAxis([], jumped, 600);
  assert.equal(barSide(late, next), 'inside');
  assert.equal(next.max - next.min, axis.max - axis.min);
  assert.equal(jumpToRecord(settings, axis, row()), settings);
});

// ---- Docs ---------------------------------------------------------------------------------------------
test('Ctrl+Alt+4–6 make lists; :name starts emoji completion', () => {
  const key = (k: string) => ({
    key: k,
    code: `Digit${k}`,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: true,
  });
  assert.deepEqual(docShortcut(key('4')), { kind: 'list', list: 'bullet' });
  assert.deepEqual(docShortcut(key('5')), { kind: 'list', list: 'number' });
  assert.deepEqual(docShortcut(key('6')), { kind: 'list', list: 'check' });
  assert.deepEqual(docShortcut(key('2')), { kind: 'block', block: 'h2' });
  assert.equal(docShortcut({ ...key('7'), code: 'Digit7' }), null);
  assert.ok(docShortcutHelp.some(([k]) => k === 'Ctrl+Alt+6'));
  assert.deepEqual(emojiQuery('Great work :thumbs'), { query: 'thumbs', length: 7 });
  assert.deepEqual(emojiQuery(':red_heart'), { query: 'red heart', length: 10 });
  assert.equal(emojiQuery('time 10:30'), null);
  assert.equal(emojiQuery('a :b'), null);
});

// ---- Deep links ---------------------------------------------------------------------------------------
test('deep links round-trip and reject unsafe ids', () => {
  const link = { board: 'b-1', object: '9f0c1d2e-aaaa-bbbb-cccc-111122223333', focus: true };
  assert.deepEqual(parseDeepLink(deepLinkHash(link)), link);
  assert.deepEqual(parseDeepLink('#object=abc'), { object: 'abc' });
  assert.deepEqual(parseDeepLink('#board=abc&focus=1'), { board: 'abc' });
  assert.equal(parseDeepLink(''), null);
  assert.equal(parseDeepLink('#object=%3Cscript%3E'), null);
  assert.equal(parseDeepLink('#other=1'), null);
  assert.equal(
    deepLinkUrl('http://192.168.1.52:5173/?x=1#old', { object: 'abc' }),
    'http://192.168.1.52:5173/#object=abc',
  );
});

// ---- Facilitation ----------------------------------------------------------------------------------------
test('copying a frame N times copies its contents in a row and names the copies', () => {
  const frame = { ...createItem('frame', 0, 0), w: 400, h: 300, text: 'Round' },
    note = createItem('note', 50, 50),
    outside = createItem('note', 1000, 1000);
  const board: Board = { ...newBoard(), items: [frame, note, outside] };
  const r = copyFrame(board, frame.id, 3);
  assert.equal(r.frames.length, 3);
  assert.equal(r.board.items.length, 3 + 6);
  const copies = r.frames.map(id => r.board.items.find(i => i.id === id)!);
  assert.deepEqual(
    copies.map(c => c.text),
    ['Round 2', 'Round 3', 'Round 4'],
  );
  assert.deepEqual(
    copies.map(c => c.x),
    [480, 960, 1440],
  );
  assert.equal(r.board.items.filter(i => i.type === 'note' && i.x === 50 + 480).length, 1);
  assert.throws(() => copyFrame(board, frame.id, FRAME_COPIES_MAX + 1));
  assert.throws(() => copyFrame(board, note.id, 1));
  parseBoard(r.board);
});

test('shuffling a frame style picks a different palette', () => {
  const frame = createItem('frame', 0, 0),
    board: Board = { ...newBoard(), items: [frame, createItem('note', 20, 20)] };
  const once = shuffleFrameStyle(board, [frame.id], b => ((b[0] = 0), b));
  const first = frameStyleOf(once.items[0])!.id;
  const twice = shuffleFrameStyle(once, [frame.id], b => ((b[0] = 0), b));
  assert.notEqual(frameStyleOf(twice.items[0])!.id, first);
});

test('voting results become ranked text', () => {
  const text = votingResultText({
    endedAt: '2026-11-04T10:00:00.000Z',
    budget: 3,
    name: 'Ideas',
    totals: [
      { id: 'a', label: 'Alpha', votes: 3 },
      { id: 'b', label: 'Beta', votes: 1 },
    ],
  });
  assert.equal(text, 'Ideas\n1. Alpha — 3 votes\n2. Beta — 1 vote');
  assert.match(votingResultText({ endedAt: '2026-11-04T10:00:00.000Z', budget: 1, totals: [] }), /2026-11-04/);
});

// ---- Comments -----------------------------------------------------------------------------------------
const thread = (patch: Partial<CommentThread> = {}): CommentThread => ({
  id: 't1',
  x: 0,
  y: 0,
  messages: [{ id: 'm1', text: 'Hi', at: '2026-11-04T10:00:00.000Z' }],
  ...patch,
});
test('comment colour is optional, offered colours only', () => {
  const board: Board = { ...newBoard(), comments: [thread()] };
  const coloured = setCommentColor(board, 't1', commentColors[2].value);
  assert.equal(parseBoard(coloured).comments![0].color, commentColors[2].value);
  assert.equal('color' in setCommentColor(coloured, 't1', null).comments![0], false);
  assert.throws(() => setCommentColor(board, 't1', '#123456'));
  assert.throws(() => parseBoard({ ...board, comments: [thread({ color: '#123456' })] }));
});

test('unread state and drafts are kept per device', () => {
  const t = thread({
    messages: [
      { id: 'm1', text: 'Hi', at: '2026-11-04T10:00:00.000Z' },
      { id: 'm2', text: 'Re', at: '2026-11-04T09:00:00.000Z', editedAt: '2026-11-04T11:00:00.000Z' },
    ],
  });
  assert.equal(threadUpdatedAt(t), Date.parse('2026-11-04T11:00:00.000Z'));
  assert.equal(isUnread(t, {}), true);
  assert.equal(isUnread(t, { t1: Date.parse('2026-11-04T11:00:00.000Z') }), false);
  assert.equal(isUnread({ ...t, resolved: true }, {}), false);
  assert.deepEqual(readStoredMap('{"a":1,"b":"x","c":2}', 'number'), { a: 1, c: 2 });
  assert.deepEqual(readStoredMap('not json', 'string'), {});
  assert.deepEqual(readStoredMap('[1]', 'string'), {});
  let drafts = withDraft({}, 't1', 'Half a thought');
  assert.deepEqual(drafts, { t1: 'Half a thought' });
  drafts = withDraft(drafts, 't1', '   ');
  assert.deepEqual(drafts, {});
  let many: Record<string, string> = {};
  for (let k = 0; k < 120; k++) many = withDraft(many, `k${k}`, 'x');
  assert.equal(Object.keys(many).length, 100);
  assert.equal(many.k119, 'x');
  assert.equal(many.k0, undefined);
});
