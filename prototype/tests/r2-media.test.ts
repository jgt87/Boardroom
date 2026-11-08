// Track G: video and Talktrack playback (skips, speed, keys, cuts, waveform), animated GIF settings, image crop
// masks and pinned comment cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  MAX_CUTS,
  atPlayableEnd,
  clockLabel,
  mediaKeyAction,
  normalizeCuts,
  parseClock,
  playWindow,
  playableLength,
  resolvePlayhead,
  skipBy,
  stepRate,
  validCuts,
  waveformPeaks,
} from '../src/media-playback.ts';
import { mediaSpecs } from '../src/specs-media.ts';
import { gifFrameCount, gifLoops, gifPlayOnce, gifDataUrl, dataUrlBytes } from '../src/gif.ts';
import { setGifOptions, squareForCircle } from '../src/images.ts';
import { imageMasks, isImageMask, maskPath } from '../src/image-masks.ts';
import { setStyleField } from '../src/inspector-model.ts';
import {
  pinnedOpenThreads,
  pinnedCardPosition,
  withCollapsed,
  readStoredMap,
  setPinned,
} from '../src/facilitation-rules.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const videoSpec = mediaSpecs.find(s => s.kind === 'video')!;
const video = (data: Record<string, unknown>): Item => ({ ...createItem('video', 0, 0), assetId: 'v1', data });

// ---- Playback -----------------------------------------------------------------------------------------
test('skips of ±10 s stay inside the trim window', () => {
  const limits = { trim: { start: 5, end: 60 }, duration: 90 };
  assert.equal(skipBy(20, 10, limits), 30);
  assert.equal(skipBy(20, -10, limits), 10);
  assert.equal(skipBy(8, -10, limits), 5, 'back stops at the trim start');
  assert.equal(skipBy(55, 10, limits), 60, 'forward stops at the trim end');
  assert.equal(atPlayableEnd(60, limits), true);
  assert.equal(atPlayableEnd(59, limits), false);
  // Untrimmed: the whole recording, and an unknown length never ends early.
  assert.deepEqual(playWindow({ duration: 30 }), { start: 0, end: 30 });
  assert.equal(skipBy(25, 10, { duration: 30 }), 30);
  assert.equal(skipBy(25, 10, { duration: 0 }), 35);
});

test('cut-out ranges are skipped in both directions', () => {
  const limits = { cuts: [{ start: 10, end: 20 }], duration: 60 };
  assert.equal(resolvePlayhead(12, limits, 1), 20, 'playing into a cut jumps past it');
  assert.equal(resolvePlayhead(9.9, limits, 1), 9.9);
  assert.equal(skipBy(5, 10, limits), 20, 'forward skip landing in a cut goes to its end');
  assert.equal(skipBy(25, -10, limits), 9.9, 'back skip landing in a cut goes before its start');
  // A cut at the very start: back skips play from after it.
  const atStart = { cuts: [{ start: 0, end: 4 }], duration: 60 };
  assert.equal(skipBy(8, -10, atStart), 4);
  // A cut running to the end ends playback.
  const toEnd = { trim: { start: 0, end: 30 }, cuts: [{ start: 25, end: 30 }] };
  assert.equal(atPlayableEnd(26, toEnd), true);
  assert.equal(atPlayableEnd(24, toEnd), false);
  assert.equal(
    playableLength({
      trim: { start: 5, end: 60 },
      cuts: [
        { start: 0, end: 10 },
        { start: 50, end: 70 },
      ],
    }),
    40,
  );
  assert.equal(playableLength({ duration: 0 }), 0);
});

test('cuts are normalised: sorted, merged, clamped and short ones dropped', () => {
  assert.deepEqual(
    normalizeCuts(
      [
        { start: 30, end: 20 },
        { start: 5, end: 8 },
        { start: 7, end: 9 },
        { start: 40, end: 40.05 },
        { start: 50, end: 120 },
      ],
      100,
    ),
    [
      { start: 5, end: 9 },
      { start: 20, end: 30 },
      { start: 50, end: 100 },
    ],
  );
  assert.equal(validCuts(normalizeCuts([{ start: 3, end: 1 }])), true);
  assert.equal(normalizeCuts(Array.from({ length: 80 }, (_, k) => ({ start: k, end: k + 0.5 }))).length, MAX_CUTS);
});

test('the video spec validates cuts', () => {
  assert.doesNotThrow(() => videoSpec.validate!(video({ cuts: [{ start: 1, end: 2 }] })));
  for (const cuts of [
    [{ start: 2, end: 1 }],
    [
      { start: 1, end: 5 },
      { start: 4, end: 6 },
    ],
    [{ start: -1, end: 2 }],
    [{ start: 1, end: 2, extra: true }],
    'nope',
    Array.from({ length: MAX_CUTS + 1 }, (_, k) => ({ start: k, end: k + 0.5 })),
  ])
    assert.throws(() => videoSpec.validate!(video({ cuts })), /cuts/);
  // Boards with cuts load through parseBoard.
  const b = parseBoard(board(video({ duration: 9, trim: { start: 1, end: 8 }, cuts: [{ start: 3, end: 4 }] })));
  assert.deepEqual(b.items[0].data?.cuts, [{ start: 3, end: 4 }]);
});

