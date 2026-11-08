// Swimlane board operations (gap E6): membership, which lane and phase an object is in, and lane and
// phase edits (add, insert, remove, reorder, resize, rename, recolour, switch orientation) that keep each
// object in its lane. Every edit returns a new board, so one call is one undo step. Pure: no React.
import type { Board, Item } from './model.ts';
import { removeItems } from './model.ts';
import { contains, itemBounds } from './interactions.ts';
import { editableIds } from './arrange.ts';
import {
  SWIM_DEFAULT_LANE,
  SWIM_DEFAULT_PHASE,
  SWIM_MAX,
  SWIM_MAX_SECTIONS,
  SWIM_MIN,
  cellIndexAt,
  fitSwimlaneItem,
  swimAxes,
  swimData,
  swimSizeFor,
  swimlaneLayout,
} from './specs-swimlane.ts';
import type { SwimAxis, SwimOrientation, SwimSection, SwimlaneData } from './specs-swimlane.ts';

const newId = () => crypto.randomUUID();
const findSwimlane = (board: Board, id: string): Item => {
  const s = board.items.find(i => i.id === id && i.type === 'swimlane');
  if (!s) throw new Error('Select a swimlane first.');
  return s;
};
function editableSwimlane(board: Board, id: string): Item {
  const s = findSwimlane(board, id);
  if (!editableIds(board, [id]).includes(id)) throw new Error('This swimlane is locked. Unlock it to edit.');
  return s;
}

/** Objects whose bounds lie inside the swimlane (like a frame's contents), excluding the swimlane itself. */
export function swimlaneMembers(board: Board, id: string): Item[] {
  const s = board.items.find(i => i.id === id);
  if (!s) return [];
  return board.items.filter(i => i.id !== id && contains(s, itemBounds(i, board.items)));
}

