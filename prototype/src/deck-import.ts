// PDF as Slides (R4-Q2): every page (up to PDF_SLIDES_MAX) is drawn with pdfjs-dist into a JPEG and becomes an
// image slide. Browser only. The page images are returned as assets for the asset store; the PDF itself is not kept.
import type { ImageAsset } from './model';
import type { DeckData } from './specs-activities';
import { MAX_IMAGE_BYTES } from './model-ext';
import { imageDeck, pdfPagePlan, rasterScale, SLIDE_IMAGE_PX } from './deck-media';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** A canvas as a JPEG data URL within the image size limit (lower quality, then smaller, until it fits). */
export function canvasJpeg(canvas: HTMLCanvasElement): string {
  const limit = MAX_IMAGE_BYTES * 1.33;
  for (const q of [0.88, 0.75, 0.6]) {
    const data = canvas.toDataURL('image/jpeg', q);
    if (data.length <= limit) return data;
  }
  const half = document.createElement('canvas');
  half.width = Math.max(1, Math.round(canvas.width / 2));
  half.height = Math.max(1, Math.round(canvas.height / 2));
  half.getContext('2d')!.drawImage(canvas, 0, 0, half.width, half.height);
  return half.toDataURL('image/jpeg', 0.75);
}

export type PdfDeck = {
  deck: DeckData;
  assets: Record<string, ImageAsset>;
  made: number;
  capped: number;
  failed: number;
};

/** Draw a PDF's pages as image slides. Throws an Error with a readable message when the PDF cannot be opened. */
export async function pdfToSlides(bytes: Uint8Array, name: string): Promise<PdfDeck> {
  // The same loose typing as the PDF object viewer (widgets-media.tsx): isEvalSupported is not in the typings.
  const lib: any = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  let doc: any;
  try {
    doc = await lib.getDocument({ data: bytes, isEvalSupported: false }).promise;
  } catch {
    throw new Error('This PDF could not be opened. It may be damaged or password-protected.');
  }
  try {
    const plan = pdfPagePlan(doc.numPages),
      assets: Record<string, ImageAsset> = {},
      slides: Parameters<typeof imageDeck>[0] = [],
      base = name.replace(/\.pdf$/i, '').slice(0, 150) || 'PDF';
    let failed = 0;
    for (let n = 1; n <= plan.pages; n++) {
      try {
        const page = await doc.getPage(n),
          unit = page.getViewport({ scale: 1 }),
          viewport = page.getViewport({ scale: rasterScale(unit.width, unit.height, SLIDE_IMAGE_PX, 4) }),
          canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const g = canvas.getContext('2d')!;
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: g, canvas, viewport }).promise;
        const id = crypto.randomUUID(),
          data = canvasJpeg(canvas);
        assets[id] = {
          mime: 'image/jpeg',
          data,
          width: canvas.width,
          height: canvas.height,
          name: `${base} - page ${n}.jpg`.slice(0, 200),
        };
        slides.push({
          title: `Page ${n}`,
          image: { assetId: id, width: canvas.width, height: canvas.height },
        });
      } catch {
        failed++;
      }
    }
    if (!slides.length) throw new Error('No pages of this PDF could be drawn.');
    const deck = imageDeck(slides);
    for (const s of deck.slides)
      if (s.elements?.[0]) s.elements[0].alt = `${base}, ${s.title.toLowerCase()}`.slice(0, 300);
    return { deck, assets, made: slides.length, capped: plan.capped, failed };
  } finally {
    void doc.destroy?.();
  }
}
