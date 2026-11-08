// Positioned slide elements (R4-Q2): text boxes, pictures and videos placed on a Slides slide. Pure.
// A slide without `elements` renders its layout fields as before. Positions and sizes are fractions of the
// slide (0–1, the slide is always 16:9); text sizes are percentages of the slide width (cqw on the canvas).
// Pictures and videos refer to stored assets by `assetId`, the same field name objects use, so the asset
// scan in board-library.ts keeps them and backups carry them.
import type { Slide } from './specs-activities.ts';

export const slideElementKinds = ['text', 'image', 'video'] as const;
export type SlideElementKind = (typeof slideElementKinds)[number];
export type SlideElement = {
  id: string;
  kind: SlideElementKind;
  /** Left, top, width and height as fractions of the slide width and height. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text of a text box (lines separated by \n). */
  text?: string;
  /** Text size as a percentage of the slide width. */
  size?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Text colour, #rrggbb. */
  color?: string;
  /** Stored picture or video (images and videos). */
  assetId?: string;
  /** Alternative text of a picture, or the name of a video. */
  alt?: string;
};
export const SLIDE_ELEMENTS_MAX = 60;
export const SLIDE_ELEMENT_TEXT_MAX = 4000;
export const SLIDE_ELEMENT_ALT_MAX = 300;
export const SLIDE_TEXT_SIZE_MIN = 0.5;
export const SLIDE_TEXT_SIZE_MAX = 20;
const aligns = ['left', 'center', 'right'];

const finite = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;

/** Throws when a slide's elements are not valid. Slides without elements pass unchanged. */
export function validateSlideElements(elements: unknown): void {
  if (elements === undefined) return;
  if (!Array.isArray(elements) || elements.length > SLIDE_ELEMENTS_MAX) throw new Error('Invalid slide elements.');
  const ids = new Set<string>();
  for (const e of elements as SlideElement[]) {
    const ok =
      !!e &&
      typeof e === 'object' &&
      str(e.id, 100) &&
      !!e.id &&
      !ids.has(e.id) &&
      slideElementKinds.includes(e.kind) &&
      finite(e.x, 0, 1) &&
      finite(e.y, 0, 1) &&
      finite(e.w, 0.001, 1) &&
      finite(e.h, 0.001, 1) &&
      e.x + e.w <= 1.0001 &&
      e.y + e.h <= 1.0001 &&
      (e.text === undefined || str(e.text, SLIDE_ELEMENT_TEXT_MAX)) &&
      (e.size === undefined || finite(e.size, SLIDE_TEXT_SIZE_MIN, SLIDE_TEXT_SIZE_MAX)) &&
      (e.bold === undefined || typeof e.bold === 'boolean') &&
      (e.align === undefined || aligns.includes(e.align)) &&
      (e.color === undefined || (typeof e.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color))) &&
      (e.alt === undefined || str(e.alt, SLIDE_ELEMENT_ALT_MAX)) &&
      (e.kind === 'text'
        ? e.assetId === undefined && typeof e.text === 'string'
        : typeof e.assetId === 'string' && !!e.assetId && e.assetId.length <= 100);
    if (!ok) throw new Error('Invalid slide element.');
    ids.add(e.id);
  }
}

/** Asset ids referenced by the elements of a deck's slides (any `data`; unknown shapes give none). */
export function deckAssetIds(data: unknown): string[] {
  const slides = (data as { slides?: unknown } | undefined)?.slides;
  if (!Array.isArray(slides)) return [];
  const out: string[] = [];
  for (const s of slides) {
    const elements = (s as { elements?: unknown } | null)?.elements;
    if (!Array.isArray(elements)) continue;
    for (const e of elements) {
      const id = (e as { assetId?: unknown } | null)?.assetId;
      if (typeof id === 'string' && id && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** Replace asset ids in a deck's elements (paste and import remap them). Returns the same data when none change. */
export function remapDeckAssets<T>(data: T, map: (id: string) => string | undefined): T {
  const d = data as { slides?: Slide[] };
  if (!Array.isArray(d?.slides) || !d.slides.some(s => s.elements?.some(e => e.assetId))) return data;
  return {
    ...d,
    slides: d.slides.map(s =>
      s.elements
        ? {
            ...s,
            elements: s.elements.map(e => {
              const next = e.assetId ? map(e.assetId) : undefined;
              return next && next !== e.assetId ? { ...e, assetId: next } : e;
            }),
          }
        : s,
    ),
  } as T;
}

/** Text of a slide's text elements, for search and exports. */
export const elementText = (s: Pick<Slide, 'elements'>): string =>
  (s.elements ?? [])
    .map(e => (e.kind === 'text' ? (e.text ?? '') : (e.alt ?? '')))
    .filter(t => t.trim())
    .join('\n');

/** Whether a slide draws its positioned elements instead of its layout fields (blank layout with elements). */
export const usesElements = (s: Pick<Slide, 'layout' | 'elements'>): boolean =>
  s.layout === 'blank' && !!s.elements?.length;

/** The largest box of the given aspect (width / height, in pixels) that fits a 16:9 slide box, centred. */
export function containBox(
  aspect: number,
  box: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 1, h: 1 },
): { x: number; y: number; w: number; h: number } {
  const slideAspect = (16 / 9) * (box.w / box.h),
    a = Number.isFinite(aspect) && aspect > 0 ? aspect : slideAspect;
  // Fractions of the slide: a box of width fraction w and height fraction h has pixel aspect w*16 / (h*9).
  const w = a >= slideAspect ? box.w : box.w * (a / slideAspect),
    h = a >= slideAspect ? box.h * (slideAspect / a) : box.h;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
