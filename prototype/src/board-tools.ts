// Board-level tools for items 24–26 and 41–50 (pure; no React).
// Evidence: catalogue "Sticky stack"; ComputeCurveWidget smoothing/eraser layers; DOT_VOTING,
// BOARD_TIMER, PRIVATE_MODE, COMMENT/ADD_COMMENT; FrameWidget setContentHidden/hyperlinkService;
// NavigatSidebar; ComputeLineWidget LINE_JUMP/relativePosition; BoardExport PDF/PNG/JPG/CSV.
import type { Board, Item, Point, StrokePoint, RecordRow, CommentThread, VotingResult } from './model.ts';
import { isShapeKind } from './shapes.ts';
import { starterItems, starterNames } from './starter-templates.ts';
import type { StarterName } from './starter-templates.ts';

const uid = () => crypto.randomUUID();

// ---- 24 Sticky stack ---------------------------------------------------------------------------
/** Next note of a stack: directly below the previous one, same size and colour. */
export function stackNext(
  board: Board,
  previousId: string | null,
  at: Point,
  fill: string,
  make: (x: number, y: number, fill: string) => Item,
): { board: Board; note: Item } {
  const prev = previousId ? board.items.find(i => i.id === previousId && i.type === 'note') : undefined;
  const note = prev
    ? { ...make(prev.x, prev.y + prev.h + 24, prev.fill), w: prev.w, h: prev.h }
    : (() => {
        const n = make(at.x, at.y, fill);
        return { ...n, x: at.x - n.w / 2, y: at.y - n.h / 2 };
      })();
  return { board: { ...board, items: [...board.items, note] }, note };
}

// ---- 25 Freehand drawing -----------------------------------------------------------------------
export type PenStyle = 'pen' | 'marker' | 'highlighter';
export const penPresets: Record<PenStyle, { width: number; opacity: number }> = {
  pen: { width: 3, opacity: 1 },
  marker: { width: 8, opacity: 1 },
  highlighter: { width: 18, opacity: 0.35 },
};
function perpendicular(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy);
  return len ? Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len : Math.hypot(p.x - a.x, p.y - a.y);
}
/** Pressure change that keeps a point even on a straight run (a stroke pressed harder in the middle). */
export const PRESSURE_TOLERANCE = 0.08;
/** How far a point's pen pressure strays from the straight blend between `a` and `b` (0 without pressure). */
function pressureGap(p: StrokePoint, a: StrokePoint, b: StrokePoint) {
  if (p.p === undefined || a.p === undefined || b.p === undefined) return 0;
  const span = Math.hypot(b.x - a.x, b.y - a.y),
    t = span ? Math.min(1, Math.max(0, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / span ** 2)) : 0.5;
  return Math.abs(p.p - (a.p + (b.p - a.p) * t));
}
/**
 * Ramer–Douglas–Peucker simplification (iterative, safe for 20,000 points). Points are kept or dropped
 * whole, so pen pressure stays with its point; a pressure swing also keeps a point (track R2-K).
 */
