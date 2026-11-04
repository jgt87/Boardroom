// User story map model (item 36).
// Evidence: ComputeUsmWidget (activities, swimlanes, releaseIndex, isStory, addSwimlane, makeCard).
// Removing an activity or release moves its cards to a neighbouring column/row; removing the last
// remaining activity or release is refused, so cards are never silently deleted.
export type StoryActivity = { id: string; title: string };
export type StoryRelease = { id: string; title: string };
/** `color`, `tags`, `assignee` and `link` are optional card details (track R5). */
export type StoryCard = {
  id: string;
  title: string;
  activity: string;
  release: string;
  color?: string;
  tags?: string[];
  assignee?: string;
  link?: string;
};
export type StoryCardDetails = Pick<StoryCard, 'color' | 'tags' | 'assignee' | 'link'>;
const validCardLink = (v: unknown) => {
  if (typeof v !== 'string' || !v || v.length > 2048) return false;
  try {
    const url = new URL(v);
    return ['http:', 'https:'].includes(url.protocol) && url.href === v && !url.username && !url.password;
  } catch {
    return false;
  }
};
const cardDetailsInvalid = (c: StoryCard) =>
  (c.color !== undefined && (typeof c.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.color))) ||
  (c.assignee !== undefined && (typeof c.assignee !== 'string' || !c.assignee || c.assignee.length > 120)) ||
  (c.link !== undefined && !validCardLink(c.link)) ||
  (c.tags !== undefined &&
    (!Array.isArray(c.tags) ||
      !c.tags.length ||
      c.tags.length > 10 ||
      new Set(c.tags).size !== c.tags.length ||
      c.tags.some(t => typeof t !== 'string' || !t.trim() || t !== t.trim() || t.length > 32)));
/**
 * Set or clear card details; empty values are removed so older maps keep their shape. Tags come from a
 * comma-separated list (up to 10 of 32 characters); links must be http(s).
 */
export function updateCard(
  m: StoryMap,
  cardId: string,
  patch: { color?: string; tags?: string | string[]; assignee?: string; link?: string },
): StoryMap {
  const card = m.cards.find(c => c.id === cardId);
  if (!card) throw new Error('That story no longer exists.');
  const next: StoryCard = { ...card };
  if ('color' in patch) next.color = patch.color || undefined;
  if ('assignee' in patch) next.assignee = patch.assignee?.trim().slice(0, 120) || undefined;
  if ('tags' in patch) {
    const raw = Array.isArray(patch.tags) ? patch.tags : (patch.tags ?? '').split(',');
    const tags = [...new Set(raw.map(t => t.trim().slice(0, 32)).filter(Boolean))].slice(0, 10);
    next.tags = tags.length ? tags : undefined;
  }
  if ('link' in patch) {
    const text = patch.link?.trim() ?? '';
    if (!text) next.link = undefined;
    else {
      let url: URL;
      try {
        url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text);
      } catch {
        throw new Error('Enter a valid website link.');
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Use an http or https website link.');
      next.link = url.href.slice(0, 2048);
    }
  }
  for (const k of ['color', 'tags', 'assignee', 'link'] as const) if (next[k] === undefined) delete next[k];
  if (cardDetailsInvalid(next)) throw new Error('Invalid story details.');
  return { ...m, cards: m.cards.map(c => (c.id === cardId ? next : c)) };
}
/** Short chips shown under a card title: assignee first, then tags. */
export const storyCardMeta = (c: StoryCard): string[] => [
  ...(c.assignee ? ['@' + c.assignee] : []),
  ...(c.tags ?? []).map(t => '#' + t),
];
export type StoryMap = { activities: StoryActivity[]; releases: StoryRelease[]; cards: StoryCard[] };
export const STORY_LIMITS = { activities: 30, releases: 20, cards: 500 };

