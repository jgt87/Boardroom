// Board search, minimap geometry and presentation ordering (pure helpers).
// Evidence: a fuzzy-search/match-scoring chunk, FrameWidget jump-to-viewport identifiers and six
// presentation-related modules in the 205-file audit.
import type { Board, Item, Kind, Point } from './model.ts';
import { itemBounds } from './interactions.ts';
import { isShapeKind } from './shapes.ts';
import { widgetSearchText } from './widget-specs.ts';
import type { Bounds } from './interactions.ts';

export type Camera = { x: number; y: number; z: number };
export type SearchField = 'text' | 'label' | 'tag' | 'topic';
export type SearchResult = {
  id: string;
  type: Kind;
  field: SearchField;
  snippet: string;
  /** Match quality: 600 exact phrase, 500 word prefix, 400 in-word, 300 all terms, 200 subsequence, 100 typo. */
  score: number;
  /** Highlight ranges [start, end) within `snippet`. */
  ranges: [number, number][];
};

export const SCORE = { exact: 600, prefix: 500, substring: 400, terms: 300, subsequence: 200, typo: 100 } as const;
/** Results below this score were found by approximate matching (subsequence or typo tolerance). */
export const isFuzzy = (r: Pick<SearchResult, 'score'>) => r.score < SCORE.terms;

/** Lowercase and strip diacritics. */
export const normalizeSearch = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

const wordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);

