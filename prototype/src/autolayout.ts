// Auto-layout containers (item 39). Children keep their own size; the container positions them.
// Evidence: AutoLayoutContainerWidget / Demo1DLayoutWidget (ADD_CHILD, REMOVE_CHILD, MOVE_ROW,
// MOVE_COLUMN, MOVE_BETWEEN_ROWS) and the flex-layout geometry chunk.
// Containers are distinct from groups (explicit transform units) and frames (spatial backdrops).
import type { Board, Item } from './model.ts';
import { gridOwner } from './grid-canvas.ts';

export type AutoLayoutData = {
  direction: 'row' | 'column';
  gap: number;
  padding: number;
  wrap: boolean;
  children: string[];
};
export const AUTOLAYOUT_HEADER = 30;
const finite = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validateAutoLayout(data: unknown): asserts data is AutoLayoutData {
  const d = data as AutoLayoutData;
  if (
    !d ||
    !['row', 'column'].includes(d.direction) ||
    !finite(d.gap, 0, 400) ||
    !finite(d.padding, 0, 400) ||
    typeof d.wrap !== 'boolean' ||
    !Array.isArray(d.children) ||
    d.children.length > 500 ||
    d.children.some(c => typeof c !== 'string') ||
    new Set(d.children).size !== d.children.length
  )
    throw new Error('Invalid auto-layout container.');
}
export const defaultAutoLayout = (): AutoLayoutData => ({
  direction: 'row',
  gap: 16,
  padding: 20,
  wrap: true,
  children: [],
});
export const isContainer = (i: Item | undefined): boolean => i?.type === 'autolayout';
const canAdopt = (i: Item) => !['autolayout', 'frame', 'arrow', 'pen'].includes(i.type) && !i.locked;
export const containerOf = (board: Board, childId: string): Item | undefined =>
  board.items.find(i => isContainer(i) && (i.data as AutoLayoutData | undefined)?.children?.includes(childId));

/** Target positions for one container. Returns child boxes plus the container's fitted size. */
export function layoutContainer(
  container: Item,
  items: Map<string, Item>,
): { boxes: Map<string, { x: number; y: number }>; w: number; h: number; children: string[] } {
  const d = container.data as AutoLayoutData,
    children = d.children.filter(id => {
      const c = items.get(id);
      return !!c && canAdopt(c) && c.id !== container.id;
    });
  const boxes = new Map<string, { x: number; y: number }>(),
    left = container.x + d.padding,
    top = container.y + AUTOLAYOUT_HEADER + d.padding;
  let w: number, h: number;
  if (d.direction === 'column') {
    let y = top,
      widest = 0;
    for (const id of children) {
      const c = items.get(id)!;
      boxes.set(id, { x: left, y });
      y += c.h + d.gap;
      widest = Math.max(widest, c.w);
    }
    w = Math.max(container.w, widest + d.padding * 2);
    h = (children.length ? y - d.gap : top) - container.y + d.padding;
  } else {
    const inner = container.w - d.padding * 2;
    let x = left,
      y = top,
      rowH = 0,
      widest = 0;
    for (const id of children) {
      const c = items.get(id)!;
      if (d.wrap && x > left && x + c.w > left + inner + 1e-6) {
        x = left;
        y += rowH + d.gap;
        rowH = 0;
      }
      boxes.set(id, { x, y });
      x += c.w + d.gap;
      rowH = Math.max(rowH, c.h);
      widest = Math.max(widest, x - d.gap - left);
    }
    if (!d.wrap) w = Math.max(container.w, widest + d.padding * 2);
    else w = Math.max(container.w, ...children.map(id => items.get(id)!.w + d.padding * 2));
    h = (children.length ? y + rowH : top) - container.y + d.padding;
  }
  return { boxes, w, h: Math.max(120, h), children };
}

