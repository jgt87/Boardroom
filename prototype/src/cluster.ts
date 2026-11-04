// Clustering of selected sticky notes (gap G6): by colour, tag, author or keyword.
// Keyword clustering is a deterministic local stand-in for AI grouping: tokenize, drop stop words,
// then repeatedly take the term shared by the most remaining notes. Nothing leaves the device.
import type { Board, Item } from './model.ts';
import { createItem } from './model.ts';
import { editableIds } from './arrange.ts';

export type ClusterBy = 'color' | 'tag' | 'author' | 'keyword';
export type Cluster = { title: string; ids: string[] };
export const clusterLabels: Record<ClusterBy, string> = {
  color: 'Colour',
  tag: 'Tag',
  author: 'Author',
  keyword: 'Keyword',
};

const colorNames: Record<string, string> = {
  '#fff49b': 'Light yellow',
  '#ffe36e': 'Yellow',
  '#ffb879': 'Orange',
  '#ffa0a7': 'Red',
  '#f7c5ef': 'Pink',
  '#d3b7f6': 'Violet',
  '#a8cdff': 'Light blue',
  '#8ce3eb': 'Cyan',
  '#a9e8bb': 'Light green',
  '#d1ec9c': 'Lime',
  '#ffffff': 'White',
  '#e4e4e7': 'Gray',
  '#3d5afe': 'Blue',
  '#1e3a8a': 'Dark blue',
  '#166534': 'Dark green',
  '#1f1f23': 'Black',
};
/** Readable name for a note colour; unknown colours use their hex code. */
export const colorName = (hex: string) => colorNames[hex.toLowerCase()] ?? hex.toLowerCase();

// English and a few common Dutch/German function words; short words (< 3 letters) are dropped anyway.
export const stopWords = new Set(
  (
    'the and for are but not you all any can had her was one our out has have him his how its may new now ' +
    'old see two way who did get got let put say she too use with that this from they will would there their ' +
    'what about which when make like time just know take into year your some could them than then look only ' +
    'come over also back after work first well even want because these give most very should been were being ' +
    'does doing done more less much many such each other here where while why own same both few again once ' +
    'off yes yet via per lot lots need needs thing things maybe really still able must might shall onto upon ' +
    'het een van die dat voor met niet ook maar wel nog als bij naar dan zijn heeft wordt worden der den und ' +
    'mit für auf ist sich nicht auch eine einen dem des aus'
  ).split(' '),
);

/** Lower-case, accent-free word stems of length ≥ 3 without stop words or bare numbers. */
export function tokenize(text: string): string[] {
  const words =
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (w.length < 3 || /^\d+$/.test(w) || stopWords.has(w)) continue;
    const stem =
      w.length > 4 && w.endsWith('ies')
        ? w.slice(0, -3) + 'y'
        : w.length > 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)
          ? w.slice(0, -1)
          : w;
    if (!stopWords.has(stem)) out.push(stem);
  }
  return out;
}

/** Reading order: top to bottom, then left to right, then id (fully deterministic). */
const readingOrder = (a: Item, b: Item) =>
  Math.round(a.y) - Math.round(b.y) || Math.round(a.x) - Math.round(b.x) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Greedy keyword grouping: take the term shared by the most remaining notes (ties alphabetical), make it a
 * cluster, remove those notes and repeat. Terms must be shared by at least two notes. Leftovers go to "Other".
 */
export function keywordClusters(notes: { id: string; text: string }[], maxClusters = 8): Cluster[] {
  let remaining = notes.map(n => ({ id: n.id, terms: new Set(tokenize(n.text)) }));
  const clusters: Cluster[] = [];
  while (remaining.length > 1 && clusters.length < maxClusters - 1) {
    const df = new Map<string, number>();
    for (const n of remaining) for (const t of n.terms) df.set(t, (df.get(t) ?? 0) + 1);
    let best: string | null = null,
      bestCount = 1;
    for (const [term, count] of df)
      if (count > bestCount || (count === bestCount && best !== null && term < best)) {
        best = term;
        bestCount = count;
      }
    if (!best) break;
    const term = best;
    clusters.push({
      title: term[0].toUpperCase() + term.slice(1),
      ids: remaining.filter(n => n.terms.has(term)).map(n => n.id),
    });
    remaining = remaining.filter(n => !n.terms.has(term));
  }
  if (remaining.length) clusters.push({ title: 'Other', ids: remaining.map(n => n.id) });
  return clusters;
}

