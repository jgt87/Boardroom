// Extra mapping for the whiteboard REST import (whiteboard-import.ts): stacking order by creation time, groups,
// mind maps, placeholders for objects the API cannot export, the recreate file, and one layer per frame. Pure:
// no React, no DOM.
//
// The recreate file (`boardroom-recreate-v1`, written by scripts/export-whiteboard.mjs and merged into the export
// by scripts/merge-recreate.mjs) lists objects the API returns without their content. Each entry names the source
// object and a `content` written by a person, a script or an agent; the import turns it into a native object at the
// same place. Every result is checked by `parseBoard` before it is kept, so the file adds no new trust surface.
import { createItem } from './model.ts';
import type { Board, GroupDef, ImageAsset, Item, Kind, MindNode, RecordRow } from './model.ts';
import { csvTable, importRecordTable } from './record-import.ts';
import { defaultSchema } from './record-schema.ts';
import type { RecordSchema } from './record-schema.ts';
import { BASE_LAYER, MAX_LAYERS, sortByLayer } from './layers.ts';
import type { Layer } from './layers.ts';
import { STORY_LIMITS } from './storymap.ts';
import type { StoryMap } from './storymap.ts';
import { MAX_IMAGE_BYTES } from './model-ext.ts';

export const RECREATE_FORMAT = 'boardroom-recreate-v1';
/** Content kinds a recreate entry can hold. */
export const recreateKinds = [
  'table',
  'kanban',
  'timeline',
  'doc',
  'mindmap',
  'storymap',
  'note',
  'text',
  'image',
  'items',
] as const;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const newId = () => crypto.randomUUID();
/** Top-left box in board coordinates. */
export type Box = { x: number; y: number; w: number; h: number };

// ---- Stacking order -----------------------------------------------------------------------------
/**
 * Objects in creation order (oldest at the back), the closest the API gets to the stacking order: it reports no
 * front-to-back order. Kept as listed unless every object carries a valid `createdAt`. Stable.
 */
export function byCreation<T extends { raw: Json }>(list: T[]): T[] {
  const times = list.map(s => Date.parse(str(s.raw.createdAt)));
  if (!list.length || times.some(t => !Number.isFinite(t))) return list;
  return list
    .map((s, k) => ({ s, k, t: times[k] }))
    .sort((a, b) => a.t - b.t || a.k - b.k)
    .map(x => x.s);
}

// ---- Groups -------------------------------------------------------------------------------------
/**
 * Boardroom groups for the export's groups (`{ id, data: { items: [ids] } }`). Sets `group` on the imported
 * objects in place; a group needs two imported members, and an object joins only its first group.
 */
export function applyGroups(rawGroups: unknown, idMap: Map<string, Item>): GroupDef[] {
  const groups: GroupDef[] = [];
  for (const g of Array.isArray(rawGroups) ? rawGroups.slice(0, 5000) : []) {
    if (!isObj(g)) continue;
    const ids = isObj(g.data) && Array.isArray(g.data.items) ? g.data.items : Array.isArray(g.items) ? g.items : [];
    const members = [...new Set(ids.map(i => idMap.get(isObj(i) ? str(i.id) : str(i))))].filter(
      (i): i is Item => !!i && !i.group,
    );
    if (members.length < 2) continue;
    const id = newId();
    for (const m of members) m.group = id;
    groups.push({ id, parent: null });
  }
  return groups;
}

// ---- Mind maps ----------------------------------------------------------------------------------
const MIND_MAX = 200;
type RawNode = { id: string; parent?: string; text: string; x?: number; y?: number };
const nodeText = (raw: Json, plain: (html: unknown, max: number) => string): string => {
  const d = isObj(raw.data) ? raw.data : {},
    view = isObj(d.nodeView) ? d.nodeView : {},
    viewData = isObj(view.data) ? view.data : {};
  return plain(viewData.content ?? view.content ?? d.content ?? d.text, 6000)
    .replace(/\s+/g, ' ')
    .trim();
};
/**
 * One Boardroom mind map per root of the exported mind map nodes (`parent.id` links a node to its parent). The
 * map covers the nodes' area; topics are laid out automatically. Maps over 200 topics keep the first 200; trees
 * without any topic text are returned in `blank` for the caller to mark like other objects without content.
 */
