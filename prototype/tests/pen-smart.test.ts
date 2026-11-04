import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeStroke, insidePolygon, lassoSelect, parsePenPresets, defaultPenPresets } from '../src/pen-smart.ts';

const loop = (f: (t: number) => { x: number; y: number }, n = 60) =>
  Array.from({ length: n + 1 }, (_, i) => f((i / n) * Math.PI * 2));
const along = (pts: { x: number; y: number }[], per = 10) =>
  pts.slice(1).flatMap((b, i) => {
    const a = pts[i]!;
    return Array.from({ length: per }, (_, k) => ({
      x: a.x + ((b.x - a.x) * k) / per,
      y: a.y + ((b.y - a.y) * k) / per,
    }));
  });

test('smart pen recognises rectangles, ellipses, triangles and lines', () => {
  const rect = along([
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 0, y: 100 },
    { x: 0, y: 2 },
  ]);
  assert.deepEqual(recognizeStroke(rect), { kind: 'rectangle', x: 0, y: 0, w: 200, h: 100 });
  const ellipse = loop(t => ({ x: 100 + 100 * Math.cos(t), y: 50 + 50 * Math.sin(t) }));
  assert.equal(recognizeStroke(ellipse)?.kind, 'ellipse');
  const tri = along([
    { x: 100, y: 0 },
    { x: 200, y: 160 },
    { x: 0, y: 160 },
    { x: 98, y: 3 },
  ]);
  assert.equal(recognizeStroke(tri)?.kind, 'triangle');
  const line = along([
    { x: 0, y: 0 },
    { x: 300, y: 40 },
  ]);
  assert.deepEqual(recognizeStroke(line)?.kind, 'line');
  const scribble = along([
    { x: 0, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
    { x: 120, y: 0 },
    { x: 300, y: 90 },
  ]);
  assert.equal(recognizeStroke(scribble), null);
  assert.equal(
    recognizeStroke(
      along([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ]),
    ),
    null,
  );
});

test('lasso selects objects whose centre is inside the loop', () => {
  const poly = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  assert.ok(insidePolygon({ x: 50, y: 50 }, poly));
  assert.ok(!insidePolygon({ x: 150, y: 50 }, poly));
  const items = [
    { id: 'in', x: 10, y: 10, w: 20, h: 20 },
    { id: 'out', x: 200, y: 10, w: 20, h: 20 },
    { id: 'hidden', x: 10, y: 10, w: 20, h: 20, hidden: true },
  ];
  assert.deepEqual(lassoSelect(items, poly), ['in']);
  assert.deepEqual(lassoSelect(items, poly.slice(0, 2)), []);
});

test('pen presets fall back to defaults when storage is invalid', () => {
  assert.deepEqual(parsePenPresets(null), defaultPenPresets);
  assert.deepEqual(parsePenPresets('[{"color":"red","width":3}]'), defaultPenPresets);
  const custom = [
    { color: '#111111', width: 2 },
    { color: '#222222', width: 4 },
    { color: '#333333', width: 8 },
  ];
  assert.deepEqual(parsePenPresets(JSON.stringify(custom)), custom);
});
