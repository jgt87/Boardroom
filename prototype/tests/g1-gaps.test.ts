// Gaps D14 (code block size and line numbers), I3 (status chips on record views), R6a-Q1 (clear formatting)
// and F8/Q2 (reduce motion pauses animated GIFs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  CODE_FONT_DEFAULT,
  codeFontSize,
  codeLineNumbers,
  splitHighlightedLines,
  stepCodeFont,
  validateCodeData,
  withCodeOptions,
} from '../src/code-lines.ts';
import { clearStyles, normalizeSpans } from '../src/rich-text.ts';
import type { TextSpan } from '../src/rich-text.ts';
import { dataUrlBytes, gifFrameCount, isAnimatedGif } from '../src/gif.ts';
import { nextItemStatus, withItemStatus } from '../src/board-settings.ts';

const boardWith = (...items: Item[]): Board => ({ ...newBoard(), items });

// ---- D14: code blocks ----------------------------------------------------------------------------------

test('code options default to 13 px with line numbers, and defaults are not stored', () => {
  const code = createItem('code', 0, 0);
  assert.equal(codeFontSize(code), CODE_FONT_DEFAULT);
  assert.equal(codeLineNumbers(code), true);
  const data = withCodeOptions(undefined, { fontSize: 18, lineNumbers: false });
  assert.deepEqual(data, { fontSize: 18, lineNumbers: false });
  assert.equal(codeFontSize({ data }), 18);
  assert.equal(codeLineNumbers({ data }), false);
  assert.equal(withCodeOptions(data, { fontSize: CODE_FONT_DEFAULT, lineNumbers: true }), undefined);
  assert.deepEqual(withCodeOptions({ other: 1 }, { lineNumbers: true }), { other: 1 });
});

test('code font steps through the offered sizes and stops at the ends', () => {
  assert.equal(stepCodeFont(13, 1), 14);
  assert.equal(stepCodeFont(13, -1), 12);
  assert.equal(stepCodeFont(10, -1), 10);
  assert.equal(stepCodeFont(32, 1), 32);
  assert.equal(stepCodeFont(15, 1), 16);
});

test('parseBoard accepts valid code options and rejects bad ones', () => {
  const code = { ...createItem('code', 0, 0), data: { fontSize: 20, lineNumbers: false } };
  assert.deepEqual(parseBoard(boardWith(code)).items[0].data, { fontSize: 20, lineNumbers: false });
  assert.equal(parseBoard(boardWith(createItem('code', 0, 0))).items[0].data, undefined);
  for (const data of [{ fontSize: 9 }, { fontSize: 33 }, { fontSize: 12.5 }, { fontSize: '12' }, { lineNumbers: 1 }])
    assert.throws(() => parseBoard(boardWith({ ...createItem('code', 0, 0), data })), /code block options/);
  assert.throws(() => validateCodeData([]), /code block options/);
});

test('highlighted HTML splits into well-formed lines, reopening spans that cross a line break', () => {
  const html = 'a\n<span class="token comment">/* one\ntwo */</span>\n<span class="x"><span class="y">b</span></span>';
  assert.deepEqual(splitHighlightedLines(html), [
    'a',
    '<span class="token comment">/* one</span>',
    '<span class="token comment">two */</span>',
    '<span class="x"><span class="y">b</span></span>',
  ]);
  assert.deepEqual(splitHighlightedLines(''), ['']);
  assert.deepEqual(splitHighlightedLines('x\n'), ['x', '']);
  assert.equal(splitHighlightedLines('1\n2\n3\n4').length, 4);
});

// ---- I3: status chips on Table, Kanban and Timeline ------------------------------------------------------

