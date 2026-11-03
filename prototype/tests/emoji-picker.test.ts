import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import {
  normalizeGroups,
  searchEmojis,
  applySkinTone,
  pushRecent,
  isValidEmojiValue,
  readStored,
  writeStored,
  isRecentList,
  RECENT_LIMIT,
} from '../src/emoji-data.ts';

const require = createRequire(import.meta.url);
const groups = normalizeGroups(
  JSON.parse(readFileSync(require.resolve('unicode-emoji-json/data-by-group.json'), 'utf8')),
);

test('the dataset loads into nine groups with names and skin-tone flags', () => {
  assert.equal(groups.length, 9);
  const all = groups.flatMap(g => g.emojis);
  assert.ok(all.length > 1800);
  assert.ok(all.some(e => e.skin));
  assert.ok(all.every(e => e.name && e.slug && e.group));
});

test('search ranks name prefixes before word starts and substrings, case-insensitively', () => {
  const results = searchEmojis(groups, 'Heart');
  assert.ok(results.length > 10);
  const firstNonPrefix = results.findIndex(r => !r.name.toLowerCase().startsWith('heart'));
  assert.ok(firstNonPrefix > 0, 'prefix matches come first');
  assert.ok(results.slice(firstNonPrefix).every(r => !r.name.toLowerCase().startsWith('heart')));
  const cat = searchEmojis(groups, 'cat');
  assert.ok(cat[0].name.startsWith('cat'));
  assert.ok(
    cat.some(r => r.name === 'grinning cat'),
    'word-start matches are included',
  );
  assert.ok(
    searchEmojis(groups, 'thumbs_up').some(r => r.emoji === '👍'),
    'slug search works',
  );
  assert.deepEqual(searchEmojis(groups, '   '), []);
  assert.deepEqual(searchEmojis(groups, 'zzqqxx'), []);
  assert.equal(searchEmojis(groups, 'a', 50).length, 50);
});

test('skin tones are inserted after the first code point and replace a variation selector', () => {
  assert.equal(applySkinTone('👋', '\u{1F3FD}'), '👋🏽');
  assert.equal(applySkinTone('☝️', '\u{1F3FB}'), '☝🏻', 'U+FE0F is replaced by the modifier');
  assert.equal(applySkinTone('🧑‍💻', '\u{1F3FE}'), '🧑🏾‍💻', 'ZWJ sequences keep their tail');
  assert.equal(applySkinTone('👍', ''), '👍');
});

test('recent list is most-recent-first, de-duplicated and capped', () => {
  let list: string[] = [];
  for (let i = 0; i < 30; i++) list = pushRecent(list, String.fromCodePoint(0x1f600 + i));
  assert.equal(list.length, RECENT_LIMIT);
  assert.equal(list[0], String.fromCodePoint(0x1f600 + 29));
  list = pushRecent(list, list[5]);
  assert.equal(list[0], String.fromCodePoint(0x1f600 + 24));
  assert.equal(new Set(list).size, list.length);
  assert.ok(isRecentList(list));
  assert.ok(!isRecentList(['<b>']));
});

test('stored preferences survive missing or broken storage', () => {
  const g = globalThis as { localStorage?: Storage };
  const saved = g.localStorage;
  const map = new Map<string, string>();
  g.localStorage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) } as Storage;
  writeStored('k', ['😀']);
  assert.deepEqual(readStored('k', [], isRecentList), ['😀']);
  map.set('k', '{not json');
  assert.deepEqual(readStored('k', [], isRecentList), []);
  g.localStorage = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  } as unknown as Storage;
  assert.deepEqual(readStored('k', ['x'], isRecentList), ['x']);
  assert.doesNotThrow(() => writeStored('k', []));
  g.localStorage = saved;
});

test('emoji values are validated', () => {
  assert.ok(isValidEmojiValue('👨‍👩‍👧‍👦'));
  assert.ok(isValidEmojiValue('👩🏽‍❤️‍💋‍👨🏿'));
  for (const bad of ['', 'x'.repeat(33), '<img>', 'a\u0007', 42, null]) assert.ok(!isValidEmojiValue(bad));
});

test('stamps accept built-in kinds and emoji; notes keep ZWJ markers through JSON', () => {
  const stamp = createItem('stamp', 0, 0),
    emojiStamp = { ...createItem('stamp', 100, 0), data: { stamp: 'emoji', emoji: '🧑🏾‍💻' } },
    note = { ...createItem('note', 200, 0), emoji: '👨‍👩‍👧‍👦' },
    board = { ...newBoard(), items: [stamp, emojiStamp, note] };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))), board);
  for (const data of [
    { stamp: 'emoji' },
    { stamp: 'emoji', emoji: '' },
    { stamp: 'emoji', emoji: '<script>' },
    { stamp: 'emoji', emoji: 'x'.repeat(40) },
    { stamp: 'sparkle' },
  ])
    assert.throws(() => parseBoard({ ...newBoard(), items: [{ ...stamp, data }] }));
  assert.throws(() => parseBoard({ ...newBoard(), items: [{ ...note, emoji: 'x'.repeat(33) }] }));
});
