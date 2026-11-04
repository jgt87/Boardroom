/** Camera coordinates use CSS pixels; positive world Y points down. */
export type Camera = { x: number; y: number; z: number };
type Point = { x: number; y: number };
/** Zoom range: 10% to 2000%. */
export const MIN_ZOOM = 0.1,
  MAX_ZOOM = 20;
/** Preset zoom levels offered in the view menu. */
export const zoomPresets = [0.5, 0.7, 1, 4, 12, 20];
export const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
export function screenToWorld(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) / camera.z, y: (point.y - camera.y) / camera.z };
}
export function worldToScreen(camera: Camera, point: Point): Point {
  return { x: point.x * camera.z + camera.x, y: point.y * camera.z + camera.y };
}
export function zoomCameraAt(camera: Camera, zoom: number, anchor: Point): Camera {
  if (!Number.isFinite(zoom) || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return camera;
  const z = clampZoom(zoom),
    world = screenToWorld(camera, anchor);
  return { z, x: anchor.x - world.x * z, y: anchor.y - world.y * z };
}
export function centeredCamera(center: Point, zoom: number, size: { w: number; h: number }): Camera {
  const z = clampZoom(zoom);
  return { z, x: size.w / 2 - center.x * z, y: size.h / 2 - center.y * z };
}

/**
 * Two-finger pinch (gap F11): zoom by the change in finger distance around the starting midpoint and pan by
 * how far the midpoint moved. Points are in canvas-local screen coordinates.
 */
export function pinchCamera(start: Camera, a0: Point, b0: Point, a: Point, b: Point): Camera {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y),
    d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d0 < 1 || !Number.isFinite(d)) return start;
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 },
    m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const zoomed = zoomCameraAt(start, start.z * (d / d0), m0);
  return { ...zoomed, x: zoomed.x + m.x - m0.x, y: zoomed.y + m.y - m0.y };
}
