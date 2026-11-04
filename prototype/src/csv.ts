// CSV writing shared by spreadsheet exports (gap list B4, B5). Pure.
// Cells that a spreadsheet would run as a formula (=, +, -, @, tab) are prefixed with an apostrophe.
import type { Board, Item } from './model.ts';
import { isShapeKind } from './shapes.ts';

export const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  const safe = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : s;
};
/** Rows to CSV with CRLF line ends (what spreadsheet apps expect). */
export const toCsv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

const textKinds = (i: Item) => ['note', 'text', 'card', 'frame'].includes(i.type) || isShapeKind(i.type);

/** Text of sticky notes, text, shapes, cards and frames (the selection, or the whole board), in board order. */
export function boardTextCsv(board: Board, ids?: string[]): string {
  const wanted = ids?.length ? new Set(ids) : null;
  const rows = board.items
    .filter(i => (!wanted || wanted.has(i.id)) && textKinds(i) && !i.hidden && i.text.trim())
    .map(i => [i.type, i.text, i.fill, (i.tags ?? []).join(', '), i.author ?? '', Math.round(i.x), Math.round(i.y)]);
  return toCsv([['Type', 'Text', 'Colour', 'Tags', 'Author', 'X', 'Y'], ...rows]);
}
