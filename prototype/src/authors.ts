// Sticky note authors (item 85). Pure. The display name is local to this device; there are no accounts.
// Evidence: reconstruction backlog (sticky emoji and author-display behavior in ComputeStickerWidget).
import type { Board } from './model.ts';

export const AUTHOR_MAX = 80;
export const AUTHOR_KEY = 'boardroom.profile.name';

/** Trimmed display name without control characters or markup, or '' when empty. */
export function cleanAuthor(name: string): string {
  return [...name]
    .filter(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127 && ch !== '<' && ch !== '>')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AUTHOR_MAX);
}
export const isValidAuthor = (v: unknown) => typeof v === 'string' && !!v && v === cleanAuthor(v);

/** Up to two initials for the compact author badge. */
export function initials(name: string): string {
  const words = cleanAuthor(name).split(' ').filter(Boolean);
  return words
    .slice(0, 2)
    .map(w => [...w][0]!.toUpperCase())
    .join('');
}

/**
 * Record the author on sticky notes: new notes without an author, and (item 111) notes whose text this
 * change edited, so the shown author is the person who last wrote on the note.
 */
export function stampAuthors(previous: Board, next: Board, author: string): Board {
  const name = cleanAuthor(author);
  if (!name) return next;
  const before = new Map(previous.items.map(i => [i.id, i]));
  const needs = (i: Board['items'][number]) => {
    if (i.type !== 'note') return false;
    const old = before.get(i.id);
    if (!old) return !i.author;
    return old.text !== i.text && i.author !== name;
  };
  if (!next.items.some(needs)) return next;
  return { ...next, items: next.items.map(i => (needs(i) ? { ...i, author: name } : i)) };
}
