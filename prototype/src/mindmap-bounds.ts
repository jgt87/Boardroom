import type { Board, Item } from './model.ts';
import { mindLayout, MIND_NODE_W, MIND_NODE_H } from './mindmap-style.ts';
export type MindViewport = { x: number; y: number; w: number; h: number };
export function mindViewport(item: Item): MindViewport {
  if (item.data?.autoLayout === false && item.data?.manualViewport) return item.data.manualViewport as MindViewport;
  const points = [...mindLayout(item.nodes ?? [], item.data?.autoLayout !== false, item.data?.layout).values()];
  const x = Math.min(0, ...points.map(p => p.x)) - 8,
    y = Math.min(0, ...points.map(p => p.y)) - 8;
  const w = Math.max(0, ...points.map(p => p.x)) + MIND_NODE_W + 8 - x;
  const h = Math.max(0, ...points.map(p => p.y)) + MIND_NODE_H + 14 - y;
  const scale = Math.min(item.w / w, item.h / h);
  return { x: x - (item.w / scale - w) / 2, y: y - (item.h / scale - h) / 2, w: item.w / scale, h: item.h / scale };
}
/** Grow manual maps without changing the world coordinates or scale of untouched topics. */
export function applyMindBounds(board: Board, previous: Board): Board {
  let changed = false;
  const items = board.items.map(item => {
    if (item.type !== 'mindmap') return item;
    if (item.data?.autoLayout !== false) {
      if (!item.data?.manualViewport) return item;
      const data = { ...item.data };
      delete data.manualViewport;
      changed = true;
      return { ...item, data };
    }
    const old = previous.items.find(i => i.id === item.id) ?? item;
    const view = (item.data?.manualViewport as MindViewport | undefined) ?? mindViewport(old);
    const points = [...mindLayout(item.nodes ?? [], false, item.data?.layout).values()];
    const x = Math.min(view.x, ...points.map(p => p.x - 8)),
      y = Math.min(view.y, ...points.map(p => p.y - 8));
    const right = Math.max(view.x + view.w, ...points.map(p => p.x + MIND_NODE_W + 8));
    const bottom = Math.max(view.y + view.h, ...points.map(p => p.y + MIND_NODE_H + 14));
    const sx = item.w / view.w,
      sy = item.h / view.h;
    const next = {
      ...item,
      x: item.x + (x - view.x) * sx,
      y: item.y + (y - view.y) * sy,
      w: (right - x) * sx,
      h: (bottom - y) * sy,
      data: { ...item.data, manualViewport: { x, y, w: right - x, h: bottom - y } },
    };
    if (![next.x, next.y, next.w, next.h].every(n => Number.isFinite(n) && Math.abs(n) <= 1e7))
      throw new Error('This mind map would exceed the board size limit.');
    if (JSON.stringify(item) === JSON.stringify(next)) return item;
    changed = true;
    return next;
  });
  return changed ? { ...board, items } : board;
}
