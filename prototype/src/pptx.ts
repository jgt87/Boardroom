// PowerPoint import into Slides (item 84, extended by R4-Q2). Pure: reads slide titles and text in presentation
// order and, when the file says where they go, the position and size of text boxes and pictures. Pictures
// (PNG, JPEG, GIF and WebP up to 4 MB) become image assets; other picture types, notes and animations are not
// imported. A slide whose shapes have no known position keeps the earlier title-and-text import.
// Uses the public fflate package; only XML parts under ppt/ and pictures under ppt/media/ are decompressed.
import { unzipSync } from 'fflate';
import type { ImageAsset } from './model.ts';
import type { Slide } from './specs-activities.ts';
import { newSlide, DECK_MAX, SLIDE_TITLE_MAX, SLIDE_BODY_MAX } from './specs-activities.ts';
import type { SlideElement } from './slide-elements.ts';
import {
  SLIDE_ELEMENTS_MAX,
  SLIDE_ELEMENT_TEXT_MAX,
  SLIDE_ELEMENT_ALT_MAX,
  SLIDE_TEXT_SIZE_MIN,
  SLIDE_TEXT_SIZE_MAX,
} from './slide-elements.ts';
import { imageSize } from './deck-media.ts';
import { bytesDataUrl } from './media-bundle.ts';

export const PPTX_MAX_BYTES = 50 * 1024 * 1024;
const PART_MAX = 5 * 1024 * 1024;
/** Largest picture imported, and most pictures per presentation. */
export const PPTX_IMAGE_MAX_BYTES = 4_000_000;
export const PPTX_IMAGES_MAX = 150;
const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
/** Default slide size (16:9 widescreen) in EMU when presentation.xml has none. */
const DEFAULT_SIZE = { cx: 12192000, cy: 6858000 };
const EMU_PER_PT = 12700;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16))))
    .replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const num = (tag: string | undefined, name: string) => {
  const v = tag ? Number(attr(tag, name)) : NaN;
  return Number.isFinite(v) ? v : undefined;
};

/** Text of each paragraph in an XML fragment (runs joined, line breaks kept). */
export function paragraphs(xml: string): string[] {
  return [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
    .map(p =>
      [...p[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)]
        .map(m => (m[0].startsWith('<a:br') ? '\n' : decode(m[1])))
        .join(''),
    )
    .map(t => t.replace(/\s+$/g, ''))
    .filter(t => t.trim());
}

/** Top-level child elements of an XML fragment, as their outer markup with the tag name. */
export function childElements(xml: string): { name: string; xml: string }[] {
  const out: { name: string; xml: string }[] = [];
  let depth = 0,
    start = -1,
    name = '';
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)\b[^>]*?(\/?)>/g)) {
    if (m[0].startsWith('<?') || m[0].startsWith('<!')) continue;
    const closing = !!m[1],
      selfClosing = !!m[3];
    if (closing) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ name, xml: xml.slice(start, m.index! + m[0].length) });
        start = -1;
      }
    } else if (selfClosing) {
      if (depth === 0) out.push({ name: m[2], xml: m[0] });
    } else {
      if (depth === 0) {
        start = m.index!;
        name = m[2];
      }
      depth++;
    }
  }
  return out;
}

type Box = { x: number; y: number; w: number; h: number };
/** Maps a box in a group's child coordinates to slide coordinates (EMU). */
type Transform = (b: Box) => Box;
const identity: Transform = b => b;

