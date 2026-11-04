// Frames workflow (track R5): order frames by their position on the board and hide frame titles.
import type { Board, Item } from './model.ts';
import { setFrameData } from './navigation.ts';

/**
 * Reading order for frames: rows top to bottom, then left to right within a row. A frame joins the current row
 * when its top edge lies above the middle of the row's first frame, so slightly misaligned frames stay in line.
 */
export function framesByPosition(frames: Item[]): Item[] {
  const sorted = [...frames].sort((a, b) => a.y - b.y || a.x - b.x),
    rows: Item[][] = [];
  for (const f of sorted) {
    const row = rows[rows.length - 1];
    if (row && f.y < row[0].y + row[0].h / 2) row.push(f);
    else rows.push([f]);
  }
  return rows.flatMap(r => r.sort((a, b) => a.x - b.x || a.y - b.y));
}
/** Set the presentation order to the frames' position order (one undo step). */
export function sortFramesByPosition(board: Board): Board {
  const order = framesByPosition(board.items.filter(i => i.type === 'frame')).map(f => f.id);
  return { ...board, presentation: order };
}
export const frameTitleHidden = (frame: Item) => frame.type === 'frame' && !!frame.data?.hideTitle;
/** Hide or show a frame's title on the canvas; the title stays in the frames list and presentation. */
export const setFrameTitleHidden = (board: Board, id: string, hidden: boolean): Board =>
  setFrameData(board, id, { hideTitle: hidden });
