// CSV to sticky notes: rows exported from other whiteboard tools (or any spreadsheet) become a tidy grid of
// notes, grouped into frames by a group column. Pure: no React, no DOM. Parsing reuses parseDelimited (via
// csvTable, which also checks the file size).
//
// With a header row, the note text comes from the first column named content, text, title, sticky, note, idea
// or name (in that order), else from the first non-empty column. Optional columns by name: colour (hex or a
// colour name, matched to the nearest sticky colour), tags, author and group (one frame per group value).
// Without a header, every non-empty cell becomes a note and each CSV column becomes a column of notes.
import type { Item, Point } from './model.ts';
import { colorNames, colors, createItem } from './model.ts';
import { csvTable } from './record-import.ts';
import { cleanAuthor } from './authors.ts';
import { BOARD_OBJECT_LIMIT } from './drawio-shapes.ts';

export type CsvStickiesOptions = {
  /** Centre of the laid-out notes (the view centre or the drop point). */
  center: Point;
  /** How many objects may still be added (the board object limit minus what is on the board). */
  room?: number;
  /** Colour of notes without a colour value. */
  fill?: string;
};
export type CsvStickiesResult = {
  items: Item[];
  notes: number;
  frames: number;
  /** Data rows without note text. */
  skipped: number;
  /** Notes left out because the board object limit was reached. */
  capped: number;
  header: boolean;
  /** Header name of the column the note text was read from. */
  textColumn?: string;
};

const TEXT_NAMES = ['content', 'text', 'title', 'sticky', 'note', 'idea', 'name'];
const ROLE_NAMES = {
  colour: [
    'colour',
    'color',
    'fill',
    'background',
    'backgroundcolour',
    'backgroundcolor',
    'stickycolour',
    'stickycolor',
  ],
  tags: ['tags', 'tag', 'labels', 'label'],
  author: ['author', 'assignee', 'owner', 'createdby', 'creator'],
  group: ['group', 'category', 'column', 'frame', 'section', 'cluster', 'theme'],
} as const;
type Role = keyof typeof ROLE_NAMES;
/** Other names exports commonly carry; they only help recognise a header row. */
const OTHER_NAMES = ['id', 'type', 'x', 'y', 'link', 'url', 'created', 'createdat', 'updated', 'modified', 'votes'];

const NOTE_W = 210,
  NOTE_H = 210,
  GAP = 24,
  FRAME_PAD = 40,
  FRAME_GAP = 120;

/** Lower case, letters and digits only; a trailing plural "s" is dropped ("Sticky notes" -> "stickynote"). */
const norm = (s: string) => {
  const n = s
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return n.length > 3 && n.endsWith('s') && !n.endsWith('ss') ? n.slice(0, -1) : n;
};
const nameMatches = (cell: string, names: readonly string[]) => {
  const n = norm(cell);
  return names.some(name => n === name || (name === 'sticky' && n === 'stickynote'));
};

export type StickyColumns = { text: number; colour?: number; tags?: number; author?: number; group?: number };

/**
 * The columns of a header row, or null when the first row does not look like a header (none of its cells is a
 * column name an export would use). `named` is true when the text column was found by name.
 */
export function stickyColumns(rows: string[][]): (StickyColumns & { named: boolean }) | null {
  const head = rows[0];
  if (!head) return null;
  const known = [...TEXT_NAMES, ...Object.values(ROLE_NAMES).flat(), ...OTHER_NAMES];
  if (!head.some(c => c.trim() && nameMatches(c, known))) return null;
  const find = (names: readonly string[]) => {
    const k = head.findIndex(c => nameMatches(c, names));
    return k < 0 ? undefined : k;
  };
  const roles: Partial<Record<Role, number>> = {};
  for (const role of Object.keys(ROLE_NAMES) as Role[]) roles[role] = find(ROLE_NAMES[role]);
  let text: number | undefined;
  for (const name of TEXT_NAMES) {
    text = find([name]);
    if (text !== undefined) break;
  }
  const named = text !== undefined;
  if (text === undefined) {
    // The first column with a value in some data row, preferring one that has no other role.
    const used = new Set(Object.values(roles).filter(v => v !== undefined));
    const width = Math.max(...rows.map(r => r.length));
    const filled = (k: number) => rows.slice(1).some(r => (r[k] ?? '').trim());
    for (let k = 0; k < width && text === undefined; k++) if (!used.has(k) && filled(k)) text = k;
    for (let k = 0; k < width && text === undefined; k++) if (filled(k)) text = k;
  }
  if (text === undefined) text = 0;
  const pick = (k: number | undefined) => (k === undefined || k === text ? undefined : k);
  return {
    text,
    named,
    colour: pick(roles.colour),
    tags: pick(roles.tags),
    author: pick(roles.author),
    group: pick(roles.group),
  };
}

