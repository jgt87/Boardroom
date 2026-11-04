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
