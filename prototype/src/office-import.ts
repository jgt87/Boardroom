// Spreadsheet (.xlsx) and Word (.docx) import (gap list B15, I2). Pure: no React, no DOM.
// Uses the public fflate package; only the few XML parts needed are decompressed, each with a size cap.
// XLSX: the cell values of one worksheet, the first or a chosen one (shared and inline strings, numbers, booleans, dates).
// DOCX: paragraphs to Markdown (headings, bulleted and numbered lists, bold, italic, strikethrough, tables).
import { unzipSync } from 'fflate';
import { DOC_MAX } from './doc-tools.ts';
import { IMPORT_COLUMNS_MAX, IMPORT_ROWS_MAX } from './record-import.ts';

export const OFFICE_MAX_BYTES = 20 * 1024 * 1024;
const PART_MAX = 20 * 1024 * 1024;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16))))
    .replace(/&amp;/g, '&');
/** Decode the XML entities of a text node or attribute value. */
export const decodeXml = decode;
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Decompress the wanted parts of an Office or OpenDocument ZIP as text. Throws a user-readable Error. */
export function unzipParts(bytes: Uint8Array, wanted: (name: string) => boolean, kind: string): Record<string, string> {
  if (bytes.length > OFFICE_MAX_BYTES) throw new Error(`${kind} files up to 20 MB can be imported.`);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: f => f.originalSize <= PART_MAX && wanted(f.name) });
  } catch {
    throw new Error(`This is not a readable ${kind} file.`);
  }
  const text = new TextDecoder();
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, text.decode(v)]));
}

// ---- XLSX ---------------------------------------------------------------------------------------------

