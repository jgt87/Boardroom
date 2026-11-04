// Space blueprints (track R3): create a space that already holds a set of boards, and save a space as a
// blueprint to reuse. Pure: built-in blueprints use the gallery templates; saved blueprints keep full board
// copies (media objects left out, as in saved templates) in this browser's local storage.
import { createItem, newBoard, type Board } from './model.ts';
import { templateItems, templateNames, type TemplateName } from './board-tools.ts';
import {
  addBoards,
  boardKey,
  cleanEmoji,
  cleanSpace,
  cleanSpaceDescription,
  liveBoards,
  setSpaceInfo,
  spacesOf,
  type KeyValueStore,
  type Library,
} from './board-library.ts';

export const BLUEPRINTS_KEY = 'boardroom.blueprints.v1';
export const BLUEPRINT_LIMIT = 10;
export const BLUEPRINT_BOARDS_MAX = 20;
export const BLUEPRINT_MAX_BYTES = 4_000_000;
export type BlueprintBoard = { title: string; template?: TemplateName; board?: Board };
export type Blueprint = {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  created?: string;
  boards: BlueprintBoard[];
  /** True for the blueprints that ship with Boardroom (not stored, cannot be deleted). */
  builtIn?: boolean;
};

export const builtInBlueprints: Blueprint[] = [
  {
    id: 'builtin-sprint',
    name: 'Sprint',
    emoji: '🏃',
    description: 'Plan the week, track the work and look back at the end of the sprint.',
    builtIn: true,
    boards: [
      { title: 'Sprint plan', template: 'Weekly plan' },
      { title: 'Sprint board', template: 'Kanban retro' },
      { title: 'Retrospective', template: 'Retrospective' },
    ],
  },
  {
    id: 'builtin-discovery',
    name: 'Product discovery',
    emoji: '🔎',
    description: 'Understand customers, collect ideas and shape the next product bet.',
    builtIn: true,
    boards: [
      { title: 'Customer journey', template: 'Customer journey' },
      { title: 'Ideas', template: 'Brainstorm' },
      { title: 'Lean canvas', template: 'Lean canvas' },
    ],
  },
  {
    id: 'builtin-strategy',
    name: 'Strategy offsite',
    emoji: '🧭',
    description: 'Agenda, analysis and prioritisation for a strategy session.',
    builtIn: true,
    boards: [
      { title: 'Agenda', template: 'Meeting agenda' },
      { title: 'SWOT', template: 'SWOT' },
      { title: 'Prioritisation', template: 'RICE scoring' },
    ],
  },
];

