// Export regions: frame pages with their title band, a dragged export area and selection-only exports.
// Pure module (no React or DOM), shared by the exporters and the tests.
import type { Item, Point } from './model.ts';
import { frameMoveIds } from './interactions.ts';

export type Region = { x: number; y: number; w: number; h: number };

/** Frame titles are drawn above the frame; exports draw them at this world size. */
export const FRAME_TITLE_SIZE = 16;
/** Distance from the title baseline to the frame's top edge in exports. */
export const FRAME_TITLE_OFFSET = 10;
/** Height above a frame kept on its PDF page so the title is not cropped off. */
export const FRAME_TITLE_BAND = 32;

/** Page region for one frame, including the title band above it. */
export function frameExportRegion(frame: Pick<Item, 'x' | 'y' | 'w' | 'h'>): Region {
  return { x: frame.x, y: frame.y - FRAME_TITLE_BAND, w: frame.w, h: frame.h + FRAME_TITLE_BAND };
}

/** Smallest dragged area that counts as an export area, in screen pixels. */
export const MIN_AREA_PX = 8;
/** Rectangle spanned by two corner points, in either order. */
export function areaBetween(a: Point, b: Point): Region {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/**
 * Objects that a selection-only export keeps: the selection, the contents of selected frames, and
 * connectors whose both ends are kept (so a selected diagram exports with its lines).
 */
export function exportIds(items: Item[], ids: string[]): Set<string> {
  const keep = new Set(frameMoveIds(items, ids));
  for (const i of items) if (i.type === 'arrow' && i.from && i.to && keep.has(i.from) && keep.has(i.to)) keep.add(i.id);
  return keep;
}
