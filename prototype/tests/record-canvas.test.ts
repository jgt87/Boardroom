import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import { copyToRecords, syncedCard, syncRecordCards } from '../src/record-canvas.ts';
import { copySelection, pastePayload } from '../src/clipboard.ts';
import { shiftTimelineRecord, timelineGeometry, recordsError } from '../src/records.ts';

const fixture = () => ({
  ...newBoard(),
  items: [
    { ...createItem('table', 0, 0), id: 't', datasetId: 'd' },
    { ...createItem('note', -400, 0), id: 'n', text: 'Idea' },
  ],
  datasets: { d: [{ id: 'r', title: 'Existing', status: 'Not started' as const, assignee: '', start: '', end: '' }] },
});

test('drop copies before the indicated record, preserves sources, and respects locks and limits', () => {
  const b = fixture();
  const next = copyToRecords(b, ['n'], { targetId: 't', status: 'Complete', beforeId: 'r' }, () => 'new');
  assert.deepEqual(
    next.datasets!.d.map(r => [r.id, r.title, r.status]),
    [
      ['new', 'Idea', 'Complete'],
      ['r', 'Existing', 'Not started'],
    ],
  );
  assert.equal(next.items, b.items);
  assert.equal(b.datasets.d.length, 1);
  parseBoard(next);
  b.items[0].locked = true;
  assert.equal(copyToRecords(b, ['n'], { targetId: 't' }), b);
  b.items[0].locked = false;
  b.datasets.d = Array.from({ length: 1000 }, (_, k) => ({ ...b.datasets.d[0], id: String(k) }));
  assert.equal(copyToRecords(b, ['n'], { targetId: 't' }), b);
});

test('clipboard carries bound data and remaps dataset identity into another board', () => {
  const b = fixture();
  b.items.push(syncedCard(b, 'd', 'r', { ...createItem('card', 900, 0), id: 'c' })!);
  const payload = copySelection(b, ['c'])!;
  const next = pastePayload(newBoard(), payload, { x: 0, y: 0 }).board;
  const ref = next.items[0].recordRef!;
  assert.notEqual(ref.datasetId, 'd');
  assert.equal(next.datasets![ref.datasetId][0].title, 'Existing');
  parseBoard(next);
});

test('partially dated records have geometry and retain missing dates while moving', () => {
  const rows = [
    { id: 'p', title: 'Partial', status: 'Not started' as const, assignee: '', start: '', end: '2026-11-10' },
  ];
  assert.equal(timelineGeometry(rows).bars.length, 1);
  assert.equal(shiftTimelineRecord(rows, 'p', 1)[0].start, '');
  assert.equal(shiftTimelineRecord(rows, 'p', 1)[0].end, '2026-11-11');
  assert.equal(shiftTimelineRecord(rows, 'p', -1, 'start')[0].start, '2026-11-09');
});

test('synced milestone due dates preserve milestone validity and long assignees survive reload', () => {
  const b = fixture();
  Object.assign(b.datasets.d[0], { milestone: true, start: '2026-11-10', assignee: 'A'.repeat(201) });
  const card = syncedCard(b, 'd', 'r', { ...createItem('card', 900, 0), id: 'c' })!;
  b.items.push(card);
  parseBoard(b);
  const next = syncRecordCards(
    {
      ...b,
      items: b.items.map(i =>
        i.id === 'c'
          ? {
              ...i,
              data: { ...i.data, due: '2026-11-12' },
            }
          : i,
      ),
    },
    b,
  );
  assert.equal(next.datasets!.d[0].start, '2026-11-12');
  assert.equal(next.datasets!.d[0].end, '');
  parseBoard(next);
  assert.ok(recordsError(Array.from({ length: 1001 }, (_, k) => ({ ...b.datasets.d[0], id: String(k) }))));
});

test('card conversion preserves supported fields and rejects dropping into its own bound dataset', () => {
  const b = fixture();
  b.items[1] = {
    ...createItem('card', -400, 0),
    id: 'n',
    text: 'Card',
    data: {
      description: 'Details',
      assignee: 'Alex',
      status: 'In progress',
      due: '2026-11-10',
      points: 5,
    },
  };
  const next = copyToRecords(b, ['n'], { targetId: 't' }, () => 'new');
  assert.equal(next.datasets!.d[1].description, 'Details');
  assert.equal(next.datasets!.d[1].end, '2026-11-10');
  assert.equal(next.datasets!.d[1].points, 5);
  b.items[1].recordRef = { datasetId: 'd', recordId: 'r' };
  assert.equal(copyToRecords(b, ['n'], { targetId: 't' }), b);
});

test('synced cards update both ways, fan out, and implement asymmetric deletion', () => {
  const b = fixture();
  const c = syncedCard(b, 'd', 'r', { ...createItem('card', 900, 0), id: 'c' })!;
  c.data = { ...c.data, size: 'M' };
  b.items.push(c, { ...c, id: 'c2' });
  const edited = { ...b, items: b.items.map(i => (i.id === 'c' ? { ...i, text: 'Changed' } : i)) };
  const next = syncRecordCards(edited, b);
  assert.equal(next.datasets!.d[0].title, 'Changed');
  assert.equal(next.items.find(i => i.id === 'c2')!.text, 'Changed');
  assert.equal(next.items.find(i => i.id === 'c')!.data!.size, 'M');
  const removedCard = syncRecordCards({ ...next, items: next.items.filter(i => i.id !== 'c') }, next);
  assert.equal(removedCard.datasets!.d.length, 1);
  const removedRecord = syncRecordCards({ ...next, datasets: { d: [] } }, next);
  assert.equal(removedRecord.items.find(i => i.id === 'c')!.text, '');
  assert.ok(removedRecord.items.find(i => i.id === 'c')!.recordRef);
  parseBoard(removedRecord);
});

test('record changes win simultaneous card edits and references validate on import', () => {
  const b = fixture();
  b.items.push(syncedCard(b, 'd', 'r', { ...createItem('card', 900, 0), id: 'c' })!);
  const next = syncRecordCards(
    {
      ...b,
      datasets: { d: [{ ...b.datasets.d[0], title: 'Record wins' }] },
      items: b.items.map(i => (i.id === 'c' ? { ...i, text: 'Card edit' } : i)),
    },
    b,
  );
  assert.equal(next.items.at(-1)!.text, 'Record wins');
  assert.throws(() =>
    parseBoard({ ...b, items: [{ ...b.items.at(-1)!, recordRef: { datasetId: 1, recordId: 'r' } }] }),
  );
});