test('record views store a board status in data and parseBoard validates it', () => {
  const datasets = { d1: [] };
  for (const kind of ['table', 'kanban', 'timeline'] as const) {
    const view = { ...createItem(kind, 0, 0), datasetId: 'd1' },
      next = { ...view, data: withItemStatus(view.data ?? {}, nextItemStatus(undefined)) };
    assert.equal(next.data.status, 'draft');
    const parsed = parseBoard({ ...boardWith(next), datasets });
    assert.equal(parsed.items[0].data?.status, 'draft');
    assert.throws(
      () => parseBoard({ ...boardWith({ ...view, data: { status: 'nope' } }), datasets }),
      /Invalid status/,
    );
    assert.throws(() => parseBoard({ ...boardWith({ ...view, data: [] as never }), datasets }), /records data/);
    // Older boards without data load unchanged.
    assert.equal(parseBoard({ ...boardWith(view), datasets }).items[0].data, undefined);
  }
});

// ---- R6a-Q1: clear formatting ------------------------------------------------------------------------

test('clearStyles removes every style from the selection only', () => {
  const text = 'Hello brave world';
  const spans: TextSpan[] = [
    { start: 0, end: 11, bold: true, color: '#ff0000' },
    { start: 12, end: 17, italic: true, underline: true, strike: true, highlight: '#ffff00' },
  ];
  assert.deepEqual(clearStyles(text, spans, 6, 17), [{ start: 0, end: 6, bold: true, color: '#ff0000' }]);
});

test('clearStyles with an empty selection clears the whole text', () => {
  const text = 'abc def';
  const spans: TextSpan[] = [
    { start: 0, end: 3, bold: true },
    { start: 4, end: 7, color: '#00ff00' },
  ];
  assert.deepEqual(clearStyles(text, spans, 2, 2), []);
});

test('clearStyles keeps mention chips as chips and links as links, dropping only their styling', () => {
  const text = 'Hi @Ada see docs';
  const spans: TextSpan[] = normalizeSpans(
    [
      { start: 3, end: 7, mention: 'Ada', bold: true, color: '#123456' },
      { start: 12, end: 16, href: 'https://example.com/', italic: true },
      { start: 0, end: 2, underline: true },
    ],
    text.length,
  );
  // The selection starts inside the mention: the range widens over the whole chip.
  assert.deepEqual(clearStyles(text, spans, 5, 16), [
    { start: 0, end: 2, underline: true },
    { start: 3, end: 7, mention: 'Ada' },
    { start: 12, end: 16, href: 'https://example.com/' },
  ]);
});

// ---- F8 / Q2: animated GIF detection --------------------------------------------------------------------

const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255];
const frame = [0x21, 0xf9, 4, 0, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0];
const gif = (frames: number) =>
  new Uint8Array([...header, ...Array.from({ length: frames }, () => frame).flat(), 0x3b]);
const dataUrl = (bytes: Uint8Array, mime = 'image/gif') =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

test('gifFrameCount counts image frames and stops at the limit', () => {
  assert.equal(gifFrameCount(gif(1)), 1);
  assert.equal(gifFrameCount(gif(3)), 3);
  assert.equal(gifFrameCount(gif(5), 2), 2);
  assert.equal(gifFrameCount(new Uint8Array([1, 2, 3])), 0);
  assert.equal(gifFrameCount(new Uint8Array([...header.slice(0, 6), 0, 0])), 0);
  // Truncated mid-frame: the partial frame does not count.
  assert.equal(gifFrameCount(gif(2).subarray(0, header.length + frame.length + 15)), 1);
});

test('isAnimatedGif is true only for GIF assets with two or more frames', () => {
  assert.equal(isAnimatedGif({ mime: 'image/gif', data: dataUrl(gif(2)) }), true);
  assert.equal(isAnimatedGif({ mime: 'image/gif', data: dataUrl(gif(1)) }), false);
  assert.equal(isAnimatedGif({ mime: 'image/png', data: dataUrl(gif(2), 'image/png') }), false);
  assert.equal(isAnimatedGif({ mime: 'image/gif', data: 'data:image/gif;base64,@@@' }), false);
  assert.deepEqual(dataUrlBytes('data:text/plain;base64,QUI='), new Uint8Array([65, 66]));
  assert.equal(dataUrlBytes('https://example.com/a.gif'), null);
});
