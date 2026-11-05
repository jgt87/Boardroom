import React, { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, FlipHorizontal2, FlipVertical2, SunMedium, Download, Play, Pause, Repeat1 } from 'lucide-react';
import { useGifPlayback } from './gif-still';
import { maskPath } from './image-masks';
import type { Crop, ImageAdjust, ImageAsset, Item } from './model';
import {
  ADJUST_MAX,
  ADJUST_MIN,
  FULL_CROP,
  adjustTransfer,
  clampCrop,
  cropViewBox,
  drawableAsset,
  cropAspect,
  flipTransform,
} from './images';
import { saveAssetFile } from './widget-kit';

/**
 * Canvas rendering of an image object, showing only its crop region. An animated GIF has a play/pause button
 * (shown while paused, otherwise on hover or selection); with reduce motion on, or when set to start paused, it
 * shows a still first frame (gap F8 / Q2, track G). The viewing state lives here, inside the item, so the render
 * cache in use-render-item never has to change.
 */
export function ImageBody({ item, asset }: { item: Item; asset?: ImageAsset }) {
  const gif = useGifPlayback(item, asset);
  // SVG and BMP originals are only ever downloaded, never drawn.
  if (!asset || !drawableAsset(asset)) return <ImagePicture item={item} />;
  return (
    <>
      {gif.still === undefined ? (
        <rect width={item.w} height={item.h} fill="#f4f4f6" className="gif-pending" />
      ) : (
        <ImagePicture item={item} asset={asset} href={gif.still ?? gif.href ?? asset.data} />
      )}
      {gif.paused !== undefined && (
        <foreignObject
          className={`gif-toggle ${gif.paused ? 'paused' : 'playing'}`}
          x={6}
          y={6}
          width={30}
          height={30}
          pointerEvents="all"
        >
          <button
            type="button"
            className="gif-toggle-button"
            aria-label={gif.paused ? 'Play animation' : 'Pause animation'}
            title={gif.paused ? 'Play animation' : 'Pause animation'}
            aria-pressed={!gif.paused}
            onPointerDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              gif.toggle();
            }}
          >
            {gif.paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
          </button>
        </foreignObject>
      )}
    </>
  );
}

function ImagePicture({ item, asset, href }: { item: Item; asset?: ImageAsset; href?: string }) {
  if (!asset)
    return (
      <>
        <rect width={item.w} height={item.h} fill="#f4f4f6" stroke="#c5c5ce" strokeDasharray="6 4" />
        <text x={item.w / 2} y={item.h / 2} textAnchor="middle" fill="#696973" fontSize="14">
          Image unavailable
        </text>
      </>
    );
  // Flip, brightness and contrast (gap b6-6) are drawn with an SVG transform and filter inside the object's
  // own group, so every export that clones the canvas carries them.
  const flip = flipTransform(item.adjust, item.w, item.h),
    transfer = adjustTransfer(item.adjust),
    filterId = `image-adjust-${item.id}`;
  const picture = (
    <svg
      width={item.w}
      height={item.h}
      viewBox={cropViewBox(asset, item.crop)}
      preserveAspectRatio="none"
      overflow="hidden"
    >
      <image href={href ?? asset.data} width={asset.width} height={asset.height} preserveAspectRatio="none" />
    </svg>
  );
  const body =
    flip || transfer ? (
      <>
        {transfer && (
          <defs>
            <filter id={filterId} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                <feFuncR type="linear" slope={transfer.slope} intercept={transfer.intercept} />
                <feFuncG type="linear" slope={transfer.slope} intercept={transfer.intercept} />
                <feFuncB type="linear" slope={transfer.slope} intercept={transfer.intercept} />
              </feComponentTransfer>
            </filter>
          </defs>
        )}
        <g
          className="image-adjusted"
          transform={flip}
          filter={transfer ? `url(#${filterId})` : undefined}
          data-flip={flip ? `${item.adjust?.flipX ? 'x' : ''}${item.adjust?.flipY ? 'y' : ''}` : undefined}
        >
          {picture}
        </g>
      </>
    ) : (
      picture
    );
  const s = item.style;
  if (!s) return body;
  // Border, corner radius and crop masks (gap D11, track G). The clip path lives inside the object's own group,
  // so exports that clone the canvas carry it along.
  const mask = s.mask,
    r = mask ? 0 : Math.min(s.radius ?? 0, item.w / 2, item.h / 2),
    width = s.borderWidth ?? 0,
    clipId = `image-clip-${item.id}`,
    outline = (props: React.SVGProps<SVGRectElement> & React.SVGProps<SVGPathElement>) =>
      mask ? (
        <path d={maskPath(mask, item.w, item.h)} data-mask={mask} {...props} />
      ) : (
        <rect width={item.w} height={item.h} rx={r} {...props} />
      );
  return (
    <>
      {(mask || r > 0) && (
        <defs>
          <clipPath id={clipId}>{outline({})}</clipPath>
        </defs>
      )}
      <g clipPath={mask || r > 0 ? `url(#${clipId})` : undefined}>{body}</g>
      {width > 0 &&
        outline({
          fill: 'none',
          stroke: s.borderColor ?? '#2d2d34',
          strokeWidth: width,
          strokeOpacity: s.borderOpacity ?? 1,
          strokeDasharray:
            s.borderStyle === 'dashed'
              ? `${width * 4} ${width * 2}`
              : s.borderStyle === 'dotted'
                ? `0 ${width * 2.5}`
                : undefined,
          strokeLinecap: s.borderStyle === 'dotted' ? 'round' : undefined,
          pointerEvents: 'none',
        })}
    </>
  );
}

