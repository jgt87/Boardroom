// Swimlane diagrams (gap E6): layout, membership, lane edits that keep objects in their lanes,
// validation, persistence and moving the swimlane with its contents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  SWIM_DEFAULT_LANE,
  SWIM_LANE_HEADER,
  SWIM_MIN,
  SWIM_PHASE_HEADER,
  SWIM_TITLE,
  fitSwimlaneItem,
  swimData,
  swimlaneLayout,
  swimlaneSpec,
  swimlaneSummary,
  validateSwimlane,
} from '../src/specs-swimlane.ts';
import type { SwimlaneData } from '../src/specs-swimlane.ts';
import {
  addSection,
  fitSwimlanes,
  laneOf,
  moveSection,
  patchSection,
  relayoutSwimlane,
  removeSection,
  resizeSection,
  setSwimOrientation,
  setSwimTitleShown,
  swimlaneMembers,
} from '../src/swimlane.ts';
import { moveIds } from '../src/arrange.ts';
import { translate } from '../src/interactions.ts';
import { canConnect, connectorGeometry } from '../src/connector-geometry.ts';
import { describeItem } from '../src/navigation.ts';
import { itemDetails, outlineByFrame } from '../src/access-tools.ts';
import { templateItems } from '../src/board-tools.ts';
import { widgetSearchText } from '../src/widget-specs.ts';

const lanes = (titles: string[], size = 100) => titles.map((title, k) => ({ id: `l${k}`, title, size }));
/** A horizontal swimlane at (0, 0): title 44, lane header 48, body 400 wide, lanes of 100. */
function pool(data: Partial<SwimlaneData> = {}, extra: Partial<Item> = {}): Item {
  const d: SwimlaneData = { orientation: 'horizontal', lanes: lanes(['Sales', 'Ops', 'Finance']), ...data };
  const base = { ...createItem('swimlane', 0, 0), id: 'pool', text: 'Orders', data: d, w: 0, h: 0, ...extra };
  return fitExact(base, d);
}
function fitExact(base: Item, d: SwimlaneData): Item {
  const horizontal = d.orientation === 'horizontal',
    T = d.hideTitle ? 0 : SWIM_TITLE,
    P = d.phases?.length ? SWIM_PHASE_HEADER : 0,
    main = d.lanes.reduce((a, s) => a + s.size, 0),
    cross = d.phases?.length ? d.phases.reduce((a, s) => a + s.size, 0) : 400;
  return horizontal
    ? { ...base, w: SWIM_LANE_HEADER + cross, h: T + P + main }
    : { ...base, w: P + main, h: T + SWIM_LANE_HEADER + cross };
}
const note = (id: string, x: number, y: number): Item => ({ ...createItem('note', x, y), id, w: 40, h: 40 });
const board = (...items: Item[]): Board => ({ version: 1, title: 'Swim', items });
const at = (b: Board, id: string) => {
  const i = b.items.find(x => x.id === id)!;
  return { x: i.x, y: i.y };
};
const lane = (b: Board, id: string) => laneOf(b, id)?.lane.title;
// Lane k body starts at y = 44 + 100k; notes sit 30 below the top of their lane, 100 into the body.
const inLane = (id: string, k: number, x = 148) => note(id, x, SWIM_TITLE + 100 * k + 30);

test('layout: title band, lane headers and bodies in item-local space, both orientations', () => {
  const p = pool();
  assert.deepEqual([p.w, p.h], [448, 344]);
  const l = swimlaneLayout(p);
  assert.deepEqual(l.title, { x: 0, y: 0, w: 448, h: 44 });
  assert.deepEqual(l.body, { x: 48, y: 44, w: 400, h: 300 });
  assert.deepEqual(l.lanes[1].header, { x: 0, y: 144, w: 48, h: 100 });
  assert.deepEqual(l.lanes[1].body, { x: 48, y: 144, w: 400, h: 100 });
  assert.equal(l.phases.length, 0);

  const v = pool({ orientation: 'vertical', phases: lanes(['Plan', 'Do'], 150) });
  assert.deepEqual([v.w, v.h], [SWIM_PHASE_HEADER + 300, 44 + 48 + 300]);
  const lv = swimlaneLayout(v);
  assert.deepEqual(lv.lanes[2].header, { x: 36 + 200, y: 44, w: 100, h: 48 });
  assert.deepEqual(lv.phases[1].header, { x: 0, y: 92 + 150, w: 36, h: 150 });
  assert.deepEqual(lv.phases[1].body, { x: 36, y: 242, w: 300, h: 150 });
});

