import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, commit, undo } from '../src/model.ts';
import type { Item, Board, ImageAsset, RecordRow } from '../src/model.ts';
import {
  fitImage,
  createImageItem,
  applyCrop,
  replaceImage,
  clampCrop,
  cropViewBox,
  withAssets,
  splitAssets,
  imageFileError,
} from '../src/images.ts';
import { setNoteEmoji, convertNote, datasetChoices } from '../src/notes.ts';
import {
  searchBoard,
  minimapExtent,
  minimapScale,
  viewportRect,
  centerOn,
  presentationFrames,
  moveInPresentation,
  fitFrame,
} from '../src/navigation.ts';
import { applyFrameFormat, presetSize } from '../src/frame-presets.ts';
import {
  moveRecord,
  shiftRecord,
  addDependency,
  dependencyError,
  deleteRecord,
  setMilestone,
  recordsError,
  timelineGeometry,
} from '../src/records.ts';
import { connectorGeometry } from '../src/connector-geometry.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const png = 'data:image/png;base64,iVBORw0KGgo=';
const asset: ImageAsset = { mime: 'image/png', data: png, width: 800, height: 400, name: 'wide.png' };
const history = (current: Board) =>
  ({ past: [], current, future: [] }) as { past: Board[]; current: Board; future: Board[] };

// Item 10 — images
test('images keep their aspect ratio, reject unsupported files and round-trip through JSON with their data', () => {
  assert.deepEqual(fitImage(800, 400), { w: 480, h: 240 });
  assert.deepEqual(fitImage(100, 50), { w: 100, h: 50 });
  assert.match(imageFileError({ type: 'image/svg+xml', size: 10 })!, /not a supported image/);
  assert.match(imageFileError({ type: 'image/png', size: 5e6 })!, /larger than 4 MB/);
  assert.equal(imageFileError({ type: 'image/webp', size: 10 }), null);
  const item = createImageItem('asset-1', asset, { x: 0, y: 0 }),
    doc = board(item),
    backup = withAssets(doc, { 'asset-1': asset, unused: asset });
  assert.deepEqual(Object.keys(backup.assets!), ['asset-1']);
  const parsed = parseBoard(JSON.parse(JSON.stringify(backup))),
    split = splitAssets(parsed, {});
  assert.deepEqual(split.board, doc);
  assert.deepEqual(split.assets['asset-1'], asset);
  assert.equal(split.missing, 0);
  assert.equal(splitAssets(doc, {}).missing, 1);
  assert.throws(() =>
    parseBoard({ ...backup, assets: { 'asset-1': { ...asset, data: 'data:text/html;base64,PHNjcmlwdD4=' } } }),
  );
  assert.throws(() => parseBoard(board({ ...item, assetId: undefined })));
});
// Item 11 — crop and replace
test('cropping stores normalised geometry, keeps the original data and adjusts the frame to the crop aspect', () => {
  const item = { ...createImageItem('a', asset, { x: 240, y: 120 }), x: 0, y: 0, w: 400, h: 200 };
  let h = history(board(item));
  h = commit(h, applyCrop(h.current, item.id, { x: 0.25, y: 0, w: 0.5, h: 1 }, asset));
  const cropped = h.current.items[0];
  assert.deepEqual(cropped.crop, { x: 0.25, y: 0, w: 0.5, h: 1 });
  assert.equal(cropped.w, 400);
  assert.equal(cropped.h, 400);
  assert.equal(cropped.y, -100);
  assert.equal(cropped.assetId, 'a');
  assert.equal(cropViewBox(asset, cropped.crop), '200 0 400 400');
  assert.deepEqual(undo(h).current.items[0], item);
  assert.equal(applyCrop(h.current, item.id, null, asset).items[0].crop, undefined);
  assert.deepEqual(clampCrop({ x: 0.9, y: -1, w: 0.5, h: 3 }), { x: 0.5, y: 0, w: 0.5, h: 1 });
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(h.current))).items[0].crop, cropped.crop);
  assert.throws(() => parseBoard(board({ ...cropped, crop: { x: 0.8, y: 0, w: 0.5, h: 1 } })));
  const tall: ImageAsset = { ...asset, width: 300, height: 600, name: 'tall.png' },
    replaced = replaceImage(h.current, item.id, 'b', tall).items[0];
  assert.equal(replaced.assetId, 'b');
  assert.equal(replaced.x, 0);
  assert.equal(replaced.w, 400);
  assert.equal(replaced.h, 800);
  assert.equal(replaced.crop, undefined);
});

