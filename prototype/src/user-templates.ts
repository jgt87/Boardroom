// Save board as template (item 97). Templates live in this browser's local storage and are
// stored as the clipboard payload, so inserting one reuses the tested paste path (new ids,
// connectors, groups and record datasets kept). Media files are not included.
// Track R3: templates also carry an optional description and a thumbnail preview, can be renamed,
// and can be exported to and imported from a file (and travel in the library backup).
import type { Board } from './model.ts';
import { clipboardFormats, copySelection, pastePayload, readClipboardHtml, type ClipPayload } from './clipboard.ts';
import { frameMoveIds } from './interactions.ts';
import { cleanPreview, previewOf, type PreviewShape } from './board-library.ts';
import { isTemplateSort, type TemplateSort, type TemplateUse } from './starter-templates.ts';

export const TEMPLATES_KEY = 'boardroom.templates.v1';
export const TEMPLATE_LIMIT = 20;
export const TEMPLATE_MAX_BYTES = 1_500_000;
export const TEMPLATE_DESCRIPTION_MAX = 300;
export const TEMPLATES_FORMAT = 'boardroom-templates';
/**
 * A saved template. `description` and `preview` (dashboard-style thumbnail shapes) are optional, so
 * templates saved by older versions load unchanged.
 */
export type UserTemplate = {
  id: string;
  name: string;
  created: string;
  count: number;
  html: string;
  description?: string;
  preview?: PreviewShape[];
};

export const cleanTemplateName = (name: string) =>
  [...name]
    .filter(ch => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
/** Plain description text: no control characters (line breaks kept) or markup, at most 300 characters. */
export const cleanTemplateDescription = (text: string) =>
  [...text]
    .filter(ch => (ch.charCodeAt(0) >= 32 || ch === '\n') && ch !== '<' && ch !== '>')
    .join('')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, TEMPLATE_DESCRIPTION_MAX);

/** Build a template from every object on the board except media (whose files stay in this board). */
export function makeTemplate(board: Board, name: string, id: string, now: Date): UserTemplate | { error: string } {
  const ids = board.items.filter(i => !i.assetId).map(i => i.id);
  return templateFrom(board, ids, name, id, now, 'board');
}
/**
 * The objects a selection template keeps (gap list I6): the selection, everything inside selected frames,
 * and connectors whose both ends are kept. Media objects are left out.
 */
export function selectionTemplateIds(board: Board, ids: string[]): string[] {
  const chosen = new Set(frameMoveIds(board.items, ids));
  for (const i of board.items)
    if (i.type === 'arrow' && i.from && i.to && chosen.has(i.from) && chosen.has(i.to)) chosen.add(i.id);
  return board.items.filter(i => chosen.has(i.id) && !i.assetId).map(i => i.id);
}
/** Default name for a selection template: the selected frame's title, else the board title. */
export function selectionTemplateName(board: Board, ids: string[]): string {
  const frames = board.items.filter(i => ids.includes(i.id) && i.type === 'frame');
  return cleanTemplateName((frames.length === 1 && (frames[0].text || frames[0].name)) || `${board.title} selection`);
}
/** Build a template from the selection (see selectionTemplateIds). */
export function makeSelectionTemplate(
  board: Board,
  ids: string[],
  name: string,
  id: string,
  now: Date,
): UserTemplate | { error: string } {
  return templateFrom(board, selectionTemplateIds(board, ids), name, id, now, 'selection');
}
function templateFrom(
  board: Board,
  ids: string[],
  name: string,
  id: string,
  now: Date,
  scope: 'board' | 'selection',
): UserTemplate | { error: string } {
  const payload = ids.length ? copySelection(board, ids, {}, 0) : null;
  if (!payload)
    return {
      error:
        scope === 'board'
          ? 'Add something to the board before saving it as a template.'
          : 'Select objects other than media to save them as a template.',
    };
  const html = clipboardFormats(payload).html;
  if (html.length > TEMPLATE_MAX_BYTES) return { error: `This ${scope} is too large to save as a template.` };
  const t: UserTemplate = {
    id,
    name: cleanTemplateName(name) || 'Untitled template',
    created: now.toISOString(),
    count: payload.items.length,
    html,
  };
  const preview = previewOf({ ...board, thumbnailFrame: undefined, items: payload.items });
  if (preview.length) t.preview = preview;
  return t;
}

