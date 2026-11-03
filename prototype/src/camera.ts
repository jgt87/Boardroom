/** Camera coordinates use CSS pixels; positive world Y points down. */
export type Camera = { x: number; y: number; z: number };
type Point = { x: number; y: number };
export function screenToWorld(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) / camera.z, y: (point.y - camera.y) / camera.z };
}
export function worldToScreen(camera: Camera, point: Point): Point {
  return { x: point.x * camera.z + camera.x, y: point.y * camera.z + camera.y };
}
export function zoomCameraAt(camera: Camera, zoom: number, anchor: Point): Camera {
  if (!Number.isFinite(zoom) || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return camera;
  const z = Math.max(0.1, Math.min(4, zoom)),
    world = screenToWorld(camera, anchor);
  return { z, x: anchor.x - world.x * z, y: anchor.y - world.y * z };
}
export function centeredCamera(center: Point, zoom: number, size: { w: number; h: number }): Camera {
  const z = Math.max(0.1, Math.min(4, zoom));
  return { z, x: size.w / 2 - center.x * z, y: size.h / 2 - center.y * z };
}