/** Position every container's children and fit container sizes. Idempotent; returns the same board when nothing changes. */
export function applyLayouts(board: Board): Board {
  if (!board.items.some(isContainer)) return board;
  let items = board.items,
    changed = false;
  for (const container of board.items.filter(isContainer)) {
    const map = new Map(items.map(i => [i.id, i])),
      current = map.get(container.id)!;
    if (!current.data) continue;
    const { boxes, w, h, children } = layoutContainer(current, map);
    const sameChildren = children.length === (current.data as AutoLayoutData).children.length;
    if (
      !sameChildren ||
      w !== current.w ||
      h !== current.h ||
      [...boxes].some(([id, p]) => map.get(id)!.x !== p.x || map.get(id)!.y !== p.y)
    ) {
      changed = true;
      items = items.map(i =>
        i.id === current.id
          ? { ...i, w, h, data: { ...i.data, children } }
          : boxes.has(i.id)
            ? { ...i, ...boxes.get(i.id)! }
            : i,
      );
    }
  }
  return changed ? { ...board, items } : board;
}

function orderIndex(container: Item, items: Map<string, Item>, child: Item, others: string[]): number {
  const d = container.data as AutoLayoutData,
    cx = child.x + child.w / 2,
    cy = child.y + child.h / 2;
  let index = 0;
  for (const id of others) {
    const o = items.get(id);
    if (!o) continue;
    const ox = o.x + o.w / 2,
      oy = o.y + o.h / 2;
    const before =
      d.direction === 'column' ? oy < cy : Math.abs(oy - cy) < Math.max(o.h, child.h) / 2 ? ox < cx : oy < cy;
    if (before) index++;
  }
  return index;
}

/**
 * After a move gesture: adopt moved items into the container under their centre (at the index implied by
 * position), release items that left their container, and reorder items moved within one. Containers,
 * frames, connectors, pen strokes and locked objects are never adopted.
 */
export function adoptIntoContainers(board: Board, movedIds: string[]): Board {
  let next = board;
  for (const id of movedIds) {
    const map = new Map(next.items.map(i => [i.id, i])),
      item = map.get(id);
    if (!item || !canAdopt(item) || gridOwner(next, id)) continue;
    const cx = item.x + item.w / 2,
      cy = item.y + item.h / 2;
    const target = [...next.items]
      .reverse()
      .find(
        c =>
          isContainer(c) &&
          c.data &&
          c.id !== id &&
          !movedIds.includes(c.id) &&
          cx >= c.x &&
          cx <= c.x + c.w &&
          cy >= c.y &&
          cy <= c.y + c.h,
      );
    const current = containerOf(next, id);
    if (current && current.id !== target?.id && movedIds.includes(current.id)) continue; // moved together with its container
    next = {
      ...next,
      items: next.items.map(c => {
        if (!isContainer(c) || !c.data) return c;
        const d = c.data as AutoLayoutData;
        if (c.id === target?.id) {
          const others = d.children.filter(x => x !== id),
            index = orderIndex(c, map, item, others);
          return { ...c, data: { ...d, children: [...others.slice(0, index), id, ...others.slice(index)] } };
        }
        return d.children.includes(id) ? { ...c, data: { ...d, children: d.children.filter(x => x !== id) } } : c;
      }),
    };
  }
  return applyLayouts(next);
}
/** Keyboard reorder of a child inside its container. */
export function moveChild(board: Board, containerId: string, childId: string, delta: number): Board {
  return applyLayouts({
    ...board,
    items: board.items.map(c => {
      if (c.id !== containerId || !c.data) return c;
      const list = [...(c.data as AutoLayoutData).children],
        from = list.indexOf(childId),
        to = from + delta;
      if (from < 0 || to < 0 || to >= list.length) return c;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...c, data: { ...c.data, children: list } };
    }),
  });
}
/** Take a child out of its container and place it just to the right, so it is not re-adopted. */
export function removeChild(board: Board, containerId: string, childId: string): Board {
  const container = board.items.find(i => i.id === containerId);
  if (!container?.data) return board;
  return applyLayouts({
    ...board,
    items: board.items.map(i =>
      i.id === containerId
        ? { ...i, data: { ...i.data, children: (i.data as AutoLayoutData).children.filter(x => x !== childId) } }
        : i.id === childId
          ? { ...i, x: container.x + container.w + 40, y: container.y }
          : i,
    ),
  });
}
export function setLayoutOption(
  board: Board,
  containerId: string,
  patch: Partial<Omit<AutoLayoutData, 'children'>>,
): Board {
  return applyLayouts({
    ...board,
    items: board.items.map(i => (i.id === containerId && i.data ? { ...i, data: { ...i.data, ...patch } } : i)),
  });
}

