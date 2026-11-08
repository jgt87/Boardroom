// Richer Doc editing (decision R4-Q4, 2026-11-08): date chips, comment threads anchored to Doc text and blocks
// made from board objects dropped onto a Doc. Pure: no React, no DOM.
//
// Storage, all inside the Doc's own `item.data`:
// - `@date[YYYY-MM-DD]` in the Markdown is a date chip. Only real calendar dates are accepted; anything else
//   stays literal text.
// - `{comment:<id>}text{/comment}` in the Markdown anchors a comment thread to `text`. The threads live in
//   `item.data.comments` (see DocThread). A thread whose marker is gone is "detached": it stays listed with the
//   text it was on until someone deletes it, so removing commented text never drops a thread silently.
// - A dropped board object becomes a paragraph with its text and a `#board=<id>&object=<id>` link.
import { Marked } from 'marked';
import type { Board, Item } from './model.ts';
import { isShapeKind } from './shapes.ts';

// ---- Date chips -----------------------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Source of a date chip at the start of the text. */
export const DATE_CHIP = /^@date\[(\d{4}-\d{2}-\d{2})\]/;
const DATE_CHIPS = /@date\[(\d{4}-\d{2}-\d{2})\]/g;

/** True for a real calendar date written `YYYY-MM-DD` (years 1000–9999). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
/** "8 Nov 2026" for 2026-11-08. The same on every device, so search and exports agree. */
export function readableDate(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [y, mo, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}
/** Markdown for a date chip, or '' for an invalid date. */
export const dateMarkdown = (iso: string) => (isIsoDate(iso) ? `@date[${iso}]` : '');
/** Replace every valid date chip in Markdown with its readable date (invalid ones stay as written). */
export const readableDates = (md: string) =>
  md.replace(DATE_CHIPS, (raw, iso: string) => (isIsoDate(iso) ? readableDate(iso) : raw));
/** Today's date as `YYYY-MM-DD` in local time. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---- Comment threads ------------------------------------------------------------------------------------
export const COMMENT_ID = /^[A-Za-z0-9_-]{1,40}$/;
/** Source of a comment marker at the start of the text: id and the commented Markdown. */
export const COMMENT_MARK = /^\{comment:([A-Za-z0-9_-]{1,40})\}([\s\S]+?)\{\/comment\}/;
const COMMENT_MARKS = /\{comment:([A-Za-z0-9_-]{1,40})\}([\s\S]+?)\{\/comment\}/g;
export const DOC_COMMENT_LIMITS = { threads: 300, messages: 200, text: 2000, author: 80, quote: 200 } as const;

export type DocMessage = { id: string; text: string; at: string; author?: string };
export type DocThread = {
  id: string;
  /** The commented text when the thread was made, shown when the text is gone. */
  quote: string;
  messages: DocMessage[];
  resolved?: true;
};

/** Ids of the comment markers in Markdown, in document order. */
export const commentIds = (md: string): string[] => [...md.matchAll(COMMENT_MARKS)].map(m => m[1]);
/** Remove a comment's marker and keep its text. */
export const unwrapComment = (md: string, id: string) =>
  md.replace(COMMENT_MARKS, (raw, found: string, inner: string) => (found === id ? inner : raw));
/** Markdown without any comment markers (for plain text and search). */
export const stripComments = (md: string) => md.replace(COMMENT_MARKS, '$2');
/** Threads whose marker is no longer in the Markdown. */
export const detachedThreads = (md: string, threads: DocThread[]) => {
  const live = new Set(commentIds(md));
  return threads.filter(t => !live.has(t.id));
};

const cleanBody = (text: string, what: string) => {
  const body = text.trim();
  if (!body) throw new Error(`Write a ${what} first.`);
  if (body.length > DOC_COMMENT_LIMITS.text) throw new Error('Comments are limited to 2,000 characters.');
  return body;
};
const quoteOf = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, DOC_COMMENT_LIMITS.quote);
const authorPart = (author?: string) => {
  const a = (author ?? '').replace(/\s+/g, ' ').trim().slice(0, DOC_COMMENT_LIMITS.author);
  return a ? { author: a } : {};
};

