// Shared menu keyboard model (item 142).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuKeyTarget } from '../src/menu-keys.ts';

test('arrow keys wrap, Home and End jump, other keys are not menu keys', () => {
  assert.equal(menuKeyTarget('ArrowDown', 0, 3), 1);
  assert.equal(menuKeyTarget('ArrowDown', 2, 3), 0);
  assert.equal(menuKeyTarget('ArrowUp', 0, 3), 2);
  assert.equal(menuKeyTarget('Home', 2, 3), 0);
  assert.equal(menuKeyTarget('End', 0, 3), 2);
  assert.equal(menuKeyTarget('a', 0, 3), null);
  assert.equal(menuKeyTarget('ArrowDown', 0, 0), null);
  // Focus outside the rows: Down goes to the first row, Up to the last.
  assert.equal(menuKeyTarget('ArrowDown', -1, 3), 0);
  assert.equal(menuKeyTarget('ArrowUp', -1, 3), 2);
});
