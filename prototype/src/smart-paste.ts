// Smart paste and drop of plain text (gap list B1, B2, B6, B7, B8): spreadsheet cells become a Grid, a single
// web address becomes an embed (allow-listed providers) or a bookmark, Mermaid code becomes a diagram, and
// other text becomes sticky notes (several lines), a Doc (long prose) or a text object (one line).
// Pure: no React, no DOM.
import type { Item, Point } from './model.ts';
import { createItem } from './model.ts';
import { GRID_MAX, gridFromTable, gridSize } from './grid.ts';
import type { GridData } from './grid.ts';
import { embedSource, normalizeHttpsUrl } from './specs-media.ts';
import { DOC_MAX } from './doc-tools.ts';

export const PASTE_NOTES_MAX = 100;

/**
 * Parse CSV or TSV (RFC 4180 quoting, CRLF or LF, optional BOM). The delimiter is detected from the first
 * line when not given: tab if it has one, else semicolon if it has more of those than commas, else comma.
 */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const d =
    delimiter ??
    (firstLine.includes('\t')
      ? '\t'
      : (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
        ? ';'
        : ',');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Drop trailing empty lines.
  while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
  return rows;
}

const MERMAID_START =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram(-v2)?|gantt|mindmap|journey|pie|timeline|gitGraph|quadrantChart)\b/;

export type PasteKind = 'url' | 'cells' | 'mermaid' | 'lines' | 'text' | 'doc';

/** Plain text at least this long can become a Doc (when it also reads as prose, see `isLongProse`). */
export const PASTE_DOC_MIN = 600;
/** A line longer than this does not fit a sticky note comfortably. */
export const PASTE_DOC_LINE = 280;

/**
 * Over-long prose (an article, an e-mail, meeting notes) is better kept together in a Doc than split into
 * dozens of sticky notes or one huge text object: more than PASTE_DOC_MIN characters and either a paragraph
 * break (a blank line) or a line too long for a note. A plain list of short lines, however long, stays notes.
 */
export function isLongProse(text: string): boolean {
  const t = text.trim();
  if (t.length <= PASTE_DOC_MIN) return false;
  return /\n[ \t]*\r?\n/.test(t) || t.split(/\r?\n/).some(l => l.trim().length > PASTE_DOC_LINE);
}

/** What a plain-text paste should become. Markdown is detected separately (markdown.ts). */
export function classifyPaste(text: string): PasteKind | null {
  const t = text.trim();
  if (!t) return null;
  if (MERMAID_START.test(t)) return 'mermaid';
  if (!/\s/.test(t) && /^(https?:\/\/|www\.)[^\s]+$/i.test(t)) return 'url';
  const lines = t.split(/\r?\n/);
  // Spreadsheet cells: tab-separated, at least two cells.
  if (lines.some(l => l.includes('\t'))) {
    const rows = parseDelimited(t, '\t');
    if (rows.some(r => r.length > 1) || rows.length > 1) return 'cells';
  }
  if (isLongProse(t)) return 'doc';
  return lines.filter(l => l.trim()).length > 1 ? 'lines' : 'text';
}

/** A Grid holding the cells (capped at the grid limit); returns how many rows or columns were cut. */
export function gridFromCells(rows: string[][], at: Point): { item: Item; truncated: boolean } {
  const { data, truncated } = gridFromTable(rows),
    item = createItem('grid', at.x, at.y),
    size = gridSize(data.rows, data.cols);
  item.w = size.w;
  item.h = size.h;
  item.x = at.x - item.w / 2;
  item.y = at.y - item.h / 2;
  item.data = data;
  return { item, truncated };
}

/** An embed for allow-listed providers, otherwise a bookmark. Throws for addresses that are not http(s). */
export function linkItem(text: string, at: Point): Item {
  const raw = text.trim(),
    url = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const s = embedSource(url);
    const item = createItem('embed', at.x, at.y);
    item.x -= item.w / 2;
    item.y -= item.h / 2;
    item.data = { url: s.url, provider: s.provider };
    return item;
  } catch {
    const href = normalizeHttpsUrl(url);
    const item = createItem('bookmark', at.x, at.y);
    item.x -= item.w / 2;
    item.y -= item.h / 2;
    let host = href;
    try {
      host = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      /* keep the address */
    }
    item.data = { url: href, title: host.slice(0, 300), description: '', layout: 'big' };
    return item;
  }
}