// Item 12 — emoji
test('note markers are set, changed and removed as note metadata and survive JSON', () => {
  const note = createItem('note', 0, 0),
    shape = createItem('rectangle', 300, 0);
  let b = setNoteEmoji(board(note, shape), [note.id, shape.id], '🎉');
  assert.equal(b.items[0].emoji, '🎉');
  assert.equal(b.items[1].emoji, undefined);
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
  b = setNoteEmoji(b, [note.id], undefined);
  assert.equal('emoji' in b.items[0], false);
  assert.throws(() => parseBoard(board({ ...note, emoji: '<img>' })));
  assert.throws(() => parseBoard(board({ ...note, emoji: '' })));
});
// Item 13 — conversion
test('notes convert to text and shapes keeping id, content and connectors; one undo restores the note', () => {
  const note = {
      ...createItem('note', 0, 0, '#a8cdff'),
      text: 'Idea',
      tags: ['ux'],
      link: 'https://example.com/',
      emoji: '💡',
      format: { valign: 'top' as const, bold: true },
    },
    other = createItem('note', 400, 0),
    line = { ...createItem('arrow', 0, 0), from: note.id, to: other.id };
  let h = history(board(note, other, line));
  const text = convertNote(h.current, note.id, { kind: 'text' }).board.items[0];
  assert.equal(text.type, 'text');
  assert.equal(text.id, note.id);
  assert.equal(text.text, 'Idea');
  assert.deepEqual(text.tags, ['ux']);
  assert.equal(text.emoji, undefined);
  assert.equal(text.format?.valign, undefined);
  assert.equal(text.format?.bold, true);
  h = commit(h, convertNote(h.current, note.id, { kind: 'shape', shape: 'hexagon' }).board);
  const shape = h.current.items[0];
  assert.equal(shape.type, 'hexagon');
  assert.equal(shape.fill, '#a8cdff');
  assert.equal(h.current.items[2].from, note.id);
  assert.ok(!/NaN/.test(connectorGeometry(h.current.items[2], h.current.items).path));
  assert.deepEqual(undo(h).current.items[0], note);
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(h.current))), h.current);
});
test('notes convert into a selected or new dataset and connectors re-attach to the dataset view', () => {
  const note = { ...createItem('note', 100, 100), text: 'Ship it', tags: ['launch'] },
    other = createItem('note', 600, 0),
    line = { ...createItem('arrow', 0, 0), from: other.id, to: note.id };
  const table = { ...createItem('kanban', 0, 600), datasetId: 'd1' },
    b0 = {
      ...board(note, other, line, table),
      datasets: {
        d1: [{ id: 'r1', title: 'Existing', status: 'In progress', assignee: '', start: '', end: '' } as RecordRow],
      },
    };
  assert.deepEqual(
    datasetChoices(b0).map(d => d.id),
    ['d1'],
  );
  const into = convertNote(b0, note.id, { kind: 'record', datasetId: 'd1' });
  assert.equal(
    into.board.items.some(i => i.id === note.id),
    false,
  );
  assert.equal(into.board.datasets!.d1.at(-1)!.title, 'Ship it');
  assert.deepEqual(into.board.datasets!.d1.at(-1)!.tags, ['launch']);
  assert.equal(into.board.items.find(i => i.id === line.id)!.to, table.id);
  assert.equal(into.selectId, table.id);
  parseBoard(JSON.parse(JSON.stringify(into.board)));
  const fresh = convertNote(b0, note.id, { kind: 'record', datasetId: 'new' }),
    view = fresh.board.items.find(i => i.id === fresh.selectId)!;
  assert.equal(view.type, 'table');
  assert.equal(fresh.board.datasets![view.datasetId!][0].title, 'Ship it');
  assert.equal(fresh.board.items.find(i => i.id === line.id)!.to, view.id);
  assert.throws(() => convertNote(b0, table.id, { kind: 'text' }));
  assert.throws(() => convertNote(b0, note.id, { kind: 'record', datasetId: 'missing' }));
});