/** Offset and extent of the first transform in a shape (a:xfrm or p:xfrm), in EMU. */
export function shapeBox(xml: string): Box | undefined {
  const xfrm = xml.match(/<(?:a|p):xfrm\b[\s\S]*?<\/(?:a|p):xfrm>/)?.[0];
  if (!xfrm) return undefined;
  const off = xfrm.match(/<a:off\b[^>]*>/)?.[0],
    ext = xfrm.match(/<a:ext\b[^>]*>/)?.[0],
    x = num(off, 'x'),
    y = num(off, 'y'),
    w = num(ext, 'cx'),
    h = num(ext, 'cy');
  return x === undefined || y === undefined || w === undefined || h === undefined ? undefined : { x, y, w, h };
}
function groupTransform(group: string, parent: Transform): Transform {
  const props = group.match(/<p:grpSpPr\b[\s\S]*?<\/p:grpSpPr>/)?.[0] ?? '',
    off = props.match(/<a:off\b[^>]*>/)?.[0],
    ext = props.match(/<a:ext\b[^>]*>/)?.[0],
    chOff = props.match(/<a:chOff\b[^>]*>/)?.[0],
    chExt = props.match(/<a:chExt\b[^>]*>/)?.[0];
  const ox = num(off, 'x') ?? 0,
    oy = num(off, 'y') ?? 0,
    cx = num(chOff, 'x') ?? ox,
    cy = num(chOff, 'y') ?? oy,
    sx = (num(ext, 'cx') ?? 1) / (num(chExt, 'cx') || num(ext, 'cx') || 1),
    sy = (num(ext, 'cy') ?? 1) / (num(chExt, 'cy') || num(ext, 'cy') || 1);
  return b => parent({ x: ox + (b.x - cx) * sx, y: oy + (b.y - cy) * sy, w: b.w * sx, h: b.h * sy });
}

/** Placeholder positions of a layout or master part, keyed by `idx:N` and `type:T`. */
export function placeholderBoxes(xml: string): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const m of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/g)) {
    const ph = m[0].match(/<p:ph\b[^>]*>/)?.[0],
      box = shapeBox(m[0]);
    if (!ph || !box) continue;
    const idx = attr(ph, 'idx'),
      type = attr(ph, 'type') ?? 'body';
    if (idx && !out.has(`idx:${idx}`)) out.set(`idx:${idx}`, box);
    if (!out.has(`type:${type}`)) out.set(`type:${type}`, box);
  }
  return out;
}
const placeholderKey = (ph: string) => {
  const type = attr(ph, 'type') ?? 'body';
  return { idx: attr(ph, 'idx'), type: type === 'ctrTitle' ? 'title' : type === 'subTitle' ? 'body' : type, raw: type };
};

/** What one slide part needs from the rest of the package (all optional, so a bare slide still imports). */
export type SlideContext = {
  /** Slide size in EMU (p:sldSz). */
  size?: { cx: number; cy: number };
  /** Relationship id → package path, from the slide's _rels part. */
  rels?: Map<string, string>;
  /** Inherited placeholder positions: layout first, then master. */
  inherited?: Map<string, Box>[];
  /** Store a picture by package path; returns its asset id, or undefined when it is not imported. */
  picture?: (path: string) => { assetId: string } | undefined;
};

type Mapping = { sx: number; sy: number; ox: number; oy: number; widthPt: number };
/** Fit the slide's own aspect into the 16:9 slide face, centred, so shapes keep their proportions. */
function faceMapping(size: { cx: number; cy: number }): Mapping {
  const a = size.cx / size.cy,
    t = 16 / 9,
    sx = a < t ? a / t : 1,
    sy = a < t ? 1 : t / a;
  return { sx, sy, ox: (1 - sx) / 2, oy: (1 - sy) / 2, widthPt: size.cx / EMU_PER_PT };
}
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 10000) / 10000;
function toFace(b: Box, size: { cx: number; cy: number }, m: Mapping) {
  const x0 = clamp01(m.ox + (b.x / size.cx) * m.sx),
    y0 = clamp01(m.oy + (b.y / size.cy) * m.sy),
    x1 = clamp01(m.ox + ((b.x + b.w) / size.cx) * m.sx),
    y1 = clamp01(m.oy + ((b.y + b.h) / size.cy) * m.sy);
  if (x1 - x0 < 0.002 || y1 - y0 < 0.002) return undefined;
  const x = round(x0),
    y = round(y0);
  return { x, y, w: Math.min(round(x1 - x0), 1 - x), h: Math.min(round(y1 - y0), 1 - y) };
}

