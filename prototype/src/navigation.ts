// Board search, minimap geometry and presentation ordering (pure helpers).
// Evidence: a fuzzy-search/match-scoring chunk, FrameWidget jump-to-viewport identifiers and six
// presentation-related modules in the 205-file audit.
import type { Board, Item, Kind, Point } from './model.ts';
import { itemBounds } from './interactions.ts';
import { widgetSearchText } from './widget-specs.ts';
import type { Bounds } from './interactions.ts';

export type Camera = { x: number; y: number; z: number };
export type SearchResult = { id: string; type: Kind; field: 'text' | 'label' | 'tag' | 'topic'; snippet: string };

/** Case-insensitive search of object text, connector labels, note tags and mind-map topics. */
export function searchBoard(
  board: Board,
  query: string,
  limit = 500,
  exclude: Set<string> = new Set(),
): SearchResult[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];
  const snippet = (text: string) => {
    const flat = text.replace(/\s+/g, ' '),
      at = flat.toLocaleLowerCase().indexOf(q),
      start = Math.max(0, at - 28);
    return (start ? '…' : '') + flat.slice(start, at + q.length + 40) + (at + q.length + 40 < flat.length ? '…' : '');
  };
  for (const i of board.items) {
    if (out.length >= limit) break;
    if (exclude.has(i.id) || i.hidden) continue;
    if (i.text.toLocaleLowerCase().includes(q)) {
      out.push({ id: i.id, type: i.type, field: i.type === 'arrow' ? 'label' : 'text', snippet: snippet(i.text) });
      continue;
    }
    const tag = i.tags?.find(t => t.toLocaleLowerCase().includes(q));
    if (tag) {
      out.push({ id: i.id, type: i.type, field: 'tag', snippet: `#${tag}` });
      continue;
    }
    const topic = i.nodes?.find(n => n.text.toLocaleLowerCase().includes(q));
    if (topic) {
      out.push({ id: i.id, type: i.type, field: 'topic', snippet: snippet(topic.text) });
      continue;
    }
    const extra = widgetSearchText(i);
    if (extra && extra.toLocaleLowerCase().includes(q))
      out.push({ id: i.id, type: i.type, field: 'text', snippet: snippet(extra) });
  }
  return out;
}

/** World rectangle currently visible on screen. */
export const viewportRect = (camera: Camera, size: { w: number; h: number }): Bounds => ({
  x: -camera.x / camera.z,
  y: -camera.y / camera.z,
  w: size.w / camera.z,
  h: size.h / camera.z,
});
/** Extent the minimap shows: every object plus the viewport, with padding. */
export function minimapExtent(items: Item[], viewport: Bounds): Bounds {
  const boxes = [...items.map(i => itemBounds(i, items)), viewport].filter(b =>
    [b.x, b.y, b.w, b.h].every(Number.isFinite),
  );
  const x = Math.min(...boxes.map(b => b.x)),
    y = Math.min(...boxes.map(b => b.y)),
    r = Math.max(...boxes.map(b => b.x + b.w)),
    bt = Math.max(...boxes.map(b => b.y + b.h));
  const pad = Math.max(r - x, bt - y) * 0.06 + 20;
  return { x: x - pad, y: y - pad, w: r - x + pad * 2, h: bt - y + pad * 2 };
}
/** Uniform scale + offset that fits `extent` into a width × height panel. */
export function minimapScale(extent: Bounds, width: number, height: number) {
  const scale = Math.min(width / Math.max(extent.w, 1), height / Math.max(extent.h, 1));
  return {
    scale,
    ox: (width - extent.w * scale) / 2 - extent.x * scale,
    oy: (height - extent.h * scale) / 2 - extent.y * scale,
  };
}
/** Camera that centres the viewport on a world point at the current zoom. */
export const centerOn = (p: Point, camera: Camera, size: { w: number; h: number }): Camera => ({
  z: camera.z,
  x: size.w / 2 - p.x * camera.z,
  y: size.h / 2 - p.y * camera.z,
});

/** Frames in presentation order. Stored order first (missing ids skipped), then unlisted frames. */
export function presentationFrames(board: Board): Item[] {
  const frames = board.items.filter(i => i.type === 'frame'),
    byId = new Map(frames.map(f => [f.id, f]));
  const listed = (board.presentation ?? []).map(id => byId.get(id)).filter(Boolean) as Item[];
  return [...listed, ...frames.filter(f => !listed.includes(f))];
}
/** Move a frame earlier/later in the presentation; stores the complete order. */
export function moveInPresentation(board: Board, id: string, delta: number): Board {
  const order = presentationFrames(board).map(f => f.id),
    from = order.indexOf(id),
    to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return board;
  [order[from], order[to]] = [order[to], order[from]];
  return { ...board, presentation: order };
}
/** Camera that fits a frame inside the screen with a margin. */
export function fitFrame(frame: Item, size: { w: number; h: number }, margin = 48): Camera {
  const z = Math.max(
    0.05,
    Math.min(8, (size.w - margin * 2) / Math.max(frame.w, 1), (size.h - margin * 2 - 64) / Math.max(frame.h, 1)),
  );
  return { z, x: size.w / 2 - (frame.x + frame.w / 2) * z, y: (size.h - 64) / 2 - (frame.y + frame.h / 2) * z };
}
