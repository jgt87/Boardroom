// Animated GIF detection for reduce motion (gap F8 / Q2) and play-once copies (track G). Pure: no React, no DOM.

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

/**
 * The same GIF set to play its animation once (track G): the looping (NETSCAPE2.0 / ANIMEXTS1.0) application
 * extension is removed, which every browser reads as "play once". A comment block carrying `nonce` is added after
 * the colour table, so each replay gets a different data URL and the browser restarts the animation.
 * Returns null for anything that is not a well-formed GIF.
 */
export function gifPlayOnce(bytes: Uint8Array, nonce = 0): Uint8Array | null {
  const n = bytes.length;
  if (n < 14) return null;
  const sig = String.fromCharCode(...bytes.subarray(0, 6));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  let at = 13;
  const flags = bytes[10];
  if (flags & 0x80) at += 3 * (1 << ((flags & 0x07) + 1));
  if (at > n) return null;
  const skipBlocks = (p: number) => {
    while (p < n) {
      const size = bytes[p];
      p += 1 + size;
      if (size === 0) return p <= n ? p : -1;
    }
    return -1;
  };
  const tag = String(nonce).slice(0, 200),
    comment = [0x21, 0xfe, tag.length, ...[...tag].map(c => c.charCodeAt(0) & 0x7f), 0x00];
  const parts: Uint8Array[] = [bytes.subarray(0, at), Uint8Array.from(tag ? comment : [])];
  // GIF87a has no extensions; the comment needs 89a.
  if (tag) parts[0] = Uint8Array.from([...'GIF89a'].map(c => c.charCodeAt(0)).concat([...bytes.subarray(6, at)]));
  while (at < n) {
    const block = bytes[at];
    if (block === 0x3b) {
      parts.push(bytes.subarray(at));
      break;
    }
    let end: number;
    if (block === 0x21) {
      end = skipBlocks(at + 2);
      if (end < 0) return null;
      const app =
        bytes[at + 1] === 0xff && bytes[at + 2] === 11 ? String.fromCharCode(...bytes.subarray(at + 3, at + 14)) : '';
      if (app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0') {
        at = end;
        continue;
      }
    } else if (block === 0x2c) {
      if (at + 10 > n) return null;
      const local = bytes[at + 9];
      end = at + 10;
      if (local & 0x80) end += 3 * (1 << ((local & 0x07) + 1));
      end = skipBlocks(end + 1);
      if (end < 0) return null;
    } else return null;
    parts.push(bytes.subarray(at, end));
    at = end;
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
/** Base64 `data:` URL of GIF bytes. */
export function gifDataUrl(bytes: Uint8Array): string {
  let bin = '';
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return `data:image/gif;base64,${btoa(bin)}`;
}
/** Does the GIF loop (carries a looping application extension)? */
export function gifLoops(bytes: Uint8Array): boolean {
  for (let k = 0; k + 14 <= bytes.length; k++)
    if (bytes[k] === 0x21 && bytes[k + 1] === 0xff && bytes[k + 2] === 11) {
      const app = String.fromCharCode(...bytes.subarray(k + 3, k + 14));
      if (app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0') return true;
    }
  return false;
}
