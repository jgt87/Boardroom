// Applying drag-and-drop chips (track F): one path for estimate chips, voting dots and people avatars, used by
// canvas drops and by clicking a chip with objects selected. Each call is one board change (one undo step).
// Locked objects are left alone. Pure: no React, no CSS.
import type { Board, Item, PlacedDots } from './model.ts';
import { editableIds } from './arrange.ts';
import { patchCards } from './card-tools.ts';
import type { CardPatch } from './card-tools.ts';
import { acceptsChip, dotsLeft, estimateLabel, MAX_DOT_PILES, MAX_DOTS_PER_PILE } from './chip-rules.ts';
import type { Chip, DotPileData } from './chip-rules.ts';

/** What a chip is called in status messages. */
export function chipName(chip: Chip): string {
  if (chip.kind === 'dot') return 'dot';
  if (chip.kind === 'person') return chip.name || 'Unassign';
  return chip.value ? `estimate ${estimateLabel(chip.value)}` : 'Clear estimate';
}

/** Where a chip may be dropped, for the hint when it lands elsewhere. */
export const chipHint = (chip: Chip) =>
  chip.kind === 'dot' ? 'Drop the dot on an object.' : `Drop the ${chip.kind} on a card or sticky note.`;

const cardPatch = (chip: Chip): CardPatch => {
  if (chip.kind === 'person') return { assignee: chip.name };
  if (chip.kind !== 'estimate') return {};
  const v = chip.value;
  // "?" (not estimated yet) and Clear both remove a card's estimate: card points are numbers. Points and size
  // are separate card fields, so a points chip keeps the size and a size chip keeps the points.
  if (!v || v === '?') return { points: null, size: null };
  return /^\d/.test(v) ? { points: Number(v) } : { size: v };
};

function withDot(i: Item, pile: string, color: string, delta: 1 | -1): Item {
  const dots = (i.dots ?? []).map(d => ({ ...d }));
  const at = dots.findIndex(d => d.pile === pile);
  if (at < 0) {
    if (delta < 0) return i;
    if (dots.length >= MAX_DOT_PILES) throw new Error(`An object holds dots from up to ${MAX_DOT_PILES} piles.`);
    dots.push({ pile, color, n: 1 });
  } else {
    const n = dots[at]!.n + delta;
    if (n > MAX_DOTS_PER_PILE) throw new Error('That object holds as many dots as it can.');
    if (n < 1) dots.splice(at, 1);
    else dots[at] = { ...dots[at]!, n };
  }
  const next: Item = { ...i, dots };
  if (!dots.length) delete next.dots;
  return next;
}

/**
 * Apply a chip to the objects `ids`. Throws a readable Error when no object takes it (wrong kind, locked, or
 * an empty dot pile); otherwise returns the new board and how many objects changed.
 */
export function applyChip(board: Board, ids: string[], chip: Chip): { board: Board; applied: number } {
  const byId = new Map(board.items.map(i => [i.id, i]));
  const fitting = [...new Set(ids)].filter(id => {
    const i = byId.get(id);
    return !!i && acceptsChip(i, chip) && !(chip.kind === 'dot' && id === chip.pile);
  });
  if (!fitting.length) throw new Error(chipHint(chip));
  const open = new Set(editableIds(board, fitting));
  const targets = fitting.filter(id => open.has(id));
  if (!targets.length) throw new Error(fitting.length === 1 ? 'That object is locked.' : 'Those objects are locked.');
  if (chip.kind === 'dot') {
    const pile = byId.get(chip.pile);
    if (pile?.type !== 'dotpile') throw new Error('That dot pile is no longer on the board.');
    const left = dotsLeft(board, pile);
    if (left < targets.length)
      throw new Error(
        left ? `Only ${left} ${left === 1 ? 'dot is' : 'dots are'} left in this pile.` : 'No dots left in this pile.',
      );
    const color = (pile.data as DotPileData).color,
      wanted = new Set(targets);
    return {
      board: { ...board, items: board.items.map(i => (wanted.has(i.id) ? withDot(i, pile.id, color, 1) : i)) },
      applied: targets.length,
    };
  }
  const cards = targets.filter(id => byId.get(id)!.type === 'card'),
    notes = new Set(targets.filter(id => byId.get(id)!.type === 'note'));
  let next = cards.length ? patchCards(board, cards, cardPatch(chip)) : board;
  if (notes.size)
    next = {
      ...next,
      items: next.items.map(i => {
        if (!notes.has(i.id)) return i;
        const n: Item = { ...i };
        if (chip.kind === 'estimate') {
          if (chip.value) n.estimate = chip.value;
          else delete n.estimate;
        } else if (chip.kind === 'person') {
          if (chip.name) n.assignee = chip.name;
          else delete n.assignee;
        }
        return n;
      }),
    };
  return { board: next, applied: targets.length };
}

/** What a badge on an object removes: its estimate, its assignee or one dot from a pile. */
export type ChipBadge = 'estimate' | 'assignee' | `dot:${string}`;

/** Remove one chip mark from an object (the × on a sticky's badges, or a click on a placed dot). */
export function removeChipMark(board: Board, itemId: string, badge: ChipBadge): Board {
  const item = board.items.find(i => i.id === itemId);
  if (!item) return board;
  if (!editableIds(board, [itemId]).includes(itemId)) throw new Error('That object is locked.');
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== itemId) return i;
      if (badge.startsWith('dot:')) return withDot(i, badge.slice(4), '#000000', -1);
      const n: Item = { ...i };
      delete n[badge as 'estimate' | 'assignee'];
      return n;
    }),
  };
}

/** Return every dot of a pile from unlocked objects ("Return all dots"). */
export function returnAllDots(board: Board, pileId: string): Board {
  const holding = board.items.filter(i => i.dots?.some(d => d.pile === pileId)).map(i => i.id);
  const open = new Set(editableIds(board, holding));
  return {
    ...board,
    items: board.items.map(i => {
      if (!open.has(i.id)) return i;
      const dots = i.dots!.filter(d => d.pile !== pileId);
      const n: Item = { ...i, dots };
      if (!dots.length) delete n.dots;
      return n;
    }),
  };
}

/** Recolour a pile's placed dots when the pile's colour changes. */
export function recolorDots(board: Board, pileId: string, color: string): Board {
  return {
    ...board,
    items: board.items.map(i =>
      i.dots?.some(d => d.pile === pileId && d.color !== color)
        ? { ...i, dots: i.dots.map((d): PlacedDots => (d.pile === pileId ? { ...d, color } : d)) }
        : i,
    ),
  };
}
