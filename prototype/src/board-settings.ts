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
] as const;
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
}

/** Set or clear one optional setting without leaving undefined keys behind. */
export function withSetting<K extends 'background' | 'startView' | 'status'>(
  board: Board,
  key: K,
  value: Board[K] | null,
): Board {
  const next = { ...board };
  if (value === null || value === undefined || (key === 'background' && value === DEFAULT_BACKGROUND)) delete next[key];
  else next[key] = value;
  return next;
}

/** Text colour for the canvas on dark backgrounds (empty-state copy, grid lines). */
export const isDarkBackground = (color: string | undefined) => color === '#52525b' || color === '#18181b';
