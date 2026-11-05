// Named layers (gap D9). `board.layers` lists layers bottom to top; objects name theirs in `item.layer`.
// Objects without a layer belong to the base layer, which always exists (id 'base'). A hidden layer is not
// drawn; a locked layer cannot be edited. New objects go to the active layer. Pure.
import type { Board, Item } from './model.ts';

export type Layer = { id: string; name: string; hidden?: boolean; locked?: boolean };
export const BASE_LAYER = 'base';
export const MAX_LAYERS = 30;

/** Layers bottom to top, always starting with the base layer. */
export function layersOf(board: Board): Layer[] {
  const list = board.layers ?? [];
  return list.some(l => l.id === BASE_LAYER) ? list : [{ id: BASE_LAYER, name: 'Layer 1' }, ...list];
}
export const layerIdOf = (item: Item) => item.layer ?? BASE_LAYER;
const find = (board: Board, id: string) => layersOf(board).find(l => l.id === id);
export const inHiddenLayer = (board: Board, item: Item) => !!board.layers && !!find(board, layerIdOf(item))?.hidden;
export const inLockedLayer = (board: Board, item: Item) => !!board.layers && !!find(board, layerIdOf(item))?.locked;

const withLayers = (board: Board, layers: Layer[]): Board => {
  const next: Board = { ...board, layers };
  // A single, plain base layer is the same as having no layers.
  if (
    layers.length === 1 &&
    layers[0].id === BASE_LAYER &&
    !layers[0].hidden &&
    !layers[0].locked &&
    layers[0].name === 'Layer 1'
  )
    delete next.layers;
  return next;
};

export function addLayer(board: Board, name: string, id: string): Board {
  const layers = layersOf(board);
  if (layers.length >= MAX_LAYERS) throw new Error(`A board holds up to ${MAX_LAYERS} layers.`);
  const clean = name.trim().slice(0, 80) || `Layer ${layers.length + 1}`;
  return withLayers(board, [...layers, { id, name: clean }]);
}
export function patchLayer(board: Board, id: string, patch: Partial<Omit<Layer, 'id'>>): Board {
  const layers = layersOf(board).map(l => {
    if (l.id !== id) return l;
    const next: Layer = { ...l, ...patch };
    if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 80) || l.name;
    if (!next.hidden) delete next.hidden;
    if (!next.locked) delete next.locked;
    return next;
  });
  return withLayers(board, layers);
}
/** Move a layer one step up (+1) or down (-1) in the stacking order; paint order follows. */
export function moveLayer(board: Board, id: string, step: 1 | -1): Board {
  const layers = [...layersOf(board)],
    at = layers.findIndex(l => l.id === id),
    to = at + step;
  if (at < 0 || to < 0 || to >= layers.length) return board;
  [layers[at], layers[to]] = [layers[to], layers[at]];
  return sortByLayer(withLayers(board, layers));
}
/** Delete a layer; its objects move to the layer below it (or the base layer). The base layer stays. */
export function deleteLayer(board: Board, id: string): Board {
  if (id === BASE_LAYER) return board;
  const layers = layersOf(board),
    at = layers.findIndex(l => l.id === id);
  if (at < 0) return board;
  const target = layers[Math.max(0, at - 1)].id;
  const items = board.items.map(i => (layerIdOf(i) === id ? setLayer(i, target) : i));
  return withLayers(
    { ...board, items },
    layers.filter(l => l.id !== id),
  );
}
const setLayer = (i: Item, layer: string): Item => {
  const next: Item = { ...i, layer };
  if (layer === BASE_LAYER) delete next.layer;
  return next;
};
/** Move objects to a layer (locked objects stay) and keep paint order grouped by layer. */
export function moveToLayer(board: Board, ids: string[], layer: string): Board {
  if (!find(board, layer)) throw new Error('That layer no longer exists.');
  const wanted = new Set(ids);
  const items = board.items.map(i => (wanted.has(i.id) && !i.locked ? setLayer(i, layer) : i));
  return sortByLayer(withLayers({ ...board, items }, layersOf(board)));
}
/**
 * Duplicate a layer (track J): a new layer named "<name> copy" directly above it, holding copies of its
 * objects with new ids. References between copied objects (connector ends, object links, groups,
 * auto-layout children, Grid cell objects, linked Mermaid frames, prototype links) point at the copies;
 * connectors to objects on other layers stay attached to those objects. The copy is not locked.
 */
