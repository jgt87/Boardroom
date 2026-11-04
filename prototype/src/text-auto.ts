// Text auto-formatting on commit (track R5): typed "- " or "1. " lines become a bullet or numbered list.
import type { Item, TextFormat } from './model.ts';

const BULLET = /^\s*[-*•]\s+/,
  NUMBER = /^\s*\d{1,3}[.)]\s+/;

/**
 * When every non-empty line starts with a list marker ("- ", "* ", "• " or "1. ", "2) "), return the text
 * without the markers (and without blank lines) and the matching list format. Returns null when the text is
 * not a list or the object already has a list format.
 */
export function autoList(text: string, format: TextFormat | undefined): { text: string; format: TextFormat } | null {
  if (format?.list && format.list !== 'none') return null;
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return null;
  const kind = lines.every(l => BULLET.test(l)) ? 'bullet' : lines.every(l => NUMBER.test(l)) ? 'number' : null;
  if (!kind) return null;
  const marker = kind === 'bullet' ? BULLET : NUMBER;
  return { text: lines.map(l => l.replace(marker, '')).join('\n'), format: { ...format, list: kind } };
}

/** Kinds whose committed text is checked for auto-lists. */
export const autoListKinds = (item: Item, isShape: boolean) => item.type === 'note' || item.type === 'text' || isShape;
