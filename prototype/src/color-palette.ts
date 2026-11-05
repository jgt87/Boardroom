// Base colour palette for the colour menu (track R1a): ten hues in five shades from light to dark, with spoken
// names, and parsing for typed hex colours. Pure: no React, no DOM.
import { normalizeHex } from './color-store.ts';

export interface PaletteHue {
  /** Hue name, lower case ("red"); the grey row names each shade itself. */
  name: string;
  /** Five shades, lightest first. */
  shades: string[];
}

/** Shade words, lightest first: "Pale red", "Light red", "Red", "Dark red", "Deep red". */
export const SHADE_NAMES = ['Pale', 'Light', '', 'Dark', 'Deep'] as const;
const GREY_NAMES = ['White', 'Light grey', 'Grey', 'Dark grey', 'Black'];

export const PALETTE: PaletteHue[] = [
  { name: 'grey', shades: ['#ffffff', '#d4d4d8', '#a1a1aa', '#52525b', '#18181b'] },
  { name: 'red', shades: ['#fee2e2', '#fca5a5', '#ef4444', '#b91c1c', '#7f1d1d'] },
  { name: 'orange', shades: ['#ffedd5', '#fdba74', '#f97316', '#c2410c', '#7c2d12'] },
  { name: 'yellow', shades: ['#fef9c3', '#fde047', '#eab308', '#a16207', '#713f12'] },
  { name: 'green', shades: ['#dcfce7', '#86efac', '#22c55e', '#15803d', '#14532d'] },
  { name: 'teal', shades: ['#ccfbf1', '#5eead4', '#14b8a6', '#0f766e', '#134e4a'] },
  { name: 'blue', shades: ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'] },
  { name: 'violet', shades: ['#ede9fe', '#c4b5fd', '#8b5cf6', '#6d28d9', '#4c1d95'] },
  { name: 'pink', shades: ['#fce7f3', '#f9a8d4', '#ec4899', '#be185d', '#831843'] },
  { name: 'brown', shades: ['#f5ebe0', '#d6b89a', '#a47148', '#7a4f2c', '#4a2f1a'] },
];

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
/** Spoken name of one palette cell, e.g. "Dark blue". */
export function shadeName(hue: PaletteHue, shade: number): string {
  if (hue.name === 'grey') return GREY_NAMES[shade] ?? 'Grey';
  const word = SHADE_NAMES[shade] ?? '';
  return word ? `${word} ${hue.name}` : capital(hue.name);
}

/** Palette rows by shade (row 0 is the lightest), each listing one colour per hue. */
export function paletteRows(palette: PaletteHue[] = PALETTE): { hex: string; name: string }[][] {
  const depth = Math.max(0, ...palette.map(h => h.shades.length));
  return Array.from({ length: depth }, (_, shade) =>
    palette.filter(h => h.shades[shade]).map(h => ({ hex: h.shades[shade], name: shadeName(h, shade) })),
  );
}

let names: Map<string, string> | null = null;
/** Name of a palette colour, or null when the colour is not in the base palette. */
export function paletteName(hex: string): string | null {
  if (!names) {
    names = new Map();
    PALETTE.forEach(h => h.shades.forEach((c, i) => names!.set(c, shadeName(h, i))));
  }
  return names.get(hex.trim().toLowerCase()) ?? null;
}

export const HEX_HINT = 'Enter a hex colour such as #4262ff or #48f.';
/** A typed hex colour: "#rgb" or "#rrggbb" (the "#" may be left out), as lower-case #rrggbb, or an error. */
export function parseHexInput(text: string): { hex: string } | { error: string } {
  const raw = text.trim();
  if (!raw) return { error: HEX_HINT };
  const hex = normalizeHex(raw.startsWith('#') ? raw : `#${raw}`);
  return hex ? { hex } : { error: HEX_HINT };
}

/** Next cell in a rows × columns grid for an arrow, Home or End key; null for other keys. */
export function gridStep(
  rows: number,
  cols: number,
  at: { row: number; col: number },
  key: string,
): { row: number; col: number } | null {
  if (rows <= 0 || cols <= 0) return null;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - 1, v));
  switch (key) {
    case 'ArrowRight':
      return { row: at.row, col: clamp(at.col + 1, cols) };
    case 'ArrowLeft':
      return { row: at.row, col: clamp(at.col - 1, cols) };
    case 'ArrowDown':
      return { row: clamp(at.row + 1, rows), col: at.col };
    case 'ArrowUp':
      return { row: clamp(at.row - 1, rows), col: at.col };
    case 'Home':
      return { row: at.row, col: 0 };
    case 'End':
      return { row: at.row, col: cols - 1 };
    default:
      return null;
  }
}