export function mindMapsFrom(
  rawNodes: unknown[],
  plain: (html: unknown, max: number) => string,
): { items: Item[]; sourceIds: string[][]; dropped: number; blank: string[] } {
  const nodes = new Map<string, RawNode>();
  for (const raw of rawNodes.slice(0, 20_000)) {
    if (!isObj(raw) || !str(raw.id) || nodes.has(str(raw.id))) continue;
    const pos = isObj(raw.position) ? raw.position : {};
    nodes.set(str(raw.id), {
      id: str(raw.id),
      parent: isObj(raw.parent) ? str(raw.parent.id) || undefined : undefined,
      text: nodeText(raw, plain),
      x: num(pos.x),
      y: num(pos.y),
    });
  }
  const children = new Map<string, RawNode[]>();
  for (const n of nodes.values())
    if (n.parent && nodes.has(n.parent)) children.set(n.parent, [...(children.get(n.parent) ?? []), n]);
  const items: Item[] = [],
    sourceIds: string[][] = [],
    blank: string[] = [];
  let dropped = 0;
  for (const root of [...nodes.values()].filter(n => !n.parent || !nodes.has(n.parent))) {
    const tree: RawNode[] = [];
    for (const queue = [root]; queue.length;) {
      const n = queue.shift()!;
      tree.push(n);
      queue.push(...(children.get(n.id) ?? []));
    }
    // A tree without any topic text (the items list carries no content) is not a mind map worth building.
    if (tree.every(n => !n.text)) {
      blank.push(...tree.map(n => n.id));
      continue;
    }
    dropped += Math.max(0, tree.length - MIND_MAX);
    const kept = tree.slice(0, MIND_MAX),
      ids = new Map(kept.map(n => [n.id, newId()]));
    const item = createItem('mindmap', 0, 0);
    item.nodes = kept.map((n): MindNode => ({
      id: ids.get(n.id)!,
      parent: n === root ? null : (ids.get(n.parent!) ?? ids.get(root.id)!),
      text: n.text || 'Topic',
    }));
    placeOver(item, kept);
    items.push(item);
    sourceIds.push(kept.map(n => n.id));
  }
  return { items, sourceIds, dropped, blank };
}
/** Size and place a mind map over its topics' centres, with room for the topic boxes. */
function placeOver(item: Item, nodes: RawNode[]) {
  const xs = nodes.map(n => n.x).filter((v): v is number => v !== undefined),
    ys = nodes.map(n => n.y).filter((v): v is number => v !== undefined);
  if (!xs.length || !ys.length) return;
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  item.w = Math.round(Math.max(360, x1 - x0 + 260));
  item.h = Math.round(Math.max(220, y1 - y0 + 140));
  item.x = Math.round((x0 + x1) / 2 - item.w / 2);
  item.y = Math.round((y0 + y1) / 2 - item.h / 2);
}

// ---- Placeholders -------------------------------------------------------------------------------
/** A dashed outline where an object could not be exported, so the layout keeps its place and name. */
export function placeholderFor(label: string, box: Box): Item {
  const item = createItem('rectangle', box.x, box.y, '#f5f6f8');
  item.w = Math.max(40, Math.round(box.w));
  item.h = Math.max(30, Math.round(box.h));
  const name = label.charAt(0).toUpperCase() + label.slice(1);
  item.text = `${name} (not exported)`;
  item.name = `${name} placeholder`;
  item.style = { ...item.style, borderStyle: 'dashed', borderColor: '#8a8f98', borderWidth: 2 };
  return item;
}

