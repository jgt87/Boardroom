// Image objects: insertion sizing, crop geometry, replacement and portable asset handling.
// Evidence: ComputedImageWidget exposes cropShape/cropRect/isCroppable and a replace mode.
// Image bytes live in IndexedDB (see assets-store.ts); JSON backups embed them under `assets`.
import type { Board, Crop, ImageAdjust, ImageAsset, Item } from './model.ts';
import { createItem } from './model.ts';
import { editableIds } from './arrange.ts';
import { deckAssetIds } from './slide-elements.ts';
import {
  assetByteLimit,
  imageMimes,
  MAX_IMAGE_BYTES,
  MAX_SVG_BYTES,
  mediaMimes,
  originalImageMimes,
} from './model-ext.ts';

export { MAX_SVG_BYTES };
/**
 * Formats that are converted to PNG when added (gap b5-8). SVG is never placed in the page as markup: it is
 * decoded as an image (which runs no scripts and loads nothing external) and drawn to a canvas. The file as
 * added is kept beside the PNG as a download-only original (gap R2-Q3).
 */
export const convertibleImageMimes = originalImageMimes;
export const IMAGE_ACCEPT = [...imageMimes, ...convertibleImageMimes, '.svg', '.bmp'].join(',');
/** Whether a file of `mime` and `size` bytes is kept as the original of its PNG conversion. */
export const keepsOriginal = (mime: string, size: number) =>
  originalImageMimes.includes(mime) && size > 0 && size <= assetByteLimit(mime);
/**
 * Whether an asset may be drawn on the board as a picture. Kept SVG and BMP originals and the files of File
 * objects never are; they are only downloaded.
 */
export const drawableAsset = (asset: Pick<ImageAsset, 'mime'> | undefined) =>
  !!asset && (imageMimes.includes(asset.mime) || mediaMimes.includes(asset.mime));
/**
 * The file "Download original" saves for an image: the SVG or BMP it was converted from when that is kept
 * (gap R2-Q3), otherwise its stored picture.
 */
export function downloadableAsset(
  item: Pick<Item, 'assetId' | 'originalAssetId'>,
  assets: Record<string, ImageAsset>,
): ImageAsset | undefined {
  const original = item.originalAssetId ? assets[item.originalAssetId] : undefined;
  if (original && originalImageMimes.includes(original.mime)) return original;
  return item.assetId ? assets[item.assetId] : undefined;
}
/**
 * Asset ids an item refers to: its picture or media file, for converted images the original file, and for Slides
 * decks the pictures and videos placed on their slides (R4-Q2).
 */
export const itemAssetIds = (
  i: Pick<Item, 'assetId' | 'originalAssetId'> & { type?: string; data?: unknown },
): string[] =>
  [i.assetId, i.originalAssetId, ...(i.type === 'slides' ? deckAssetIds(i.data) : [])].filter(
    (id): id is string => !!id,
  );
/** The image type of a file from its MIME type, or from its extension when the type is missing. */
export function imageTypeOf(file: { type: string; name?: string }): string {
  const t = file.type === 'image/x-ms-bmp' ? 'image/bmp' : file.type;
  if (t) return t;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name ?? '')?.[1]?.toLowerCase();
  return (
    {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
    }[ext ?? ''] ?? ''
  );
}
/**
 * Pixel size to rasterise a converted image at. SVG has no fixed resolution, so small drawings are drawn
 * larger (longest side at least 1,024) to stay sharp when scaled; nothing exceeds the downscale limit.
 */
export function rasterSize(width: number, height: number, vector: boolean): { width: number; height: number } {
  const w = width > 0 ? width : 300,
    h = height > 0 ? height : 150,
    longest = Math.max(w, h),
    target = Math.min(DOWNSCALE_MAX_SIDE, vector ? Math.max(1024, longest) : longest),
    k = target / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
/** Width and height declared on an SVG's root element (attributes, else the viewBox), without parsing it as DOM. */
export function svgDeclaredSize(text: string): { width: number; height: number } | null {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) return null;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(root)?.[1];
  const px = (v?: string) => (v && /^\s*[\d.]+\s*(px)?\s*$/.test(v) ? parseFloat(v) : NaN);
  let width = px(attr('width')),
    height = px(attr('height'));
  const box = attr('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) {
    if (!(width > 0) && !(height > 0)) [width, height] = [box[2], box[3]];
    else if (!(width > 0)) width = (height * box[2]) / box[3];
    else if (!(height > 0)) height = (width * box[3]) / box[2];
  }
  return width > 0 && height > 0 ? { width, height } : null;
}
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
  const type = imageTypeOf(file);
  if (!imageMimes.includes(type) && !convertibleImageMimes.includes(type))
    return `${file.name ? `"${file.name}" is` : 'This file is'} not a supported image. Use PNG, JPEG, GIF, WebP, SVG or BMP.`;
  if (type === 'image/svg+xml' && file.size > MAX_SVG_BYTES)
    return `${file.name ? `"${file.name}"` : 'This SVG'} is larger than 5 MB. Choose a smaller SVG.`;
  const limit = type === 'image/gif' ? MAX_IMAGE_BYTES : MAX_IMAGE_INPUT_BYTES;
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
/** A base64 data URL of `bytes`. */
export function base64DataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}
/**
 * The download-only original of a converted SVG or BMP file (gap R2-Q3), sized like its PNG conversion.
 * Null when the type is not converted or the file is over the stored-file limit for its type.
 */