/** A new thread on `quote` with its first message. Throws with a readable reason for empty or long text. */
export function newDocThread(
  quote: string,
  text: string,
  opts: { id: string; messageId: string; at?: string; author?: string },
): DocThread {
  if (!COMMENT_ID.test(opts.id)) throw new Error('Invalid comment id.');
  return {
    id: opts.id,
    quote: quoteOf(quote),
    messages: [
      {
        id: opts.messageId,
        text: cleanBody(text, 'comment'),
        at: opts.at ?? new Date().toISOString(),
        ...authorPart(opts.author),
      },
    ],
  };
}
/** Add a reply to a thread (the oldest messages go past the limit). */
export function replyDocThread(
  threads: DocThread[],
  id: string,
  text: string,
  opts: { messageId: string; at?: string; author?: string },
): DocThread[] {
  const body = cleanBody(text, 'reply');
  return threads.map(t =>
    t.id === id
      ? {
          ...t,
          messages: [
            ...t.messages,
            { id: opts.messageId, text: body, at: opts.at ?? new Date().toISOString(), ...authorPart(opts.author) },
          ].slice(-DOC_COMMENT_LIMITS.messages),
        }
      : t,
  );
}
/** Mark a thread resolved or open again. */
export const resolveDocThread = (threads: DocThread[], id: string, resolved: boolean): DocThread[] =>
  threads.map(t => {
    if (t.id !== id) return t;
    const { resolved: _old, ...rest } = t;
    void _old;
    return resolved ? { ...rest, resolved: true } : rest;
  });

/** Validate `item.data.comments` of a Doc; throws with a readable reason. */
export function validateDocThreads(value: unknown): void {
  if (value === undefined) return;
  const fail = (why: string): never => {
    throw new Error(`Invalid doc comments: ${why}.`);
  };
  if (!Array.isArray(value) || value.length > DOC_COMMENT_LIMITS.threads) fail('too many or not a list');
  const ids = new Set<string>();
  const str = (v: unknown, max: number, allowEmpty = false) =>
    typeof v === 'string' && v.length <= max && (allowEmpty || v.length > 0);
  for (const t of value as unknown[]) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) fail('a thread is not an object');
    const thread = t as Record<string, unknown>;
    if (typeof thread.id !== 'string' || !COMMENT_ID.test(thread.id) || ids.has(thread.id)) fail('bad thread id');
    ids.add(thread.id as string);
    if (!str(thread.quote, DOC_COMMENT_LIMITS.quote, true)) fail('bad quote');
    if (thread.resolved !== undefined && thread.resolved !== true) fail('bad resolved flag');
    const messages = thread.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > DOC_COMMENT_LIMITS.messages)
      fail('bad message list');
    for (const m of messages as unknown[]) {
      if (!m || typeof m !== 'object') fail('a message is not an object');
      const msg = m as Record<string, unknown>;
      if (typeof msg.id !== 'string' || !COMMENT_ID.test(msg.id)) fail('bad message id');
      if (!str(msg.text, DOC_COMMENT_LIMITS.text)) fail('bad message text');
      if (!str(msg.at, 40) || Number.isNaN(Date.parse(msg.at as string))) fail('bad message time');
      if (msg.author !== undefined && !str(msg.author, DOC_COMMENT_LIMITS.author)) fail('bad author');
    }
  }
}

// ---- Plain text -----------------------------------------------------------------------------------------
/** Doc Markdown with chips made readable and comment markers removed (for search). */
export const docSearchText = (md: string) => readableDates(stripComments(md));

// ---- Board objects dropped into a Doc --------------------------------------------------------------------
const LINK_ID = '[A-Za-z0-9_-]{1,100}';
const OBJECT_LINK = new RegExp(`^#(?:board=${LINK_ID}&)?object=${LINK_ID}$`);
/** True for a link to an object on a board, `#board=<id>&object=<id>` (the board part is optional). */
export const isObjectLinkHref = (href: unknown): boolean => typeof href === 'string' && OBJECT_LINK.test(href);
/** The link to an object, `#board=<id>&object=<id>`, the format every object link in the app uses (R4-Q6). */
export function objectLinkHref(objectId: string, boardId?: string): string {
  const params = new URLSearchParams();
  if (boardId) params.set('board', boardId);
  params.set('object', objectId);
  return '#' + params.toString();
}