/**
 * Selection-bar controls for an image (gap b6-6 and b3-4): flip, a brightness/contrast popover and
 * download of the original file. Every change is one undo step; sliders commit when released.
 */
export function ImageAdjustControls({
  item,
  asset,
  onAdjust,
}: {
  item: Item;
  asset?: ImageAsset;
  onAdjust: (change: (a: ImageAdjust) => ImageAdjust) => void;
}) {
  const [open, setOpen] = useState(false),
    a = item.adjust ?? {};
  return (
    <>
      <button
        className={`icon-button ${a.flipX ? 'active' : ''}`}
        aria-label="Flip horizontally"
        title="Flip horizontally"
        aria-pressed={!!a.flipX}
        onClick={() => onAdjust(x => ({ ...x, flipX: !x.flipX }))}
      >
        <FlipHorizontal2 size={17} />
      </button>
      <button
        className={`icon-button ${a.flipY ? 'active' : ''}`}
        aria-label="Flip vertically"
        title="Flip vertically"
        aria-pressed={!!a.flipY}
        onClick={() => onAdjust(x => ({ ...x, flipY: !x.flipY }))}
      >
        <FlipVertical2 size={17} />
      </button>
      <span className="menu-anchor">
        <button
          className={`icon-button ${a.brightness !== undefined || a.contrast !== undefined ? 'active' : ''}`}
          aria-label="Brightness and contrast"
          title="Brightness and contrast"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          <SunMedium size={17} />
        </button>
        {open && (
          <div
            className="dropdown floating image-adjust"
            role="group"
            aria-label="Image adjustments"
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <AdjustSlider
              key={`b${a.brightness ?? 100}`}
              label="Brightness"
              value={a.brightness ?? 100}
              onCommit={v => onAdjust(x => ({ ...x, brightness: v }))}
            />
            <AdjustSlider
              key={`c${a.contrast ?? 100}`}
              label="Contrast"
              value={a.contrast ?? 100}
              onCommit={v => onAdjust(x => ({ ...x, contrast: v }))}
            />
            <div className="row">
              <button onClick={() => onAdjust(x => ({ ...x, brightness: 100, contrast: 100 }))}>
                <RotateCcw size={14} /> Reset
              </button>
            </div>
          </div>
        )}
      </span>
      <button
        className="icon-button"
        aria-label="Download original image"
        title="Download original image"
        disabled={!asset}
        onClick={() => asset && saveAssetFile(asset, item.text || 'image')}
      >
        <Download size={17} />
      </button>
    </>
  );
}
/**
 * Selection-bar settings for animated GIFs (track G): start paused and play once. They are stored on the image,
 * apply to every selected image and are one undo step each. Shown only when an animated GIF is selected.
 */