export function originalAsset(
  bytes: Uint8Array,
  mime: string,
  name: string,
  converted: Pick<ImageAsset, 'width' | 'height'>,
): ImageAsset | null {
  if (!keepsOriginal(mime, bytes.length)) return null;
  const ext = mime === 'image/bmp' ? 'bmp' : 'svg';
  return {
    mime,
    data: base64DataUrl(bytes, mime),
    width: converted.width,
    height: converted.height,
    name: (name || `Image.${ext}`).slice(0, 200),
  };
}
/** MIME type and bytes of a data URL (base64 or percent-encoded). */
export function decodeDataUrl(url: string): { mime: string; bytes: Uint8Array } {
  const comma = url.indexOf(','),
    head = url.slice(5, comma),
    body = url.slice(comma + 1),
    mime = head.split(';')[0] || 'application/octet-stream';
  if (!url.startsWith('data:') || comma < 0) throw new Error('This file is not stored in a readable form.');
  if (/;base64$/i.test(head)) {
    const raw = atob(body),
      bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return { mime, bytes };
  }
  return { mime, bytes: new TextEncoder().encode(decodeURIComponent(body)) };
}
const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};
/** File name to download a stored asset under: its own name, with an extension that matches its type. */
export function originalFileName(asset: Pick<ImageAsset, 'name' | 'mime'>, fallback = 'file'): string {
  const ext = extensions[asset.mime] ?? 'bin',
    base =
      (asset.name || fallback)
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .trim()
        .slice(0, 120) || fallback;
  const known = /\.([a-z0-9]{2,5})$/i.exec(base)?.[1]?.toLowerCase();
  if (known === ext || (ext === 'jpg' && known === 'jpeg')) return base;
  return `${known && Object.values(extensions).includes(known) ? base.slice(0, -known.length - 1) : base}.${ext}`;
}

// ---- Non-destructive adjustments (flip, brightness, contrast; gap b6-6) ---------------------------
/** Brightness and contrast are percentages; 100 leaves the picture unchanged. */
export const ADJUST_MIN = 0;
export const ADJUST_MAX = 200;
/** Drop default values so an unadjusted image carries no `adjust` field. */
export function cleanAdjust(a: ImageAdjust | undefined): ImageAdjust | undefined {
  if (!a) return undefined;
  const out: ImageAdjust = {};
  if (a.flipX) out.flipX = true;
  if (a.flipY) out.flipY = true;
  for (const k of ['brightness', 'contrast'] as const) {
    const v = a[k];
    if (typeof v === 'number' && Number.isFinite(v) && Math.round(v) !== 100)
      out[k] = Math.min(ADJUST_MAX, Math.max(ADJUST_MIN, Math.round(v)));
  }
  return Object.keys(out).length ? out : undefined;
}
/** Merge `patch` into the adjustments of the given images (other objects are left alone). */
export function adjustImages(board: Board, ids: string[], patch: (a: ImageAdjust) => ImageAdjust): Board {
  const set = new Set(ids);
  return {
    ...board,
    items: board.items.map(i => {
      if (!set.has(i.id) || i.type !== 'image') return i;
      const next = { ...i },
        a = cleanAdjust(patch({ ...(i.adjust ?? {}) }));
      if (a) next.adjust = a;
      else delete next.adjust;
      return next;
    }),
  };
}
/** SVG transform that mirrors a w×h box in place, or undefined when not flipped. */
export function flipTransform(a: ImageAdjust | undefined, w: number, h: number): string | undefined {
  if (!a?.flipX && !a?.flipY) return undefined;
  return `translate(${a.flipX ? w : 0} ${a.flipY ? h : 0}) scale(${a.flipX ? -1 : 1} ${a.flipY ? -1 : 1})`;
}
/**
 * Linear colour transfer for brightness then contrast: v' = c·(b·v) + (1 − c)/2. Returns null when there is
 * nothing to change. The same numbers drive the canvas filter, so exports match the screen.
 */
