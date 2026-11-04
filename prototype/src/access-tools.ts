// Keyboard and assistive-technology helpers (track R1): container navigation (frames and groups),
// adding to the selection from the keyboard, keyboard resizing, spoken object details, an outline by
// frame, colour names, accessibility-report grouping and object deep links. Pure: no React, no DOM.
import type { Board, Item } from './model.ts';
import { colorNames, createItem } from './model.ts';
import { editableIds, groupMembers, rootGroupOf } from './arrange.ts';
import { frameAroundItem, nearestInDirection, readingOrder, type Direction } from './navigation.ts';
import { kindLabel } from './switch-type.ts';
import type { A11yIssue } from './board-tools.ts';
import { laneOf } from './swimlane.ts';
import { swimlaneSummary } from './specs-swimlane.ts';

// ---- Names ------------------------------------------------------------------------------------
const clip = (text: string, max: number) => text.trim().replace(/\s+/g, ' ').slice(0, max);
/** Accessible name of a rendered object: its kind, then its description, name or text. */
export function itemAriaLabel(i: Item): string {
  if (i.type === 'swimlane') return swimlaneSummary(i);
  const text = clip(i.alt || i.name || i.text || '', 160);
  return `${kindLabel(i.type)}: ${text || 'Untitled'}`;
}
/** Where an object sits in a swimlane, e.g. "in lane Sales, phase Plan, of swimlane Orders" (gap E6). */
export function laneDescription(board: Board, id: string): string {
  const place = laneOf(board, id);
  if (!place) return '';
  const name = (s: { title: string }) => clip(s.title, 60) || 'Untitled';
  return [
    `in lane ${name(place.lane)}`,
    place.phase ? `phase ${name(place.phase)}` : '',
    `of swimlane ${clip(place.swimlane.name || place.swimlane.text, 60) || 'Untitled'}`,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Spoken colour name: the palette name when there is one, otherwise an approximate hue name. */
export function spokenColor(hex: string): string {
  const known = colorNames[hex.toLowerCase()];
  if (known) return known;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map(v => parseInt(v, 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2,
    d = max - min,
    s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.12) return 'Black';
  if (l > 0.96 && s < 0.2) return 'White';
  let base: string;
  if (s < 0.2) base = 'grey';
  else {
    const h = (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    base =
      h < 15 || h >= 345
        ? 'red'
        : h < 40
          ? 'orange'
          : h < 65
            ? 'yellow'
            : h < 90
              ? 'lime'
              : h < 160
                ? 'green'
                : h < 200
                  ? 'cyan'
                  : h < 255
                    ? 'blue'
                    : h < 290
                      ? 'violet'
                      : 'pink';
  }
  const name = l > 0.78 ? `light ${base}` : l < 0.3 ? `dark ${base}` : base;
  return name[0].toUpperCase() + name.slice(1);
}

// ---- Containers: frames and groups --------------------------------------------------------------
const navigable = (i: Item) => !i.hidden && i.type !== 'arrow' && i.type !== 'pen';
const inside = (i: Item, f: Item) =>
  i.id !== f.id && i.x >= f.x && i.y >= f.y && i.x + i.w <= f.x + f.w && i.y + i.h <= f.y + f.h;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));

/**
 * Enter a container (Ctrl+Shift+Down): a selected group selects its first member alone; a selected
 * frame selects the first object inside it. Returns the new selection, or undefined.
 */
export function enterContainer(board: Board, selected: string[]): string[] | undefined {
  const first = board.items.find(i => i.id === selected[0]);
  if (!first) return undefined;
  const root = rootGroupOf(board, first);
  if (root) {
    const members = groupMembers(board, root);
    if (members.length > 1 && sameSet(members, selected)) {
      const order = readingOrder(board).filter(id => members.includes(id));
      return order.length ? [order[0]] : [members[0]];
    }
  }
  if (selected.length === 1 && first.type === 'frame') {
    const ids = new Set(board.items.filter(i => navigable(i) && inside(i, first)).map(i => i.id));
    const id = readingOrder(board).find(x => ids.has(x));
    return id ? [id] : undefined;
  }
  return undefined;
}
/**
 * Leave a container (Ctrl+Shift+Up): a single member of a group selects the whole group; otherwise
 * the smallest frame around the selection is selected.
 */
export function leaveContainer(board: Board, selected: string[]): string[] | undefined {
  const first = board.items.find(i => i.id === selected[0]);
  if (!first) return undefined;
  const root = rootGroupOf(board, first);
  if (root) {
    const members = groupMembers(board, root);
    if (!sameSet(members, selected)) return members;
  }
  const frame = frameAroundItem(board, first.id);
  return frame ? [frame] : undefined;
}
/**
 * Objects of the container around an object, in reading order (Alt+Home/End): its group when it is
 * grouped, otherwise its frame's contents, otherwise every loose object on the board.
 */
export function containerSiblings(board: Board, id: string): string[] {
  const item = board.items.find(i => i.id === id);
  if (!item) return [];
  const root = rootGroupOf(board, item);
  const order = readingOrder(board);
  if (root) {
    const members = new Set(groupMembers(board, root));
    return order.filter(x => members.has(x));
  }
  const frameId = frameAroundItem(board, id),
    frame = frameId ? board.items.find(i => i.id === frameId) : undefined;
  if (frame) {
    const ids = new Set(board.items.filter(i => inside(i, frame)).map(i => i.id));
    return order.filter(x => ids.has(x));
  }
  const framed = new Set(
    board.items.filter(i => board.items.some(f => f.type === 'frame' && inside(i, f))).map(i => i.id),
  );
  return order.filter(x => !framed.has(x));
}

// ---- Selection from the keyboard -------------------------------------------------------------------
/** Add the nearest object in a direction (from the most recently added one) to the selection. */
export function addInDirection(board: Board, selected: string[], dir: Direction): string[] | undefined {
  const from = selected[selected.length - 1];
  if (!from) return undefined;
  const pool = { ...board, items: board.items.filter(i => i.id === from || !selected.includes(i.id)) };
  const next = nearestInDirection(pool, from, dir);
  return next ? [...selected, next] : undefined;
}

/** Empty sticky note of the same size, colour and format, 24 px to the right (Tab while editing a note). */
export function nextNoteBeside(source: Item): Item {
  const note = createItem('note', source.x + source.w + 24, source.y, source.fill);
  return {
    ...note,
    w: source.w,
    h: source.h,
    text: '',
    ...(source.format ? { format: structuredClone(source.format) } : {}),
    ...(source.layer ? { layer: source.layer } : {}),
  };
}

// ---- Keyboard resize ---------------------------------------------------------------------------------
const MIN_SIZE = 8,
  MAX_SIZE = 100000;
const keepsAspect = (i: Item) => ['image', 'video', 'stamp', 'icon', 'qr'].includes(i.type);
/**
 * Grow or shrink the editable selection by `dw` x `dh` (Alt+Shift+Arrow), keeping the top-left corner.
 * Media keep their aspect ratio. Locked objects (and locked groups or layers) are skipped.
 */
export function resizeBy(board: Board, ids: string[], dw: number, dh: number): { board: Board; resized: number } {
  const wanted = new Set(editableIds(board, ids).filter(id => ids.includes(id)));
  let resized = 0;
  const items = board.items.map(i => {
    if (!wanted.has(i.id) || i.type === 'arrow' || i.type === 'pen') return i;
    let w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, i.w + dw)),
      h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, i.h + dh));
    if (keepsAspect(i) && i.w > 0 && i.h > 0) {
      if (dw) h = Math.max(MIN_SIZE, (w * i.h) / i.w);
      else w = Math.max(MIN_SIZE, (h * i.w) / i.h);
    }
    if (w === i.w && h === i.h) return i;
    resized++;
    return { ...i, w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 };
  });
  return { board: resized ? { ...board, items } : board, resized };
}