/** Column index (0-based) of a cell reference such as `B7` or `AA12`. */
export function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
/** Text of each `<si>` shared string (rich-text runs joined; phonetic hints dropped). */
export function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*?\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m =>
    [...(m[1] ?? '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map(t => decode(t[1]))
      .join(''),
  );
}
const builtInDateFormats = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
/** For each cell style index, whether its number format shows a date. */
export function dateStyles(styles: string): boolean[] {
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], 'numFmtId')),
      code = decode(attr(m[0], 'formatCode') ?? '');
    custom.set(id, code);
  }
  const xfs = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  return [...xfs.matchAll(/<xf\b[^>]*>/g)].map(m => {
    const id = Number(attr(m[0], 'numFmtId') ?? 0);
    if (builtInDateFormats.has(id)) return true;
    const code = custom.get(id)?.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return !!code && /[dy]/i.test(code) && !/^[#0.,%\s]*$/.test(code);
  });
}
/** ISO date of a spreadsheet serial day number (1900 date system). */
export function serialDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}
/** Cell values of a worksheet part as rows of text, capped at the import limits. */
export function sheetRows(xml: string, strings: string[] = [], dates: boolean[] = []): string[][] {
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const index = Number(attr(r[0], 'r') ?? rows.length + 1) - 1;
    if (!Number.isInteger(index) || index < 0 || index > IMPORT_ROWS_MAX + 1) {
      if (index > IMPORT_ROWS_MAX + 1) break;
      continue;
    }
    const row: string[] = [];
    let next = 0;
    for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c${c[1]}>`,
        ref = attr(tag, 'r'),
        col = ref ? columnIndex(ref) : next,
        type = attr(tag, 't'),
        style = Number(attr(tag, 's') ?? -1),
        body = c[2] ?? '',
        v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      next = col + 1;
      if (col < 0 || col >= IMPORT_COLUMNS_MAX + 1) continue;
      let value = '';
      if (type === 's') value = strings[Number(v)] ?? '';
      else if (type === 'inlineStr')
        value = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t => decode(t[1])).join('');
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'e') value = '';
      else if (v !== undefined) {
        const text = decode(v),
          n = Number(text);
        value = type !== 'str' && dates[style] && Number.isFinite(n) && n > 0 && n < 2958466 ? serialDate(n) : text;
      }
      while (row.length < col) row.push('');
      row[col] = value;
    }
    while (rows.length < index) rows.push([]);
    rows[index] = row;
  }
  const width = Math.max(0, ...rows.map(r => r.length));
  const out = rows.map(r => Array.from({ length: width }, (_, k) => r[k] ?? ''));
  while (out.length && out[0].every(c => !c.trim())) out.shift();
  while (out.length && out[out.length - 1].every(c => !c.trim())) out.pop();
  return out;
}
/** Worksheets the workbook lists, in workbook order, with their part paths (gap Q16). At most 200. */
export function workbookSheets(workbook: string, rels: string): { path: string; name: string }[] {
  const targets = new Map<string, string>();
  for (const r of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(r[0], 'Id'),
      target = attr(r[0], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].slice(0, 200).map((m, k) => {
    const name = decode(attr(m[0], 'name') ?? '').slice(0, 120) || `Sheet${k + 1}`;
    return { name, path: targets.get(attr(m[0], 'r:id') ?? '') ?? `xl/worksheets/sheet${k + 1}.xml` };
  });
  return sheets.length ? sheets : [{ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' }];
}
/** Path of the first worksheet in workbook order. */
export function firstSheetPath(workbook: string, rels: string): { path: string; name: string } {
  return workbookSheets(workbook, rels)[0];
}
const XLSX_META = ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml'];
function xlsxMeta(bytes: Uint8Array) {
  const meta = unzipParts(bytes, n => XLSX_META.includes(n), 'Excel');
  if (!meta['xl/workbook.xml']) throw new Error('This is not a readable Excel file.');
  return meta;
}
/** Names of the worksheets of an .xlsx file, in workbook order. */
export function xlsxSheetNames(bytes: Uint8Array): string[] {
  const meta = xlsxMeta(bytes);
  return workbookSheets(meta['xl/workbook.xml'], meta['xl/_rels/workbook.xml.rels'] ?? '').map(s => s.name);
}
/**
 * Rows of one worksheet of an .xlsx file: the first, or the one at `index` in workbook order.
 * Throws an Error with a user-readable message.
 */
export function parseXlsx(bytes: Uint8Array, index = 0): { sheet: string; rows: string[][] } {
  const meta = xlsxMeta(bytes),
    chosen = workbookSheets(meta['xl/workbook.xml'], meta['xl/_rels/workbook.xml.rels'] ?? '')[index];
  if (!chosen) throw new Error('That worksheet is not in the file.');
  const { path, name } = chosen,
    which = index === 0 ? 'The first worksheet' : `The worksheet "${name}"`;
  const sheet = unzipParts(bytes, n => n === path, 'Excel')[path];
  if (!sheet) throw new Error(`${which} could not be read.`);
  const rows = sheetRows(
    sheet,
    sharedStrings(meta['xl/sharedStrings.xml'] ?? ''),
    dateStyles(meta['xl/styles.xml'] ?? ''),
  );
  if (!rows.length) throw new Error(`${which} is empty.`);
  return { sheet: name, rows };
}

// ---- DOCX ---------------------------------------------------------------------------------------------

export const escapeMd = (s: string) => s.replace(/([\\`*_[\]~])/g, '\\$1').replace(/\+(?=\+)/g, '\\+');
/** A run of text and its formatting flags: b(old), i(talic), s(trikethrough), u(nderline). */
export type Segment = { text: string; fmt: string };
/** Whether a run property such as `<w:b/>` or `<w:u w:val="single"/>` is switched on. */
const runFlag = (props: string, tag: string) =>
  [...props.matchAll(/<w:([a-zA-Z]+)\b([^>]*)\/>/g)].some(m => m[1] === tag && !/w:val="(0|false|none)"/.test(m[2]));