test('speed steps through 0.5× to 2× and player keys map to actions', () => {
  assert.equal(stepRate(1, 1), 1.25);
  assert.equal(stepRate(1, -1), 0.75);
  assert.equal(stepRate(2, 1), 2);
  assert.equal(stepRate(0.5, -1), 0.5);
  assert.equal(stepRate(1.1, 1), 1.25, 'an unlisted speed moves to the next listed one');
  assert.equal(stepRate(1.1, -1), 1);
  assert.equal(mediaKeyAction('j'), 'back');
  assert.equal(mediaKeyAction('ArrowLeft'), 'back');
  assert.equal(mediaKeyAction('L'), 'forward');
  assert.equal(mediaKeyAction('ArrowRight'), 'forward');
  assert.equal(mediaKeyAction('k'), 'toggle');
  assert.equal(mediaKeyAction(' '), 'toggle');
  assert.equal(mediaKeyAction('<'), 'slower');
  assert.equal(mediaKeyAction('>'), 'faster');
  assert.equal(mediaKeyAction('x'), null);
});

test('waveform peaks and clock labels', () => {
  assert.deepEqual(waveformPeaks([0, 0.5, -1, 0.25], 2), [0.5, 1]);
  assert.deepEqual(waveformPeaks([0, 0, 0], 3), [0, 0, 0]);
  assert.deepEqual(waveformPeaks([], 2), [0, 0]);
  assert.equal(waveformPeaks(new Float32Array(1000).fill(0.2), 50).length, 50);
  assert.equal(clockLabel(65), '1:05');
  assert.equal(clockLabel(0.96), '0:01');
  assert.equal(clockLabel(0.2), '0:00.2');
  assert.equal(parseClock('1:05'), 65);
  assert.equal(parseClock('0:00.2'), 0.2);
  assert.ok(Number.isNaN(parseClock('soon')));
});

// ---- Animated GIFs ----------------------------------------------------------------------------------
const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 2, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255];
const loop = [0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0];
const frame = [0x21, 0xf9, 4, 0, 10, 0, 0, 0, 0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0x4c, 0x01, 0];
const gif = (frames: number, looping = true) =>
  new Uint8Array([...header, ...(looping ? loop : []), ...Array.from({ length: frames }, () => frame).flat(), 0x3b]);

test('play once removes the looping block and keeps every frame', () => {
  const src = gif(3);
  assert.equal(gifLoops(src), true);
  const once = gifPlayOnce(src, 1)!;
  assert.ok(once);
  assert.equal(gifLoops(once), false);
  assert.equal(gifFrameCount(once), 3);
  // Each replay nonce gives different bytes, so the browser restarts the animation.
  assert.notDeepEqual(gifPlayOnce(src, 0), gifPlayOnce(src, 1));
  assert.equal(gifPlayOnce(new Uint8Array([1, 2, 3])), null);
  assert.equal(gifPlayOnce(src.subarray(0, src.length - 10)), null, 'truncated GIFs are refused');
  // Round trip through a data URL.
  assert.deepEqual(dataUrlBytes(gifDataUrl(once)), once);
});

test('GIF settings are stored per image, validated and respect locks', () => {
  const img = { ...createItem('image', 0, 0), assetId: 'a1' },
    locked = { ...createItem('image', 50, 0), assetId: 'a2', locked: true },
    b = board(img, locked);
  const paused = setGifOptions(b, [img.id, locked.id], { paused: true });
  assert.deepEqual(paused.items[0].gif, { paused: true });
  assert.equal(paused.items[1].gif, undefined, 'locked images are left alone');
  const both = setGifOptions(paused, [img.id], { once: true });
  assert.deepEqual(both.items[0].gif, { paused: true, once: true });
  const cleared = setGifOptions(setGifOptions(both, [img.id], { paused: false }), [img.id], { once: false });
  assert.equal(cleared.items[0].gif, undefined);
  assert.equal(setGifOptions(b, [img.id], { paused: false }), b, 'no change keeps the same board');
  assert.deepEqual(parseBoard(both).items[0].gif, { paused: true, once: true });
  assert.throws(() => parseBoard(board({ ...img, gif: { paused: 'yes' as unknown as boolean } })), /animation/);
  assert.throws(() => parseBoard(board({ ...createItem('note', 0, 0), gif: { once: true } })), /animation/);
});

