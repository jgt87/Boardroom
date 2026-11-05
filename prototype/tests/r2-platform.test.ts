// Track R2-K: pen pressure, supported-browser detection, comment-only boards and sensitivity labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item, StrokePoint } from '../src/model.ts';
import { simplify, strokeFromPoints, eraseAt, addThread, replyThread, setResolved } from '../src/board-tools.ts';
import { resizeItems } from '../src/interactions.ts';
import {
  hasPressure,
  isPressure,
  pressureFactor,
  pressureOf,
  pressureOutline,
  settlePressure,
} from '../src/pen-pressure.ts';
import {
  detectFeatures,
  missingFeatures,
  noticeSignature,
  noticeText,
  shouldShowNotice,
  requiredFeatures,
} from '../src/browser-support.ts';
import type { BrowserEnv } from '../src/browser-support.ts';
import {
  boardModeOf,
  COMMENT_ONLY_MESSAGE,
  modeRefusal,
  onlyCommentsChanged,
  VIEW_ONLY_MESSAGE,
  withBoardMode,
} from '../src/board-modes.ts';
import {
  badgeInk,
  customSensitivity,
  isSensitivity,
  sensitivityBadge,
  sensitivityStampBox,
  withSetting,
} from '../src/board-settings.ts';
import { openLibrary, saveActive } from '../src/board-library.ts';
import type { KeyValueStore } from '../src/board-library.ts';

const pen = (points: StrokePoint[]): Item => ({
  ...createItem('pen', 0, 0, '#25252a'),
  points,
  w: 100,
  h: 100,
  data: { style: 'pen', width: 4 },
});
const withItems = (...items: Item[]): Board => ({ ...newBoard(), items });

// ---- 1 Pen pressure ------------------------------------------------------------------------------------
test('pressureOf rounds stylus pressure and treats 0 or missing as the neutral 0.5', () => {
  assert.equal(pressureOf(0.123456), 0.123);
  assert.equal(pressureOf(0), 0.5);
  assert.equal(pressureOf(undefined), 0.5);
  assert.equal(pressureOf(Number.NaN), 0.5);
  assert.equal(pressureOf(1.4), 1);
  assert.equal(pressureFactor(0.5), 1);
  assert.ok(pressureFactor(1) > pressureFactor(0.2));
  assert.ok(isPressure(0) && isPressure(1) && !isPressure(1.1) && !isPressure('0.5'));
});

test('settlePressure keeps varying pressure and drops a constant one (no pressure hardware)', () => {
  const varying = settlePressure([
    { x: 0, y: 0, p: 0.2 },
    { x: 5, y: 0, p: 0.8 },
  ]);
  assert.deepEqual(
    varying.map(p => p.p),
    [0.2, 0.8],
  );
  const flat = settlePressure([
    { x: 0, y: 0, p: 0.5 },
    { x: 5, y: 0, p: 0.5 },
  ]);
  assert.ok(!hasPressure(flat));
  const mouse = settlePressure([
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ]);
  assert.ok(!hasPressure(mouse));
});

test('simplification keeps pressure aligned with points, and keeps pressure swings on straight runs', () => {
  // A straight line pressed hard only in the middle: plain RDP would keep just the two ends.
  const pts: StrokePoint[] = Array.from({ length: 21 }, (_, k) => ({ x: k * 5, y: 0, p: k === 10 ? 1 : 0.2 }));
  const out = simplify(pts, 0.8);
  assert.ok(out.length >= 3, 'the pressure peak survives');
  for (const p of out) assert.equal(p.p, pts.find(q => q.x === p.x)!.p, 'pressure stays with its point');
  // Without pressure the straight run collapses to its ends, as before.
  assert.equal(simplify(pts.map(({ x, y }) => ({ x, y }))).length, 2);
});

test('strokeFromPoints, resize and precise erase carry pressure with each point', () => {
  const stroke = strokeFromPoints(pen([]), [
    { x: 10, y: 10, p: 0.1 },
    { x: 60, y: 30, p: 0.9 },
  ]);
  assert.deepEqual(stroke.points, [
    { x: 0, y: 0, p: 0.1 },
    { x: 50, y: 20, p: 0.9 },
  ]);
  const board = withItems(stroke);
  const resized = resizeItems(board, [stroke.id], { x: 10, y: 10, w: 50, h: 20 }, { x: 10, y: 10, w: 100, h: 40 });
  assert.deepEqual(
    resized.items[0].points!.map(p => p.p),
    [0.1, 0.9],
  );
  // Erasing the middle of a long stroke splits it; each piece keeps interpolated pressure.
  const long = strokeFromPoints(pen([]), [
    { x: 0, y: 0, p: 0 },
    { x: 100, y: 0, p: 1 },
  ]);
  const erased = eraseAt(withItems(long), { x: 50, y: 0 }, 5, true);
  assert.equal(erased.items.length, 2);
  for (const piece of erased.items) {
    assert.ok(hasPressure(piece.points));
    for (const p of piece.points!) {
      const absoluteX = piece.x + p.x;
      assert.ok(Math.abs(p.p! - absoluteX / 100) < 0.02, `pressure ${p.p} matches position ${absoluteX}`);
    }
  }
});

