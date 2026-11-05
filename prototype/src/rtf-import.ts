// Rich Text Format (.rtf) import into a Doc (track J). Pure: no React, no DOM.
// A small tokenizer reads text, paragraphs (\par), bold (\b), italic (\i), strikethrough (\strike), underline
// (\ul), unicode (\uN with its fallback skipped) and hex escapes (\'hh, in the declared ANSI code page).
// Headings come from \outlinelevelN and list items from \listtext / \pntext markers. Font, colour and style
// tables, pictures, objects, headers, footers, footnotes, field instructions and every \* destination are
// ignored. The file is read as data only; nothing in it is executed or placed in the page as markup.
import { DOC_MAX } from './doc-tools.ts';
import { segmentsMarkdown } from './office-import.ts';
import type { Segment } from './office-import.ts';

export const RTF_MAX_BYTES = 20 * 1024 * 1024;
const MAX_DEPTH = 500;

/** Destinations whose content is not document text. */
const SKIP = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'listtable',
  'listoverridetable',
  'revtbl',
  'rsidtbl',
  'filetbl',
  'info',
  'pict',
  'object',
  'objdata',
  'header',
  'headerl',
  'headerr',
  'headerf',
  'footer',
  'footerl',
  'footerr',
  'footerf',
  'footnote',
  'annotation',
  'fldinst',
  'generator',
  'themedata',
  'colorschememapping',
  'datastore',
  'latentstyles',
  'xmlnstbl',
  'pgdsctbl',
  'shp',
  'shpinst',
  'nonshppict',
  'shppict',
  'bkmkstart',
  'bkmkend',
  'ftnsep',
  'ftnsepc',
  'aftnsep',
  'aftnsepc',
  'docvar',
  'userprops',
  'template',
  'mmathPr',
  'background',
  'xe',
  'tc',
]);
const SYMBOLS: Record<string, string> = {
  emdash: '—',
  endash: '–',
  bullet: '•',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  emspace: ' ',
  enspace: ' ',
  qmspace: ' ',
  tab: ' ',
  line: ' ',
  cell: ' ',
};
const tables = new Map<number, string>();
/** The 256 characters of a single-byte Windows code page (1252 when the page is unknown or multi-byte). */
function codePage(page: number): string {
  const key = [874, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258].includes(page) ? page : 1252;
  let table = tables.get(key);
  if (!table) {
    try {
      table = new TextDecoder(`windows-${key}`).decode(Uint8Array.from({ length: 256 }, (_, k) => k));
    } catch {
      table = String.fromCharCode(...Array.from({ length: 256 }, (_, k) => k));
    }
    tables.set(key, table);
  }
  return table;
}

type State = { b: boolean; i: boolean; s: boolean; u: boolean; skip: boolean; marker: boolean; uc: number };
type Props = { outline: number | null; list: boolean; level: number };