test('resizing the item scales lanes proportionally and never below the minimum', () => {
  const p = pool({ lanes: [...lanes(['A', 'B']).slice(0, 1), { id: 'b', title: 'B', size: 300 }] });
  const grown = fitSwimlaneItem({ ...p, h: p.h + 400 });
  assert.deepEqual(
    swimData(grown).lanes.map(s => s.size),
    [200, 600],
  );
  assert.equal(grown.h, SWIM_TITLE + 800);
  const tiny = fitSwimlaneItem({ ...p, h: 50, w: 10 });
  assert.ok(swimData(tiny).lanes.every(s => s.size >= SWIM_MIN));
  assert.equal(tiny.h, SWIM_TITLE + swimData(tiny).lanes.reduce((a, s) => a + s.size, 0));
  assert.ok(tiny.w >= SWIM_LANE_HEADER + 80);
  // Already consistent: same object back (render caches rely on identity).
  assert.equal(fitSwimlaneItem(p), p);
  const b = board(p);
  assert.equal(fitSwimlanes(b), b);
});

test('membership and lane lookup: objects inside the bounds, lane at their centre', () => {
  const b = board(pool(), inLane('a', 0), inLane('b', 2), note('out', 600, 0));
  assert.deepEqual(
    swimlaneMembers(b, 'pool').map(i => i.id),
    ['a', 'b'],
  );
  assert.equal(lane(b, 'a'), 'Sales');
  assert.equal(lane(b, 'b'), 'Finance');
  assert.equal(laneOf(b, 'out'), undefined);
  const withPhases = board(pool({ phases: lanes(['Plan', 'Do'], 200) }), note('c', 300, 44 + 36 + 130));
  assert.equal(laneOf(withPhases, 'c')?.lane.title, 'Ops');
  assert.equal(laneOf(withPhases, 'c')?.phase?.title, 'Do');
});

test('moving the swimlane moves its members (frame-like containment)', () => {
  const b = board(pool(), inLane('a', 1), note('out', 900, 900));
  const ids = moveIds(b, ['pool']);
  assert.deepEqual(ids.sort(), ['a', 'pool']);
  const moved = translate(b, ids, { x: 50, y: 20 });
  assert.deepEqual(at(moved, 'a'), { x: 198, y: 194 });
  assert.deepEqual(at(moved, 'out'), { x: 900, y: 900 });
});

test('adding and inserting lanes grows the pool and keeps objects in their lanes', () => {
  const b = board(pool(), inLane('a', 0), inLane('b', 1), inLane('c', 2));
  const appended = addSection(b, 'pool', 'lanes');
  const p = appended.items.find(i => i.id === 'pool')!;
  assert.equal(swimData(p).lanes.length, 4);
  assert.equal(swimData(p).lanes[3].title, 'Lane 4');
  assert.equal(p.h, 344 + SWIM_DEFAULT_LANE);
  assert.deepEqual(at(appended, 'c'), at(b, 'c'));

  const inserted = addSection(b, 'pool', 'lanes', 1);
  assert.deepEqual(at(inserted, 'a'), at(b, 'a'));
  assert.equal(at(inserted, 'b').y, at(b, 'b').y + SWIM_DEFAULT_LANE);
  assert.equal(lane(inserted, 'b'), 'Ops');
  assert.equal(lane(inserted, 'c'), 'Finance');
});

test('removing a lane deletes its objects (and their connectors) and shifts later lanes back', () => {
  const link = { ...createItem('arrow', 0, 0), id: 'ab', from: 'a', to: 'b' };
  const b = board(pool(), inLane('a', 0), inLane('b', 1), inLane('c', 2), link);
  const r = removeSection(b, 'pool', 'lanes', 'l1');
  assert.equal(r.removed, 1);
  assert.deepEqual(
    r.board.items.map(i => i.id),
    ['pool', 'a', 'c'],
  );
  assert.equal(at(r.board, 'c').y, at(b, 'c').y - 100);
  assert.equal(lane(r.board, 'c'), 'Finance');
  const one = board(pool({ lanes: lanes(['Only']) }));
  assert.throws(() => removeSection(one, 'pool', 'lanes', 'l0'), /at least one lane/);
});

