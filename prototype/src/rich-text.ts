// Per-word rich text for canvas text objects (text, sticky notes, shapes). Pure: no React, no DOM.
// `item.text` stays the plain-text source of truth; `item.spans` style ranges of it and are only used
// while `item.spansFor` equals the hash of the current text, so any code path that changes the text
// without knowing about spans (find and replace, switch type, imports) can never misalign the styles.
import type { Item } from './model.ts';

export type SpanStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Text colour, `#rrggbb`. */
  color?: string;
  /** Background behind the words, `#rrggbb`. */
  highlight?: string;
  /** Link address: http(s) or mailto only. */
  href?: string;
  /** Person mentioned; the covered text is `@Name` and is edited as one chip. */
  mention?: string;
};
/** A styled range `[start, end)` of the plain text. Spans are sorted and never overlap. */
export type TextSpan = SpanStyle & { start: number; end: number };
export type Run = { text: string; style: SpanStyle };
export type ToggleKey = 'bold' | 'italic' | 'underline' | 'strike';

export const MAX_SPANS = 1000;
export const MENTION_MAX = 80;
const styleKeys = ['bold', 'italic', 'underline', 'strike', 'color', 'highlight', 'href', 'mention'] as const;
const flagKeys: ToggleKey[] = ['bold', 'italic', 'underline', 'strike'];
const hex = /^#[0-9a-f]{6}$/i;

/** FNV-1a (32 bit) of the text, as 8 hex digits. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Only http(s) and mailto addresses, without spaces or control characters. */
export function isSafeHref(href: unknown): href is string {
  return (
    typeof href === 'string' &&
    href.length > 0 &&
    href.length <= 2048 &&
    /^(https?:\/\/[^\s]|mailto:[^\s])/i.test(href) &&
    // eslint-disable-next-line no-control-regex
    !/[\s\u0000-\u001f\u007f<>"]/.test(href)
  );
}
/** Turn what someone typed into a link address, or null: bare domains get https://, e-mail addresses mailto:. */
export function normalizeHref(input: string): string | null {
  const text = input.trim();
  if (!text || /\s/.test(text)) return null;
  let candidate = text;
  const bare = !/^[a-z][a-z0-9+.-]*:/i.test(text);
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(text)) candidate = `mailto:${text}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) candidate = `https://${text}`;
  if (/^mailto:/i.test(candidate)) return isSafeHref(candidate) ? candidate : null;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    // Typed without a scheme: only accept something that looks like a domain.
    if (bare && !url.hostname.includes('.')) return null;
    return isSafeHref(url.href) ? url.href : null;
  } catch {
    return null;
  }
}
/** A mention name as stored: trimmed, single line, no square brackets (they delimit mentions in Markdown). */
export function cleanMentionName(name: string): string {
  return name
    .replace(/[[\]\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MENTION_MAX);
}
export const isMentionName = (name: unknown): name is string =>
  typeof name === 'string' && !!name && name.length <= MENTION_MAX && cleanMentionName(name) === name;

const styleOf = (s: SpanStyle): SpanStyle => {
  const out: SpanStyle = {};
  for (const k of flagKeys) if (s[k]) out[k] = true;
  if (s.color && hex.test(s.color)) out.color = s.color.toLowerCase();
  if (s.highlight && hex.test(s.highlight)) out.highlight = s.highlight.toLowerCase();
  if (isSafeHref(s.href)) out.href = s.href;
  if (isMentionName(s.mention)) out.mention = s.mention;
  return out;
};
const isPlain = (s: SpanStyle) => styleKeys.every(k => s[k] === undefined);
export const sameStyle = (a: SpanStyle, b: SpanStyle) => styleKeys.every(k => (a[k] ?? null) === (b[k] ?? null));

/** Sorted, clipped to `length`, non-overlapping (later spans lose the overlap), adjacent equal spans merged. */
export function normalizeSpans(spans: readonly TextSpan[], length: number): TextSpan[] {
  const sorted = spans
    .map(s => ({ ...styleOf(s), start: Math.max(0, Math.floor(s.start)), end: Math.min(length, Math.floor(s.end)) }))
    .filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && !isPlain(s))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: TextSpan[] = [];
  for (const s of sorted) {
    const prev = out[out.length - 1];
    if (prev && s.start < prev.end) {
      if (s.end <= prev.end) continue;
      s.start = prev.end;
    }
    // Two mentions next to each other stay two chips.
    if (prev && prev.end === s.start && !prev.mention && !s.mention && sameStyle(prev, s)) prev.end = s.end;
    else out.push(s);
  }
  return out.slice(0, MAX_SPANS);
}

/** The spans that apply to the current text, or none when they were made for different text. */
export function activeSpans(item: Pick<Item, 'text' | 'spans' | 'spansFor'>): TextSpan[] {
  if (!item.spans?.length || item.spansFor !== textHash(item.text)) return [];
  return normalizeSpans(item.spans, item.text.length);
}

