// Selection arrangement: alignment, distribution, persistent groups and locking.
// Evidence: the reference client's widget menus expose GROUP_HORIZ, LOCK_HORIZ, LOCK_UNLOCK_WIDGETS, ungroup and
// unlockAll identifiers. Groups here are explicit membership; frames remain spatial containment.
import type { Board, Item, GroupDef, Point } from './model.ts';
import { clone, pruneReferences } from './model.ts';
import { isShapeKind } from './shapes.ts';
import { inLockedLayer } from './layers.ts';
import { gridOwner } from './grid-canvas.ts';
import type { GridData } from './grid.ts';
import { frameMoveIds, selectionBounds, translate } from './interactions.ts';
import type { Bounds } from './interactions.ts';
import { expandLinked, remapMermaidNode } from './mermaid-link-rules.ts';

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

function groupMap(board: Board) {
  return new Map((board.groups ?? []).map(g => [g.id, g]));
}
/** Outermost group containing an item, or undefined when the item is ungrouped. */
export function rootGroupOf(board: Board, item: Item | undefined): string | undefined {
  if (!item?.group) return undefined;
  const map = groupMap(board),
    seen = new Set<string>();
  let id = item.group;
  while (map.get(id)?.parent && !seen.has(id)) {
    seen.add(id);
    id = map.get(id)!.parent!;
  }
  return id;
}
/** All group ids from an item's own group up to the root. */
function chain(board: Board, item: Item): string[] {
  const map = groupMap(board),
    out: string[] = [];
  for (let id = item.group; id && !out.includes(id); id = map.get(id)?.parent ?? undefined) out.push(id);
  return out;
}
export function groupMembers(board: Board, groupId: string): string[] {
  return board.items.filter(i => chain(board, i).includes(groupId)).map(i => i.id);
}
/** Selection semantics: picking any member selects its whole outermost group. */
export function expandGroups(board: Board, ids: string[]): string[] {
  const out = new Set(ids),
    byId = new Map(board.items.map(i => [i.id, i]));
  for (const id of ids) {
    const root = rootGroupOf(board, byId.get(id));
    if (root) for (const m of groupMembers(board, root)) out.add(m);
  }
  return [...out];
}
function units(board: Board, ids: string[]): string[][] {
  const byId = new Map(board.items.map(i => [i.id, i])),
    byRoot = new Map<string, string[]>(),
    out: string[][] = [];
  for (const id of expandGroups(board, ids)) {
    const item = byId.get(id);
    if (!item) continue;
    const root = rootGroupOf(board, item);
    if (root) {
      if (!byRoot.has(root)) {
        byRoot.set(root, []);
        out.push(byRoot.get(root)!);
      }
      byRoot.get(root)!.push(id);
    } else out.push([id]);
  }
  return out;
}

export function groupSelection(board: Board, ids: string[]): { board: Board; groupId: string } {
  if (ids.some(id => gridOwner(board, id))) throw new Error('Move objects out of the Grid before grouping them.');
  const parts = units(board, ids);
  if (parts.length < 2) throw new Error('Select at least two objects or groups to group.');
  if (parts.flat().some(id => board.items.find(i => i.id === id)?.locked))
    throw new Error('Unlock objects before grouping them.');
  const groupId = crypto.randomUUID(),
    byId = new Map(board.items.map(i => [i.id, i])),
    roots = new Set<string>(),
    loose = new Set<string>();
  for (const part of parts) {
    const root = rootGroupOf(board, byId.get(part[0]));
    if (root) roots.add(root);
    else loose.add(part[0]);
  }
  const groups: GroupDef[] = [
    ...(board.groups ?? []).map(g => (roots.has(g.id) ? { ...g, parent: groupId } : g)),
    { id: groupId, parent: null },
  ];
  return {
    board: { ...board, groups, items: board.items.map(i => (loose.has(i.id) ? { ...i, group: groupId } : i)) },
    groupId,
  };
}
/** Remove one level: the outermost group(s) of the selection. Inner groups survive. */
export function ungroupSelection(board: Board, ids: string[]): Board {
  const byId = new Map(board.items.map(i => [i.id, i])),
    roots = new Set(ids.map(id => rootGroupOf(board, byId.get(id))).filter(Boolean) as string[]);
  if (!roots.size) throw new Error('Select a group to ungroup.');
  if (ids.some(id => byId.get(id)?.locked)) throw new Error('Unlock the group before ungrouping it.');
  return pruneReferences({
    ...board,
    groups: (board.groups ?? [])
      .filter(g => !roots.has(g.id))
      .map(g => (g.parent && roots.has(g.parent) ? { ...g, parent: null } : g)),
    items: board.items.map(i => (i.group && roots.has(i.group) ? { ...i, group: undefined } : i)),
  });
}
export const isGrouped = (board: Board, ids: string[]) => ids.some(id => board.items.find(i => i.id === id)?.group);
export const canGroup = (board: Board, ids: string[]) => units(board, ids).length >= 2;

