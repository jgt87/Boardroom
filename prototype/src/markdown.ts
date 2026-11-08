// Markdown helpers for Doc objects (item 33) and Markdown paste (item 34).
// Evidence: Markdown parsing/rendering chunk 12834… and the showdown library chunk. Rendering uses the
// public `marked` package; raw HTML in the source is always escaped, never injected.
import { Marked } from 'marked';
import type { Token, Tokens } from 'marked';
import type { Item, Point } from './model.ts';
import { createItem } from './model.ts';
import { calloutOf, calloutLabels } from './doc-tools.ts';

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** `@[Name]`: a mention in Doc Markdown. Names have no brackets or line breaks and are at most 80 characters. */
const MENTION_SOURCE = /^@\[([^[\]\n]{1,80})\]/;
/** Markdown for a mention chip (brackets and line breaks in the name are dropped). */
export const mentionMarkdown = (name: string) =>
  `@[${name
    .replace(/[[\]\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)}]`;
const safeHref = (href: string) => (/^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : '');

/** Render Markdown to sanitised HTML. Headings get ids `doc-h-<n>` in document order (matches docOutline). */
export function renderMarkdown(md: string): string {
  let heading = 0;
  const marked = new Marked({ gfm: true, breaks: false, async: false });
  marked.use({
    // `++text++` is underline (item 115); Markdown has no native underline.
    extensions: [
      {
        name: 'underline',
        level: 'inline',
        start: (src: string) => src.indexOf('++'),
        tokenizer(this: any, src: string) {
          const m = /^\+\+(?=\S)([\s\S]*?\S)\+\+/.exec(src);
          return m ? { type: 'underline', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) } : undefined;
        },
        renderer(this: any, token: any) {
          return `<u>${this.parser.parseInline(token.tokens)}</u>`;
        },
      },
      // `==text==` is a highlight.
      {
        name: 'highlight',
        level: 'inline',
        start: (src: string) => src.indexOf('=='),
        tokenizer(this: any, src: string) {
          const m = /^==(?=[^\s=])([\s\S]*?[^\s=])==/.exec(src);
          return m ? { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) } : undefined;
        },
        renderer(this: any, token: any) {
          return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
        },
      },
      // `{mark:#rrggbb}text{/mark}` is a highlight in another colour (decision R6a-Q2, 2026-11-08); `==text==`
      // stays the default yellow. Only six-digit hex colours are accepted.
      {
        name: 'colorMark',
        level: 'inline',
        start: (src: string) => src.indexOf('{mark:'),
        tokenizer(this: any, src: string) {
          const m = /^\{mark:(#[0-9a-fA-F]{6})\}([\s\S]+?)\{\/mark\}/.exec(src);
          return m
            ? { type: 'colorMark', raw: m[0], color: m[1].toLowerCase(), tokens: this.lexer.inlineTokens(m[2]) }
            : undefined;
        },
        renderer(this: any, token: any) {
          const color = /^#[0-9a-f]{6}$/.test(token.color) ? token.color : '#fff27a';
          return `<mark class="doc-mark" style="background:${color}">${this.parser.parseInline(token.tokens)}</mark>`;
        },
      },
      // `{color:#rrggbb}text{/color}` is coloured text; only six-digit hex colours are accepted.
      {
        name: 'textColor',
        level: 'inline',
        start: (src: string) => src.indexOf('{color:'),
        tokenizer(this: any, src: string) {
          const m = /^\{color:(#[0-9a-fA-F]{6})\}([\s\S]+?)\{\/color\}/.exec(src);
          return m
            ? { type: 'textColor', raw: m[0], color: m[1].toLowerCase(), tokens: this.lexer.inlineTokens(m[2]) }
            : undefined;
        },
        renderer(this: any, token: any) {
          const color = /^#[0-9a-f]{6}$/.test(token.color) ? token.color : '#25252c';
          return `<span class="doc-color" style="color:${color}">${this.parser.parseInline(token.tokens)}</span>`;
        },
      },
      // `@[Name]` is a mention chip.
      {
        name: 'mention',
        level: 'inline',
        start: (src: string) => src.indexOf('@['),
        tokenizer(src: string) {
          const m = MENTION_SOURCE.exec(src);
          return m ? { type: 'mention', raw: m[0], name: m[1].trim() } : undefined;
        },
        renderer(token: any) {
          const name = escapeHtml(token.name);
          return `<span class="doc-mention" contenteditable="false" data-mention="${name}">@${name}</span>`;
        },
      },
    ],
    renderer: {
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text);
      },
      heading(this: any, token: Tokens.Heading) {
        return `<h${token.depth} id="doc-h-${heading++}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      link(this: any, token: Tokens.Link) {
        const href = safeHref(token.href),
          inner = this.parser.parseInline(token.tokens);
        return href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${inner}</a>`
          : inner;
      },
      // Callouts (item 79): GitHub-style `> [!NOTE]` blocks become labelled note regions.
      blockquote(this: any, token: Tokens.Blockquote) {
        const callout = calloutOf(token.text);
        if (!callout) return false;
        const inner = (this.parser.parse(token.tokens) as string)
          .replace(/^\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING)\]\s*/i, '<p>')
          .replace(/<p>\s*<\/p>\s*/g, '');
        const label = calloutLabels[callout.kind];
        return `<div class="doc-callout doc-callout-${callout.kind}" role="note" aria-label="${label}" data-callout="${callout.kind}"><p class="doc-callout-title" contenteditable="false">${label}</p>${inner}</div>\n`;
      },
      // No network loads from documents: images show their description only.
      image(token: Tokens.Image) {
        return `<span class="doc-image-alt">[${escapeHtml(token.text || 'image')}]</span>`;
      },
    },
  });
  // Task-list checkboxes are read-only previews; give them an accessible name.
  return (marked.parse(md) as string).replace(
    /<input (checked="" )?disabled="" type="checkbox">/g,
    (_, checked) => `<input ${checked ?? ''}disabled="" type="checkbox" aria-label="${checked ? 'Done' : 'To do'}">`,
  );
}

