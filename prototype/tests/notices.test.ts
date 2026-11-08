// Notice timing and roles (item 148).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noticeDuration } from '../src/notices.ts';

test('errors stay at least 8 s; notices with buttons 8 s; others 5 s', () => {
  assert.ok(noticeDuration('error', false) >= 8000);
  assert.ok(noticeDuration('error', true) >= 8000);
  assert.equal(noticeDuration('info', true), 8000);
  assert.equal(noticeDuration('info', false), 5000);
});
