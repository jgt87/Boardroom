// Grid widget structure: cells, merged ranges and structural edits (item 23).
// Evidence: GridWidget identifiers GRID_MERGE_CELLS, GRID_UNMERGE_CELL, GRID_REMOVE_ROW, GRID_REMOVE_COLUMN.

export type Merge = { r: number; c: number; rs: number; cs: number };
export type GridAlign = 'left' | 'center' | 'right';
export type CellStyle = { bold?: boolean; italic?: boolean; color?: string; align?: GridAlign };
export type GridData = {
  rows: number;
  cols: number;
  cells: string[][];
  merges: Merge[];
  align: GridAlign;
  colors?: Record<string, string>;
  styles?: Record<string, CellStyle>;
  rowSizes?: number[];
  colSizes?: number[];
  resizeMode?: 'auto' | 'manual';
  objects?: { id: string; r: number; c: number; manual?: boolean; offset?: { x: number; y: number } }[];
};
/** Most rows or columns in a grid (track J); the cell count is also capped at GRID_CELLS_MAX. */
export const GRID_MAX = 100;
/** Most cells in a grid: rows × cols ≤ 2,500 (for example 50 × 50 or 100 × 25). */
export const GRID_CELLS_MAX = 2500;
/** Above this many cells, the canvas draws Grid cells as text with a single live field (performance). */
export const LARGE_GRID_CELLS = 400;
/** Whether a row or a column can be added without passing the grid limits. */
export const canAddRow = (g: Pick<GridData, 'rows' | 'cols'>) =>
  g.rows < GRID_MAX && (g.rows + 1) * g.cols <= GRID_CELLS_MAX;
export const canAddColumn = (g: Pick<GridData, 'rows' | 'cols'>) =>
  g.cols < GRID_MAX && g.rows * (g.cols + 1) <= GRID_CELLS_MAX;
/** Largest size within the limits for data of `rows` × `cols`: every column that fits, then as many rows. */
export function gridFit(rows: number, cols: number): { rows: number; cols: number } {
  const c = Math.min(Math.max(cols, 1), GRID_MAX),
    r = Math.min(Math.max(rows, 1), GRID_MAX, Math.floor(GRID_CELLS_MAX / c));
  return { rows: r, cols: c };
}

export function newGrid(rows = 3, cols = 3): GridData {
  return {
    rows,
    cols,
    cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
    merges: [],
    align: 'left',
  };
}
const key = (r: number, c: number) => `${r},${c}`;
export const mergeAt = (g: GridData, r: number, c: number) =>
  g.merges.find(m => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);
/** Whether a cell is hidden because another merge's anchor covers it. */
export const isCovered = (g: GridData, r: number, c: number) => {
  const m = mergeAt(g, r, c);
  return !!m && (m.r !== r || m.c !== c);
};

