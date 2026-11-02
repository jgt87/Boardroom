import React from 'react';
import type { Item, ShapeStyle } from './model';
import { shapeKinds, shapeLabels, shapePath, shapeDetail, textBox } from './shapes';
import type { ShapeKind } from './shapes';

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
  const w = 22,
    h = kind === 'terminator' ? 12 : kind === 'cylinder' ? 20 : 16,
    detail = shapeDetail(kind, w, h);
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${w + 4} ${w + 4}`} aria-hidden="true">
      <g
        transform={`translate(0 ${(w - h) / 2})`}
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
export function ShapeBody({ item }: { item: Item & { type: ShapeKind } }) {
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
  // Original shapes keep their native SVG elements so existing exports stay identical.
  const body =
    item.type === 'rectangle' ? (
      <rect width={item.w} height={item.h} rx="4" fill={item.fill} {...common} />
    ) : item.type === 'ellipse' ? (
      <ellipse cx={item.w / 2} cy={item.h / 2} rx={item.w / 2} ry={item.h / 2} fill={item.fill} {...common} />
    ) : (
      <path d={shapePath(item.type, item.w, item.h)} fill={item.fill} {...common} />
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
  return (
    <>
      {shapeKinds.map(kind => (
        <button key={kind} onClick={() => onChoose(kind)}>
          <ShapeGlyph kind={kind} />
          {shapeLabels[kind]}
        </button>
      ))}
    </>
  );
}

/** Border controls for one or more shapes. Shows the first shape's values; changes apply to all. */
export function BorderControls({
  item,
  mixed,
  onChange,
}: {
  item: Item;
  mixed: boolean;
  onChange: (style: ShapeStyle) => void;
}) {
  const b = borderOf(item);
  return (
    <div className="border-controls" aria-label="Shape border">
      <label className="color-chip" title="Border color">
        <input
          type="color"
          aria-label="Border color"
          value={b.borderColor}
          onChange={e => onChange({ borderColor: e.target.value })}
        />
        <span style={{ borderColor: b.borderColor }} />
      </label>
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
      {mixed && (
        <span className="mixed-hint" title="Selected shapes have different borders; changes apply to all">
          Mixed
        </span>
      )}
    </div>
  );
}
