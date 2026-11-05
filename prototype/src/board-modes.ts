// Board editing modes (track R2-K). Pure. A board is fully editable, view-only (gap C16: nothing changes
// until view-only is turned off) or comment-only: comments can be added, replied to, resolved, reacted to and
// deleted, and every other change is refused with a message. The two modes exclude each other.
import type { Board } from './model.ts';

export type BoardMode = 'edit' | 'comment' | 'view';
export const boardModeOf = (b: Board): BoardMode => (b.viewOnly ? 'view' : b.commentOnly ? 'comment' : 'edit');
export const modeLabels: Record<BoardMode, string> = { edit: 'Editing', comment: 'Comment only', view: 'View only' };

export const VIEW_ONLY_MESSAGE = 'This board is view-only. Turn off View only in the Board menu to edit.';
export const COMMENT_ONLY_MESSAGE =
  'This board is comment-only: you can add, reply to and resolve comments. Turn off Comment only in the Board menu to edit.';

/**
 * Board settings (name, status, sensitivity, description, background, start view, thumbnail, emoji) are read-only
 * on a comment-only or view-only board (question P2-Q11): the controls show the current value but cannot change it.
 */
export const settingsLocked = (b: Board): boolean => !!(b.viewOnly || b.commentOnly);
export const settingsLockedNote = (b: Board): string =>
  b.viewOnly
    ? 'Board settings are read-only while the board is view-only.'
    : 'Board settings are read-only while the board is comment-only.';

/** Keys a comment-only board accepts changes to: its comments, and the mode switches themselves. */
const commentKeys = new Set(['comments', 'commentOnly', 'viewOnly']);
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** True when `next` differs from `prev` only in its comments (or in the mode flags). */
export function onlyCommentsChanged(prev: Board, next: Board): boolean {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (commentKeys.has(k)) continue;
    if (!same((prev as Record<string, unknown>)[k], (next as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/**
 * Why `update(input)` is refused under the current board's mode, or null when the change may go ahead.
 * Turning a mode off (or switching to the other mode) is always allowed.
 */
export function modeRefusal(prev: Board, input: Board): string | null {
  if (input === prev) return null;
  if (prev.viewOnly && input.viewOnly) return VIEW_ONLY_MESSAGE;
  if (prev.commentOnly && input.commentOnly && !input.viewOnly && !onlyCommentsChanged(prev, input))
    return COMMENT_ONLY_MESSAGE;
  return null;
}

/** The board switched to `mode`, with the other mode's flag removed so at most one is set. */
export function withBoardMode(board: Board, mode: BoardMode): Board {
  const next = { ...board };
  delete next.viewOnly;
  delete next.commentOnly;
  if (mode === 'view') next.viewOnly = true;
  if (mode === 'comment') next.commentOnly = true;
  return next;
}

/** Validate the stored mode flags (throws a readable error). */
export function validateBoardModes(b: Board) {
  if (b.viewOnly !== undefined && typeof b.viewOnly !== 'boolean') throw new Error('Invalid view-only setting.');
  if (b.commentOnly !== undefined && typeof b.commentOnly !== 'boolean')
    throw new Error('Invalid comment-only setting.');
}