/** One sticky note per non-empty line, laid out in rows of up to five around `at`. */
export function notesFromLines(text: string, at: Point): { items: Item[]; truncated: boolean } {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*([-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
  const kept = lines.slice(0, PASTE_NOTES_MAX),
    cols = Math.min(5, kept.length),
    probe = createItem('note', 0, 0),
    gap = 24,
    w = cols * probe.w + (cols - 1) * gap,
    h = Math.ceil(kept.length / cols) * (probe.h + gap) - gap;
  const items = kept.map((line, n) => ({
    ...createItem('note', 0, 0),
    text: line.slice(0, 6000),
    x: at.x - w / 2 + (n % cols) * (probe.w + gap),
    y: at.y - h / 2 + Math.floor(n / cols) * (probe.h + gap),
  }));
  return { items, truncated: lines.length > kept.length };
}

/** A single text object. */
export function textItem(text: string, at: Point): Item {
  const item = createItem('text', at.x, at.y);
  item.text = text.trim().slice(0, 6000);
  item.x -= item.w / 2;
  item.y -= item.h / 2;
  return item;
}

/** A Mermaid diagram object holding the code. */
export function mermaidItem(code: string, at: Point): Item {
  const item = createItem('mermaid', at.x, at.y);
  item.text = code.trim().slice(0, 6000);
  item.x -= item.w / 2;
  item.y -= item.h / 2;
  return item;
}

/** A Doc holding long pasted prose; blank lines stay paragraph breaks. Capped at the Doc limit. */
export function docItem(text: string, at: Point): { item: Item; truncated: boolean } {
  const clean = text.replace(/\r\n?/g, '\n').trim(),
    item = createItem('doc', at.x, at.y, '#ffffff');
  item.x -= item.w / 2;
  item.y -= item.h / 2;
  item.data = { ...item.data, markdown: clean.slice(0, DOC_MAX) };
  return { item, truncated: clean.length > DOC_MAX };
}

/**
 * One sticky note per non-empty spreadsheet cell, laid out like the cells (the "one sticky per cell" choice
 * offered after cells were pasted as a Grid). Up to PASTE_NOTES_MAX notes, read row by row.
 */
export function notesFromCells(rows: string[][], at: Point): { items: Item[]; truncated: boolean } {
  const cells: { r: number; c: number; text: string }[] = [];
  rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      const text = cell.trim();
      if (text) cells.push({ r, c, text });
    }),
  );
  const kept = cells.slice(0, PASTE_NOTES_MAX);
  if (!kept.length) return { items: [], truncated: false };
  const probe = createItem('note', 0, 0),
    gap = 24,
    cols = Math.max(...kept.map(k => k.c)) + 1,
    rowCount = Math.max(...kept.map(k => k.r)) + 1,
    w = cols * probe.w + (cols - 1) * gap,
    h = rowCount * probe.h + (rowCount - 1) * gap;
  const items = kept.map(k => ({
    ...createItem('note', 0, 0),
    text: k.text.slice(0, 6000),
    x: at.x - w / 2 + k.c * (probe.w + gap),
    y: at.y - h / 2 + k.r * (probe.h + gap),
  }));
  return { items, truncated: cells.length > kept.length };
}

/** Build the objects for a plain-text paste, or null when the text should be left to other handlers. */
export function itemsFromText(text: string, at: Point): { items: Item[]; kind: PasteKind; note?: string } | null {
  const kind = classifyPaste(text);
  if (!kind) return null;
  if (kind === 'url') {
    try {
      return { items: [linkItem(text, at)], kind };
    } catch {
      return { items: [textItem(text, at)], kind: 'text' };
    }
  }
  if (kind === 'mermaid') return { items: [mermaidItem(text, at)], kind };
  if (kind === 'cells') {
    const g = gridFromCells(parseDelimited(text.trim(), '\t'), at);
    return {
      items: [g.item],
      kind,
      note: g.truncated
        ? `Only the first ${(g.item.data as GridData).rows} rows and ${(g.item.data as GridData).cols} columns were pasted (a grid holds up to ${GRID_MAX} rows or columns and 2,500 cells).`
        : undefined,
    };
  }
  if (kind === 'lines') {
    const n = notesFromLines(text, at);
    return {
      items: n.items,
      kind,
      note: n.truncated ? `Only the first ${PASTE_NOTES_MAX} lines were pasted.` : undefined,
    };
  }
  if (kind === 'doc') {
    const d = docItem(text, at);
    return {
      items: [d.item],
      kind,
      note: d.truncated ? `Only the first ${DOC_MAX.toLocaleString('en')} characters were pasted.` : undefined,
    };
  }
  return { items: [textItem(text, at)], kind };
}
