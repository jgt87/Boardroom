// Frame formats. Evidence: FrameWidget carries frame format, orientation and device-skin identifiers.
import type { Item, Board, FrameFormat } from './model.ts';

export type FramePreset = {
  id: string;
  label: string;
  group: 'Presentation' | 'Paper' | 'Device' | 'Custom';
  w: number;
  h: number;
};
export const framePresets: FramePreset[] = [
  { id: 'custom', label: 'Custom', group: 'Custom', w: 0, h: 0 },
  { id: '16:9', label: 'Presentation 16:9', group: 'Presentation', w: 1280, h: 720 },
  { id: '4:3', label: 'Presentation 4:3', group: 'Presentation', w: 1024, h: 768 },
  { id: '1:1', label: 'Square 1:1', group: 'Presentation', w: 1080, h: 1080 },
  { id: 'a4', label: 'A4', group: 'Paper', w: 794, h: 1123 },
  { id: 'letter', label: 'US Letter', group: 'Paper', w: 816, h: 1056 },
  { id: 'a3', label: 'A3', group: 'Paper', w: 1123, h: 1587 },
  { id: 'phone', label: 'Phone', group: 'Device', w: 390, h: 844 },
  { id: 'tablet', label: 'Tablet', group: 'Device', w: 820, h: 1180 },
  { id: 'desktop', label: 'Desktop', group: 'Device', w: 1440, h: 1024 },
];

/** Natural orientation of a preset (its stored size). */
export const presetOrientation = (p: FramePreset): FrameFormat['orientation'] => (p.w > p.h ? 'landscape' : 'portrait');

/** Size for a preset in the requested orientation. */
export function presetSize(id: string, orientation: FrameFormat['orientation']): { w: number; h: number } | null {
  const p = framePresets.find(f => f.id === id);
  if (!p || p.id === 'custom') return null;
  const long = Math.max(p.w, p.h),
    short = Math.min(p.w, p.h);
  return orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}

/**
 * Change a frame's format. The frame keeps its top-left corner; contents are never moved or
 * scaled (resizing a frame is distinct from scaling its contents). Objects outside the new
 * bounds simply stop being contained by the frame.
 */
export function applyFrameFormat(
  board: Board,
  id: string,
  preset: string,
  orientation: FrameFormat['orientation'],
  custom?: { w: number; h: number },
): Board {
  const frame = board.items.find(i => i.id === id);
  if (!frame || frame.type !== 'frame') throw new Error('Select a frame first.');
  let size = presetSize(preset, orientation);
  if (!size) {
    const base = custom ?? { w: frame.w, h: frame.h };
    if (![base.w, base.h].every(v => Number.isFinite(v) && v >= 40 && v <= 20000))
      throw new Error('Use a width and height between 40 and 20,000.');
    size = (orientation === 'landscape') === base.w >= base.h ? base : { w: base.h, h: base.w };
  }
  const next: Item = {
    ...frame,
    w: size.w,
    h: size.h,
    frame: { preset: framePresets.some(p => p.id === preset) ? preset : 'custom', orientation },
  };
  return { ...board, items: board.items.map(i => (i.id === id ? next : i)) };
}