/** Text and formatting (b, i, s, u flags) of each run, hyperlinks flattened. */
function runSegments(p: string): Segment[] {
  const out: Segment[] = [];
  for (const r of p.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>|<w:hyperlink\b[^>]*>([\s\S]*?)<\/w:hyperlink>/g)) {
    if (r[2] !== undefined) {
      out.push(...runSegments(r[2]));
      continue;
    }
    const run = r[1],
      props = run.match(/<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/)?.[1] ?? '',
      on = (tag: string) => runFlag(props, tag),
      text = [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g)]
        .map(m => (m[2] ? ' ' : decode(m[1])))
        .join('');
    if (!text) continue;
    const fmt = `${on('b') ? 'b' : ''}${on('i') ? 'i' : ''}${on('strike') || on('dstrike') ? 's' : ''}${on('u') ? 'u' : ''}`,
      last = out[out.length - 1];
    if (last && last.fmt === fmt) last.text += text;
    else out.push({ text, fmt });
  }
  return out;
}
/** Markdown for the runs of one `<w:p>` paragraph body (adjacent runs with the same formatting are merged). */
function runsMarkdown(p: string): string {
  return segmentsMarkdown(runSegments(p));
}
/** Markdown for formatted runs (shared with the OpenDocument and RTF importers). */
export function segmentsMarkdown(segments: Segment[]): string {
  return segments
    .map(({ text, fmt }) => {
      const core = text.trim();
      if (!core || !fmt) return escapeMd(text);
      let md = escapeMd(core);
      if (fmt.includes('s')) md = `~~${md}~~`;
      if (fmt.includes('i')) md = `*${md}*`;
      if (fmt.includes('b')) md = `**${md}**`;
      if (fmt.includes('u')) md = `++${md}++`;
      return text.match(/^\s*/)![0] + md + text.match(/\s*$/)![0];
    })
    .join('');
}
/** Convert the body of word/document.xml to Markdown. */
export function docxMarkdown(xml: string): string {
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/)?.[1] ?? xml;
  const lines: string[] = [];
  let lastList = false;
  const para = (p: string) => {
    const props = p.match(/<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/)?.[1] ?? '',
      style = props.match(/<w:pStyle\b[^>]*w:val="([^"]*)"/)?.[1] ?? '',
      level = Number(props.match(/<w:ilvl\b[^>]*w:val="(\d+)"/)?.[1] ?? 0),
      list = /<w:numPr\b/.test(props) || /^List(Bullet|Number|Paragraph)/i.test(style),
      ordered = /Number/i.test(style),
      text = runsMarkdown(p.replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/, '')).trim(),
      heading = style.match(/^(?:Heading|heading)\s*(\d)$/)?.[1] ?? (/^Title$/i.test(style) ? '1' : null);
    if (!text) {
      lastList = false;
      return;
    }
    if (heading) {
      lines.push(`${'#'.repeat(Math.min(6, Number(heading)))} ${text.replace(/^\*\*(.*)\*\*$/, '$1')}`, '');
      lastList = false;
    } else if (list) {
      if (!lastList && lines.length && lines[lines.length - 1] !== '') lines.push('');
      lines.push(`${'  '.repeat(Math.min(4, level))}${ordered ? '1.' : '-'} ${text}`);
      lastList = true;
    } else {
      if (lastList) lines.push('');
      lines.push(text, '');
      lastList = false;
    }
  };
  for (const m of body.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) {
    if (m[0].startsWith('<w:tbl')) {
      const rows = [...m[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map(tr =>
        [...tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map(tc =>
          [...tc[0].matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
            .map(p => runsMarkdown(p[1]).trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\|/g, '\\|'),
        ),
      );
      if (!rows.length) continue;
      const width = Math.max(1, ...rows.map(r => r.length)),
        line = (r: string[]) => `| ${Array.from({ length: width }, (_, k) => r[k] ?? '').join(' | ')} |`;
      if (lastList) lines.push('');
      lines.push(line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line), '');
      lastList = false;
    } else para(m[0]);
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
/** Parse a .docx file into Markdown for a Doc. Throws an Error with a user-readable message. */
export function parseDocx(bytes: Uint8Array): { markdown: string; truncated: boolean } {
  const xml = unzipParts(bytes, n => n === 'word/document.xml', 'Word')['word/document.xml'];
  if (!xml) throw new Error('This is not a readable Word file.');
  const md = docxMarkdown(xml);
  if (!md) throw new Error('This Word file has no text to import.');
  return { markdown: md.slice(0, DOC_MAX), truncated: md.length > DOC_MAX };
}
