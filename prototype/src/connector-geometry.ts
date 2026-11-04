import { endpoints, center, connectorSides, sideVector } from './model.ts';
import type { Item, Point, Board, Side, Bend } from './model.ts';
import { pointInBox, rotatedBounds } from './rotation.ts';
import {
  routeOrthogonal,
  polylineHits,
  orthogonalize,
  polylinePath,
  roundedPath,
  smoothPath,
  smoothSamples,
  halfway,
  bendsToPoints,
  pointsToBends,
  compress,
  cubic,
} from './routing.ts';
import type { Rect } from './routing.ts';

export type ConnectorGeometry = {
  path: string;
  start: Point;
  end: Point;
  mid: Point;
  /** Points that define the visible route (for curves, the points the curve passes through). */
  nodes: Point[];
  /** True when obstacle avoidance found no clear route and the unrouted fallback is shown. */
  blocked: boolean;
  manual: boolean;
  loop: boolean;
  /** Polyline that follows the drawn path (curves are sampled); used for line jumps. */
  samples: Point[];
};
export const DEFAULT_CLEARANCE = 16;
export const canConnect = (item: Item) => !['arrow', 'pen', 'frame', 'swimlane'].includes(item.type);
const routeCache = new Map<string, Point[] | null>();
function cachedRoute(a: Point, na: Point, b: Point, nb: Point, obstacles: Rect[], clearance: number) {
  const key = JSON.stringify([a, na, b, nb, clearance, obstacles]);
  if (routeCache.has(key)) return routeCache.get(key)!;
  const route = routeOrthogonal(a, na, b, nb, obstacles, clearance);
  if (routeCache.size > 600) routeCache.clear();
  routeCache.set(key, route);
  return route;
}
/** Outward direction of an endpoint: its chosen face, the face it sits on, or toward the other end. */
function normal(item: Item | undefined, side: Side | undefined, point: Point, other: Point): Point {
  if (item && side) return sideVector[side];
  if (item) {
    const c = center(item),
      dx = (point.x - c.x) / Math.max(item.w / 2, 1),
      dy = (point.y - c.y) / Math.max(item.h / 2, 1);
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9)
      return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  }
  const dx = other.x - point.x,
    dy = other.y - point.y;
  if (!dx && !dy) return { x: 1, y: 0 };
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}
function loopNodes(a: Point, na: Point, b: Point, nb: Point, box: Item, clearance: number): Point[] {
  const reach = Math.max(28, clearance + 18),
    a2 = { x: a.x + na.x * reach, y: a.y + na.y * reach },
    b2 = { x: b.x + nb.x * reach, y: b.y + nb.y * reach };
  if (na.x === nb.x && na.y === nb.y) return compress([a, a2, b2, b]);
  if (na.x === -nb.x && na.y === -nb.y) {
    if (na.x !== 0) {
      const y = box.y - reach;
      return compress([a, a2, { x: a2.x, y }, { x: b2.x, y }, b2, b]);
    }
    const x = box.x + box.w + reach;
    return compress([a, a2, { x, y: a2.y }, { x, y: b2.y }, b2, b]);
  }
  return compress([a, a2, na.x !== 0 ? { x: a2.x, y: b2.y } : { x: b2.x, y: a2.y }, b2, b]);
}
function obstaclesFor(item: Item, items: Item[], a: Point, b: Point): Rect[] {
  const margin = 900,
    minX = Math.min(a.x, b.x) - margin,
    maxX = Math.max(a.x, b.x) + margin,
    minY = Math.min(a.y, b.y) - margin,
    maxY = Math.max(a.y, b.y) + margin,
    mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const inside = (o: Item, p: Point) =>
    p.x > o.x + 0.5 && p.x < o.x + o.w - 0.5 && p.y > o.y + 0.5 && p.y < o.y + o.h - 0.5;
  return items
    .map(o => (o.rotation ? { ...o, ...rotatedBounds(o, o.rotation), rotation: undefined } : o))
    .filter(
      o =>
        canConnect(o) &&
        o.id !== item.from &&
        o.id !== item.to &&
        o.x < maxX &&
        o.x + o.w > minX &&
        o.y < maxY &&
        o.y + o.h > minY &&
        !inside(o, a) &&
        !inside(o, b),
    )
    .map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, d: Math.hypot(o.x + o.w / 2 - mid.x, o.y + o.h / 2 - mid.y) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, 60)
    .map(({ x, y, w, h }) => ({ x, y, w, h }));
}
export function connectorGeometry(item: Item, items: Item[]): ConnectorGeometry {
  const [a, b] = endpoints(item, items),
    from = items.find(i => i.id === item.from),
    to = items.find(i => i.id === item.to),
    c = item.connector ?? {},
    kind = c.path ?? 'straight',
    clearance = c.clearance ?? DEFAULT_CLEARANCE;
  const [startSide, endSide] = connectorSides(item),
    na = normal(from, startSide, a, b),
    nb = normal(to, endSide, b, a),
    loop = !!from && from.id === to?.id;
  const finish = (nodes: Point[], path: string, extra: Partial<ConnectorGeometry> = {}): ConnectorGeometry => {
    const sample = extra.samples ?? (kind === 'curved' && extra.manual ? smoothSamples(nodes) : nodes);
    return {
      path,
      start: a,
      end: b,
      mid: halfway(sample),
      nodes,
      blocked: false,
      manual: false,
      loop,
      ...extra,
      samples: sample,
    };
  };
  if (c.bends?.length) {
    const nodes = [a, ...bendsToPoints(a, b, c.bends), b];
    if (kind === 'elbow') {
      const ortho = orthogonalize(nodes, na.x !== 0);
      return finish(ortho, polylinePath(ortho), { manual: true });
    }
    return finish(nodes, kind === 'curved' ? smoothPath(nodes) : polylinePath(nodes), { manual: true });
  }
  if (loop) {
    const nodes = loopNodes(a, na, b, nb, from!, clearance);
    return finish(nodes, kind === 'curved' ? roundedPath(nodes, Math.max(24, clearance + 12)) : polylinePath(nodes));
  }
  const directionA = from ? center(from) : a,
    directionB = to ? center(to) : b,
    mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    horizontal = Math.abs(directionB.x - directionA.x) >= Math.abs(directionB.y - directionA.y);
  if (kind === 'straight') return finish([a, b], `M${a.x},${a.y} L${b.x},${b.y}`);
  const sided = !!(startSide && from) || !!(endSide && to);
  let nodes: Point[], path: string;
  if (sided) {
    nodes = routeOrthogonal(a, na, b, nb, [], clearance) ?? [a, b];
    path = kind === 'curved' ? roundedPath(nodes, 40) : polylinePath(nodes);
  } else if (kind === 'elbow') {
    nodes = horizontal
      ? [a, { x: mid.x, y: a.y }, { x: mid.x, y: b.y }, b]
      : [a, { x: a.x, y: mid.y }, { x: b.x, y: mid.y }, b];
    nodes = compress(nodes);
    path = horizontal ? `M${a.x},${a.y} H${mid.x} V${b.y} H${b.x}` : `M${a.x},${a.y} V${mid.y} H${b.x} V${b.y}`;
  } else {
    nodes = [a, b];
    path = horizontal
      ? `M${a.x},${a.y} C${mid.x},${a.y} ${mid.x},${b.y} ${b.x},${b.y}`
      : `M${a.x},${a.y} C${a.x},${mid.y} ${b.x},${mid.y} ${b.x},${b.y}`;
  }
  const visible =
    kind === 'curved' && !sided
      ? Array.from({ length: 33 }, (_, s) =>
          horizontal
            ? cubic(a, { x: mid.x, y: a.y }, { x: mid.x, y: b.y }, b, s / 32)
            : cubic(a, { x: a.x, y: mid.y }, { x: b.x, y: mid.y }, b, s / 32),
        )
      : nodes;
  if (c.avoid === false) return finish(nodes, path, { samples: visible });
  const obstacles = obstaclesFor(item, items, a, b);
  if (!obstacles.length) return finish(nodes, path, { samples: visible });
  if (!polylineHits(visible, obstacles)) return finish(nodes, path, { samples: visible });
  const route = cachedRoute(a, na, b, nb, obstacles, clearance);
  if (!route) return finish(nodes, path, { blocked: true });
  return finish(route, kind === 'curved' ? roundedPath(route, 40) : polylinePath(route));
}

