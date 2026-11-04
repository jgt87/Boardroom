import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseViewPrefs, defaultViewPrefs, dimensionLabel } from '../src/view-prefs.ts';
import { clampZoom, zoomPresets, MAX_ZOOM, MIN_ZOOM } from '../src/camera.ts';

test('view preferences fall back to defaults for missing or invalid storage', () => {
  assert.deepEqual(parseViewPrefs(null), defaultViewPrefs);
  assert.deepEqual(parseViewPrefs('not json'), defaultViewPrefs);
  assert.deepEqual(parseViewPrefs('{"grid":"yes","dimensions":1}'), defaultViewPrefs);
  assert.deepEqual(parseViewPrefs('{"grid":false}'), { ...defaultViewPrefs, grid: false });
  assert.deepEqual(
    parseViewPrefs('{"grid":true,"dimensions":true,"spellcheck":false,"navigation":"mouse","singleKeys":false}'),
    { ...defaultViewPrefs, dimensions: true, spellcheck: false, navigation: 'mouse', singleKeys: false },
  );
  assert.equal(parseViewPrefs('{"navigation":"joystick"}').navigation, 'trackpad');
});

test('dimension labels round to whole pixels', () => {
  assert.equal(dimensionLabel({ w: 210.4, h: 99.6 }), '210 × 100');
});

test('zoom presets stay inside the 10%–2000% range', () => {
  assert.equal(MIN_ZOOM, 0.1);
  assert.equal(MAX_ZOOM, 20);
  for (const z of zoomPresets) assert.equal(clampZoom(z), z);
  assert.equal(clampZoom(50), 20);
  assert.equal(clampZoom(0), 0.1);
});

test('auto-detect treats line or large whole-number wheel steps as a mouse', async () => {
  const { wheelLooksLikeMouse } = await import('../src/view-prefs.ts');
  assert.ok(wheelLooksLikeMouse({ deltaMode: 1, deltaX: 0, deltaY: 3 }));
  assert.ok(wheelLooksLikeMouse({ deltaMode: 0, deltaX: 0, deltaY: 100 }));
  assert.ok(!wheelLooksLikeMouse({ deltaMode: 0, deltaX: 0, deltaY: 4.5 }));
  assert.ok(!wheelLooksLikeMouse({ deltaMode: 0, deltaX: 12, deltaY: 60 }));
  assert.equal(parseViewPrefs('{"navigation":"auto"}').navigation, 'auto');
});
