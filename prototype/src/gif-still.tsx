// Reduce motion pauses animated GIFs (gap F8 / Q2). With reduce motion on (it follows the operating system
// until the person chooses in the menu), an animated GIF image shows a still first frame, drawn once to a
// canvas and cached per asset, plus a play/pause button that plays it on demand.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ImageAsset } from './model';
import { isAnimatedGif } from './gif';

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
const ready = new Map<string, string | null>();

/**
 * `still`: the image to draw instead of the GIF (null: draw the GIF itself; undefined: the still is being made).
 * `paused`: undefined when no play/pause button applies.
 */
export function useGifStill(assetId: string | undefined, asset: ImageAsset | undefined) {
  const reduce = useReduceMotion(),
    key = assetId ?? '',
    [playing, setPlaying] = useState(false),
    [, setVersion] = useState(0);
  const active = !!asset && !!assetId && reduce && animatedFor(key, asset);
  useEffect(() => {
    if (!active || ready.has(key)) return;
    let live = true;
    void gifStill(key, asset!).then(still => {
      ready.set(key, still);
      if (live) setVersion(v => v + 1);
    });
    return () => {
      live = false;
    };
  }, [active, key, asset]);
  if (!active) return { still: null, paused: undefined, toggle: () => {} };
  const toggle = () => setPlaying(p => !p);
  if (playing) return { still: null, paused: false, toggle };
  return { still: ready.has(key) ? ready.get(key)! : undefined, paused: true, toggle };
}
