// Stickies capture (item 101). Pure: finds paper sticky notes in a photo by colour.
// Works on a downscaled RGBA image: sticky notes are bright, saturated patches against paper,
// walls or desks. Text is not read (no OCR); each note keeps its colour and relative position.

export type Rgba = { width: number; height: number; data: Uint8ClampedArray | number[] };
export type FoundNote = { x: number; y: number; w: number; h: number; color: string };

const hexToRgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function nearestColor(rgb: number[], palette: string[]): string {
  let best = palette[0]!,
    dist = Infinity;
  for (const c of palette) {
    const p = hexToRgb(c),
      d = (p[0]! - rgb[0]!) ** 2 + (p[1]! - rgb[1]!) ** 2 + (p[2]! - rgb[2]!) ** 2;
    if (d < dist) [best, dist] = [c, d];
  }
  return best;
}

/** Saturation and value in 0..1 (HSV). */
const sv = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  return [max ? (max - min) / max : 0, max / 255] as const;
};

/**
 * Detect sticky notes. Returns rectangles in the image's pixel coordinates, ordered top-to-bottom
 * then left-to-right. A note must cover at least `minArea` of the image and fill most of its box.
 */
export function detectStickies(img: Rgba, palette: string[], minArea = 0.004): FoundNote[] {
  const { width: W, height: H, data } = img,
    mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const [s, v] = sv(data[p * 4]!, data[p * 4 + 1]!, data[p * 4 + 2]!);
    if (s > 0.28 && v > 0.45) mask[p] = 1;
  }
  const seen = new Uint8Array(W * H),
    out: FoundNote[] = [],
    stack: number[] = [];
  for (let start = 0; start < W * H; start++) {
    if (!mask[start] || seen[start]) continue;
    let minX = W,
      minY = H,
      maxX = 0,
      maxY = 0,
      count = 0,
      r = 0,
      g = 0,
      b = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!,
        x = p % W,
        y = (p - x) / W;
      count++;
      r += data[p * 4]!;
      g += data[p * 4 + 1]!;
      b += data[p * 4 + 2]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1])
        if (q >= 0 && mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
    }
    const w = maxX - minX + 1,
      h = maxY - minY + 1;
    // Real notes are roughly square patches that fill most of their bounding box.
    if (count < minArea * W * H || count / (w * h) < 0.55 || w / h > 3 || h / w > 3) continue;
    out.push({ x: minX, y: minY, w, h, color: nearestColor([r / count, g / count, b / count], palette) });
  }
  const row = (n: FoundNote) => Math.round((n.y + n.h / 2) / (H / 8));
  return out.sort((a, b) => row(a) - row(b) || a.x - b.x);
}

/** Lay found notes out on the board at `origin`, scaling the photo so notes come out `size` wide on average. */
export function placeNotes(found: FoundNote[], origin: { x: number; y: number }, size = 210) {
  if (!found.length) return [];
  const avg = found.reduce((s, n) => s + n.w, 0) / found.length,
    k = size / avg,
    minX = Math.min(...found.map(n => n.x)),
    minY = Math.min(...found.map(n => n.y));
  return found.map(n => ({
    x: origin.x + (n.x - minX) * k * 1.1,
    y: origin.y + (n.y - minY) * k * 1.1,
    color: n.color,
  }));
}
