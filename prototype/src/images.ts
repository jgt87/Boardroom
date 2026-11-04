// Image objects: insertion sizing, crop geometry, replacement and portable asset handling.
// Evidence: ComputedImageWidget exposes cropShape/cropRect/isCroppable and a replace mode.
// Image bytes live in IndexedDB (see assets-store.ts); JSON backups embed them under `assets`.
import type { Board, Crop, ImageAsset, Item } from './model.ts';
import { createItem } from './model.ts';
import { imageMimes, MAX_IMAGE_BYTES } from './model-ext.ts';

export const IMAGE_ACCEPT = imageMimes.join(',');
export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };

/** Largest file accepted for downscaling (gap B10); stored images are still at most MAX_IMAGE_BYTES. */
export const MAX_IMAGE_INPUT_BYTES = 50_000_000;
/** Longest side of an image that had to be downscaled. */
export const DOWNSCALE_MAX_SIDE = 4096;
/**
 * Whether a file can be added. Large still images are accepted up to 50 MB because they are downscaled
 * before storing (gap B10); animated GIFs cannot be re-encoded and keep the 4 MB limit.
 */
export function imageFileError(file: { type: string; size: number; name?: string }): string | null {
  if (!imageMimes.includes(file.type))
    return `${file.name ? `"${file.name}" is` : 'This file is'} not a supported image. Use PNG, JPEG, GIF or WebP.`;
  const limit = file.type === 'image/gif' ? MAX_IMAGE_BYTES : MAX_IMAGE_INPUT_BYTES;
  if (file.size > limit)
    return `${file.name ? `"${file.name}"` : 'This image'} is larger than ${limit === MAX_IMAGE_BYTES ? '4' : '50'} MB. Choose a smaller image.`;
  return null;
}
/** Size to re-encode an image at so its longest side is at most `max` (keeps the aspect ratio). */
export function downscaleSize(
  width: number,
  height: number,
  max = DOWNSCALE_MAX_SIDE,
): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
/** Approximate byte size of a base64 data URL. */
export const dataUrlBytes = (data: string) => Math.floor(((data.length - data.indexOf(',') - 1) * 3) / 4);
/** Display size that preserves the aspect ratio and fits within `max` on its longer side. */
export function fitImage(width: number, height: number, max = 480): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { w: Math.max(20, Math.round(width * scale)), h: Math.max(20, Math.round(height * scale)) };
}
export function createImageItem(assetId: string, asset: ImageAsset, center: { x: number; y: number }): Item {
  const size = fitImage(asset.width, asset.height),
    item = createItem('image', center.x - size.w / 2, center.y - size.h / 2);
  return { ...item, ...size, assetId, text: asset.name.slice(0, 200) };
}
export function clampCrop(c: Crop): Crop {
  const w = Math.min(1, Math.max(0.01, c.w)),
    h = Math.min(1, Math.max(0.01, c.h));
  return { x: Math.min(1 - w, Math.max(0, c.x)), y: Math.min(1 - h, Math.max(0, c.y)), w, h };
}
/** Aspect ratio (width / height) of the visible part of an image. */
export const cropAspect = (asset: ImageAsset, crop: Crop = FULL_CROP) =>
  (crop.w * asset.width) / (crop.h * asset.height);
/** Commit a crop. The original bytes are untouched; the object keeps its centre and width. */
export function applyCrop(board: Board, id: string, crop: Crop | null, asset: ImageAsset): Board {
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id) return i;
      const c = crop ? clampCrop(crop) : null,
        full = !c || (c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1);
      const h = i.w / cropAspect(asset, c ?? FULL_CROP),
        next: Item = { ...i, y: i.y + (i.h - h) / 2, h };
      if (full) delete next.crop;
      else next.crop = c!;
      return next;
    }),
  };
}
/** Replace the picture while preserving placement (position, width, layer, links and group). */
export function replaceImage(board: Board, id: string, assetId: string, asset: ImageAsset): Board {
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id) return i;
      const h = (i.w * asset.height) / asset.width,
        next: Item = { ...i, assetId, h, y: i.y + (i.h - h) / 2, text: asset.name.slice(0, 200) };
      delete next.crop;
      return next;
    }),
  };
}
/** SVG viewBox (in natural pixels) that shows only the cropped region. */
export function cropViewBox(asset: ImageAsset, crop: Crop = FULL_CROP): string {
  return `${crop.x * asset.width} ${crop.y * asset.height} ${crop.w * asset.width} ${crop.h * asset.height}`;
}
/** Every asset referenced by the board (images, video and PDF). */
export const referencedAssets = (board: Board) => new Set(board.items.filter(i => i.assetId).map(i => i.assetId!));
/** Portable backup: embed the image data that the board references. */
export function withAssets(board: Board, assets: Record<string, ImageAsset>): Board {
  const used = [...referencedAssets(board)].filter(id => assets[id]);
  const next = { ...board };
  if (used.length) next.assets = Object.fromEntries(used.map(id => [id, assets[id]]));
  else delete next.assets;
  return next;
}
/** Split an imported board into its document and the embedded assets. Missing images are reported. */
export function splitAssets(
  board: Board,
  known: Record<string, ImageAsset>,
): { board: Board; assets: Record<string, ImageAsset>; missing: number } {
  const assets = board.assets ?? {},
    next = { ...board };
  delete next.assets;
  const missing = [...referencedAssets(next)].filter(id => !assets[id] && !known[id]).length;
  return { board: next, assets, missing };
}
