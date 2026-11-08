// Doc to PDF export (gap list I2). The Markdown is laid out as real, selectable PDF text with the public jsPDF
// package (loaded on demand). Pure layout helpers are exported for tests; `docPdf` is only run in the browser.
import { Marked } from 'marked';
import type { Token, Tokens } from 'marked';
import { plain } from './markdown.ts';
import { calloutOf, calloutLabels } from './doc-tools.ts';

export type DocBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'item'; text: string; depth: number; marker: string }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string; label?: string }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'rule' };

// Backslash escapes of any ASCII punctuation are dropped (text dropped in from board objects escapes more of it).
const inline = (s: string) =>
  plain(s.replace(/\+\+(\S(?:[\s\S]*?\S)?)\+\+/g, '$1')).replace(/\\([!-/:-@[-`{-~])/g, '$1');

/** The printable blocks of a Doc, in order. Inline formatting is reduced to plain text. */
export function docBlocks(md: string): DocBlock[] {
  const out: DocBlock[] = [];
  const list = (l: Tokens.List, depth: number) =>
    l.items.forEach((item, k) => {
      const own = item.tokens
        .filter(t => t.type !== 'list')
        .map(t => (t as { text?: string }).text ?? '')
        .join(' ');
      const marker = item.task ? (item.checked ? '[x]' : '[ ]') : l.ordered ? `${Number(l.start || 1) + k}.` : '•';
      out.push({ kind: 'item', text: inline(own), depth, marker });
      for (const t of item.tokens) if (t.type === 'list') list(t as Tokens.List, depth + 1);
    });
  const visit = (t: Token) => {
    switch (t.type) {
      case 'heading':
        out.push({ kind: 'heading', level: (t as Tokens.Heading).depth, text: inline((t as Tokens.Heading).text) });
        break;
      case 'paragraph':
      case 'text':
        out.push({ kind: 'paragraph', text: inline((t as Tokens.Paragraph).text) });
        break;
      case 'list':
        list(t as Tokens.List, 0);
        break;
      case 'code':
        out.push({ kind: 'code', text: (t as Tokens.Code).text });
        break;
      case 'blockquote': {
        const callout = calloutOf((t as Tokens.Blockquote).text);
        out.push(
          callout
            ? { kind: 'quote', text: inline(callout.rest.replace(/^>\s?/gm, '')), label: calloutLabels[callout.kind] }
            : { kind: 'quote', text: inline((t as Tokens.Blockquote).text) },
        );
        break;
      }
      case 'table': {
        const table = t as Tokens.Table;
        out.push({
          kind: 'table',
          rows: [table.header.map(c => inline(c.text)), ...table.rows.map(r => r.map(c => inline(c.text)))],
        });
        break;
      }
      case 'hr':
        out.push({ kind: 'rule' });
        break;
      case 'html':
        out.push({ kind: 'paragraph', text: inline((t as Tokens.HTML).text) });
        break;
    }
  };
  new Marked({ gfm: true }).lexer(md).forEach(visit);
  return out.filter(b => b.kind === 'rule' || b.kind === 'table' || b.text.trim() || b.kind === 'item');
}

const replacements: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  '•': '·',
  '☐': '[ ]',
  '☑': '[x]',
  '→': '->',
  '←': '<-',
};
/**
 * Text the built-in PDF fonts can show (Latin-1): common punctuation is mapped to plain equivalents and
 * other characters become "?". Fonts are not embedded, which keeps the file small.
 */
export function pdfSafe(text: string): string {
  return [...text]
    .map(ch => replacements[ch] ?? (ch.charCodeAt(0) <= 0xff && ch.length === 1 ? ch : '?'))
    .join('')
    .replace(/\t/g, '    ');
}
/**
 * Code points the embedded Unicode font (Liberation Sans, from pdfjs-dist) draws: Latin-1, Latin Extended-A and B,
 * IPA, spacing modifiers and combining accents, Greek and Coptic, Cyrillic, general punctuation, currency signs,
 * letterlike symbols and arrows (decision Q17, 2026-11-08). CJK and emoji are not in the font.
 */
const unicodeRanges: [number, number][] = [
  [0x20, 0x7e],
  [0xa0, 0x24f],
  [0x250, 0x36f],
  [0x370, 0x3ff],
  [0x400, 0x52f],
  [0x2000, 0x206f],
  [0x20a0, 0x20cf],
  [0x2100, 0x214f],
  [0x2190, 0x21ff],
];
/** Text the embedded Unicode font can show; other characters become "?" (like `pdfSafe` does for Latin-1). */
export function pdfUnicodeSafe(text: string): string {
  return [...text]
    .map(ch => {
      const c = ch.codePointAt(0)!;
      return ch === '\n' || unicodeRanges.some(([lo, hi]) => c >= lo && c <= hi) ? ch : (replacements[ch] ?? '?');
    })
    .join('')
    .replace(/\t/g, '    ');
}

/** jsPDF font family name for the embedded Unicode font. */
export const UNICODE_FONT = 'LiberationSans';
/**
 * Embed Liberation Sans (regular, bold, italic) into `pdf`. The font files are separate assets fetched from this
 * app only when a Doc is exported, so the app itself does not grow. Returns false when they cannot be loaded; the
 * export then falls back to the built-in Latin-1 fonts. Browser only.
 */
async function embedUnicodeFont(pdf: {
  addFileToVFS: (name: string, data: string) => void;
  addFont: (file: string, family: string, style: string) => void;
}): Promise<boolean> {
  try {
    const files = await Promise.all([
      import('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url'),
      import('pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url'),
      import('pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf?url'),
    ]);
    const styles = ['normal', 'bold', 'italic'];
    for (const [k, mod] of files.entries()) {
      const res = await fetch(mod.default);
      if (!res.ok) return false;
      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const name = `LiberationSans-${styles[k]}.ttf`;
      pdf.addFileToVFS(name, btoa(binary));
      pdf.addFont(name, UNICODE_FONT, styles[k]);
    }
    return true;
  } catch {
    return false;
  }
}

/** Safe download name for a Doc PDF. */
export function pdfFileName(title: string): string {
  const base = [...title]
    .map(ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'doc'}.pdf`;
}

/** Build the PDF for a Doc (A4 portrait, real text). Browser only. */
export async function docPdf(title: string, md: string): Promise<{ blob: Blob; pages: number; replaced: boolean }> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' }),
    W = pdf.internal.pageSize.getWidth(),
    H = pdf.internal.pageSize.getHeight(),
    M = 56,
    width = W - M * 2;
  let y = M,
    replaced = false;
  // Unicode text (Greek, Cyrillic, accented Latin) with the embedded font; Latin-1 when it cannot be loaded.
  // Code blocks keep the built-in monospaced font, which is Latin-1 only.
  const unicode = await embedUnicodeFont(pdf);
  pdf.setProperties({ title: pdfSafe(title) });
  const fit = (s: string, mono: boolean) => {
    const safe = unicode && !mono ? pdfUnicodeSafe(s) : pdfSafe(s);
    if (safe !== s.replace(/\t/g, '    ') && /\?/.test(safe)) replaced = true;
    return safe;
  };
  const write = (
    text: string,
    size: number,
    opts: { font?: string; style?: string; indent?: number; gap?: number },
  ) => {
    const mono = opts.font === 'courier';
    pdf.setFont(mono ? 'courier' : unicode ? UNICODE_FONT : 'helvetica', opts.style ?? 'normal');
    pdf.setFontSize(size);
    const lh = size * 1.35,
      x = M + (opts.indent ?? 0),
      lines: string[] = pdf.splitTextToSize(fit(text, mono), width - (opts.indent ?? 0));
    for (const line of lines) {
      if (y + lh > H - M) {
        pdf.addPage();
        y = M;
      }
      pdf.text(line, x, y + size);
      y += lh;
    }
    y += opts.gap ?? size * 0.6;
  };
  write(title, 24, { style: 'bold', gap: 14 });
  for (const b of docBlocks(md)) {
    if (b.kind === 'heading') {
      y += 6;
      write(b.text, [20, 16, 13.5, 12, 11, 11][b.level - 1] ?? 11, { style: 'bold', gap: 6 });
    } else if (b.kind === 'paragraph') write(b.text, 11, {});
    else if (b.kind === 'item') write(`${b.marker} ${b.text}`, 11, { indent: 14 + b.depth * 16, gap: 3 });
    else if (b.kind === 'code') write(b.text, 9.5, { font: 'courier', indent: 10 });
    else if (b.kind === 'quote') {
      if (b.label) write(b.label, 11, { style: 'bold', indent: 12, gap: 2 });
      write(b.text, 11, { style: b.label ? 'normal' : 'italic', indent: 12 });
    } else if (b.kind === 'table')
      for (const [k, row] of b.rows.entries())
        write(row.join('   |   '), 10, { style: k === 0 ? 'bold' : 'normal', gap: 3 });
    else {
      if (y + 12 > H - M) {
        pdf.addPage();
        y = M;
      }
      pdf.setDrawColor(200);
      pdf.line(M, y + 4, W - M, y + 4);
      y += 14;
    }
  }
  return { blob: pdf.output('blob'), pages: pdf.getNumberOfPages(), replaced };
}
