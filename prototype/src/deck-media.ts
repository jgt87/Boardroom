// Slides and media (R4-Q2): image slides (PDF pages, frames), videos placed on slides, videos on a presented
// frame, picture sizes read from file headers. Pure: the browser code that renders pages and frames calls these.
import type { Board, Item } from './model.ts';
import { newSlide, DECK_MAX, SLIDE_TITLE_MAX } from './specs-activities.ts';
import type { DeckData, Slide } from './specs-activities.ts';
import { containBox, SLIDE_ELEMENTS_MAX, SLIDE_ELEMENT_ALT_MAX } from './slide-elements.ts';
import { slideFrames, presentationFrames } from './navigation.ts';
import { slideObjects } from './presentation-tools.ts';

/** Most pages a PDF turns into slides, and the longest side of a rendered page or frame image, in pixels. */
export const PDF_SLIDES_MAX = 50;
export const SLIDE_IMAGE_PX = 1920;
/** Largest PDF accepted for "PDF as Slides" (the PDF itself is not stored, only its page images). */
export const PDF_SLIDES_MAX_BYTES = 50 * 1024 * 1024;

const uid = () => crypto.randomUUID();

/** Width and height of a PNG, JPEG, GIF or WebP file from its header, or null when it cannot be read. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = bytes,
    u16 = (i: number) => (b[i] << 8) | b[i + 1],
    le16 = (i: number) => b[i] | (b[i + 1] << 8),
    le24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16),
    u32 = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3],
    ok = (width: number, height: number) => (width > 0 && height > 0 ? { width, height } : null);
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ok(u32(16), u32(20));
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return ok(le16(6), le16(8));
  if (
    b.length >= 30 &&
    String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.subarray(8, 12)) === 'WEBP'
  ) {
    const kind = String.fromCharCode(...b.subarray(12, 16));
    if (kind === 'VP8X') return ok(le24(24) + 1, le24(27) + 1);
    if (kind === 'VP8 ') return ok(le16(26) & 0x3fff, le16(28) & 0x3fff);
    if (kind === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      // Start-of-frame markers (baseline, progressive, …) hold the size; DHT, JPG and DAC do not.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return ok(u16(i + 7), u16(i + 5));
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

/** Scale that brings a w × h picture within `max` pixels on its longest side (never enlarges past `upTo`). */
export const rasterScale = (w: number, h: number, max = SLIDE_IMAGE_PX, upTo = 2): number =>
  Math.max(0.01, Math.min(upTo, max / Math.max(1, w, h)));

/** A blank slide showing one picture, as large as fits, on a background (PDF pages and frame images). */
export function imageSlide(
  title: string,
  image: { assetId: string; width: number; height: number; alt?: string },
  background = '#ffffff',
): Slide {
  const slide = newSlide('blank', { title: title.slice(0, SLIDE_TITLE_MAX), background });
  slide.elements = [
    {
      id: uid(),
      kind: 'image',
      ...containBox(image.width / image.height),
      assetId: image.assetId,
      alt: (image.alt ?? title).slice(0, SLIDE_ELEMENT_ALT_MAX),
    },
  ];
  return slide;
}

/** Pages a PDF turns into slides: at most PDF_SLIDES_MAX (and the deck limit), and how many were left out. */
export function pdfPagePlan(pageCount: number): { pages: number; capped: number } {
  const pages = Math.max(0, Math.min(pageCount, PDF_SLIDES_MAX, DECK_MAX));
  return { pages, capped: Math.max(0, pageCount - pages) };
}

/** Message after "PDF as Slides": slides made, pages left out and pages that could not be drawn. */
export function pdfSlidesNote(made: number, capped: number, failed = 0): string {
  const parts = [`${made} ${made === 1 ? 'page' : 'pages'} imported as image slides.`];
  if (capped) parts.push(`Only the first ${PDF_SLIDES_MAX} pages are imported; ${capped} more were left out.`);
  if (failed) parts.push(`${failed} ${failed === 1 ? 'page' : 'pages'} could not be drawn.`);
  parts.push(`Pages are drawn at up to ${SLIDE_IMAGE_PX} pixels wide.`);
  return parts.join(' ');
}

