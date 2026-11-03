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

/** Record the author on sticky notes created by this change (new ids without an author). */
export function stampAuthors(previous: Board, next: Board, author: string): Board {
  const name = cleanAuthor(author);
  if (!name) return next;
  const known = new Set(previous.items.map(i => i.id));
  if (!next.items.some(i => i.type === 'note' && !i.author && !known.has(i.id))) return next;
  return {
    ...next,
    items: next.items.map(i => (i.type === 'note' && !i.author && !known.has(i.id) ? { ...i, author: name } : i)),
  };
}