/** Keep a stored template's optional fields only when valid (older or edited data never blocks loading). */
function cleanOptional(t: UserTemplate): UserTemplate {
  const out: UserTemplate = { id: t.id, name: t.name, created: t.created, count: t.count, html: t.html };
  if (typeof t.description === 'string') {
    const d = cleanTemplateDescription(t.description);
    if (d) out.description = d;
  }
  const preview = cleanPreview(t.preview);
  if (preview?.length) out.preview = preview;
  return out;
}
const isTemplate = (t: unknown): t is UserTemplate => {
  const v = t as UserTemplate;
  return (
    !!v &&
    typeof v.id === 'string' &&
    !!v.id &&
    v.id.length <= 100 &&
    typeof v.name === 'string' &&
    typeof v.created === 'string' &&
    typeof v.count === 'number' &&
    typeof v.html === 'string' &&
    v.html.length <= TEMPLATE_MAX_BYTES &&
    !!readClipboardHtml(v.html)
  );
};
/** Parse stored templates, dropping anything malformed or no longer readable. */
export function parseTemplates(raw: string | null): UserTemplate[] {
  try {
    const list = raw ? JSON.parse(raw) : [];
    return validTemplates(list).slice(0, TEMPLATE_LIMIT);
  } catch {
    return [];
  }
}
/** The readable templates in an untrusted list, with their optional fields cleaned. */
export function validTemplates(list: unknown): UserTemplate[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isTemplate).map(cleanOptional);
}

/** Newest first; adding beyond the limit drops the oldest. */
export const addTemplate = (list: UserTemplate[], t: UserTemplate) => [t, ...list].slice(0, TEMPLATE_LIMIT);
export const removeTemplate = (list: UserTemplate[], id: string) => list.filter(t => t.id !== id);
/** Rename a template or change its description (an empty description removes it). */
export function editTemplate(
  list: UserTemplate[],
  id: string,
  patch: { name?: string; description?: string },
): UserTemplate[] {
  return list.map(t => {
    if (t.id !== id) return t;
    const next = { ...t };
    if (patch.name !== undefined) next.name = cleanTemplateName(patch.name) || t.name;
    if (patch.description !== undefined) {
      const d = cleanTemplateDescription(patch.description);
      if (d) next.description = d;
      else delete next.description;
    }
    return next;
  });
}
export const templatePayload = (t: UserTemplate): ClipPayload | null => readClipboardHtml(t.html);
/** The template's thumbnail: its saved preview, or one computed from its objects (templates saved earlier). */
export function templatePreview(t: UserTemplate): PreviewShape[] {
  if (t.preview) return t.preview;
  const payload = templatePayload(t);
  return payload ? previewOf({ version: 1, title: '', items: payload.items }) : [];
}
/** A new board holding the template's objects (fresh ids) at the origin, named after the template. */
export function boardFromTemplate(t: UserTemplate, blank: Board): Board | null {
  const payload = templatePayload(t);
  if (!payload) return null;
  return { ...pastePayload({ ...blank, title: t.name }, payload, { x: 0, y: 0 }).board, title: t.name };
}

/**
 * Add templates from another list (an imported file or a library backup) in front of the current ones.
 * A template already present (same id and content) is skipped; an id clash with other content gets a new id.
 * The list stays within the limit, so the oldest current templates may drop off (`dropped`).
 */