/** Text style of a shape's first run: size (pt), bold, alignment and colour. */
function textStyle(xml: string, isTitle: boolean, m: Mapping) {
  const body = xml.match(/<p:txBody\b[\s\S]*?<\/p:txBody>/)?.[0] ?? '',
    run = body.match(/<a:(?:rPr|defRPr|endParaRPr)\b[^>]*>/)?.[0],
    sz = num(run, 'sz'),
    pt = sz ? sz / 100 : isTitle ? 40 : 20,
    size = Math.max(SLIDE_TEXT_SIZE_MIN, Math.min(SLIDE_TEXT_SIZE_MAX, round((pt / m.widthPt) * 100 * m.sx))),
    algn = body.match(/<a:pPr\b[^>]*\balgn="(\w+)"/)?.[1],
    color = body.match(
      /<a:rPr\b[^>]*>\s*(?:<a:ln\b[\s\S]*?<\/a:ln>\s*)?<a:solidFill>\s*<a:srgbClr val="([0-9a-fA-F]{6})"/,
    )?.[1];
  return {
    size,
    ...(run && attr(run, 'b') === '1' ? { bold: true } : {}),
    ...(algn === 'ctr' ? { align: 'center' as const } : algn === 'r' ? { align: 'right' as const } : {}),
    ...(color ? { color: `#${color.toLowerCase()}` } : {}),
  };
}

/** Title and body text of one slide part; with a context, also its positioned text boxes and pictures. */
export function slideFromXml(xml: string, ctx: SlideContext = {}): Slide {
  let title = '',
    centred = false;
  const body: string[] = [],
    elements: SlideElement[] = [],
    size = ctx.size ?? DEFAULT_SIZE,
    mapping = faceMapping(size);
  let positioned = false;
  const visit = (parentXml: string, transform: Transform) => {
    for (const child of childElements(parentXml)) {
      if (child.name === 'p:grpSp') {
        const inner = child.xml.replace(/^<p:grpSp\b[^>]*>/, '').replace(/<\/p:grpSp>$/, '');
        visit(inner, groupTransform(child.xml, transform));
        continue;
      }
      if (child.name === 'p:pic') {
        const embed = child.xml.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1],
          path = embed ? ctx.rels?.get(embed) : undefined,
          stored = path ? ctx.picture?.(path) : undefined,
          box = shapeBox(child.xml),
          at = box ? toFace(transform(box), size, mapping) : undefined;
        if (stored && at && elements.length < SLIDE_ELEMENTS_MAX) {
          const cNvPr = child.xml.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? '';
          elements.push({
            id: crypto.randomUUID(),
            kind: 'image',
            ...at,
            assetId: stored.assetId,
            alt: decode(attr(cNvPr, 'descr') || attr(cNvPr, 'name') || 'Picture').slice(0, SLIDE_ELEMENT_ALT_MAX),
          });
          positioned = true;
        }
        continue;
      }
      if (child.name !== 'p:sp' && child.name !== 'p:graphicFrame') continue;
      const ph = child.xml.match(/<p:ph\b[^>]*>/)?.[0],
        type = ph ? attr(ph, 'type') : undefined,
        text = paragraphs(child.xml);
      if (!text.length) continue;
      const isTitle = type === 'title' || type === 'ctrTitle';
      if (!title && isTitle) {
        title = text.join(' ');
        centred = type === 'ctrTitle';
      } else body.push(...text);
      // Position: the shape's own, else the inherited placeholder (layout, then master).
      let box = shapeBox(child.xml);
      if (box) box = transform(box);
      else if (ph) {
        const key = placeholderKey(ph);
        for (const map of ctx.inherited ?? []) {
          box =
            (key.idx ? map.get(`idx:${key.idx}`) : undefined) ??
            map.get(`type:${key.raw}`) ??
            map.get(`type:${key.type}`);
          if (box) break;
        }
      }
      const at = box ? toFace(box, size, mapping) : undefined;
      if (at && elements.length < SLIDE_ELEMENTS_MAX) {
        elements.push({
          id: crypto.randomUUID(),
          kind: 'text',
          ...at,
          text: text.join('\n').slice(0, SLIDE_ELEMENT_TEXT_MAX),
          ...textStyle(child.xml, isTitle, mapping),
        });
        positioned = true;
      }
    }
  };
  const tree = xml.match(/<p:spTree\b[^>]*>([\s\S]*)<\/p:spTree>/)?.[1];
  if (tree !== undefined) visit(tree, identity);
  else
    for (const m of xml.matchAll(/<p:(sp|graphicFrame)\b[\s\S]*?<\/p:\1>/g)) {
      // Fragments without a shape tree (older fixtures): text only, as before.
      const part = m[0],
        ph = part.match(/<p:ph\b[^>]*>/)?.[0],
        type = ph ? attr(ph, 'type') : undefined,
        text = paragraphs(part);
      if (!text.length) continue;
      if (!title && (type === 'title' || type === 'ctrTitle')) {
        title = text.join(' ');
        centred = type === 'ctrTitle';
      } else body.push(...text);
    }
  const background = xml.match(/<p:bg\b[\s\S]*?<a:srgbClr val="([0-9a-fA-F]{6})"/)?.[1];
  if (positioned) {
    const slide = newSlide('blank', {
      title: title.slice(0, SLIDE_TITLE_MAX),
      ...(background ? { background: `#${background.toLowerCase()}` } : {}),
    });
    slide.elements = elements;
    return slide;
  }
  const layout = centred ? 'title' : !title && !body.length ? 'blank' : 'content';
  return newSlide(layout, {
    title: title.slice(0, SLIDE_TITLE_MAX),
    body: body.join('\n').slice(0, SLIDE_BODY_MAX),
  });
}

