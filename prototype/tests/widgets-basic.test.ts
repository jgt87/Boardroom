import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Item, Board } from '../src/model.ts';
import { basicSpecs } from '../src/specs-basic.ts';
import {
  newGrid,
  mergeCells,
  unmergeCell,
  addRow,
  addColumn,
  removeRow,
  removeColumn,
  setCell,
  setCellColor,
  setCellStyle,
  cellStyle,
  validateGrid,
  isCovered,
  mergeAt,
} from '../src/grid.ts';
import { qrMatrix, qrPath, QR_MAX } from '../src/qr.ts';
import {
  noteToCard,
  estimateTotals,
  matrixQuadrant,
  matrixContents,
  votePoll,
  pollResults,
  resetPoll,
  spin,
  randomIndex,
  clampScale,
} from '../src/facilitation-widgets.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const kinds = [
  'card',
  'flipcard',
  'grid',
  'divider',
  'stamp',
  'icon',
  'qr',
  'matrix',
  'poll',
  'spinner',
  'scale',
] as const;

test('every basic widget initialises valid data that survives a JSON round trip', () => {
  assert.deepEqual(basicSpecs.map(s => s.kind).sort(), [...kinds].sort());
  const items = kinds.map((k, i) => createItem(k, i * 400, 0));
  for (const i of items) {
    assert.ok(i.data, `${i.type} has data`);
    assert.ok(i.w > 0 && i.h > 0);
  }
  const b = board(...items);
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
});
test('validate rejects malformed data for each kind', () => {
  const bad: Record<string, Partial<Item>> = {
    card: { data: { description: '', assignee: '', due: '2026-02-30', status: 'Not started' } },
    flipcard: { data: { back: 5, flipped: false } },
    grid: { data: { ...newGrid(2, 2), cells: [['a']] } },
    divider: { data: { orientation: 'diagonal', style: 'solid', weight: 2 } },
    stamp: { data: { stamp: 'skull' } },
    icon: { data: { name: '<script>' } },
    qr: { text: 'x'.repeat(QR_MAX + 1) },
    matrix: { data: { xLabel: 'a', yLabel: 'b', quadrants: ['1', '2', '3'] } },
    poll: { data: { question: 'q', options: [{ id: 'a', label: 'A', votes: 0 }] } },
    spinner: { data: { options: [] } },
    scale: { data: { label: 's', min: 5, max: 1, value: 3, leftLabel: '', rightLabel: '' } },
  };
  for (const k of kinds) {
    const item = { ...createItem(k, 0, 0), ...bad[k] };
    assert.throws(() => parseBoard(board(item)), Error, k);
  }
  assert.throws(() =>
    parseBoard(
      board({ ...createItem('card', 0, 0), data: { description: '', assignee: '', due: '', status: 'Done' } }),
    ),
  );
  assert.throws(() =>
    parseBoard(
      board({
        ...createItem('card', 0, 0),
        data: { description: '', assignee: '', due: '', status: 'Complete', points: -1 },
      }),
    ),
  );
  assert.throws(() => parseBoard(board({ ...createItem('poll', 0, 0), data: [] as unknown as Item['data'] })));
});

