// Save board as template (item 97). Templates live in this browser's local storage and are
// stored as the clipboard payload, so inserting one reuses the tested paste path (new ids,
// connectors, groups and record datasets kept). Media files are not included.
import type { Board } from './model.ts';
import { clipboardFormats, copySelection, pastePayload, readClipboardHtml, type ClipPayload } from './clipboard.ts';
import { frameMoveIds } from './interactions.ts';

export const TEMPLATES_KEY = 'boardroom.templates.v1';
export const TEMPLATE_LIMIT = 20;
export const TEMPLATE_MAX_BYTES = 1_500_000;
export type UserTemplate = { id: string; name: string; created: string; count: number; html: string };

export const cleanTemplateName = (name: string) =>
  [...name]
    .filter(ch => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

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
  return {
    id,
    name: cleanTemplateName(name) || 'Untitled template',
    created: now.toISOString(),
    count: payload.items.length,
    html,
  };
}

/** Parse stored templates, dropping anything malformed or no longer readable. */
export function parseTemplates(raw: string | null): UserTemplate[] {
  try {
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (t): t is UserTemplate =>
          !!t &&
          typeof t.id === 'string' &&
          typeof t.name === 'string' &&
          typeof t.created === 'string' &&
          typeof t.count === 'number' &&
          typeof t.html === 'string' &&
          !!readClipboardHtml(t.html),
      )
      .slice(0, TEMPLATE_LIMIT);
  } catch {
    return [];
  }
}

/** Newest first; adding beyond the limit drops the oldest. */
export const addTemplate = (list: UserTemplate[], t: UserTemplate) => [t, ...list].slice(0, TEMPLATE_LIMIT);
export const removeTemplate = (list: UserTemplate[], id: string) => list.filter(t => t.id !== id);
export const templatePayload = (t: UserTemplate): ClipPayload | null => readClipboardHtml(t.html);
/** A new board holding the template's objects (fresh ids) at the origin, named after the template. */
export function boardFromTemplate(t: UserTemplate, blank: Board): Board | null {
  const payload = templatePayload(t);
  if (!payload) return null;
  return { ...pastePayload({ ...blank, title: t.name }, payload, { x: 0, y: 0 }).board, title: t.name };
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
