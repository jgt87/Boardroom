// Sticky note sets (track L): small pre-coloured groups of sticky notes for retros and brainstorms, offered
// in the sticky note tool options and placed at the centre of the view as one group (one undo step). Pure.
import type { Board, Item, Point } from './model.ts';
import { groupSelection } from './arrange.ts';

export type StickySet = { id: string; label: string; notes: { text: string; fill: string }[]; columns: number };
export const stickySets: StickySet[] = [
  {
    id: 'retro',
    label: 'Retro',
    columns: 3,
    notes: [
      { text: 'Went well', fill: '#a9e8bb' },
      { text: 'To improve', fill: '#ffa0a7' },
      { text: 'Actions', fill: '#a8cdff' },
    ],
  },
  {
    id: 'start-stop',
    label: 'Start, stop, continue',
    columns: 3,
    notes: [
      { text: 'Start', fill: '#a9e8bb' },
      { text: 'Stop', fill: '#ffa0a7' },
      { text: 'Continue', fill: '#fff49b' },
    ],
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    columns: 3,
    notes: [
      { text: 'Idea', fill: '#fff49b' },
      { text: 'Idea', fill: '#ffe36e' },
      { text: 'Idea', fill: '#ffb879' },
      { text: 'Idea', fill: '#8ce3eb' },
      { text: 'Idea', fill: '#d3b7f6' },
      { text: 'Idea', fill: '#d1ec9c' },
    ],
  },
  {
    id: 'swot',
    label: 'SWOT',
    columns: 2,
    notes: [
      { text: 'Strengths', fill: '#a9e8bb' },
      { text: 'Weaknesses', fill: '#ffa0a7' },
      { text: 'Opportunities', fill: '#a8cdff' },
      { text: 'Threats', fill: '#ffb879' },
    ],
  },
];

const GAP = 20;
export type MakeNote = (x: number, y: number, fill: string) => Item;
/** The notes of a set laid out in a grid centred on `center`. */
export function stickySetItems(set: StickySet, center: Point, make: MakeNote): Item[] {
  const sample = make(0, 0, set.notes[0].fill),
    rows = Math.ceil(set.notes.length / set.columns),
    width = set.columns * sample.w + (set.columns - 1) * GAP,
    height = rows * sample.h + (rows - 1) * GAP,
    left = center.x - width / 2,
    top = center.y - height / 2;
  return set.notes.map((n, k) => ({
    ...make(left + (k % set.columns) * (sample.w + GAP), top + Math.floor(k / set.columns) * (sample.h + GAP), n.fill),
    text: n.text,
  }));
}
/** Add a set to the board as one group; returns the new board and the ids of the added notes. */
export function addStickySet(
  board: Board,
  setId: string,
  center: Point,
  make: MakeNote,
): { board: Board; ids: string[] } | null {
  const set = stickySets.find(s => s.id === setId);
  if (!set) return null;
  const items = stickySetItems(set, center, make),
    ids = items.map(i => i.id);
  return { board: groupSelection({ ...board, items: [...board.items, ...items] }, ids).board, ids };
}