export type LanePlace = { swimlane: Item; lane: SwimSection; phase?: SwimSection };
/** Lane (and phase) of a world point within one swimlane, or undefined outside its body. */
export function placeAt(swimlane: Item, p: { x: number; y: number }): Omit<LanePlace, 'swimlane'> | undefined {
  const s = fitSwimlaneItem(swimlane),
    l = swimlaneLayout(s),
    local = { x: p.x - s.x, y: p.y - s.y };
  if (local.x < 0 || local.y < 0 || local.x > s.w || local.y > s.h) return undefined;
  const horizontal = l.orientation === 'horizontal',
    main = horizontal ? local.y : local.x,
    cross = horizontal ? local.x : local.y;
  if (main < l.lanes[0].start) return undefined;
  const lane = l.lanes[cellIndexAt(l.lanes, main)].section,
    phase = l.phases.length ? l.phases[cellIndexAt(l.phases, cross)].section : undefined;
  return phase ? { lane, phase } : { lane };
}
/** Lane an object is in: the smallest swimlane holding its bounds, and the lane at its centre. */
export function laneOf(board: Board, itemId: string): LanePlace | undefined {
  const i = board.items.find(x => x.id === itemId);
  if (!i || i.type === 'swimlane') return undefined;
  const b = itemBounds(i, board.items);
  const home = board.items
    .filter(s => s.type === 'swimlane' && contains(s, b))
    .sort((a, c) => a.w * a.h - c.w * c.h)[0];
  if (!home) return undefined;
  const place = placeAt(home, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
  return place ? { swimlane: home, ...place } : undefined;
}

/** Make every swimlane's size and lane sizes agree (run on each change, so a resize scales the lanes). */
export function fitSwimlanes(board: Board): Board {
  let changed = false;
  const items = board.items.map(i => {
    if (i.type !== 'swimlane') return i;
    const f = fitSwimlaneItem(i);
    if (f !== i) changed = true;
    return f;
  });
  return changed ? { ...board, items } : board;
}

/**
 * Apply new swimlane data (same lane and phase ids where they survive) and carry the contents along:
 * each object keeps its offset within its lane and phase. Objects in a removed lane, or in a removed
 * phase while other phases remain, are deleted, or with `keep` (decision R6b-Q3: the person chose to keep
 * them) left where they are on the board. Locked objects stay where they are.
 */
export function relayoutSwimlane(
  board: Board,
  id: string,
  next: SwimlaneData,
  patch: Partial<Pick<Item, 'text'>> = {},
  keep = false,
): { board: Board; removed: number } {
  const old = fitSwimlaneItem(editableSwimlane(board, id)),
    oldL = swimlaneLayout(old),
    axes = swimAxes(old);
  const size = swimSizeFor(next, axes.cross),
    item = fitSwimlaneItem({ ...old, ...patch, data: next, w: size.w, h: size.h }),
    newL = swimlaneLayout(item);
  const oldH = oldL.orientation === 'horizontal',
    newH = newL.orientation === 'horizontal';
  const laneById = new Map(newL.lanes.map(c => [c.section.id, c])),
    phaseById = new Map(newL.phases.map(c => [c.section.id, c]));
  const crossOf = (r: { x: number; y: number; w: number; h: number }, h: boolean) => (h ? r.x : r.y);
  const members = swimlaneMembers(board, id),
    movable = new Set(
      editableIds(
        board,
        members.map(m => m.id),
      ),
    );
  const moves = new Map<string, { dx: number; dy: number }>(),
    gone: string[] = [];
  for (const m of members) {
    if (!movable.has(m.id)) continue;
    if (m.type === 'arrow' && m.from && m.to) continue; // follows its ends
    const b = itemBounds(m, board.items),
      cx = b.x + b.w / 2 - old.x,
      cy = b.y + b.h / 2 - old.y,
      main = oldH ? cy : cx,
      cross = oldH ? cx : cy;
    const lane = oldL.lanes[cellIndexAt(oldL.lanes, main)],
      target = laneById.get(lane.section.id);
    if (!target) {
      gone.push(m.id);
      continue;
    }
    const newMain = target.start + (main - lane.start);
    let newCross = crossOf(newL.body, newH) + (cross - crossOf(oldL.body, oldH));
    if (oldL.phases.length) {
      const phase = oldL.phases[cellIndexAt(oldL.phases, cross)],
        to = phaseById.get(phase.section.id);
      if (to) newCross = to.start + (cross - phase.start);
      else if (newL.phases.length) {
        gone.push(m.id);
        continue;
      }
    }
    const nx = newH ? newCross : newMain,
      ny = newH ? newMain : newCross,
      dx = nx - cx,
      dy = ny - cy;
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) moves.set(m.id, { dx, dy });
  }
  let out: Board = {
    ...board,
    items: board.items.map(i => {
      if (i.id === id) return item;
      const d = moves.get(i.id);
      return d ? { ...i, x: i.x + d.dx, y: i.y + d.dy } : i;
    }),
  };
  if (gone.length && !keep) out = removeItems(out, gone);
  return { board: out, removed: keep ? 0 : gone.length };
}

/** Objects a new swimlane layout would delete (those in removed lanes or phases), for asking first. */
export function sectionContentCount(board: Board, id: string, next: SwimlaneData): number {
  return relayoutSwimlane(board, id, next).removed;
}

/**
 * After a swimlane was resized (its box changed between `prev` and `next`), move each object with its lane and
 * phase so it keeps its offset inside them (decision R6b-Q1, 2026-11-08). Run with the board's other per-change
 * fixes, so a resize stays one undo step. Locked objects, connectors with both ends attached and swimlanes whose
 * lanes changed in the same step (relayoutSwimlane already moved those contents) are left alone.
 */