export function validateGrid(g: unknown): asserts g is GridData {
  const d = g as GridData;
  if (
    !d ||
    typeof d !== 'object' ||
    !Number.isInteger(d.rows) ||
    !Number.isInteger(d.cols) ||
    d.rows < 1 ||
    d.cols < 1 ||
    d.rows > GRID_MAX ||
    d.cols > GRID_MAX ||
    d.rows * d.cols > GRID_CELLS_MAX
  )
    throw new Error(`A grid needs 1 to ${GRID_MAX} rows and columns and at most 2,500 cells.`);
  if (
    !Array.isArray(d.cells) ||
    d.cells.length !== d.rows ||
    d.cells.some(
      row => !Array.isArray(row) || row.length !== d.cols || row.some(c => typeof c !== 'string' || c.length > 2000),
    )
  )
    throw new Error('Grid cells do not match its size.');
  if (!['left', 'center', 'right'].includes(d.align)) throw new Error('Invalid grid alignment.');
  if (d.resizeMode !== undefined && !['auto', 'manual'].includes(d.resizeMode))
    throw new Error('Invalid Grid resize mode.');
  for (const [sizes, length] of [
    [d.rowSizes, d.rows],
    [d.colSizes, d.cols],
  ] as const)
    if (
      sizes !== undefined &&
      (!Array.isArray(sizes) || sizes.length !== length || sizes.some(n => !Number.isFinite(n) || n < 40 || n > 1e7))
    )
      throw new Error('Invalid Grid row or column sizes.');
  if (
    d.objects !== undefined &&
    (!Array.isArray(d.objects) ||
      d.objects.length > 2000 ||
      new Set(d.objects.map(o => o?.id)).size !== d.objects.length ||
      d.objects.some(
        o =>
          !o ||
          typeof o.id !== 'string' ||
          !Number.isInteger(o.r) ||
          !Number.isInteger(o.c) ||
          o.r < 0 ||
          o.c < 0 ||
          o.r >= d.rows ||
          o.c >= d.cols ||
          (o.manual !== undefined && typeof o.manual !== 'boolean') ||
          (o.offset !== undefined &&
            (!o.offset || ![o.offset.x, o.offset.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1e7))),
      ))
  )
    throw new Error('Invalid Grid object membership.');
  if (!Array.isArray(d.merges) || d.merges.length > 500) throw new Error('Invalid merged cells.');
  const used = new Set<string>();
  for (const m of d.merges) {
    if (
      !m ||
      ![m.r, m.c, m.rs, m.cs].every(Number.isInteger) ||
      m.r < 0 ||
      m.c < 0 ||
      m.rs < 1 ||
      m.cs < 1 ||
      m.r + m.rs > d.rows ||
      m.c + m.cs > d.cols ||
      m.rs * m.cs < 2
    )
      throw new Error('Invalid merged cells.');
    for (let r = m.r; r < m.r + m.rs; r++)
      for (let c = m.c; c < m.c + m.cs; c++) {
        if (used.has(key(r, c))) throw new Error('Merged cells overlap.');
        used.add(key(r, c));
      }
  }
  const inBounds = (k: string) => {
    if (!/^\d+,\d+$/.test(k)) return false;
    const [r, c] = k.split(',').map(Number);
    return r < d.rows && c < d.cols;
  };
  if (
    d.colors !== undefined &&
    (!d.colors ||
      typeof d.colors !== 'object' ||
      Array.isArray(d.colors) ||
      Object.entries(d.colors).some(([k, v]) => !inBounds(k) || typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)))
  )
    throw new Error('Invalid grid colours.');
  if (d.styles !== undefined) {
    if (
      !d.styles ||
      typeof d.styles !== 'object' ||
      Array.isArray(d.styles) ||
      Object.keys(d.styles).length > GRID_CELLS_MAX
    )
      throw new Error('Invalid grid cell styles.');
    for (const [k, st] of Object.entries(d.styles)) {
      if (
        !inBounds(k) ||
        !st ||
        typeof st !== 'object' ||
        Array.isArray(st) ||
        Object.keys(st).some(x => !['bold', 'italic', 'color', 'align'].includes(x)) ||
        [st.bold, st.italic].some(v => v !== undefined && typeof v !== 'boolean') ||
        (st.color !== undefined && (typeof st.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(st.color))) ||
        (st.align !== undefined && !['left', 'center', 'right'].includes(st.align))
      )
        throw new Error('Invalid grid cell styles.');
    }
  }
}

const clone = (g: GridData): GridData => ({
  ...g,
  cells: g.cells.map(r => [...r]),
  merges: g.merges.map(m => ({ ...m })),
  ...(g.colors ? { colors: { ...g.colors } } : {}),
  ...(g.styles ? { styles: Object.fromEntries(Object.entries(g.styles).map(([k, v]) => [k, { ...v }])) } : {}),
});
/** Drop empty optional maps so JSON round trips stay exact. */
const tidy = (n: GridData): GridData => {
  if (!n.colors) delete n.colors;
  if (!n.styles) delete n.styles;
  return n;
};
export function setCell(g: GridData, r: number, c: number, text: string): GridData {
  const n = clone(g);
  n.cells[r][c] = text.slice(0, 2000);
  return n;
}