// Item 14 — search
test('search finds text, connector labels, tags and topics without changing the board', () => {
  const note = { ...createItem('note', 0, 0), text: 'Quarterly roadmap', tags: ['Planning'] },
    line = { ...createItem('arrow', 0, 0), text: 'depends on roadmap' },
    tagged = { ...createItem('note', 0, 0), text: 'Other', tags: ['plan-b'] },
    b = board(note, line, tagged),
    before = JSON.stringify(b);
  assert.deepEqual(
    searchBoard(b, 'ROADMAP').map(r => [r.id, r.field]),
    [
      [note.id, 'text'],
      [line.id, 'label'],
    ],
  );
  assert.deepEqual(
    searchBoard(b, 'plan').map(r => r.field),
    ['tag', 'tag'],
  );
  assert.deepEqual(searchBoard(b, '   '), []);
  assert.deepEqual(searchBoard(b, 'zzz'), []);
  assert.equal(JSON.stringify(b), before);
  const big = board(...Array.from({ length: 2000 }, (_, i) => ({ ...createItem('note', i, 0), text: `note ${i}` }))),
    t = performance.now();
  assert.equal(searchBoard(big, 'note').length, 500);
  assert.ok(performance.now() - t < 500);
});
// Item 15 — minimap
test('minimap extent covers objects and viewport and maps clicks back to camera positions', () => {
  const items = [createItem('note', -5000, 0), createItem('note', 5000, 3000)],
    camera = { x: 100, y: 50, z: 0.5 },
    size = { w: 1000, h: 800 },
    view = viewportRect(camera, size);
  assert.deepEqual(view, { x: -200, y: -100, w: 2000, h: 1600 });
  const extent = minimapExtent(items, view);
  assert.ok(extent.x < -5000 && extent.x + extent.w > 5210);
  const empty = minimapExtent([], view);
  assert.ok(empty.w > view.w);
  const m = minimapScale(extent, 200, 140);
  assert.ok(m.scale > 0 && Number.isFinite(m.ox));
  const c = centerOn({ x: 0, y: 0 }, camera, size);
  assert.deepEqual(viewportRect(c, size), { x: -1000, y: -800, w: 2000, h: 1600 });
});
// Items 16–17 — frame presets and presentation
test('frame presets set exact dimensions and orientation without moving contents', () => {
  const frame = createItem('frame', 0, 0),
    inner = createItem('note', 20, 20),
    b = board(frame, inner);
  const a4 = applyFrameFormat(b, frame.id, 'a4', 'portrait');
  assert.deepEqual([a4.items[0].w, a4.items[0].h], [794, 1123]);
  assert.deepEqual(a4.items[1], inner);
  const wide = applyFrameFormat(b, frame.id, 'a4', 'landscape');
  assert.deepEqual([wide.items[0].w, wide.items[0].h], [1123, 794]);
  assert.deepEqual(presetSize('16:9', 'portrait'), { w: 720, h: 1280 });
  const custom = applyFrameFormat(b, frame.id, 'custom', 'portrait', { w: 300, h: 500 });
  assert.deepEqual([custom.items[0].w, custom.items[0].h, custom.items[0].frame?.preset], [300, 500, 'custom']);
  assert.throws(() => applyFrameFormat(b, frame.id, 'custom', 'portrait', { w: 10, h: 500 }));
  assert.throws(() => applyFrameFormat(b, inner.id, 'a4', 'portrait'));
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(a4))), a4);
  assert.throws(() => parseBoard(board({ ...frame, frame: { preset: 'poster', orientation: 'portrait' } })));
});
test('presentation order persists, skips deleted frames and fits frames to the screen', () => {
  const f1 = createItem('frame', 0, 0),
    f2 = createItem('frame', 1000, 0),
    f3 = createItem('frame', 2000, 0);
  let b = board(f1, f2, f3);
  assert.deepEqual(
    presentationFrames(b).map(f => f.id),
    [f1.id, f2.id, f3.id],
  );
  b = moveInPresentation(b, f3.id, -1);
  assert.deepEqual(b.presentation, [f1.id, f3.id, f2.id]);
  const stale = { ...b, presentation: ['gone', f2.id] };
  assert.deepEqual(
    presentationFrames(stale).map(f => f.id),
    [f2.id, f1.id, f3.id],
  );
  parseBoard(stale);
  const cam = fitFrame(f1, { w: 1200, h: 900 });
  assert.ok(cam.z > 0);
  const left = -cam.x / cam.z;
  assert.ok(left <= f1.x);
});
// Items 18–19 — Kanban and Timeline
const row = (id: string, status: RecordRow['status'] = 'Not started', extra: Partial<RecordRow> = {}): RecordRow => ({
  id,
  title: id,
  status,
  assignee: '',
  start: '',
  end: '',
  ...extra,
});
test('kanban moves change status and order between and within columns, with keyboard equivalents', () => {
  const rows = [row('a'), row('b'), row('c', 'In progress'), row('d', 'In progress')];
  assert.deepEqual(
    moveRecord(rows, 'a', 'In progress', 'd').map(r => [r.id, r.status]),
    [
      ['b', 'Not started'],
      ['c', 'In progress'],
      ['a', 'In progress'],
      ['d', 'In progress'],
    ],
  );
  assert.deepEqual(
    moveRecord(rows, 'b', 'Not started', 'a').map(r => r.id),
    ['b', 'a', 'c', 'd'],
  );
  assert.deepEqual(moveRecord(rows, 'a', 'Complete', null).at(-1), { ...rows[0], status: 'Complete' });
  assert.equal(
    moveRecord(rows, 'a', 'Not started', 'b')
      .map(r => r.id)
      .join(''),
    'abcd',
  );
  assert.throws(() => moveRecord(rows, 'zz', 'Complete', null));
  assert.deepEqual(
    shiftRecord(rows, 'b', 'up').map(r => r.id),
    ['b', 'a', 'c', 'd'],
  );
  assert.equal(shiftRecord(rows, 'a', 'up'), rows);
  assert.equal(shiftRecord(rows, 'c', 'right').find(r => r.id === 'c')!.status, 'Complete');
  assert.equal(shiftRecord(rows, 'a', 'left'), rows);
  assert.deepEqual(
    shiftRecord(rows, 'd', 'up', new Set(['a', 'd'])).map(r => r.id),
    ['a', 'b', 'c', 'd'],
  );
});
test('milestones and dependencies validate dates, missing records and cycles; geometry follows dates', () => {
  let rows = [
    row('a', 'Not started', { start: '2026-01-01', end: '2026-01-10' }),
    row('b', 'Not started', { start: '2026-01-11', end: '2026-01-20' }),
    row('m'),
  ];
  assert.throws(() => setMilestone(rows, 'm', true), /date/);
  rows = rows.map(r => (r.id === 'm' ? { ...r, start: '2026-01-21' } : r));
  rows = setMilestone(rows, 'm', true);
  rows = addDependency(rows, 'b', 'a');
  rows = addDependency(rows, 'm', 'b');
  assert.equal(dependencyError(rows, 'a', 'm'), 'This dependency would create a cycle.');
  assert.equal(dependencyError(rows, 'a', 'a'), 'A task cannot depend on itself.');
  assert.match(dependencyError(rows, 'a', 'zz')!, /existing/);
  assert.throws(() => addDependency(rows, 'a', 'b'), /cycle/);
  const g = timelineGeometry(rows);
  assert.equal(g.bars.length, 3);
  assert.equal(g.bars[0].left, 0);
  assert.ok(Math.abs(g.bars[0].width - 10 / 21) < 1e-9);
  assert.equal(g.bars[2].milestone, true);
  assert.deepEqual(
    g.links.map(l => [l.from, l.to, l.late]),
    [
      ['a', 'b', false],
      ['b', 'm', false],
    ],
  );
  assert.equal(
    timelineGeometry([...rows.map(r => (r.id === 'b' ? { ...r, start: '2026-01-05' } : r))]).links[0].late,
    true,
  );
  const pruned = deleteRecord(rows, 'a');
  assert.equal(pruned.find(r => r.id === 'b')!.dependsOn, undefined);
  assert.equal(recordsError(pruned), null);
  assert.match(recordsError([{ ...rows[0], dependsOn: ['ghost'] }])!, /missing/);
  assert.match(recordsError([{ ...rows[0], end: '2025-01-01' }])!, /ends before/);
  const doc = { ...newBoard(), datasets: { d: rows }, items: [{ ...createItem('timeline', 0, 0), datasetId: 'd' }] };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(doc))), doc);
  assert.throws(
    () =>
      parseBoard({
        ...doc,
        datasets: {
          d: [
            { ...rows[0], dependsOn: ['b'] },
            { ...rows[1], dependsOn: ['a'] },
          ],
        },
      }),
    /cycle/,
  );
});