export function mergeTemplates(
  list: UserTemplate[],
  incoming: UserTemplate[],
  makeId: () => string,
): { list: UserTemplate[]; added: number; skipped: number; dropped: number } {
  const ids = new Set(list.map(t => t.id)),
    added: UserTemplate[] = [];
  let skipped = 0;
  for (const t of incoming) {
    const same = list.find(x => x.id === t.id) ?? added.find(x => x.id === t.id);
    if (same && same.html === t.html) {
      skipped++;
      continue;
    }
    const id = ids.has(t.id) ? makeId() : t.id;
    ids.add(id);
    added.push({ ...t, id });
  }
  const kept = added.slice(0, TEMPLATE_LIMIT);
  const all = [...kept, ...list];
  return {
    list: all.slice(0, TEMPLATE_LIMIT),
    added: kept.length,
    skipped: skipped + added.length - kept.length,
    dropped: Math.max(0, all.length - TEMPLATE_LIMIT),
  };
}
/** A templates file: a format marker and the templates (one or all). */
export function exportTemplates(list: UserTemplate[], now = new Date()): string {
  return JSON.stringify({ format: TEMPLATES_FORMAT, version: 1, exportedAt: now.toISOString(), templates: list });
}
/** Read a templates file. Throws on a file that is not one; unreadable templates in it are skipped. */
export function readTemplatesFile(text: string): { templates: UserTemplate[]; skipped: number } {
  let raw: { format?: unknown; version?: unknown; templates?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not a Boardroom templates file.');
  }
  if (!raw || raw.format !== TEMPLATES_FORMAT || raw.version !== 1 || !Array.isArray(raw.templates))
    throw new Error('This file is not a Boardroom templates file.');
  if (raw.templates.length > 200) throw new Error('This file holds too many templates.');
  const templates = validTemplates(raw.templates);
  return { templates, skipped: raw.templates.length - templates.length };
}

export function loadTemplates(): UserTemplate[] {
  try {
    return parseTemplates(localStorage.getItem(TEMPLATES_KEY));
  } catch {
    return [];
  }
}
/** Returns false when storage is full or unavailable. */
export function storeTemplates(list: UserTemplate[]): boolean {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ---- Last use and gallery sort (track L) -------------------------------------------------------------------
/** When each template was last used (starter and saved templates), next to the saved templates. */
export const TEMPLATE_USE_KEY = 'boardroom.templates.used.v1';
export const TEMPLATE_SORT_KEY = 'boardroom.templates.sort.v1';
const USE_LIMIT = 100;
export const userUseKey = (id: string) => `user:${id}`;
/** Parse stored use times, keeping only well-formed entries (newest first, at most 100). */
export function parseTemplateUse(raw: string | null): TemplateUse {
  try {
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const entries = Object.entries(value as Record<string, unknown>).filter(
      (e): e is [string, string] =>
        e[0].length <= 120 && typeof e[1] === 'string' && e[1].length <= 40 && Number.isFinite(Date.parse(e[1])),
    );
    return Object.fromEntries(entries.sort((a, b) => (a[1] > b[1] ? -1 : 1)).slice(0, USE_LIMIT));
  } catch {
    return {};
  }
}
/** Record a use of the template `key` at `now`; the oldest entries drop off beyond the limit. */
export function noteTemplateUse(use: TemplateUse, key: string, now: Date): TemplateUse {
  return parseTemplateUse(JSON.stringify({ ...use, [key]: now.toISOString() }));
}
export function loadTemplateUse(): TemplateUse {
  try {
    return parseTemplateUse(localStorage.getItem(TEMPLATE_USE_KEY));
  } catch {
    return {};
  }
}
/** Record a use in this browser's storage (best effort) and return the updated times. */
export function rememberTemplateUse(key: string, now = new Date()): TemplateUse {
  const next = noteTemplateUse(loadTemplateUse(), key, now);
  try {
    localStorage.setItem(TEMPLATE_USE_KEY, JSON.stringify(next));
  } catch {
    /* Storage full or unavailable: the order is a convenience. */
  }
  return next;
}
export function loadTemplateSort(): TemplateSort {
  try {
    const v = localStorage.getItem(TEMPLATE_SORT_KEY);
    return isTemplateSort(v) ? v : 'default';
  } catch {
    return 'default';
  }
}
export function storeTemplateSort(sort: TemplateSort) {
  try {
    localStorage.setItem(TEMPLATE_SORT_KEY, sort);
  } catch {
    /* Not remembered. */
  }
}
/** Saved templates in gallery order: newest first (default and category), by name, or recently used first. */
export function sortUserTemplates(list: UserTemplate[], sort: TemplateSort, use: TemplateUse = {}): UserTemplate[] {
  const out = [...list];
  if (sort === 'name') return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  if (sort === 'recent') {
    const at = (t: UserTemplate) => use[userUseKey(t.id)] ?? '';
    return out.sort((a, b) => (at(a) === at(b) ? 0 : at(a) > at(b) ? -1 : 1));
  }
  return out;
}