/** Merge the rectangle spanned by two corner cells. Partially overlapping existing merges are rejected. */
export function mergeCells(g: GridData, r1: number, c1: number, r2: number, c2: number): GridData {
  const r = Math.min(r1, r2),
    c = Math.min(c1, c2),
    rs = Math.abs(r2 - r1) + 1,
    cs = Math.abs(c2 - c1) + 1;
  if (r < 0 || c < 0 || r + rs > g.rows || c + cs > g.cols) throw new Error('Choose cells inside the grid.');
  if (rs * cs < 2) throw new Error('Select at least two cells to merge.');
  const inside = (m: Merge) => m.r >= r && m.c >= c && m.r + m.rs <= r + rs && m.c + m.cs <= c + cs;
  const touches = (m: Merge) => m.r < r + rs && m.r + m.rs > r && m.c < c + cs && m.c + m.cs > c;
  if (g.merges.some(m => touches(m) && !inside(m)))
    throw new Error('The selection must fully contain any merged cells it touches.');
  const n = clone(g),
    texts: string[] = [];
  for (let y = r; y < r + rs; y++)
    for (let x = c; x < c + cs; x++) {
      if (n.cells[y][x].trim()) texts.push(n.cells[y][x]);
      n.cells[y][x] = '';
    }
  n.cells[r][c] = texts.join('\n').slice(0, 2000);
  n.merges = [...n.merges.filter(m => !inside(m)), { r, c, rs, cs }];
  if (g.objects)
    n.objects = g.objects.map(o =>
      o.r >= r && o.r < r + rs && o.c >= c && o.c < c + cs ? { ...o, r, c, offset: undefined } : o,
    );
  // Covered cells keep no style of their own; the anchor's style applies to the merged cell.
  n.styles = shiftMap(n.styles, (y, x) =>
    y >= r && y < r + rs && x >= c && x < c + cs && (y !== r || x !== c) ? null : [y, x],
  );
  return tidy(n);
}
export function unmergeCell(g: GridData, r: number, c: number): GridData {
  const m = mergeAt(g, r, c);
  if (!m) throw new Error('That cell is not merged.');
  const n = clone(g);
  n.merges = n.merges.filter(x => x.r !== m.r || x.c !== m.c);
  return n;
}
/** Insert a row before `at` (0..rows). Merges spanning the insertion point grow. */
export function addRow(g: GridData, at = g.rows): GridData {
  if (!canAddRow(g)) throw new Error(`Grids hold up to ${GRID_MAX} rows and 2,500 cells.`);
  const n = clone(g);
  n.cells.splice(
    at,
    0,
    Array.from({ length: g.cols }, () => ''),
  );
  n.rows++;
  if (g.rowSizes) {
    n.rowSizes = [...g.rowSizes];
    n.rowSizes.splice(at, 0, 72);
  }
  if (g.objects) n.objects = g.objects.map(o => ({ ...o, r: o.r >= at ? o.r + 1 : o.r }));
  n.merges = n.merges.map(m => (m.r >= at ? { ...m, r: m.r + 1 } : m.r + m.rs > at ? { ...m, rs: m.rs + 1 } : m));
  n.colors = shiftMap(g.colors, (r, c) => [r >= at ? r + 1 : r, c]);
  n.styles = shiftMap(g.styles, (r, c) => [r >= at ? r + 1 : r, c]);
  return tidy(n);
}
export function addColumn(g: GridData, at = g.cols): GridData {
  if (!canAddColumn(g)) throw new Error(`Grids hold up to ${GRID_MAX} columns and 2,500 cells.`);
  const n = clone(g);
  n.cells.forEach(row => row.splice(at, 0, ''));
  n.cols++;
  if (g.colSizes) {
    n.colSizes = [...g.colSizes];
    n.colSizes.splice(at, 0, 140);
  }
  if (g.objects) n.objects = g.objects.map(o => ({ ...o, c: o.c >= at ? o.c + 1 : o.c }));
  n.merges = n.merges.map(m => (m.c >= at ? { ...m, c: m.c + 1 } : m.c + m.cs > at ? { ...m, cs: m.cs + 1 } : m));
  n.colors = shiftMap(g.colors, (r, c) => [r, c >= at ? c + 1 : c]);
  n.styles = shiftMap(g.styles, (r, c) => [r, c >= at ? c + 1 : c]);
  return tidy(n);
}
/** Remove a row; merges shrink and degenerate merges disappear. */
export function removeRow(g: GridData, at: number): GridData {
  if (g.rows <= 1) throw new Error('A grid needs at least one row.');
  const n = clone(g);
  const anchorText = (m: Merge) => (m.r === at && m.rs > 1 ? n.cells[at][m.c] : null);
  const carried = n.merges.map(m => [m, anchorText(m)] as const);
  n.cells.splice(at, 1);
  n.rows--;
  if (g.rowSizes) n.rowSizes = g.rowSizes.filter((_, k) => k !== at);
  if (g.objects) n.objects = g.objects.filter(o => o.r !== at).map(o => ({ ...o, r: o.r > at ? o.r - 1 : o.r }));
  n.merges = carried.flatMap(([m, text]) => {
    let next: Merge;
    if (m.r > at) next = { ...m, r: m.r - 1 };
    else if (m.r + m.rs > at) {
      next = { ...m, rs: m.rs - 1 };
      if (text !== null && m.r === at) n.cells[m.r][m.c] = text;
    } else next = m;
    return next.rs * next.cs >= 2 ? [next] : [];
  });
  n.colors = shiftMap(g.colors, (r, c) => (r === at ? null : [r > at ? r - 1 : r, c]));
  n.styles = shiftMap(g.styles, (r, c) => (r === at ? null : [r > at ? r - 1 : r, c]));
  return tidy(n);
}
export function removeColumn(g: GridData, at: number): GridData {
  if (g.cols <= 1) throw new Error('A grid needs at least one column.');
  const n = clone(g);
  const carried = n.merges.map(m => [m, m.c === at && m.cs > 1 ? n.cells[m.r][at] : null] as const);
  n.cells.forEach(row => row.splice(at, 1));
  n.cols--;
  if (g.colSizes) n.colSizes = g.colSizes.filter((_, k) => k !== at);
  if (g.objects) n.objects = g.objects.filter(o => o.c !== at).map(o => ({ ...o, c: o.c > at ? o.c - 1 : o.c }));
  n.merges = carried.flatMap(([m, text]) => {
    let next: Merge;
    if (m.c > at) next = { ...m, c: m.c - 1 };
    else if (m.c + m.cs > at) {
      next = { ...m, cs: m.cs - 1 };
      if (text !== null && m.c === at) n.cells[m.r][m.c] = text;
    } else next = m;
    return next.rs * next.cs >= 2 ? [next] : [];
  });
  n.colors = shiftMap(g.colors, (r, c) => (c === at ? null : [r, c > at ? c - 1 : c]));
  n.styles = shiftMap(g.styles, (r, c) => (c === at ? null : [r, c > at ? c - 1 : c]));
  return tidy(n);
}
function shiftMap<T>(
  values: Record<string, T> | undefined,
  map: (r: number, c: number) => [number, number] | null,
): Record<string, T> | undefined {
  if (!values) return undefined;
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(values)) {
    const [r, c] = k.split(',').map(Number),
      to = map(r, c);
    if (to) out[key(to[0], to[1])] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
export function setCellColor(g: GridData, r: number, c: number, color: string | undefined): GridData {
  const n = clone(g),
    colors = { ...(n.colors ?? {}) };
  if (color) colors[key(r, c)] = color;
  else delete colors[key(r, c)];
  if (Object.keys(colors).length) n.colors = colors;
  else delete n.colors;
  return n;
}
/** Apply a style change to every cell in the rectangle between two corners (covered merge cells are skipped). */
export function setCellStyle(g: GridData, r1: number, c1: number, r2: number, c2: number, patch: CellStyle): GridData {
  const n = clone(g),
    styles = { ...(n.styles ?? {}) };
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
      if (r < 0 || c < 0 || r >= g.rows || c >= g.cols || isCovered(g, r, c)) continue;
      const next: CellStyle = { ...styles[key(r, c)], ...patch };
      for (const k of Object.keys(next) as (keyof CellStyle)[])
        if (next[k] === undefined || next[k] === false) delete next[k];
      if (Object.keys(next).length) styles[key(r, c)] = next;
      else delete styles[key(r, c)];
    }
  n.styles = Object.keys(styles).length ? styles : undefined;
  return tidy(n);
}
export const cellStyle = (g: GridData, r: number, c: number): CellStyle => g.styles?.[key(r, c)] ?? {};
export const gridText = (g: GridData) => g.cells.flat().filter(Boolean).join(' ');