export function simplify<T extends StrokePoint>(points: T[], tolerance = 0.8): T[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let index = -1,
      max = tolerance;
    for (let i = s + 1; i < e; i++) {
      const gap = pressureGap(points[i], points[s], points[e]),
        d = Math.max(perpendicular(points[i], points[s], points[e]), gap > PRESSURE_TOLERANCE ? tolerance + gap : 0);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index > 0) {
      keep[index] = 1;
      stack.push([s, index], [index, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
/** Smooth SVG path through stroke points using quadratic curves between midpoints. */
export function strokePath(points: Point[]): string {
  if (!points.length) return '';
  if (points.length < 3) return `M${points.map(p => `${p.x},${p.y}`).join(' L')}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      n = points[i + 1];
    d += ` Q${p.x},${p.y} ${(p.x + n.x) / 2},${(p.y + n.y) / 2}`;
  }
  const last = points.at(-1)!;
  return `${d} L${last.x},${last.y}`;
}
// Pen pressure (`p`) travels with each point through every step below, so it stays aligned with the points.
const absPoints = (i: Item): StrokePoint[] => (i.points ?? []).map(p => ({ ...p, x: i.x + p.x, y: i.y + p.y }));
/** Normalise a stroke to its bounding box (stores original size so resizing scales points). */
export function strokeFromPoints(base: Item, points: StrokePoint[]): Item {
  const minX = Math.min(...points.map(p => p.x)),
    minY = Math.min(...points.map(p => p.y)),
    w = Math.max(1, Math.max(...points.map(p => p.x)) - minX),
    h = Math.max(1, Math.max(...points.map(p => p.y)) - minY);
  return { ...base, x: minX, y: minY, w, h, points: points.map(p => ({ ...p, x: p.x - minX, y: p.y - minY })) };
}
/** Insert points so no segment is longer than `step` (lets the eraser hit long straight segments). */
function densify(points: StrokePoint[], step: number): StrokePoint[] {
  const out: StrokePoint[] = [];
  points.forEach((p, k) => {
    if (k) {
      const a = points[k - 1],
        n = Math.min(400, Math.floor(Math.hypot(p.x - a.x, p.y - a.y) / step));
      for (let j = 1; j < n; j++) {
        const q: StrokePoint = { x: a.x + ((p.x - a.x) * j) / n, y: a.y + ((p.y - a.y) * j) / n };
        if (a.p !== undefined && p.p !== undefined) q.p = Math.round((a.p + ((p.p - a.p) * j) / n) * 1000) / 1000;
        out.push(q);
      }
    }
    out.push(p);
  });
  return out;
}
/** Erase: whole strokes touched by the eraser, or (precise) only the touched points, splitting strokes. */
export function eraseAt(board: Board, at: Point, radius: number, precise: boolean): Board {
  let changed = false;
  const items = board.items.flatMap(i => {
    if (
      i.type !== 'pen' ||
      i.locked ||
      i.hidden ||
      at.x < i.x - radius ||
      at.x > i.x + i.w + radius ||
      at.y < i.y - radius ||
      at.y > i.y + i.h + radius
    )
      return [i];
    const pts = densify(absPoints(i), Math.max(0.5, radius / 2)),
      hit = pts.map(p => Math.hypot(p.x - at.x, p.y - at.y) <= radius);
    if (!hit.some(Boolean)) return [i];
    changed = true;
    if (!precise) return [];
    const pieces: StrokePoint[][] = [];
    let current: StrokePoint[] = [];
    pts.forEach((p, k) => {
      if (hit[k]) {
        if (current.length > 1) pieces.push(current);
        current = [];
      } else current.push(p);
    });
    if (current.length > 1) pieces.push(current);
    return pieces.map((piece, k) => strokeFromPoints({ ...i, id: k === 0 ? i.id : uid() }, simplify(piece, 0.3)));
  });
  return changed ? { ...board, items } : board;
}

/** Erase along the pointer path between two samples, so fast drags do not skip strokes. */
export function eraseAlong(board: Board, from: Point, to: Point, radius: number, precise: boolean): Board {
  const steps = Math.min(
    200,
    Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(0.5, radius / 2))),
  );
  let next = board;
  for (let k = 0; k <= steps; k++)
    next = eraseAt(
      next,
      { x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps },
      radius,
      precise,
    );
  return next;
}

// ---- 26 Text links -------------------------------------------------------------------------------
export function urlsIn(text: string): string[] {
  return [...new Set((text.match(/\bhttps?:\/\/[^\s<>"')\]]+/gi) ?? []).map(u => u.replace(/[.,;:!?]+$/, '')))].slice(
    0,
    20,
  );
}

// ---- 41 Dot voting ---------------------------------------------------------------------------------
/** Options (gap G5): `minutes` ends the session automatically; `onePerObject` caps each object at one vote. */
export type VotingOptions = { minutes?: number; onePerObject?: boolean };
export function startVoting(
  board: Board,
  targets: string[],
  budget: number,
  options: VotingOptions = {},
  now = Date.now(),
): Board {
  const ids = targets.filter(id => board.items.some(i => i.id === id && i.type !== 'arrow'));
  if (!ids.length) throw new Error('Select objects to vote on, or vote on the whole board.');
  if (!Number.isInteger(budget) || budget < 1 || budget > 100) throw new Error('Choose between 1 and 100 votes.');
  const { minutes, onePerObject } = options;
  if (minutes !== undefined && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240))
    throw new Error('Choose a voting time between 1 and 240 minutes.');
  const voting: NonNullable<Board['voting']> = {
    active: true,
    budget,
    targets: ids,
    votes: {},
    startedAt: new Date(now).toISOString(),
  };
  if (minutes) voting.endsAt = new Date(now + minutes * 60000).toISOString();
  if (onePerObject) voting.onePerObject = true;
  return { ...board, voting };
}
export const votesUsed = (board: Board) => Object.values(board.voting?.votes ?? {}).reduce((s, v) => s + v, 0);
export function castVote(board: Board, id: string, delta: 1 | -1, now = Date.now()): Board {
  const v = board.voting;
  if (!v?.active) throw new Error('No voting session is running.');
  if (v.endsAt && Date.parse(v.endsAt) <= now) throw new Error('Voting time is over.');
  if (!v.targets.includes(id)) throw new Error('This object is not part of the vote.');
  const current = v.votes[id] ?? 0;
  if (delta > 0 && v.onePerObject && current >= 1) throw new Error('Only one vote per object in this session.');
  if (delta > 0 && votesUsed(board) >= v.budget)
    throw new Error(`All ${v.budget} votes are used. Remove a vote to move it.`);
  if (delta < 0 && current === 0) return board;
  const votes = { ...v.votes, [id]: current + delta };
  if (!votes[id]) delete votes[id];
  return { ...board, voting: { ...v, votes } };
}
export function endVoting(board: Board, label: (item: Item) => string): { board: Board; result: VotingResult } {
  const v = board.voting;
  if (!v) throw new Error('No voting session is running.');
  const totals = v.targets
    .map(id => {
      const item = board.items.find(i => i.id === id);
      return { id, label: item ? label(item) : 'Deleted object', votes: v.votes[id] ?? 0 };
    })
    .sort((a, b) => b.votes - a.votes || a.label.localeCompare(b.label));
  const result: VotingResult = { endedAt: new Date().toISOString(), budget: v.budget, totals };
  const next = { ...board, votingResults: [...(board.votingResults ?? []), result].slice(-50) };
  delete next.voting;
  return { board: next, result };
}

// ---- 42 Timer ---------------------------------------------------------------------------------------
export type TimerState = { duration: number; endsAt: number | null; remaining: number };
export const timerRemaining = (t: TimerState, now: number) =>
  t.endsAt === null ? t.remaining : Math.max(0, t.endsAt - now);
export const formatClock = (ms: number) => {
  const s = Math.ceil(ms / 1000),
    m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---- 45 Private mode ------------------------------------------------------------------------------
const inside = (f: Item, i: Item) => i.x >= f.x && i.y >= f.y && i.x + i.w <= f.x + f.w && i.y + i.h <= f.y + f.h;
export function privateIds(board: Board): Set<string> {
  const p = board.privateMode;
  if (!p) return new Set();
  const frames = board.items.filter(f => f.type === 'frame' && p.frames.includes(f.id));
  return new Set(
    board.items.filter(i => i.type === 'note' && (p.all || frames.some(f => inside(f, i)))).map(i => i.id),
  );
}
export function setPrivate(board: Board, scope: 'all' | string, hidden: boolean): Board {
  const p = { all: board.privateMode?.all ?? false, frames: [...(board.privateMode?.frames ?? [])] };
  if (scope === 'all') p.all = hidden;
  else p.frames = hidden ? [...new Set([...p.frames, scope])] : p.frames.filter(f => f !== scope);
  const next = { ...board };
  if (p.all || p.frames.length) next.privateMode = p;
  else delete next.privateMode;
  return next;
}

// ---- 46 Comments ---------------------------------------------------------------------------------
/** Thread position: object-anchored threads store an offset from the object's top-left corner. */
export function threadPoint(board: Board, t: CommentThread): Point {
  const item = t.itemId ? board.items.find(i => i.id === t.itemId) : undefined;
  return item ? { x: item.x + t.x, y: item.y + t.y } : { x: t.x, y: t.y };
}
/**
 * The next (or, with `back`, previous) open comment thread after `currentId`, wrapping around (decision R1-Q1:
 * Alt+Down / Alt+Up). Pinned threads come first, then reading order (top to bottom, left to right); resolved
 * threads are skipped. Returns the thread with its 1-based position, or null when there are no open threads.
 */
export function stepThread(
  board: Board,
  currentId: string | undefined,
  back = false,
): { thread: CommentThread; index: number; count: number } | null {
  const open = (board.comments ?? [])
    .filter(t => !t.resolved)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.y - b.y || a.x - b.x);
  if (!open.length) return null;
  const at = open.findIndex(t => t.id === currentId);
  const index = at < 0 ? (back ? open.length - 1 : 0) : (at + (back ? -1 : 1) + open.length) % open.length;
  return { thread: open[index], index: index + 1, count: open.length };
}
export function addThread(board: Board, at: Point, text: string, item?: Item): { board: Board; thread: CommentThread } {
  const body = text.trim();
  if (!body) throw new Error('Write a comment first.');
  if (body.length > 2000) throw new Error('Comments are limited to 2,000 characters.');
  const thread: CommentThread = {
    id: uid(),
    x: item ? at.x - item.x : at.x,
    y: item ? at.y - item.y : at.y,
    messages: [{ id: uid(), text: body, at: new Date().toISOString() }],
  };
  if (item) thread.itemId = item.id;
  return { board: { ...board, comments: [...(board.comments ?? []), thread] }, thread };
}
const mapThread = (board: Board, id: string, fn: (t: CommentThread) => CommentThread | null): Board => {
  const comments = (board.comments ?? []).map(t => (t.id === id ? fn(t) : t)).filter(Boolean) as CommentThread[];
  const next = { ...board };
  if (comments.length) next.comments = comments;
  else delete next.comments;
  return next;
};
export function replyThread(board: Board, id: string, text: string): Board {
  const body = text.trim();
  if (!body) throw new Error('Write a reply first.');
  if (body.length > 2000) throw new Error('Comments are limited to 2,000 characters.');
  return mapThread(board, id, t => ({
    ...t,
    messages: [...t.messages, { id: uid(), text: body, at: new Date().toISOString() }].slice(-200),
  }));
}
export const setResolved = (board: Board, id: string, resolved: boolean) =>
  mapThread(board, id, t => {
    const n = { ...t };
    if (resolved) n.resolved = true;
    else delete n.resolved;
    return n;
  });
export const deleteThread = (board: Board, id: string) => mapThread(board, id, () => null);
/** When objects are deleted, keep their comments in place as free threads. Returns the kept thread ids. */
export function detachComments(before: Board, after: Board): { board: Board; kept: string[] } {
  const alive = new Set(after.items.map(i => i.id)),
    kept: string[] = [];
  if (!after.comments?.length) return { board: after, kept };
  const comments = after.comments.map(t => {
    if (!t.itemId || alive.has(t.itemId)) return t;
    kept.push(t.id);
    const p = threadPoint(before, t),
      n = { ...t, x: p.x, y: p.y };
    delete n.itemId;
    return n;
  });
  return { board: { ...after, comments }, kept };
}

// ---- 47 Links and hidden frame content -------------------------------------------------------------
export function setLinkTo(board: Board, id: string, target: string | undefined): Board {
  if (target && (target === id || !board.items.some(i => i.id === target)))
    throw new Error('Choose another existing object to link to.');
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id) return i;
      const n = { ...i };
      if (target) n.linkTo = target;
      else delete n.linkTo;
      return n;
    }),
  };
}
export const frameContentHidden = (frame: Item) => frame.type === 'frame' && !!frame.data?.contentHidden;
export function setFrameContentHidden(board: Board, id: string, hidden: boolean): Board {
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id || i.type !== 'frame') return i;
      const data = { ...i.data };
      if (hidden) data.contentHidden = true;
      else delete data.contentHidden;
      const n: Item = { ...i, data };
      if (!Object.keys(data).length) delete n.data;
      return n;
    }),
  };
}
/** Ids covered by hidden frames (fully contained, not the frame itself). */
export function coveredIds(board: Board): Set<string> {
  const frames = board.items.filter(frameContentHidden);
  if (!frames.length) return new Set();
  return new Set(
    board.items.filter(i => i.type !== 'frame' && i.type !== 'arrow' && frames.some(f => inside(f, i))).map(i => i.id),
  );
}

// ---- 48 Layers ----------------------------------------------------------------------------------
/** Move an object to a new stacking position (index in board order, 0 = back). */
export function reorderLayer(board: Board, id: string, toIndex: number): Board {
  const from = board.items.findIndex(i => i.id === id);
  if (from < 0) return board;
  const items = board.items.slice(),
    [item] = items.splice(from, 1),
    to = Math.max(0, Math.min(items.length, toIndex));
  if (to === from) return board;
  items.splice(to, 0, item);
  return { ...board, items };
}
export function setHidden(board: Board, ids: string[], hidden: boolean): Board {
  return {
    ...board,
    items: board.items.map(i => {
      if (!ids.includes(i.id)) return i;
      const n = { ...i };
      if (hidden) n.hidden = true;
      else delete n.hidden;
      return n;
    }),
  };
}
export function renameItem(board: Board, id: string, name: string): Board {
  const clean = name.trim().slice(0, 200);
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id) return i;
      const n = { ...i };
      if (clean) n.name = clean;
      else delete n.name;
      return n;
    }),
  };
}
export const layerLabel = (i: Item) =>
  i.name || i.text.trim().replace(/\s+/g, ' ').slice(0, 60) || `Untitled ${i.type}`;
/** Layers grouped by the frame that contains them (frames first, then loose objects), front-most first. */
export function layerGroups(board: Board): { frame: Item | null; items: Item[] }[] {
  const frames = board.items.filter(i => i.type === 'frame'),
    groups = new Map<string, Item[]>(frames.map(f => [f.id, []])),
    loose: Item[] = [];
  for (const i of [...board.items].reverse()) {
    if (i.type === 'frame') continue;
    const f = frames.find(fr => inside(fr, i));
    (f ? groups.get(f.id)! : loose).push(i);
  }
  return [
    ...frames
      .slice()
      .reverse()
      .map(f => ({ frame: f, items: groups.get(f.id)! })),
    { frame: null, items: loose },
  ];
}

// ---- 49 Line jumps and caption position -----------------------------------------------------------
function segmentCross(a: Point, b: Point, c: Point, d: Point): { t: number; p: Point } | null {
  const r = { x: b.x - a.x, y: b.y - a.y },
    s = { x: d.x - c.x, y: d.y - c.y },
    den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den,
    u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? { t, p: { x: a.x + r.x * t, y: a.y + r.y * t } } : null;
}
/** Crossing points per connector against every EARLIER connector (later ones jump). */
export function lineJumps(
  routes: { id: string; nodes: Point[] }[],
): Map<string, { segment: number; t: number; p: Point }[]> {
  const out = new Map<string, { segment: number; t: number; p: Point }[]>();
  routes.forEach((route, k) => {
    const hits: { segment: number; t: number; p: Point }[] = [];
    for (let s = 1; s < route.nodes.length; s++)
      for (let j = 0; j < k; j++) {
        const other = routes[j].nodes;
        for (let o = 1; o < other.length; o++) {
          const x = segmentCross(route.nodes[s - 1], route.nodes[s], other[o - 1], other[o]);
          if (x) hits.push({ segment: s - 1, ...x });
        }
      }
    if (hits.length)
      out.set(
        route.id,
        hits.sort((a, b) => a.segment - b.segment || a.t - b.t),
      );
  });
  return out;
}
/** Polyline path with small semicircular hops at the given crossings. */
export function jumpPath(nodes: Point[], hops: { segment: number; t: number; p: Point }[], radius = 6): string {
  let d = `M${nodes[0].x},${nodes[0].y}`;
  for (let s = 1; s < nodes.length; s++) {
    const a = nodes[s - 1],
      b = nodes[s],
      len = Math.hypot(b.x - a.x, b.y - a.y) || 1,
      ux = (b.x - a.x) / len,
      uy = (b.y - a.y) / len;
    let lastT = 0;
    for (const h of hops.filter(x => x.segment === s - 1)) {
      const r = Math.min(radius, ((h.t - lastT) * len) / 2, ((1 - h.t) * len) / 2);
      if (r < 1.5) continue;
      d += ` L${h.p.x - ux * r},${h.p.y - uy * r} A${r},${r} 0 0 1 ${h.p.x + ux * r},${h.p.y + uy * r}`;
      lastT = h.t;
    }
    d += ` L${b.x},${b.y}`;
  }
  return d;
}
export function pointAlong(nodes: Point[], t: number): Point {
  const lens = nodes.slice(1).map((p, i) => Math.hypot(p.x - nodes[i].x, p.y - nodes[i].y)),
    total = lens.reduce((s, l) => s + l, 0);
  let rest = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (rest <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, rest / lens[i]) : 0;
      return { x: nodes[i].x + (nodes[i + 1].x - nodes[i].x) * f, y: nodes[i].y + (nodes[i + 1].y - nodes[i].y) * f };
    }
    rest -= lens[i];
  }
  return nodes[0];
}
/** Fraction along the polyline nearest to p. */
export function nearestAlong(nodes: Point[], p: Point): number {
  const lens = nodes.slice(1).map((q, i) => Math.hypot(q.x - nodes[i].x, q.y - nodes[i].y)),
    total = lens.reduce((s, l) => s + l, 0) || 1;
  let best = { d: Infinity, at: 0 },
    acc = 0;
  for (let i = 0; i < lens.length; i++) {
    const a = nodes[i],
      b = nodes[i + 1],
      l2 = lens[i] ** 2,
      f = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2)) : 0,
      q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
      d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.d) best = { d, at: (acc + lens[i] * f) / total };
    acc += lens[i];
  }
  return Math.round(best.at * 1000) / 1000;
}

// ---- 50 CSV, accessibility, templates --------------------------------------------------------------
const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@\t]/.test(s)
    ? `"${(/^[=+\-@\t]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`
    : s;
};
/** CSV of a record dataset; leading formula characters are neutralised. */
export function recordsCsv(rows: RecordRow[]): string {
  const title = new Map(rows.map(r => [r.id, r.title]));
  const head = ['Title', 'Status', 'Assignee', 'Start', 'End', 'Milestone', 'Points', 'Depends on', 'Tags', 'Link'];
  return (
    [
      head,
      ...rows.map(r => [
        r.title,
        r.status,
        r.assignee,
        r.start,
        r.end,
        r.milestone ? 'yes' : '',
        r.points ?? '',
        (r.dependsOn ?? []).map(d => title.get(d) ?? d).join('; '),
        (r.tags ?? []).join('; '),
        r.link ?? '',
      ]),
    ]
      .map(row => row.map(csvCell).join(','))
      .join('\r\n') + '\r\n'
  );
}
const luminance = (hex: string) => {
  const c = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrastRatio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Text colour for objects without their own text colour: dark, or white on dark fills. */
export const readableTextOn = (fill: string | undefined, dark = '#22232b') =>
  fill &&
  /^#[0-9a-f]{6}$/i.test(fill) &&
  contrastRatio(fill, dark) < 4.5 &&
  contrastRatio(fill, '#ffffff') > contrastRatio(fill, dark)
    ? '#ffffff'
    : dark;
export type A11yIssue = {
  id: string;
  kind: 'contrast' | 'alt' | 'small-text' | 'empty';
  message: string;
  /** Errors block reading the content (no description, text contrast below 3:1); warnings make it harder. */
  severity: 'error' | 'warning';
};
/** Local accessibility review: text contrast, missing descriptions on media, tiny text. */
export function checkAccessibility(board: Board): A11yIssue[] {
  const issues: A11yIssue[] = [];
  for (const i of board.items) {
    if (i.hidden) continue;
    const label = i.name || i.text.trim().slice(0, 40) || `Untitled ${i.type}`;
    if (['image', 'video', 'pdf', 'icon', 'qr'].includes(i.type) && !(i.alt ?? '').trim())
      issues.push({ id: i.id, kind: 'alt', severity: 'error', message: `${label}: add a text description.` });
    const textOn = i.type === 'note' || isShapeKind(i.type);
    if (textOn && i.text.trim() && /^#[0-9a-f]{6}$/i.test(i.fill)) {
      // Compare with the text colour the renderer actually uses (white on dark fills).
      const r = contrastRatio(readableTextOn(i.fill), i.fill);
      if (r < 4.5)
        issues.push({
          id: i.id,
          kind: 'contrast',
          severity: r < 3 ? 'error' : 'warning',
          message: `${label}: text contrast ${r.toFixed(1)}:1 is below 4.5:1.`,
        });
    }
    if (i.type === 'text' && i.format?.background) {
      const r = contrastRatio(i.fill, i.format.background);
      if (r < 4.5)
        issues.push({
          id: i.id,
          kind: 'contrast',
          severity: r < 3 ? 'error' : 'warning',
          message: `${label}: text contrast ${r.toFixed(1)}:1 is below 4.5:1.`,
        });
    }
    if (typeof i.format?.fontSize === 'number' && i.format.fontSize < 12 && i.text.trim())
      issues.push({
        id: i.id,
        kind: 'small-text',
        severity: 'warning',
        message: `${label}: ${i.format.fontSize} px text may be hard to read.`,
      });
    // Non-text contrast (gap F7): lines, pen strokes and shape borders need 3:1 against the board background.
    const bg = /^#[0-9a-f]{6}$/i.test(board.background ?? '') ? board.background! : '#ffffff';
    const stroke =
      i.type === 'arrow' || i.type === 'pen'
        ? i.fill
        : isShapeKind(i.type) && i.style?.borderWidth && i.style.borderColor && contrastRatio(i.fill, bg) < 3
          ? i.style.borderColor
          : undefined;
    if (stroke && /^#[0-9a-f]{6}$/i.test(stroke) && contrastRatio(stroke, bg) < 3)
      issues.push({
        id: i.id,
        kind: 'contrast',
        severity: 'warning',
        message: `${label}: ${i.type === 'arrow' ? 'line' : i.type === 'pen' ? 'drawing' : 'outline'} contrast ${contrastRatio(stroke, bg).toFixed(1)}:1 against the board is below 3:1.`,
      });
    // Containers need a title so they can be found and announced (gap F7).
    if (['frame', 'table', 'kanban', 'timeline'].includes(i.type) && !i.text.trim() && !(i.name ?? '').trim())
      issues.push({ id: i.id, kind: 'empty', severity: 'warning', message: `Untitled ${i.type}: add a title.` });
  }
  return issues;
}
export type TemplateName = 'Retrospective' | 'SWOT' | 'Weekly plan' | 'Flowchart' | StarterName;
/** Gallery templates: the original four, then the starter templates (gap list I5). */
export const templateNames: TemplateName[] = ['Retrospective', 'SWOT', 'Weekly plan', 'Flowchart', ...starterNames];
/** Starter content for the template gallery, laid out from `at`. `make` is createItem. */
export function templateItems(
  name: TemplateName,
  at: Point,
  make: (type: Item['type'], x: number, y: number, fill?: string) => Item,
): Item[] {
  if ((starterNames as string[]).includes(name)) return starterItems(name as StarterName, at, make);
  const t = (s: string, x: number, y: number, w = 300) => ({
    ...make('text', at.x + x, at.y + y),
    text: s,
    w,
    format: { bold: true, fontSize: 28 },
  });
  const n = (s: string, x: number, y: number, fill: string) => ({
    ...make('note', at.x + x, at.y + y, fill),
    text: s,
    w: 160,
    h: 160,
  });
  const f = (s: string, x: number, y: number, w: number, h: number) => ({
    ...make('frame', at.x + x, at.y + y),
    text: s,
    w,
    h,
  });
  if (name === 'Retrospective')
    return [
      f('Went well', 0, 0, 380, 480),
      f('To improve', 420, 0, 380, 480),
      f('Actions', 840, 0, 380, 480),
      n('Add a note', 30, 60, '#a9e8bb'),
      n('Add a note', 450, 60, '#ffb879'),
      n('Add a note', 870, 60, '#a8cdff'),
    ];
  if (name === 'SWOT')
    return [
      f('Strengths', 0, 0, 420, 320),
      f('Weaknesses', 440, 0, 420, 320),
      f('Opportunities', 0, 340, 420, 320),
      f('Threats', 440, 340, 420, 320),
    ];
  if (name === 'Weekly plan')
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].flatMap((d, k) => [
      t(d, k * 220, 0, 200),
      n('Plan', k * 220 + 10, 60, '#fff49b'),
    ]);
  const a = { ...make('terminator', at.x, at.y), text: 'Start' },
    b = { ...make('rectangle', at.x + 320, at.y - 20), text: 'Do the work' },
    c = { ...make('diamond', at.x + 640, at.y - 45), text: 'Done?' },
    e = { ...make('terminator', at.x + 940, at.y), text: 'End' };
  const link = (x: Item, y: Item) => ({ ...make('arrow', 0, 0), from: x.id, to: y.id });
  return [
    a,
    b,
    c,
    e,
    link(a, b),
    link(b, c),
    { ...link(c, e), text: 'Yes' },
    {
      ...link(c, b),
      text: 'No',
      connector: { path: 'elbow' as const, startSide: 'bottom' as const, endSide: 'bottom' as const },
    },
  ];
}