test('pressureOutline draws a closed filled outline whose width follows pressure', () => {
  const d = pressureOutline(
    [
      { x: 0, y: 0, p: 0 },
      { x: 50, y: 0, p: 1 },
    ],
    10,
  );
  assert.match(d, /^M[-\d.]+,[-\d.]+ .* Z$/);
  assert.equal((d.match(/ A/g) ?? []).length, 2, 'two round caps');
  // Light end: half width 10*0.2/2 = 1; firm end: 10*1.8/2 = 9.
  assert.ok(d.startsWith('M0,1'));
  assert.ok(d.includes('A9,9'));
  // A single point is a dot; an empty stroke draws nothing.
  assert.match(pressureOutline([{ x: 3, y: 4, p: 0.5 }], 4), /A2,2/);
  assert.equal(pressureOutline([], 4), '');
});

test('parseBoard accepts per-point pressure from 0 to 1 and rejects anything else', () => {
  const ok = withItems(
    pen([
      { x: 0, y: 0, p: 0.3 },
      { x: 4, y: 4 },
    ]),
  );
  assert.equal(parseBoard(JSON.parse(JSON.stringify(ok))).items[0].points![0].p, 0.3);
  for (const bad of [1.5, -0.1, 'firm', null]) {
    const b = withItems(pen([{ x: 0, y: 0, p: bad as number }]));
    assert.throws(() => parseBoard(JSON.parse(JSON.stringify(b))), /invalid drawing/);
  }
});

// ---- 3 Supported browsers ----------------------------------------------------------------------------
const fullEnv = (): BrowserEnv => ({
  indexedDB: {},
  ResizeObserver: function ResizeObserver() {},
  structuredClone: () => null,
  PointerEvent: function PointerEvent() {},
  CSS: { supports: () => true },
  localStorage: { getItem: () => null },
});

test('detectFeatures reports a modern browser as complete', () => {
  const report = detectFeatures(fullEnv());
  assert.deepEqual(missingFeatures(report), []);
  assert.equal(shouldShowNotice(report, null), false);
  assert.equal(noticeText(report), '');
});

test('detectFeatures finds each missing API, and throwing probes count as missing', () => {
  for (const f of requiredFeatures) {
    const env = fullEnv() as Record<string, unknown>;
    if (f.id === 'cssHas') env.CSS = { supports: (q: string) => !q.includes(':has') };
    else if (f.id === 'localStorage')
      env.localStorage = {
        getItem: () => {
          throw new Error('denied');
        },
      };
    else
      delete env[
        {
          indexedDB: 'indexedDB',
          resizeObserver: 'ResizeObserver',
          structuredClone: 'structuredClone',
          pointerEvents: 'PointerEvent',
        }[f.id]
      ];
    const report = detectFeatures(env as BrowserEnv);
    assert.deepEqual(
      missingFeatures(report).map(m => m.id),
      [f.id],
      f.id,
    );
    assert.ok(noticeText(report).includes(f.label));
  }
});

test('a dismissed notice stays hidden until a different feature goes missing', () => {
  const env = fullEnv();
  delete env.indexedDB;
  const report = detectFeatures(env);
  assert.equal(shouldShowNotice(report, null), true);
  const sig = noticeSignature(report);
  assert.equal(shouldShowNotice(report, sig), false);
  delete env.ResizeObserver;
  assert.equal(shouldShowNotice(detectFeatures(env), sig), true);
  assert.doesNotMatch(noticeText(report), /Claude|Anthropic|OpenAI/);
});

// ---- 4 Comment-only boards ---------------------------------------------------------------------------
test('comment-only accepts comment changes and refuses everything else', () => {
  const note = createItem('note', 0, 0);
  const base = withBoardMode(withItems(note), 'comment');
  assert.equal(boardModeOf(base), 'comment');
  const added = addThread(base, { x: 5, y: 5 }, 'Looks good', note);
  assert.equal(modeRefusal(base, added.board), null);
  const replied = replyThread(added.board, added.thread.id, 'Thanks');
  assert.equal(modeRefusal(added.board, replied), null);
  const resolved = setResolved(replied, added.thread.id, true);
  assert.equal(modeRefusal(replied, resolved), null);
  assert.ok(onlyCommentsChanged(replied, resolved));
  // Moving a note, renaming the board or changing a setting is refused.
  assert.equal(modeRefusal(base, { ...base, items: [{ ...note, x: 40 }] }), COMMENT_ONLY_MESSAGE);
  assert.equal(modeRefusal(base, { ...base, title: 'Renamed' }), COMMENT_ONLY_MESSAGE);
  assert.equal(modeRefusal(base, withSetting(base, 'status', 'done')), COMMENT_ONLY_MESSAGE);
  // Equal content in a fresh object is not a change.
  assert.equal(modeRefusal(base, { ...base, items: base.items.map(i => ({ ...i })) }), null);
});