export function GifControls({
  item,
  onChange,
}: {
  item: Item;
  onChange: (patch: { paused?: boolean; once?: boolean }) => void;
}) {
  const paused = !!item.gif?.paused,
    once = !!item.gif?.once;
  return (
    <>
      <button
        className={`icon-button ${paused ? 'active' : ''}`}
        aria-label="Start animation paused"
        title="Start animation paused"
        aria-pressed={paused}
        onClick={() => onChange({ paused: !paused })}
      >
        <Pause size={17} />
      </button>
      <button
        className={`icon-button ${once ? 'active' : ''}`}
        aria-label="Play animation once"
        title="Play animation once instead of looping"
        aria-pressed={once}
        onClick={() => onChange({ once: !once })}
      >
        <Repeat1 size={17} />
      </button>
    </>
  );
}
function AdjustSlider({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(value),
    commit = () => {
      if (draft !== value) onCommit(draft);
    };
  return (
    <label>
      {label}
      <input
        type="range"
        min={ADJUST_MIN}
        max={ADJUST_MAX}
        step={5}
        value={draft}
        aria-label={label}
        onChange={e => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span>{draft}%</span>
    </label>
  );
}

type Drag = { mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; start: { x: number; y: number }; crop: Crop };
const ratios: [string, number | null][] = [
  ['Free', null],
  ['Original', 0],
  ['1:1', 1],
  ['4:3', 4 / 3],
  ['16:9', 16 / 9],
];
/** Crop editor. Preview matches the committed result; Cancel leaves the object untouched. */
export function CropEditor({
  item,
  asset,
  onApply,
  onClose,
}: {
  item: Item;
  asset: ImageAsset;
  onApply: (crop: Crop | null) => void;
  onClose: () => void;
}) {
  const [crop, setCrop] = useState<Crop>(item.crop ?? FULL_CROP),
    [ratio, setRatio] = useState<number | null>(null),
    drag = useRef<Drag | null>(null),
    stage = useRef<HTMLDivElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const scale = Math.min(520 / asset.width, 340 / asset.height, 1e9),
    W = asset.width * scale,
    H = asset.height * scale;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    closeButton.current?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  const constrain = (c: Crop, anchor: Drag['mode'] = 'se'): Crop => {
    if (ratio === null) return clampCrop(c);
    const target = ((ratio || asset.width / asset.height) * asset.height) / asset.width;
    let w = Math.min(c.w, 1),
      h = w / target;
    if (h > 1) {
      h = 1;
      w = h * target;
    }
    const x = anchor.includes('w') ? c.x + c.w - w : c.x,
      y = anchor.includes('n') ? c.y + c.h - h : c.y;
    return clampCrop({ x, y, w, h });
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.start.x) / W,
      dy = (e.clientY - d.start.y) / H,
      c = d.crop;
    if (d.mode === 'move') {
      setCrop(clampCrop({ ...c, x: c.x + dx, y: c.y + dy }));
      return;
    }
    let left = c.x,
      top = c.y,
      right = c.x + c.w,
      bottom = c.y + c.h;
    if (d.mode.includes('w')) left = Math.min(right - 0.02, Math.max(0, left + dx));
    else right = Math.max(left + 0.02, Math.min(1, right + dx));
    if (d.mode.includes('n')) top = Math.min(bottom - 0.02, Math.max(0, top + dy));
    else bottom = Math.max(top + 0.02, Math.min(1, bottom + dy));
    setCrop(constrain({ x: left, y: top, w: right - left, h: bottom - top }, d.mode));
  };
  const field = (key: keyof Crop, label: string) => (
    <label>
      {label}
      <input
        type="number"
        aria-label={`Crop ${label}`}
        min={0}
        max={100}
        step={1}
        value={Math.round(crop[key] * 100)}
        onChange={e => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) setCrop(constrain({ ...crop, [key]: v / 100 }));
        }}
      />
    </label>
  );
  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01,
      map: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    setCrop(clampCrop({ ...crop, x: crop.x + d[0], y: crop.y + d[1] }));
  };
  const previewH = 120,
    previewW = Math.min(220, previewH * cropAspect(asset, crop));
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="format-editor crop-editor" role="dialog" aria-modal="true" aria-label="Crop image">
        <header>
          <div>
            <h2>Crop image</h2>
            <p>The original image is kept; only the visible region changes.</p>
          </div>
          <button ref={closeButton} className="icon-button" aria-label="Cancel cropping" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="crop-workspace">
          <div
            ref={stage}
            className="crop-stage"
            style={{ width: W, height: H }}
            onPointerMove={move}
            onPointerUp={e => {
              drag.current = null;
              e.currentTarget.releasePointerCapture?.(e.pointerId);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <img src={asset.data} alt="" width={W} height={H} draggable={false} />
            <div
              className="crop-shade"
              style={{
                clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${crop.x * 100}% ${crop.y * 100}%,${crop.x * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${(crop.y + crop.h) * 100}%,${(crop.x + crop.w) * 100}% ${crop.y * 100}%,${crop.x * 100}% ${crop.y * 100}%)`,
              }}
            />
            <div
              className="crop-box"
              tabIndex={0}
              role="group"
              aria-label="Crop area. Use arrow keys to move it."
              style={{ left: crop.x * W, top: crop.y * H, width: crop.w * W, height: crop.h * H }}
              onKeyDown={nudge}
              onPointerDown={e => {
                const mode = ((e.target as HTMLElement).dataset.corner ?? 'move') as Drag['mode'];
                drag.current = { mode, start: { x: e.clientX, y: e.clientY }, crop };
                stage.current?.setPointerCapture(e.pointerId);
                e.preventDefault();
              }}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map(c => (
                <span key={c} data-corner={c} className={`crop-handle ${c}`} />
              ))}
            </div>
          </div>
          <aside className="crop-side">
            <label>
              Aspect ratio
              <select
                aria-label="Crop aspect ratio"
                value={ratios.find(r => r[1] === ratio)?.[0] ?? 'Free'}
                onChange={e => {
                  const r = ratios.find(x => x[0] === e.target.value)![1];
                  setRatio(r);
                  if (r !== null)
                    setCrop(c => {
                      const target = ((r || asset.width / asset.height) * asset.height) / asset.width;
                      let w = c.w,
                        h = w / target;
                      if (h > 1) {
                        h = 1;
                        w = target;
                      }
                      return clampCrop({ x: c.x, y: c.y, w, h });
                    });
                }}
              >
                {ratios.map(([l]) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <div className="crop-fields">
              {field('x', 'Left %')}
              {field('y', 'Top %')}
              {field('w', 'Width %')}
              {field('h', 'Height %')}
            </div>
            <h3>Preview</h3>
            <svg
              className="crop-preview"
              width={previewW}
              height={previewH}
              viewBox={cropViewBox(asset, crop)}
              preserveAspectRatio="none"
              role="img"
              aria-label="Cropped preview"
            >
              <image href={asset.data} width={asset.width} height={asset.height} preserveAspectRatio="none" />
            </svg>
          </aside>
        </div>
        <footer>
          <button
            onClick={() => {
              setCrop(FULL_CROP);
              setRatio(null);
            }}
          >
            <RotateCcw size={15} />
            Reset crop
          </button>
          <span />
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={() =>
              onApply(crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1 ? null : clampCrop(crop))
            }
          >
            Apply crop
          </button>
        </footer>
      </div>
    </div>
  );
}
