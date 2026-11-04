// Spreadsheet files (CSV, TSV, XLSX) into a Grid (gap b3-5): a new Grid, or the cells of an existing one.
// No React; reading a File uses only standard web APIs.
import type { Board, Item } from './model.ts';
import { GRID_MAX, gridFromTable, gridSize, validateGrid } from './grid.ts';
import type { GridData } from './grid.ts';

export const isTableFile = (name: string) => /\.(csv|tsv|xlsx)$/i.test(name);

/** Rows of a CSV, TSV or XLSX file (first sheet). */
export async function readTableFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { parseXlsx, OFFICE_MAX_BYTES } = await import('./office-import.ts');
    if (file.size > OFFICE_MAX_BYTES) throw new Error('Excel files up to 20 MB can be imported.');
    return parseXlsx(new Uint8Array(await file.arrayBuffer())).rows;
  }
  const { csvTable } = await import('./record-import.ts');
  return csvTable(await file.text());
}

/** Message for a grid import; mentions the grid limit when rows or columns were cut. */
export const gridImportNote = (data: GridData, truncated: boolean) =>
  `Imported ${data.rows} ${data.rows === 1 ? 'row' : 'rows'} and ${data.cols} ${data.cols === 1 ? 'column' : 'columns'} into the grid.` +
  (truncated ? ` Only the first ${GRID_MAX} rows and columns fit in a grid; use a Table for more.` : '');

/** Replace the cells of grid `id` with `rows`, keeping its position. Returns null for a missing or locked grid. */
export function importIntoGrid(
  board: Board,
  id: string,
  rows: string[][],
): { board: Board; data: GridData; truncated: boolean } | null {
  const grid = board.items.find(i => i.id === id);
  if (!grid || grid.type !== 'grid' || grid.locked) return null;
  const base = grid.data as GridData;
  validateGrid(base);
  const { data, truncated } = gridFromTable(rows, base),
    size = gridSize(data.rows, data.cols);
  const next: Item = { ...grid, ...size, data };
  return { board: { ...board, items: board.items.map(i => (i.id === id ? next : i)) }, data, truncated };
}
