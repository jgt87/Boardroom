// Spacing handle for a selected auto-layout container (track J): drag the pill between its first two
// children to change the gap. The layout previews live from the gesture-start board and the change commits
// as one undo step on release; Escape, pointer cancellation or lost capture discard the preview.
// Arrow keys change the gap by 1 (Shift: 8) when the handle has focus.
import { useEffect, useRef, useState } from 'react';
import type { Board, Item } from './model';
import { useApp } from './board-app';
import { GAP_MAX, gapFromHandle, gapHandle, setLayoutOption } from './autolayout';
import type { AutoLayoutData, GapHandle } from './autolayout';

export function AutoLayoutGapHandle({ item }: { item: Item }) {
  const { boardRef, camera, setDraft, update, toWorld, display } = useApp();
  const drag = useRef<{ base: Board; handle: GapHandle; next: number } | null>(null),
    [live, setLive] = useState<number | null>(null);
  const cancel = () => {
    if (!drag.current) return;
    drag.current = null;
    setDraft(null);
    setLive(null);
  };
  useEffect(() => {
    if (live === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !drag.current) return;
      e.stopPropagation();
      drag.current = null;
      setDraft(null);
      setLive(null);
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  }, [live, setDraft]);
  const h = drag.current?.handle ?? gapHandle(boardRef.current, item.id);
  if (!h) return null;
  const z = camera.z,
    gap = live ?? (item.data as AutoLayoutData).gap,
    shown = drag.current ? { ...h, ...(h.axis === 'x' ? { x: h.anchor + gap / 2 } : { y: h.anchor + gap / 2 }) } : h,
    long = 22 / z,
    thin = 6 / z;
  const setGap = (value: number) => {
    try {
      update(setLayoutOption(boardRef.current, item.id, { gap: value }));
    } catch (error) {
      display((error as Error).message);
    }
  };
  return (
    <g
      className="autolayout-gap-handle"
      data-gap-handle={item.id}
      role="slider"
      tabIndex={0}
      aria-label="Spacing between items"
      aria-valuemin={0}
      aria-valuemax={GAP_MAX}
      aria-valuenow={gap}
      aria-orientation={h.axis === 'x' ? 'horizontal' : 'vertical'}
      style={{ cursor: h.axis === 'x' ? 'ew-resize' : 'ns-resize' }}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { base: boardRef.current, handle: h, next: h.gap };
        setLive(h.gap);
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d) return;
        const p = toWorld(e.clientX, e.clientY),
          next = gapFromHandle(d.handle, d.handle.axis === 'x' ? p.x : p.y, e.shiftKey ? 8 : 1);
        if (next === d.next) return;
        d.next = next;
        setLive(next);
        setDraft(setLayoutOption(d.base, item.id, { gap: next }));
      }}
      onPointerUp={e => {
        const d = drag.current;
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        setDraft(null);
        setLive(null);
        if (d && d.next !== d.handle.gap) {
          try {
            update(setLayoutOption(d.base, item.id, { gap: d.next }));
          } catch (error) {
            display((error as Error).message);
          }
        }
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onDoubleClick={e => e.stopPropagation()}
      onKeyDown={e => {
        const back = e.key === 'ArrowLeft' || e.key === 'ArrowDown',
          forward = e.key === 'ArrowRight' || e.key === 'ArrowUp';
        if (!back && !forward) return;
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 8 : 1,
          current = (item.data as AutoLayoutData).gap;
        setGap(Math.max(0, Math.min(GAP_MAX, current + (forward ? step : -step))));
      }}
    >
      <rect
        x={shown.x - (h.axis === 'x' ? 9 : 15) / z}
        y={shown.y - (h.axis === 'x' ? 15 : 9) / z}
        width={(h.axis === 'x' ? 18 : 30) / z}
        height={(h.axis === 'x' ? 30 : 18) / z}
        fill="transparent"
      />
      <rect
        className="autolayout-gap-pill"
        x={shown.x - (h.axis === 'x' ? thin : long) / 2}
        y={shown.y - (h.axis === 'x' ? long : thin) / 2}
        width={h.axis === 'x' ? thin : long}
        height={h.axis === 'x' ? long : thin}
        rx={thin / 2}
        fill="#4262ff"
        stroke="#ffffff"
        strokeWidth={1.5 / z}
        pointerEvents="none"
      />
      {live !== null && (
        <text
          className="autolayout-gap-label"
          x={shown.x + (h.axis === 'x' ? 0 : long / 2 + 6 / z)}
          y={shown.y + (h.axis === 'x' ? -long / 2 - 6 / z : 4 / z)}
          textAnchor={h.axis === 'x' ? 'middle' : 'start'}
          fontSize={12 / z}
          fill="#4262ff"
          pointerEvents="none"
        >
          {live}
        </text>
      )}
    </g>
  );
}
