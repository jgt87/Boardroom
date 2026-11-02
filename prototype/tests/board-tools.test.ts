import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard, removeItems, commit, undo } from '../src/model.ts';
import type { Item, Board, RecordRow } from '../src/model.ts';
import {
  stackNext,
  simplify,
  strokePath,
  strokeFromPoints,
  eraseAt,
  urlsIn,
  startVoting,
  castVote,
  endVoting,
  votesUsed,
  timerRemaining,
  formatClock,
  privateIds,
  setPrivate,
  addThread,
  replyThread,
  setResolved,
  deleteThread,
  threadPoint,
  detachComments,
  setLinkTo,
  setFrameContentHidden,
  coveredIds,
  reorderLayer,
  setHidden,
  renameItem,
  layerGroups,
  lineJumps,
  jumpPath,
  pointAlong,
  nearestAlong,
  recordsCsv,
  contrastRatio,
  checkAccessibility,
  templateItems,
  templateNames,
} from '../src/board-tools.ts';
import { duplicateItems } from '../src/arrange.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const round = (b: Board) => assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);

test('24 sticky stack continues below the previous note with consistent spacing and colour', () => {
  let b = board(),
    last: string | null = null;
  const ids: string[] = [];
  for (let k = 0; k < 3; k++) {
    const r = stackNext(b, last, { x: 100, y: 100 }, '#a8cdff', (x, y, f) => createItem('note', x, y, f));
    b = r.board;
    last = r.note.id;
    ids.push(r.note.id);
  }
  const notes = ids.map(id => b.items.find(i => i.id === id)!);
  assert.equal(notes[1].y - (notes[0].y + notes[0].h), 24);
  assert.equal(notes[2].x, notes[0].x);
  assert.ok(notes.every(n => n.fill === '#a8cdff'));
  round(b);
});
test('25 drawing: simplification, smooth paths and whole/precise erasing', () => {
  const pts = Array.from({ length: 200 }, (_, i) => ({ x: i, y: Math.sin(i / 10) * 20 }));
  const s = simplify(pts, 0.5);
  assert.ok(s.length < pts.length && s.length > 5);
  assert.deepEqual(s[0], pts[0]);
  assert.deepEqual(s.at(-1), pts.at(-1));
  assert.match(strokePath(s), /^M0,0 Q/);
  assert.ok(!/NaN/.test(strokePath(s)));
  const stroke = strokeFromPoints(
    { ...createItem('pen', 0, 0), data: { style: 'highlighter', width: 18 } },
    Array.from({ length: 101 }, (_, i) => ({ x: i * 2, y: 50 })),
  );
  const whole = eraseAt(board(stroke), { x: 100, y: 50 }, 5, false);
  assert.equal(whole.items.length, 0);
  const split = eraseAt(board(stroke), { x: 100, y: 50 }, 5, true);
  assert.equal(split.items.length, 2);
  assert.ok(split.items.every(i => i.points!.length > 1 && i.data?.style === 'highlighter'));
  assert.ok(split.items[0].x + split.items[0].w < 100 && split.items[1].x > 100);
  round(split);
  assert.equal(eraseAt(board({ ...stroke, locked: true }), { x: 100, y: 50 }, 5, false).items.length, 1);
  assert.throws(() => parseBoard(board({ ...stroke, data: { style: 'crayon', width: 3 } })));
  const fast = strokeFromPoints({ ...createItem('pen', 0, 0) }, [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
  ]);
  assert.equal(eraseAt(board(fast), { x: 150, y: 2 }, 6, true).items.length, 2, 'long two-point segments split');
});
test('26 text links are detected without trailing punctuation', () =>
  assert.deepEqual(urlsIn('See https://example.com/a, and http://x.org.'), ['https://example.com/a', 'http://x.org']));
