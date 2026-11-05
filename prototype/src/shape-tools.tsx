import React, { useState } from 'react';
import type { Board, Item, Point, ShapeStyle } from './model';
import { calloutPaths, isCallout } from './diagram-extras';
import { ColorMenu } from './color-menu';
import {
  shapePacks,
  shapeLabels,
  shapePath,
  shapeDetail,
  shapeSizes,
  textBox,
  cornerRadius,
  radiusKinds,
} from './shapes';
import type { ShapeKind } from './shapes';
import {
  Minus,
  MoveUpRight,
  CornerUpRight,
  Network,
  Circle,
  Table2,
  Rows3,
  Shapes,
  X,
  SquareRoundCorner,
  Triangle,
  Hexagon,
  Star,
  Heart,
} from 'lucide-react';
import { imageMasks, maskLabels } from './image-masks';
import type { ImageMask } from './image-masks';
import { loadCustomShapes, removeCustomShape, storeCustomShapes } from './custom-shapes';
import type { CustomShape } from './custom-shapes';
import './r5-canvas.css';

export const DEFAULT_BORDER = {
  borderColor: '#2d2d34',
  borderWidth: 1.5,
  borderStyle: 'solid' as const,
  borderOpacity: 1,
};
export const borderOf = (item: Item) => ({ ...DEFAULT_BORDER, ...item.style });
const dash = (style: ShapeStyle['borderStyle'], width: number) =>
  style === 'dashed'
    ? `${Math.max(4, width * 4)} ${Math.max(3, width * 2)}`
    : style === 'dotted'
      ? `0 ${Math.max(3, width * 2.5)}`
      : undefined;

