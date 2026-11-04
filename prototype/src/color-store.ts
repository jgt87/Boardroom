// Colour system (track R5): recently used colours, saved custom colours and the colours already on the board.
// Recent and saved colours are per-browser conveniences in local storage; nothing is stored in the board.
import type { Board } from './model.ts';

export const RECENT_COLORS_KEY = 'boardroom.colors.recent.v1';
export const SAVED_COLORS_KEY = 'boardroom.colors.saved.v1';
export const RECENT_LIMIT = 10;
export const SAVED_LIMIT = 16;
const HEX = /^#[0-9a-f]{6}$/;

/** Lower-case #rrggbb, or null for anything else (#rgb is expanded). */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (HEX.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null;
}
export function parseColorList(raw: string | null, limit: number): string[] {
  try {
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const v of list) {
      const hex = typeof v === 'string' ? normalizeHex(v) : null;
      if (hex && !out.includes(hex)) out.push(hex);
    }
    return out.slice(0, limit);
  } catch {
    return [];
  }
}
/** Most recent first, without duplicates. */
export function pushRecent(list: string[], color: string): string[] {
  const hex = normalizeHex(color);
  return hex ? [hex, ...list.filter(c => c !== hex)].slice(0, RECENT_LIMIT) : list;
}
/** Saved colours keep their order; a new one is added at the end (the oldest drops beyond the limit). */
export function addSaved(list: string[], color: string): string[] {
  const hex = normalizeHex(color);
  if (!hex || list.includes(hex)) return list;
  return [...list, hex].slice(-SAVED_LIMIT);
}
export const removeSaved = (list: string[], color: string) => list.filter(c => c !== color);
/** Fill colours used on the board, most used first (an eyedropper over the board's own objects). */
export function boardColors(board: Board, limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const i of board.items) {
    const hex = normalizeHex(i.fill);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([c]) => c);
}

export function loadColors(key: string, limit: number): string[] {
  try {
    return parseColorList(localStorage.getItem(key), limit);
  } catch {
    return [];
  }
}
export function storeColors(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage unavailable: the colours stay for this session only */
  }
}
/** Remember a used colour (selection bar, colour menu). */
export function rememberColor(color: string): void {
  storeColors(RECENT_COLORS_KEY, pushRecent(loadColors(RECENT_COLORS_KEY, RECENT_LIMIT), color));
}
