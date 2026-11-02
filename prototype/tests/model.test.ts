import { test } from 'node:test';
import assert from 'node:assert/strict';
test('text formatting survives save and rejects invalid font sizes', () => {
  const auto = { ...createItem('note', 0, 0), format: { fontSize: 'auto' as const } };
  assert.equal(parseBoard({ ...newBoard(), items: [auto] }).items[0].format!.fontSize, 'auto');
  const note = {
    ...createItem('note', 0, 0),
    format: { fontSize: 24, bold: true, align: 'left' as const, list: 'bullet' as const },
  };
  assert.deepEqual(parseBoard({ ...newBoard(), items: [note] }).items[0].format, note.format);
  assert.throws(() => parseBoard({ ...newBoard(), items: [{ ...note, format: { fontSize: Infinity } }] }));
});
import { bulkNotes, removeBranch, validateMindNodes } from '../src/model.ts';

test('bulk notes form a single undoable edit with bounded content', () => {
  const notes = bulkNotes('First\n\n Second \nThird', 10, 20);
  assert.deepEqual(
    notes.map(n => n.text),
    ['First', 'Second', 'Third'],
  );
  const h = commit({ past: [], current: newBoard(), future: [] }, { ...newBoard(), items: notes });
  assert.equal(undo(h).current.items.length, 0);
  assert.equal(redo(undo(h)).current.items.length, 3);
});
test('mind map branch deletion includes descendants and imports reject cycles', () => {
  const nodes = [
    { id: 'r', parent: null, text: 'root' },
    { id: 'c', parent: 'r', text: 'child' },
    { id: 'g', parent: 'c', text: 'grandchild' },
  ];
  validateMindNodes(nodes);
  assert.deepEqual(
    removeBranch(nodes, 'c').map(n => n.id),
    ['r'],
  );
  assert.throws(() =>
    validateMindNodes([
      { id: 'r', parent: null, text: 'root' },
      { id: 'a', parent: 'b', text: '' },
      { id: 'b', parent: 'a', text: '' },
    ]),
  );
});
test('record views persist a shared dataset and reject missing datasets', () => {
  const table = createItem('table', 0, 0);
  table.datasetId = 'records';
  const kanban = { ...table, id: 'kanban', type: 'kanban' as const };
  const board = {
    ...newBoard(),
    items: [table, kanban],
    datasets: {
      records: [
        {
          id: 'task',
          title: 'Ship',
          status: 'In progress' as const,
          assignee: 'A',
          start: '2026-11-02',
          end: '2026-11-04',
        },
      ],
    },
  };
  const parsed = parseBoard(JSON.parse(JSON.stringify(board)));
  assert.equal(parsed.items[0].datasetId, parsed.items[1].datasetId);
  assert.equal(parsed.datasets!.records[0].title, 'Ship');
  assert.throws(() => parseBoard({ ...board, datasets: {} }));
});
import { commit, undo, redo, newBoard, createItem, endpoints, removeItems, parseBoard } from '../src/model.ts';

test('a new edit after undo discards the redo branch and preserves snapshots', () => {
  let h = { past: [], current: newBoard(), future: [] } as Parameters<typeof commit>[0];
  const a = { ...newBoard(), title: 'A' };
  h = commit(h, a);
  a.title = 'mutated';
  assert.equal(h.current.title, 'A');
  h = commit(h, { ...h.current, title: 'B' });
  h = undo(h);
  assert.equal(h.current.title, 'A');
  assert.equal(redo(h).current.title, 'B');
  h = commit(h, { ...h.current, title: 'C' });
  assert.equal(h.future.length, 0);
  assert.equal(redo(h).current.title, 'C');
});
test('connectors follow objects and are removed with their endpoints', () => {
  const a = createItem('rectangle', 0, 0),
    b = createItem('rectangle', 500, 0);
  const arrow = { ...createItem('arrow', 0, 0), from: a.id, to: b.id };
  const [start, end] = endpoints(arrow, [a, b]);
  assert.equal(start.x, a.w);
  assert.equal(end.x, b.x);
  const moved = { ...b, x: 700 };
  assert.equal(endpoints(arrow, [a, moved])[1].x, 700);
  assert.equal(removeItems({ ...newBoard(), items: [a, b, arrow] }, [a.id]).items.length, 1);
});
test('imports reject duplicate IDs, nonfinite geometry, and invalid formats', () => {
  const a = createItem('note', 10, 20),
    b = { ...newBoard(), items: [a] };
  assert.deepEqual(parseBoard(b), b);
  assert.throws(() => parseBoard({ ...b, items: [a, a] }));
  assert.throws(() => parseBoard({ ...b, items: [{ ...a, x: NaN }] }));
  assert.throws(() => parseBoard({ version: 2, title: '', items: [] }));
});
test('connectors intersect ellipse and diamond boundaries at diagonal angles', () => {
  const a = { ...createItem('ellipse', 0, 0), w: 200, h: 200 },
    b = { ...createItem('rectangle', 400, 400), w: 200, h: 200 };
  const arrow = { ...createItem('arrow', 0, 0), from: a.id, to: b.id };
  const p = endpoints(arrow, [a, b])[0];
  assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 100) - 100) < 1e-6);
  const d = endpoints(arrow, [{ ...a, type: 'diamond' }, b])[0];
  assert.equal(d.x, 150);
  assert.equal(d.y, 150);
});