/** Fresh boards for a blueprint (new object ids each time). */
export function blueprintBoards(bp: Blueprint): Board[] {
  return bp.boards.map(entry => {
    if (entry.board) return { ...structuredClone(entry.board), title: entry.title };
    const board: Board = { ...newBoard(), title: entry.title };
    if (entry.template)
      board.items = templateItems(entry.template, { x: 0, y: 0 }, (t, x, y, f) => createItem(t, x, y, f));
    return board;
  });
}
/** `name`, or "name 2", "name 3"… when a space with that name exists. */
export function freeSpaceName(lib: Library, name: string): string {
  const base = cleanSpace(name) || 'New space',
    taken = new Set(spacesOf(lib).map(s => s.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = cleanSpace(`${base.slice(0, 54)} ${n}`);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
/** Create a space from a blueprint: its boards are stored in the new space without opening one. */
export function createFromBlueprint(
  kv: KeyValueStore,
  lib: Library,
  bp: Blueprint,
  name = bp.name,
  now = new Date().toISOString(),
): { library: Library; space: string; ids: string[] } {
  const space = freeSpaceName(lib, name);
  const added = addBoards(
    kv,
    lib,
    blueprintBoards(bp).map(board => ({ board, meta: { space } })),
    now,
  );
  const library = setSpaceInfo(kv, added.library, space, { emoji: bp.emoji ?? '', description: bp.description ?? '' });
  return { library, space, ids: added.ids };
}

/** A board without media objects (their files stay in this browser) and without connectors to them. */
function withoutMedia(board: Board): Board {
  const media = new Set(board.items.filter(i => i.assetId).map(i => i.id));
  if (!media.size) return board;
  return {
    ...board,
    items: board.items.filter(i => !media.has(i.id) && !(i.from && media.has(i.from)) && !(i.to && media.has(i.to))),
  };
}
/** Save the boards of a space (trash excluded) as a blueprint. Media objects are left out. */
export function blueprintFromSpace(
  kv: Pick<KeyValueStore, 'getItem'>,
  lib: Library,
  space: string,
  parse: (raw: unknown) => Board,
  id: string,
  now = new Date(),
  info: { emoji?: string; description?: string } = {},
): Blueprint | { error: string } {
  const boards: BlueprintBoard[] = [];
  for (const b of liveBoards(lib).filter(m => m.space === space)) {
    try {
      const board = withoutMedia(parse(JSON.parse(kv.getItem(boardKey(b.id)) ?? 'null')));
      delete board.assets;
      boards.push({ title: board.title || b.title, board });
    } catch {
      // Unreadable board: left out.
    }
  }
  if (!boards.length) return { error: 'Add boards to this space before saving it as a blueprint.' };
  if (boards.length > BLUEPRINT_BOARDS_MAX)
    return { error: `A blueprint holds up to ${BLUEPRINT_BOARDS_MAX} boards; this space has ${boards.length}.` };
  const bp: Blueprint = { id, name: cleanSpace(space) || 'Blueprint', created: now.toISOString(), boards };
  const emoji = cleanEmoji(info.emoji ?? ''),
    description = cleanSpaceDescription(info.description ?? '');
  if (emoji) bp.emoji = emoji;
  if (description) bp.description = description;
  if (JSON.stringify(bp).length > BLUEPRINT_MAX_BYTES)
    return { error: 'This space is too large to save as a blueprint.' };
  return bp;
}

/** Saved blueprints from storage; malformed ones (or boards that no longer validate) are dropped. */
export function parseBlueprints(raw: string | null, parse: (raw: unknown) => Board): Blueprint[] {
  let list: unknown;
  try {
    list = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  return validBlueprints(list, parse).slice(0, BLUEPRINT_LIMIT);
}
/**
 * The valid blueprints in an untrusted list (storage or a library backup, gap R3-Q2). Malformed entries, boards
 * that do not validate and blueprints over `maxBytes` (as JSON) are dropped; media objects and embedded media are
 * left out as when a blueprint is saved. At most 200 entries are read.
 */
export function validBlueprints(list: unknown, parse: (raw: unknown) => Board, maxBytes = Infinity): Blueprint[] {
  if (!Array.isArray(list)) return [];
  const out: Blueprint[] = [];
  for (const v of list.slice(0, 200)) {
    if (!v || typeof v.id !== 'string' || !v.id || typeof v.name !== 'string' || !Array.isArray(v.boards)) continue;
    const boards: BlueprintBoard[] = [];
    for (const e of v.boards.slice(0, BLUEPRINT_BOARDS_MAX)) {
      if (!e || typeof e.title !== 'string') continue;
      if (typeof e.template === 'string' && (templateNames as string[]).includes(e.template))
        boards.push({ title: e.title.slice(0, 200), template: e.template });
      else if (e.board)
        try {
          const board = withoutMedia(parse(e.board));
          delete board.assets;
          boards.push({ title: e.title.slice(0, 200), board });
        } catch {
          // Invalid board: left out.
        }
    }
    if (!boards.length) continue;
    const bp: Blueprint = { id: v.id.slice(0, 100), name: cleanSpace(v.name) || 'Blueprint', boards };
    if (typeof v.created === 'string') bp.created = v.created.slice(0, 40);
    if (typeof v.emoji === 'string' && cleanEmoji(v.emoji)) bp.emoji = cleanEmoji(v.emoji);
    if (typeof v.description === 'string' && cleanSpaceDescription(v.description))
      bp.description = cleanSpaceDescription(v.description);
    if (maxBytes < Infinity && JSON.stringify(bp).length > maxBytes) continue;
    out.push(bp);
  }
  return out;
}
/**
 * Add restored blueprints (gap R3-Q2) the way a library restore adds boards: nothing saved here is replaced or
 * dropped. A blueprint identical to one already saved is skipped; one whose id is taken by a different blueprint
 * is added under a new id. Blueprints that do not fit under BLUEPRINT_LIMIT are left out and counted in `full`.
 */
export function mergeBlueprints(
  list: Blueprint[],
  incoming: Blueprint[],
  makeId: () => string,
): { list: Blueprint[]; added: number; skipped: number; full: number } {
  const same = (a: Blueprint, b: Blueprint) => JSON.stringify(a) === JSON.stringify(b),
    ids = new Set(list.map(b => b.id)),
    added: Blueprint[] = [];
  let skipped = 0,
    full = 0;
  for (const bp of incoming) {
    if ([...list, ...added].some(x => x.id === bp.id && same(x, bp))) {
      skipped++;
      continue;
    }
    if (list.length + added.length >= BLUEPRINT_LIMIT) {
      full++;
      continue;
    }
    const id = ids.has(bp.id) ? makeId() : bp.id;
    ids.add(id);
    added.push({ ...bp, id });
  }
  return { list: [...added, ...list], added: added.length, skipped, full };
}
/** Newest first; at most BLUEPRINT_LIMIT kept. */
export const addBlueprint = (list: Blueprint[], bp: Blueprint) => [bp, ...list].slice(0, BLUEPRINT_LIMIT);
export const removeBlueprint = (list: Blueprint[], id: string) => list.filter(b => b.id !== id);

export function loadBlueprints(parse: (raw: unknown) => Board): Blueprint[] {
  try {
    return parseBlueprints(localStorage.getItem(BLUEPRINTS_KEY), parse);
  } catch {
    return [];
  }
}
/** Returns false when storage is full or unavailable. */
export function storeBlueprints(list: Blueprint[]): boolean {
  try {
    localStorage.setItem(BLUEPRINTS_KEY, JSON.stringify(list.filter(b => !b.builtIn)));
    return true;
  } catch {
    return false;
  }
}
