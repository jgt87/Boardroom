// Animated GIF playback (gap F8 / Q2, track G). With reduce motion on (it follows the operating system until the
// person chooses in the menu), or when an image is set to start paused, an animated GIF shows a still first frame,
// drawn once to a canvas and cached per asset, plus a play/pause button that plays it on demand. An image can also
// be set to play its animation once instead of looping.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ImageAsset, Item } from './model';
import { dataUrlBytes, gifDataUrl, gifPlayOnce, isAnimatedGif } from './gif';

/** The app marks reduce motion with a class on <html> (board-app.tsx); watch it. */
function subscribeReduceMotion(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
const reduceMotionOn = () => document.documentElement.classList.contains('reduce-motion');
export const useReduceMotion = () => useSyncExternalStore(subscribeReduceMotion, reduceMotionOn, () => false);

const animated = new Map<string, boolean>(),
  stills = new Map<string, Promise<string | null>>();
/** Assets are immutable per id, so detection and the still frame are cached by asset id. */
function animatedFor(key: string, asset: ImageAsset): boolean {
  let value = animated.get(key);
  if (value === undefined) {
    value = isAnimatedGif(asset);
    animated.set(key, value);
  }
  return value;
}
/** Is this image asset an animated GIF (cached per asset id)? */
export const isAnimatedAsset = (assetId: string | undefined, asset: ImageAsset | undefined) =>
  !!assetId && !!asset && animatedFor(assetId, asset);
/** PNG data URL of the GIF's first frame (a data URL keeps exports drawable), or null when it cannot be made. */
export function gifStill(key: string, asset: ImageAsset): Promise<string | null> {
  let still = stills.get(key);
  if (!still) {
    still = (async () => {
      try {
        const img = new Image();
        img.src = asset.data;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || asset.width;
        canvas.height = img.naturalHeight || asset.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
      } catch {
        return null;
      }
    })();
    stills.set(key, still);
  }
  return still;
}
const ready = new Map<string, string | null>(),
  onceUrls = new Map<string, string | null>();
/** Play-once copy of the GIF for replay number `replay`; replays alternate between two cached copies. */
function onceUrl(key: string, asset: ImageAsset, replay: number): string | null {
  const k = `${key}#${replay % 2}`;
  if (!onceUrls.has(k)) {
    const bytes = dataUrlBytes(asset.data),
      once = bytes && gifPlayOnce(bytes, replay % 2);
    onceUrls.set(k, once ? gifDataUrl(once) : null);
  }
  return onceUrls.get(k)!;
}

/**
 * Playback of one image. It starts paused when reduce motion is on or the image is set to start paused
 * (`item.gif.paused`); the canvas button plays or pauses it for this view only, until the stored setting or reduce
 * motion changes. With `item.gif.once` the animation plays once, and each press of play replays it.
 *
 * `still`: the image to draw instead of the GIF (null: draw `href`, or the GIF itself; undefined: being made).
 * `paused`: undefined when the image is not an animated GIF, so no button applies.
 */
export function useGifPlayback(item: Pick<Item, 'assetId' | 'gif'>, asset: ImageAsset | undefined) {
  const reduce = useReduceMotion(),
    key = item.assetId ?? '',
    startPaused = reduce || !!item.gif?.paused,
    once = !!item.gif?.once,
    [choice, setChoice] = useState<{ playing: boolean; base: string; replay: number } | null>(null),
    [, setVersion] = useState(0);
  const animatedGif = isAnimatedAsset(item.assetId, asset),
    base = `${startPaused}|${once}`,
    current = choice?.base === base ? choice : null,
    paused = animatedGif && (current ? !current.playing : startPaused);
  useEffect(() => {
    if (!paused || ready.has(key)) return;
    let live = true;
    void gifStill(key, asset!).then(still => {
      ready.set(key, still);
      if (live) setVersion(v => v + 1);
    });
    return () => {
      live = false;
    };
  }, [paused, key, asset]);
  if (!animatedGif) return { still: null, href: undefined, paused: undefined, toggle: () => {} };
  const toggle = () =>
    setChoice(c => ({
      playing: paused,
      base,
      replay: (c?.base === base ? c.replay : 0) + (paused ? 1 : 0),
    }));
  if (paused) return { still: ready.has(key) ? ready.get(key)! : undefined, href: undefined, paused: true, toggle };
  const href = once ? (onceUrl(key, asset!, current?.replay ?? 0) ?? undefined) : undefined;
  return { still: null, href, paused: false, toggle };
}
