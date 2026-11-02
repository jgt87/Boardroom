import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { applyLayouts, adoptIntoContainers, insertionPreview, containerOf } from '../src/autolayout.ts';

const note = (w = 100, h = 80): Item => ({ ...createItem('note', 0, 0), w, h });
function setup(
  direction: 'row' | 'column',
  wrap: boolean,
  count: number,
  width = 520,
): { board: Board; container: Item; kids: Item[] } {
  const kids = Array.from({ length: count }, () => note());
  const container: Item = {
    ...createItem('autolayout', 0, 0),
    x: 0,
    y: 0,
    w: width,
    h: 200,
    data: { direction, gap: 16, padding: 20, wrap, children: kids.map(k => k.id) },
  };
  const board = applyLayouts({ ...newBoard(), items: [container, ...kids] });
  return { board, container: board.items[0], kids: board.items.slice(1) };
}
const moveTo = (board: Board, id: string, cx: number, cy: number): Board => ({
  ...board,
  items: board.items.map(i => (i.id === id ? { ...i, x: cx - i.w / 2, y: cy - i.h / 2 } : i)),
});
function agree(board: Board, id: string) {
  const preview = insertionPreview(board, [id]),
    adopted = adoptIntoContainers(board, [id]),
    container = containerOf(adopted, id);
  if (!preview) {
    assert.equal(container, undefined);
    return null;
  }
  assert.equal(container?.id, preview.containerId);
  assert.equal((container!.data!.children as string[]).indexOf(id), preview.index);
  assert.ok([preview.line.x1, preview.line.y1, preview.line.x2, preview.line.y2].every(Number.isFinite));
  return preview;
}

test('row layout: preview index and line agree with adoption for every gap', () => {
  const { board, kids } = setup('row', false, 3),
    dragged = note(),
    base = { ...board, items: [...board.items, dragged] };
  for (const k of kids) {
    const p = agree(moveTo(base, dragged.id, k.x + 5, k.y + k.h / 2), dragged.id)!;
    assert.equal(p.line.x1, p.line.x2, 'vertical line in rows');
  }
  const end = agree(moveTo(base, dragged.id, kids[2].x + kids[2].w - 5, kids[2].y + 10), dragged.id)!;
  assert.equal(end.index, 3);
  assert.ok(end.line.x1 > kids[2].x + kids[2].w);
  const first = agree(moveTo(base, dragged.id, kids[0].x + 5, kids[0].y + 10), dragged.id)!;
  assert.equal(first.index, 0);
  assert.ok(first.line.x1 < kids[0].x);
});
test('column layout: horizontal insertion lines between children', () => {
  const { board, kids } = setup('column', false, 3),
    dragged = note(),
    base = { ...board, items: [...board.items, dragged] };
  const mid = agree(moveTo(base, dragged.id, kids[1].x + 30, kids[1].y + 5), dragged.id)!;
  assert.equal(mid.index, 1);
  assert.equal(mid.line.y1, mid.line.y2);
  assert.ok(mid.line.y1 > kids[0].y + kids[0].h && mid.line.y1 < kids[1].y);
  agree(moveTo(base, dragged.id, kids[2].x + 30, kids[2].y + kids[2].h - 5), dragged.id);
});
test('wrapped rows: preview follows the row under the pointer and matches adoption', () => {
  const { board, kids } = setup('row', true, 7, 380),
    dragged = note(),
    base = { ...board, items: [...board.items, dragged] };
  assert.ok(new Set(kids.map(k => k.y)).size > 1, 'layout wraps into several rows');
  for (const k of kids)
    for (const dx of [5, k.w - 5]) agree(moveTo(base, dragged.id, k.x + dx, k.y + k.h / 2), dragged.id);
  const second = kids.find(k => k.y > kids[0].y)!,
    p = agree(moveTo(base, dragged.id, second.x + 5, second.y + 10), dragged.id)!;
  assert.ok(p.line.y1 >= second.y - 1 && p.line.y2 <= second.y + second.h + 1, 'line drawn on the second row');
});
test('reordering within a container, empty containers and no-target drags', () => {
  const { board, kids } = setup('row', false, 3);
  const p = agree(moveTo(board, kids[0].id, kids[2].x + kids[2].w - 5, kids[2].y + 10), kids[0].id)!;
  assert.equal(p.index, 2);
  const empty = setup('column', false, 0),
    d = note(),
    eb = { ...empty.board, items: [...empty.board.items, d] };
  const e = agree(moveTo(eb, d.id, empty.container.x + 60, empty.container.y + 80), d.id)!;
  assert.equal(e.index, 0);
  assert.equal(agree(moveTo(eb, d.id, 2000, 2000), d.id), null);
  const frame = { ...createItem('frame', 0, 0) };
  assert.equal(
    insertionPreview(
      { ...eb, items: [...eb.items, { ...frame, x: empty.container.x + 10, y: empty.container.y + 40, w: 40, h: 40 }] },
      [frame.id],
    ),
    null,
  );
  assert.equal(
    insertionPreview(board, [board.items[0].id, kids[1].id]),
    null,
    'moving a child together with its container adopts nothing',
  );
});