type Prepared = { flat: string; norm: string; map: number[]; words: [number, number][] };
/** Collapse whitespace, normalise, and keep a map from normalised offsets to original (flattened) offsets. */
function prepare(text: string): Prepared {
  const flat = text.replace(/\s+/g, ' ');
  // ASCII needs no decomposition or offset remapping. Most board labels take this
  // path, avoiding a Unicode normalization call and regex for every character.
  if (/^[\x20-\x7E]*$/.test(flat)) {
    const norm = flat.toLowerCase();
    const words: [number, number][] = [];
    for (const match of norm.matchAll(/[a-z0-9_]+/g)) words.push([match.index, match.index + match[0].length]);
    return { flat, norm, map: Array.from({ length: flat.length + 1 }, (_, i) => i), words };
  }
  let norm = '';
  const map: number[] = [];
  let at = 0;
  for (const ch of flat) {
    const n = normalizeSearch(ch);
    for (let k = 0; k < n.length; k++) map.push(at);
    norm += n;
    at += ch.length;
  }
  map.push(flat.length);
  const words: [number, number][] = [];
  for (let i = 0; i < norm.length;) {
    if (!wordChar(norm[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < norm.length && wordChar(norm[j])) j++;
    words.push([i, j]);
    i = j;
  }
  return { flat, norm, map, words };
}

/** Damerau-Levenshtein (optimal string alignment) distance; returns max + 1 as soon as it exceeds `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      row.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    rows.push(row);
  }
  return rows[a.length][b.length];
}

const allowedTypos = (term: string) => (term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0);

/** Best match of a normalised query against one field: a score and ranges in normalised offsets. */
function matchField(p: Prepared, q: string, terms: string[]): { score: number; ranges: [number, number][] } | null {
  const { norm } = p;
  // Exact phrase, word prefix or in-word substring of the whole query.
  let best: { score: number; ranges: [number, number][] } | null = null;
  for (let at = norm.indexOf(q); at >= 0; at = norm.indexOf(q, at + 1)) {
    const end = at + q.length,
      startsWord = !wordChar(norm[at - 1]) || !wordChar(q[0]),
      endsWord = !wordChar(norm[end]) || !wordChar(q[q.length - 1]);
    const score = startsWord && endsWord ? SCORE.exact : startsWord ? SCORE.prefix : SCORE.substring;
    if (!best || score > best.score) best = { score, ranges: [[at, end]] };
    if (score === SCORE.exact) break;
  }
  if (best) return best;
  // Every term present, in any order.
  if (terms.length > 1) {
    const ranges: [number, number][] = [];
    for (const t of terms) {
      const at = norm.indexOf(t);
      if (at < 0) break;
      ranges.push([at, at + t.length]);
    }
    if (ranges.length === terms.length) return { score: SCORE.terms, ranges };
  }
  // Characters in order and reasonably close together.
  const chars = q.replace(/ /g, '');
  if (chars.length >= 3) {
    for (let from = norm.indexOf(chars[0]); from >= 0; from = norm.indexOf(chars[0], from + 1)) {
      const positions = [from];
      for (let k = 1, at = from; k < chars.length; k++) {
        at = norm.indexOf(chars[k], at + 1);
        if (at < 0) break;
        positions.push(at);
      }
      if (positions.length !== chars.length) break;
      if (positions[positions.length - 1] - from + 1 > Math.max(chars.length * 2, chars.length + 4)) continue;
      const ranges: [number, number][] = [];
      for (const pos of positions) {
        const last = ranges[ranges.length - 1];
        if (last && last[1] === pos) last[1] = pos + 1;
        else ranges.push([pos, pos + 1]);
      }
      return { score: SCORE.subsequence, ranges };
    }
  }
  // Typo tolerance per term; short terms must still appear exactly.
  const ranges: [number, number][] = [];
  for (const t of terms) {
    const max = allowedTypos(t);
    let found: [number, number] | null = null;
    if (!max) {
      const at = norm.indexOf(t);
      if (at >= 0) found = [at, at + t.length];
    } else
      for (const [ws, we] of p.words) {
        const word = norm.slice(ws, we),
          candidates = [word, word.slice(0, t.length), word.slice(0, t.length + 1)];
        if (candidates.some(c => c.length >= t.length - max && editDistance(c, t, max) <= max)) {
          found = [ws, we];
          break;
        }
      }
    if (!found) return null;
    ranges.push(found);
  }
  return ranges.length ? { score: SCORE.typo, ranges } : null;
}

/** Cut a snippet window around the first match and shift the ranges into it. */
function toSnippet(p: Prepared, ranges: [number, number][], prefix = ''): Pick<SearchResult, 'snippet' | 'ranges'> {
  const orig = ranges
    .map(([s, e]) => [p.map[s], p.map[e] ?? p.flat.length] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const first = orig[0] ?? [0, 0],
    start = Math.max(0, first[0] - 28),
    end = Math.min(p.flat.length, first[1] + 40),
    lead = (start ? '…' : '') + prefix,
    snippet = lead + p.flat.slice(start, end) + (end < p.flat.length ? '…' : '');
  const shifted = orig
    .filter(([s, e]) => e > start && s < end)
    .map(
      ([s, e]) =>
        [Math.max(s, start) - start + lead.length, Math.min(e, end) - start + lead.length] as [number, number],
    );
  return { snippet, ranges: shifted };
}

/**
 * Ranked, typo-tolerant search of object text, connector labels, tags, mind-map topics and widget
 * text. Case and diacritics are ignored; equal scores keep board order.
 */
export function searchBoard(
  board: Board,
  query: string,
  limit = 500,
  exclude: Set<string> = new Set(),
): SearchResult[] {
  const q = normalizeSearch(query.trim()).replace(/\s+/g, ' ');
  if (!q) return [];
  const terms = [...new Set(q.split(' ').filter(Boolean))];
  const found: SearchResult[] = [];
  for (const i of board.items) {
    if (exclude.has(i.id) || i.hidden) continue;
    const fields: { field: SearchField; text: string; prefix?: string }[] = [
      { field: i.type === 'arrow' ? 'label' : 'text', text: i.text },
      ...(i.tags ?? []).map(t => ({ field: 'tag' as const, text: t, prefix: '#' })),
      ...(i.nodes ?? []).map(n => ({ field: 'topic' as const, text: n.text })),
      ...(i.connector?.labels ?? []).map(l => ({ field: 'label' as const, text: l.text })),
    ];
    const extra = widgetSearchText(i);
    if (extra) fields.push({ field: 'text', text: extra });
    let best: SearchResult | null = null;
    for (const f of fields) {
      if (!f.text) continue;
      const p = prepare(f.text),
        m = matchField(p, q, terms);
      if (m && (!best || m.score > best.score))
        best = { id: i.id, type: i.type, field: f.field, score: m.score, ...toSnippet(p, m.ranges, f.prefix) };
      if (best?.score === SCORE.exact) break;
    }
    if (best) found.push(best);
  }
  // Array.prototype.sort is stable, so equal scores keep board order.
  return found.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** World rectangle currently visible on screen. */
export const viewportRect = (camera: Camera, size: { w: number; h: number }): Bounds => ({
  x: -camera.x / camera.z,
  y: -camera.y / camera.z,
  w: size.w / camera.z,
  h: size.h / camera.z,
});
/** Extent the minimap shows: every object plus the viewport, with padding. */
export function minimapExtent(items: Item[], viewport: Bounds): Bounds {
  const boxes = [...items.map(i => itemBounds(i, items)), viewport].filter(b =>
    [b.x, b.y, b.w, b.h].every(Number.isFinite),
  );
  const x = Math.min(...boxes.map(b => b.x)),
    y = Math.min(...boxes.map(b => b.y)),
    r = Math.max(...boxes.map(b => b.x + b.w)),
    bt = Math.max(...boxes.map(b => b.y + b.h));
  const pad = Math.max(r - x, bt - y) * 0.06 + 20;
  return { x: x - pad, y: y - pad, w: r - x + pad * 2, h: bt - y + pad * 2 };
}
/** Uniform scale + offset that fits `extent` into a width × height panel. */
export function minimapScale(extent: Bounds, width: number, height: number) {
  const scale = Math.min(width / Math.max(extent.w, 1), height / Math.max(extent.h, 1));
  return {
    scale,
    ox: (width - extent.w * scale) / 2 - extent.x * scale,
    oy: (height - extent.h * scale) / 2 - extent.y * scale,
  };
}
/** Camera that centres the viewport on a world point at the current zoom. */
export const centerOn = (p: Point, camera: Camera, size: { w: number; h: number }): Camera => ({
  z: camera.z,
  x: size.w / 2 - p.x * camera.z,
  y: size.h / 2 - p.y * camera.z,
});

/** Frames in presentation order. Stored order first (missing ids skipped), then unlisted frames. */
export function presentationFrames(board: Board): Item[] {
  const frames = board.items.filter(i => i.type === 'frame'),
    byId = new Map(frames.map(f => [f.id, f]));
  const listed = (board.presentation ?? []).map(id => byId.get(id)).filter(Boolean) as Item[];
  return [...listed, ...frames.filter(f => !listed.includes(f))];
}
/** Presenter notes stored on a frame (gap G1). */
export const frameNotes = (frame: Item): string => (typeof frame.data?.notes === 'string' ? frame.data.notes : '');
/** Frame hidden from the presentation (gap G2): it stays in the order but is skipped when presenting. */
export const isHiddenSlide = (frame: Item): boolean => frame.type === 'frame' && !!frame.data?.skipInPresentation;
/** Frames shown when presenting: the presentation order without hidden frames. */
export const slideFrames = (board: Board): Item[] => presentationFrames(board).filter(f => !isHiddenSlide(f));
/** Set or clear (undefined, '' or false) keys of a frame's `data`; an empty `data` is removed. Locked frames refuse. */
export function setFrameData(board: Board, id: string, patch: Record<string, unknown>): Board {
  const frame = board.items.find(i => i.id === id);
  if (!frame || frame.type !== 'frame') throw new Error('Select a frame first.');
  if (frame.locked) throw new Error('Unlock the frame first.');
  const data: Record<string, unknown> = { ...frame.data };
  for (const [k, v] of Object.entries(patch))
    if (v === undefined || v === '' || v === false) delete data[k];
    else data[k] = v;
  const next: Item = { ...frame };
  if (Object.keys(data).length) next.data = data;
  else delete next.data;
  return { ...board, items: board.items.map(i => (i.id === id ? next : i)) };
}
export const FRAME_NOTES_LIMIT = 10000;
export function setFrameNotes(board: Board, id: string, notes: string): Board {
  if (notes.length > FRAME_NOTES_LIMIT) throw new Error('Presenter notes are limited to 10,000 characters.');
  return setFrameData(board, id, { notes: notes.trim() ? notes : undefined });
}
export const setHiddenSlide = (board: Board, id: string, hidden: boolean) =>
  setFrameData(board, id, { skipInPresentation: hidden });
/** Move a frame earlier/later in the presentation; stores the complete order. */
export function moveInPresentation(board: Board, id: string, delta: number): Board {
  const order = presentationFrames(board).map(f => f.id),
    from = order.indexOf(id),
    to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return board;
  [order[from], order[to]] = [order[to], order[from]];
  return { ...board, presentation: order };
}
/** Camera that fits a frame inside the screen with a margin. */
export function fitFrame(frame: Item, size: { w: number; h: number }, margin = 48): Camera {
  const z = Math.max(
    0.05,
    Math.min(8, (size.w - margin * 2) / Math.max(frame.w, 1), (size.h - margin * 2 - 64) / Math.max(frame.h, 1)),
  );
  return { z, x: size.w / 2 - (frame.x + frame.w / 2) * z, y: (size.h - 64) / 2 - (frame.y + frame.h / 2) * z };
}

/** Kind groups offered by the search type filter (gap D4). */
export const searchKindGroups: { id: string; label: string; match: (k: Kind) => boolean }[] = [
  { id: 'all', label: 'All objects', match: () => true },
  { id: 'note', label: 'Sticky notes', match: k => k === 'note' },
  { id: 'text', label: 'Text', match: k => k === 'text' },
  { id: 'card', label: 'Cards', match: k => k === 'card' },
  { id: 'frame', label: 'Frames', match: k => k === 'frame' },
  { id: 'arrow', label: 'Connectors', match: k => k === 'arrow' },
  { id: 'shape', label: 'Shapes', match: k => isShapeKind(k) },
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Replace every exact occurrence of `find` (case-insensitive unless `matchCase`) in object text, connector
 * labels and mind-map topics of `ids`. Locked objects are skipped; fuzzy search matches are never replaced.
 */
export function replaceText(
  board: Board,
  ids: string[],
  find: string,
  replacement: string,
  matchCase = false,
): { board: Board; count: number; objects: number } {
  if (!find) return { board, count: 0, objects: 0 };
  const wanted = new Set(ids),
    re = new RegExp(escapeRegExp(find), matchCase ? 'g' : 'gi');
  let count = 0,
    objects = 0;
  const swap = (text: string) =>
    text.replace(re, () => {
      count++;
      return replacement;
    });
  const items = board.items.map(i => {
    if (!wanted.has(i.id) || i.locked) return i;
    const before = count;
    const text = swap(i.text).slice(0, i.type === 'card' ? 20000 : 6000);
    const nodes = i.nodes?.map(n => ({ ...n, text: swap(n.text).slice(0, 6000) }));
    if (count === before) return i;
    objects++;
    return { ...i, text, ...(nodes ? { nodes } : {}) };
  });
  return { board: objects ? { ...board, items } : board, count, objects };
}

// ---- Keyboard object navigation (gap F1, F2) -------------------------------------------------
const navigable = (i: Item) => !i.hidden && i.type !== 'arrow' && i.type !== 'pen';
/**
 * Objects in reading order: rows top to bottom (objects whose tops are within half the smaller
 * height of each other share a row), then left to right.
 */
export function readingOrder(board: Board): string[] {
  const items = board.items.filter(navigable).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const i of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(i.y - row[0].y) <= Math.min(i.h, row[0].h) / 2) row.push(i);
    else rows.push([i]);
  }
  return rows.flatMap(r => r.sort((a, b) => a.x - b.x)).map(i => i.id);
}
/** Next (or previous) object in reading order, wrapping; the first object when nothing is selected. */
export function stepInOrder(board: Board, current: string | undefined, back = false): string | undefined {
  const order = readingOrder(board);
  if (!order.length) return undefined;
  const at = current ? order.indexOf(current) : -1;
  if (at < 0) return back ? order[order.length - 1] : order[0];
  return order[(at + (back ? -1 : 1) + order.length) % order.length];
}
export type Direction = 'left' | 'right' | 'up' | 'down';
/** Nearest object whose centre lies in the given direction (within a 45° cone first, then a half plane). */
export function nearestInDirection(board: Board, fromId: string, dir: Direction): string | undefined {
  const from = board.items.find(i => i.id === fromId);
  if (!from) return undefined;
  const cx = from.x + from.w / 2,
    cy = from.y + from.h / 2;
  let best: { id: string; score: number } | undefined;
  for (const i of board.items) {
    if (i.id === fromId || !navigable(i)) continue;
    const dx = i.x + i.w / 2 - cx,
      dy = i.y + i.h / 2 - cy;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy,
      across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 0) continue;
    // Prefer objects inside the cone; penalise sideways distance.
    const score = along + across * (across > along ? 4 : 2);
    if (!best || score < best.score) best = { id: i.id, score };
  }
  return best?.id;
}
/** Spoken description of one object for screen readers (gap F3). */
export function describeItem(i: Item): string {
  const kind = i.type === 'note' ? 'Sticky note' : i.type === 'arrow' ? 'Connector' : i.type;
  const text = (i.alt || i.name || i.text || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  return [kind[0].toUpperCase() + kind.slice(1), text || 'no text', i.locked ? 'locked' : '']
    .filter(Boolean)
    .join(', ');
}
/** Short board summary: counts by kind (gap F3, Alt+S). */
export function boardSummary(board: Board): string {
  const counts = new Map<string, number>();
  for (const i of board.items) if (!i.hidden) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
  if (!counts.size) return `${board.title || 'Board'} is empty.`;
  const parts = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${k === 'note' ? 'sticky note' : k === 'arrow' ? 'connector' : k}${n === 1 ? '' : 's'}`);
  return `${board.title || 'Board'}: ${board.items.filter(i => !i.hidden).length} objects — ${parts.join(', ')}.`;
}
/** First object inside a frame in reading order (gap F2: Ctrl+Shift+Down enters a frame). */
export function firstInFrame(board: Board, frameId: string): string | undefined {
  const f = board.items.find(i => i.id === frameId && i.type === 'frame');
  if (!f) return undefined;
  const inside = new Set(
    board.items
      .filter(i => i.id !== f.id && i.x >= f.x && i.y >= f.y && i.x + i.w <= f.x + f.w && i.y + i.h <= f.y + f.h)
      .map(i => i.id),
  );
  return readingOrder(board).find(id => inside.has(id));
}
/** Smallest frame containing an object (gap F2: Ctrl+Shift+Up leaves to the frame). */
export function frameAroundItem(board: Board, id: string): string | undefined {
  const i = board.items.find(x => x.id === id);
  if (!i) return undefined;
  return board.items
    .filter(
      f =>
        f.type === 'frame' &&
        f.id !== id &&
        i.x >= f.x &&
        i.y >= f.y &&
        i.x + i.w <= f.x + f.w &&
        i.y + i.h <= f.y + f.h,
    )
    .sort((a, b) => a.w * a.h - b.w * b.h)[0]?.id;
}