/** Split text into consecutive runs covering all of it, each with its own style. */
export function runsOf(text: string, spans: readonly TextSpan[]): Run[] {
  const runs: Run[] = [];
  let at = 0;
  for (const s of normalizeSpans(spans, text.length)) {
    if (s.start > at) runs.push({ text: text.slice(at, s.start), style: {} });
    const { start, end, ...style } = s;
    runs.push({ text: text.slice(start, end), style });
    at = end;
  }
  if (at < text.length || !runs.length) runs.push({ text: text.slice(at), style: {} });
  return runs;
}
/** Runs per line (split at "\n"; mentions never contain line breaks). */
export function lineRuns(text: string, spans: readonly TextSpan[]): Run[][] {
  const lines: Run[][] = [[]];
  for (const run of runsOf(text, spans)) {
    const parts = run.text.split('\n');
    parts.forEach((part, k) => {
      if (k > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, style: run.style });
    });
  }
  return lines;
}
/** Join runs (for example read back from the editor) into plain text and normalised spans. */
export function fromRuns(runs: readonly Run[]): { text: string; spans: TextSpan[] } {
  let text = '';
  const spans: TextSpan[] = [];
  for (const r of runs) {
    const style = styleOf(r.style);
    if (r.text && !isPlain(style)) spans.push({ ...style, start: text.length, end: text.length + r.text.length });
    text += r.text;
  }
  return { text, spans: normalizeSpans(spans, text.length) };
}

/** Every character of `text` with its style, as segments: gaps included, so they cover [0, length). */
function segments(spans: readonly TextSpan[], length: number): TextSpan[] {
  const out: TextSpan[] = [];
  let at = 0;
  for (const s of normalizeSpans(spans, length)) {
    if (s.start > at) out.push({ start: at, end: s.start });
    out.push({ ...s });
    at = s.end;
  }
  if (at < length) out.push({ start: at, end: length });
  return out;
}
/** Widen [start, end) so it never cuts through a mention chip. */
function snap(spans: readonly TextSpan[], start: number, end: number): [number, number] {
  for (const s of spans)
    if (s.mention) {
      if (start > s.start && start < s.end) start = s.start;
      if (end > s.start && end < s.end) end = s.end;
    }
  return [start, end];
}
/** Apply `change` to the style of every character in [start, end); `undefined` values remove that style. */
export function applyStyle(
  text: string,
  spans: readonly TextSpan[],
  start: number,
  end: number,
  change: Partial<SpanStyle>,
): TextSpan[] {
  const length = text.length;
  [start, end] = snap(spans, Math.max(0, Math.min(start, end)), Math.min(length, Math.max(start, end)));
  if (end <= start) return normalizeSpans(spans, length);
  const out: TextSpan[] = [];
  for (const seg of segments(spans, length)) {
    const cuts = [
      seg.start,
      Math.max(seg.start, Math.min(seg.end, start)),
      Math.min(seg.end, Math.max(seg.start, end)),
      seg.end,
    ];
    for (let k = 0; k < 3; k++) {
      if (cuts[k + 1] <= cuts[k]) continue;
      const piece: TextSpan = { ...seg, start: cuts[k], end: cuts[k + 1] };
      if (k === 1) {
        for (const key of Object.keys(change) as (keyof SpanStyle)[]) {
          const value = change[key];
          if (value === undefined || value === false) delete piece[key];
          else (piece as Record<string, unknown>)[key] = value;
        }
      }
      out.push(piece);
    }
  }
  return normalizeSpans(out, length);
}
/** Styles removed by "Clear formatting" (R6a-Q1). Links and mention identities are content, not formatting. */
export const clearableStyles = ['bold', 'italic', 'underline', 'strike', 'color', 'highlight'] as const;
/**
 * Clear formatting: remove every text style from [start, end), or from the whole text when the range is empty.
 * Mention chips stay chips (only their styling goes) and links stay links. The range widens over any mention
 * it cuts through, as every other style command does.
 */
export function clearStyles(text: string, spans: readonly TextSpan[], start: number, end: number): TextSpan[] {
  const [from, to] = start === end ? [0, text.length] : [Math.min(start, end), Math.max(start, end)];
  return applyStyle(text, spans, from, to, Object.fromEntries(clearableStyles.map(k => [k, undefined])));
}