// ---- Recreate entries ---------------------------------------------------------------------------
export type Recreated = {
  items: Item[];
  datasets: Record<string, RecordRow[]>;
  recordSchemas: Record<string, RecordSchema>;
  assets: Record<string, ImageAsset>;
};
const empty = (): Recreated => ({ items: [], datasets: {}, recordSchemas: {}, assets: {} });
const sized = (kind: Kind, box: Box, fill?: string): Item => {
  const item = createItem(kind, Math.round(box.x), Math.round(box.y), fill);
  item.w = Math.max(40, Math.round(box.w || item.w));
  item.h = Math.max(30, Math.round(box.h || item.h));
  return item;
};
const title = (c: Json, fallback: string) => str(c.title).replace(/\s+/g, ' ').trim().slice(0, 200) || fallback;

function recordView(kind: 'table' | 'kanban' | 'timeline', c: Json, box: Box): Recreated {
  const table = Array.isArray(c.rows)
    ? c.rows.slice(0, 5001).map(r => (Array.isArray(r) ? r.map(str) : []))
    : typeof c.csv === 'string'
      ? csvTable(c.csv)
      : null;
  if (!table || table.length < 2) throw new Error(`A ${kind} needs "rows" or "csv" with a header row and data.`);
  const result = importRecordTable(table, defaultSchema, [], newId),
    datasetId = newId(),
    item = sized(kind, { ...box, w: Math.max(box.w, 300), h: Math.max(box.h, 200) }, '#ffffff');
  item.datasetId = datasetId;
  item.text = title(c, kind === 'table' ? 'Table' : kind === 'kanban' ? 'Kanban' : 'Timeline');
  return {
    ...empty(),
    items: [item],
    datasets: { [datasetId]: result.rows },
    recordSchemas: { [datasetId]: result.schema },
  };
}
function mindmapOf(c: Json, box: Box): Item {
  const list = Array.isArray(c.nodes) ? c.nodes.filter(isObj).slice(0, MIND_MAX) : [];
  const ids = new Map(list.map(n => [str(n.id), newId()]));
  const roots = list.filter(n => !str(n.parent) || !ids.has(str(n.parent)));
  if (!list.length || roots.length !== 1 || ids.size !== list.length)
    throw new Error('A mind map needs "nodes" with unique ids and exactly one root (a node without a parent).');
  const item = sized('mindmap', box);
  item.nodes = list.map(n => ({
    id: ids.get(str(n.id))!,
    parent: n === roots[0] ? null : ids.get(str(n.parent))!,
    text: str(n.text).slice(0, 6000) || 'Topic',
  }));
  return item;
}
function storymapOf(c: Json, box: Box): Item {
  const names = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : [])
      .map(t => str(t).trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, max);
  const activities = names(c.activities, STORY_LIMITS.activities).map(t => ({ id: newId(), title: t })),
    releases = names(c.releases, STORY_LIMITS.releases).map(t => ({ id: newId(), title: t }));
  if (!activities.length || !releases.length) throw new Error('A story map needs "activities" and "releases".');
  const pick = (list: { id: string; title: string }[], name: unknown) =>
    (list.find(x => x.title === str(name).trim()) ?? list[0]).id;
  const cards = (Array.isArray(c.cards) ? c.cards : [])
    .filter(isObj)
    .slice(0, STORY_LIMITS.cards)
    .map(k => ({
      id: newId(),
      title: str(k.title).trim().slice(0, 500) || 'Story',
      activity: pick(activities, k.activity),
      release: pick(releases, k.release),
    }));
  const item = sized('storymap', box, '#ffffff');
  item.text = title(c, 'Story map');
  item.data = { activities, releases, cards } satisfies StoryMap;
  return item;
}
function imageOf(c: Json, box: Box): Recreated {
  const dataUrl = str(c.dataUrl),
    mime = /^data:(image\/(?:png|jpeg|gif|webp));base64,/.exec(dataUrl)?.[1];
  if (!mime)
    throw new Error('An image needs "dataUrl" (PNG, JPEG, GIF or WebP); merge-recreate.mjs fills it from "file".');
  if (dataUrl.length > MAX_IMAGE_BYTES * 1.37 + 100) throw new Error('The image is larger than 4 MB.');
  const item = sized('image', box);
  item.assetId = newId();
  const name = title(c, 'Recreated image');
  item.name = name;
  if (str(c.alt)) item.alt = str(c.alt).slice(0, 1000);
  const asset = { mime, data: dataUrl, width: item.w, height: item.h, name };
  return { ...empty(), items: [item], assets: { [item.assetId]: asset } };
}
/** Boardroom objects written as JSON, placed relative to the box's top-left corner; ids are renewed. */
function itemsOf(c: Json, box: Box): Item[] {
  const list = Array.isArray(c.items) ? c.items.filter(isObj).slice(0, 500) : [];
  if (!list.length) throw new Error('"items" needs at least one Boardroom object.');
  const ids = new Map(list.map(i => [str(i.id), newId()]));
  return list.map(raw => {
    const item = structuredClone(raw) as unknown as Item;
    item.id = ids.get(str(raw.id))!;
    item.x = (num(raw.x) ?? 0) + Math.round(box.x);
    item.y = (num(raw.y) ?? 0) + Math.round(box.y);
    for (const end of ['from', 'to'] as const) if (item[end]) item[end] = ids.get(item[end]!) ?? item[end];
    delete item.group;
    delete item.layer;
    return item;
  });
}
/**
 * Native objects for one recreate entry's `content`, filling `box`. Throws a readable error for content that
 * cannot be used; the caller checks the result with `parseBoard` before keeping it.
 */
