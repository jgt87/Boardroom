import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centeredCamera, screenToWorld, worldToScreen, zoomCameraAt } from '../src/camera.ts';
test('camera coordinates round trip and zoom preserves the anchor at both limits', () => {
  const camera = { x: -200, y: 30, z: 1.7 },
    point = { x: 80, y: -90 },
    anchor = { x: 300, y: 200 };
  const result = screenToWorld(camera, worldToScreen(camera, point));
  assert.ok(Math.abs(result.x - point.x) < 1e-10 && Math.abs(result.y - point.y) < 1e-10);
  for (const zoom of [0.001, 0.5, 100]) {
    const next = zoomCameraAt(camera, zoom, anchor);
    assert.ok(next.z >= 0.1 && next.z <= 4);
    const before = screenToWorld(camera, anchor),
      after = screenToWorld(next, anchor);
    assert.ok(Math.abs(before.x - after.x) < 1e-10 && Math.abs(before.y - after.y) < 1e-10);
  }
  assert.equal(zoomCameraAt(camera, NaN, anchor), camera);
});
test('numeric navigation centers world coordinates and reset centers the origin at 100%', () => {
  const size = { w: 1200, h: 800 };
  assert.deepEqual(worldToScreen(centeredCamera({ x: 450, y: -100 }, 2, size), { x: 450, y: -100 }), {
    x: 600,
    y: 400,
  });
  assert.deepEqual(centeredCamera({ x: 0, y: 0 }, 1, size), { x: 600, y: 400, z: 1 });
});