export function reorderGrid(g: GridData, axis: 'row' | 'column', from: number, to: number): GridData {
  const length = axis === 'row' ? g.rows : g.cols;
  if (from === to) return g;
  if (![from, to].every(n => Number.isInteger(n) && n >= 0 && n < length))
    throw new Error('Choose an existing row or column.');
  const block = (index: number) => {
    let start = index,
      end = index;
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of g.merges) {
        const a = axis === 'row' ? m.r : m.c,
          b = a + (axis === 'row' ? m.rs : m.cs) - 1;
        if (a <= end && b >= start && (a < start || b > end)) {
          start = Math.min(start, a);
          end = Math.max(end, b);
          changed = true;
        }
      }
    }
    return [start, end];
  };
  const [start, end] = block(from),
    [targetStart, targetEnd] = block(to);
  if (to >= start && to <= end) return g;
  const moved = Array.from({ length: end - start + 1 }, (_, k) => start + k);
  const order = Array.from({ length }, (_, k) => k).filter(k => k < start || k > end);
  const insertion = from < to ? order.indexOf(targetEnd) + 1 : order.indexOf(targetStart);
  order.splice(insertion, 0, ...moved);
  const remap = (r: number, c: number): [number, number] =>
    axis === 'row' ? [order.indexOf(r), c] : [r, order.indexOf(c)];
  const n = clone(g);
  n.merges = g.merges.map(m => {
    const [r, c] = remap(m.r, m.c);
    return { ...m, r, c };
  });
  n.cells = axis === 'row' ? order.map(k => [...g.cells[k]]) : g.cells.map(row => order.map(k => row[k]));
  n.colors = shiftMap(g.colors, remap);
  n.styles = shiftMap(g.styles, remap);
  if (axis === 'row' && g.rowSizes) n.rowSizes = order.map(k => g.rowSizes![k]);
  if (axis === 'column' && g.colSizes) n.colSizes = order.map(k => g.colSizes![k]);
  if (g.objects)
    n.objects = g.objects.map(o => {
      const [r, c] = remap(o.r, o.c);
      return { ...o, r, c };
    });
  return tidy(n);
}