/**
 * Frames that become image slides: the selected frames in presentation order, or, with none selected, every
 * frame shown in the presentation (hidden frames skipped). At most the deck limit.
 */
export function imageDeckFrames(board: Board, selected: string[]): { frames: Item[]; capped: number } {
  const chosen = new Set(selected),
    picked = presentationFrames(board).filter(f => chosen.has(f.id)),
    frames = picked.length ? picked : slideFrames(board);
  return { frames: frames.slice(0, DECK_MAX), capped: Math.max(0, frames.length - DECK_MAX) };
}

/** A deck of image slides, one per frame image, in the given order; each slide is named after its frame. */
export function imageDeck(
  slides: { title: string; image: { assetId: string; width: number; height: number }; background?: string }[],
): DeckData {
  return {
    slides: slides.length
      ? slides.slice(0, DECK_MAX).map(s => imageSlide(s.title, s.image, s.background ?? '#ffffff'))
      : [newSlide('title', { title: 'Untitled' })],
    current: 0,
  };
}

/** Video objects (uploaded videos and Talktrack recordings) on a presented frame, in paint order. */
export const frameVideos = (board: Board, frame: Item): Item[] =>
  slideObjects(board, frame).filter(i => i.type === 'video' && !!i.assetId);

/** Every video object on the board that can be placed on a slide (it has a stored file). */
export const boardVideos = (board: Board): Item[] => board.items.filter(i => i.type === 'video' && !!i.assetId);

/**
 * Place a board video on a slide: a 16:9 box centred on the slide, playing the same stored file. Returns the deck
 * unchanged when the slide is full or missing.
 */
export function addVideoElement(
  deck: DeckData,
  slideId: string,
  video: Pick<Item, 'assetId' | 'text' | 'alt'>,
): DeckData {
  const slide = deck.slides.find(s => s.id === slideId);
  if (!slide || !video.assetId || (slide.elements?.length ?? 0) >= SLIDE_ELEMENTS_MAX) return deck;
  const element = {
    id: uid(),
    kind: 'video' as const,
    ...containBox(16 / 9, { x: 0.15, y: 0.2, w: 0.7, h: 0.7 }),
    assetId: video.assetId,
    alt: (video.alt || video.text || 'Video').slice(0, SLIDE_ELEMENT_ALT_MAX),
  };
  return {
    ...deck,
    slides: deck.slides.map(s => (s.id === slideId ? { ...s, elements: [...(s.elements ?? []), element] } : s)),
  };
}

/** Remove one element from a slide; the slide drops `elements` when none are left. */
export function removeElement(deck: DeckData, slideId: string, elementId: string): DeckData {
  return {
    ...deck,
    slides: deck.slides.map(s => {
      if (s.id !== slideId || !s.elements) return s;
      const elements = s.elements.filter(e => e.id !== elementId);
      const next: Slide = { ...s, elements };
      if (!elements.length) delete next.elements;
      return next;
    }),
  };
}

/** Change the text of a text element. */
export function setElementText(deck: DeckData, slideId: string, elementId: string, text: string): DeckData {
  return {
    ...deck,
    slides: deck.slides.map(s =>
      s.id === slideId && s.elements
        ? { ...s, elements: s.elements.map(e => (e.id === elementId && e.kind === 'text' ? { ...e, text } : e)) }
        : s,
    ),
  };
}

/** The board video that holds a stored file (for its trim, cuts and speed while a slide plays it). */
export const videoForAsset = (board: Board, assetId: string): Item | undefined =>
  board.items.find(i => i.type === 'video' && i.assetId === assetId);