export function recreateFrom(content: unknown, box: Box): Recreated {
  if (!isObj(content)) throw new Error('The entry has no content.');
  const kind = str(content.kind);
  switch (kind) {
    case 'table':
    case 'kanban':
    case 'timeline':
      return recordView(kind, content, box);
    case 'doc': {
      const markdown = str(content.markdown || content.text);
      if (!markdown.trim() || markdown.length > 60000)
        throw new Error('A doc needs "markdown" up to 60,000 characters.');
      const item = sized('doc', box, '#ffffff');
      item.data = { markdown };
      return { ...empty(), items: [item] };
    }
    case 'mindmap':
      return { ...empty(), items: [mindmapOf(content, box)] };
    case 'storymap':
      return { ...empty(), items: [storymapOf(content, box)] };
    case 'note':
    case 'text': {
      const item = sized(kind, box);
      item.text = str(content.text).slice(0, 6000);
      return { ...empty(), items: [item] };
    }
    case 'image':
      return imageOf(content, box);
    case 'items':
      return { ...empty(), items: itemsOf(content, box) };
    default:
      throw new Error(`Unknown content kind "${kind.slice(0, 40)}". Use one of: ${recreateKinds.join(', ')}.`);
  }
}

// ---- Layers per frame ---------------------------------------------------------------------------
/**
 * One named layer per top-level frame (frame title as the name), holding the frame and everything inside it.
 * Objects outside frames stay on the base layer, which is kept on top so they are not hidden behind frames.
 * Connectors join their ends' layer when both ends share it. Up to 29 frames get a layer of their own.
 */
export function layersPerFrame(board: Board, topFrameOf: Map<string, string>): Board {
  const tops = board.items.filter(i => i.type === 'frame' && topFrameOf.get(i.id) === i.id).slice(0, MAX_LAYERS - 1);
  if (!tops.length) return board;
  const layerOf = new Map(tops.map(f => [f.id, newId()]));
  const layers: Layer[] = [
    ...tops.map(f => ({ id: layerOf.get(f.id)!, name: f.text.trim().slice(0, 80) || 'Frame' })),
    { id: BASE_LAYER, name: 'Outside frames' },
  ];
  const items = board.items.map(i => {
    let frame = topFrameOf.get(i.id);
    if (i.type === 'arrow') {
      const a = topFrameOf.get(i.from ?? ''),
        b = topFrameOf.get(i.to ?? '');
      frame = a === b ? a : undefined;
    }
    const layer = frame ? layerOf.get(frame) : undefined;
    return layer ? { ...i, layer } : i;
  });
  return sortByLayer({ ...board, items, layers });
}
