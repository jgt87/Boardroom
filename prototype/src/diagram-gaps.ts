// Diagramming helpers (gap list E1, E2, E4, E5). Pure: no React, no DOM.
// E1 quick-connect: create a connected copy of a shape, note or text on one of its sides.
// E2 insert a shape on a connector (the connector is split in two at its midpoint).
// E4 extra connector labels positioned along the path.
// E5 45-degree steps while drawing a line with Shift held.
import type { Board, ConnectorFormat, ConnectorLabel, Item, Kind, Point, Side } from './model.ts';
import { createItem, clone } from './model.ts';
import { isShapeKind } from './shapes.ts';
import { connectorGeometry } from './connector-geometry.ts';
import { SELECT_GAP } from './interactions.ts';

export const MAX_CONNECTOR_LABELS = 10;

/** Snap a drag vector to the nearest multiple of 45 degrees, keeping its length. */
export function snap45(dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy);
  if (!len) return { x: 0, y: 0 };
  const step = Math.PI / 4,
    angle = Math.round(Math.atan2(dy, dx) / step) * step,
    round = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
  return { x: round(Math.cos(angle) * len), y: round(Math.sin(angle) * len) };
}

const patchConnector = (board: Board, id: string, change: (c: ConnectorFormat) => ConnectorFormat): Board => {
  const item = board.items.find(i => i.id === id);
  if (!item || item.type !== 'arrow' || item.locked) return board;
  return {
    ...board,
    items: board.items.map(i => (i.id === id ? { ...i, connector: change({ ...i.connector }) } : i)),
  };
};
const tidyLabels = (c: ConnectorFormat, labels: ConnectorLabel[]): ConnectorFormat => {
  const next = { ...c };
  if (labels.length) next.labels = labels;
  else delete next.labels;
  return next;
};
const clampAt = (at: number) => (Number.isFinite(at) ? Math.round(Math.max(0, Math.min(1, at)) * 1000) / 1000 : 0.5);

/** Add an extra label at fraction `at` along the connector (one undo step). Locked connectors are unchanged. */
export function addConnectorLabel(board: Board, id: string, text = 'Label', at = 0.25): Board {
  return patchConnector(board, id, c => {
    const labels = c.labels ?? [];
    if (labels.length >= MAX_CONNECTOR_LABELS) throw new Error('A connector holds up to 10 extra labels.');
    return tidyLabels(c, [...labels, { id: crypto.randomUUID(), text: text.slice(0, 200), at: clampAt(at) }]);
  });
}
export function updateConnectorLabel(
  board: Board,
  id: string,
  labelId: string,
  patch: Partial<Pick<ConnectorLabel, 'text' | 'at'>>,
): Board {
  return patchConnector(board, id, c =>
    tidyLabels(
      c,
      (c.labels ?? []).map(l =>
        l.id === labelId
          ? {
              ...l,
              ...(patch.text !== undefined ? { text: patch.text.slice(0, 200) } : {}),
              ...(patch.at !== undefined ? { at: clampAt(patch.at) } : {}),
            }
          : l,
      ),
    ),
  );
}
export function removeConnectorLabel(board: Board, id: string, labelId: string): Board {
  return patchConnector(board, id, c =>
    tidyLabels(
      c,
      (c.labels ?? []).filter(l => l.id !== labelId),
    ),
  );
}

/** Objects that get "+" quick-connect handles. */
export const canQuickConnect = (item: Item) => ['note', 'text', 'card'].includes(item.type) || isShapeKind(item.type);

const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
export const QUICK_GAP = 80;

/**
 * Create an empty copy of `sourceId` on `side` (same type, size, colour and formatting) joined by a
 * connector. The copy moves sideways until it does not overlap other objects.
 */
