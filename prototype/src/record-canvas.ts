// Canvas-to-record conversion and shared canvas-card identity.
import type { Board, Item, RecordRow } from './model.ts';
import type { CardData } from './facilitation-widgets.ts';
import { recordsError } from './records.ts';
import { schemaOf } from './record-schema.ts';

export type RecordDrop = { targetId: string; status?: RecordRow['status']; beforeId?: string };
export function canCopyToRecords(board: Board, ids: string[], drop: RecordDrop): boolean {
  const target = board.items.find(i => i.id === drop.targetId);
  const rows = board.datasets?.[target?.datasetId ?? ''];
  if (
    !target ||
    target.locked ||
    ids.includes(target.id) ||
    !['table', 'kanban', 'timeline'].includes(target.type) ||
    !rows
  )
    return false;
  const sources = board.items.filter(i => ids.includes(i.id));
  return (
    sources.length > 0 &&
    rows.length + sources.length <= 1000 &&
    sources.every(
      i =>
        !i.locked &&
        ['note', 'card'].includes(i.type) &&
        i.text.length <= 6000 &&
        !(i.recordRef?.datasetId === target.datasetId),
    )
  );
}

/** A drop copies content, retaining the source object, position and attached connectors. */
export function copyToRecords(
  board: Board,
  ids: string[],
  drop: RecordDrop,
  makeId: () => string = () => crypto.randomUUID(),
): Board {
  if (!canCopyToRecords(board, ids, drop)) return board;
  const target = board.items.find(i => i.id === drop.targetId)!;
  const rows = board.datasets![target.datasetId!];
  const schema = schemaOf(board, target.datasetId!);
  const group = schema.fields.find(f => f.id === target.recordGroup && f.type === 'select');
  const added: RecordRow[] = board.items
    .filter(i => ids.includes(i.id))
    .map(i => {
      const card = i.type === 'card' ? (i.data as CardData) : undefined;
      return {
        id: makeId(),
        title: i.text,
        status:
          !group && drop.status && schema.statuses.includes(drop.status)
            ? drop.status
            : card?.status && schema.statuses.includes(card.status)
              ? card.status
              : schema.statuses[0],
        ...(group && drop.status && group.options?.includes(drop.status)
          ? { values: { [group.id]: drop.status } }
          : {}),
        assignee: card?.assignee ?? '',
        start: '',
        end: card?.due ?? '',
        ...(card?.description ? { description: card.description } : {}),
        ...(card?.points !== undefined ? { points: card.points } : {}),
        ...(i.tags ? { tags: [...i.tags] } : {}),
        ...(i.link ? { link: i.link } : {}),
      };
    });
  const index = drop.beforeId ? rows.findIndex(r => r.id === drop.beforeId) : -1;
  const at = index < 0 ? rows.length : index;
  return {
    ...board,
    datasets: { ...board.datasets, [target.datasetId!]: [...rows.slice(0, at), ...added, ...rows.slice(at)] },
  };
}

/** Hit-test actual scrolled cells instead of assuming column geometry. */
export function recordDropAt(elements: Element[]): RecordDrop | null {
  for (const el of elements) {
    const body = el.closest<HTMLElement>('[data-record-format]');
    if (!body) continue;
    const status = el.closest<HTMLElement>('[data-record-status]')?.dataset.recordStatus;
    const row = el.closest<HTMLElement>('[data-record], [data-card]');
    return {
      targetId: body.dataset.recordFormat!,
      ...(status ? { status } : {}),
      beforeId: row?.dataset.record ?? row?.dataset.card,
    };
  }
  return null;
}

export function syncedCard(board: Board, datasetId: string, recordId: string, item: Item): Item | null {
  const r = board.datasets?.[datasetId]?.find(r => r.id === recordId);
  return r
    ? {
        ...item,
        recordRef: { datasetId, recordId },
        text: r.title,
        tags: r.tags,
        link: r.link,
        data: {
          ...item.data,
          description: r.description ?? '',
          assignee: r.assignee,
          status: r.status,
          due: r.end || (r.milestone ? r.start : ''),
          points: r.points,
        },
      }
    : null;
}

/** Record changes win simultaneous edits. Deleted records leave blank bound cards;
 * deleting a card never deletes its record. Whole-board undo restores both together. */
export function syncRecordCards(input: Board, previous: Board): Board {
  let datasets = input.datasets;
  for (const i of input.items) {
    if (i.type !== 'card' || !i.recordRef || i.locked) continue;
    const { datasetId, recordId } = i.recordRef;
    const r = datasets?.[datasetId]?.find(r => r.id === recordId);
    const oldRow = previous.datasets?.[datasetId]?.find(r => r.id === recordId);
    const old = previous.items.find(n => n.id === i.id);
    if (!r || !oldRow || !old || JSON.stringify(r) !== JSON.stringify(oldRow)) continue;
    const fields = (n: Item) => JSON.stringify([n.text, n.data, n.tags, n.link]);
    if (fields(i) === fields(old)) continue;
    const d = i.data as CardData;
    const next = {
      ...r,
      title: i.text,
      description: d.description,
      assignee: d.assignee,
      status: d.status,
      ...(r.milestone ? { start: d.due, end: '' } : { end: d.due }),
      points: d.points,
      tags: i.tags,
      link: i.link,
    };
    const rows = datasets![datasetId].map(row => (row.id === recordId ? next : row));
    if (recordsError(rows) || !schemaOf(input, datasetId).statuses.includes(next.status)) continue;
    datasets = { ...datasets, [datasetId]: rows };
  }
  let changed = datasets !== input.datasets;
  const items = input.items.map(i => {
    if (i.type !== 'card' || !i.recordRef) return i;
    const r = datasets?.[i.recordRef.datasetId]?.find(r => r.id === i.recordRef!.recordId);
    const next = r
      ? syncedCard({ ...input, datasets }, i.recordRef.datasetId, r.id, i)!
      : {
          ...i,
          text: '',
          tags: undefined,
          link: undefined,
          data: { description: '', assignee: '', due: '', status: 'Not started' },
        };
    if (
      JSON.stringify([next.text, next.data, next.tags, next.link]) === JSON.stringify([i.text, i.data, i.tags, i.link])
    )
      return i;
    changed = true;
    return next;
  });
  return changed ? { ...input, datasets, items } : input;
}