// ---- Locking -------------------------------------------------------------------------------
export const isLocked = (board: Board, id: string) => !!board.items.find(i => i.id === id)?.locked;
/** Lock or unlock items (whole groups are affected together). One board change = one undo step. */
export function setLocked(board: Board, ids: string[], locked: boolean): Board {
  if (locked && ids.some(id => gridOwner(board, id)))
    throw new Error('Move objects out of the Grid before locking them.');
  const target = new Set(expandGroups(board, ids));
  return {
    ...board,
    items: board.items.map(i => {
      if (!target.has(i.id)) return i;
      const next = { ...i };
      if (locked) next.locked = true;
      else delete next.locked;
      return next;
    }),
  };
}
/**
 * Ids that ordinary editing may change. A unit (group) with any locked member is held entirely;
 * frame moves carry contained objects except locked ones.
 */
export function editableIds(board: Board, ids: string[]): string[] {
  const byId = new Map(board.items.map(i => [i.id, i]));
  const locked = (id: string) => {
    const i = byId.get(id);
    return !!i && (!!i.locked || inLockedLayer(board, i));
  };
  return units(board, ids)
    .filter(u => !u.some(id => locked(id) || gridOwner(board, id)?.locked))
    .flat();
}
export function moveIds(board: Board, ids: string[]): string[] {
  const byId = new Map(board.items.map(i => [i.id, i]));
  const expanded = [
    ...new Set([
      ...ids,
      ...ids.flatMap(id => {
        const i = byId.get(id);
        return i?.type === 'grid' ? ((i.data as GridData).objects ?? []).map(o => o.id) : [];
      }),
    ]),
  ];
  return frameMoveIds(board.items, editableIds(board, expanded)).filter(
    id => !byId.get(id)?.locked && !inLockedLayer(board, byId.get(id)!) && !gridOwner(board, id)?.locked,
  );
}

// ---- Alignment and distribution --------------------------------------------------------------
type Unit = { ids: string[]; moves: string[]; bounds: Bounds };
/** Units that alignment/distribution act on. Attached connectors follow their objects instead. */
function arrangeUnits(board: Board, ids: string[]): Unit[] {
  const byId = new Map(board.items.map(i => [i.id, i]));
  const list = units(board, ids)
    .filter(u => !u.some(id => gridOwner(board, id)))
    .filter(u => !u.some(id => byId.get(id)?.locked))
    .map(u =>
      u.filter(id => {
        const i = byId.get(id)!;
        return !(i.type === 'arrow' && (i.from || i.to) && u.length === 1);
      }),
    )
    .filter(u => u.length)
    .map(u => ({
      ids: u,
      moves: frameMoveIds(board.items, u).filter(id => !byId.get(id)?.locked),
      bounds: selectionBounds(board.items, u)!,
    }));
  // A unit carried by another unit's frame must not move twice.
  return list.filter(
    u => !list.some(o => o !== u && u.ids.every(id => o.moves.includes(id)) && !o.ids.every(id => u.ids.includes(id))),
  );
}
export const canAlign = (board: Board, ids: string[]) => arrangeUnits(board, ids).length >= 2;
export const canDistribute = (board: Board, ids: string[]) => arrangeUnits(board, ids).length >= 3;
function shift(board: Board, list: { moves: string[]; delta: Point }[]): Board {
  let next = board;
  for (const { moves, delta } of list) if (delta.x || delta.y) next = translate(next, moves, delta);
  return next;
}
/** Align selected units to the selection bounds. Unselected objects are untouched. */
export function alignSelection(board: Board, ids: string[], mode: AlignMode): Board {
  const list = arrangeUnits(board, ids);
  if (list.length < 2) return board;
  const ref = list.reduce(
    (r, u) => ({
      x: Math.min(r.x, u.bounds.x),
      y: Math.min(r.y, u.bounds.y),
      r: Math.max(r.r, u.bounds.x + u.bounds.w),
      b: Math.max(r.b, u.bounds.y + u.bounds.h),
    }),
    { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity },
  );
  return shift(
    board,
    list.map(u => {
      const b = u.bounds;
      const x =
        mode === 'left'
          ? ref.x - b.x
          : mode === 'right'
            ? ref.r - (b.x + b.w)
            : mode === 'center'
              ? (ref.x + ref.r) / 2 - (b.x + b.w / 2)
              : 0;
      const y =
        mode === 'top'
          ? ref.y - b.y
          : mode === 'bottom'
            ? ref.b - (b.y + b.h)
            : mode === 'middle'
              ? (ref.y + ref.b) / 2 - (b.y + b.h / 2)
              : 0;
      return { moves: u.moves, delta: { x, y } };
    }),
  );
}
/** Equal gaps between neighbours; the outermost units stay fixed. */
export function distributeSelection(board: Board, ids: string[], axis: 'horizontal' | 'vertical'): Board {
  const list = arrangeUnits(board, ids);
  if (list.length < 3) return board;
  const pos = axis === 'horizontal' ? 'x' : 'y',
    size = axis === 'horizontal' ? 'w' : 'h';
  const sorted = [...list].sort((a, b) => a.bounds[pos] - b.bounds[pos] || a.bounds[size] - b.bounds[size]);
  const first = sorted[0],
    last = sorted.at(-1)!,
    total = last.bounds[pos] + last.bounds[size] - first.bounds[pos];
  const gap = (total - sorted.reduce((s, u) => s + u.bounds[size], 0)) / (sorted.length - 1);
  let cursor = first.bounds[pos] + first.bounds[size] + gap;
  const moves = sorted.slice(1, -1).map(u => {
    const d = cursor - u.bounds[pos];
    cursor += u.bounds[size] + gap;
    return { moves: u.moves, delta: axis === 'horizontal' ? { x: d, y: 0 } : { x: 0, y: d } };
  });
  return shift(board, moves);
}

