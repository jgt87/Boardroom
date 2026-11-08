// Image slides from frames (R4-Q2): each frame is drawn with the board's own export code (SVG through a data:
// URL, then a canvas) and becomes one image slide of a new Slides deck, placed to the right of the frames.
import { useApp } from './board-app';
import { useExporters } from './use-exporters';
import { createItem } from './model';
import type { ImageAsset } from './model';
import { MAX_IMAGE_BYTES } from './model-ext';
import { imageDeck, imageDeckFrames, rasterScale, SLIDE_IMAGE_PX } from './deck-media';
import { saveAsset } from './assets-store';

const blobDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The frame image could not be read.'));
    r.readAsDataURL(blob);
  });

export function useImageDeck() {
  const { boardRef, update, setSelected, display, setAssets } = useApp(),
    { buildSvg, rasterize } = useExporters();
  /** Make the deck from the given frame ids (or every presented frame when none of them is a frame). */
  return async (selected: string[]) => {
    const board = boardRef.current,
      { frames, capped } = imageDeckFrames(board, selected);
    if (!frames.length) {
      display('Add frames to make image slides from them.');
      return;
    }
    display(`Drawing ${frames.length} ${frames.length === 1 ? 'frame' : 'frames'}…`);
    try {
      const assets: Record<string, ImageAsset> = {},
        slides: Parameters<typeof imageDeck>[0] = [];
      for (const f of frames) {
        const region = { x: f.x, y: f.y, w: Math.max(1, f.w), h: Math.max(1, f.h) },
          built = buildSvg(region);
        let scale = rasterScale(region.w, region.h, SLIDE_IMAGE_PX),
          data = await blobDataUrl(await rasterize(built.svg, built.box, 'image/jpeg', scale));
        // Keep each picture within the image limit.
        while (data.length > MAX_IMAGE_BYTES * 1.33 && scale > 0.1) {
          scale /= 2;
          data = await blobDataUrl(await rasterize(built.svg, built.box, 'image/jpeg', scale));
        }
        const id = crypto.randomUUID(),
          width = Math.max(1, Math.round(region.w * scale)),
          height = Math.max(1, Math.round(region.h * scale));
        assets[id] = {
          mime: 'image/jpeg',
          data,
          width,
          height,
          name: `${f.text || 'Frame'}.jpg`.slice(0, 200),
        };
        slides.push({
          title: f.text || 'Untitled frame',
          image: { assetId: id, width, height },
          background: /^#[0-9a-f]{6}$/i.test(f.fill) ? f.fill : '#ffffff',
        });
      }
      for (const [id, asset] of Object.entries(assets)) await saveAsset(id, asset);
      setAssets(a => ({ ...a, ...assets }));
      const current = boardRef.current,
        item = createItem('slides', Math.max(...frames.map(f => f.x + f.w)) + 80, Math.min(...frames.map(f => f.y)));
      item.text = 'Image slides from frames';
      item.data = imageDeck(slides);
      update({ ...current, items: [...current.items, item] });
      setSelected([item.id]);
      display(
        `Created a deck with ${slides.length} image ${slides.length === 1 ? 'slide' : 'slides'}.` +
          (capped ? ` Only the first ${frames.length} frames were used; ${capped} more were left out.` : ''),
      );
    } catch (err) {
      display((err as Error).message || 'The frames could not be drawn as slides.', undefined, 'error');
    }
  };
}
