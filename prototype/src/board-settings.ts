// Board settings (item 103): background colour, start view and status. Pure.
import type { Board } from './model.ts';

/** Background colours offered by the board menu, in menu order. Light gray is the default. */
export const boardBackgrounds = [
  { name: 'White', color: '#ffffff' },
  { name: 'Light Gray (Default)', color: '#f4f4f6' },
  { name: 'Gray', color: '#d9d9de' },
  { name: 'Dark Gray', color: '#52525b' },
  { name: 'Black', color: '#18181b' },
  { name: 'Light Blue', color: '#e3edff' },
  { name: 'Light Purple', color: '#ece6fb' },
  { name: 'Light Violet', color: '#f2e6fb' },
  { name: 'Light Pink', color: '#fde8ef' },
  { name: 'Light Yellow', color: '#fff8dc' },
  { name: 'Light Green', color: '#e5f6ea' },
] as const;
export const DEFAULT_BACKGROUND = '#f4f4f6';

export const boardStatuses = [
  { id: 'draft', label: 'Draft', color: '#71717a' },
  { id: 'in-progress', label: 'In progress', color: '#e2a01b' },
  { id: 'review', label: 'In review', color: '#4262ff' },
  { id: 'approved', label: 'Approved', color: '#2c9f5b' },
  { id: 'done', label: 'Done', color: '#16794a' },
  { id: 'outdated', label: 'Outdated', color: '#a1452f' },
] as const;
/** Longest board description (shown in Details, on dashboard cards and searched). */
export const BOARD_DESCRIPTION_MAX = 1000;
export type BoardStatus = (typeof boardStatuses)[number]['id'];
export type StartView = { x: number; y: number; z: number };

export const isBoardBackground = (v: unknown) => boardBackgrounds.some(b => b.color === v);
export const isBoardStatus = (v: unknown): v is BoardStatus => boardStatuses.some(s => s.id === v);
export const isStartView = (v: unknown): v is StartView =>
  !!v &&
  typeof v === 'object' &&
  ['x', 'y', 'z'].every(k => Number.isFinite((v as Record<string, number>)[k])) &&
  Math.abs((v as StartView).x) <= 1e7 &&
  Math.abs((v as StartView).y) <= 1e7 &&
  (v as StartView).z >= 0.1 &&
  (v as StartView).z <= 20;

/** Validate the optional settings fields of a loaded board (throws a readable error). */
export function validateBoardSettings(b: Board) {
  if (b.background !== undefined && !isBoardBackground(b.background)) throw new Error('Invalid board background.');
  if (b.startView !== undefined && !isStartView(b.startView)) throw new Error('Invalid board start view.');
  if (b.status !== undefined && !isBoardStatus(b.status)) throw new Error('Invalid board status.');
  if (b.startObject !== undefined && !isObjectId(b.startObject)) throw new Error('Invalid board start object.');
  if (b.sensitivity !== undefined && !isSensitivity(b.sensitivity)) throw new Error('Invalid sensitivity label.');
  if (
    b.description !== undefined &&
    (typeof b.description !== 'string' || b.description.length > BOARD_DESCRIPTION_MAX)
  )
    throw new Error('Invalid board description.');
}

/** Tidy a description typed by the user: no control characters except line breaks, trimmed and capped. */
export const cleanDescription = (text: string) =>
  [...text]
    .filter(ch => ch === '\n' || ch.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, BOARD_DESCRIPTION_MAX);