test('reordering lanes carries their objects; resizing a lane shifts the following lanes', () => {
  const b = board(pool(), inLane('a', 0), inLane('b', 1), inLane('c', 2));
  const down = moveSection(b, 'pool', 'lanes', 'l0', 1);
  assert.deepEqual(
    swimData(down.items[0]).lanes.map(s => s.title),
    ['Ops', 'Sales', 'Finance'],
  );
  assert.equal(lane(down, 'a'), 'Sales');
  assert.equal(at(down, 'a').y, at(b, 'a').y + 100);
  assert.equal(at(down, 'b').y, at(b, 'b').y - 100);
  assert.deepEqual(at(down, 'c'), at(b, 'c'));
  assert.equal(moveSection(b, 'pool', 'lanes', 'l0', -1), b);

  const resized = resizeSection(b, 'pool', 'lanes', 'l1', 250);
  assert.equal(resized.items[0].h, 344 + 150);
  assert.deepEqual(at(resized, 'b'), at(b, 'b'));
  assert.equal(at(resized, 'c').y, at(b, 'c').y + 150);
  assert.equal(lane(resized, 'c'), 'Finance');
  const clamped = resizeSection(b, 'pool', 'lanes', 'l1', 1);
  assert.equal(swimData(clamped.items[0]).lanes[1].size, SWIM_MIN);
});

test('phases: the first one splits the body, contents shift under the phase band, removal and reorder', () => {
  const b = board(pool(), inLane('a', 0, 100), inLane('z', 2, 400));
  const one = addSection(b, 'pool', 'phases');
  const d = swimData(one.items[0]);
  assert.deepEqual(
    d.phases!.map(s => [s.title, s.size]),
    [
      ['Phase 1', 200],
      ['Phase 2', 200],
    ],
  );
  assert.equal(one.items[0].h, 344 + SWIM_PHASE_HEADER);
  assert.equal(at(one, 'a').y, at(b, 'a').y + SWIM_PHASE_HEADER);
  assert.equal(laneOf(one, 'z')?.phase?.title, 'Phase 2');
  // Swap phases: z (phase 2) moves to the left, a moves right.
  const swapped = moveSection(one, 'pool', 'phases', d.phases![1].id, -1);
  assert.equal(at(swapped, 'z').x, at(one, 'z').x - 200);
  assert.equal(at(swapped, 'a').x, at(one, 'a').x + 200);
  // Removing a phase deletes its objects while other phases remain.
  const r = removeSection(one, 'pool', 'phases', d.phases![1].id);
  assert.deepEqual(
    r.board.items.map(i => i.id),
    ['pool', 'a'],
  );
  // Removing the only phase removes the band and keeps the contents.
  const last = removeSection(r.board, 'pool', 'phases', d.phases![0].id);
  assert.equal(last.removed, 0);
  assert.equal(swimData(last.board.items[0]).phases, undefined);
  assert.deepEqual(at(last.board, 'a'), at(b, 'a'));
});

test('switching orientation transposes lanes and keeps each object in its lane', () => {
  const b = board(pool(), inLane('a', 0), inLane('c', 2));
  const v = setSwimOrientation(b, 'pool', 'vertical');
  const p = v.items[0];
  assert.equal(swimData(p).orientation, 'vertical');
  assert.deepEqual([p.w, p.h], [300, SWIM_TITLE + SWIM_LANE_HEADER + 400]);
  assert.equal(lane(v, 'a'), 'Sales');
  assert.equal(lane(v, 'c'), 'Finance');
  assert.ok(at(v, 'c').x > at(v, 'a').x);
  const back = setSwimOrientation(v, 'pool', 'horizontal');
  assert.deepEqual(at(back, 'a'), at(b, 'a'));
  assert.deepEqual(at(back, 'c'), at(b, 'c'));
});

test('rename, recolour, hide the title band, and locks', () => {
  const b = board(pool(), inLane('a', 1));
  const named = patchSection(b, 'pool', 'lanes', 'l1', { title: 'Operations', color: '#DCF5E3' });
  assert.deepEqual(swimData(named.items[0]).lanes[1], { id: 'l1', title: 'Operations', size: 100, color: '#dcf5e3' });
  const cleared = patchSection(named, 'pool', 'lanes', 'l1', { color: null });
  assert.equal(swimData(cleared.items[0]).lanes[1].color, undefined);
  assert.throws(() => patchSection(b, 'pool', 'lanes', 'l1', { color: 'red' }), /colour/);
  const untitled = setSwimTitleShown(b, 'pool', false);
  assert.equal(untitled.items[0].h, 300);
  assert.equal(at(untitled, 'a').y, at(b, 'a').y - SWIM_TITLE);
  assert.equal(lane(untitled, 'a'), 'Ops');
  const locked = board({ ...pool(), locked: true }, inLane('a', 1));
  assert.throws(() => addSection(locked, 'pool', 'lanes'), /locked/);
  // Locked members stay where they are.
  const lockedNote = board(pool(), { ...inLane('a', 0), locked: true });
  assert.deepEqual(at(addSection(lockedNote, 'pool', 'lanes', 0), 'a'), at(lockedNote, 'a'));
  // The pool title can change in the same step as a relayout.
  const r = relayoutSwimlane(b, 'pool', swimData(b.items[0]), { text: 'Renamed' });
  assert.equal(r.board.items[0].text, 'Renamed');
});

