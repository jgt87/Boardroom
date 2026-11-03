import type { Board, Item } from './model.ts';
import type { GridData } from './grid.ts';
import { mergeAt } from './grid.ts';
import type { AutoLayoutData } from './autolayout.ts';

export const GRID_HEADER = 42;
export function gridMetrics(item: Item): { cols: number[]; rows: number[] } {
  const g = item.data as GridData;
  const scale = (values: number[] | undefined, n: number, total: number) => {
    const base = values ?? Array.from({ length: n }, () => 1),
      sum = base.reduce((a, b) => a + b, 0);
    return base.map(v => Math.max(40, (v / sum) * total));
  };
  return {
    cols: scale(g.colSizes, g.cols, item.w),
    rows: scale(g.rowSizes, g.rows, Math.max(40 * g.rows, item.h - GRID_HEADER)),
  };
}
const ownerCache = new WeakMap<Board, Map<string, Item>>();
export function gridOwner(board: Board, id: string): Item | undefined {
  let owners = ownerCache.get(board);
  if (!owners) {
    owners = new Map();
    for (const grid of board.items)
      if (grid.type === 'grid') for (const o of (grid.data as GridData).objects ?? []) owners.set(o.id, grid);
    ownerCache.set(board, owners);
  }
  return owners.get(id);
}
export function detachGridObjects(board: Board, ids: string[]): Board {
  let changed = false;
  const items = board.items.map(i => {
    if (i.type !== 'grid' || ids.includes(i.id)) return i;
    const g = i.data as GridData;
    const objects = g.objects?.filter(o => !ids.includes(o.id));
    if (objects?.length === g.objects?.length) return i;
    changed = true;
    return { ...i, data: { ...g, objects } };
  });
  return changed ? { ...board, items } : board;
}
export function gridDropAt(elements: Element[]): { id: string; r: number; c: number } | null {
  for (const el of elements) {
    const cell = el.closest<HTMLElement>('[data-grid-cell]');
    if (cell) return { id: cell.dataset.gridId!, r: Number(cell.dataset.gridRow), c: Number(cell.dataset.gridCol) };
  }
  return null;
}
export function adoptGridObjects(
  board: Board,
  ids: string[],
  drop: { id: string; r: number; c: number },
  bypass = false,
): Board {
  const grid = board.items.find(i => i.id === drop.id && i.type === 'grid');
  const objects = board.items.filter(i => ids.includes(i.id));
  if (
    !grid ||
    grid.locked ||
    ids.includes(grid.id) ||
    !objects.length ||
    objects.some(
      i =>
        i.locked ||
        i.group ||
        ![
          'note',
          'text',
          'card',
          'image',
          'rectangle',
          'ellipse',
          'diamond',
          'roundrect',
          'triangle',
          'hexagon',
          'cylinder',
          'parallelogram',
          'process',
          'terminator',
        ].includes(i.type),
    )
  )
    return board;
  const g = grid.data as GridData;
  if (drop.r < 0 || drop.r >= g.rows || drop.c < 0 || drop.c >= g.cols) return board;
  const merge = mergeAt(g, drop.r, drop.c),
    r = merge?.r ?? drop.r,
    c = merge?.c ?? drop.c;
  const detached = detachGridObjects(board, ids);
  const metrics = gridMetrics(grid),
    origin = {
      x: grid.x + metrics.cols.slice(0, c).reduce((a, b) => a + b, 0),
      y: grid.y + GRID_HEADER + metrics.rows.slice(0, r).reduce((a, b) => a + b, 0),
    };
  const adopted = detached.items.map(i =>
    i.id === grid.id
      ? {
          ...i,
          data: {
            ...i.data,
            objects: [
              ...((i.data as GridData).objects ?? []).filter(o => !ids.includes(o.id)),
              ...objects.map(o => ({
                id: o.id,
                r,
                c,
                ...(bypass || g.resizeMode === 'manual'
                  ? { manual: bypass || undefined, offset: { x: o.x - origin.x, y: o.y - origin.y } }
                  : {}),
              })),
            ],
          },
        }
      : i.type === 'autolayout'
        ? { ...i, data: { ...i.data, children: (i.data as AutoLayoutData).children.filter(id => !ids.includes(id)) } }
        : i,
  );
  try {
    return applyGridLayouts({
      ...detached,
      items: [...adopted.filter(i => !ids.includes(i.id)), ...adopted.filter(i => ids.includes(i.id))],
    });
  } catch {
    return board;
  }
}

