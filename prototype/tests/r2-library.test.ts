// Track R2-I: board emoji, backups of one or selected boards, boards in the same space, catch-up steps, batch
// restore that keeps connectors attached, saved view order, Timeline flags and bar warnings, and status chips on
// Mermaid, mind-map and draw.io objects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item, RecordRow } from '../src/model.ts';
import {
  addBoards,
  boardEmoji,
  boardsInSameSpace,
  createBoard,
  duplicateBoard,
  openLibrary,
  saveActive,
  setBoardMeta,
  INDEX_KEY,
} from '../src/board-library.ts';
import type { KeyValueStore } from '../src/board-library.ts';
import { encodeLibrary, decodeLibrary } from '../src/library-backup.ts';
import { catchUpSteps, diffActivity, restorable, restoreMany, type Activity } from '../src/activity.ts';
import { moveRecordView, saveRecordView, type RecordSchema } from '../src/record-schema.ts';
import {
  addTimelineFlag,
  flagLeft,
  removeTimelineFlag,
  timelineAxis,
  validateTimelineSettings,
  TIMELINE_FLAG_LIMIT,
} from '../src/timeline-axis.ts';
import { timelineBarIssue } from '../src/records.ts';
import { validateRecordView } from '../src/record-query.ts';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
const board = (title: string, ...items: Item[]): Board => ({ ...newBoard(), title, items });
const note = (id: string, x = 0): Item => ({ ...createItem('note', x, 0), id, text: id });

function threeBoards() {
  const kv = new MemoryStore();
  let { library: lib } = openLibrary(kv, parseBoard, newBoard);
  lib = saveActive(kv, lib, board('Alpha', note('a1')));
  const a = lib.activeId;
  const b = createBoard(kv, lib, board('Beta', note('b1')));
  const c = createBoard(kv, b.library, board('Gamma', note('c1')));
  return { kv, lib: c.library, a, b: b.id, c: c.id };
}

// ---- 1. Board emoji ------------------------------------------------------------------------------------

test('board emoji is set, cleaned, kept on save and duplicate, and removed', () => {
  const { kv, lib, a } = threeBoards();
  let next = setBoardMeta(kv, lib, a, { emoji: ' 🚀 ' });
  assert.equal(next.boards.find(b => b.id === a)!.emoji, '🚀');
  assert.equal(JSON.parse(kv.getItem(INDEX_KEY)!).boards.find((b: { id: string }) => b.id === a).emoji, '🚀');
  // Markup and over-long values are rejected (the emoji is removed instead).
  assert.equal(setBoardMeta(kv, next, a, { emoji: '<b>' }).boards.find(b => b.id === a)!.emoji, undefined);
  assert.equal(setBoardMeta(kv, next, a, { emoji: 'x'.repeat(20) }).boards.find(b => b.id === a)!.emoji, undefined);
  // Saving the active board keeps it; a copy inherits it.
  next = saveActive(kv, { ...next, activeId: a }, board('Alpha', note('a1'), note('a2')));
  assert.equal(next.boards.find(b => b.id === a)!.emoji, '🚀');
  const copy = duplicateBoard(kv, next, a, parseBoard);
  assert.equal(copy.library.boards.find(b => b.id === copy.id)!.emoji, '🚀');
  next = setBoardMeta(kv, next, a, { emoji: null });
  assert.equal(next.boards.find(b => b.id === a)!.emoji, undefined);
  // An edited index with a bad emoji is read as none.
  assert.equal(boardEmoji({ emoji: '<script>' }), '');
  assert.equal(boardEmoji(undefined), '');
});