const hexRgb = (hex: string) => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
/** Palette colour closest to `hex` (weighted RGB distance). */
export function nearestStickyColour(hex: string): string {
  const [r, g, b] = hexRgb(hex);
  let best = colors[0],
    bestD = Infinity;
  for (const c of colors) {
    const [cr, cg, cb] = hexRgb(c),
      d = 2 * (r - cr) ** 2 + 4 * (g - cg) ** 2 + 3 * (b - cb) ** 2;
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
const COLOUR_WORDS: Record<string, string> = {
  yellow: '#ffe36e',
  'light yellow': '#fff49b',
  gold: '#ffe36e',
  orange: '#ffb879',
  red: '#ffa0a7',
  'light red': '#ffa0a7',
  coral: '#ffa0a7',
  pink: '#f7c5ef',
  'light pink': '#f7c5ef',
  magenta: '#f7c5ef',
  violet: '#d3b7f6',
  purple: '#d3b7f6',
  lilac: '#d3b7f6',
  lavender: '#d3b7f6',
  blue: '#a8cdff',
  'light blue': '#a8cdff',
  'sky blue': '#a8cdff',
  cyan: '#8ce3eb',
  teal: '#8ce3eb',
  aqua: '#8ce3eb',
  turquoise: '#8ce3eb',
  green: '#a9e8bb',
  'light green': '#a9e8bb',
  lime: '#d1ec9c',
  white: '#ffffff',
  grey: '#e4e4e7',
  gray: '#e4e4e7',
  'light grey': '#e4e4e7',
  'light gray': '#e4e4e7',
  'dark blue': '#1e3a8a',
  navy: '#1e3a8a',
  'dark green': '#166534',
  black: '#1f1f23',
  'dark grey': '#1f1f23',
  'dark gray': '#1f1f23',
};
/** A sticky colour for a colour value (hex code or name), or undefined when it is not a colour. */
export function stickyColour(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  if (!v) return undefined;
  let m = /^#?([0-9a-f]{6})$/.exec(v);
  if (m) return nearestStickyColour(`#${m[1]}`);
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (m) return nearestStickyColour(`#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`);
  const words = v
    .replace(/[_\-\s]+/g, ' ')
    .replace(/([a-z])(yellow|red|pink|blue|green|grey|gray|orange|violet|purple)$/, '$1 $2')
    .trim();
  // Plain colour words first ("blue" in an export means a light sticky blue), then Boardroom's own names.
  if (COLOUR_WORDS[words]) return COLOUR_WORDS[words];
  const palette = Object.entries(colorNames).find(
    ([hex, name]) => colors.includes(hex) && name.toLowerCase() === words,
  );
  return palette?.[0] ?? COLOUR_WORDS[words.split(' ').pop() ?? ''];
}

/** Note tags from a "a, b; c" value: trimmed, distinct, at most 10 of up to 32 characters. */
export function stickyTags(value: string): string[] {
  const tags: string[] = [];
  for (const raw of value.split(/[,;]/)) {
    const t = raw.trim().slice(0, 32).trim();
    if (t && !tags.includes(t) && tags.length < 10) tags.push(t);
  }
  return tags;
}

/** Columns for `n` notes in one block: roughly square, at least `min` wide. */
const gridCols = (n: number, min: number) => Math.max(1, Math.min(n, Math.max(min, Math.ceil(Math.sqrt(n)))));

type Entry = { text: string; fill: string; tags?: string[]; author?: string; group?: string; col?: number };
type Block = { title?: string; entries: Entry[]; columns?: boolean };

const makeNote = (e: Entry, x: number, y: number): Item => {
  const item: Item = { ...createItem('note', 0, 0, e.fill), x, y, text: e.text.replace(/\r\n?/g, '\n').slice(0, 6000) };
  if (e.tags?.length) item.tags = e.tags;
  if (e.author) item.author = e.author;
  return item;
};

/** Lay out the blocks side by side (frames for titled blocks), centred on `center`. */
function layout(blocks: Block[], center: Point): { items: Item[]; frames: number } {
  const items: Item[] = [];
  let x = 0,
    frames = 0;
  for (const block of blocks) {
    const framed = block.title !== undefined,
      pad = framed ? FRAME_PAD : 0,
      notes: Item[] = [];
    if (block.columns) {
      // One column of notes per CSV column, empty cells closed up.
      const byCol = new Map<number, Entry[]>();
      for (const e of block.entries) byCol.set(e.col ?? 0, [...(byCol.get(e.col ?? 0) ?? []), e]);
      [...byCol.keys()]
        .sort((a, b) => a - b)
        .forEach((c, k) =>
          byCol
            .get(c)!
            .forEach((e, r) => notes.push(makeNote(e, x + pad + k * (NOTE_W + GAP), pad + r * (NOTE_H + GAP)))),
        );
    } else {
      const cols = gridCols(block.entries.length, framed ? 2 : 5);
      block.entries.forEach((e, n) =>
        notes.push(makeNote(e, x + pad + (n % cols) * (NOTE_W + GAP), pad + Math.floor(n / cols) * (NOTE_H + GAP))),
      );
    }
    if (!notes.length) continue;
    const right = Math.max(...notes.map(i => i.x + i.w)),
      bottom = Math.max(...notes.map(i => i.y + i.h));
    if (framed) {
      const frame: Item = {
        ...createItem('frame', 0, 0, '#ffffff'),
        x,
        y: 0,
        w: right + pad - x,
        h: bottom + pad,
        text: block.title!.slice(0, 200),
      };
      items.push(frame);
      frames++;
    }
    items.push(...notes);
    x = right + pad + FRAME_GAP;
  }
  if (items.length) {
    const x0 = Math.min(...items.map(i => i.x)),
      y0 = Math.min(...items.map(i => i.y)),
      x1 = Math.max(...items.map(i => i.x + i.w)),
      y1 = Math.max(...items.map(i => i.y + i.h)),
      dx = Math.round(center.x - (x0 + x1) / 2),
      dy = Math.round(center.y - (y0 + y1) / 2);
    for (const i of items) {
      i.x += dx;
      i.y += dy;
    }
  }
  return { items, frames };
}

/** Sticky notes (and group frames) for already parsed rows (a CSV, TSV or XLSX sheet, or pasted cells). */
export function rowsToStickies(rows: string[][], opts: CsvStickiesOptions): CsvStickiesResult {
  const fill = opts.fill ?? colors[0];
  let room = Math.max(0, Math.min(opts.room ?? BOARD_OBJECT_LIMIT, BOARD_OBJECT_LIMIT));
  const cols = stickyColumns(rows);
  const entries: Entry[] = [];
  let skipped = 0,
    capped = 0;
  if (cols) {
    const groups = new Set<string>(),
      cell = (r: string[], k: number | undefined) => (k === undefined ? '' : (r[k] ?? '').trim());
    for (const r of rows.slice(1)) {
      const text = cell(r, cols.text);
      if (!text) {
        skipped++;
        continue;
      }
      const group = cell(r, cols.group).slice(0, 200) || undefined,
        cost = group && !groups.has(group) ? 2 : 1;
      if (cost > room) {
        capped++;
        continue;
      }
      room -= cost;
      if (group) groups.add(group);
      const author = cleanAuthor(cell(r, cols.author)),
        tags = stickyTags(cell(r, cols.tags));
      entries.push({
        text,
        fill: stickyColour(cell(r, cols.colour)) ?? fill,
        tags: tags.length ? tags : undefined,
        author: author || undefined,
        group,
      });
    }
    // Groups in order of first appearance; rows without a group follow in an unframed block.
    const order = [...new Set(entries.map(e => e.group))];
    const blocks: Block[] = order
      .filter(g => g !== undefined)
      .map(g => ({ title: g, entries: entries.filter(e => e.group === g) }));
    if (order.includes(undefined)) blocks.push({ entries: entries.filter(e => e.group === undefined) });
    const made = layout(blocks, opts.center);
    return {
      ...made,
      notes: entries.length,
      skipped,
      capped,
      header: true,
      textColumn: (rows[0][cols.text] ?? '').replace(/^\uFEFF/, '').trim(),
    };
  }
  for (const r of rows) {
    const cells = r.map((c, k) => ({ text: c.trim(), col: k })).filter(c => c.text);
    if (!cells.length) {
      skipped++;
      continue;
    }
    for (const c of cells) {
      if (room < 1) {
        capped++;
        continue;
      }
      room--;
      entries.push({ text: c.text, fill, col: c.col });
    }
  }
  // A single column of values reads better as a grid than as one very tall column.
  const single = new Set(entries.map(e => e.col)).size <= 1;
  const made = layout([{ entries, columns: !single }], opts.center);
  return { ...made, notes: entries.length, skipped, capped, header: false };
}

/** Sticky notes from CSV or TSV text (BOM, CRLF and quoted fields allowed). Throws for files over 5 MB. */
export function csvToStickies(text: string, opts: CsvStickiesOptions): CsvStickiesResult {
  return rowsToStickies(csvTable(text), opts);
}

/** The import message: notes and frames made, rows skipped, and notes left out at the object limit. */
export function csvStickiesNote(r: CsvStickiesResult): string {
  if (!r.notes)
    return r.capped
      ? `This prototype supports up to ${BOARD_OBJECT_LIMIT.toLocaleString('en')} objects per board, so no sticky notes were added.`
      : 'The file has no text to turn into sticky notes.';
  const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
  const parts = [
    `Added ${plural(r.notes, 'sticky note', 'sticky notes')}${r.frames ? ` in ${plural(r.frames, 'frame', 'frames')}` : ''}${r.textColumn ? ` from the "${r.textColumn}" column` : ''}.`,
  ];
  if (r.skipped) parts.push(`Skipped ${plural(r.skipped, 'row', 'rows')} without text.`);
  if (r.capped)
    parts.push(
      `${plural(r.capped, 'note was', 'notes were')} left out: a board holds up to ${BOARD_OBJECT_LIMIT.toLocaleString('en')} objects.`,
    );
  return parts.join(' ');
}

/**
 * Pasted rows that read as an export of notes: a header row naming the text column and at least one data row.
 * Used to offer "Sticky notes" after a paste became a Grid or one note per line.
 */
export function looksLikeStickyRows(rows: string[][]): boolean {
  const cols = stickyColumns(rows);
  return !!cols?.named && rows.slice(1).some(r => (r[cols.text] ?? '').trim());
}
