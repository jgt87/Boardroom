// Local image storage in IndexedDB, so large images do not exhaust the localStorage budget.
import type { ImageAsset } from './model';
import { DOWNSCALE_MAX_SIDE, dataUrlBytes, downscaleSize, imageFileError } from './images';
import { MAX_IMAGE_BYTES } from './model-ext';

const DB = 'boardroom-assets',
  STORE = 'assets';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Image storage is unavailable.'));
  });
}
async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode),
      request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request ? request.result : undefined);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error('Image storage failed.'));
    };
  });
}
export const saveAsset = (id: string, asset: ImageAsset) =>
  run('readwrite', s => {
    s.put(asset, id);
  });
export async function loadAssets(): Promise<Record<string, ImageAsset>> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out: Record<string, ImageAsset> = {},
      tx = db.transaction(STORE, 'readonly'),
      cursor = tx.objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) {
        out[String(c.key)] = c.value as ImageAsset;
        c.continue();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(out);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
/** Remove stored images no longer referenced. Run only at startup, when no undo history exists. */
export async function pruneAssets(keep: Set<string>): Promise<void> {
  const all = await loadAssets();
  await Promise.all(
    Object.keys(all)
      .filter(id => !keep.has(id))
      .map(id =>
        run('readwrite', s => {
          s.delete(id);
        }),
      ),
  );
}
/** Read and decode a local image file into a storable asset. */
export async function readImageFile(file: File): Promise<ImageAsset> {
  const error = imageFileError(file);
  if (error) throw new Error(error);
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The image could not be read.'));
    r.readAsDataURL(file);
  });
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('The image could not be decoded.'));
    img.src = data;
  });
  const name = (file.name || 'Pasted image').slice(0, 200);
  if (!size.width || !size.height) throw new Error('The image could not be decoded.');
  const tooBig = file.size > MAX_IMAGE_BYTES || size.width > 20000 || size.height > 20000;
  if (!tooBig) return { mime: file.type, data, ...size, name };
  if (file.type === 'image/gif') throw new Error('Use a GIF smaller than 4 MB and 20,000 pixels on each side.');
  return downscaleImage(data, size, name);
}

/** Re-encode a large still image smaller (gap B10): WebP where supported, otherwise JPEG. */
async function downscaleImage(
  data: string,
  size: { width: number; height: number },
  name: string,
): Promise<ImageAsset> {
  const img = new Image();
  img.src = data;
  await img.decode();
  let side = DOWNSCALE_MAX_SIDE;
  for (let attempt = 0; attempt < 6; attempt++) {
    const target = downscaleSize(size.width, size.height, side),
      canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, target.width, target.height);
    let out = canvas.toDataURL('image/webp', 0.88),
      mime = 'image/webp';
    if (!out.startsWith('data:image/webp')) {
      out = canvas.toDataURL('image/jpeg', 0.88);
      mime = 'image/jpeg';
    }
    if (dataUrlBytes(out) <= MAX_IMAGE_BYTES) return { mime, data: out, ...target, name };
    side = Math.round(side * 0.75);
  }
  throw new Error('The image could not be made small enough to store. Choose a smaller image.');
}
