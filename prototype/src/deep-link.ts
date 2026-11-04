// Deep links to a board, an object on it, or an object opened in its focus editor. Pure.
// Links use the URL fragment (`#board=…&object=…&focus=1`), so they never reach a server. Boards live on this
// device, so a link opens only in the browser that holds the board.
import type { Board, Item } from './model.ts';

export type DeepLink = { board?: string; object?: string; focus?: boolean };
const ID = /^[A-Za-z0-9_-]{1,100}$/;

/** Read a deep link from a location hash; null when the hash holds no valid link. */
export function parseDeepLink(hash: string): DeepLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  // Object and frame links (`item=` / `frame=`) belong to use-deep-links.tsx; leave them alone.
  if (params.has('item') || params.has('frame')) return null;
  const board = params.get('board') ?? undefined,
    object = params.get('object') ?? undefined;
  if ((board !== undefined && !ID.test(board)) || (object !== undefined && !ID.test(object))) return null;
  if (!board && !object) return null;
  const link: DeepLink = {};
  if (board) link.board = board;
  if (object) {
    link.object = object;
    if (params.get('focus') === '1') link.focus = true;
  }
  return link;
}

/** The hash for a deep link (with the leading "#"). */
export function deepLinkHash(link: DeepLink): string {
  const params = new URLSearchParams();
  if (link.board) params.set('board', link.board);
  if (link.object) params.set('object', link.object);
  if (link.object && link.focus) params.set('focus', '1');
  return `#${params.toString()}`;
}

export const singleFormats = [
  { kind: 'kanban', label: 'Kanban board' },
  { kind: 'table', label: 'Table board' },
  { kind: 'timeline', label: 'Timeline board' },
  { kind: 'doc', label: 'Doc board' },
] as const;
export type SingleFormat = (typeof singleFormats)[number]['kind'];
/**
 * A new board holding one large format object (a records view with a starter record, or a Doc), for
 * "create a single-format board" on the dashboard. Returns the board and the object's id.
 */
export function singleFormatBoard(
  kind: SingleFormat,
  base: Board,
  make: (kind: SingleFormat, x: number, y: number) => Item,
): { board: Board; id: string } {
  const label = singleFormats.find(f => f.kind === kind)!.label.replace(' board', '');
  const item: Item = { ...make(kind, 0, 0), w: 960, h: 600, text: label };
  const board: Board = { ...base, title: label, items: [item] };
  if (kind !== 'doc') {
    item.datasetId = crypto.randomUUID();
    board.datasets = {
      [item.datasetId]: [
        { id: crypto.randomUUID(), title: 'First task', status: 'Not started', assignee: '', start: '', end: '' },
      ],
    };
  }
  return { board, id: item.id };
}

/** A full link for the current page: origin and path without any existing hash or query. */
export function deepLinkUrl(href: string, link: DeepLink): string {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  return url.toString().replace(/#$/, '') + deepLinkHash(link);
}