export function carrySwimlaneContents(next: Board, prev: Board): Board {
  let out = next;
  for (const s of next.items) {
    if (s.type !== 'swimlane') continue;
    const before = prev.items.find(i => i.id === s.id && i.type === 'swimlane');
    if (!before || (before.w === s.w && before.h === s.h) || before.data !== s.data) continue;
    const oldS = fitSwimlaneItem(before),
      newS = fitSwimlaneItem(s),
      oldL = swimlaneLayout(oldS),
      newL = swimlaneLayout(newS),
      h = oldL.orientation === 'horizontal';
    if (oldL.orientation !== newL.orientation) continue;
    const laneById = new Map(newL.lanes.map(c => [c.section.id, c])),
      phaseById = new Map(newL.phases.map(c => [c.section.id, c])),
      movable = new Set(
        editableIds(
          next,
          swimlaneMembers(prev, s.id).map(m => m.id),
        ),
      );
    const moves = new Map<string, { dx: number; dy: number }>();
    for (const m of swimlaneMembers(prev, s.id)) {
      if (!movable.has(m.id) || (m.type === 'arrow' && m.from && m.to)) continue;
      const b = itemBounds(m, prev.items),
        cx = b.x + b.w / 2 - oldS.x,
        cy = b.y + b.h / 2 - oldS.y,
        main = h ? cy : cx,
        cross = h ? cx : cy,
        lane = oldL.lanes[cellIndexAt(oldL.lanes, main)],
        target = laneById.get(lane.section.id);
      if (!target) continue;
      const newMain = target.start + (main - lane.start);
      let newCross = (h ? newL.body.x : newL.body.y) + (cross - (h ? oldL.body.x : oldL.body.y));
      if (oldL.phases.length) {
        const phase = oldL.phases[cellIndexAt(oldL.phases, cross)],
          to = phaseById.get(phase.section.id);
        if (to) newCross = to.start + (cross - phase.start);
      }
      const nx = newS.x + (h ? newCross : newMain),
        ny = newS.y + (h ? newMain : newCross),
        dx = nx - (oldS.x + cx),
        dy = ny - (oldS.y + cy);
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) moves.set(m.id, { dx, dy });
    }
    if (moves.size)
      out = {
        ...out,
        items: out.items.map(i => {
          const d = moves.get(i.id);
          return d ? { ...i, x: i.x + d.dx, y: i.y + d.dy } : i;
        }),
      };
  }
  return out;
}

const listOf = (d: SwimlaneData, axis: SwimAxis) => (axis === 'lanes' ? d.lanes : (d.phases ?? []));
const withList = (d: SwimlaneData, axis: SwimAxis, list: SwimSection[]): SwimlaneData => {
  if (axis === 'lanes') return { ...d, lanes: list };
  const { phases: _drop, ...rest } = d;
  void _drop;
  return list.length ? { ...rest, phases: list } : rest;
};
const noun = (axis: SwimAxis) => (axis === 'lanes' ? 'Lane' : 'Phase');
function nextTitle(list: SwimSection[], axis: SwimAxis) {
  const used = new Set(list.map(s => s.title));
  for (let k = list.length + 1; ; k++) if (!used.has(`${noun(axis)} ${k}`)) return `${noun(axis)} ${k}`;
}
const sectionIndex = (list: SwimSection[], sectionId: string, axis: SwimAxis) => {
  const k = list.findIndex(s => s.id === sectionId);
  if (k === -1) throw new Error(`${noun(axis)} not found.`);
  return k;
};

/** Insert a lane or phase at `index` (default: at the end). The first phase splits the body in two. */
export function addSection(board: Board, id: string, axis: SwimAxis, index?: number): Board {
  const s = fitSwimlaneItem(editableSwimlane(board, id)),
    d = swimData(s),
    list = listOf(d, axis);
  if (list.length >= SWIM_MAX_SECTIONS) throw new Error(`A swimlane holds up to ${SWIM_MAX_SECTIONS} ${axis}.`);
  if (axis === 'phases' && !list.length) {
    const half = Math.max(SWIM_MIN, swimAxes(s).cross / 2);
    return relayoutSwimlane(
      board,
      id,
      withList(d, axis, [
        { id: newId(), title: 'Phase 1', size: half },
        { id: newId(), title: 'Phase 2', size: half },
      ]),
    ).board;
  }
  const size = axis === 'lanes' ? SWIM_DEFAULT_LANE : SWIM_DEFAULT_PHASE,
    at = Math.max(0, Math.min(list.length, index ?? list.length)),
    added = { id: newId(), title: nextTitle(list, axis), size };
  return relayoutSwimlane(board, id, withList(d, axis, [...list.slice(0, at), added, ...list.slice(at)])).board;
}
/**
 * Remove a lane or phase with the objects in it (one undo step). Removing the only phase removes the
 * phase band and keeps the contents. A swimlane always keeps at least one lane.
 */
