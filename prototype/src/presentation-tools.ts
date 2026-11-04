// Presentation helpers: objects on a slide, click-to-zoom targets and slide voting targets. Pure.
import type { Board, Item, Point } from './model.ts';

const skipped = ['frame', 'arrow', 'pen'];
/** Objects whose centre lies inside the frame (frames, connectors, pen strokes and hidden objects excluded). */
export function slideObjects(board: Board, frame: Item): Item[] {
  return board.items.filter(i => {
    if (i.id === frame.id || i.hidden || skipped.includes(i.type)) return false;
    const cx = i.x + i.w / 2,
      cy = i.y + i.h / 2;
    return cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
  });
}
/** The topmost slide object under a board point, or null (click-to-zoom while presenting). */
export function slideObjectAt(board: Board, frame: Item, p: Point): Item | null {
  const objects = slideObjects(board, frame);
  for (let k = objects.length - 1; k >= 0; k--) {
    const i = objects[k];
    if (p.x >= i.x && p.x <= i.x + i.w && p.y >= i.y && p.y <= i.y + i.h) return i;
  }
  return null;
}
