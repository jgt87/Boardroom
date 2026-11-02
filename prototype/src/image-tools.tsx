import React, { useEffect, useRef, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import type { Crop, ImageAsset, Item } from './model';
import { FULL_CROP, clampCrop, cropViewBox, cropAspect } from './images';

/** Canvas rendering of an image object, showing only its crop region. */
export function ImageBody({ item, asset }: { item: Item; asset?: ImageAsset }) {
  if (!asset)
    return (
      <>
        <rect width={item.w} height={item.h} fill="#f4f4f6" stroke="#c5c5ce" strokeDasharray="6 4" />
        <text x={item.w / 2} y={item.h / 2} textAnchor="middle" fill="#696973" fontSize="14">
          Image unavailable
        </text>
      </>
    );
  return (
    <svg
      width={item.w}
      height={item.h}
      viewBox={cropViewBox(asset, item.crop)}
      preserveAspectRatio="none"
      overflow="hidden"
    >
      <image href={asset.data} width={asset.width} height={asset.height} preserveAspectRatio="none" />
    </svg>
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