/** Handles offered for editing a connector's shape. */
export type BendHandle = { kind: 'bend' | 'segment'; index: number; at: Point };
export function bendHandles(item: Item, g: ConnectorGeometry): BendHandle[] {
  const kind = item.connector?.path ?? 'straight',
    n = g.nodes,
    handles: BendHandle[] = [];
  if (kind !== 'elbow' && g.manual)
    for (let i = 1; i < n.length - 1; i++) handles.push({ kind: 'bend', index: i, at: n[i] });
  for (let i = 0; i < n.length - 1; i++) {
    const p = n[i],
      q = n[i + 1];
    if (Math.hypot(q.x - p.x, q.y - p.y) < 16) continue;
    handles.push({ kind: 'segment', index: i, at: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } });
  }
  return handles;
}
function withBends(board: Board, id: string, bends: Bend[] | undefined): Board {
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id) return i;
      const connector = { ...i.connector };
      if (bends?.length) connector.bends = bends.slice(0, 20);
      else delete connector.bends;
      return { ...i, connector };
    }),
  };
}
/**
 * Apply a bend-handle drag. Elbow segments move perpendicular to themselves (end segments split so
 * attachments stay put); straight and curved connectors move or insert pass-through points.
 */
export function dragBend(
  board: Board,
  id: string,
  handle: { kind: 'bend' | 'segment'; index: number },
  point: Point,
): Board {
  const item = board.items.find(i => i.id === id);
  if (!item || item.type !== 'arrow' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return board;
  const g = connectorGeometry(item, board.items),
    n = g.nodes.map(p => ({ ...p })),
    kind = item.connector?.path ?? 'straight';
  let nodes: Point[];
  if (kind === 'elbow') {
    const i = Math.min(handle.index, n.length - 2),
      p = n[i],
      q = n[i + 1],
      horizontal = Math.abs(p.y - q.y) <= Math.abs(p.x - q.x),
      d = horizontal ? { x: 0, y: point.y - p.y } : { x: point.x - p.x, y: 0 },
      add = (r: Point) => ({ x: r.x + d.x, y: r.y + d.y });
    const last = n.length - 1;
    if (i > 0 && i + 1 < last) nodes = [...n.slice(0, i), add(p), add(q), ...n.slice(i + 2)];
    else if (i === 0 && last === 1) {
      const m1 = { x: p.x + (q.x - p.x) / 3, y: p.y + (q.y - p.y) / 3 },
        m2 = { x: p.x + ((q.x - p.x) * 2) / 3, y: p.y + ((q.y - p.y) * 2) / 3 };
      nodes = [p, m1, add(m1), add(m2), m2, q];
    } else if (i === 0) {
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      nodes = [p, m, add(m), add(q), ...n.slice(2)];
    } else {
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      nodes = [...n.slice(0, i), add(p), add(m), m, q];
    }
    nodes = compress(nodes);
  } else if (handle.kind === 'bend' && handle.index > 0 && handle.index < n.length - 1) {
    nodes = n;
    nodes[handle.index] = point;
  } else nodes = [...n.slice(0, handle.index + 1), point, ...n.slice(handle.index + 1)];
  return withBends(board, id, pointsToBends(g.start, g.end, nodes.slice(1, -1)));
}
/** Keyboard alternative: place bend `index` (1-based among interior points) at an exact position. */
export function setBendPoint(board: Board, id: string, index: number, point: Point): Board {
  const item = board.items.find(i => i.id === id);
  if (!item?.connector?.bends || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return board;
  const [a, b] = endpoints(item, board.items),
    points = bendsToPoints(a, b, item.connector.bends);
  if (index < 0 || index >= points.length) return board;
  points[index] = point;
  return withBends(board, id, pointsToBends(a, b, points));
}
/** Add a bend halfway along the longest leg of the current route (keeps the visible shape). */
export function addBend(board: Board, id: string): Board {
  const item = board.items.find(i => i.id === id);
  if (!item || item.type !== 'arrow') return board;
  const g = connectorGeometry(item, board.items),
    n = g.nodes;
  if ((item.connector?.bends?.length ?? 0) >= 20) return board;
  let best = 0;
  for (let i = 1; i < n.length - 1; i++)
    if (
      Math.hypot(n[i + 1].x - n[i].x, n[i + 1].y - n[i].y) >
      Math.hypot(n[best + 1].x - n[best].x, n[best + 1].y - n[best].y)
    )
      best = i;
  const inserted = [
    ...n.slice(0, best + 1),
    { x: (n[best].x + n[best + 1].x) / 2, y: (n[best].y + n[best + 1].y) / 2 },
    ...n.slice(best + 1),
  ];
  return withBends(board, id, pointsToBends(g.start, g.end, inserted.slice(1, -1)));
}
export function removeBend(board: Board, id: string, index: number): Board {
  const item = board.items.find(i => i.id === id);
  if (!item?.connector?.bends) return board;
  return withBends(
    board,
    id,
    item.connector.bends.filter((_, i) => i !== index),
  );
}
export const resetBends = (board: Board, id: string) => withBends(board, id, undefined);
export function moveConnectorEndpoint(
  board: Board,
  id: string,
  end: 'start' | 'end',
  point: Point,
  tolerance = 0,
  attach = true,
): Board {
  const item = board.items.find(i => i.id === id);
  if (!item || item.type !== 'arrow') return board;
  const [a, b] = endpoints(item, board.items);
  const target = attach
    ? [...board.items].reverse().find(i => canConnect(i) && pointInBox(i, point, tolerance))
    : undefined;
  const start = end === 'start' ? point : a,
    finish = end === 'end' ? point : b;
  return {
    ...board,
    items: board.items.map(i =>
      i.id === id
        ? {
            ...i,
            x: start.x,
            y: start.y,
            w: finish.x - start.x,
            h: finish.y - start.y,
            from: end === 'start' ? target?.id : i.from,
            to: end === 'end' ? target?.id : i.to,
          }
        : i,
    ),
  };
}
export function setConnectorConnections(
  board: Board,
  id: string,
  startId: string,
  endId: string,
  text: string,
  sides?: { start?: Side; end?: Side },
): Board {
  const item = board.items.find(i => i.id === id);
  if (!item || item.type !== 'arrow') throw new Error('Select a connector first.');
  if (text.length > 200) throw new Error('Use a label up to 200 characters.');
  for (const targetId of [startId, endId])
    if (targetId && !board.items.some(i => i.id === targetId && canConnect(i)))
      throw new Error('Choose an existing object or Free endpoint.');
  const loop = !!startId && startId === endId;
  const [a, b] = endpoints(item, board.items),
    from = board.items.find(i => i.id === startId),
    to = board.items.find(i => i.id === endId),
    start = from ? { x: from.x + from.w / 2, y: from.y + from.h / 2 } : a,
    end = to ? { x: to.x + to.w / 2, y: to.y + to.h / 2 } : b;
  const connector = { ...item.connector };
  if (sides) {
    if (sides.start) connector.startSide = sides.start;
    else delete connector.startSide;
    if (sides.end) connector.endSide = sides.end;
    else delete connector.endSide;
  }
  if (loop && !sides) {
    connector.startSide ??= 'right';
    connector.endSide ??= 'top';
  }
  const next: Item = {
    ...item,
    text,
    from: startId || undefined,
    to: endId || undefined,
    x: start.x,
    y: start.y,
    w: end.x - start.x,
    h: end.y - start.y,
  };
  if (Object.keys(connector).length) next.connector = connector;
  else delete next.connector;
  return { ...board, items: board.items.map(i => (i.id === id ? next : i)) };
}
