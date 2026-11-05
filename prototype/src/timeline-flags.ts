// Timeline flags shared per dataset (P2-Q6). Free flags used to be stored on each Timeline object
// (`item.recordView.timeline.flags`); they now live on the dataset's schema (`RecordSchema.timelineFlags`), so
// every Timeline view of one dataset shows and edits the same flags. Older boards are migrated when they load
// (`migrateTimelineFlags`, called by parseBoard); a Timeline object that still carries its own flags (for
// example pasted from an older copy) shows them merged with the dataset's, and the first flag edit moves them.
// Pure.
import type { Board } from './model.ts';
import { schemaOf } from './record-schema.ts';
import type { RecordSchema } from './record-schema.ts';
import { TIMELINE_FLAG_STORE_LIMIT, validateTimelineFlags } from './timeline-axis.ts';
import type { TimelineFlag } from './timeline-axis.ts';

const flagKey = (f: TimelineFlag) => `${f.date}\u0000${f.label}\u0000${f.color.toLowerCase()}`;

/**
 * Merge flag lists in order without losing any: a flag equal to one already kept (same date, label and colour)
 * is dropped, and a different flag whose id is taken gets a new id. At most TIMELINE_FLAG_STORE_LIMIT are kept.
 */
export function mergeTimelineFlags(lists: (TimelineFlag[] | undefined)[]): TimelineFlag[] {
  const out: TimelineFlag[] = [],
    keys = new Set<string>(),
    ids = new Set<string>();
  for (const list of lists)
    for (const flag of list ?? []) {
      if (out.length >= TIMELINE_FLAG_STORE_LIMIT) return out;
      const key = flagKey(flag);
      if (keys.has(key)) continue;
      let id = flag.id;
      for (let n = 2; ids.has(id); n++) id = `${flag.id.slice(0, 90)}-${n}`;
      keys.add(key);
      ids.add(id);
      out.push({ ...flag, id });
    }
  return out;
}

const legacyFlags = (board: Board, datasetId: string) =>
  board.items
    // Any record object: a Table or Kanban may have been a Timeline when the flags were added.
    .filter(i => i.datasetId === datasetId && i.recordView?.timeline?.flags?.length)
    .map(i => i.recordView!.timeline!.flags);

/** The flags every Timeline view of a dataset shows: the dataset's own, plus any still stored on an object. */
export function datasetTimelineFlags(board: Board, datasetId: string): TimelineFlag[] {
  return mergeTimelineFlags([schemaOf(board, datasetId).timelineFlags, ...legacyFlags(board, datasetId)]);
}

/**
 * Store a dataset's flags (one undo step for the caller). The list is kept on the dataset's schema (created from
 * the default columns when the dataset has none) and any flags still stored on its Timeline objects are removed,
 * since they are part of `flags` (see `datasetTimelineFlags`). An empty list drops the field.
 */
export function setDatasetTimelineFlags(board: Board, datasetId: string, flags: TimelineFlag[]): Board {
  if (!board.datasets || !Object.hasOwn(board.datasets, datasetId)) throw new Error('That dataset no longer exists.');
  validateTimelineFlags(flags, TIMELINE_FLAG_STORE_LIMIT);
  const schema: RecordSchema = { ...schemaOf(board, datasetId) };
  if (flags.length) schema.timelineFlags = flags.map(f => ({ ...f }));
  else delete schema.timelineFlags;
  const hadSchema = !!board.recordSchemas && Object.hasOwn(board.recordSchemas, datasetId);
  const next: Board = {
    ...board,
    items: board.items.map(i => {
      if (i.datasetId !== datasetId || !i.recordView?.timeline?.flags) return i;
      const timeline = { ...i.recordView.timeline };
      delete timeline.flags;
      const recordView: NonNullable<typeof i.recordView> = { ...i.recordView, timeline };
      if (!Object.keys(timeline).length) delete recordView.timeline;
      return { ...i, recordView };
    }),
  };
  // A dataset without a schema keeps having none when it gets no flags.
  if (hadSchema || flags.length) next.recordSchemas = { ...board.recordSchemas, [datasetId]: schema };
  return next;
}

/**
 * Move flags stored on Timeline objects to their datasets, merging the flags of several Timelines of one dataset.
 * Returns the same board when nothing is stored on an object, so boards without old flags load unchanged.
 */
export function migrateTimelineFlags(board: Board): Board {
  const ids = new Set(
    board.items
      .filter(i => i.datasetId && i.recordView?.timeline?.flags !== undefined)
      .map(i => i.datasetId as string)
      .filter(id => board.datasets && Object.hasOwn(board.datasets, id)),
  );
  let next = board;
  for (const id of ids) next = setDatasetTimelineFlags(next, id, datasetTimelineFlags(next, id));
  return next;
}