// ---- Spoken details ------------------------------------------------------------------------------------
/** Position and size of an object for Alt+I, plus its container, links and comments. */
export function itemDetails(board: Board, id: string): string {
  const i = board.items.find(x => x.id === id);
  if (!i) return 'Nothing selected.';
  const parts = [
    `${kindLabel(i.type)}${clip(i.alt || i.name || i.text || '', 80) ? `, ${clip(i.alt || i.name || i.text, 80)}` : ''}`,
    `at x ${Math.round(i.x)}, y ${Math.round(i.y)}`,
    `${Math.round(i.w)} by ${Math.round(i.h)}`,
  ];
  if (i.type !== 'arrow' && i.type !== 'pen' && /^#[0-9a-f]{6}$/i.test(i.fill)) parts.push(spokenColor(i.fill));
  const frameId = frameAroundItem(board, i.id),
    frame = frameId ? board.items.find(f => f.id === frameId) : undefined;
  if (frame) parts.push(`in frame ${clip(frame.name || frame.text, 60) || 'Untitled'}`);
  const lane = laneDescription(board, i.id);
  if (lane) parts.push(lane);
  if (i.group) parts.push(`in a group of ${groupMembers(board, rootGroupOf(board, i)!).length}`);
  const links = board.items.filter(c => c.type === 'arrow' && (c.from === i.id || c.to === i.id)).length;
  if (links) parts.push(`${links} ${links === 1 ? 'connection' : 'connections'}`);
  const comments = (board.comments ?? []).filter(t => t.itemId === i.id && !t.resolved).length;
  if (comments) parts.push(`${comments} ${comments === 1 ? 'comment' : 'comments'}`);
  if (i.locked) parts.push('locked');
  return parts.join(', ') + '.';
}
/** Short spoken summary of a selection (Alt+R when nothing was announced yet). */
export function selectionSummary(board: Board, ids: string[]): string {
  if (!ids.length) return 'Nothing selected.';
  if (ids.length === 1) return itemDetails(board, ids[0]);
  return `${ids.length} objects selected.`;
}

// ---- Outline by frame --------------------------------------------------------------------------------------
export type OutlineSection = { frame?: { id: string; title: string }; items: { id: string; label: string }[] };
/**
 * Board outline for screen readers: one section per frame (in reading order) listing the objects inside
 * it, then a section for objects outside every frame. Nested frames list under the innermost frame.
 */
export function outlineByFrame(board: Board): OutlineSection[] {
  const order = readingOrder(board);
  const byId = new Map(board.items.map(i => [i.id, i]));
  const frames = order.map(id => byId.get(id)!).filter(i => i.type === 'frame');
  const sections = new Map<string, OutlineSection>(
    frames.map(f => [f.id, { frame: { id: f.id, title: clip(f.name || f.text, 80) || 'Untitled frame' }, items: [] }]),
  );
  const loose: OutlineSection = { items: [] },
    lanes = board.items.some(i => i.type === 'swimlane');
  for (const id of order) {
    const i = byId.get(id)!,
      lane = lanes ? laneDescription(board, id) : '';
    const entry = { id, label: itemAriaLabel(i) + (lane ? `, ${lane}` : '') };
    const home = frameAroundItem(board, id);
    if (home && sections.has(home)) sections.get(home)!.items.push(entry);
    else if (i.type !== 'frame') loose.items.push(entry);
  }
  return [...sections.values(), ...(loose.items.length ? [loose] : [])];
}

// ---- Accessibility report ---------------------------------------------------------------------------------
export type A11ySection = 'Descriptions' | 'Contrast' | 'Text';
export const a11yKindLabels: Record<A11yIssue['kind'], string> = {
  alt: 'Missing description',
  empty: 'Missing title',
  contrast: 'Contrast',
  'small-text': 'Small text',
};
const sectionOf = (kind: A11yIssue['kind']): A11ySection =>
  kind === 'contrast' ? 'Contrast' : kind === 'small-text' ? 'Text' : 'Descriptions';
/** Issues grouped into report sections (Descriptions, Contrast, Text), errors first within each. */
export function groupA11yIssues(issues: A11yIssue[]): { section: A11ySection; issues: A11yIssue[] }[] {
  const sections: A11ySection[] = ['Descriptions', 'Contrast', 'Text'];
  return sections
    .map(section => ({
      section,
      issues: issues
        .filter(i => sectionOf(i.kind) === section)
        .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1)),
    }))
    .filter(s => s.issues.length);
}

// ---- Deep links ----------------------------------------------------------------------------------------------
export type DeepLink = { board?: string; item?: string; frame?: string };
const ID = /^[A-Za-z0-9_-]{1,100}$/;
/** Hash for a link to an object (`#board=<id>&item=<id>`, or `frame=` for frames). */
export function deepLinkHash(item: Item, boardId?: string): string {
  const params = new URLSearchParams();
  if (boardId) params.set('board', boardId);
  params.set(item.type === 'frame' ? 'frame' : 'item', item.id);
  return '#' + params.toString();
}
/** Parse a location hash; unknown keys and malformed ids are ignored. */
export function parseDeepLink(hash: string): DeepLink | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const out: DeepLink = {};
  for (const key of ['board', 'item', 'frame'] as const) {
    const v = params.get(key);
    if (v && ID.test(v)) out[key] = v;
  }
  return out.item || out.frame ? out : undefined;
}
/** The object a link points to on this board, if it is there (a `frame=` link must name a frame). */
export function deepLinkTarget(board: Board, link: DeepLink): Item | undefined {
  const id = link.item ?? link.frame;
  const found = board.items.find(i => i.id === id);
  if (!found || (link.frame && !link.item && found.type !== 'frame')) return undefined;
  return found;
}