test('validation accepts good data and rejects bad data', () => {
  const ok = pool({ phases: lanes(['Plan'], 200) });
  validateSwimlane(ok);
  const bad: Partial<SwimlaneData>[] = [
    { orientation: 'diagonal' as never },
    { lanes: [] },
    { lanes: Array.from({ length: 31 }, (_, k) => ({ id: `x${k}`, title: '', size: 50 })) },
    { lanes: [{ id: 'a', title: 'A', size: Number.NaN }] },
    { lanes: [{ id: 'a', title: 'A', size: 5 }] },
    { lanes: [{ id: 'a', title: 'A', size: 1e9 }] },
    { lanes: [{ id: 'a', title: 'x'.repeat(201), size: 100 }] },
    { lanes: [{ id: 'a', title: 'A', size: 100, color: 'red' }] },
    { lanes: [{ id: 'a', title: 'A', size: 100, extra: 1 } as never] },
    {
      lanes: [
        { id: 'a', title: 'A', size: 100 },
        { id: 'a', title: 'B', size: 100 },
      ],
    },
    { phases: [] },
    { hideTitle: 'yes' as never },
  ];
  for (const d of bad) assert.throws(() => validateSwimlane(pool(d)), /Invalid swimlane/, JSON.stringify(d));
  assert.throws(() => validateSwimlane({ ...ok, data: { ...swimData(ok), other: 1 } }), /Invalid swimlane/);
});

test('parseBoard round trip, default item, search text and spoken descriptions', () => {
  const created = createItem('swimlane', 10, 20);
  assert.deepEqual([created.w, created.h], swimlaneSpec.size);
  assert.deepEqual(
    swimData(created).lanes.map(s => s.title),
    ['Lane 1', 'Lane 2', 'Lane 3'],
  );
  assert.equal(swimData(created).phases, undefined);
  const b = board(pool({ phases: lanes(['Plan', 'Do'], 200) }), inLane('a', 1));
  const back = parseBoard(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(back.items[0].data, b.items[0].data);
  assert.throws(
    () => parseBoard(JSON.parse(JSON.stringify(board({ ...pool(), data: { orientation: 'horizontal' } })))),
    /swimlane/i,
  );
  assert.match(widgetSearchText(b.items[0]), /Sales[\s\S]*Finance[\s\S]*Plan/);
  assert.equal(swimlaneSummary(pool()), 'Swimlane, Orders, 3 lanes: Sales, Ops, Finance');
  assert.match(describeItem(b.items[0]), /^Swimlane, Orders, 3 lanes: Sales, Ops, Finance, 2 phases: Plan, Do/);
  assert.match(itemDetails(b, 'a'), /in lane Ops, phase Plan, of swimlane Orders/);
  const outline = outlineByFrame(b).flatMap(s => s.items);
  assert.match(outline.find(e => e.id === 'a')!.label, /in lane Ops/);
});

test('connectors inside a swimlane are not blocked by it and cannot attach to it', () => {
  const a = { ...note('a', 100, 80), w: 60, h: 60 },
    c = { ...note('c', 340, 80), w: 60, h: 60 };
  const link = { ...createItem('arrow', 0, 0), id: 'ac', from: 'a', to: 'c', connector: { avoid: true } };
  const b = board(pool(), a, c, link);
  assert.equal(canConnect(b.items[0]), false);
  const g = connectorGeometry(link, b.items);
  assert.ok(!g.blocked);
  assert.equal(g.nodes.length, 2);
});

test('the cross-functional flowchart template places every step inside its lane', () => {
  const items = templateItems('Cross-functional flowchart', { x: 100, y: 50 }, (t, x, y, f) => createItem(t, x, y, f));
  const b = parseBoard(JSON.parse(JSON.stringify(board(...items))));
  const p = b.items.find(i => i.type === 'swimlane')!;
  assert.equal(fitSwimlaneItem(p), p);
  const steps = b.items.filter(i => i.type !== 'swimlane' && i.type !== 'arrow');
  assert.equal(steps.length, 6);
  assert.deepEqual(
    steps.map(s => lane(b, s.id)),
    ['Customer', 'Customer', 'Sales', 'Sales', 'Operations', 'Customer'],
  );
  assert.deepEqual(new Set(moveIds(b, [p.id])).size, b.items.length);
});
