// Sticky-note markers and conversion.
// Evidence: ComputeStickerWidget menu arrays include EMOJI_HORIZ, WIDGET_TYPE, CONVERT_TO_FORMAT
// and ADD_TO_DATA_TABLE. Markers here are local note metadata, not multiplayer reactions.
import type { Board, Item, RecordRow } from './model.ts';
import { createItem, pruneReferences } from './model.ts';
import type { ShapeKind } from './shapes.ts';
import { isShapeKind } from './shapes.ts';
import { noteToCard } from './facilitation-widgets.ts';

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