export function removeSection(
  board: Board,
  id: string,
  axis: SwimAxis,
  sectionId: string,
  keep = false,
): { board: Board; removed: number } {
  return relayoutSwimlane(board, id, withoutSection(board, id, axis, sectionId), {}, keep);
}
/** The swimlane data without one lane or phase (a swimlane always keeps at least one lane). */
export function withoutSection(board: Board, id: string, axis: SwimAxis, sectionId: string): SwimlaneData {
  const d = swimData(editableSwimlane(board, id)),
    list = listOf(d, axis),
    k = sectionIndex(list, sectionId, axis);
  if (axis === 'lanes' && list.length === 1) throw new Error('A swimlane needs at least one lane.');
  return withList(
    d,
    axis,
    list.filter((_, j) => j !== k),
  );
}
/** Move a lane or phase one place earlier (-1) or later (+1), carrying its objects along. */
export function moveSection(board: Board, id: string, axis: SwimAxis, sectionId: string, dir: -1 | 1): Board {
  const d = swimData(editableSwimlane(board, id)),
    list = [...listOf(d, axis)],
    k = sectionIndex(list, sectionId, axis),
    j = k + dir;
  if (j < 0 || j >= list.length) return board;
  [list[k], list[j]] = [list[j], list[k]];
  return relayoutSwimlane(board, id, withList(d, axis, list)).board;
}
/** Resize one lane or phase (moves its far boundary); objects in later lanes shift so they stay put in their lane. */
export function resizeSection(board: Board, id: string, axis: SwimAxis, sectionId: string, size: number): Board {
  const s = fitSwimlaneItem(editableSwimlane(board, id)),
    d = swimData(s),
    list = listOf(d, axis),
    k = sectionIndex(list, sectionId, axis);
  if (!Number.isFinite(size)) throw new Error('Enter a size in pixels.');
  const clamped = Math.round(Math.min(SWIM_MAX, Math.max(SWIM_MIN, size)) * 100) / 100;
  return relayoutSwimlane(
    board,
    id,
    withList(
      d,
      axis,
      list.map((x, j) => (j === k ? { ...x, size: clamped } : x)),
    ),
  ).board;
}
/** Rename or recolour one lane or phase (`color` null clears the tint). */
export function patchSection(
  board: Board,
  id: string,
  axis: SwimAxis,
  sectionId: string,
  patch: { title?: string; color?: string | null },
): Board {
  const d = swimData(editableSwimlane(board, id)),
    list = listOf(d, axis);
  sectionIndex(list, sectionId, axis);
  const next = list.map(x => {
    if (x.id !== sectionId) return x;
    const out: SwimSection = { ...x };
    if (patch.title !== undefined) out.title = patch.title.slice(0, 200);
    if (patch.color === null) delete out.color;
    else if (patch.color !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(patch.color)) throw new Error('Choose a colour.');
      out.color = patch.color.toLowerCase();
    }
    return out;
  });
  return relayoutSwimlane(board, id, withList(d, axis, next)).board;
}
/** Lanes as rows (horizontal) or columns (vertical); objects keep their place within their lane and phase. */
export function setSwimOrientation(board: Board, id: string, orientation: SwimOrientation): Board {
  const d = swimData(editableSwimlane(board, id));
  if (d.orientation === orientation) return board;
  return relayoutSwimlane(board, id, { ...d, orientation }).board;
}
/** Show or hide the pool title band; contents shift with the lanes. */
export function setSwimTitleShown(board: Board, id: string, shown: boolean): Board {
  const d = swimData(editableSwimlane(board, id));
  const { hideTitle: _h, ...rest } = d;
  void _h;
  return relayoutSwimlane(board, id, shown ? rest : { ...rest, hideTitle: true }).board;
}
