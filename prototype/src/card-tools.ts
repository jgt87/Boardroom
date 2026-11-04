// Card helpers (item 115): conversion from other objects, bulk field edits, CSV export, assignee
// suggestions and tag colours. Pure: no React, no CSS.
import type { Board, Item } from './model.ts';
import { isShapeKind } from './shapes.ts';
import { isIsoDate, tshirtSizes } from './facilitation-widgets.ts';
import { toCsv } from './csv.ts';
import type { CardData } from './facilitation-widgets.ts';

/** Card title and description limit, in characters. */
export const CARD_TEXT_MAX = 20000;
export const CARD_ACCENT = '#4262ff';
/** Tag colours offered in the tag picker; the first is the default for new tags without a stored colour. */
export const tagPalette = ['#edf0ff', '#e3f6e9', '#fff1d6', '#ffe3e6', '#f1e8ff', '#e1f4fb', '#f0f0f4'] as const;
const tagInk: Record<string, string> = {
  '#edf0ff': '#334fd8',
  '#e3f6e9': '#1d7a44',
  '#fff1d6': '#8a5a00',
  '#ffe3e6': '#ad2532',
  '#f1e8ff': '#6b3fc4',
  '#e1f4fb': '#1f6f8b',
  '#f0f0f4': '#3f3f46',
};
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 32;

const emptyCard = (): CardData => ({ description: '', assignee: '', due: '', status: 'Not started' });

/** Kinds that Switch type can turn into a card. */
export const canBecomeCard = (i: Item) => i.type === 'note' || i.type === 'text' || isShapeKind(i.type);

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 225;
};

/**
 * Convert a sticky note, text box or shape to a card. Keeps the id (connectors stay attached), text,
 * tags and link; the object colour becomes the accent unless it is text colour or nearly white.
 */
export function toCard(item: Item): Item {
  const card: Item = {
    ...item,
    type: 'card',
    text: item.text.slice(0, CARD_TEXT_MAX),
    fill: item.type === 'text' || isLight(item.fill) ? CARD_ACCENT : item.fill,
    w: Math.max(item.w, 260),
    h: Math.max(140, Math.min(item.h, 220)),
    data: emptyCard(),
  };
  for (const k of ['emoji', 'format', 'style'] as const) delete (card as Record<string, unknown>)[k];
  return card;
}

/** Bulk Switch type: converts every selected, unlocked note, text box or shape. */
export function convertToCards(board: Board, ids: string[]): { board: Board; converted: number } {
  const wanted = new Set(ids);
  let converted = 0;
  const items = board.items.map(i => {
    if (!wanted.has(i.id) || i.locked || !canBecomeCard(i)) return i;
    converted++;
    return toCard(i);
  });
  return { board: converted ? { ...board, items } : board, converted };
}

export type CardPatch = {
  status?: string;
  assignee?: string;
  start?: string;
  due?: string;
  addTag?: string;
  removeTag?: string;
  /** Story points; null clears them (gap G12). */
  points?: number | null;
  /** T-shirt size; null clears it (gap G12). */
  size?: string | null;
};
/** Estimate chips offered in the card bar and dragged onto cards (gap G12). */
export const pointChips = [0, 0.5, 1, 2, 3, 5, 8, 13, 21] as const;
export const ESTIMATE_MIME = 'application/x-boardroom-estimate';
/** Parse an estimate chip payload: "points:5" or "size:M". */
export function estimatePatch(payload: string): CardPatch | null {
  const m = /^(points|size):(.+)$/.exec(payload);
  if (!m) return null;
  if (m[1] === 'points') {
    const n = Number(m[2]);
    return Number.isFinite(n) && n >= 0 && n <= 1000 ? { points: n } : null;
  }
  return (tshirtSizes as readonly string[]).includes(m[2]) ? { size: m[2] } : null;
}

