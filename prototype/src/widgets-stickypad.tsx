// Sticky stack view (item 110). A white card with a title (drag handle) and a pad whose top sheet curls up
// at the bottom-right corner, sticking out slightly past the pad and casting a soft shadow on the sheets
// below. The top sheet is the peel area (see use-canvas-gestures); after each peel the curl settles back in.
import type { Item } from './model';
import type { WidgetView } from './widget-types';
import { PAD_INSET, PAD_NOTE, PAD_SIZE, PAD_TITLE, PAD_UNDERSIDE, undersideOf } from './specs-stickypad';

function PadRender({ item }: { item: Item }) {
  const x = PAD_INSET,
    y = PAD_TITLE,
    s = PAD_NOTE,
    curl = 30,
    out = 9;
  // The content keeps its proportions; the card hugs it with equal margins on the left, right and bottom.
  const k = Math.min(item.w / PAD_SIZE[0], item.h / PAD_SIZE[1]),
    sheen = `pad-sheen-${item.id}`,
    blur = `pad-blur-${item.id}`;
  const tip = { x: x + s + out, y: y + s - curl + 6 };
  return (
    <g className="stickypad" data-pad={item.id}>
      <defs>
        <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.55" stopColor={item.fill} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.55" />
        </linearGradient>
        <filter id={blur} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
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
        <rect
          x={x}
          y={y + s - 6}
          width={s}
          height={PAD_UNDERSIDE + 6}
          fill={undersideOf(item.fill)}
          pointerEvents="none"
        />
        <rect x={x} y={y} width={s} height={s} fill={item.fill} pointerEvents="none" />
        <g className="stickypad-curl" key={(item.data?.peels as number) ?? 0}>
          {/* Soft shadow the lifted corner casts on the sheets underneath. */}
          <path
            d={`M${x + s * 0.25},${y + s} Q${x + s * 0.72},${y + s + 3} ${tip.x - 1},${tip.y + 8} L${x + s},${y + s + 4} Q${x + s * 0.6},${y + s + 7} ${x + s * 0.25},${y + s} Z`}
            fill="#000000"
            fillOpacity={0.22}
            filter={`url(#${blur})`}
            pointerEvents="none"
          />
          {/* Top sheet: flat at the top, its bottom edge curving up into a corner that sticks out to the right. */}
          <path
            data-pad-peel={item.id}
            d={`M${x},${y} H${x + s} V${y + s - curl - 12} Q${x + s + 1},${y + s - curl + 2} ${tip.x},${tip.y} Q${x + s * 0.58},${y + s + 2} ${x},${y + s} Z`}
            fill={`url(#${sheen})`}
            style={{ cursor: 'grab' }}
          />
          {/* A faint highlight along the curled edge. */}
          <path
            d={`M${tip.x},${tip.y} Q${x + s * 0.58},${y + s + 2} ${x},${y + s}`}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.7}
            strokeWidth={1.2}
            pointerEvents="none"
          />
        </g>
      </g>
    </g>
  );
}

export const stickypadView: WidgetView = { kind: 'stickypad', mode: 'svg', Render: PadRender };
