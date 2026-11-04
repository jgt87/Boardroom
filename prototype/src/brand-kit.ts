// Brand kit (track R3): a saved palette and a default font, kept per browser and shown first in colour and
// font pickers. Pure apart from the small subscribe/notify store used by the UI (no React, no DOM).
import { fontFamilies, type FontFamily } from './model.ts';

export const BRAND_KEY = 'boardroom.brandkit.v1';
export const BRAND_COLORS_MAX = 12;
export type BrandKit = { colors: string[]; font?: FontFamily };
export const emptyBrandKit: BrandKit = { colors: [] };

/** A brand kit from untrusted data: distinct #rrggbb colours (lower-case, at most 12) and a known font. */
export function cleanBrandKit(raw: unknown): BrandKit {
  const v = (raw && typeof raw === 'object' ? raw : {}) as { colors?: unknown; font?: unknown };
  const colors = Array.isArray(v.colors)
    ? [
        ...new Set(
          v.colors
            .filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
            .map(c => c.toLowerCase()),
        ),
      ].slice(0, BRAND_COLORS_MAX)
    : [];
  const kit: BrandKit = { colors };
  if (typeof v.font === 'string' && (fontFamilies as readonly string[]).includes(v.font))
    kit.font = v.font as FontFamily;
  return kit;
}
export function parseBrandKit(raw: string | null): BrandKit {
  try {
    return cleanBrandKit(raw ? JSON.parse(raw) : null);
  } catch {
    return { colors: [] };
  }
}
export const addBrandColor = (kit: BrandKit, color: string): BrandKit =>
  cleanBrandKit({ ...kit, colors: [...kit.colors, color] });
export const removeBrandColor = (kit: BrandKit, color: string): BrandKit => ({
  ...kit,
  colors: kit.colors.filter(c => c !== color.toLowerCase()),
});
/** Brand colours first, then the rest of `palette` without repeats. */
export const brandFirst = (kit: BrandKit, palette: readonly string[]): string[] => [
  ...new Set([...kit.colors, ...palette.map(c => c.toLowerCase())]),
];
/** Fonts with the brand font first. */
export const fontsBrandFirst = (kit: BrandKit): FontFamily[] =>
  kit.font ? [kit.font, ...fontFamilies.filter(f => f !== kit.font)] : [...fontFamilies];

// ---- Per-browser store ---------------------------------------------------------------------------
let current: BrandKit | null = null;
const listeners = new Set<() => void>();
export function getBrandKit(): BrandKit {
  if (!current)
    try {
      current = parseBrandKit(localStorage.getItem(BRAND_KEY));
    } catch {
      current = { colors: [] };
    }
  return current;
}
/** Save the brand kit for this browser and notify subscribers. Returns false when storage failed. */
export function setBrandKit(kit: BrandKit): boolean {
  current = cleanBrandKit(kit);
  listeners.forEach(l => l());
  try {
    localStorage.setItem(BRAND_KEY, JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
}
export function subscribeBrandKit(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