test('grid merge, unmerge and structural edits keep merges consistent', () => {
  let g = setCell(setCell(newGrid(3, 3), 0, 0, 'A'), 0, 1, 'B');
  g = mergeCells(g, 0, 0, 1, 1);
  assert.deepEqual(g.merges, [{ r: 0, c: 0, rs: 2, cs: 2 }]);
  assert.equal(g.cells[0][0], 'A\nB');
  assert.equal(g.cells[0][1], '');
  assert.equal(isCovered(g, 1, 1), true);
  assert.throws(() => mergeCells(g, 1, 1, 2, 2), /fully contain/);
  assert.throws(() => mergeCells(g, 2, 2, 2, 2), /at least two/);
  const bigger = mergeCells(g, 0, 0, 2, 2);
  assert.deepEqual(bigger.merges, [{ r: 0, c: 0, rs: 3, cs: 3 }]);
  const inserted = addRow(g, 1);
  assert.equal(inserted.rows, 4);
  assert.deepEqual(inserted.merges, [{ r: 0, c: 0, rs: 3, cs: 2 }]);
  validateGrid(inserted);
  const col = addColumn(g, 0);
  assert.deepEqual(col.merges, [{ r: 0, c: 1, rs: 2, cs: 2 }]);
  validateGrid(col);
  const shrunk = removeRow(g, 0);
  assert.deepEqual(shrunk.merges, [{ r: 0, c: 0, rs: 1, cs: 2 }]);
  assert.equal(shrunk.cells[0][0], 'A\nB', 'anchor text moves with the merge');
  validateGrid(shrunk);
  const gone = removeColumn(removeRow(g, 0), 1);
  assert.deepEqual(gone.merges, []);
  validateGrid(gone);
  assert.deepEqual(unmergeCell(g, 1, 1).merges, []);
  assert.throws(() => unmergeCell(g, 2, 2));
  assert.throws(() => removeRow(newGrid(1, 2), 0));
  let wide = newGrid(1, 99);
  wide = addColumn(wide);
  assert.throws(() => addColumn(wide));
  assert.throws(() => addRow(newGrid(50, 50)), /2,500 cells/);
  const colored = setCellColor(newGrid(2, 2), 1, 1, '#ff0000');
  assert.deepEqual(removeRow(colored, 0).colors, { '0,1': '#ff0000' });
  assert.equal(removeRow(colored, 1).colors, undefined);
  assert.equal(mergeAt(g, 2, 2), undefined);
  assert.throws(
    () =>
      validateGrid({
        ...newGrid(2, 2),
        merges: [
          { r: 0, c: 0, rs: 2, cs: 1 },
          { r: 1, c: 0, rs: 1, cs: 2 },
        ],
      }),
    /overlap/,
  );
});

test('QR codes decode back to their content, including non-ASCII text', () => {
  for (const text of ['https://example.com/board?id=42', 'Ünïcode ✓ 漢字', 'x'.repeat(400)]) {
    const m = qrMatrix(text),
      quiet = 4,
      scale = 4,
      n = (m.length + quiet * 2) * scale,
      data = new Uint8ClampedArray(n * n * 4);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const r = Math.floor(y / scale) - quiet,
          c = Math.floor(x / scale) - quiet,
          dark = r >= 0 && c >= 0 && r < m.length && c < m.length && m[r][c],
          v = dark ? 0 : 255,
          o = (y * n + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = v;
        data[o + 3] = 255;
      }
    assert.equal(jsQR(data, n, n)?.data, text);
  }
  assert.throws(() => qrMatrix(''));
  assert.throws(() => qrMatrix('x'.repeat(QR_MAX + 1)));
  assert.match(
    qrPath(
      [
        [true, true, false],
        [false, true, false],
        [false, false, false],
      ],
      1,
    ),
    /^M1,1h2v1h-2z/,
  );
});

test('spinner picks uniformly within bounds and rejects modulo bias', () => {
  const counts = [0, 0, 0];
  for (let i = 0; i < 6000; i++) counts[randomIndex(3)]++;
  for (const c of counts) assert.ok(c > 1700 && c < 2300, `roughly uniform: ${counts}`);
  const values = [0xffffffff, 5];
  let k = 0;
  assert.equal(
    randomIndex(3, b => {
      b[0] = values[k++];
      return b;
    }),
    2,
    'value above the unbiased limit is rejected',
  );
  assert.equal(spin({ options: ['only'] }).result, 'only');
  assert.throws(() => spin({ options: ['  '] }));
  const r = spin({ options: ['a', 'b', 'c'] }).result!;
  assert.ok(['a', 'b', 'c'].includes(r));
});

test('matrix quadrants use object centres and count contained items', () => {
  const m = { ...createItem('matrix', 0, 0), w: 400, h: 400 };
  const at = (x: number, y: number) => ({ ...createItem('note', x - 10, y - 10), w: 20, h: 20 });
  assert.equal(matrixQuadrant(m, at(100, 100)), 0);
  assert.equal(matrixQuadrant(m, at(300, 100)), 1);
  assert.equal(matrixQuadrant(m, at(100, 300)), 2);
  assert.equal(matrixQuadrant(m, at(300, 300)), 3);
  assert.equal(matrixQuadrant(m, at(500, 100)), null);
  assert.equal(matrixQuadrant(m, m), null);
  const b = board(m, at(100, 100), at(110, 110), at(300, 300), { ...createItem('frame', 0, 0), w: 10, h: 10 });
  assert.deepEqual(
    matrixContents(b, m.id).map(q => q.length),
    [2, 0, 0, 1],
  );
  assert.deepEqual(
    matrixContents(b, 'missing').map(q => q.length),
    [0, 0, 0, 0],
  );
});