test('modes switch freely and exclude each other; view-only still refuses everything', () => {
  const plain = withItems(createItem('note', 0, 0));
  const comment = withBoardMode(plain, 'comment'),
    view = withBoardMode(comment, 'view');
  assert.equal(view.commentOnly, undefined);
  assert.equal(boardModeOf(view), 'view');
  assert.equal(modeRefusal(comment, view), null, 'comment-only to view-only');
  assert.equal(modeRefusal(view, withBoardMode(view, 'comment')), null, 'view-only to comment-only');
  assert.equal(modeRefusal(comment, withBoardMode(comment, 'edit')), null, 'turning comment-only off');
  const thread = addThread(view, { x: 0, y: 0 }, 'Hi').board;
  assert.equal(modeRefusal(view, thread), VIEW_ONLY_MESSAGE);
  assert.equal(boardModeOf(withBoardMode(view, 'edit')), 'edit');
  assert.equal(modeRefusal(plain, { ...plain, title: 'x' }), null);
});

test('the comment-only flag is persisted and validated like view-only', () => {
  const b = withBoardMode(newBoard(), 'comment');
  assert.equal(parseBoard(JSON.parse(JSON.stringify(b))).commentOnly, true);
  assert.throws(() => parseBoard({ ...newBoard(), commentOnly: 'yes' }), /comment-only/);
});

// ---- 5 Sensitivity labels ----------------------------------------------------------------------------
test('sensitivity labels: presets, custom label and colour, validation', () => {
  assert.ok(isSensitivity({ level: 'confidential' }));
  assert.ok(isSensitivity({ level: 'internal', color: '#123456' }));
  assert.ok(isSensitivity({ level: 'custom', label: 'Board only', color: '#aa00aa' }));
  for (const bad of [
    { level: 'secret' },
    { level: 'custom' },
    { level: 'custom', label: '   ' },
    { level: 'custom', label: 'x'.repeat(41) },
    { level: 'public', label: 'Public' },
    { level: 'public', color: 'red' },
    { level: 'public', extra: 1 },
    'public',
    null,
  ])
    assert.equal(isSensitivity(bad), false, JSON.stringify(bad));
  assert.deepEqual(sensitivityBadge({ level: 'restricted' }), { label: 'Restricted', color: '#c0362c' });
  assert.deepEqual(customSensitivity('  Team\n  only  ', '#336699'), {
    level: 'custom',
    label: 'Team only',
    color: '#336699',
  });
  assert.equal(customSensitivity('   '), null);
  assert.deepEqual(customSensitivity('Draft', 'nope'), { level: 'custom', label: 'Draft' });
  assert.equal(sensitivityBadge({ level: 'custom', label: 'Draft' })!.color, '#52525b');
  assert.equal(badgeInk('#ffffff'), '#25252c');
  assert.equal(badgeInk('#c0362c'), '#ffffff');
});

test('sensitivity is validated on load and removed with withSetting(null)', () => {
  const b = withSetting(newBoard(), 'sensitivity', { level: 'confidential' });
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))).sensitivity, { level: 'confidential' });
  assert.throws(() => parseBoard({ ...newBoard(), sensitivity: { level: 'top-secret' } }), /sensitivity/);
  assert.equal('sensitivity' in withSetting(b, 'sensitivity', null), false);
});

test('the export stamp fits inside the exported area, in the bottom-right corner', () => {
  for (const box of [
    { x: 0, y: 0, w: 200, h: 200 },
    { x: -500, y: 300, w: 4000, h: 2500 },
  ]) {
    const s = sensitivityStampBox(box, 'Confidential');
    assert.ok(s.x >= box.x && s.y >= box.y);
    assert.ok(s.x + s.w <= box.x + box.w && s.y + s.h <= box.y + box.h);
    assert.ok(s.x + s.w > box.x + box.w * 0.8, 'right side');
    assert.ok(s.y + s.h > box.y + box.h * 0.8, 'bottom');
    assert.ok(s.font >= 10 && s.font <= 48);
  }
});

test('dashboard index entries carry the sensitivity badge', () => {
  const map = new Map<string, string>();
  const kv: KeyValueStore = {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: k => void map.delete(k),
  };
  const opened = openLibrary(kv, parseBoard, newBoard);
  let lib = saveActive(kv, opened.library, withSetting(opened.board, 'sensitivity', { level: 'internal' }));
  assert.deepEqual(lib.boards[0].sensitivity, { label: 'Internal', color: '#4262ff' });
  lib = saveActive(kv, lib, withSetting(opened.board, 'sensitivity', null));
  assert.equal(lib.boards[0].sensitivity, undefined);
});