/** Selected sticky notes (groups expanded by the caller) in reading order. */
export function selectedNotes(board: Board, ids: string[]): Item[] {
  const set = new Set(ids);
  return board.items.filter(i => set.has(i.id) && i.type === 'note').sort(readingOrder);
}

/** Group sticky notes. Clusters keep the order in which their first note appears (reading order). */
export function clusterNotes(board: Board, ids: string[], by: ClusterBy): Cluster[] {
  const notes = selectedNotes(board, ids);
  if (by === 'keyword') return keywordClusters(notes);
  const map = new Map<string, Cluster>();
  for (const n of notes) {
    const key = by === 'color' ? n.fill.toLowerCase() : by === 'tag' ? (n.tags?.[0] ?? '') : (n.author?.trim() ?? '');
    const title =
      by === 'color' ? colorName(key) : key ? (by === 'tag' ? `#${key}` : key) : by === 'tag' ? 'No tag' : 'No author';
    const c = map.get(key) ?? { title, ids: [] };
    c.ids.push(n.id);
    map.set(key, c);
  }
  return [...map.values()];
}

export type ClusterLayout = { gap?: number; columnGap?: number; titleHeight?: number };
/**
 * Lay clusters out in columns from `origin`: a bold title text above each column and the notes stacked below.
 * Returns the new board and the ids of the created titles. One call is one undo step.
 */
export function layoutClusters(
  board: Board,
  clusters: Cluster[],
  origin: { x: number; y: number },
  opts: ClusterLayout = {},
): { board: Board; titleIds: string[] } {
  const gap = opts.gap ?? 20,
    columnGap = opts.columnGap ?? 60,
    titleHeight = opts.titleHeight ?? 56;
  const byId = new Map(board.items.map(i => [i.id, i]));
  const moved = new Map<string, { x: number; y: number }>(),
    titles: Item[] = [];
  let x = origin.x;
  for (const c of clusters) {
    const notes = c.ids.map(id => byId.get(id)).filter((i): i is Item => !!i);
    if (!notes.length) continue;
    const width = Math.max(...notes.map(n => n.w));
    const title: Item = {
      ...createItem('text', x, origin.y),
      w: Math.max(width, 160),
      h: 40,
      text: `${c.title} (${notes.length})`,
      format: { fontSize: 24, bold: true },
    };
    titles.push(title);
    let y = origin.y + titleHeight;
    for (const n of notes) {
      moved.set(n.id, { x: x + (width - n.w) / 2, y });
      y += n.h + gap;
    }
    x += Math.max(width, 160) + columnGap;
  }
  const items = board.items.map(i => {
    const p = moved.get(i.id);
    return p ? { ...i, x: Math.round(p.x), y: Math.round(p.y) } : i;
  });
  return { board: { ...board, items: [...items, ...titles] }, titleIds: titles.map(t => t.id) };
}

/** Cluster the editable selected notes and lay them out at the selection's top-left corner. */
export function clusterSelection(
  board: Board,
  ids: string[],
  by: ClusterBy,
): { board: Board; titleIds: string[]; clusters: Cluster[] } {
  const editable = new Set(editableIds(board, ids));
  const notes = selectedNotes(board, ids).filter(n => editable.has(n.id));
  if (notes.length < 2) throw new Error('Select at least two unlocked sticky notes to cluster.');
  const clusters = clusterNotes(
    board,
    notes.map(n => n.id),
    by,
  );
  const origin = { x: Math.min(...notes.map(n => n.x)), y: Math.min(...notes.map(n => n.y)) };
  return { ...layoutClusters(board, clusters, origin), clusters };
}