test('41 dot voting enforces the budget and stores sorted results', () => {
  const a = { ...createItem('note', 0, 0), text: 'A' },
    b2 = { ...createItem('note', 300, 0), text: 'B' };
  let b = startVoting(board(a, b2), [a.id, b2.id], 2);
  b = castVote(b, b2.id, 1);
  b = castVote(b, b2.id, 1);
  assert.throws(() => castVote(b, a.id, 1), /votes are used/);
  b = castVote(b, b2.id, -1);
  b = castVote(b, a.id, 1);
  assert.equal(votesUsed(b), 2);
  round(b);
  assert.throws(() => startVoting(board(), [], 3));
  assert.throws(() => parseBoard({ ...b, voting: { ...b.voting!, votes: { [a.id]: 5 } } }));
  const end = endVoting(b, i => i.text);
  assert.equal(end.board.voting, undefined);
  assert.deepEqual(
    end.result.totals.map(t => [t.label, t.votes]),
    [
      ['A', 1],
      ['B', 1],
    ],
  );
  round(end.board);
});
test('42 timer is time-based and formats remaining time', () => {
  assert.equal(timerRemaining({ duration: 60000, endsAt: 1000 + 60000, remaining: 60000 }, 31000), 30000);
  assert.equal(timerRemaining({ duration: 60000, endsAt: null, remaining: 12000 }, 999999), 12000);
  assert.equal(formatClock(61000), '01:01');
  assert.equal(formatClock(0), '00:00');
});
test('45 private mode hides notes on the board or inside chosen frames, and is undoable', () => {
  const f = createItem('frame', 0, 0),
    inside = createItem('note', 20, 20),
    outside = createItem('note', 2000, 0);
  let h = { past: [], current: board(f, inside, outside), future: [] } as {
    past: Board[];
    current: Board;
    future: Board[];
  };
  h = commit(h, setPrivate(h.current, f.id, true));
  assert.deepEqual([...privateIds(h.current)], [inside.id]);
  h = commit(h, setPrivate(h.current, 'all', true));
  assert.equal(privateIds(h.current).size, 2);
  round(h.current);
  assert.equal(undo(undo(h)).current.privateMode, undefined);
  assert.equal(removeItems(h.current, [f.id]).privateMode?.frames.length, 0);
});
test('46 comments anchor to objects, reply/resolve, and survive deletion as free threads', () => {
  const n = createItem('note', 100, 100);
  let b = board(n);
  const r = addThread(b, { x: 300, y: 110 }, 'Check this', n);
  b = r.board;
  assert.deepEqual(threadPoint(b, r.thread), { x: 300, y: 110 });
  b = { ...b, items: b.items.map(i => ({ ...i, x: i.x + 50 })) };
  assert.deepEqual(threadPoint(b, b.comments![0]), { x: 350, y: 110 });
  b = replyThread(b, r.thread.id, 'Done');
  b = setResolved(b, r.thread.id, true);
  assert.equal(b.comments![0].messages.length, 2);
  round(b);
  const kept = detachComments(b, removeItems(b, [n.id]));
  assert.deepEqual(kept.kept, [r.thread.id]);
  assert.deepEqual(
    [kept.board.comments![0].x, kept.board.comments![0].y, kept.board.comments![0].itemId],
    [350, 110, undefined],
  );
  assert.equal(deleteThread(b, r.thread.id).comments, undefined);
  assert.throws(() => addThread(b, { x: 0, y: 0 }, '  '));
});
test('47 links follow duplication and clear on deletion; hidden frames cover contents', () => {
  const a = createItem('note', 0, 0),
    f = createItem('frame', 500, 0),
    inner = createItem('note', 520, 20);
  let b = setLinkTo(board(a, f, inner), a.id, f.id);
  assert.throws(() => setLinkTo(b, a.id, a.id));
  const dup = duplicateItems(b, [a.id, f.id]);
  assert.equal(dup.board.items.at(-2)!.linkTo, dup.ids[1]);
  assert.equal(removeItems(b, [f.id]).items[0].linkTo, undefined);
  b = setFrameContentHidden(b, f.id, true);
  assert.deepEqual([...coveredIds(b)], [inner.id]);
  round(b);
  assert.equal(setFrameContentHidden(b, f.id, false).items[1].data, undefined);
  assert.throws(() => parseBoard(board({ ...f, data: { contentHidden: 'yes' } })));
});
test('48 layers reorder, hide, rename and group by frame', () => {
  const f = createItem('frame', 0, 0),
    a = { ...createItem('note', 10, 10), text: 'A' },
    c = { ...createItem('note', 2000, 0), text: 'C' };
  let b = board(f, a, c);
  b = reorderLayer(b, c.id, 1);
  assert.deepEqual(
    b.items.map(i => i.id),
    [f.id, c.id, a.id],
  );
  b = setHidden(b, [a.id], true);
  b = renameItem(b, a.id, '  Intro  ');
  assert.equal(b.items[2].name, 'Intro');
  round(b);
  const groups = layerGroups(b);
  assert.deepEqual(
    groups.map(g => [g.frame?.id ?? null, g.items.map(i => i.id)]),
    [
      [f.id, [a.id]],
      [null, [c.id]],
    ],
  );
  const many = board(...Array.from({ length: 2000 }, (_, i) => createItem('note', i * 5, 0))),
    t = performance.now();
  layerGroups(many);
  assert.ok(performance.now() - t < 1000);
});
test('49 later connectors jump earlier ones; captions are positioned along the path', async () => {
  const h = {
      id: 'h',
      nodes: [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
    },
    v = {
      id: 'v',
      nodes: [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    },
    jumps = lineJumps([h, v]);
  assert.equal(jumps.has('h'), false);
  assert.deepEqual(jumps.get('v')![0].p, { x: 50, y: 50 });
  assert.match(jumpPath(v.nodes, jumps.get('v')!), / A6,6 /);
  const poly = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];
  assert.deepEqual(pointAlong(poly, 0.75), { x: 100, y: 50 });
  assert.equal(nearestAlong(poly, { x: 120, y: 50 }), 0.75);
  const { connectorGeometry } = await import('../src/connector-geometry.ts');
  const ca = createItem('rectangle', 0, 0),
    cb = createItem('rectangle', 600, 300),
    curve = {
      ...createItem('arrow', 0, 0),
      from: ca.id,
      to: cb.id,
      connector: { path: 'curved' as const, avoid: false },
    },
    cross = { ...createItem('arrow', 0, 0), x: 300, y: -200, w: 0, h: 800 };
  const cg = connectorGeometry(curve, [ca, cb]),
    xg = connectorGeometry(cross, [ca, cb]);
  assert.ok(cg.samples.length > 10);
  const cj = lineJumps([
    { id: 'x', nodes: xg.samples },
    { id: 'c', nodes: cg.samples },
  ]);
  assert.equal(cj.get('c')?.length, 1, 'curved connector jumps the earlier straight one');
  const line = { ...createItem('arrow', 0, 0), connector: { labelAt: 0.25, jumps: false } };
  round(board(line));
  assert.throws(() => parseBoard(board({ ...line, connector: { labelAt: 2 } })));
});
test('50 CSV escaping, accessibility checks and templates', () => {
  const rows: RecordRow[] = [
    { id: 'a', title: 'Plan, "big"', status: 'Not started', assignee: '=cmd', start: '', end: '', points: 3 },
    {
      id: 'b',
      title: 'Ship',
      status: 'Complete',
      assignee: '',
      start: '2026-01-01',
      end: '2026-01-02',
      dependsOn: ['a'],
    },
  ];
  const csv = recordsCsv(rows).split('\r\n');
  assert.equal(csv[1], '"Plan, ""big""",Not started,"\'=cmd",,,,3,,,');
  assert.match(csv[2], /"Plan, ""big"""/);
  assert.ok(contrastRatio('#000000', '#ffffff') > 20);
  const issues = checkAccessibility(
    board(
      { ...createItem('note', 0, 0, '#25252a'), text: 'dark' },
      { ...createItem('image', 0, 0), assetId: 'x' },
      { ...createItem('text', 0, 0), text: 'tiny', format: { fontSize: 10 } },
    ),
  );
  assert.deepEqual(issues.map(i => i.kind).sort(), ['alt', 'contrast', 'small-text']);
  for (const name of templateNames) {
    const items = templateItems(name, { x: 0, y: 0 }, (t, x, y, f) => createItem(t, x, y, f));
    assert.ok(items.length >= 4);
    parseBoard(board(...items));
  }
});