/** Duplicate a selection, remapping connectors and copying group structure. Copies are unlocked. */
export function duplicateItems(
  board: Board,
  ids: string[],
  offset: number | { x: number; y: number } = 32,
): { board: Board; ids: string[] } {
  const off = typeof offset === 'number' ? { x: offset, y: offset } : offset;
  const included = new Set([
    ...expandLinked(board, ids),
    ...ids.flatMap(id => {
      const i = board.items.find(i => i.id === id);
      return i?.type === 'grid' ? ((i.data as GridData).objects ?? []).map(o => o.id) : [];
    }),
  ]);
  const source = board.items.filter(i => included.has(i.id)),
    map = new Map(source.map(i => [i.id, crypto.randomUUID()]));
  const groupIds = new Set<string>(),
    gmap = groupMap(board);
  for (const i of source) for (const g of chain(board, i)) groupIds.add(g);
  const newGroup = new Map([...groupIds].map(g => [g, crypto.randomUUID()]));
  const groups: GroupDef[] = [...groupIds].map(g => ({
    id: newGroup.get(g)!,
    parent: gmap.get(g)?.parent && newGroup.has(gmap.get(g)!.parent!) ? newGroup.get(gmap.get(g)!.parent!)! : null,
  }));
  const copies = source.map(i => {
    const copy: Item = { ...remapMermaidNode(clone(i), map), id: map.get(i.id)!, x: i.x + off.x, y: i.y + off.y };
    if (i.from) copy.from = map.get(i.from) ?? i.from;
    if (i.to) copy.to = map.get(i.to) ?? i.to;
    if (i.linkTo && map.has(i.linkTo)) copy.linkTo = map.get(i.linkTo);
    if (i.group) copy.group = newGroup.get(i.group);
    if (i.type === 'grid')
      copy.data = {
        ...copy.data,
        objects: (i.data as GridData).objects?.filter(o => map.has(o.id)).map(o => ({ ...o, id: map.get(o.id)! })),
      };
    delete copy.locked;
    return copy;
  });
  return {
    board: {
      ...board,
      items: [...board.items, ...copies],
      ...(groups.length ? { groups: [...(board.groups ?? []), ...groups] } : {}),
    },
    ids: copies.map(i => i.id),
  };
}

export type ZOrder = 'front' | 'back' | 'forward' | 'backward';
/**
 * Change paint order of the selection (expanded to whole groups, locked objects excluded).
 * `forward`/`backward` move each selected run one step past its unselected neighbour.
 */
export function reorderZ(board: Board, ids: string[], how: ZOrder): Board {
  const chosen = new Set(editableIds(board, expandGroups(board, ids)));
  if (!chosen.size) return board;
  const items = [...board.items];
  if (how === 'front' || how === 'back') {
    const picked = items.filter(i => chosen.has(i.id)),
      rest = items.filter(i => !chosen.has(i.id));
    return { ...board, items: how === 'front' ? [...rest, ...picked] : [...picked, ...rest] };
  }
  // One pass of adjacent swaps: each selected run hops over its one unselected neighbour.
  if (how === 'forward') {
    for (let i = items.length - 2; i >= 0; i--)
      if (chosen.has(items[i].id) && !chosen.has(items[i + 1].id)) [items[i], items[i + 1]] = [items[i + 1], items[i]];
  } else {
    for (let i = 1; i < items.length; i++)
      if (chosen.has(items[i].id) && !chosen.has(items[i - 1].id)) [items[i], items[i - 1]] = [items[i - 1], items[i]];
  }
  return { ...board, items };
}

/** Kinds whose text "Clear content" empties. */
const clearable = (i: Item) => ['note', 'text', 'card', 'flipcard'].includes(i.type) || isShapeKind(i.type);
/** Clear object contents (Ctrl+Backspace): empties text on unlocked notes, text, shapes and cards. */
export function clearContent(board: Board, ids: string[]): { board: Board; cleared: number } {
  const chosen = new Set(editableIds(board, expandGroups(board, ids)));
  let cleared = 0;
  const items = board.items.map(i => {
    if (!chosen.has(i.id) || !clearable(i)) return i;
    const card = i.type === 'card' && i.data?.description;
    if (!i.text && !card) return i;
    cleared++;
    return { ...i, text: '', ...(card ? { data: { ...i.data, description: '' } } : {}) };
  });
  return { board: cleared ? { ...board, items } : board, cleared };
}
