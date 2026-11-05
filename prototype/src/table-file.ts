// Spreadsheet files (CSV, TSV, XLSX) into a Grid (gap b3-5): a new Grid, or the cells of an existing one.
// No React; reading a File uses only standard web APIs.
import type { Board, Item } from './model.ts';
import { GRID_MAX, gridFromTable, gridSize, validateGrid } from './grid.ts';
import type { GridData } from './grid.ts';

export const isTableFile = (name: string) => /\.(csv|tsv|xlsx)$/i.test(name);

/** Asks which worksheet to import; resolves with its index, or null when the person cancels. */
export type SheetChooser = (names: string[], fileName: string) => Promise<number | null>;

/**
 * Rows of a CSV, TSV or XLSX file. A workbook with several worksheets asks `choose` which one to read
 * (gap Q16); without a chooser, or with one sheet, the first is read. Resolves with null when cancelled.
 */
export async function readTableFile(file: File, choose?: SheetChooser): Promise<string[][] | null> {
  if (/\.xlsx$/i.test(file.name)) {
    const { parseXlsx, xlsxSheetNames, OFFICE_MAX_BYTES } = await import('./office-import.ts');
    if (file.size > OFFICE_MAX_BYTES) throw new Error('Excel files up to 20 MB can be imported.');
    const bytes = new Uint8Array(await file.arrayBuffer()),
      names = choose ? xlsxSheetNames(bytes) : [];
    let index = 0;
    if (choose && names.length > 1) {
      const picked = await choose(names, file.name);
      if (picked === null) return null;
      index = picked;
    }
    return parseXlsx(bytes, index).rows;
  }
  const { csvTable } = await import('./record-import.ts');
  return csvTable(await file.text());
}

/** Message for a grid import; mentions the grid limit when rows or columns were cut. */
export const gridImportNote = (data: GridData, truncated: boolean) =>
  `Imported ${data.rows} ${data.rows === 1 ? 'row' : 'rows'} and ${data.cols} ${data.cols === 1 ? 'column' : 'columns'} into the grid.` +
  (truncated
    ? ` Only the first ${data.rows} rows and ${data.cols} columns fit (a grid holds up to ${GRID_MAX} rows or columns and 2,500 cells); use a Table for more.`
    : '');

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