export type InsertionPreview = {
  containerId: string;
  index: number;
  line: { x1: number; y1: number; x2: number; y2: number };
};
/**
 * Drop feedback while dragging: the container that would adopt the dragged item, the index it would get
 * and an insertion line between neighbours (perpendicular to the flow, honouring wrapped rows).
 * Mirrors adoptIntoContainers for the first adoptable moved item; null when nothing would be adopted.
 */
export function insertionPreview(board: Board, movedIds: string[]): InsertionPreview | null {
  const map = new Map(board.items.map(i => [i.id, i]));
  for (const id of movedIds) {
    const item = map.get(id);
    if (!item || !canAdopt(item)) continue;
    const cx = item.x + item.w / 2,
      cy = item.y + item.h / 2;
    const target = [...board.items]
      .reverse()
      .find(
        c =>
          isContainer(c) &&
          c.data &&
          c.id !== id &&
          !movedIds.includes(c.id) &&
          cx >= c.x &&
          cx <= c.x + c.w &&
          cy >= c.y &&
          cy <= c.y + c.h,
      );
    const current = containerOf(board, id);
    if (current && current.id !== target?.id && movedIds.includes(current.id)) continue;
    if (!target) continue;
    const d = target.data as AutoLayoutData,
      others = d.children.filter(x => x !== id),
      index = orderIndex(target, map, item, others);
    // Lay out the remaining children as they stand without the dragged item.
    const { boxes, children } = layoutContainer({ ...target, data: { ...d, children: others } }, map);
    const left = target.x + d.padding,
      top = target.y + AUTOLAYOUT_HEADER + d.padding,
      inner = Math.max(20, target.w - d.padding * 2),
      half = d.gap / 2;
    const box = (cid: string) => {
      const p = boxes.get(cid)!,
        c = map.get(cid)!;
      return { x: p.x, y: p.y, w: c.w, h: c.h };
    };
    const placed = children.filter(cid => boxes.has(cid)),
      at = index < others.length ? others[index] : undefined;
    const next = at && placed.includes(at) ? box(at) : undefined,
      prevId = index > 0 ? others[index - 1] : undefined,
      prev = prevId && placed.includes(prevId) ? box(prevId) : undefined;
    let line: InsertionPreview['line'];
    if (d.direction === 'column') {
      const y = next ? next.y - half : prev ? prev.y + prev.h + half : top;
      line = { x1: left, y1: y, x2: left + inner, y2: y };
    } else if (
      next &&
      (!prev ||
        Math.abs(prev.y - next.y) < 1e-6 ||
        Math.abs(cy - (next.y + next.h / 2)) <= Math.abs(cy - (prev.y + prev.h / 2)))
    ) {
      line = { x1: next.x - half, y1: next.y, x2: next.x - half, y2: next.y + next.h };
    } else if (prev) {
      line = { x1: prev.x + prev.w + half, y1: prev.y, x2: prev.x + prev.w + half, y2: prev.y + prev.h };
    } else if (next) {
      line = { x1: next.x - half, y1: next.y, x2: next.x - half, y2: next.y + next.h };
    } else {
      line = { x1: left, y1: top, x2: left, y2: top + Math.max(40, item.h) };
    }
    return { containerId: target.id, index, line };
  }
  return null;
}
