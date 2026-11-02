import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitText, wrappedLineCount } from '../src/text-layout.ts';
const measure = (text: string, size: number) => [...text].length * size * 0.6;
test('Auto maximizes short text and shrinks as content grows', () => {
  const short = fitText('Idea', 186, 186, measure),
    long = fitText('A longer idea with many words that must fit inside the same sticky note.', 186, 186, measure);
  assert.ok(short.size > 50);
  assert.ok(long.size < short.size);
  assert.ok(long.height <= 186);
  assert.ok(
    wrappedLineCount('Idea', 186, short.size + 0.2, measure) * (short.size + 0.2) * 1.4 > 186 ||
      measure('Idea', short.size + 0.2) > 186,
  );
});
test('Auto accounts for line breaks, narrow notes and resizing', () => {
  assert.equal(wrappedLineCount('12345 12345', 30, 10, measure), 2, 'trailing spaces must not lose a wrapped line');
  const small = fitText('First\nSecond\nThird', 100, 100, measure),
    large = fitText('First\nSecond\nThird', 200, 200, measure);
  assert.ok(large.size > small.size);
  assert.ok(small.height <= 100);
  const narrow = fitText('W', 8, 300, measure);
  assert.ok(measure('W', narrow.size) <= 8);
});