/** Is the style flag on for every character in [start, end)? */
export function hasStyle(spans: readonly TextSpan[], start: number, end: number, key: ToggleKey): boolean {
  if (end <= start) return false;
  let at = start;
  for (const s of spans) {
    if (s.end <= at) continue;
    if (s.start > at || !s[key]) return false;
    at = s.end;
    if (at >= end) return true;
  }
  return at >= end;
}
/** Ctrl+B and friends: switch the flag off when all of the range has it, else on. */
export function toggleStyle(
  text: string,
  spans: readonly TextSpan[],
  start: number,
  end: number,
  key: ToggleKey,
): TextSpan[] {
  return applyStyle(text, spans, start, end, { [key]: hasStyle(spans, start, end, key) ? undefined : true });
}
/** The style shared by the whole range (flags only when every character has them; first link found). */
export function styleIn(spans: readonly TextSpan[], start: number, end: number): SpanStyle & { href?: string } {
  const style: SpanStyle = {};
  for (const key of flagKeys) if (hasStyle(spans, start, end, key)) style[key] = true;
  const touching = spans.filter(s => s.end > start && s.start < Math.max(end, start + 1));
  const href = touching.find(s => s.href)?.href;
  if (href) style.href = href;
  return style;
}
/** The link span around a caret or range, if any (for editing an existing link). */
export function linkAt(spans: readonly TextSpan[], start: number, end: number): TextSpan | null {
  return (
    spans.find(s => s.href && s.start <= start && s.end >= end && (s.start < start || s.end > end || end > start)) ??
    null
  );
}

/**
 * Replace [start, end) with `insert`. Spans before the edit stay, spans after it shift, and spans the edit
 * cuts through shrink (a mention chip that loses any of its text is dropped). Inserted text takes `style`.
 */
export function replaceRange(
  text: string,
  spans: readonly TextSpan[],
  start: number,
  end: number,
  insert: string,
  style: SpanStyle = {},
): { text: string; spans: TextSpan[] } {
  start = Math.max(0, Math.min(start, text.length));
  end = Math.max(start, Math.min(end, text.length));
  const delta = insert.length - (end - start),
    out: TextSpan[] = [];
  for (const s of normalizeSpans(spans, text.length)) {
    if (s.end <= start) out.push(s);
    else if (s.start >= end) out.push({ ...s, start: s.start + delta, end: s.end + delta });
    else if (s.mention) continue;
    else {
      // Left part and right part of a span the edit cuts through (inserted text gets `style` instead).
      if (s.start < start) out.push({ ...s, start: s.start, end: start });
      if (s.end > end) out.push({ ...s, start: start + insert.length, end: s.end + delta });
    }
  }
  if (insert && !isPlain(styleOf(style))) out.push({ ...styleOf(style), start, end: start + insert.length });
  const next = text.slice(0, start) + insert + text.slice(end);
  return { text: next, spans: normalizeSpans(out, next.length) };
}

/** Item with new text and spans in one change; spans are dropped when there are none. */
export function withRichText<T extends Item>(item: T, text: string, spans: readonly TextSpan[]): T {
  const next = { ...item, text };
  const clean = normalizeSpans(spans, text.length);
  if (clean.length) {
    next.spans = clean;
    next.spansFor = textHash(text);
  } else {
    delete next.spans;
    delete next.spansFor;
  }
  return next;
}

/** CSS for one run on top of the object's whole-text format. */
export function runCss(style: SpanStyle): Record<string, string> {
  const css: Record<string, string> = {};
  if (style.bold) css.fontWeight = '700';
  if (style.italic) css.fontStyle = 'italic';
  const deco = [style.underline || style.href ? 'underline' : '', style.strike ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');
  if (deco) css.textDecoration = deco;
  if (style.color) css.color = style.color;
  if (style.highlight) css.backgroundColor = style.highlight;
  return css;
}

/** Validation for `parseBoard`: throws a readable error for malformed spans. */
export function validateSpans(item: Pick<Item, 'spans' | 'spansFor'>): void {
  const { spans, spansFor } = item;
  if (spans === undefined && spansFor === undefined) return;
  if (
    !Array.isArray(spans) ||
    spans.length > MAX_SPANS ||
    typeof spansFor !== 'string' ||
    !/^[0-9a-f]{8}$/.test(spansFor)
  )
    throw new Error('Invalid text styling.');
  let end = 0;
  for (const s of spans) {
    if (
      !s ||
      typeof s !== 'object' ||
      Array.isArray(s) ||
      Object.keys(s).some(k => k !== 'start' && k !== 'end' && !(styleKeys as readonly string[]).includes(k)) ||
      !Number.isInteger(s.start) ||
      !Number.isInteger(s.end) ||
      s.start < end ||
      s.end <= s.start ||
      s.end > 20000 ||
      flagKeys.some(k => s[k] !== undefined && typeof s[k] !== 'boolean') ||
      (s.color !== undefined && (typeof s.color !== 'string' || !hex.test(s.color))) ||
      (s.highlight !== undefined && (typeof s.highlight !== 'string' || !hex.test(s.highlight))) ||
      (s.href !== undefined && !isSafeHref(s.href)) ||
      (s.mention !== undefined && !isMentionName(s.mention))
    )
      throw new Error('Invalid text styling.');
    end = s.end;
  }
}