/** Grid cells as CSV rows (merged areas keep their text in the top-left cell). Gap B4. */
export const gridRows = (g: GridData): string[][] => g.cells.map(row => [...row]);

/**
 * Grid holding spreadsheet rows (CSV, TSV or XLSX, gap b3-5), capped at the grid limit. With `base`, the
 * grid's alignment and in-range cell anchors are kept; merges, colours and sizes are reset to fit the data.
 */
export function gridFromTable(rows: string[][], base?: GridData): { data: GridData; truncated: boolean } {
  const width = rows.reduce((m, row) => Math.max(m, row.length), 1),
    { rows: r, cols: c } = gridFit(rows.length, width);
  const data = newGrid(r, c);
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) data.cells[y][x] = (rows[y]?.[x] ?? '').slice(0, 2000);
  if (base) {
    data.align = base.align;
    const objects = base.objects?.filter(o => o.r < r && o.c < c);
    if (objects?.length) data.objects = objects;
  }
  return {
    data,
    truncated: rows.length > r || width > c || rows.some(row => row.some(v => v.length > 2000)),
  };
}
/** Display size for a grid of `rows` × `cols` cells. */
export const gridSize = (rows: number, cols: number) => ({ w: Math.max(240, cols * 140), h: Math.max(80, rows * 40) });
