import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, removeItems } from '../src/model.ts';
import { adoptGridObjects, applyGridLayouts, detachGridObjects, setGridResizeMode } from '../src/grid-canvas.ts';
import { reorderGrid, addRow, removeColumn, newGrid, mergeCells, validateGrid } from '../src/grid.ts';
import type { GridData } from '../src/grid.ts';
import { moveIds, setLocked, duplicateItems } from '../src/arrange.ts';
import { copySelection, pastePayload } from '../src/clipboard.ts';

const fixture = () => ({
  ...newBoard(),
  items: [
    { ...createItem('grid', 100, 100), id: 'g' },
    { ...createItem('note', -300, 0), id: 'n', text: 'Contained idea' },
  ],
});
test('Manual sizing and modifier drops preserve positions without growth', () => {
  const initial = fixture();
  const dropped = adoptGridObjects(initial, ['n'], { id: 'g', r: 0, c: 0 }, true);
  assert.equal(dropped.items.find(i => i.id === 'g')!.w, initial.items[0].w);
  assert.equal(dropped.items.find(i => i.id === 'n')!.x, initial.items[1].x);
  parseBoard(dropped);
  const manual = setGridResizeMode(dropped, 'g', 'manual');
  assert.equal(manual.items.find(i => i.id === 'n')!.x, initial.items[1].x);
  const auto = setGridResizeMode(manual, 'g', 'auto');
  assert.ok(auto.items.find(i => i.id === 'g')!.w > initial.items[0].w);
  assert.deepEqual((auto.items.find(i => i.id === 'g')!.data as GridData).objects, [{ id: 'n', r: 0, c: 0 }]);
  parseBoard(auto);
});
test('Merged blocks reorder without splitting ranges or losing metadata', () => {
  let g = newGrid(4, 4);
  g.cells[0][0] = 'Anchor';
  g = mergeCells(g, 0, 0, 1, 1);
  g.objects = [{ id: 'n', r: 0, c: 0 }];
  g.styles = { '0,0': { bold: true } };
  const moved = reorderGrid(g, 'row', 0, 3);
  assert.equal(moved.cells[2][0], 'Anchor');
  assert.deepEqual(moved.merges, [{ r: 2, c: 0, rs: 2, cs: 2 }]);
  assert.equal(moved.objects![0].r, 2);
  assert.ok(moved.styles!['2,0'].bold);
  validateGrid(moved);
  const columns = reorderGrid(moved, 'column', 0, 3);
  assert.deepEqual(columns.merges, [{ r: 2, c: 2, rs: 2, cs: 2 }]);
  validateGrid(columns);
  assert.equal(reorderGrid(g, 'row', 0, 1), g);
});
test('Grid drops grow cells, carry objects, detach and survive portable copies', () => {
  const initial = fixture();
  const b = adoptGridObjects(initial, ['n'], { id: 'g', r: 1, c: 1 });
  const grid = b.items.find(i => i.id === 'g')!,
    note = b.items.find(i => i.id === 'n')!;
  assert.ok(grid.w > initial.items[0].w);
  assert.ok(grid.h > initial.items[0].h);
  assert.deepEqual((grid.data as GridData).objects, [{ id: 'n', r: 1, c: 1 }]);
  parseBoard(b);
  const moved = applyGridLayouts({ ...b, items: b.items.map(i => (i.id === 'g' ? { ...i, x: i.x + 100 } : i)) });
  assert.equal(moved.items.find(i => i.id === 'n')!.x, note.x + 100);
  assert.ok(moveIds(b, ['g']).includes('n'));
  assert.throws(() => setLocked(b, ['n'], true));
  const pasted = pastePayload(newBoard(), copySelection(b, ['g'])!, { x: 0, y: 0 }).board;
  assert.equal(pasted.items.length, 2);
  parseBoard(pasted);
  const copy = duplicateItems(b, ['g']).board;
  parseBoard(copy);
  assert.equal(copy.items.filter(i => i.type === 'grid').length, 2);
  const detached = detachGridObjects(b, ['n']);
  assert.deepEqual((detached.items[0].data as GridData).objects, []);
  parseBoard(removeItems(b, ['n']));
});
test('Grid structural edits retain cell values, styles, sizes and membership', () => {
  const b = adoptGridObjects(fixture(), ['n'], { id: 'g', r: 0, c: 1 });
  const g = b.items.find(i => i.id === 'g')!.data as GridData;
  g.cells[0][1] = 'Cell value';
  g.colors = { '0,1': '#ffffff' };
  const moved = reorderGrid(g, 'row', 0, 2);
  assert.equal(moved.cells[2][1], 'Cell value');
  assert.equal(moved.objects![0].r, 2);
  assert.equal(moved.colors!['2,1'], '#ffffff');
  const inserted = addRow(moved, 1);
  assert.equal(inserted.objects![0].r, 3);
  assert.equal(inserted.rowSizes!.length, inserted.rows);
  assert.equal(removeColumn(inserted, 1).objects!.length, 0);
});
test('Grid rejects nested, locked and grouped sources', () => {
  const b = fixture();
  b.items[1].locked = true;
  assert.equal(adoptGridObjects(b, ['n'], { id: 'g', r: 0, c: 0 }), b);
  assert.equal(adoptGridObjects(b, ['g'], { id: 'g', r: 0, c: 0 }), b);
  b.items[1].locked = false;
  b.items[1].w = 1e7;
  parseBoard(b);
  assert.equal(adoptGridObjects(b, ['n'], { id: 'g', r: 0, c: 0 }), b);
});