// ---- Open in a format's focus view (track D) -----------------------------------------------------------
/** Object kinds a board can open in, in their full-viewport focus view. */
export const startObjectKinds = ['table', 'kanban', 'timeline', 'doc', 'slides'] as const;
const kindLabels: Record<(typeof startObjectKinds)[number], string> = {
  table: 'Table',
  kanban: 'Kanban',
  timeline: 'Timeline',
  doc: 'Doc',
  slides: 'Slides',
};
const isObjectId = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 100;
/** The objects offered by "Open in", in paint order, with a menu label ("Kanban · Sprint"). */
export function startObjectChoices(board: Board): { id: string; label: string }[] {
  return board.items
    .filter(i => (startObjectKinds as readonly string[]).includes(i.type) && !i.hidden)
    .slice(0, 50)
    .map(i => {
      const kind = kindLabels[i.type as (typeof startObjectKinds)[number]],
        name = (i.text ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return { id: i.id, label: name && name !== kind ? `${kind} · ${name}` : kind };
    });
}
/** The object the board should open in, when the setting names one that still qualifies. */
export function startObjectOf(board: Board): string | undefined {
  const id = board.startObject;
  return id && startObjectChoices(board).some(c => c.id === id) ? id : undefined;
}

/** Set or clear one optional setting without leaving undefined keys behind. */
export function withSetting<
  K extends 'background' | 'startView' | 'startObject' | 'status' | 'description' | 'sensitivity',
>(board: Board, key: K, value: Board[K] | null): Board {
  const next = { ...board };
  if (value === null || value === undefined || value === '' || (key === 'background' && value === DEFAULT_BACKGROUND))
    delete next[key];
  else next[key] = value;
  return next;
}

// ---- Sensitivity label (track R2-K) -------------------------------------------------------------------
/** Preset sensitivity levels, least to most sensitive. A custom label carries its own name and colour. */
export const sensitivityLevels = [
  { id: 'public', label: 'Public', color: '#2c9f5b' },
  { id: 'internal', label: 'Internal', color: '#4262ff' },
  { id: 'confidential', label: 'Confidential', color: '#c76a00' },
  { id: 'restricted', label: 'Restricted', color: '#c0362c' },
] as const;
export type SensitivityLevel = (typeof sensitivityLevels)[number]['id'];
export type Sensitivity = { level: SensitivityLevel | 'custom'; label?: string; color?: string };
export const SENSITIVITY_LABEL_MAX = 40;
export const DEFAULT_CUSTOM_SENSITIVITY_COLOR = '#52525b';
const isHex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const cleanLabelText = (text: string) =>
  [...text]
    .filter(ch => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SENSITIVITY_LABEL_MAX);
/** A stored sensitivity: a preset level, or 'custom' with a 1–40 character label; the colour is optional. */
export function isSensitivity(v: unknown): v is Sensitivity {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  if (Object.keys(s).some(k => !['level', 'label', 'color'].includes(k))) return false;
  if (s.color !== undefined && !isHex(s.color)) return false;
  if (s.level === 'custom')
    return typeof s.label === 'string' && s.label.trim().length > 0 && s.label.length <= SENSITIVITY_LABEL_MAX;
  return sensitivityLevels.some(l => l.id === s.level) && s.label === undefined;
}
/** A custom sensitivity from typed text (null when the text is empty after tidying). */
export function customSensitivity(label: string, color?: string): Sensitivity | null {
  const text = cleanLabelText(label);
  if (!text) return null;
  return isHex(color) ? { level: 'custom', label: text, color } : { level: 'custom', label: text };
}
/** The badge to show for a board's sensitivity: its name and colour, or null when none is set. */
export function sensitivityBadge(s: unknown): { label: string; color: string } | null {
  if (!isSensitivity(s)) return null;
  if (s.level === 'custom') return { label: s.label!, color: s.color ?? DEFAULT_CUSTOM_SENSITIVITY_COLOR };
  const preset = sensitivityLevels.find(l => l.id === s.level)!;
  return { label: preset.label, color: s.color ?? preset.color };
}
/** Text colour readable on a badge colour (white on dark fills, near-black on light ones). */
export function badgeInk(color: string): string {
  const n = parseInt(color.slice(1), 16),
    lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4),
    lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.4 ? '#25252c' : '#ffffff';
}
/** The line stamped on exports, e.g. "Confidential". */
export const sensitivityStamp = (s: unknown) => sensitivityBadge(s)?.label ?? null;
/**
 * Where the export stamp sits: a pill in the bottom-right corner of the exported area `box` (world units),
 * sized to the area so it stays legible on large boards and does not swamp small selections.
 */
export function sensitivityStampBox(box: { x: number; y: number; w: number; h: number }, label: string) {
  const font = Math.round(Math.max(10, Math.min(48, Math.min(box.w, box.h) * 0.03)) * 10) / 10,
    h = Math.round(font * 1.8 * 10) / 10,
    w = Math.min(box.w - font, Math.round((label.length * font * 0.62 + font * 1.6) * 10) / 10),
    margin = Math.round(font * 0.8 * 10) / 10;
  return { x: box.x + box.w - w - margin, y: box.y + box.h - h - margin, w, h, font };
}

/** Text colour for the canvas on dark backgrounds (empty-state copy, grid lines). */
export const isDarkBackground = (color: string | undefined) => color === '#52525b' || color === '#18181b';

// ---- Status chips on Doc and Slides objects (gap list I3) ----------------------------------------------
/** The board status with this id, if any. */
export const statusInfo = (id: unknown) => boardStatuses.find(s => s.id === id);
/** Throw when an object's optional `data.status` is not a board status id. */
export function validateItemStatus(data: Record<string, unknown> | undefined): void {
  if (data?.status !== undefined && !isBoardStatus(data.status)) throw new Error('Invalid status.');
}
/** The next status in menu order; after the last one the status is cleared (undefined). */
export function nextItemStatus(current: unknown): BoardStatus | undefined {
  const index = boardStatuses.findIndex(s => s.id === current);
  return index === boardStatuses.length - 1 ? undefined : boardStatuses[index + 1].id;
}
/** Object data with the status set, or removed when `status` is undefined. */
export function withItemStatus<T extends Record<string, unknown>>(data: T, status: BoardStatus | undefined): T {
  const next: Record<string, unknown> = { ...data };
  if (status) next.status = status;
  else delete next.status;
  return next as T;
}
