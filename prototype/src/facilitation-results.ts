// Facilitation results on the board (track R1-E): a poll or a voting session becomes a Table (dataset)
// placed beside the poll or the voted area. Pure: reuses the CSV import path that builds Table records.
import type { Board, Item, VotingResult } from './model.ts';
import { selectionBounds, type Bounds } from './interactions.ts';
import { tableFromImport } from './record-import.ts';
import { builtInColumns } from './record-schema.ts';
import { pollResults, type PollData } from './facilitation-widgets.ts';

/** Gap between the source (poll or voted area) and the new table. */
export const RESULTS_GAP = 80;

/**
 * A new Table built from `table` (header row first) with its top-left corner just right of `box`.
 * Returns the next board (one undo step for the caller) and the new Table item.
 *
 * Results use a minimal schema (open question P1-Q8): the Table shows only the first column (the title) and the
 * result columns. Status, assignee and date columns are hidden, so rows do not all read "Not started"; the user
 * can show them again from the Table's fields panel.
 */
export function tableBeside(
  board: Board,
  box: Bounds,
  table: string[][],
  title: string,
  makeId?: () => string,
): { board: Board; item: Item } {
  const made = tableFromImport(board, table, title, { x: 0, y: 0 }, makeId),
    datasetId = made.item.datasetId!,
    schema = made.board.recordSchemas![datasetId]!,
    item: Item = {
      ...made.item,
      x: Math.round(box.x + box.w + RESULTS_GAP),
      y: Math.round(box.y),
      w: Math.max(480, (2 + schema.fields.length) * 160),
    };
  return {
    board: {
      ...made.board,
      items: made.board.items.map(i => (i.id === item.id ? item : i)),
      recordSchemas: { ...made.board.recordSchemas, [datasetId]: { ...schema, hiddenBuiltIns: [...builtInColumns] } },
    },
    item,
  };
}

/** Poll options and counts as a table: option, votes and share in whole percent. */
export const pollTable = (d: PollData): string[][] => [
  ['Option', 'Votes', 'Share (%)'],
  ...pollResults(d).map(o => [o.label, String(o.votes), String(Math.round(o.share * 100))]),
];

/** Export a poll to a Table placed to its right. */
export function pollToTable(board: Board, pollId: string, makeId?: () => string): { board: Board; item: Item } {
  const poll = board.items.find(i => i.id === pollId && i.type === 'poll');
  if (!poll) throw new Error('That poll no longer exists.');
  const d = poll.data as PollData;
  return tableBeside(board, poll, pollTable(d), d.question.trim() || 'Poll results', makeId);
}

/** A voting result as a ranked table: item, votes and rank (ties share a rank). */
export function votingTable(result: VotingResult): string[][] {
  let rank = 0,
    last = -1;
  return [
    ['Item', 'Votes', 'Rank'],
    ...result.totals.map((t, k) => {
      if (t.votes !== last) {
        rank = k + 1;
        last = t.votes;
      }
      return [t.label, String(t.votes), String(rank)];
    }),
  ];
}

/** The box around the objects of a voting result that are still on the board, or null when none are. */
export const votedArea = (board: Board, result: VotingResult): Bounds | null =>
  selectionBounds(
    board.items,
    result.totals.map(t => t.id),
  );

/** Title of the table for a stored voting result. */
export const votingResultTitle = (result: VotingResult) =>
  result.name || `Voting results · ${result.endedAt.slice(0, 10)}`;

/**
 * Put a stored voting result on the board as a ranked Table beside the voted objects. When none of them are left,
 * the table goes beside `fallback` (for example a point in the middle of the view).
 */
export function votingResultToTable(
  board: Board,
  index: number,
  fallback: Bounds,
  makeId?: () => string,
): { board: Board; item: Item } {
  const result = board.votingResults?.[index];
  if (!result) throw new Error('That result no longer exists.');
  if (!result.totals.length) throw new Error('This result has no voted objects.');
  return tableBeside(
    board,
    votedArea(board, result) ?? fallback,
    votingTable(result),
    votingResultTitle(result),
    makeId,
  );
}
