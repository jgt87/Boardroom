// Copy, cut and paste of board objects (item 58), within a board and across boards and tabs.
// The payload travels as HTML with an embedded marker (plus plain text for other apps), so pasting
// into another board keeps connectors, groups, links and record datasets intact.
import type { Board, GroupDef, ImageAsset, Item, RecordRow } from './model.ts';
import { clone, endpoints } from './model.ts';
import type { GridData } from './grid.ts';
import { expandLinked, remapMermaidNode } from './mermaid-link-rules.ts';

export const CLIP_FORMAT = 'boardroom-objects';
export type ClipPayload = {
  format: typeof CLIP_FORMAT;
  version: 1;
  items: Item[];
  groups: GroupDef[];
  datasets: Record<string, RecordRow[]>;
  recordSchemas?: Board['recordSchemas'];
  /** Small media (images) travel with the payload so other browsers can paste them. */
  assets: Record<string, ImageAsset>;
  bounds: { x: number; y: number; w: number; h: number };
};

/**
 * Objects to copy: the selection, including every group member. Frame contents are not added, except for a frame
 * linked to Mermaid code, which is copied with its diagram so the link keeps working.
 */
export function copySelection(
  board: Board,
  ids: string[],
  assets: Record<string, ImageAsset> = {},
  assetBudget = 2_000_000,
): ClipPayload | null {
  const chosen = new Set(expandLinked(board, ids)),
    // Connectors store their real end points so a paste that drops an attachment keeps the shape.
    items = board.items
      .filter(
        i =>
          chosen.has(i.id) ||
          board.items.some(
            g => chosen.has(g.id) && g.type === 'grid' && (g.data as GridData).objects?.some(o => o.id === i.id),
          ),
      )
      .map(i => {
        if (i.type !== 'arrow') return i;
        const [a, b] = endpoints(i, board.items);
        return { ...i, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      });
  if (!items.length) return null;
  const groupIds = new Set<string>(),
    gmap = new Map((board.groups ?? []).map(g => [g.id, g]));
  for (const i of items)
    for (let g = i.group; g && !groupIds.has(g); g = gmap.get(g)?.parent ?? undefined) groupIds.add(g);
  const datasets: Record<string, RecordRow[]> = {};
  for (const i of items) {
    const id = i.datasetId ?? i.recordRef?.datasetId;
    if (id && board.datasets?.[id]) datasets[id] = clone(board.datasets[id]);
  }
  const media: Record<string, ImageAsset> = {};
  let used = 0;
  for (const i of items)
    if (i.assetId && assets[i.assetId] && !media[i.assetId]) {
      const size = assets[i.assetId].data.length;
      if (used + size > assetBudget) continue;
      used += size;
      media[i.assetId] = assets[i.assetId];
    }
  const xs = items.flatMap(i => [i.x, i.x + (i.type === 'arrow' ? i.w : Math.max(0, i.w))]),
    ys = items.flatMap(i => [i.y, i.y + (i.type === 'arrow' ? i.h : Math.max(0, i.h))]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return {
    format: CLIP_FORMAT,
    version: 1,
    items: clone(items),
    groups: [...groupIds].map(g => clone(gmap.get(g)!)).filter(Boolean),
    datasets,
    ...(board.recordSchemas
      ? {
          recordSchemas: Object.fromEntries(
            Object.keys(datasets)
              .filter(id => board.recordSchemas?.[id])
              .map(id => [id, clone(board.recordSchemas![id])]),
          ),
        }
      : {}),
    assets: media,
    bounds: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
  };
}
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Clipboard representations: HTML carrying the payload, and readable plain text. */
export function clipboardFormats(payload: ClipPayload): { html: string; text: string } {
  const text = payload.items
    .filter(i => i.type !== 'arrow' && i.text.trim())
    .map(i => i.text.trim())
    .join('\n');
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return {
    html: `<meta charset="utf-8"><div data-${CLIP_FORMAT}="${encoded}">${escapeHtml(text || 'Board objects')}</div>`,
    text,
  };
}
/** Extract a payload from clipboard HTML, or null when it is not ours or is malformed. */
export function readClipboardHtml(html: string): ClipPayload | null {
  const m = new RegExp(`data-${CLIP_FORMAT}="([A-Za-z0-9+/=]+)"`).exec(html);
  if (!m) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(escape(atob(m[1])))) as ClipPayload;
    if (
      payload?.format !== CLIP_FORMAT ||
      payload.version !== 1 ||
      !Array.isArray(payload.items) ||
      payload.items.length > 2000
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}
/**
 * Insert a payload with fresh ids. Connectors keep links between pasted objects; an end attached
 * to something outside the paste stays attached when that object exists on this board, otherwise it
 * becomes a free end at the same place. Groups, links and record datasets are remapped.
 */
export function pastePayload(
  board: Board,
  payload: ClipPayload,
  at: { x: number; y: number },
): { board: Board; ids: string[]; datasets: number } {
  const idMap = new Map(payload.items.map(i => [i.id, crypto.randomUUID()])),
    groupMap = new Map(payload.groups.map(g => [g.id, crypto.randomUUID()])),
    dataMap = new Map(Object.keys(payload.datasets).map(d => [d, crypto.randomUUID()]));
  const existing = new Set(board.items.map(i => i.id)),
    dx = at.x - payload.bounds.x,
    dy = at.y - payload.bounds.y;
  const items = payload.items.map(src => {
    // A diagram linked to Mermaid code keeps its link when its frame is pasted too.
    const i: Item = { ...remapMermaidNode(clone(src), idMap), id: idMap.get(src.id)!, x: src.x + dx, y: src.y + dy };
    delete i.locked;
    if (i.type === 'grid')
      i.data = {
        ...i.data,
        objects: (i.data as GridData).objects?.filter(o => idMap.has(o.id)).map(o => ({ ...o, id: idMap.get(o.id)! })),
      };
    if (src.group) {
      if (groupMap.has(src.group)) i.group = groupMap.get(src.group);
      else delete i.group;
    }
    if (src.datasetId && dataMap.has(src.datasetId)) i.datasetId = dataMap.get(src.datasetId);
    if (src.recordRef && dataMap.has(src.recordRef.datasetId))
      i.recordRef = { ...src.recordRef, datasetId: dataMap.get(src.recordRef.datasetId)! };
    if (src.linkTo) {
      if (idMap.has(src.linkTo)) i.linkTo = idMap.get(src.linkTo);
      else if (!existing.has(src.linkTo)) delete i.linkTo;
    }
    if (src.type === 'arrow') {
      for (const end of ['from', 'to'] as const) {
        const target = src[end];
        if (!target) continue;
        if (idMap.has(target)) i[end] = idMap.get(target);
        else if (!existing.has(target)) delete i[end];
      }
    }
    return i;
  });
  const groups: GroupDef[] = payload.groups.map(g => ({
    id: groupMap.get(g.id)!,
    parent: g.parent && groupMap.has(g.parent) ? groupMap.get(g.parent)! : null,
  }));
  const datasets = { ...board.datasets };
  for (const [from, to] of dataMap) datasets[to] = clone(payload.datasets[from]);
  const next: Board = { ...board, items: [...board.items, ...items] };
  if (groups.length) next.groups = [...(board.groups ?? []), ...groups];
  if (dataMap.size) next.datasets = datasets;
  if (payload.recordSchemas)
    next.recordSchemas = {
      ...board.recordSchemas,
      ...Object.fromEntries(
        [...dataMap]
          .filter(([id]) => payload.recordSchemas?.[id])
          .map(([id, to]) => [to, clone(payload.recordSchemas![id])]),
      ),
    };
  return { board: next, ids: items.map(i => i.id), datasets: dataMap.size };
}