test('cards convert from notes keeping identity and sum estimates', () => {
  const note = {
      ...createItem('note', 10, 20, '#ffb879'),
      text: 'Ship it',
      tags: ['launch'],
      link: 'https://example.com/',
      emoji: '🚀',
    },
    card = noteToCard(note);
  assert.equal(card.id, note.id);
  assert.equal(card.type, 'card');
  assert.equal(card.text, 'Ship it');
  assert.deepEqual(card.tags, ['launch']);
  assert.equal(card.link, note.link);
  assert.equal(card.fill, '#ffb879');
  assert.equal(card.emoji, undefined);
  parseBoard(board(card));
  const a = { ...card, data: { ...card.data, points: 3, size: 'M' } },
    c = {
      ...createItem('card', 0, 0),
      data: { description: '', assignee: '', due: '', status: 'Complete', points: 5, size: 'M' },
    };
  assert.deepEqual(estimateTotals([a, c, note]), { points: 8, sizes: { M: 2 }, estimated: 2 });
});

test('poll votes, results and reset; scale clamps', () => {
  const p = {
    question: 'q',
    options: [
      { id: 'a', label: 'A', votes: 0 },
      { id: 'b', label: 'B', votes: 0 },
    ],
  };
  const v = votePoll(votePoll(votePoll(p, 'a'), 'a'), 'b');
  assert.deepEqual(
    pollResults(v).map(o => [o.votes, Math.round(o.share * 100)]),
    [
      [2, 67],
      [1, 33],
    ],
  );
  assert.equal(votePoll(p, 'a', -1).options[0].votes, 0);
  assert.throws(() => votePoll(p, 'zz'));
  assert.equal(
    resetPoll(v).options.every(o => o.votes === 0),
    true,
  );
  const s = { label: '', min: 1, max: 5, value: 3, leftLabel: '', rightLabel: '' };
  assert.equal(clampScale(s, 9).value, 5);
  assert.equal(clampScale(s, -3).value, 1);
  assert.equal(clampScale(s, 2.6).value, 3);
});

test('grid per-cell styles apply to a range, shift with structural edits and survive JSON', () => {
  let g = setCellStyle(newGrid(3, 3), 0, 0, 1, 1, { bold: true, color: '#e5484d' });
  assert.deepEqual(cellStyle(g, 1, 1), { bold: true, color: '#e5484d' });
  assert.deepEqual(cellStyle(g, 2, 2), {});
  g = setCellStyle(g, 0, 0, 0, 0, { bold: false, align: 'right', italic: true });
  assert.deepEqual(cellStyle(g, 0, 0), { color: '#e5484d', align: 'right', italic: true });
  assert.deepEqual(cellStyle(addRow(g, 0), 1, 0), cellStyle(g, 0, 0));
  assert.deepEqual(cellStyle(addRow(g, 0), 0, 0), {});
  assert.deepEqual(cellStyle(addColumn(g, 1), 1, 2), cellStyle(g, 1, 1));
  const removed = removeRow(g, 0);
  assert.deepEqual(cellStyle(removed, 0, 1), cellStyle(g, 1, 1));
  assert.equal(Object.keys(removed.styles ?? {}).length, 2);
  const noCol = removeColumn(g, 0);
  assert.deepEqual(cellStyle(noCol, 0, 0), cellStyle(g, 0, 1));
  const merged = mergeCells(g, 0, 0, 1, 1);
  assert.deepEqual(cellStyle(merged, 0, 0), cellStyle(g, 0, 0));
  assert.deepEqual(cellStyle(merged, 1, 1), {}, 'covered cells drop their style');
  assert.deepEqual(cellStyle(setCellStyle(merged, 0, 0, 1, 1, { bold: false }), 1, 1), {}, 'covered cells are skipped');
  const cleared = setCellStyle(newGrid(2, 2), 0, 0, 1, 1, { bold: true });
  assert.equal(setCellStyle(cleared, 0, 0, 1, 1, { bold: false }).styles, undefined);
  const item = { ...createItem('grid', 0, 0), data: g },
    b = board(item);
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
  for (const styles of [
    { '0,0': { color: 'red' } },
    { '3,0': { bold: true } },
    { '0,0': { size: 3 } },
    { '0,0': { align: 'justify' } },
    { x: {} },
    [],
  ])
    assert.throws(() => validateGrid({ ...g, styles }));
  assert.throws(() => validateGrid({ ...g, colors: { '5,5': '#ffffff' } }), /colours/);
});
