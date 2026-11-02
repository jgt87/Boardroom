import React, { useRef } from 'react';
import type { Item } from './model';
import { itemBounds } from './interactions';
import { viewportRect, minimapExtent, minimapScale, centerOn } from './navigation';
import type { Camera } from './navigation';

/** Overview of the board. Click or drag to move the view; arrow keys pan, Home fits the board. */
export function Minimap({
  items,
  camera,
  size,
  onCamera,
  onFit,
}: {
  items: Item[];
  camera: Camera;
  size: { w: number; h: number };
  onCamera: (c: Camera) => void;
  onFit: () => void;
}) {
  const width = size.w <= 600 ? 132 : 200,
    height = size.w <= 600 ? 92 : 140,
    dragging = useRef(false),
    svg = useRef<SVGSVGElement>(null);
  const view = viewportRect(camera, size),
    extent = minimapExtent(items, view),
    { scale, ox, oy } = minimapScale(extent, width, height);
  const toWorld = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale };
  };
  const visible = items.length > 3000 ? items.slice(0, 3000) : items;
  return (
    <div className="minimap floating">
      <svg
        ref={svg}
        width={width}
        height={height}
        tabIndex={0}
        role="application"
        aria-label="Minimap. Arrow keys pan the view, Home fits the board."
        onPointerDown={e => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onCamera(centerOn(toWorld(e), camera, size));
        }}
        onPointerMove={e => {
          if (dragging.current) onCamera(centerOn(toWorld(e), camera, size));
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onKeyDown={e => {
          const step = e.shiftKey ? 0.5 : 0.15,
            map: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            },
            d = map[e.key];
          if (d) {
            e.preventDefault();
            e.stopPropagation();
            onCamera({ ...camera, x: camera.x - d[0] * size.w * step, y: camera.y - d[1] * size.h * step });
          } else if (e.key === 'Home') {
            e.preventDefault();
            e.stopPropagation();
            onFit();
          }
        }}
      >
        <rect width={width} height={height} fill="#fafafb" />
        <g transform={`translate(${ox} ${oy}) scale(${scale})`}>
          {visible
            .filter(i => i.type !== 'arrow' && i.type !== 'pen')
            .map(i => {
              const b = itemBounds(i, items);
              return (
                <rect
                  key={i.id}
                  x={b.x}
                  y={b.y}
                  width={Math.max(b.w, 2 / scale)}
                  height={Math.max(b.h, 2 / scale)}
                  fill={i.type === 'frame' ? '#ffffff' : i.fill === '#ffffff' ? '#d4d4da' : i.fill}
                  stroke={i.type === 'frame' ? '#b4b4bd' : 'none'}
                  strokeWidth={1 / scale}
                />
              );
            })}
          <rect
            className="minimap-viewport"
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill="#4262ff14"
            stroke="#4262ff"
            strokeWidth={1.5 / scale}
          />
        </g>
        {!items.length && (
          <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="11" fill="#8a8a94">
            Empty board
          </text>
        )}
      </svg>
    </div>
  );
}