export function validateStoryMap(map: unknown): asserts map is StoryMap {
  const m = map as StoryMap;
  const titled = (list: unknown, max: number) =>
    Array.isArray(list) &&
    list.length >= 1 &&
    list.length <= max &&
    list.every(x => x && typeof x.id === 'string' && x.id && typeof x.title === 'string' && x.title.length <= 200) &&
    new Set(list.map(x => x.id)).size === list.length;
  if (!m || !titled(m.activities, STORY_LIMITS.activities) || !titled(m.releases, STORY_LIMITS.releases))
    throw new Error('A story map needs 1–30 activities and 1–20 releases.');
  if (!Array.isArray(m.cards) || m.cards.length > STORY_LIMITS.cards)
    throw new Error('A story map holds up to 500 cards.');
  const acts = new Set(m.activities.map(a => a.id)),
    rels = new Set(m.releases.map(r => r.id));
  if (
    m.cards.some(
      c =>
        !c ||
        typeof c.id !== 'string' ||
        !c.id ||
        typeof c.title !== 'string' ||
        c.title.length > 1000 ||
        !acts.has(c.activity) ||
        !rels.has(c.release) ||
        cardDetailsInvalid(c),
    ) ||
    new Set(m.cards.map(c => c.id)).size !== m.cards.length
  )
    throw new Error('A story card refers to a missing activity or release.');
}
const id = () => crypto.randomUUID();
export const starterStoryMap = (): StoryMap => {
  const a1 = { id: id(), title: 'Discover' },
    a2 = { id: id(), title: 'Plan' },
    a3 = { id: id(), title: 'Deliver' },
    r1 = { id: id(), title: 'Release 1' },
    r2 = { id: id(), title: 'Release 2' };
  return {
    activities: [a1, a2, a3],
    releases: [r1, r2],
    cards: [
      { id: id(), title: 'Find the board', activity: a1.id, release: r1.id },
      { id: id(), title: 'Add first story', activity: a2.id, release: r1.id },
    ],
  };
};
export function addActivity(m: StoryMap, title = 'New activity'): StoryMap {
  if (m.activities.length >= STORY_LIMITS.activities) throw new Error('A story map holds up to 30 activities.');
  return { ...m, activities: [...m.activities, { id: id(), title }] };
}
export function addRelease(m: StoryMap, title = 'New release'): StoryMap {
  if (m.releases.length >= STORY_LIMITS.releases) throw new Error('A story map holds up to 20 releases.');
  return { ...m, releases: [...m.releases, { id: id(), title }] };
}
export function rename(m: StoryMap, kind: 'activity' | 'release', targetId: string, title: string): StoryMap {
  const key = kind === 'activity' ? 'activities' : 'releases';
  return { ...m, [key]: m[key].map(x => (x.id === targetId ? { ...x, title: title.slice(0, 200) } : x)) };
}
export function removeLane(m: StoryMap, kind: 'activity' | 'release', targetId: string): StoryMap {
  const key = kind === 'activity' ? 'activities' : 'releases',
    list = m[key] as { id: string }[],
    index = list.findIndex(x => x.id === targetId);
  if (index < 0) return m;
  if (list.length === 1) throw new Error(`A story map needs at least one ${kind}.`);
  const fallback = (list[index - 1] ?? list[index + 1]).id,
    field = kind;
  return {
    ...m,
    [key]: list.filter(x => x.id !== targetId),
    cards: m.cards.map(c => (c[field] === targetId ? { ...c, [field]: fallback } : c)),
  };
}
export function addCard(
  m: StoryMap,
  activity: string,
  release: string,
  title = 'New story',
): { map: StoryMap; id: string } {
  if (m.cards.length >= STORY_LIMITS.cards) throw new Error('A story map holds up to 500 cards.');
  if (!m.activities.some(a => a.id === activity) || !m.releases.some(r => r.id === release))
    throw new Error('Choose an existing activity and release.');
  const card = { id: id(), title, activity, release };
  return { map: { ...m, cards: [...m.cards, card] }, id: card.id };
}
export const removeCard = (m: StoryMap, cardId: string): StoryMap => ({
  ...m,
  cards: m.cards.filter(c => c.id !== cardId),
});
export const renameCard = (m: StoryMap, cardId: string, title: string): StoryMap => ({
  ...m,
  cards: m.cards.map(c => (c.id === cardId ? { ...c, title: title.slice(0, 1000) } : c)),
});
export const cellCards = (m: StoryMap, activity: string, release: string) =>
  m.cards.filter(c => c.activity === activity && c.release === release);
/** Move a card to a cell, before another card in that cell (or to the end). */
export function moveCard(
  m: StoryMap,
  cardId: string,
  activity: string,
  release: string,
  beforeId: string | null,
): StoryMap {
  const card = m.cards.find(c => c.id === cardId);
  if (!card) throw new Error('That story no longer exists.');
  if (!m.activities.some(a => a.id === activity) || !m.releases.some(r => r.id === release))
    throw new Error('Choose an existing activity and release.');
  if (beforeId === cardId) return m;
  const rest = m.cards.filter(c => c.id !== cardId),
    moved = { ...card, activity, release };
  let index = beforeId ? rest.findIndex(c => c.id === beforeId) : -1;
  if (index < 0) {
    let last = -1;
    rest.forEach((c, i) => {
      if (c.activity === activity && c.release === release) last = i;
    });
    index = last < 0 ? rest.length : last + 1;
  }
  return { ...m, cards: [...rest.slice(0, index), moved, ...rest.slice(index)] };
}
/** Keyboard alternative: up/down within a cell (crossing to adjacent releases at the ends), left/right across activities. */
export function shiftCard(m: StoryMap, cardId: string, direction: 'up' | 'down' | 'left' | 'right'): StoryMap {
  const card = m.cards.find(c => c.id === cardId);
  if (!card) return m;
  if (direction === 'left' || direction === 'right') {
    const i = m.activities.findIndex(a => a.id === card.activity),
      target = m.activities[i + (direction === 'left' ? -1 : 1)];
    return target ? moveCard(m, cardId, target.id, card.release, null) : m;
  }
  const cell = cellCards(m, card.activity, card.release),
    i = cell.indexOf(card);
  if (direction === 'up' && i > 0) return moveCard(m, cardId, card.activity, card.release, cell[i - 1].id);
  if (direction === 'down' && i < cell.length - 1)
    return moveCard(m, cardId, card.activity, card.release, cell[i + 2]?.id ?? null);
  const r = m.releases.findIndex(x => x.id === card.release),
    target = m.releases[r + (direction === 'up' ? -1 : 1)];
  if (!target) return m;
  const targetCell = cellCards(m, card.activity, target.id);
  return moveCard(m, cardId, card.activity, target.id, direction === 'down' ? (targetCell[0]?.id ?? null) : null);
}
