import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUIDFallback } from '../src/polyfills.ts';

test('the randomUUID fallback makes unique version 4 UUIDs', () => {
  const ids = new Set(Array.from({ length: 1000 }, randomUUIDFallback));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
