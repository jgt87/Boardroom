// Animated GIF detection for reduce motion (gap F8 / Q2). Pure: no React, no DOM.

/** Bytes of a base64 `data:` URL, or null when it is not one. */
export function dataUrlBytes(url: string): Uint8Array | null {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0 || !url.slice(0, comma).endsWith(';base64')) return null;
  try {
    const raw = atob(url.slice(comma + 1)),
      bytes = new Uint8Array(raw.length);
    for (let k = 0; k < raw.length; k++) bytes[k] = raw.charCodeAt(k);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Number of image frames in a GIF, counting at most `limit` (enough to tell a still from an animation).
 * Returns 0 for anything that is not a well-formed GIF up to that point.
 */
export function gifFrameCount(bytes: Uint8Array, limit = Infinity): number {
  const n = bytes.length;
  if (n < 13) return 0;
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return 0;
  let at = 13;
  const flags = bytes[10];
  if (flags & 0x80) at += 3 * (1 << ((flags & 0x07) + 1));
  /** Skip data sub-blocks; returns the index after the terminator, or -1 when truncated. */
  const skipBlocks = (p: number) => {
    while (p < n) {
      const size = bytes[p];
      p += 1 + size;
      if (size === 0) return p;
    }
    return -1;
  };
  let frames = 0;
  while (at < n && frames < limit) {
    const block = bytes[at];
    if (block === 0x3b) break;
    if (block === 0x21) {
      at = skipBlocks(at + 2);
    } else if (block === 0x2c) {
      if (at + 10 > n) break;
      const local = bytes[at + 9];
      at += 10;
      if (local & 0x80) at += 3 * (1 << ((local & 0x07) + 1));
      at = skipBlocks(at + 1);
      if (at < 0) break;
      frames++;
    } else break;
    if (at < 0) break;
  }
  return frames;
}

/** Is this image asset an animated GIF (two or more frames)? */
export function isAnimatedGif(asset: { mime: string; data: string }): boolean {
  if (asset.mime !== 'image/gif') return false;
  const bytes = dataUrlBytes(asset.data);
  return !!bytes && gifFrameCount(bytes, 2) >= 2;
}
