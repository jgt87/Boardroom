// Frame facilitation helpers: make several copies of a frame with its contents, and shuffle a frame style. Pure.
import type { Board } from './model.ts';
import { duplicateItems } from './arrange.ts';
import { frameMoveIds } from './interactions.ts';
import { applyFrameStyle, framePalettes, frameStyleOf } from './frame-styles.ts';
import { randomIndex } from './facilitation-widgets.ts';

export const FRAME_COPIES_MAX = 20;
const GAP = 80;

/**
 * Make `count` copies of a frame and everything inside it, placed in a row to its right. Copies are unlocked,
 * named "<frame> 2", "<frame> 3" and so on. Returns the new frame ids in order.
 */
export function copyFrame(board: Board, frameId: string, count: number): { board: Board; frames: string[] } {
  const frame = board.items.find(i => i.id === frameId && i.type === 'frame');
  if (!frame) throw new Error('Select a frame to copy.');
  if (!Number.isInteger(count) || count < 1 || count > FRAME_COPIES_MAX)
    throw new Error(`Make between 1 and ${FRAME_COPIES_MAX} copies.`);
  const ids = frameMoveIds(board.items, [frameId]);
  if (board.items.length + ids.length * count > 2000)
    throw new Error('This prototype supports up to 2,000 objects per board.');
  let next = board;
  const frames: string[] = [];
  const base = frame.text || 'Frame';
  for (let k = 1; k <= count; k++) {
    const r = duplicateItems(next, ids, { x: (frame.w + GAP) * k, y: 0 });
    const copyId = r.ids[ids.indexOf(frameId)];
    frames.push(copyId);
    next = {
      ...r.board,
      items: r.board.items.map(i => (i.id === copyId ? { ...i, text: `${base} ${k + 1}` } : i)),
    };
  }
  return { board: next, frames };
}

/** Apply a random frame style other than the one the first frame already has. */
export function shuffleFrameStyle(board: Board, frameIds: string[], source?: (buf: Uint32Array) => Uint32Array): Board {
  const first = board.items.find(i => frameIds.includes(i.id) && i.type === 'frame');
  const current = first ? frameStyleOf(first)?.id : undefined,
    choices = framePalettes.filter(p => p.id !== current);
  return applyFrameStyle(board, frameIds, choices[randomIndex(choices.length, source)].id);
}
