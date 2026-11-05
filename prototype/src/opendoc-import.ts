// OpenDocument import (track J): text documents (.odt) become a Doc, presentations (.odp) become Slides.
// Pure: no React, no DOM. Uses the public fflate package (through office-import.ts) to read content.xml
// and styles.xml only; the XML is read as data with a small tag tokenizer and never placed in the page.
// ODT: paragraphs, headings, bulleted and numbered lists (nested), bold, italic, strikethrough, underline
// and simple tables. ODP: one slide per draw:page with its title and text; speaker notes are left out.
import { DOC_MAX } from './doc-tools.ts';
import { decodeXml, segmentsMarkdown, unzipParts } from './office-import.ts';
import type { Segment } from './office-import.ts';
import type { Slide } from './specs-activities.ts';
import { newSlide, DECK_MAX, SLIDE_TITLE_MAX, SLIDE_BODY_MAX } from './specs-activities.ts';

const ODT_MIMES = ['application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.text-template'];
const ODP_MIMES = [
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.presentation-template',
];

const attrOf = (attrs: string, name: string) => attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`))?.[1];
/** Canonical flag string (b, i, s, u in that order) of a set of formatting flags. */
const flags = (s: string) => ['b', 'i', 's', 'u'].filter(f => s.includes(f)).join('');

type TextStyle = { fmt: string; parent?: string; heading?: number };
/**
 * Character formatting of each automatic or named style in content.xml and styles.xml, resolved through
 * parent styles, plus the heading level implied by a paragraph style (Title, Heading N).
 */
export function odfStyles(...xmls: string[]): Map<string, { fmt: string; heading?: number }> {
  const raw = new Map<string, TextStyle>();
  for (const xml of xmls)
    for (const m of xml.matchAll(/<style:style\b([^>]*?)(?:\/>|>([\s\S]*?)<\/style:style>)/g)) {
      const name = attrOf(m[1], 'style:name');
      if (!name) continue;
      const props = m[2]?.match(/<style:text-properties\b([^>]*)>/)?.[1] ?? '',
        weight = attrOf(props, 'fo:font-weight'),
        style = attrOf(props, 'fo:font-style'),
        strike = attrOf(props, 'style:text-line-through-style'),
        under = attrOf(props, 'style:text-underline-style'),
        display = decodeXml(attrOf(m[1], 'style:display-name') ?? name.replace(/_20_/g, ' ')),
        level = attrOf(m[1], 'style:default-outline-level'),
        heading = /^title$/i.test(display)
          ? 1
          : level && /^\d$/.test(level)
            ? Number(level)
            : Number(display.match(/^heading\s*(\d)$/i)?.[1] ?? 0) || undefined;
      raw.set(name, {
        fmt:
          (weight === 'bold' || Number(weight) >= 600 ? 'b' : '') +
          (style === 'italic' || style === 'oblique' ? 'i' : '') +
          (strike && strike !== 'none' ? 's' : '') +
          (under && under !== 'none' ? 'u' : ''),
        parent: attrOf(m[1], 'style:parent-style-name'),
        heading,
      });
    }
  const out = new Map<string, { fmt: string; heading?: number }>();
  for (const name of raw.keys()) {
    let fmt = '',
      heading: number | undefined,
      at: string | undefined = name;
    for (let depth = 0; at && depth < 10; depth++) {
      const s = raw.get(at);
      if (!s) break;
      fmt += s.fmt;
      heading ??= s.heading;
      at = s.parent;
    }
    out.set(name, { fmt: flags(fmt), heading });
  }
  return out;
}
/** For each list style, whether each level (0-based) is numbered. */
export function odfListStyles(...xmls: string[]): Map<string, boolean[]> {
  const out = new Map<string, boolean[]>();
  for (const xml of xmls)
    for (const m of xml.matchAll(/<text:list-style\b([^>]*)>([\s\S]*?)<\/text:list-style>/g)) {
      const name = attrOf(m[1], 'style:name');
      if (!name) continue;
      const levels: boolean[] = [];
      for (const l of m[2].matchAll(/<text:list-level-style-(number|bullet|image)\b([^>]*)>/g)) {
        const level = Number(attrOf(l[2], 'text:level') ?? 1) - 1;
        if (level >= 0 && level < 10) levels[level] = l[1] === 'number' && !!attrOf(l[2], 'style:num-format');
      }
      out.set(name, levels);
    }
  return out;
}

/** Elements whose content is not part of the document text (notes, comments, indexes, drawings). */
const SKIPPED = new Set([
  'office:annotation',
  'text:note',
  'text:tracked-changes',
  'text:table-of-content',
  'text:alphabetical-index',
  'text:illustration-index',
  'text:table-index',
  'text:object-index',
  'text:user-index',
  'text:bibliography',
  'text:sequence-decls',
  'text:variable-decls',
  'text:user-field-decls',
  'office:forms',
  'draw:frame',
  'draw:custom-shape',
  'draw:g',
  'svg:title',
  'svg:desc',
]);
const TOKEN = /<(\/?)([^\s>/!?]+)([^>]*?)(\/?)>|<[!?][^>]*>|([^<]+)/g;

/** Convert the body of an ODT content.xml to Markdown. `styles` is the text of styles.xml, if any. */
export function odtMarkdown(content: string, styles = ''): string {
  const body = content.match(/<office:text\b[^>]*>([\s\S]*)<\/office:text>/)?.[1] ?? '';
  const textStyles = odfStyles(styles, content),
    listStyles = odfListStyles(styles, content);
  const lines: string[] = [];
  let lastList = false,
    para: { segs: Segment[]; heading: number; fmt: string } | null = null,
    skip: { name: string; depth: number } | null = null,
    itemFresh = false,
    tableDepth = 0,
    table: { rows: string[][]; cell: string[] | null } | null = null;
  const spans: string[] = [],
    lists: { levels: boolean[] }[] = [];
  const add = (text: string) => {
    if (!para || !text) return;
    const fmt = flags(para.fmt + spans.join('')),
      last = para.segs[para.segs.length - 1];
    if (last && last.fmt === fmt) last.text += text;
    else para.segs.push({ text, fmt });
  };
  const endPara = () => {
    if (!para) return;
    const { segs, heading } = para;
    para = null;
    const text = segmentsMarkdown(segs).replace(/\s+/g, ' ').trim();
    if (table?.cell) {
      if (text) table.cell.push(text);
      return;
    }
    if (!text) return;
    if (heading) {
      if (lastList) lines.push('');
      lines.push(`${'#'.repeat(Math.min(6, heading))} ${text.replace(/^\*\*(.*)\*\*$/, '$1')}`, '');
      lastList = false;
    } else if (lists.length) {
      const level = Math.min(4, lists.length - 1),
        ordered = lists[lists.length - 1].levels[lists.length - 1] ?? false;
      if (!lastList && lines.length && lines[lines.length - 1] !== '') lines.push('');
      if (itemFresh) lines.push(`${'  '.repeat(level)}${ordered ? '1.' : '-'} ${text}`);
      else lines.push(`${'  '.repeat(level + 1)}${text}`);
      itemFresh = false;
      lastList = true;
    } else {
      if (lastList) lines.push('');
      lines.push(text, '');
      lastList = false;
    }
  };
  for (const m of body.matchAll(TOKEN)) {
    const [, close, name, attrs = '', selfClose, text] = m;
    if (skip) {
      if (name === skip.name && !selfClose) {
        if (close) skip.depth--;
        else skip.depth++;
        if (!skip.depth) skip = null;
      }
      continue;
    }
    if (text !== undefined) {
      add(decodeXml(text.replace(/\s+/g, ' ')));
      continue;
    }
    if (!name) continue;
    if (!close && !selfClose && SKIPPED.has(name)) {
      skip = { name, depth: 1 };
      continue;
    }
    if (name === 'text:p' || name === 'text:h') {
      if (close) endPara();
      else {
        endPara();
        const style = textStyles.get(attrOf(attrs, 'text:style-name') ?? '');
        const heading =
          name === 'text:h' ? Number(attrOf(attrs, 'text:outline-level') ?? 1) || 1 : (style?.heading ?? 0);
        para = { segs: [], heading, fmt: style?.fmt ?? '' };
        if (selfClose) endPara();
      }
    } else if (name === 'text:span' || name === 'text:a') {
      if (selfClose) continue;
      if (close) spans.pop();
      else spans.push(name === 'text:span' ? (textStyles.get(attrOf(attrs, 'text:style-name') ?? '')?.fmt ?? '') : '');
    } else if (name === 'text:s' && selfClose)
      add(' '.repeat(Math.min(100, Number(attrOf(attrs, 'text:c') ?? 1) || 1)));
    else if ((name === 'text:tab' || name === 'text:line-break') && selfClose) add(' ');
    else if (name === 'text:list') {
      if (selfClose) continue;
      if (close) lists.pop();
      else {
        const style = attrOf(attrs, 'text:style-name');
        lists.push({ levels: (style && listStyles.get(style)) || lists[lists.length - 1]?.levels || [] });
      }
    } else if ((name === 'text:list-item' || name === 'text:list-header') && !close)
      itemFresh = name === 'text:list-item';
    else if (name === 'table:table') {
      if (selfClose) continue;
      if (!close) {
        endPara();
        if (++tableDepth === 1) table = { rows: [], cell: null };
      } else if (--tableDepth === 0 && table) {
        const rows = table.rows.filter(r => r.length);
        table = null;
        if (!rows.length) continue;
        let width = Math.max(1, ...rows.map(r => r.length));
        while (width > 1 && rows.every(r => !r[width - 1])) width--;
        const line = (r: string[]) => `| ${Array.from({ length: width }, (_, k) => r[k] ?? '').join(' | ')} |`;
        if (lastList) lines.push('');
        lines.push(line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line), '');
        lastList = false;
      }
    } else if (table && tableDepth === 1) {
      if (name === 'table:table-row' && !close && !selfClose) table.rows.push([]);
      else if (name === 'table:table-cell' || name === 'table:covered-table-cell') {
        const row = table.rows[table.rows.length - 1];
        if (!row) continue;
        const repeat = Math.min(50, Math.max(1, Number(attrOf(attrs, 'table:number-columns-repeated') ?? 1) || 1));
        if (selfClose) for (let k = 0; k < repeat && row.length < 100; k++) row.push('');
        else if (!close) table.cell = [];
        else if (table.cell) {
          endPara();
          if (row.length < 100) row.push(table.cell.join(' ').replace(/\|/g, '\\|'));
          table.cell = null;
        }
      }
    }
  }
  endPara();
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readParts(bytes: Uint8Array, kind: string, mimes: string[]) {
  const parts = unzipParts(bytes, n => n === 'content.xml' || n === 'styles.xml' || n === 'mimetype', kind);
  const mime = parts.mimetype?.trim();
  if (!parts['content.xml'] || (mime !== undefined && !mimes.includes(mime)))
    throw new Error(`This is not a readable ${kind} file.`);
  return parts;
}

/** Parse an .odt file into Markdown for a Doc. Throws an Error with a user-readable message. */
export function parseOdt(bytes: Uint8Array): { markdown: string; truncated: boolean } {
  const parts = readParts(bytes, 'OpenDocument text', ODT_MIMES);
  if (!/<office:text\b/.test(parts['content.xml'])) throw new Error('This is not a readable OpenDocument text file.');
  const md = odtMarkdown(parts['content.xml'], parts['styles.xml'] ?? '');
  if (!md) throw new Error('This document has no text to import.');
  return { markdown: md.slice(0, DOC_MAX), truncated: md.length > DOC_MAX };
}

// ---- ODP ---------------------------------------------------------------------------------------------

/** Plain text of each paragraph (text:p or text:h) in an XML fragment; line breaks are kept. */
export function odfParagraphs(xml: string): string[] {
  return [...xml.matchAll(/<text:(p|h)\b[^>]*?(?:\/>|>([\s\S]*?)<\/text:\1>)/g)]
    .map(p =>
      decodeXml(
        (p[2] ?? '')
          .replace(/<text:s\b([^>]*?)\/>/g, (_, a: string) =>
            ' '.repeat(Math.min(100, Number(attrOf(a, 'text:c') ?? 1) || 1)),
          )
          .replace(/<text:tab\b[^>]*\/>/g, ' ')
          .replace(/<text:line-break\b[^>]*\/>/g, '\n')
          .replace(/<[^>]*>/g, '')
          .replace(/[ \t\r]*\n[ \t\r]*/g, '\n')
          .replace(/[ \t\r]+/g, ' '),
      ).trim(),
    )
    .filter(Boolean);
}
const IGNORED_CLASSES = new Set(['page-number', 'date-time', 'footer', 'header', 'notes', 'handout']);
/** Title and text of one draw:page (its speaker notes and comments are left out). */
export function slideFromPage(page: string): Slide {
  const content = page
    .replace(/<presentation:notes\b[\s\S]*?<\/presentation:notes>/g, '')
    .replace(/<office:annotation\b[\s\S]*?<\/office:annotation>/g, '');
  let title = '',
    subtitle = false;
  const body: string[] = [];
  for (const m of content.matchAll(
    /<draw:(frame|custom-shape|rect|ellipse|polygon)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/draw:\1>)/g,
  )) {
    const cls = attrOf(m[2], 'presentation:class') ?? '';
    if (IGNORED_CLASSES.has(cls)) continue;
    const text = odfParagraphs(m[3] ?? '');
    if (!text.length) continue;
    if (!title && cls === 'title') title = text.join(' ');
    else {
      if (cls === 'subtitle') subtitle = true;
      body.push(...text);
    }
  }
  const layout = title && subtitle && body.length <= 2 ? 'title' : !title && !body.length ? 'blank' : 'content';
  return newSlide(layout, {
    title: title.replace(/\s+/g, ' ').slice(0, SLIDE_TITLE_MAX),
    body: body.join('\n').slice(0, SLIDE_BODY_MAX),
  });
}
/** Slides of an ODP content.xml, in page order. */
export function odpSlides(content: string): Slide[] {
  const body = content.match(/<office:presentation\b[^>]*>([\s\S]*)<\/office:presentation>/)?.[1] ?? '';
  return [...body.matchAll(/<draw:page\b[^>]*?(?:\/>|>([\s\S]*?)<\/draw:page>)/g)]
    .slice(0, DECK_MAX)
    .map(p => slideFromPage(p[1] ?? ''));
}
/** Parse an .odp file into slides. Throws an Error with a user-readable message. */
export function parseOdp(bytes: Uint8Array): Slide[] {
  const parts = readParts(bytes, 'OpenDocument presentation', ODP_MIMES);
  if (!/<office:presentation\b/.test(parts['content.xml']))
    throw new Error('This is not a readable OpenDocument presentation file.');
  const slides = odpSlides(parts['content.xml']);
  if (!slides.length) throw new Error('No slides were found in this presentation.');
  return slides;
}