/** Apply one field change to every selected, unlocked card. Record-synced cards only take statuses from their schema. */
export function patchCards(
  board: Board,
  ids: string[],
  patch: CardPatch,
  statusesFor?: (i: Item) => readonly string[],
) {
  const wanted = new Set(ids);
  for (const date of [patch.start, patch.due])
    if (date !== undefined && date !== '' && !isIsoDate(date)) throw new Error('Enter a valid date.');
  const tag = patch.addTag?.trim();
  if (tag !== undefined && (!tag || tag.length > MAX_TAG_LENGTH))
    throw new Error(`Use a tag of 1 to ${MAX_TAG_LENGTH} characters.`);
  return {
    ...board,
    items: board.items.map(i => {
      if (!wanted.has(i.id) || i.type !== 'card' || i.locked) return i;
      const d: CardData = { ...emptyCard(), ...(i.data as CardData) };
      if (patch.status !== undefined) {
        if (patch.status === '' && i.recordRef) return i;
        if (patch.status && statusesFor && !statusesFor(i).includes(patch.status)) return i;
        d.status = patch.status;
      }
      if (patch.assignee !== undefined) d.assignee = patch.assignee.trim().slice(0, 200);
      if (patch.start !== undefined) {
        if (patch.start) d.start = patch.start;
        else delete d.start;
      }
      if (patch.due !== undefined) d.due = patch.due;
      if (patch.points !== undefined) {
        if (patch.points === null) delete d.points;
        else d.points = patch.points;
      }
      if (patch.size !== undefined) {
        if (patch.size === null) delete d.size;
        else d.size = patch.size as CardData['size'];
      }
      if (d.start && d.due && d.start > d.due) throw new Error('The start date must be on or before the due date.');
      let tags = i.tags;
      if (tag && !tags?.includes(tag)) {
        if ((tags?.length ?? 0) >= MAX_TAGS) throw new Error(`A card holds up to ${MAX_TAGS} tags.`);
        tags = [...(tags ?? []), tag];
      }
      if (patch.removeTag) tags = tags?.filter(t => t !== patch.removeTag);
      const next: Item = { ...i, data: d, tags: tags?.length ? tags : undefined };
      if (!next.tags) delete next.tags;
      return next;
    }),
  };
}

/** Names offered as assignees: people lists, user cards and existing card assignees, deduplicated. */
export function boardPeople(board: Board): string[] {
  const names = new Set<string>();
  for (const i of board.items) {
    const d = i.data as Record<string, unknown> | undefined;
    if (i.type === 'people' && Array.isArray(d?.members))
      for (const m of d.members as { name?: unknown }[]) if (typeof m?.name === 'string') names.add(m.name.trim());
    if (i.type === 'usercard' && typeof d?.name === 'string') names.add(d.name.trim());
    if (i.type === 'card' && typeof d?.assignee === 'string') names.add(d.assignee.trim());
  }
  names.delete('');
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Every tag used on the board, for the tag picker. */
export const boardTags = (board: Board) =>
  [...new Set(board.items.flatMap(i => i.tags ?? []))].sort((a, b) => a.localeCompare(b));

/** Background and text colour of a tag: the stored board colour, else the default palette entry. */
export function tagColors(board: Board, tag: string): { background: string; color: string } {
  const background = board.tagColors?.[tag] ?? tagPalette[0];
  return { background, color: tagInk[background] ?? '#3f3f46' };
}

export function validateTagColors(b: Board) {
  if (b.tagColors === undefined) return;
  if (
    !b.tagColors ||
    typeof b.tagColors !== 'object' ||
    Array.isArray(b.tagColors) ||
    Object.keys(b.tagColors).length > 2000 ||
    Object.entries(b.tagColors).some(
      ([k, v]) => !k || k.length > MAX_TAG_LENGTH || !(tagPalette as readonly string[]).includes(v),
    )
  )
    throw new Error('Invalid tag colours.');
}

/** Spreadsheet export of cards, in board order. */
export function cardsCsv(cards: Item[]): string {
  const head = ['Title', 'Description', 'Status', 'Assignee', 'Start date', 'Due date', 'Tags', 'Story points', 'Size'];
  const rows = cards
    .filter(i => i.type === 'card')
    .map(i => {
      const d = (i.data ?? {}) as Partial<CardData>;
      return [i.text, d.description, d.status, d.assignee, d.start, d.due, (i.tags ?? []).join(', '), d.points, d.size];
    });
  return toCsv([head, ...rows]);
}
