// Keep cascading menus on screen (track R2-K: small windows and browser zoom up to 200%). Pure.
type Box = { x: number; y: number; w: number; h: number };
type Rect = { left: number; right: number; top: number };
/** Gap kept between a menu and the window edge, in CSS pixels. */
export const MENU_MARGIN = 8;

/**
 * Where to put a menu whose natural box (`h` = full content height) overflows the window, or null when it
 * already fits. A submenu (with its `parent` list) flips to the parent's left side, and overlaps it when
 * neither side has room; any menu moves up to fit and scrolls when taller than the window. `force` places
 * it even when it fits (a submenu of a scrolling list, which would otherwise be clipped by it).
 */
export function fitMenu(
  box: Box,
  parent: Rect | null,
  view: { w: number; h: number },
  force = false,
): { x: number; y: number; maxH: number; scroll: boolean } | null {
  const m = MENU_MARGIN,
    maxH = Math.max(80, view.h - 2 * m),
    h = Math.min(box.h, maxH),
    fitsX = box.x >= m && box.x + box.w <= view.w - m,
    fitsY = box.y >= m && box.y + box.h <= view.h - m;
  if (fitsX && fitsY && !force) return null;
  let x = box.x;
  if (!fitsX) {
    if (parent && parent.left - 6 - box.w >= m) x = parent.left - 6 - box.w;
    else x = Math.max(m, Math.min(box.x, view.w - m - box.w));
  }
  const y = Math.max(m, Math.min(box.y, view.h - m - h));
  return { x: Math.round(x), y: Math.round(y), maxH, scroll: box.h > maxH };
}
