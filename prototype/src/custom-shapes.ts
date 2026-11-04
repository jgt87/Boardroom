// Custom saved shapes (track R5): save a selection as a reusable shape and place it again from the Shapes menu.
// Shapes live in this browser's local storage as the clipboard payload (like My templates), so placing one
// reuses the tested paste path: fresh ids, connectors kept. Media objects are not included. A placed shape
// of several objects is grouped so it moves as one.
import type { Board } from './model.ts';
import { makeSelectionTemplate, cleanTemplateName, templatePayload } from './user-templates.ts';
import type { UserTemplate } from './user-templates.ts';
import { readClipboardHtml, pastePayload } from './clipboard.ts';
import { groupSelection } from './arrange.ts';
import { kindLabel } from './switch-type.ts';

export const SHAPES_KEY = 'boardroom.shapes.v1';
export const SHAPE_LIMIT = 40;
export const SHAPE_MAX_BYTES = 400_000;
export type CustomShape = UserTemplate;

/** Default name: the single object's text or kind, else "Custom shape". */
export function customShapeName(board: Board, ids: string[]): string {
  const picked = board.items.filter(i => ids.includes(i.id));
  const named = picked.find(i => i.type === 'frame' && i.text) ?? (picked.length === 1 ? picked[0] : undefined);
  return (
    cleanTemplateName((named && (named.name || named.text.split('\n')[0] || kindLabel(named.type))) || '') ||
    'Custom shape'
  );
}
export function makeCustomShape(
  board: Board,
  ids: string[],
  id: string,
  now: Date,
  name = customShapeName(board, ids),
): CustomShape | { error: string } {
  const made = makeSelectionTemplate(board, ids, name, id, now);
  if ('error' in made) return { error: 'Select objects other than media to save them as a shape.' };
  if (made.html.length > SHAPE_MAX_BYTES) return { error: 'This selection is too large to save as a shape.' };
  return made;
}
export function parseCustomShapes(raw: string | null): CustomShape[] {
  try {
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (t): t is CustomShape =>
          !!t &&
          typeof t.id === 'string' &&
          typeof t.name === 'string' &&
          typeof t.created === 'string' &&
          typeof t.count === 'number' &&
          typeof t.html === 'string' &&
          t.html.length <= SHAPE_MAX_BYTES &&
          !!readClipboardHtml(t.html),
      )
      .slice(0, SHAPE_LIMIT);
  } catch {
    return [];
  }
}
/** Newest first; saving beyond the limit drops the oldest. */
export const addCustomShape = (list: CustomShape[], s: CustomShape) => [s, ...list].slice(0, SHAPE_LIMIT);
export const removeCustomShape = (list: CustomShape[], id: string) => list.filter(s => s.id !== id);
export const renameCustomShape = (list: CustomShape[], id: string, name: string) =>
  list.map(s => (s.id === id ? { ...s, name: cleanTemplateName(name) || s.name } : s));

/** Place a saved shape centred on `at`; several objects are grouped. Returns the new board and selection. */
export function placeCustomShape(
  board: Board,
  shape: CustomShape,
  at: { x: number; y: number },
): { board: Board; ids: string[] } | null {
  const payload = templatePayload(shape);
  if (!payload) return null;
  const corner = { x: Math.round(at.x - payload.bounds.w / 2), y: Math.round(at.y - payload.bounds.h / 2) };
  const pasted = pastePayload(board, payload, corner);
  if (pasted.ids.length < 2) return { board: pasted.board, ids: pasted.ids };
  try {
    return { board: groupSelection(pasted.board, pasted.ids).board, ids: pasted.ids };
  } catch {
    return { board: pasted.board, ids: pasted.ids };
  }
}

export function loadCustomShapes(): CustomShape[] {
  try {
    return parseCustomShapes(localStorage.getItem(SHAPES_KEY));
  } catch {
    return [];
  }
}
/** Returns false when storage is full or unavailable. */
export function storeCustomShapes(list: CustomShape[]): boolean {
  try {
    localStorage.setItem(SHAPES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