/** Object kinds that can be dropped into a Doc, and the link label for each. */
export function droppableLabel(item: Item, isShape: (kind: string) => boolean = isShapeKind): string | null {
  if (item.type === 'note') return 'sticky note';
  if (item.type === 'text') return 'text';
  if (item.type === 'card') return 'card';
  if (isShape(item.type)) return 'shape';
  return null;
}
/** Escape plain text so it reads the same as Markdown (no formatting, chips, markers or HTML). */
export const escapeMarkdownText = (text: string) =>
  escapeInline(text.replace(/\s+/g, ' ').trim())
    // Text that would start a heading, quote, list or table row stays a paragraph.
    .replace(/^([#>|-])/, '\\$1')
    .replace(/^(\d+)([.)])/, '$1\\$2');
/**
 * Escape text for a Doc's inline Markdown: the formatting characters, `++`/`==` pairs and the `{color`, `{mark`
 * and `{comment` markers. The Doc editor's serializer uses the same escaping, so a dropped paragraph saves back
 * unchanged. Raw HTML needs no escaping: Docs always show it as text.
 */
export const escapeInline = (text: string) =>
  text
    .replace(/([\\`*_[\]~])/g, '\\$1')
    .replace(/\+(?=\+)/g, '\\+')
    .replace(/=(?==)/g, '\\=')
    .replace(/\{(?=\/?(color|mark|comment))/g, '\\{');
/** The paragraph a dropped object becomes: its text, then a link back to it. */
export function objectBlockMarkdown(item: Item, label: string, boardId?: string): string {
  const text = escapeMarkdownText(item.text ?? '').slice(0, 6000),
    link = `[${label}](${objectLinkHref(item.id, boardId)})`;
  return text ? `${text} (${link})` : link;
}

/** Top-level blocks of Doc Markdown, as source slices that join back to the whole text. */
function topBlocks(md: string): { raw: string; space: boolean }[] {
  return new Marked({ gfm: true }).lexer(md).map(t => ({ raw: t.raw, space: t.type === 'space' || t.type === 'def' }));
}
/** Number of top-level blocks (the elements a rendered Doc shows). */
export const docBlockCount = (md: string) => topBlocks(md).filter(b => !b.space).length;
/** Insert a Markdown block before top-level block `index` (clamped; past the end appends). */
export function insertDocBlock(md: string, index: number, block: string): string {
  const blocks = topBlocks(md);
  let seen = 0,
    offset = md.length;
  for (let k = 0, at = 0; k < blocks.length; at += blocks[k].raw.length, k++) {
    if (blocks[k].space) continue;
    if (seen === index) {
      offset = at;
      break;
    }
    seen++;
  }
  const before = md.slice(0, offset).trimEnd(),
    after = md.slice(offset).trimStart();
  return [before, block.trim(), after].filter(Boolean).join('\n\n');
}

/** Where a drag over a Doc would insert: the Doc and the top-level block the new paragraphs go before. */
export type DocDrop = { targetId: string; index: number };
/** Dragged objects can go into the Doc: every one is a sticky note, text, shape or card, and the Doc is unlocked. */
export function canDropIntoDoc(board: Board, ids: string[], drop: DocDrop): boolean {
  const target = board.items.find(i => i.id === drop.targetId);
  if (!target || target.type !== 'doc' || target.locked || ids.includes(target.id)) return false;
  const sources = board.items.filter(i => ids.includes(i.id));
  return sources.length > 0 && sources.length <= 50 && sources.every(i => !i.locked && droppableLabel(i) !== null);
}
/**
 * Insert one paragraph per dragged object (in paint order) into the Doc. The objects stay where they were; the
 * board comes back unchanged when the drop is not allowed or the Doc would pass its size limit.
 */
export function dropIntoDoc(board: Board, ids: string[], drop: DocDrop, boardId?: string, max = 60000): Board {
  if (!canDropIntoDoc(board, ids, drop)) return board;
  const target = board.items.find(i => i.id === drop.targetId)!,
    blocks = board.items.filter(i => ids.includes(i.id)).map(i => objectBlockMarkdown(i, droppableLabel(i)!, boardId)),
    markdown = insertDocBlock(String(target.data?.markdown ?? ''), drop.index, blocks.join('\n\n'));
  if (markdown.length > max) return board;
  return {
    ...board,
    items: board.items.map(i => (i.id === target.id ? { ...i, data: { ...i.data, markdown } } : i)),
  };
}
