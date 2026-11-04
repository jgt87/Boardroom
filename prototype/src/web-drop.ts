// Images dragged from web pages (gap b6-7 #3). A drag from another site carries text/html with an <img>
// and/or a text/uri-list address, not a file. Pure: the markup is read with regular expressions and is
// never placed in the page.

export type DroppedImage = { kind: 'data'; url: string } | { kind: 'remote'; url: string };

const imageData = /^data:image\/(png|jpeg|gif|webp|svg\+xml|bmp);/i;
const imagePath = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(?:$|[?#])/i;
/** Longest data URL accepted from a drop (about 50 MB of image data). */
export const MAX_DROP_DATA_URL = 70_000_000;

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function classify(raw: string | undefined, fromImg: boolean): DroppedImage | null {
  const url = raw?.trim();
  if (!url) return null;
  if (url.startsWith('data:'))
    return imageData.test(url) && url.length <= MAX_DROP_DATA_URL ? { kind: 'data', url } : null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.username || parsed.password) return null;
  return fromImg || imagePath.test(parsed.pathname + parsed.search) ? { kind: 'remote', url: parsed.href } : null;
}

/** Source of the first <img> in dragged markup, when the markup is essentially just that picture. */
export function imageSourceInHtml(html: string): string | undefined {
  if (!html || html.length > MAX_DROP_DATA_URL) return undefined;
  const tag = /<img\b[^>]*>/i.exec(html)?.[0];
  if (!tag) return undefined;
  // Selected text that happens to contain a picture stays text.
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 160) return undefined;
  const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
  const value = src?.[1] ?? src?.[2] ?? src?.[3];
  return value === undefined ? undefined : decodeEntities(value);
}

/** The picture a drop from a web page carries, if any: an <img> in the markup, or an image address. */
export function droppedImage(html: string, uriList: string, plain = ''): DroppedImage | null {
  const fromHtml = classify(imageSourceInHtml(html), true);
  if (fromHtml) return fromHtml;
  const uri = uriList
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => l && !l.startsWith('#'));
  return classify(uri, false) ?? (plain.includes('\n') ? null : classify(plain, false));
}

/** A file name for a dropped picture, from its address. */
export function droppedImageName(url: string, mime: string): string {
  const ext = mime.split('/')[1]?.replace('svg+xml', 'svg').replace('jpeg', 'jpg') || 'png';
  if (url.startsWith('data:')) return `Dropped image.${ext}`;
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    const base = last
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!base) return `Dropped image.${ext}`;
    return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${ext}`;
  } catch {
    return `Dropped image.${ext}`;
  }
}
