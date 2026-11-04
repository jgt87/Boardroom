import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GLUE,
  atRest,
  bentPoints,
  detachDistance,
  detaches,
  flatPoints,
  lerpPoints,
  liftOf,
  outlinePath,
  springStep,
  tiltFor,
} from '../src/peel-motion.ts';
import { curlShapes, padSheet, PAD_SIZE, PAD_INSET, PAD_TITLE, PAD_NOTE } from '../src/specs-stickypad.ts';

const sheet = { x: 100, y: 200, s: 200 };

test('133 a bent sheet stays glued along its top strip while its free corners follow the pull', () => {
  const p = bentPoints(sheet, { x: 60, y: 40 }, 1);
  assert.deepEqual(p[0], { x: 100, y: 200 });
  assert.deepEqual(p[1], { x: 300, y: 200 });
  assert.deepEqual(p[2], { x: 300, y: 200 + GLUE * 200 });
  assert.deepEqual(p[8], { x: 100, y: 200 + GLUE * 200 });
  // Both free corners follow the pull (the grabbed one at least as far), less than the pointer (paper resists).
  const right = p[4].x - 300,
    left = p[6].x - 100;
  assert.ok(left > 0 && right >= left - 1e-6);
  assert.ok(right < 60);
});

test('133 with no pull the bent outline is the flat sheet', () => {
  const bent = bentPoints(sheet, { x: 0, y: 0 }, 0.5),
    flat = flatPoints({ x: 100, y: 200, w: 200, h: 200 });
  for (const i of [0, 1, 2, 4, 6, 8]) assert.deepEqual(bent[i], flat[i]);
});

test('133 the sheet tears off at the detach distance and lift reaches 1 there', () => {
  const at = detachDistance(sheet.s);
  assert.equal(detaches(sheet, { x: at - 1, y: 0 }), false);
  assert.equal(detaches(sheet, { x: 0, y: at }), true);
  assert.equal(liftOf(sheet, { x: at / 2, y: 0 }), 0.5);
  assert.equal(liftOf(sheet, { x: at * 3, y: 0 }), 1);
});

test('133 blending reaches the flat note exactly and the path is well formed', () => {
  const a = bentPoints(sheet, { x: 90, y: 30 }, 0.8),
    b = flatPoints({ x: 190, y: 230, w: 200, h: 200 });
  assert.deepEqual(lerpPoints(a, b, 1), b);
  assert.deepEqual(lerpPoints(a, b, 0), a);
  assert.match(
    outlinePath(b),
    /^M[\d.,-]+ L[\d.,-]+ L[\d.,-]+ Q[\d.,-]+ [\d.,-]+ Q[\d.,-]+ [\d.,-]+ Q[\d.,-]+ [\d.,-]+ Z$/,
  );
});

test('133 the spring settles and moves (visually) the same at 30, 60 and 144 frames per second', () => {
  const run = (fps: number, seconds: number) => {
    let sp = { x: 0, v: 0 };
    for (let i = 0; i < Math.round(fps * seconds); i++) sp = springStep(sp, 1, 1 / fps);
    return sp;
  };
  const a = run(30, 0.2),
    b = run(60, 0.2),
    c = run(144, 0.2);
  assert.ok(Math.abs(a.x - b.x) < 0.005 && Math.abs(b.x - c.x) < 0.005, `${a.x} ${b.x} ${c.x}`);
  assert.ok(atRest(run(60, 2), 1));
  // A huge frame is clamped instead of exploding.
  assert.ok(Math.abs(springStep({ x: 0, v: 0 }, 1, 5).x) < 2);
});

test('133 a carried note tilts against its horizontal speed, within limits', () => {
  assert.ok(tiltFor(500) < 0 && tiltFor(-500) > 0);
  assert.equal(tiltFor(1e6), -9);
  assert.ok(tiltFor(0) === 0);
});

test('133 the curl grows from a flat sheet to the resting curl, and the top sheet sits where the pad draws it', () => {
  const flat = curlShapes(0).sheet;
  assert.equal(
    flat,
    `M${PAD_INSET},${PAD_TITLE} H${PAD_INSET + PAD_NOTE} V${PAD_TITLE + PAD_NOTE} Q${PAD_INSET + PAD_NOTE},${PAD_TITLE + PAD_NOTE} ${PAD_INSET + PAD_NOTE},${PAD_TITLE + PAD_NOTE} Q${PAD_INSET + PAD_NOTE * 0.58},${PAD_TITLE + PAD_NOTE} ${PAD_INSET},${PAD_TITLE + PAD_NOTE} Z`,
  );
  assert.notEqual(curlShapes(1).sheet, flat);
  const pad = { x: 10, y: 20, w: PAD_SIZE[0] * 2, h: PAD_SIZE[1] * 2 };
  assert.deepEqual(padSheet(pad), { x: 10 + 2 * PAD_INSET, y: 20 + 2 * PAD_TITLE, s: 2 * PAD_NOTE });
});

test('133 paper never stretches: in any pull the sides and the free edge stay within the sheet', () => {
  const s = sheet.s,
    side = s - GLUE * s,
    len = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  for (const grabX of [0, 0.3, 0.5, 1])
    for (let angle = 0; angle < 360; angle += 15)
      for (const dist of [5, 40, 84, 200, 600]) {
        const a = (angle * Math.PI) / 180,
          p = bentPoints(sheet, { x: Math.cos(a) * dist, y: Math.sin(a) * dist }, grabX);
        const where = `grab ${grabX} angle ${angle} dist ${dist}`;
        // Control polygons bound the curves' lengths.
        assert.ok(len(p[2], p[3]) + len(p[3], p[4]) <= side + 1e-6, `right side ${where}`);
        assert.ok(len(p[8], p[7]) + len(p[7], p[6]) <= side + 1e-6, `left side ${where}`);
        assert.ok(len(p[4], p[5]) + len(p[5], p[6]) <= s + 1e-6, `free edge ${where}`);
      }
});

test('133 blending a bent sheet into the flat note never makes an edge longer than the paper', () => {
  const a = bentPoints(sheet, { x: 70, y: 60 }, 0.9),
    b = flatPoints({ x: 170, y: 260, w: 200, h: 200 });
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const p = lerpPoints(a, b, t);
    assert.ok(Math.hypot(p[4].x - p[6].x, p[4].y - p[6].y) <= 200 + 1e-6);
    assert.ok(Math.hypot(p[2].x - p[4].x, p[2].y - p[4].y) <= 200 * (1 - GLUE) + 1e-6);
  }
});

test('133 the resting curl sticks out past the sheet but stays inside the white card', () => {
  const xs = [...curlShapes(1).sheet.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => Number(m[1]));
  const tip = Math.max(...xs);
  assert.ok(tip > PAD_INSET + PAD_NOTE + 5 && tip < PAD_SIZE[0] - 2, `tip at ${tip}, card edge at ${PAD_SIZE[0]}`);
});
