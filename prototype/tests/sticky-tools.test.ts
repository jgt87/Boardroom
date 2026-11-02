import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createItem,
  newBoard,
  parseBoard,
  normalizeNoteLink,
  normalizeNoteTags,
  addConnectedNote,
  commit,
  undo,
  redo,
  endpoints,
} from '../src/model.ts';
test('note metadata and vertical alignment survive JSON and reject malformed imports', () => {
  const note = {
      ...createItem('note', 20, 30),
      format: { valign: 'bottom' as const, fontSize: 'auto' as const },
      link: normalizeNoteLink('example.com'),
      tags: normalizeNoteTags('Research, Priority, Research'),
    },
    board = { ...newBoard(), items: [note] };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))), board);
  assert.deepEqual(note.tags, ['Research', 'Priority']);
  assert.equal(note.link, 'https://example.com/');
  for (const link of ['javascript:alert(1)', 'data:text/html,bad', 'https://user:pass@example.com/'])
    assert.throws(() => normalizeNoteLink(link));
  assert.throws(() => parseBoard({ ...board, items: [{ ...note, tags: ['x', 'x'] }] }));
  assert.throws(() => parseBoard({ ...board, items: [{ ...note, format: { valign: 'invalid' } }] }));
  assert.throws(() => normalizeNoteTags('x'.repeat(33)));
  assert.equal(normalizeNoteLink('  '), undefined);
});
test('connected quick-add preserves appearance, clears metadata and creates one undoable transaction', () => {
  const source = {
      ...createItem('note', 100, 200, '#a8cdff'),
      w: 140,
      h: 140,
      text: 'Original',
      format: { fontSize: 'auto' as const, valign: 'top' as const },
      link: 'https://example.com/',
      tags: ['Keep here'],
    },
    board = { ...newBoard(), items: [source] },
    result = addConnectedNote(board, source.id);
  assert.equal(result.note.text, '');
  assert.equal(result.note.link, undefined);
  assert.equal(result.note.tags, undefined);
  assert.equal(result.note.w, 140);
  assert.equal(result.note.fill, source.fill);
  assert.deepEqual(result.note.format, source.format);
  assert.notEqual(result.note.format, source.format);
  assert.equal(result.connector.from, source.id);
  assert.equal(result.connector.to, result.note.id);
  assert.equal(board.items.length, 1);
  const h = commit({ past: [], current: board, future: [] }, result.board);
  assert.equal(h.past.length, 1);
  assert.deepEqual(undo(h).current, board);
  assert.equal(redo(undo(h)).current.items.length, 3);
  const changed = { ...result.note, x: result.note.x + 100 };
  assert.notDeepEqual(
    endpoints(result.connector, result.board.items),
    endpoints(result.connector, [source, changed, result.connector]),
  );
});
test('connected quick-add avoids an occupied neighbor and rejects unsupported sources', () => {
  const source = createItem('note', 0, 0),
    occupied = createItem('rectangle', source.w + 80, 0),
    board = { ...newBoard(), items: [source, occupied] },
    result = addConnectedNote(board, source.id);
  assert.ok(result.note.y >= occupied.y + occupied.h);
  assert.throws(() => addConnectedNote(board, occupied.id));
  assert.throws(() => addConnectedNote(board, 'missing'));
});