/** Convert RTF source text (one character per byte) to Markdown. */
export function rtfMarkdown(src: string): string {
  if (!/^\s*\{\\rtf/.test(src)) throw new Error('This is not an RTF document.');
  const lines: string[] = [],
    stack: State[] = [];
  let st: State = { b: false, i: false, s: false, u: false, skip: false, marker: false, uc: 1 },
    props: Props = { outline: null, list: false, level: 0 },
    segs: Segment[] = [],
    marker = '',
    pendingSkip = 0,
    groupStart = false,
    cp = codePage(1252),
    lastList = false;
  const emit = (text: string) => {
    if (st.skip || !text) return;
    if (st.marker) {
      marker += text;
      return;
    }
    const fmt = `${st.b ? 'b' : ''}${st.i ? 'i' : ''}${st.s ? 's' : ''}${st.u ? 'u' : ''}`,
      last = segs[segs.length - 1];
    if (last && last.fmt === fmt) last.text += text;
    else segs.push({ text, fmt });
  };
  const endPara = () => {
    const text = segmentsMarkdown(segs).replace(/\s+/g, ' ').trim(),
      mark = marker.trim();
    segs = [];
    marker = '';
    if (!text) return;
    if (props.outline !== null && props.outline < 6 && !mark) {
      if (lastList) lines.push('');
      lines.push(`${'#'.repeat(props.outline + 1)} ${text.replace(/^\*\*(.*)\*\*$/, '$1')}`, '');
      lastList = false;
    } else if (mark || props.list) {
      const ordered = /^\(?[0-9a-z]{1,4}[.)]/i.test(mark) && !/^[•·o§\-–*]$/.test(mark);
      if (!lastList && lines.length && lines[lines.length - 1] !== '') lines.push('');
      lines.push(`${'  '.repeat(Math.min(4, props.level))}${ordered ? '1.' : '-'} ${text}`);
      lastList = true;
    } else {
      if (lastList) lines.push('');
      lines.push(text, '');
      lastList = false;
    }
  };
  const n = src.length;
  let k = 0;
  while (k < n) {
    const ch = src[k];
    if (ch === '{') {
      if (stack.length >= MAX_DEPTH) throw new Error('This RTF file is nested too deeply to import.');
      stack.push(st);
      st = { ...st };
      groupStart = true;
      pendingSkip = 0;
      k++;
      continue;
    }
    if (ch === '}') {
      st = stack.pop() ?? st;
      groupStart = false;
      pendingSkip = 0;
      k++;
      continue;
    }
    if (ch === '\\') {
      const next = src[k + 1] ?? '';
      if (/[a-zA-Z]/.test(next)) {
        let j = k + 1;
        while (j < n && j - k <= 32 && /[a-zA-Z]/.test(src[j])) j++;
        const word = src.slice(k + 1, j);
        let param: number | null = null;
        const num = /^-?\d{1,10}/.exec(src.slice(j, j + 11));
        if (num) {
          param = Number(num[0]);
          j += num[0].length;
        }
        if (src[j] === ' ') j++;
        k = j;
        const first = groupStart;
        groupStart = false;
        if (word === 'bin') {
          k += Math.max(0, param ?? 0);
          continue;
        }
        if (first && SKIP.has(word)) {
          st.skip = true;
          continue;
        }
        if (st.skip) continue;
        if (word === 'u' && param !== null) {
          emit(String.fromCharCode(param < 0 ? param + 65536 : param));
          pendingSkip = st.uc;
          continue;
        }
        if (pendingSkip > 0) {
          pendingSkip--;
          continue;
        }
        // List markers often restate paragraph properties ({\listtext\pard ...}); they do not apply there.
        if (st.marker && ['pard', 'outlinelevel', 'ls', 'ilvl'].includes(word)) continue;
        const on = param !== 0;
        switch (word) {
          case 'par':
          case 'sect':
          case 'page':
          case 'row':
            endPara();
            break;
          case 'pard':
            props = { outline: null, list: false, level: 0 };
            break;
          case 'plain':
            Object.assign(st, { b: false, i: false, s: false, u: false });
            break;
          case 'b':
            st.b = on;
            break;
          case 'i':
            st.i = on;
            break;
          case 'strike':
          case 'striked':
            st.s = on;
            break;
          case 'ul':
          case 'uld':
          case 'uldb':
          case 'ulw':
          case 'ulwave':
          case 'uldash':
            st.u = on;
            break;
          case 'ulnone':
            st.u = false;
            break;
          case 'uc':
            st.uc = Math.max(0, Math.min(10, param ?? 1));
            break;
          case 'ansicpg':
            cp = codePage(param ?? 1252);
            break;
          case 'outlinelevel':
            props.outline = param !== null && param >= 0 && param <= 8 ? param : null;
            break;
          case 'ls':
            props.list = (param ?? 0) > 0;
            break;
          case 'ilvl':
            props.level = Math.max(0, Math.min(8, param ?? 0));
            break;
          case 'listtext':
          case 'pntext':
            if (first) st.marker = true;
            break;
          default:
            if (SYMBOLS[word] !== undefined) {
              // A tab ends a list marker ("1.\tab").
              if (word === 'tab' && st.marker) break;
              emit(SYMBOLS[word]);
            }
        }
        continue;
      }
      k += 2;
      groupStart = groupStart && next === '*';
      if (next === '*') {
        // Ignorable destination: skipped unless it is one this reader understands (none are).
        st.skip = true;
        continue;
      }
      if (next === "'") {
        const hex = src.slice(k, k + 2);
        k += 2;
        if (st.skip) continue;
        if (pendingSkip > 0) {
          pendingSkip--;
          continue;
        }
        if (/^[0-9a-f]{2}$/i.test(hex)) emit(cp[parseInt(hex, 16)]);
        continue;
      }
      if (st.skip) continue;
      if (next === '\n' || next === '\r') endPara();
      else if (next === '\\' || next === '{' || next === '}') {
        if (pendingSkip > 0) pendingSkip--;
        else emit(next);
      } else if (next === '~') emit(' ');
      else if (next === '_') emit('-');
      continue;
    }
    k++;
    groupStart = false;
    if (ch === '\r' || ch === '\n' || st.skip) continue;
    if (pendingSkip > 0) {
      pendingSkip--;
      continue;
    }
    emit(ch);
  }
  endPara();
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parse an .rtf file into Markdown for a Doc. Throws an Error with a user-readable message. */
export function parseRtf(bytes: Uint8Array): { markdown: string; truncated: boolean } {
  if (bytes.length > RTF_MAX_BYTES) throw new Error('RTF files up to 20 MB can be imported.');
  // RTF is 7-bit text with escapes; each byte is read as one character.
  let src = '';
  for (let k = 0; k < bytes.length; k += 0x8000) src += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  const md = rtfMarkdown(src);
  if (!md) throw new Error('This RTF file has no text to import.');
  return { markdown: md.slice(0, DOC_MAX), truncated: md.length > DOC_MAX };
}
