// Local image storage in IndexedDB, so large images do not exhaust the localStorage budget.
import type { ImageAsset } from './model';
import { imageFileError } from './images';

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
  if (!size.width || !size.height || size.width > 20000 || size.height > 20000)
    throw new Error('Use an image no larger than 20,000 pixels on each side.');
  return { mime: file.type, data, ...size, name: (file.name || 'Pasted image').slice(0, 200) };
}