test('boards in the same space: other live boards of the space, or boards without a space', () => {
  const { kv, lib, a, b, c } = threeBoards();
  let next = setBoardMeta(kv, lib, [a, b], { space: 'Product' });
  const product = boardsInSameSpace(next, a);
  assert.equal(product.space, 'Product');
  assert.deepEqual(
    product.boards.map(x => x.id),
    [b],
  );
  assert.deepEqual(
    boardsInSameSpace(next, c).boards.map(x => x.id),
    [],
  );
  assert.equal(boardsInSameSpace(next, c).space, undefined);
  next = { ...next, boards: next.boards.map(x => (x.id === b ? { ...x, deletedAt: new Date().toISOString() } : x)) };
  assert.deepEqual(boardsInSameSpace(next, a).boards, []);
});

// ---- 2. Backup of one or selected boards ----------------------------------------------------------------

test('a backup of selected boards holds only those boards, their spaces, emoji and media', () => {
  const { kv, lib, a, b, c } = threeBoards();
  let next = setBoardMeta(kv, lib, a, { space: 'Product', emoji: '📌' });
  next = setBoardMeta(kv, next, c, { space: 'Ops' });
  next = { ...next, spaceInfo: { Product: { emoji: '🧭' }, Ops: { description: 'Runbooks' } } };
  // Board b uses an image whose media must be left out of a backup of a only.
  const img = { ...createItem('image', 0, 0), id: 'img', assetId: 'asset1' };
  kv.setItem(`boardroom.board.${b}`, JSON.stringify(board('Beta', img)));
  const assets = {
    asset1: { mime: 'image/png', data: 'data:image/png;base64,iVBORw0KGgo=', width: 1, height: 1, name: 'x' },
  };
  const one = encodeLibrary(kv, next, assets, '2026-01-01T00:00:00.000Z', [], [], [a]);
  assert.equal(one.boards, 1);
  assert.equal(one.media, 0);
  const read = decodeLibrary(one.bytes, parseBoard);
  assert.equal(read.entries.length, 1);
  assert.equal(read.entries[0].board.title, 'Alpha');
  assert.equal(read.entries[0].meta.emoji, '📌');
  assert.equal(read.entries[0].meta.space, 'Product');
  assert.deepEqual(Object.keys(read.spaceInfo), ['Product']);
  const two = decodeLibrary(encodeLibrary(kv, next, assets, undefined, [], [], [a, b]).bytes, parseBoard);
  assert.equal(two.entries.length, 2);
  assert.ok(two.assets.asset1);
  // Restoring adds the boards with their emoji.
  const fresh = new MemoryStore();
  const opened = openLibrary(fresh, parseBoard, newBoard).library;
  const added = addBoards(fresh, opened, read.entries);
  assert.equal(added.library.boards.find(x => x.id === added.ids[0])!.emoji, '📌');
});

// ---- 3. Catch-up steps ------------------------------------------------------------------------------------

test('catch-up steps list changed objects still on the board, oldest change first, once each', () => {
  const at = (m: number) => new Date(Date.UTC(2026, 0, 1, 10, m)).toISOString();
  const log: Activity[] = [
    { id: 'e4', at: at(40), action: 'edited', itemId: 'n1', type: 'note', label: 'later edit' },
    { id: 'e3', at: at(30), action: 'deleted', itemId: 'gone', type: 'note', label: '' },
    { id: 'e2', at: at(20), action: 'added', itemId: 'n2', type: 'note', label: '' },
    { id: 'e1', at: at(10), action: 'added', itemId: 'n1', type: 'note', label: '' },
    { id: 'e0', at: at(0), action: 'added', itemId: 'old', type: 'note', label: '' },
  ];
  const steps = catchUpSteps(log, Date.parse(at(5)), new Set(['n1', 'n2', 'old']));
  assert.deepEqual(
    steps.map(s => s.itemId),
    ['n2', 'n1'],
  );
  assert.equal(steps[1].label, 'later edit');
});

// ---- 4. Batch restore -------------------------------------------------------------------------------------

