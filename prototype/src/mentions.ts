// Local @mentions in comments (gap G10). Names come from People widgets, user cards, card assignees and the
// local profile name. There are no notifications: a mention highlights the person in the text. Pure.
/** The @query being typed right before the caret, or null. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret),
    m = /(^|\s)@([^\s@]{0,40})$/.exec(before);
  return m ? { start: before.length - m[2].length - 1, query: m[2] } : null;
}
/** Names matching the query: prefix matches on any word first, then substring matches. */
export function mentionMatches(names: string[], query: string, limit = 6): string[] {
  const q = query.toLowerCase(),
    unique = [...new Set(names.map(n => n.trim()).filter(Boolean))];
  const starts = unique.filter(n =>
      n
        .toLowerCase()
        .split(/\s+/)
        .some(w => w.startsWith(q)),
    ),
    contains = unique.filter(n => !starts.includes(n) && n.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}
/** Replace the @query at `start` with `@Name ` and return the new text and caret. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const inserted = `@${name} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}
/** Split text into plain parts and mentions of known names (longest names first, case-insensitive). */
export function splitMentions(text: string, names: string[]): { text: string; mention?: boolean }[] {
  const known = [...new Set(names.map(n => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!known.length || !text.includes('@')) return [{ text }];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`@(${known.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const out: { text: string; mention?: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], mention: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