export function duplicateLayer(
  board: Board,
  id: string,
  newId: string,
  makeId: () => string = () => crypto.randomUUID(),
): { board: Board; ids: string[] } {
  const layers = layersOf(board),
    at = layers.findIndex(l => l.id === id);
  if (at < 0) throw new Error('That layer no longer exists.');
  if (layers.length >= MAX_LAYERS) throw new Error(`A board holds up to ${MAX_LAYERS} layers.`);
  const source = layers[at],
    copyLayer: Layer = { id: newId, name: `${source.name.slice(0, 75)} copy` };
  if (source.hidden) copyLayer.hidden = true;
  const originals = board.items.filter(i => layerIdOf(i) === id),
    map = new Map(originals.map(i => [i.id, makeId()]));
  // Groups whose members are copied get copies too (with their ancestors), so grouping is kept.
  const groupDefs = new Map((board.groups ?? []).map(g => [g.id, g])),
    groupMap = new Map<string, string>();
  for (const i of originals)
    for (let g = i.group, depth = 0; g && groupDefs.has(g) && !groupMap.has(g) && depth < 100; depth++) {
      groupMap.set(g, makeId());
      g = groupDefs.get(g)!.parent ?? undefined;
    }
  const remap = (ref: unknown) => (typeof ref === 'string' ? map.get(ref) : undefined);
  const copies = originals.map(i => {
    const copy: Item = { ...structuredClone(i), id: map.get(i.id)!, layer: newId };
    if (i.from && map.has(i.from)) copy.from = map.get(i.from);
    if (i.to && map.has(i.to)) copy.to = map.get(i.to);
    if (i.linkTo && map.has(i.linkTo)) copy.linkTo = map.get(i.linkTo);
    if (i.group) copy.group = groupMap.get(i.group);
    if (!copy.group) delete copy.group;
    if (i.mermaidNode) {
      const frame = map.get(i.mermaidNode.frame);
      if (frame) copy.mermaidNode = { ...i.mermaidNode, frame };
      else delete copy.mermaidNode;
    }
    if (copy.data) {
      const d = copy.data;
      if (i.type === 'autolayout' && Array.isArray(d.children))
        d.children = d.children.map(remap).filter((c: string | undefined): c is string => !!c);
      if (i.type === 'grid' && Array.isArray(d.objects))
        d.objects = d.objects
          .filter((o: { id: string }) => map.has(o.id))
          .map((o: { id: string }) => ({ ...o, id: map.get(o.id)! }));
      if (typeof d.link === 'string' && map.has(d.link)) d.link = map.get(d.link);
    }
    delete copy.locked;
    return copy;
  });
  const groups = [...groupMap].map(([g, nid]) => {
    const parent = groupDefs.get(g)!.parent;
    return { id: nid, parent: parent && groupMap.has(parent) ? groupMap.get(parent)! : null };
  });
  const next: Board = {
    ...board,
    items: [...board.items, ...copies],
    ...(groups.length ? { groups: [...(board.groups ?? []), ...groups] } : {}),
  };
  const list = [...layers];
  list.splice(at + 1, 0, copyLayer);
  return { board: sortByLayer(withLayers(next, list)), ids: copies.map(i => i.id) };
}
/** Stable sort of items so lower layers paint first. */
export function sortByLayer(board: Board): Board {
  if (!board.layers) return board;
  const rank = new Map(layersOf(board).map((l, k) => [l.id, k]));
  const items = board.items
    .map((i, k) => ({ i, k, r: rank.get(layerIdOf(i)) ?? 0 }))
    .sort((a, b) => a.r - b.r || a.k - b.k)
    .map(x => x.i);
  return items.every((i, k) => i === board.items[k]) ? board : { ...board, items };
}
/** Put objects that are new in `next` (not in `prev`) on the active layer. */
export function assignNewToLayer(prev: Board, next: Board, active: string): Board {
  if (active === BASE_LAYER || !find(next, active)) return next;
  const before = new Set(prev.items.map(i => i.id));
  let changed = false;
  const items = next.items.map(i => {
    if (before.has(i.id) || i.layer) return i;
    changed = true;
    return { ...i, layer: active };
  });
  return changed ? sortByLayer({ ...next, items }) : next;
}

export function validateLayers(board: Board) {
  if (board.layers !== undefined) {
    const ids = new Set<string>();
    if (
      !Array.isArray(board.layers) ||
      board.layers.length > MAX_LAYERS ||
      board.layers.some(l => {
        const bad =
          !l ||
          typeof l.id !== 'string' ||
          !l.id ||
          l.id.length > 64 ||
          ids.has(l.id) ||
          typeof l.name !== 'string' ||
          !l.name.trim() ||
          l.name.length > 80 ||
          (l.hidden !== undefined && typeof l.hidden !== 'boolean') ||
          (l.locked !== undefined && typeof l.locked !== 'boolean');
        ids.add(l?.id);
        return bad;
      })
    )
      throw new Error('Invalid layers.');
  }
  const known = new Set(layersOf(board).map(l => l.id));
  if (board.items.some(i => i.layer !== undefined && (typeof i.layer !== 'string' || !known.has(i.layer))))
    throw new Error('An object refers to a missing layer.');
}
