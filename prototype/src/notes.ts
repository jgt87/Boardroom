// Sticky-note markers and conversion.
// Evidence: ComputeStickerWidget menu arrays include EMOJI_HORIZ, WIDGET_TYPE, CONVERT_TO_FORMAT
// and ADD_TO_DATA_TABLE. Markers here are local note metadata, not multiplayer reactions.
import type { Board, Item, RecordRow } from './model.ts';
import { isValidEmojiValue } from './emoji-data.ts';
import { createItem, pruneReferences } from './model.ts';
import type { ShapeKind } from './shapes.ts';
import { isShapeKind } from './shapes.ts';
import { noteToCard } from './facilitation-widgets.ts';
import { colorName, selectedNotes } from './cluster.ts';

export const noteEmojis = [
  '👍',
  '❤️',
  '😀',
  '🎉',
  '🔥',
  '⭐',
  '✅',
  '❌',
  '❓',
  '❗',
  '💡',
  '📌',
  '🚀',
  '👀',
  '🤔',
  '😍',
  '😂',
  '😢',
  '🙏',
  '👏',
  '💯',
  '⚠️',
  '🐛',
  '📈',
  '📉',
  '🎯',
  '🗓️',
  '💬',
  '🔒',
  '🏁',
];
export function setNoteEmoji(board: Board, ids: string[], emoji: string | undefined): Board {
  return {
    ...board,
    items: board.items.map(i => {
      if (!ids.includes(i.id) || i.type !== 'note' || i.locked) return i;
      const next = { ...i };
      if (emoji) next.emoji = emoji;
      else delete next.emoji;
      return next;
    }),
  };
}

export type ConversionTarget =
  | { kind: 'card' }
  | { kind: 'text' }
  | { kind: 'shape'; shape: ShapeKind }
  | { kind: 'record'; datasetId: string | 'new' };
const views = ['table', 'kanban', 'timeline'];
/** Datasets that have a view on the board, labelled by that view, for the conversion picker. */
export function datasetChoices(board: Board): { id: string; label: string; count: number }[] {
  const seen = new Set<string>(),
    out: { id: string; label: string; count: number }[] = [];
  for (const i of board.items)
    if (views.includes(i.type) && i.datasetId && !seen.has(i.datasetId) && board.datasets?.[i.datasetId]) {
      seen.add(i.datasetId);
      const rows = board.datasets[i.datasetId];
      out.push({
        id: i.datasetId,
        label: `${i.type[0].toUpperCase()}${i.type.slice(1)} · ${rows[0]?.title || 'Untitled records'}`,
        count: rows.length,
      });
    }
  return out;
}
/**
 * Convert a sticky note in one board change (one undo step).
 * - Text and shapes keep the note's id, so attached connectors, groups and selection stay valid.
 *   Text, formatting, link and tags carry over; the note colour becomes the shape fill (text uses
 *   the default text colour). The emoji marker is note-only and is dropped.
 * - A record keeps text as the title plus link and tags. The note is removed and its connectors
 *   are re-attached to the dataset's view object (a new Table view is created for a new dataset).
 */
export function convertNote(board: Board, id: string, target: ConversionTarget): { board: Board; selectId: string } {
  const note = board.items.find(i => i.id === id);
  if (!note || note.type !== 'note') throw new Error('Select a sticky note to convert.');
  if (note.locked) throw new Error('Unlock the sticky note before converting it.');
  if (target.kind === 'card') {
    const card = noteToCard(note);
    return { board: { ...board, items: board.items.map(i => (i.id === id ? card : i)) }, selectId: id };
  }
  if (target.kind === 'text' || target.kind === 'shape') {
    if (target.kind === 'shape' && !isShapeKind(target.shape)) throw new Error('Choose a supported shape.');
    const next: Item = {
      ...note,
      type: target.kind === 'text' ? 'text' : target.shape,
      fill: target.kind === 'text' ? '#25252a' : note.fill,
    };
    delete next.emoji;
    if (next.format?.valign && target.kind === 'text') {
      next.format = { ...next.format };
      delete next.format.valign;
    }
    return { board: { ...board, items: board.items.map(i => (i.id === id ? next : i)) }, selectId: id };
  }
  const row: RecordRow = {
    id: crypto.randomUUID(),
    title: note.text.slice(0, 6000),
    status: 'Not started',
    assignee: '',
    start: '',
    end: '',
  };
  if (note.tags?.length) row.tags = [...note.tags];
  if (note.link) row.link = note.link;
  let datasetId = target.datasetId,
    items = board.items.filter(i => i.id !== id),
    view: Item | undefined;
  const datasets = { ...board.datasets };
  if (datasetId === 'new') {
    datasetId = crypto.randomUUID();
    view = { ...createItem('table', note.x, note.y, '#ffffff'), datasetId };
    if (note.group) view.group = note.group;
    datasets[datasetId] = [row];
    items = [...items, view];
  } else {
    if (!datasets[datasetId]) throw new Error('That dataset no longer exists.');
    if (datasets[datasetId].length >= 1000) throw new Error('That dataset already has 1,000 records.');
    view = items.find(i => views.includes(i.type) && i.datasetId === datasetId);
    if (!view) throw new Error('That dataset has no view on this board.');
    datasets[datasetId] = [...datasets[datasetId], row];
  }
  const viewId = view.id;
  items = items.map(i =>
    i.type === 'arrow' && (i.from === id || i.to === id)
      ? { ...i, from: i.from === id ? viewId : i.from, to: i.to === id ? viewId : i.to }
      : i,
  );
  return { board: pruneReferences({ ...board, items, datasets }), selectId: viewId };
}