// ---- Crop masks -------------------------------------------------------------------------------------
test('every crop mask has a closed outline inside the box', () => {
  for (const mask of imageMasks) {
    const d = maskPath(mask, 200, 100);
    assert.match(d, /^M/);
    assert.match(d, /Z$/);
    const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    assert.ok(
      numbers.every(v => v >= -0.01 && v <= 200.01),
      `${mask} stays inside the box`,
    );
  }
  assert.equal(isImageMask('heart'), true);
  assert.equal(isImageMask('blob'), false);
});

test('a crop mask applies to every selected unlocked image in one change', () => {
  const a = { ...createItem('image', 0, 0), assetId: 'a1' },
    c = { ...createItem('image', 300, 0), assetId: 'a2' },
    locked = { ...createItem('image', 600, 0), assetId: 'a3', locked: true },
    shape = createItem('rectangle', 900, 0),
    b = board(a, c, locked, shape);
  const ids = b.items.map(i => i.id);
  const starred = setStyleField(b, ids, 'mask', 'star');
  assert.deepEqual(
    starred.items.map(i => i.style?.mask),
    ['star', 'star', undefined, undefined],
  );
  assert.equal(setStyleField(b, ids, 'mask', 'blob' as unknown as 'star'), b);
  const parsed = parseBoard(starred);
  assert.equal(parsed.items[0].style?.mask, 'star');
  for (const mask of imageMasks) assert.doesNotThrow(() => parseBoard(setStyleField(b, ids, 'mask', mask)));
  const cleared = setStyleField(starred, ids, 'mask', undefined);
  assert.equal(cleared.items[0].style, undefined);
});

test('the circle mask squares the image: centred square crop and a square box with the same centre (Q13)', () => {
  const asset = { mime: 'image/png', data: 'data:image/png;base64,AA', width: 400, height: 200, name: 'wide' };
  const wide = { ...createItem('image', 0, 0), assetId: 'a1', w: 400, h: 200 };
  const sq = squareForCircle(wide, asset);
  assert.deepEqual([sq.x, sq.y, sq.w, sq.h], [100, 0, 200, 200]);
  assert.deepEqual(sq.crop, { x: 0.25, y: 0, w: 0.5, h: 1 });
  // Inside an existing crop (the left half, 200 x 200 px, already square): only the box changes.
  const cropped = squareForCircle({ ...wide, crop: { x: 0, y: 0, w: 0.5, h: 1 }, w: 300, h: 300 }, asset);
  assert.deepEqual(cropped.crop, { x: 0, y: 0, w: 0.5, h: 1 });
  // An already square image keeps no crop.
  const square = squareForCircle({ ...wide, w: 100, h: 100 }, { ...asset, height: 400 });
  assert.equal(square.crop, undefined);
  assert.doesNotThrow(() => parseBoard({ version: 1, title: 't', items: [sq] }));
});

// ---- Pinned comments --------------------------------------------------------------------------------
test('pinned, unresolved threads become canvas cards until unpinned', () => {
  const msg = { id: 'm', text: 'Look here', at: '2026-01-01T10:00:00.000Z' };
  const b: Board = {
    ...newBoard(),
    comments: [
      { id: 'a', x: 0, y: 0, pinned: true, messages: [msg] },
      { id: 'b', x: 0, y: 0, messages: [msg] },
      { id: 'c', x: 0, y: 0, pinned: true, resolved: true, messages: [msg] },
      { id: 'd', x: 0, y: 0, pinned: true, messages: [msg] },
    ],
  };
  assert.deepEqual(
    pinnedOpenThreads(b.comments).map(t => t.id),
    ['a', 'd'],
  );
  assert.deepEqual(
    pinnedOpenThreads(b.comments, 'd').map(t => t.id),
    ['a'],
    'the thread open in the popover is not shown twice',
  );
  const unpinned = setPinned(b, 'a', false);
  assert.deepEqual(
    pinnedOpenThreads(unpinned.comments).map(t => t.id),
    ['d'],
  );
  assert.deepEqual(pinnedOpenThreads(undefined), []);
});

test('pinned cards sit beside their pin and remember collapsing', () => {
  const camera = { x: 100, y: 50, z: 2 },
    size = { w: 1000, h: 800 };
  assert.deepEqual(pinnedCardPosition({ x: 100, y: 100 }, camera, size), { left: 348, top: 216 });
  assert.equal(pinnedCardPosition({ x: 1000, y: 100 }, camera, size), null, 'off screen');
  const collapsed = withCollapsed({}, 't1', true, 5);
  assert.deepEqual(collapsed, { t1: 5 });
  assert.deepEqual(withCollapsed(collapsed, 't1', false), {});
  const many = Array.from({ length: 205 }, (_, k) => k).reduce<Record<string, number>>(
    (m, k) => withCollapsed(m, `t${k}`, true, k),
    {},
  );
  assert.equal(Object.keys(many).length, 200);
  assert.deepEqual(readStoredMap<number>(JSON.stringify(collapsed), 'number'), collapsed);
});
