// Code block display options (gap D14): font size and line numbers, stored in `item.data`. Pure: no React, no DOM.
import type { Item } from './model.ts';

/** Font sizes offered for code blocks, in pixels. */
export const codeFontSizes = [10, 12, 13, 14, 16, 18, 20, 24, 28, 32] as const;
export const CODE_FONT_DEFAULT = 13;
export const CODE_FONT_MIN = 10;
export const CODE_FONT_MAX = 32;

export type CodeData = { fontSize?: number; lineNumbers?: boolean };

/** The code block's font size in pixels (the default when unset). */
export const codeFontSize = (item: Pick<Item, 'data'>): number =>
  typeof item.data?.fontSize === 'number' ? item.data.fontSize : CODE_FONT_DEFAULT;
/** Line numbers are shown unless switched off. */
export const codeLineNumbers = (item: Pick<Item, 'data'>): boolean => item.data?.lineNumbers !== false;

/** The next or previous offered size from `size` (stays at the ends). */
export function stepCodeFont(size: number, direction: 1 | -1): number {
  const sizes: readonly number[] = codeFontSizes;
  if (direction > 0) return sizes.find(s => s > size) ?? CODE_FONT_MAX;
  return [...sizes].reverse().find(s => s < size) ?? CODE_FONT_MIN;
}

/** Data with the code options set; defaults are left out (and empty data dropped) so older boards stay unchanged. */
export function withCodeOptions(
  data: Record<string, unknown> | undefined,
  options: CodeData,
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = { ...data };
  if (options.fontSize !== undefined) {
    if (options.fontSize === CODE_FONT_DEFAULT) delete next.fontSize;
    else next.fontSize = options.fontSize;
  }
  if (options.lineNumbers !== undefined) {
    if (options.lineNumbers) delete next.lineNumbers;
    else next.lineNumbers = false;
  }
  return Object.keys(next).length ? next : undefined;
}

/** Validation for `parseBoard`: a code block's optional font size and line-number switch. */
export function validateCodeData(data: unknown): void {
  if (data === undefined) return;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid code block options.');
  const d = data as Record<string, unknown>;
  if (
    (d.fontSize !== undefined &&
      (typeof d.fontSize !== 'number' ||
        !Number.isInteger(d.fontSize) ||
        d.fontSize < CODE_FONT_MIN ||
        d.fontSize > CODE_FONT_MAX)) ||
    (d.lineNumbers !== undefined && typeof d.lineNumbers !== 'boolean')
  )
    throw new Error('Invalid code block options.');
}

/**
 * Split highlighted HTML (escaped text plus `<span …>` tokens, as Prism writes it) into one string per source
 * line. Spans open across a line break are closed at the end of the line and reopened on the next, so each
 * line is well-formed on its own and can sit next to its own line number.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [],
    open: string[] = [];
  let line = '';
  for (const part of html.split(/(<span\b[^>]*>|<\/span>|\n)/)) {
    if (!part) continue;
    if (part === '\n') {
      lines.push(line + '</span>'.repeat(open.length));
      line = open.join('');
    } else if (part.startsWith('<span')) {
      open.push(part);
      line += part;
    } else if (part === '</span>') {
      if (open.length) {
        open.pop();
        line += part;
      }
    } else line += part;
  }
  lines.push(line + '</span>'.repeat(open.length));
  return lines;
}