/** Cell content grows the Grid; moving/resizing/reordering the Grid carries its objects. */
export function applyGridLayouts(board: Board): Board {
  let items = board.items,
    changed = false;
  for (const original of items.filter(i => i.type === 'grid')) {
    const g = original.data as GridData;
    if (!g.objects?.length) continue;
    const map = new Map(items.map(i => [i.id, i]));
    const members = g.objects.filter(o => map.has(o.id) && o.r < g.rows && o.c < g.cols);
    const { rows, cols } = gridMetrics(original);
    const stacks = new Map<string, number>();
    for (const o of members) {
      if (g.resizeMode === 'manual' || o.manual) continue;
      const child = map.get(o.id)!;
      const key = `${o.r},${o.c}`;
      const merge = mergeAt(g, o.r, o.c),
        cs = merge?.cs ?? 1,
        rs = merge?.rs ?? 1;
      const extraW = Math.max(0, child.w + 16 - cols.slice(o.c, o.c + cs).reduce((a, b) => a + b, 0));
      for (let c = o.c; c < o.c + cs; c++) cols[c] += extraW / cs;
      stacks.set(key, (stacks.get(key) ?? 64) + child.h + 8);
      const extraH = Math.max(0, stacks.get(key)! - rows.slice(o.r, o.r + rs).reduce((a, b) => a + b, 0));
      for (let r = o.r; r < o.r + rs; r++) rows[r] += extraH / rs;
    }
    const positions = new Map<string, { x: number; y: number }>(),
      offsets = new Map<string, number>();
    for (const o of members) {
      const key = `${o.r},${o.c}`,
        child = map.get(o.id)!;
      const offset = offsets.get(key) ?? 64;
      const manual = g.resizeMode === 'manual' || o.manual;
      positions.set(o.id, {
        x: original.x + cols.slice(0, o.c).reduce((a, b) => a + b, 0) + (manual ? (o.offset?.x ?? 8) : 8),
        y:
          original.y +
          GRID_HEADER +
          rows.slice(0, o.r).reduce((a, b) => a + b, 0) +
          (manual ? (o.offset?.y ?? offset) : offset),
      });
      offsets.set(key, offset + child.h + 8);
    }
    const next = {
      ...original,
      w: cols.reduce((a, b) => a + b, 0),
      h: GRID_HEADER + rows.reduce((a, b) => a + b, 0),
      data: { ...g, colSizes: cols, rowSizes: rows, objects: members },
    };
    if (
      next.w > 1e7 ||
      next.h > 1e7 ||
      [...positions.values()].some(
        p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e7 || Math.abs(p.y) > 1e7,
      )
    )
      throw new Error(
        'This Grid would exceed the board size limit. Resize its contents or move it closer to the center.',
      );
    items = items.map(i => {
      if (i.id === original.id) {
        if (JSON.stringify(next) === JSON.stringify(i)) return i;
        changed = true;
        return next;
      }
      const p = positions.get(i.id);
      if (!p || (i.x === p.x && i.y === p.y)) return i;
      changed = true;
      return { ...i, ...p };
    });
  }
  return changed ? { ...board, items } : board;
}

export function setGridResizeMode(board: Board, id: string, mode: 'auto' | 'manual'): Board {
  return applyGridLayouts({
    ...board,
    items: board.items.map(grid => {
      if (grid.id !== id || grid.type !== 'grid' || grid.locked) return grid;
      const g = grid.data as GridData,
        metrics = gridMetrics(grid);
      return {
        ...grid,
        data: {
          ...g,
          resizeMode: mode,
          objects: g.objects?.map(o => {
            const { manual: _manual, offset: _offset, ...base } = o;
            if (mode === 'auto') return base;
            const child = board.items.find(i => i.id === o.id);
            return {
              ...base,
              offset: child
                ? {
                    x: child.x - grid.x - metrics.cols.slice(0, o.c).reduce((a, b) => a + b, 0),
                    y: child.y - grid.y - GRID_HEADER - metrics.rows.slice(0, o.r).reduce((a, b) => a + b, 0),
                  }
                : { x: 8, y: 64 },
            };
          }),
        },
      };
    }),
  });
}