export function adjustTransfer(a: ImageAdjust | undefined): { slope: number; intercept: number } | null {
  const b = (a?.brightness ?? 100) / 100,
    c = (a?.contrast ?? 100) / 100;
  if (b === 1 && c === 1) return null;
  return { slope: +(b * c).toFixed(4), intercept: +((1 - c) / 2).toFixed(4) };
}
/** Approximate byte size of a base64 data URL. */
export const dataUrlBytes = (data: string) => Math.floor(((data.length - data.indexOf(',') - 1) * 3) / 4);
/** Display size that preserves the aspect ratio and fits within `max` on its longer side. */
export function fitImage(width: number, height: number, max = 480): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { w: Math.max(20, Math.round(width * scale)), h: Math.max(20, Math.round(height * scale)) };
}
export function createImageItem(
  assetId: string,
  asset: ImageAsset,
  center: { x: number; y: number },
  originalAssetId?: string,
): Item {
  const size = fitImage(asset.width, asset.height),
    item = createItem('image', center.x - size.w / 2, center.y - size.h / 2);
  return { ...item, ...size, assetId, ...(originalAssetId ? { originalAssetId } : {}), text: asset.name.slice(0, 200) };
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
/**
 * Square up an image for the circle mask (decision Q13, 2026-11-08): the visible part is cropped to its centred
 * square and the box becomes a square of the shorter side, keeping its centre, so the circle is a true circle.
 */
export function squareForCircle(item: Item, asset: ImageAsset): Item {
  const c = clampCrop(item.crop ?? FULL_CROP),
    pw = c.w * asset.width,
    ph = c.h * asset.height,
    side = Math.min(pw, ph),
    crop = clampCrop({
      x: c.x + (pw - side) / 2 / asset.width,
      y: c.y + (ph - side) / 2 / asset.height,
      w: side / asset.width,
      h: side / asset.height,
    }),
    box = Math.min(item.w, item.h);
  const next: Item = { ...item, x: item.x + (item.w - box) / 2, y: item.y + (item.h - box) / 2, w: box, h: box };
  if (crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1) delete next.crop;
  else next.crop = crop;
  return next;
}
/** Replace the picture while preserving placement (position, width, layer, links and group). */
export function replaceImage(
  board: Board,
  id: string,
  assetId: string,
  asset: ImageAsset,
  originalAssetId?: string,
): Board {
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id) return i;
      const h = (i.w * asset.height) / asset.width,
        next: Item = { ...i, assetId, h, y: i.y + (i.h - h) / 2, text: asset.name.slice(0, 200) };
      delete next.crop;
      if (originalAssetId) next.originalAssetId = originalAssetId;
      else delete next.originalAssetId;
      return next;
    }),
  };
}
/** SVG viewBox (in natural pixels) that shows only the cropped region. */
export function cropViewBox(asset: ImageAsset, crop: Crop = FULL_CROP): string {
  return `${crop.x * asset.width} ${crop.y * asset.height} ${crop.w * asset.width} ${crop.h * asset.height}`;
}
/** Every asset referenced by the board (images, video, PDF and the originals of converted images). */
export const referencedAssets = (board: Board) => new Set(board.items.flatMap(itemAssetIds));
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
  // A missing original only means "Download original" falls back to the PNG, so it is not counted.
  const shown = new Set(next.items.filter(i => i.assetId).map(i => i.assetId!)),
    missing = [...shown].filter(id => !assets[id] && !known[id]).length;
  return { board: next, assets, missing };
}
/**
 * Animated GIF settings on images (track G): `paused` starts the animation paused, `once` plays it once instead of
 * looping. Only unlocked images change; false values are dropped, so a cleared setting leaves no trace.
 */
export function setGifOptions(board: Board, ids: string[], patch: { paused?: boolean; once?: boolean }): Board {
  const set = new Set(editableIds(board, ids));
  let changed = false;
  const items = board.items.map(i => {
    if (!set.has(i.id) || i.type !== 'image') return i;
    const merged = { ...i.gif, ...patch },
      gif: { paused?: boolean; once?: boolean } = {};
    if (merged.paused) gif.paused = true;
    if (merged.once) gif.once = true;
    if (!!i.gif?.paused === !!gif.paused && !!i.gif?.once === !!gif.once) return i;
    changed = true;
    const next = { ...i };
    if (Object.keys(gif).length) next.gif = gif;
    else delete next.gif;
    return next;
  });
  return changed ? { ...board, items } : board;
}
