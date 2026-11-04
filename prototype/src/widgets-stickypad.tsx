// Sticky stack view (item 110). A white card with a title (drag handle) and a pad whose top sheet curls up
// at the bottom-right corner, sticking out slightly past the pad and casting a soft shadow on the sheets
// below. The top sheet is the peel area (see use-canvas-gestures); the peel itself is animated frame by frame
// by sticky-peel.tsx, which hides this curl while it draws the moving sheet.
import type { Item } from './model';
import type { WidgetView } from './widget-types';
import {
  PAD_INSET,
  PAD_NOTE,
  PAD_SIZE,
  PAD_TITLE,
  PAD_UNDERSIDE,
  curlShapes,
  padScale,
  STACK_CLIP,
  tintOf,
  undersideOf,
} from './specs-stickypad';

function PadRender({ item }: { item: Item }) {
  const x = PAD_INSET,
    y = PAD_TITLE,
    s = PAD_NOTE;
  // The content keeps its proportions; the card hugs it with equal margins on the left, right and bottom.
  const k = padScale(item),
    sheen = `pad-sheen-${item.id}`,
    stack = `pad-stack-${item.id}`,
    edge = `pad-edge-${item.id}`,
    shade = `pad-shade-${item.id}`,
    curl = curlShapes(1);
  return (
    <g className="stickypad" data-pad={item.id}>
      <defs>
        <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.6" stopColor={item.fill} />
          <stop offset="1" stopColor={tintOf(item.fill)} />
        </linearGradient>
        {/* The curl casts its shadow only on the paper: it ends at the stack's edge. */}
        {/* The stacked sheets below the top one: darkest right under it, fading lighter towards the bottom. The
            band starts 6 units under the top sheet, so the visible part begins at 6 / (PAD_UNDERSIDE + 6). */}
        <linearGradient id={edge} x1="0" y1="0" x2="0" y2="1">
          <stop offset={6 / (PAD_UNDERSIDE + 6)} stopColor={undersideOf(item.fill, 0.66)} />
          <stop offset="1" stopColor={undersideOf(item.fill, 0.92)} />
        </linearGradient>
        <clipPath id={stack}>
          <rect x={STACK_CLIP.x} y={STACK_CLIP.y} width={STACK_CLIP.w} height={STACK_CLIP.h} />
        </clipPath>
      </defs>
      <rect
        data-pad-handle={item.id}
        width={PAD_SIZE[0] * k}
        height={PAD_SIZE[1] * k}
        rx={12}
        fill="#ffffff"
        filter="url(#note-shadow)"
        style={{ cursor: 'move' }}
      />
      <g transform={`scale(${k})`}>
        <text x={x + 2} y={42} fontSize={22} fontFamily="Arial" fill="#25252c" pointerEvents="none">
          Sticky stack
        </text>
        {/* The sheets below the top one: a darker edge along the bottom, and the next sheet. */}
        <rect x={x} y={y + s - 6} width={s} height={PAD_UNDERSIDE + 6} fill={`url(#${edge})`} pointerEvents="none" />
        <rect x={x} y={y} width={s} height={s} fill={item.fill} pointerEvents="none" />
        <g className="stickypad-curl">
          {/* Shadow on the sheet the lifted corner uncovers: darkest right under the curled edge, fading out towards
              the bottom-right corner, and cut off at the edge of the paper. */}
          <defs>
            <linearGradient id={shade} gradientUnits="userSpaceOnUse" {...curl.shade}>
              <stop offset="0" stopColor="#000000" stopOpacity={0.34} />
              <stop offset="1" stopColor="#000000" stopOpacity={0} />
            </linearGradient>
          </defs>
          <g clipPath={`url(#${stack})`}>
            <path d={curl.shadow} fill={`url(#${shade})`} pointerEvents="none" />
          </g>
          {/* Top sheet: flat at the top, its bottom edge curving up into a corner that sticks out to the right. */}
          <path data-pad-peel={item.id} d={curl.sheet} fill={`url(#${sheen})`} style={{ cursor: 'grab' }} />
          {/* A faint highlight along the curled edge. */}
          <path
            d={curl.edge}
            fill="none"
            stroke={undersideOf(item.fill)}
            strokeOpacity={0.55}
            strokeWidth={1.2}
            pointerEvents="none"
          />
        </g>
      </g>
    </g>
  );
}

export const stickypadView: WidgetView = { kind: 'stickypad', mode: 'svg', Render: PadRender };