/** Relationship targets of a _rels part, resolved against the folder of the part they belong to. */
export function relTargets(rels: string, partPath: string, typePattern?: RegExp): Map<string, string> {
  const base = partPath.split('/').slice(0, -1),
    out = new Map<string, string>();
  for (const r of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(r[0], 'Id'),
      target = attr(r[0], 'Target'),
      type = attr(r[0], 'Type') ?? '';
    if (!id || !target || attr(r[0], 'TargetMode') === 'External' || (typePattern && !typePattern.test(type))) continue;
    const parts = target.startsWith('/') ? target.slice(1).split('/') : [...base, ...target.split('/')],
      resolved: string[] = [];
    for (const p of parts)
      if (p === '..') resolved.pop();
      else if (p && p !== '.') resolved.push(p);
    out.set(id, resolved.join('/'));
  }
  return out;
}
const relsPath = (part: string) => {
  const k = part.lastIndexOf('/');
  return `${part.slice(0, k)}/_rels/${part.slice(k + 1)}.rels`;
};

/** Slide part paths in presentation order. */
export function slideOrder(presentation: string, rels: string): string[] {
  const targets = relTargets(rels, 'ppt/presentation.xml', /\/slide$/);
  return [...presentation.matchAll(/<p:sldId\b[^>]*>/g)]
    .map(s => targets.get(attr(s[0], 'r:id') ?? ''))
    .filter((p): p is string => !!p);
}

export type PptxDeck = {
  slides: Slide[];
  /** Pictures placed on the slides, keyed by new asset ids. */
  assets: Record<string, ImageAsset>;
  /** Pictures left out: unsupported type, too large, or past the picture limit. */
  skippedImages: number;
  /** Slides past the deck limit. */
  cappedSlides: number;
};