function walk(tokens: Token[], visit: (t: Token) => void) {
  for (const t of tokens) {
    visit(t);
    const anyT = t as any;
    if (Array.isArray(anyT.tokens)) walk(anyT.tokens, visit);
    if (Array.isArray(anyT.items)) for (const item of anyT.items) walk([item], visit);
  }
}
/** Headings in document order: level, plain text and the index used for `doc-h-<index>` anchors. */
export function docOutline(md: string): { level: number; text: string; index: number }[] {
  const out: { level: number; text: string; index: number }[] = [];
  walk(new Marked({ gfm: true }).lexer(md), t => {
    if (t.type === 'heading')
      out.push({ level: (t as Tokens.Heading).depth, text: plain((t as Tokens.Heading).text), index: out.length });
  });
  return out;
}

/** Strip inline Markdown to readable plain text (links keep their address). */
export function plain(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, label: string, url: string) =>
      label === url ? url : `${label} (${url})`,
    )
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\+\+(.+?)\+\+/g, '$1')
    .replace(/==(.+?)==/g, '$1')
    .replace(/\{color:#[0-9a-fA-F]{6}\}([\s\S]*?)\{\/color\}/g, '$1')
    .replace(/\{mark:#[0-9a-fA-F]{6}\}([\s\S]*?)\{\/mark\}/g, '$1')
    .replace(/@\[([^[\]\n]{1,80})\]/g, '@$1')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/** Heuristic: does pasted text use Markdown structure (headings, lists, quotes, fences, tasks)? */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length > 200000) return false;
  const lines = text.split(/\r?\n/);
  const structural = lines.filter(
    l =>
      /^\s{0,3}#{1,6}\s+\S/.test(l) ||
      /^\s*([-*+]|\d+[.)])\s+\S/.test(l) ||
      /^\s{0,3}>\s?\S/.test(l) ||
      /^\s{0,3}(```|~~~)/.test(l),
  ).length;
  return structural >= 1 && (structural >= 2 || lines.length >= 2 || /^\s{0,3}#{1,6}\s/.test(text));
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string };
function blocks(md: string): Block[] {
  const out: Block[] = [];
  const listItems = (list: Tokens.List): string[] =>
    list.items.flatMap(item => {
      const own = plain(
        item.tokens
          .filter(t => t.type !== 'list')
          .map(t => (t as any).text ?? '')
          .join(' '),
      );
      const nested = item.tokens.filter((t): t is Tokens.List => t.type === 'list').flatMap(listItems);
      return [(item.task ? (item.checked ? '☑ ' : '☐ ') : '') + own, ...nested].filter(s => s.trim());
    });
  for (const t of new Marked({ gfm: true }).lexer(md)) {
    if (t.type === 'heading')
      out.push({ kind: 'heading', level: (t as Tokens.Heading).depth, text: plain((t as Tokens.Heading).text) });
    else if (t.type === 'paragraph' || t.type === 'text')
      out.push({ kind: 'paragraph', text: plain((t as Tokens.Paragraph).text) });
    else if (t.type === 'blockquote') out.push({ kind: 'paragraph', text: plain((t as Tokens.Blockquote).text) });
    else if (t.type === 'list')
      out.push({ kind: 'list', ordered: (t as Tokens.List).ordered, items: listItems(t as Tokens.List) });
    else if (t.type === 'code') out.push({ kind: 'code', text: (t as Tokens.Code).text });
    else if (t.type === 'html') out.push({ kind: 'paragraph', text: plain((t as Tokens.HTML).text) });
  }
  return out.filter(b => (b.kind === 'list' ? b.items.length : b.text.trim()));
}
/** Number of items each paste mode would create (for the choice panel). */
export function markdownSummary(md: string): { text: number; notes: number } {
  const b = blocks(md),
    listCount = b.reduce((n, x) => n + (x.kind === 'list' ? x.items.length : 0), 0);
  return { text: b.length, notes: Math.min(100, listCount || b.filter(x => x.kind !== 'heading').length) };
}

/**
 * Convert Markdown into board objects placed from `at` (top-left).
 * - text: headings become bold text objects sized by level; paragraphs and code become text; lists one bulleted/numbered text.
 * - notes: every list item becomes a sticky note in a 4-column grid (paragraphs when there are no lists), up to 100.
 * - doc: a single Doc object holding the Markdown.
 */
export function markdownToItems(md: string, mode: 'text' | 'notes' | 'doc', at: Point): Item[] {
  if (mode === 'doc') {
    const doc = createItem('doc', at.x, at.y, '#ffffff');
    return [{ ...doc, data: { ...doc.data, markdown: md.slice(0, 60000) } }];
  }
  const list = blocks(md);
  if (mode === 'notes') {
    const lines = list.some(b => b.kind === 'list')
      ? list.flatMap(b => (b.kind === 'list' ? b.items : []))
      : list.filter(b => b.kind !== 'heading').map(b => (b as { text: string }).text);
    return lines.slice(0, 100).map((text, index) => ({
      ...createItem('note', at.x + (index % 4) * 230, at.y + Math.floor(index / 4) * 230),
      text: text.slice(0, 6000),
    }));
  }
  const out: Item[] = [];
  let y = at.y;
  for (const b of list) {
    const item = createItem('text', at.x, y);
    if (b.kind === 'heading') {
      const size = b.level === 1 ? 40 : b.level === 2 ? 32 : b.level === 3 ? 28 : 24;
      Object.assign(item, {
        text: b.text,
        w: 560,
        h: Math.ceil(size * 1.4) + 12,
        format: { fontSize: size, bold: true, align: 'left' },
      });
    } else if (b.kind === 'list')
      Object.assign(item, {
        text: b.items.join('\n'),
        w: 560,
        h: b.items.length * 22 * 1.4 + 16,
        format: { fontSize: 22, align: 'left', list: b.ordered ? 'number' : 'bullet' },
      });
    else if (b.kind === 'code')
      Object.assign(item, {
        text: b.text,
        w: 560,
        h: b.text.split('\n').length * 18 * 1.4 + 16,
        format: { fontSize: 18, fontFamily: 'monospace', align: 'left' },
      });
    else
      Object.assign(item, {
        text: b.text,
        w: 560,
        h: Math.max(1, Math.ceil(b.text.length / 40)) * 22 * 1.4 + 16,
        format: { fontSize: 22, align: 'left' },
      });
    item.text = item.text.slice(0, 6000);
    out.push(item);
    y += item.h + 16;
    if (out.length >= 200) break;
  }
  return out;
}