test('restoring several deleted objects is one change and re-attaches connectors deleted with them', () => {
  const a = note('a'),
    b = note('b', 400),
    c = note('c', 800);
  const ab = { ...createItem('arrow', 0, 0), id: 'ab', from: 'a', to: 'b' };
  const bc = { ...createItem('arrow', 0, 0), id: 'bc', from: 'b', to: 'c' };
  const before = board('Flow', a, b, c, ab, bc);
  // Deleting a and b also removes both connectors (as the app does); c stays.
  const after = board('Flow', c);
  let n = 0;
  const log = diffActivity(before, after, '2026-01-01T10:00:00.000Z', () => `e${++n}`);
  assert.equal(log.filter(e => e.action === 'deleted').length, 4);
  const shapes = log.filter(e => e.itemId === 'a' || e.itemId === 'b');
  assert.ok(shapes.every(e => restorable(after, e)));
  const made = restoreMany(after, shapes, log)!;
  assert.ok(made);
  assert.equal(made.reattached, 2);
  assert.equal(made.detached, 0);
  const ids = made.board.items.map(i => i.id);
  assert.deepEqual(ids.slice(0, 3), ['c', 'a', 'b']);
  assert.deepEqual(ids.slice(3).sort(), ['ab', 'bc']);
  assert.equal(made.board.items.find(i => i.id === 'ab')!.from, 'a');
  parseBoard(made.board);
  // Nothing left to restore once everything is back.
  assert.equal(restoreMany(made.board, shapes, log), null);
});

test('restoring a connector alone detaches the end whose object is missing', () => {
  const ab = { ...createItem('arrow', 10, 20), id: 'ab', from: 'a', to: 'b' };
  const before = board('Flow', note('a'), note('b', 400), ab);
  const after = board('Flow', note('b', 400));
  let n = 0;
  const log = diffActivity(before, after, '2026-01-01T10:00:00.000Z', () => `e${++n}`);
  const made = restoreMany(
    after,
    log.filter(e => e.itemId === 'ab'),
  )!;
  const arrow = made.board.items.find(i => i.id === 'ab')!;
  assert.equal(arrow.from, undefined);
  assert.equal(arrow.to, 'b');
  assert.equal(made.detached, 1);
  assert.equal(arrow.x, 10);
  // A connector deleted at another time is not brought back with its shape.
  const lone: Activity = { ...log.find(e => e.itemId === 'ab')!, at: '2025-12-31T00:00:00.000Z' };
  const shapeOnly = restoreMany(after, [log.find(e => e.itemId === 'a')!], [lone])!;
  assert.deepEqual(shapeOnly.restored, ['a']);
});

// ---- 6. Saved view order ----------------------------------------------------------------------------------

test('saved views move to a new position, clamped, and unknown ids change nothing', () => {
  let schema: RecordSchema = { fields: [], statuses: ['Not started', 'In progress', 'Complete'] } as RecordSchema;
  let k = 0;
  for (const name of ['One', 'Two', 'Three']) schema = saveRecordView(schema, name, {}, () => `v${++k}`).schema;
  const names = (s: RecordSchema) => s.views!.map(v => v.name);
  assert.deepEqual(names(moveRecordView(schema, 'v3', 0)), ['Three', 'One', 'Two']);
  assert.deepEqual(names(moveRecordView(schema, 'v1', 99)), ['Two', 'Three', 'One']);
  assert.deepEqual(names(moveRecordView(schema, 'v2', -5)), ['Two', 'One', 'Three']);
  assert.equal(moveRecordView(schema, 'nope', 0), schema);
  assert.equal(moveRecordView(schema, 'v1', 0), schema);
});

// ---- 7. Timeline flags and bar warnings -------------------------------------------------------------------

