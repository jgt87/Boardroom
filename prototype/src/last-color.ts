// Last-used colour per object kind (track R1a): shapes (fill), text (colour) and connectors (line colour) created
// later in the session start with the colour the user last applied to that kind. Session only: kept in memory and
// mirrored to session storage when it is available. Pure apart from the guarded storage access.
import type { Item } from './model.ts';
import { isShapeKind } from './shapes.ts';
import { normalizeHex } from './color-store.ts';

export type ColorFamily = 'shape' | 'text' | 'connector';
export const LAST_COLOR_KEY = 'boardroom.colors.last.v1';
const FAMILIES: ColorFamily[] = ['shape', 'text', 'connector'];

/** The colour family of an object kind, or null for kinds that keep their own default colour. */
export function colorFamily(kind: string): ColorFamily | null {
  if (isShapeKind(kind)) return 'shape';
  if (kind === 'text') return 'text';
  if (kind === 'arrow') return 'connector';
  return null;
}

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
export type LastColors = Partial<Record<ColorFamily, string>>;

export function parseLastColors(raw: string | null): LastColors {
  try {
    const value = raw ? JSON.parse(raw) : null;
    const out: LastColors = {};
    if (value && typeof value === 'object')
      for (const f of FAMILIES) {
        const hex = typeof value[f] === 'string' ? normalizeHex(value[f]) : null;
        if (hex) out[f] = hex;
      }
    return out;
  } catch {
    return {};
  }
}

export function createLastColorStore(storage: () => Storage | null) {
  let colors: LastColors | null = null;
  const load = (): LastColors => {
    if (colors) return colors;
    try {
      colors = parseLastColors(storage()?.getItem(LAST_COLOR_KEY) ?? null);
    } catch {
      colors = {};
    }
    return colors;
  };
  return {
    get: (family: ColorFamily): string | undefined => load()[family],
    /** Remember a colour applied to an object of this kind; other kinds and invalid colours are ignored. */
    remember(kind: string, color: string): void {
      const family = colorFamily(kind),
        hex = normalizeHex(color);
      if (!family || !hex || load()[family] === hex) return;
      colors = { ...load(), [family]: hex };
      try {
        storage()?.setItem(LAST_COLOR_KEY, JSON.stringify(colors));
      } catch {
        /* storage unavailable: the colour is kept in memory for this session */
      }
    },
    /** The item with its kind's last-used colour applied (the same item when there is none). */
    apply<T extends Item>(item: T): T {
      const family = colorFamily(item.type),
        hex = family ? load()[family] : undefined;
      return hex && hex !== item.fill ? { ...item, fill: hex } : item;
    },
    reset(): void {
      colors = {};
    },
  };
}

const sessionStore = (): Storage | null => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};
/** The app's store for this tab's session. */
export const lastColors = createLastColorStore(sessionStore);
/** Remember the colour applied to each of these objects for its kind. */
export function rememberKindColors(items: Item[], color: string): void {
  for (const kind of new Set(items.map(i => i.type))) lastColors.remember(kind, color);
}
/**
 * The colour new sticky notes take after `color` was applied to `items` (open question P1-Q2): only when every
 * recoloured object is a sticky note, so colours picked for shapes, text or a mixed selection leave it alone.
 * Null when it does not change.
 */
export function stickyColorFrom(items: Item[], color: string): string | null {
  return items.length && items.every(i => i.type === 'note') ? normalizeHex(color) : null;
}
