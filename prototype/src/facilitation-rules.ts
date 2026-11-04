// Facilitation extras (gaps G4, G5, G9): timer arithmetic, voting session rules and result management,
// comment editing, pinning and reactions, plus validation of the optional fields they store.
import type { Board, CommentMessage, CommentThread } from './model.ts';

// ---- Timer (G4) --------------------------------------------------------------------------------------
export const TIMER_MAX = (99 * 60 + 59) * 1000;
/** Parse "mm:ss", "m:ss" or whole minutes ("7") into milliseconds; null when invalid or over 99:59. */
export function parseClock(input: string): number | null {
  const s = input.trim();
  let ms: number;
  const clock = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (clock) {
    const sec = Number(clock[2]);
    if (sec > 59) return null;
    ms = (Number(clock[1]) * 60 + sec) * 1000;
  } else if (/^\d{1,2}$/.test(s)) ms = Number(s) * 60000;
  else return null;
  return ms > 0 && ms <= TIMER_MAX ? ms : null;
}
export type TimerLike = { duration: number; endsAt: number | null; remaining: number };
/** Add time to a timer: a running timer ends later, a paused or idle one gains remaining time. Capped at 99:59. */
export function addTime<T extends TimerLike>(t: T, ms: number, now: number): T {
  if (t.endsAt !== null && t.endsAt > now) {
    const left = Math.min(TIMER_MAX, t.endsAt - now + ms);
    return { ...t, endsAt: now + left };
  }
  const remaining = Math.min(TIMER_MAX, (t.endsAt !== null ? 0 : t.remaining) + ms);
  return { ...t, endsAt: null, remaining, duration: Math.max(t.duration, remaining) };
}

// ---- Voting (G5) -------------------------------------------------------------------------------------
/** Label used for objects in voting results. */
export const voteLabel = (i: { name?: string; text: string; type: string }) =>
  i.name || i.text.trim().slice(0, 60) || `Untitled ${i.type}`;
/** True when a timed voting session has run out. */
export const votingExpired = (board: Board, now: number) =>
  !!board.voting?.active && !!board.voting.endsAt && Date.parse(board.voting.endsAt) <= now;
/** Milliseconds left in a timed session, or null when it has no end time. */
export const votingTimeLeft = (board: Board, now: number) =>
  board.voting?.endsAt ? Math.max(0, Date.parse(board.voting.endsAt) - now) : null;
export function renameVotingResult(board: Board, index: number, name: string): Board {
  const results = board.votingResults ?? [];
  if (!results[index]) throw new Error('That result no longer exists.');
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 80);
  return {
    ...board,
    votingResults: results.map((r, i) => {
      if (i !== index) return r;
      const n = { ...r };
      if (clean) n.name = clean;
      else delete n.name;
      return n;
    }),
  };
}
export function deleteVotingResult(board: Board, index: number): Board {
  const results = board.votingResults ?? [];
  if (!results[index]) throw new Error('That result no longer exists.');
  const next: Board = { ...board, votingResults: results.filter((_, i) => i !== index) };
  if (!next.votingResults?.length) delete next.votingResults;
  return next;
}

// ---- Comments (G9) -----------------------------------------------------------------------------------
export const commentReactions = ['👍', '❤️', '🎉', '😂', '😮', '👀', '✅', '🙏'];
const mapThread = (board: Board, id: string, fn: (t: CommentThread) => CommentThread): Board => {
  if (!(board.comments ?? []).some(t => t.id === id)) throw new Error('That comment thread no longer exists.');
  return { ...board, comments: (board.comments ?? []).map(t => (t.id === id ? fn(t) : t)) };
};
const mapMessage = (board: Board, threadId: string, messageId: string, fn: (m: CommentMessage) => CommentMessage) =>
  mapThread(board, threadId, t => {
    if (!t.messages.some(m => m.id === messageId)) throw new Error('That comment no longer exists.');
    return { ...t, messages: t.messages.map(m => (m.id === messageId ? fn(m) : m)) };
  });
export function editMessage(board: Board, threadId: string, messageId: string, text: string, now = new Date()): Board {
  const body = text.trim();
  if (!body) throw new Error('A comment cannot be empty. Delete the thread instead.');
  if (body.length > 2000) throw new Error('Comments are limited to 2,000 characters.');
  return mapMessage(board, threadId, messageId, m =>
    m.text === body ? m : { ...m, text: body, editedAt: now.toISOString() },
  );
}
export const setPinned = (board: Board, id: string, pinned: boolean) =>
  mapThread(board, id, t => {
    const n = { ...t };
    if (pinned) n.pinned = true;
    else delete n.pinned;
    return n;
  });
/** Toggle an emoji reaction on a message. */
export function toggleReaction(board: Board, threadId: string, messageId: string, emoji: string): Board {
  if (!commentReactions.includes(emoji)) throw new Error('Choose one of the offered reactions.');
  return mapMessage(board, threadId, messageId, m => {
    const has = m.reactions?.includes(emoji),
      reactions = has ? m.reactions!.filter(e => e !== emoji) : [...(m.reactions ?? []), emoji];
    const n = { ...m };
    if (reactions.length) n.reactions = reactions;
    else delete n.reactions;
    return n;
  });
}
/** Pinned threads first; otherwise the stored order. */
export const orderThreads = (threads: CommentThread[]) =>
  [...threads].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

// ---- Validation --------------------------------------------------------------------------------------
const isoish = (v: unknown) => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
/** Optional comment fields: pinned threads, edited messages and reactions. */
export function validateComments(b: Board): void {
  for (const t of b.comments ?? []) {
    if (t.pinned !== undefined && typeof t.pinned !== 'boolean') throw new Error('Invalid comments.');
    for (const m of t.messages) {
      if (m.editedAt !== undefined && !isoish(m.editedAt)) throw new Error('Invalid comments.');
      if (
        m.reactions !== undefined &&
        (!Array.isArray(m.reactions) ||
          m.reactions.length > commentReactions.length ||
          new Set(m.reactions).size !== m.reactions.length ||
          m.reactions.some(r => !commentReactions.includes(r)))
      )
        throw new Error('Invalid comment reactions.');
    }
  }
}
/** Optional voting fields: end time, one vote per object, and names on stored results. */
export function validateVoting(b: Board): void {
  const v = b.voting;
  if (v) {
    if (v.endsAt !== undefined && !isoish(v.endsAt)) throw new Error('Invalid voting session.');
    if (v.onePerObject !== undefined && typeof v.onePerObject !== 'boolean') throw new Error('Invalid voting session.');
    if (v.onePerObject && Object.values(v.votes).some(n => n > 1)) throw new Error('Invalid voting session.');
  }
  for (const r of b.votingResults ?? [])
    if (!r || (r.name !== undefined && (typeof r.name !== 'string' || r.name.length > 80)))
      throw new Error('Invalid voting results.');
}