test('Timeline flags are added, validated, widen the autofit range and are removed', () => {
  let s = addTimelineFlag({}, { date: '2026-03-10', label: ' Launch <b> ', color: '#e5484d' }, () => 'f1');
  assert.deepEqual(s.flags, [{ id: 'f1', date: '2026-03-10', label: 'Launch b', color: '#e5484d' }]);
  validateTimelineSettings(s);
  validateRecordView({ timeline: s }, { fields: [], statuses: [] } as unknown as RecordSchema);
  assert.throws(() => addTimelineFlag(s, { date: '2026-02-31', label: '', color: '#e5484d' }), /date/);
  assert.throws(() => validateTimelineSettings({ flags: [{ id: 'x', date: '2026-01-01', label: '', color: 'red' }] }));
  assert.throws(() =>
    validateTimelineSettings({
      flags: [
        { id: 'x', date: '2026-01-01', label: '', color: '#000000' },
        { id: 'x', date: '2026-01-02', label: '', color: '#000000' },
      ],
    }),
  );
  assert.throws(() =>
    validateTimelineSettings({ flags: [{ id: 'x', date: '2026-01-01', label: 'a\u0001', color: '#000000' }] }),
  );
  const many = {
    flags: Array.from({ length: TIMELINE_FLAG_LIMIT }, (_, k) => ({
      id: `f${k}`,
      date: '2026-01-01',
      label: '',
      color: '#000000',
    })),
  };
  assert.throws(() => addTimelineFlag(many, { date: '2026-01-01', label: '', color: '#000000' }), /up to/);
  // The autofit range includes the flag date; positions are inside 0..1.
  const rows = [
    { id: 'r', title: 'R', status: 'Not started', assignee: '', start: '2026-01-05', end: '2026-01-09' },
  ] as RecordRow[];
  const axis = timelineAxis(rows, s, 600, '2026-01-01');
  assert.ok(axis.max >= Date.parse('2026-03-10'));
  const left = flagLeft('2026-03-10', axis)!;
  assert.ok(left > 0.5 && left < 1);
  assert.equal(flagLeft('2030-01-01', axis), null);
  s = removeTimelineFlag(s, 'f1');
  assert.equal(s.flags, undefined);
});

test('Timeline bar warnings: unreal dates, end before start, milestone ranges and late dependencies', () => {
  const row = (patch: Partial<RecordRow>): RecordRow =>
    ({
      id: 'r',
      title: 'Build',
      status: 'Not started',
      assignee: '',
      start: '2026-01-05',
      end: '2026-01-09',
      ...patch,
    }) as RecordRow;
  assert.equal(timelineBarIssue(row({})), null);
  assert.match(timelineBarIssue(row({ end: '2026-02-31' }))!, /not a real calendar day/);
  assert.equal(timelineBarIssue(row({ end: '2026-01-01' })), 'Ends before it starts.');
  assert.match(timelineBarIssue(row({ milestone: true }))!, /single date/);
  const design = row({ id: 'd', title: 'Design', start: '2026-01-01', end: '2026-01-06' });
  assert.match(timelineBarIssue(row({ dependsOn: ['d'] }), [design])!, /Starts before “Design” ends/);
  assert.equal(timelineBarIssue(row({ dependsOn: ['d'] }), [{ ...design, end: '2026-01-04' }]), null);
});

// ---- 8. Status chips on Mermaid, mind-map and draw.io -----------------------------------------------------

test('Mermaid, mind-map and draw.io objects accept a board status and reject unknown ones', () => {
  for (const kind of ['mermaid', 'mindmap', 'drawio'] as const) {
    const made = createItem(kind, 0, 0);
    const base = kind === 'mindmap' ? { ...made, nodes: [{ id: 'root', parent: null, text: 'Idea' }] } : made;
    const withStatus = { ...base, data: { ...(base.data ?? {}), status: 'review' } };
    parseBoard(board('S', withStatus));
    const bad = { ...base, data: { ...(base.data ?? {}), status: 'shipped' } };
    assert.throws(() => parseBoard(board('S', bad)), /status/i, kind);
  }
  assert.throws(() => parseBoard(board('S', { ...createItem('mermaid', 0, 0), data: [] as unknown as Item['data'] })));
});
