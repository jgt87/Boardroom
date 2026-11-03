// Emoji dataset helpers (item 6). Evidence: the audit's "Emoji dataset and translation loading" module.
// Data comes from the public `unicode-emoji-json` package (MIT), loaded on demand into its own chunk.
// Everything except `loadEmojiGroups` is pure so it can be tested without a browser.

export type EmojiEntry = { emoji: string; name: string; slug: string; skin: boolean; group: string };
export type EmojiGroup = { slug: string; name: string; emojis: EmojiEntry[] };
type RawGroup = {
  name: string;
  slug: string;
  emojis: { emoji: string; name: string; slug: string; skin_tone_support: boolean }[];
};

/** Skin-tone modifiers (Fitzpatrick types 1-2 to 6), as listed in the dataset's emoji components. */
export const skinTones: { id: string; label: string; modifier: string }[] = [
  { id: 'default', label: 'Default skin tone', modifier: '' },
  { id: 'light', label: 'Light skin tone', modifier: '\u{1F3FB}' },
  { id: 'medium_light', label: 'Medium-light skin tone', modifier: '\u{1F3FC}' },
  { id: 'medium', label: 'Medium skin tone', modifier: '\u{1F3FD}' },
  { id: 'medium_dark', label: 'Medium-dark skin tone', modifier: '\u{1F3FE}' },
  { id: 'dark', label: 'Dark skin tone', modifier: '\u{1F3FF}' },
];

export const RECENT_KEY = 'boardroom.emoji.recent';
export const TONE_KEY = 'boardroom.emoji.tone';
export const RECENT_LIMIT = 24;

/** Convert the dataset's groups into the picker's shape. */
export function normalizeGroups(raw: RawGroup[]): EmojiGroup[] {
  return raw.map(g => ({
    slug: g.slug,
    name: g.name,
    emojis: g.emojis.map(e => ({
      emoji: e.emoji,
      name: e.name,
      slug: e.slug,
      skin: !!e.skin_tone_support,
      group: g.slug,
    })),
  }));
}

let cache: Promise<EmojiGroup[]> | null = null;
/** Load the dataset once (a separate chunk, so the board does not pay for it until the picker opens). */
export function loadEmojiGroups(): Promise<EmojiGroup[]> {
  cache ??= import('unicode-emoji-json/data-by-group.json').then(m =>
    normalizeGroups((m as { default: RawGroup[] }).default),
  );
  return cache;
}

/**
 * Search by name and slug. Ranking: name starts with the query, then a word in the name starts with it,
 * then the name contains it, then the slug contains it. Ties keep dataset order.
 */
export function searchEmojis(groups: EmojiGroup[], query: string, limit = 240): EmojiEntry[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  const qSlug = q.replace(/ /g, '_'),
    scored: { e: EmojiEntry; score: number; order: number }[] = [];
  let order = 0;
  for (const g of groups)
    for (const e of g.emojis) {
      order++;
      const name = e.name.toLowerCase();
      const score = name.startsWith(q)
        ? 0
        : name.split(/[\s:-]+/).some(w => w.startsWith(q))
          ? 1
          : name.includes(q)
            ? 2
            : e.slug.includes(qSlug)
              ? 3
              : -1;
      if (score >= 0) scored.push({ e, score, order });
    }
  return scored
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map(s => s.e);
}

/**
 * Apply a skin-tone modifier: inserted after the first code point. A variation selector (U+FE0F) right
 * after the base is replaced, because the modifier already selects the emoji presentation.
 */
export function applySkinTone(emoji: string, modifier: string): string {
  if (!modifier) return emoji;
  const points = [...emoji];
  const rest = points[1] === '️' ? points.slice(2) : points.slice(1);
  return points[0] + modifier + rest.join('');
}

/** Most-recent-first list without duplicates, capped. */
export function pushRecent(list: string[], emoji: string, limit = RECENT_LIMIT): string[] {
  return [emoji, ...list.filter(e => e !== emoji)].slice(0, limit);
}

/** Whether a string is acceptable as a stored emoji (note marker or stamp). */
export function isValidEmojiValue(value: unknown, maxLength = 32): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[<>]/.test(value) &&
    ![...value].some(ch => (ch.codePointAt(0) ?? 0) < 32 || ch.codePointAt(0) === 127)
  );
}

/** Per-browser storage that never throws (private windows and blocked storage simply forget). */
export function readStored<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
export function writeStored(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: nothing to remember */
  }
}
export const isRecentList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= RECENT_LIMIT && v.every(e => isValidEmojiValue(e));
export const isToneId = (v: unknown): v is string => typeof v === 'string' && skinTones.some(t => t.id === v);