/** Small outline glyph used in the Shapes and lines menu. */
export function ShapeGlyph({ kind, size = 20 }: { kind: ShapeKind; size?: number }) {
  const [sw, sh] = shapeSizes[kind],
    box = 22,
    w = sh > sw ? Math.max(10, (box * sw) / sh) : box,
    h = kind === 'terminator' ? 12 : kind === 'cylinder' ? 20 : sh > sw ? box : Math.max(14, (box * sh) / sw),
    detail = shapeDetail(kind, w, h);
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${box + 4} ${box + 4}`} aria-hidden="true">
      <g
        transform={`translate(${(box - w) / 2} ${(box - h) / 2})`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      >
        <path d={shapePath(kind, w, h)} />
        {detail && <path d={detail} />}
      </g>
    </svg>
  );
}

/** Shape body on the canvas (fill + border, independent settings). */
export function ShapeBody({ item, tip }: { item: Item & { type: ShapeKind }; tip?: Point | null }) {
  const b = borderOf(item),
    detail = shapeDetail(item.type, item.w, item.h),
    stroke = b.borderWidth > 0 ? b.borderColor : 'none';
  const common = {
    stroke,
    strokeWidth: b.borderWidth,
    strokeOpacity: b.borderOpacity,
    strokeDasharray: dash(b.borderStyle, b.borderWidth),
    strokeLinecap: b.borderStyle === 'dotted' ? ('round' as const) : undefined,
  };
  if (tip && isCallout(item)) {
    // Custom callout tail (track R2-H): outline both parts at double width, then fill them on top so only the
    // outer half of the stroke shows and the tail joins the bubble without a seam.
    const p = calloutPaths(item.type, item.w, item.h, tip),
      d = `${p.body} ${p.tail}`;
    return (
      <g data-callout-tail-shape={item.id}>
        <path d={d} fill="none" {...common} strokeWidth={b.borderWidth * 2} strokeLinejoin="round" />
        <path d={d} fill={item.fill} stroke="none" />
        {/* The tail reaches outside the object's box: an invisible, slightly wider copy keeps it clickable and
            draggable even with no fill (P2-Q5). */}
        {p.tail && (
          <path
            className="callout-tail-hit"
            d={p.tail}
            fill="transparent"
            stroke="transparent"
            strokeWidth={8}
            strokeLinejoin="round"
            pointerEvents="all"
          />
        )}
      </g>
    );
  }
  // Original shapes keep their native SVG elements so existing exports stay identical.
  const body =
    item.type === 'rectangle' ? (
      <rect
        width={item.w}
        height={item.h}
        rx={item.style?.radius === undefined ? '4' : cornerRadius('rectangle', item.w, item.h, item.style.radius)}
        fill={item.fill}
        {...common}
      />
    ) : item.type === 'ellipse' ? (
      <ellipse cx={item.w / 2} cy={item.h / 2} rx={item.w / 2} ry={item.h / 2} fill={item.fill} {...common} />
    ) : (
      <path d={shapePath(item.type, item.w, item.h, item.style?.radius)} fill={item.fill} {...common} />
    );
  return (
    <>
      {body}
      {detail && <path d={detail} fill="none" {...common} />}
    </>
  );
}
export const shapeTextBox = (item: Item) => textBox(item.type as ShapeKind, item.w, item.h);

export function ShapeMenuItems({ onChoose }: { onChoose: (kind: ShapeKind) => void }) {
  const [pack, setPack] = useState(shapePacks[0].name),
    current = shapePacks.find(p => p.name === pack) ?? shapePacks[0];
  return (
    <>
      <div className="shape-pack-tabs" role="group" aria-label="Shape packs">
        {shapePacks.map(p => (
          <button key={p.name} aria-pressed={p.name === pack} onClick={() => setPack(p.name)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="shape-pack-grid" role="group" aria-label={`${current.name} shapes`}>
        {current.kinds.map(kind => (
          <button key={kind} title={shapeLabels[kind]} onClick={() => onChoose(kind)}>
            <ShapeGlyph kind={kind} size={26} />
            <span>{shapeLabels[kind]}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Border controls for one or more shapes. Shows the first shape's values; changes apply to all. */
export function BorderControls({
  item,
  mixed,
  board,
  onChange,
  maskImage,
  onMask,
}: {
  item: Item;
  mixed: boolean;
  board?: Board;
  onChange: (style: ShapeStyle) => void;
  /** First selected image: its crop mask is shown, and onMask applies a mask to every selected image (track G). */
  maskImage?: Item;
  onMask?: (mask: ImageMask | undefined) => void;
}) {
  // Images start without a border (gap D11).
  const b = item.type === 'image' ? { ...DEFAULT_BORDER, borderWidth: 0, ...item.style } : borderOf(item);
  return (
    <div className="border-controls" aria-label="Shape border">
      <ColorMenu
        label="Border colour"
        variant="border"
        value={b.borderColor}
        board={board}
        onPick={borderColor => onChange({ borderColor })}
      />
      <select
        aria-label="Border thickness"
        title="Border thickness"
        value={b.borderWidth}
        onChange={e => onChange({ borderWidth: Number(e.target.value) })}
      >
        {[...new Set([0, 1, 1.5, 2, 3, 4, 6, 8, 12, b.borderWidth])]
          .sort((x, y) => x - y)
          .map(w => (
            <option key={w} value={w}>
              {w === 0 ? 'No border' : `${w} px`}
            </option>
          ))}
      </select>
      <select
        aria-label="Border pattern"
        title="Border pattern"
        value={b.borderStyle}
        onChange={e => onChange({ borderStyle: e.target.value as ShapeStyle['borderStyle'] })}
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
      </select>
      <select
        aria-label="Border opacity"
        title="Border opacity"
        value={Math.round(b.borderOpacity * 100)}
        onChange={e => onChange({ borderOpacity: Number(e.target.value) / 100 })}
      >
        {[...new Set([100, 75, 50, 25, 10, Math.round(b.borderOpacity * 100)])]
          .sort((x, y) => y - x)
          .map(o => (
            <option key={o} value={o}>
              {o}%
            </option>
          ))}
      </select>
      {(radiusKinds.includes(item.type) || item.type === 'image') && (
        <RadiusSlider item={item} onChange={radius => onChange({ radius })} />
      )}
      {maskImage && onMask && <MaskMenu mask={maskImage.style?.mask} onMask={onMask} />}
      {mixed && (
        <span className="mixed-hint" title="Selected shapes have different borders; changes apply to all">
          Mixed
        </span>
      )}
    </div>
  );
}

const maskIcons: Record<ImageMask, React.ReactNode> = {
  circle: <Circle size={16} />,
  rounded: <SquareRoundCorner size={16} />,
  triangle: <Triangle size={16} />,
  hexagon: <Hexagon size={16} />,
  star: <Star size={16} />,
  heart: <Heart size={16} />,
};
/** Crop mask menu for images (gap D11, track G): one choice applies to every selected image as one undo step. */
function MaskMenu({ mask, onMask }: { mask?: ImageMask; onMask: (mask: ImageMask | undefined) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="menu-anchor">
      <button
        className={`icon-button ${mask ? 'active' : ''}`}
        aria-label="Crop shape"
        title={mask ? `Crop shape: ${maskLabels[mask]}` : 'Crop shape'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(v => !v)}
      >
        {mask ? maskIcons[mask] : <Circle size={16} />}
      </button>
      {open && (
        <div
          className="dropdown floating mask-menu"
          role="menu"
          aria-label="Crop shape"
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <button
            role="menuitemradio"
            aria-checked={!mask}
            onClick={() => {
              onMask(undefined);
              setOpen(false);
            }}
          >
            <X size={16} /> No crop shape
          </button>
          {imageMasks.map(m => (
            <button
              key={m}
              role="menuitemradio"
              aria-checked={mask === m}
              onClick={() => {
                onMask(m);
                setOpen(false);
              }}
            >
              {maskIcons[m]} {maskLabels[m]}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Corner radius slider (gaps D8, D11). Commits once when released, so one drag is one undo step. */
function RadiusSlider({ item, onChange }: { item: Item; onChange: (radius: number) => void }) {
  const value = Math.round(item.style?.radius ?? cornerRadius(item.type, Infinity, Infinity)),
    [draft, setDraft] = useState<number | null>(null),
    max = Math.max(1, Math.round(Math.min(item.w, item.h) / 2));
  const commit = () => {
    if (draft !== null && draft !== value) onChange(draft);
    setDraft(null);
  };
  return (
    <label className="radius-control" title="Corner radius">
      <span>Radius</span>
      <input
        type="range"
        aria-label="Corner radius"
        min={0}
        max={max}
        step={1}
        value={Math.min(draft ?? value, max)}
        onChange={e => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

/** Line presets offered by the compact shapes menu (item 109). */
export type LinePreset = 'line' | 'arrow' | 'elbow';

/**
 * Compact Shapes and lines menu (item 109): lines first, then the common shapes, Divider, More shapes
 * (the full pack grid) and Diagram, each with its keyboard hint where one exists.
 */
export function CompactShapesMenu({
  onLine,
  onShape,
  onKind,
  onCustom,
}: {
  onLine: (preset: LinePreset) => void;
  onShape: (kind: ShapeKind) => void;
  onKind: (kind: 'divider' | 'mermaid' | 'entity' | 'swimlane') => void;
  /** Place a saved custom shape (track R5). */
  onCustom?: (shape: CustomShape) => void;
}) {
  const [more, setMore] = useState(false),
    [mine, setMine] = useState<CustomShape[]>(() => (onCustom ? loadCustomShapes() : []));
  if (more)
    return (
      <>
        <button className="shape-menu-back" onClick={() => setMore(false)}>
          ‹ Back
        </button>
        <ShapeMenuItems onChoose={onShape} />
      </>
    );
  const row = (label: string, icon: React.ReactNode, onClick: () => void, key?: string) => (
    <button key={label} className="shape-menu-row" onClick={onClick}>
      <span className="shape-menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      {key && <kbd>{key}</kbd>}
    </button>
  );
  const glyph = (kind: ShapeKind) => <ShapeGlyph kind={kind} size={16} />;
  return (
    <div className="shape-menu-compact" role="group" aria-label="Shapes and lines choices">
      {row('Line', <Minus size={16} style={{ transform: 'rotate(-45deg)' }} />, () => onLine('line'), 'L')}
      {row('Arrow', <MoveUpRight size={16} />, () => onLine('arrow'))}
      {row('Elbow arrow', <CornerUpRight size={16} />, () => onLine('elbow'))}
      {row('Block arrow', glyph('arrowright'), () => onShape('arrowright'))}
      <hr />
      {row('Rectangle', glyph('rectangle'), () => onShape('rectangle'), 'R')}
      {row('Oval', glyph('ellipse'), () => onShape('ellipse'), 'O')}
      {row('Rhombus', glyph('diamond'), () => onShape('diamond'), 'D')}
      {row('Triangle', glyph('triangle'), () => onShape('triangle'))}
      {row('Divider', <Minus size={16} />, () => onKind('divider'))}
      <button className="shape-menu-row shape-menu-more" onClick={() => setMore(true)}>
        <span className="shape-menu-icon" aria-hidden="true" />
        <span>More shapes</span>
        <span aria-hidden="true">›</span>
      </button>
      <hr />
      {row('Diagram', <Network size={16} />, () => onKind('mermaid'))}
      {row('Entity table', <Table2 size={16} />, () => onKind('entity'))}
      {row('Swimlanes', <Rows3 size={16} />, () => onKind('swimlane'))}
      {onCustom && (
        <>
          <hr />
          <div className="shape-menu-mine" role="group" aria-label="My shapes">
            <small>My shapes</small>
            {mine.length ? (
              mine.map(s => (
                <span key={s.id} className="shape-menu-mine-row">
                  <button className="shape-menu-row" onClick={() => onCustom(s)}>
                    <span className="shape-menu-icon" aria-hidden="true">
                      <Shapes size={16} />
                    </span>
                    <span>{s.name}</span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove shape ${s.name}`}
                    title="Remove from My shapes"
                    onClick={() => {
                      const next = removeCustomShape(mine, s.id);
                      storeCustomShapes(next);
                      setMine(next);
                    }}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))
            ) : (
              <p>Right-click a selection and choose Save as shape.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
