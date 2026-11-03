// Board search, minimap geometry and presentation ordering (pure helpers).
// Evidence: a fuzzy-search/match-scoring chunk, FrameWidget jump-to-viewport identifiers and six
// presentation-related modules in the 205-file audit.
import type { Board, Item, Kind, Point } from './model.ts';
import { itemBounds } from './interactions.ts';
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
