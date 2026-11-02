// User story map model (item 36).
// Evidence: ComputeUsmWidget (activities, swimlanes, releaseIndex, isStory, addSwimlane, makeCard).
// Removing an activity or release moves its cards to a neighbouring column/row; removing the last
// remaining activity or release is refused, so cards are never silently deleted.
export type StoryActivity = { id: string; title: string };
export type StoryRelease = { id: string; title: string };
export type StoryCard = { id: string; title: string; activity: string; release: string };
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
        !rels.has(c.release),
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