// ---- Notes to a Doc outline (gap G7) ----------------------------------------------------------------
export type OutlineBy = 'color' | 'frame';
const centreIn = (f: Item, i: Item) =>
  i.x + i.w / 2 >= f.x && i.x + i.w / 2 <= f.x + f.w && i.y + i.h / 2 >= f.y && i.y + i.h / 2 <= f.y + f.h;
/** One Markdown list line per note; line breaks inside a note become spaces. */
const noteLine = (n: Item) => {
  const text = n.text.replace(/\s+/g, ' ').trim();
  return `- ${text || '(empty note)'}${n.tags?.length ? ` ${n.tags.map(t => `#${t}`).join(' ')}` : ''}`;
};
/**
 * Markdown outline of the selected sticky notes, grouped by colour or by the (smallest) frame that holds
 * each note's centre. Groups and notes follow reading order (top to bottom, then left to right).
 */
export function notesToMarkdown(board: Board, ids: string[], by: OutlineBy, title = 'Notes summary'): string {
  const notes = selectedNotes(board, ids);
  if (!notes.length) throw new Error('Select sticky notes to summarise.');
  const frames = board.items.filter(i => i.type === 'frame');
  const groups = new Map<string, { heading: string; lines: string[] }>();
  for (const n of notes) {
    let key: string, heading: string;
    if (by === 'color') {
      key = n.fill.toLowerCase();
      heading = colorName(key);
    } else {
      const frame = frames.filter(f => centreIn(f, n)).sort((a, b) => a.w * a.h - b.w * b.h)[0];
      key = frame?.id ?? '';
      heading = frame ? frame.text.replace(/\s+/g, ' ').trim() || 'Untitled frame' : 'Not in a frame';
    }
    const g = groups.get(key) ?? { heading, lines: [] };
    g.lines.push(noteLine(n));
    groups.set(key, g);
  }
  const body = [...groups.values()].map(g => `## ${g.heading}\n\n${g.lines.join('\n')}`).join('\n\n');
  return `# ${title}\n\n${body}\n`.slice(0, 60000);
}
/** Create a Doc item to the right of the selected notes holding their outline. One call is one undo step. */
export function notesToDoc(board: Board, ids: string[], by: OutlineBy): { board: Board; docId: string } {
  const markdown = notesToMarkdown(board, ids, by),
    notes = selectedNotes(board, ids),
    right = Math.max(...notes.map(n => n.x + n.w)),
    top = Math.min(...notes.map(n => n.y));
  const base = createItem('doc', Math.round(right + 80), Math.round(top));
  const doc: Item = { ...base, data: { ...base.data, markdown } };
  return { board: { ...board, items: [...board.items, doc] }, docId: doc.id };
}

// ---- Reactions on sticky notes (gap D13) -----------------------------------------------------------
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'] as const;
export const MAX_REACTIONS = 12;
/** Add (delta +1) or remove (delta -1) one reaction on unlocked sticky notes; a count of 0 removes it. */
export function reactToNotes(board: Board, ids: string[], emoji: string, delta: 1 | -1): Board {
  if (!isValidEmojiValue(emoji)) throw new Error('Choose an emoji.');
  const wanted = new Set(ids);
  return {
    ...board,
    items: board.items.map(i => {
      if (!wanted.has(i.id) || i.type !== 'note' || i.locked) return i;
      const r = { ...(i.reactions ?? {}) };
      const n = Math.max(0, Math.min(999, (r[emoji] ?? 0) + delta));
      if (n) r[emoji] = n;
      else delete r[emoji];
      if (Object.keys(r).length > MAX_REACTIONS)
        throw new Error(`A sticky note holds up to ${MAX_REACTIONS} different reactions.`);
      const next: Item = { ...i, reactions: r };
      if (!Object.keys(r).length) delete next.reactions;
      return next;
    }),
  };
}
export function validateReactions(board: Board) {
  for (const i of board.items) {
    if (i.reactions === undefined) continue;
    const entries =
      typeof i.reactions === 'object' && i.reactions && !Array.isArray(i.reactions)
        ? Object.entries(i.reactions)
        : null;
    if (
      !entries ||
      i.type !== 'note' ||
      entries.length > MAX_REACTIONS ||
      entries.some(([e, n]) => !isValidEmojiValue(e) || !Number.isInteger(n) || n < 1 || n > 999)
    )
      throw new Error('Invalid reactions on a sticky note.');
  }
}