export function addConnectedCopy(
  board: Board,
  sourceId: string,
  side: Side = 'right',
): { board: Board; item: Item; connector: Item } {
  const source = board.items.find(i => i.id === sourceId);
  if (!source || !canQuickConnect(source))
    throw new Error('Select a shape, sticky note or text to add a connected copy.');
  if (board.items.length > 1998) throw new Error('Make room for two objects before adding a connected copy.');
  const x =
      side === 'right' ? source.x + source.w + QUICK_GAP : side === 'left' ? source.x - QUICK_GAP - source.w : source.x,
    y =
      side === 'bottom' ? source.y + source.h + QUICK_GAP : side === 'top' ? source.y - QUICK_GAP - source.h : source.y;
  const base = createItem(source.type as Kind, x, y, source.fill);
  const item: Item = {
    ...base,
    w: source.w,
    h: source.h,
    fill: source.fill,
    text: '',
    ...(source.format ? { format: clone(source.format) } : {}),
    ...(source.style ? { style: clone(source.style) } : {}),
  };
  const occupied = board.items.filter(i => !['frame', 'arrow'].includes(i.type) && !i.hidden);
  const horizontal = side === 'left' || side === 'right';
  for (
    let attempt = 0;
    attempt < 500 &&
    occupied.some(
      i =>
        item.x < i.x + i.w + 16 && item.x + item.w + 16 > i.x && item.y < i.y + i.h + 16 && item.y + item.h + 16 > i.y,
    );
    attempt++
  ) {
    if (horizontal) item.y += item.h + 40;
    else item.x += item.w + 40;
  }
  const connector: Item = {
    ...createItem('arrow', 0, 0),
    from: source.id,
    to: item.id,
    connector: { startSide: side, endSide: opposite[side] },
  };
  return { board: { ...board, items: [...board.items, connector, item] }, item, connector };
}

/**
 * Split connector `id` at its midpoint and put a new shape there: the first half keeps the original id,
 * start, caption and labels; the second half runs from the shape to the original end. One undo step.
 */
export function insertShapeOnConnector(
  board: Board,
  id: string,
  kind: Kind = 'rectangle',
): { board: Board; shape: Item; second: Item } {
  const c = board.items.find(i => i.id === id);
  if (!c || c.type !== 'arrow') throw new Error('Select a connector to insert a shape.');
  if (c.locked) throw new Error('Unlock the connector to insert a shape.');
  if (board.items.length > 1998) throw new Error('Make room for two objects before inserting a shape.');
  const mid = connectorGeometry(c, board.items).mid,
    created = createItem(kind, 0, 0, '#ffffff');
  const shape: Item = { ...created, x: mid.x - created.w / 2, y: mid.y - created.h / 2, text: '' };
  const format = { ...c.connector };
  delete format.bends;
  delete format.labelAt;
  const first: Item = { ...c, to: shape.id, connector: { ...format } };
  delete first.connector!.endSide;
  if (!c.from) Object.assign(first, { w: mid.x - c.x, h: mid.y - c.y });
  const secondFormat: ConnectorFormat = { ...format };
  delete secondFormat.labels;
  delete secondFormat.startHead;
  delete secondFormat.startSide;
  const second: Item = {
    ...createItem('arrow', mid.x, mid.y),
    fill: c.fill,
    x: mid.x,
    y: mid.y,
    w: c.x + c.w - mid.x,
    h: c.y + c.h - mid.y,
    from: shape.id,
    ...(c.to ? { to: c.to } : {}),
    connector: secondFormat,
  };
  if (c.opacity !== undefined) second.opacity = c.opacity;
  if (c.group) second.group = c.group;
  const index = board.items.findIndex(i => i.id === id),
    items = [...board.items];
  items.splice(index, 1, first, second);
  items.push(shape);
  return { board: { ...board, items }, shape, second };
}

/** Screen-pixel distance of the "+" quick-connect buttons outside the selection outline (past the connection dot). */
export const QUICK_CONNECT_GAP = 44;
/** World position of the "+" button on `side` of bounds `b` at zoom `z`. */
export function quickConnectPoint(b: { x: number; y: number; w: number; h: number }, side: Side, z: number): Point {
  const g = (SELECT_GAP + QUICK_CONNECT_GAP) / z;
  return side === 'top'
    ? { x: b.x + b.w / 2, y: b.y - g }
    : side === 'bottom'
      ? { x: b.x + b.w / 2, y: b.y + b.h + g }
      : side === 'left'
        ? { x: b.x - g, y: b.y + b.h / 2 }
        : { x: b.x + b.w + g, y: b.y + b.h / 2 };
}