/** Parse a .pptx file into slides with their pictures. Throws an Error with a user-readable message. */
export function parsePptxDeck(bytes: Uint8Array): PptxDeck {
  if (bytes.length > PPTX_MAX_BYTES) throw new Error('PowerPoint files up to 50 MB can be imported.');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: f =>
        (f.originalSize <= PART_MAX &&
          (f.name === 'ppt/presentation.xml' ||
            f.name === 'ppt/_rels/presentation.xml.rels' ||
            /^ppt\/(slides|slideLayouts|slideMasters)\/(_rels\/)?[\w-]+\.xml(\.rels)?$/.test(f.name))) ||
        (f.originalSize <= PPTX_IMAGE_MAX_BYTES && /^ppt\/media\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(f.name)),
    });
  } catch {
    throw new Error('This file is not a PowerPoint (.pptx) presentation.');
  }
  const text = (name: string) => (files[name] ? new TextDecoder().decode(files[name]) : '');
  const presentation = text('ppt/presentation.xml');
  if (!presentation) throw new Error('This file is not a PowerPoint (.pptx) presentation.');
  let order = slideOrder(presentation, text('ppt/_rels/presentation.xml.rels'));
  if (!order.length)
    order = Object.keys(files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
  const sldSz = presentation.match(/<p:sldSz\b[^>]*>/)?.[0],
    cx = num(sldSz, 'cx'),
    cy = num(sldSz, 'cy'),
    size = cx && cy && cx > 0 && cy > 0 ? { cx, cy } : DEFAULT_SIZE;
  const assets: Record<string, ImageAsset> = {},
    byPath = new Map<string, string | null>();
  let skippedImages = 0;
  const picture = (path: string) => {
    if (byPath.has(path)) {
      const id = byPath.get(path);
      return id ? { assetId: id } : undefined;
    }
    const ext = path.split('.').pop()!.toLowerCase(),
      mime = imageTypes[ext],
      data = files[path],
      dims = data ? imageSize(data) : null;
    if (!mime || !data || !dims || Object.keys(assets).length >= PPTX_IMAGES_MAX) {
      byPath.set(path, null);
      skippedImages++;
      return undefined;
    }
    const id = crypto.randomUUID();
    assets[id] = {
      mime,
      data: bytesDataUrl(data, mime),
      width: Math.min(20000, dims.width),
      height: Math.min(20000, dims.height),
      name: path.split('/').pop()!.slice(0, 200),
    };
    byPath.set(path, id);
    return { assetId: id };
  };
  const present = order.filter(n => files[n]);
  const slides = present.slice(0, DECK_MAX).map(n => {
    const rels = relTargets(text(relsPath(n)), n),
      layout = [...relTargets(text(relsPath(n)), n, /\/slideLayout$/).values()][0],
      master = layout ? [...relTargets(text(relsPath(layout)), layout, /\/slideMaster$/).values()][0] : undefined,
      inherited = [layout, master].filter((p): p is string => !!p && !!files[p]).map(p => placeholderBoxes(text(p)));
    return slideFromXml(text(n), { size, rels, inherited, picture });
  });
  if (!slides.length) throw new Error('No slides were found in this presentation.');
  return { slides, assets, skippedImages, cappedSlides: Math.max(0, present.length - DECK_MAX) };
}

/** Parse a .pptx file into slides (pictures are dropped; use parsePptxDeck to keep them). */
export function parsePptx(bytes: Uint8Array): Slide[] {
  return parsePptxDeck(bytes).slides;
}

/** Message after a PowerPoint import. */
export function pptxImportNote(deck: PptxDeck): string {
  const n = deck.slides.length,
    pictures = Object.keys(deck.assets).length,
    laidOut = deck.slides.filter(s => s.elements?.length).length,
    parts = [`${n} ${n === 1 ? 'slide' : 'slides'} imported.`];
  if (laidOut) parts.push(`${laidOut} keep${laidOut === 1 ? 's' : ''} the PowerPoint layout.`);
  if (pictures) parts.push(`${pictures} ${pictures === 1 ? 'picture' : 'pictures'} imported.`);
  if (deck.skippedImages)
    parts.push(
      `${deck.skippedImages} ${deck.skippedImages === 1 ? 'picture was' : 'pictures were'} left out (only PNG, JPEG, GIF and WebP up to 4 MB, at most ${PPTX_IMAGES_MAX}).`,
    );
  if (deck.cappedSlides) parts.push(`Only the first ${DECK_MAX} slides are imported.`);
  if (!laidOut && !pictures) parts.push('Layouts and pictures were not found in this file.');
  return parts.join(' ');
}
