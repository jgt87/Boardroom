// Portable board bundle: a ZIP holding board.json, manifest.json and media/<assetId>.<ext> as raw bytes,
// so images, video and PDF are not inflated by base64 the way a JSON backup is.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import type { Zippable } from 'fflate';
import type { Board, ImageAsset } from './model.ts';
import { assetByteLimit, assetMimes, MAX_MEDIA_BYTES } from './model-ext.ts';
import { deckAssetIds } from './slide-elements.ts';

export const BUNDLE_FORMAT = 'boardroom-bundle';
export const BUNDLE_VERSION = 1;
export const MAX_BUNDLE_BYTES = 300_000_000;
export const MAX_BUNDLE_ENTRIES = 600;

export const extByMime: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  // Download-only originals of converted images (gap R2-Q3).
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  // Files kept by File objects (track J).
  'application/octet-stream': 'bin',
};
export const ID = /^[A-Za-z0-9_-]{1,100}$/;
export const MEDIA_ENTRY = /^media\/([A-Za-z0-9_-]{1,100})\.(png|jpg|gif|webp|mp4|webm|pdf|svg|bmp|bin)$/;

export type ManifestAsset = { mime: string; width: number; height: number; name: string; file: string };
type Manifest = { format: string; version: number; assets: Record<string, ManifestAsset> };

export function dataUrlBytes(data: string, mime: string): Uint8Array {
  const prefix = `data:${mime};base64,`;
  if (!data.startsWith(prefix)) throw new Error('An asset is not a base64 data URL of its declared type.');
  const bin = atob(data.slice(prefix.length)),
    out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}
const referenced = (board: { items?: unknown }, originals = true) =>
  new Set(
    (Array.isArray(board.items) ? board.items : [])
      .flatMap((i: { assetId?: unknown; originalAssetId?: unknown; type?: unknown; data?: unknown }) => [
        ...(originals ? [i?.assetId, i?.originalAssetId] : [i?.assetId]),
        // Pictures and videos placed on Slides slides (R4-Q2).
        ...(i?.type === 'slides' ? deckAssetIds(i.data) : []),
      ])
      .filter((id): id is string => typeof id === 'string' && !!id),
  );
export const limitFor = assetByteLimit;

/** ZIP magic number check (local file header "PK\x03\x04"). */
export function isBundle(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Bundle a board with the media it references. JSON is deflated; already-compressed media is stored. */
export function encodeBundle(board: Board, assets: Record<string, ImageAsset>): Uint8Array {
  const doc: Board = { ...board };
  delete doc.assets;
  const manifest: Manifest = { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, assets: {} };
  const files: Zippable = {};
  for (const id of referenced(board)) {
    const a = assets[id];
    if (!a) continue;
    const ext = extByMime[a.mime];
    if (!ext || !ID.test(id)) throw new Error(`Asset ${id} cannot be bundled.`);
    const file = `media/${id}.${ext}`;
    files[file] = [dataUrlBytes(a.data, a.mime), { level: 0 }];
    manifest.assets[id] = { mime: a.mime, width: a.width, height: a.height, name: a.name, file };
  }
  files['manifest.json'] = [strToU8(JSON.stringify(manifest)), { level: 6 }];
  files['board.json'] = [strToU8(JSON.stringify(doc)), { level: 6 }];
  return zipSync(files);
}

/**
 * Read a bundle. Entries are checked by name and declared size before they are inflated (path traversal,
 * unexpected files, per-file and total limits). Returns the raw board for parseBoard, the rebuilt assets
 * and the ids of referenced assets that the bundle does not contain.
 */
export function decodeBundle(bytes: Uint8Array): {
  board: unknown;
  assets: Record<string, ImageAsset>;
  missing: string[];
} {
  if (!isBundle(bytes)) throw new Error('This file is not a board bundle.');
  let count = 0,
    total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: file => {
        if (++count > MAX_BUNDLE_ENTRIES) throw new Error('The bundle contains too many files.');
        if (file.name.endsWith('/') && file.originalSize === 0 && file.name === 'media/') return false;
        if (file.name !== 'manifest.json' && file.name !== 'board.json' && !MEDIA_ENTRY.test(file.name))
          throw new Error(`Unexpected file in bundle: ${file.name.slice(0, 80)}`);
        const max = MEDIA_ENTRY.test(file.name) ? MAX_MEDIA_BYTES : 60_000_000;
        if (file.originalSize > max) throw new Error(`${file.name} is too large.`);
        total += file.originalSize;
        if (total > MAX_BUNDLE_BYTES) throw new Error('The bundle is larger than 300 MB.');
        return true;
      },
    });
  } catch (err) {
    throw err instanceof Error && !/invalid|unexpected EOF|zip/i.test(err.message)
      ? err
      : new Error('The bundle is damaged or not a ZIP file.');
  }
  if (!entries['manifest.json']) throw new Error('The bundle has no manifest.');
  if (!entries['board.json']) throw new Error('The bundle has no board.');
  let manifest: Manifest, board: unknown;
  try {
    manifest = JSON.parse(strFromU8(entries['manifest.json']));
    board = JSON.parse(strFromU8(entries['board.json']));
  } catch {
    throw new Error('The bundle contains invalid JSON.');
  }
  if (
    !manifest ||
    manifest.format !== BUNDLE_FORMAT ||
    manifest.version !== BUNDLE_VERSION ||
    !manifest.assets ||
    typeof manifest.assets !== 'object' ||
    Array.isArray(manifest.assets)
  )
    throw new Error('Unsupported bundle format.');
  const assets = assetsFromManifest(manifest.assets, entries);
  // A missing original (gap R2-Q3) only means its PNG is downloaded instead, so it is not reported.
  const missing = [...referenced(board as { items?: unknown }, false)].filter(id => !assets[id]);
  return { board, assets, missing };
}

/** Rebuild media assets from a validated manifest and the inflated ZIP entries (shared with library backups). */
export function assetsFromManifest(
  manifestAssets: Record<string, ManifestAsset>,
  entries: Record<string, Uint8Array>,
): Record<string, ImageAsset> {
  const assets: Record<string, ImageAsset> = {};
  for (const [id, m] of Object.entries(manifestAssets)) {
    if (!ID.test(id) || !m || typeof m !== 'object') throw new Error('The bundle manifest is invalid.');
    if (!assetMimes.includes(m.mime))
      throw new Error(`Unsupported media type in bundle: ${String(m.mime).slice(0, 40)}`);
    if (m.file !== `media/${id}.${extByMime[m.mime]}`)
      throw new Error('The bundle manifest does not match its media files.');
    if (
      ![m.width, m.height].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 20000) ||
      typeof m.name !== 'string' ||
      m.name.length > 200
    )
      throw new Error('The bundle manifest has invalid media details.');
    const data = entries[m.file];
    if (!data) continue;
    if (data.length > limitFor(m.mime)) throw new Error(`${m.name || id} is larger than allowed for its type.`);
    assets[id] = { mime: m.mime, data: bytesDataUrl(data, m.mime), width: m.width, height: m.height, name: m.name };
  }
  for (const name of Object.keys(entries)) {
    const match = MEDIA_ENTRY.exec(name);
    if (match && !manifestAssets[match[1]]) throw new Error(`Unexpected file in bundle: ${name}`);
  }
  return assets;
}
