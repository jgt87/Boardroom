// Status chips on Doc and Slides objects (gap list I3): the board statuses, set from the selection bar.
import { CircleDot } from 'lucide-react';
import type { Item } from './model';
import type { WidgetAction, WidgetCtx } from './widget-types';
import { nextItemStatus, statusInfo, withItemStatus } from './board-settings';

export function StatusChip({ status }: { status: unknown }) {
  const info = statusInfo(status);
  if (!info) return null;
  return (
    <span className="item-status-chip" data-status={info.id}>
      <span className="item-status-dot" aria-hidden="true" style={{ background: info.color }} />
      {info.label}
    </span>
  );
}

/** Kinds that show their status as an SVG chip drawn over the object (track R2-I). */
export const svgStatusKinds = ['mermaid', 'mindmap', 'drawio'];

/** The status chip drawn in SVG over Mermaid, mind-map and draw.io objects, top-left like Docs and Slides. */
export function SvgStatusChip({ status }: { status: unknown }) {
  const info = statusInfo(status);
  if (!info) return null;
  const w = info.label.length * 6.4 + 30;
  return (
    <g className="item-status-chip-svg" data-status={info.id} transform="translate(8 8)">
      <title>Status: {info.label}</title>
      <rect width={w} height={22} rx={11} fill="#ffffff" stroke="#d4d4d8" />
      <circle cx={13} cy={11} r={4} fill={info.color} />
      <text x={23} y={15} fontSize={11.5} fill="#27272a">
        {info.label}
      </text>
    </g>
  );
}

/** Selection-bar action that steps through the statuses (and back to none). One undo step per press. */
export function statusAction(item: Item, ctx: WidgetCtx): WidgetAction {
  const current = statusInfo(item.data?.status),
    next = statusInfo(nextItemStatus(item.data?.status));
  return {
    label: `Status: ${current?.label ?? 'None'}`,
    icon: <CircleDot size={17} />,
    disabled: !!item.locked,
    run: () => {
      ctx.update(b => ({
        ...b,
        items: b.items.map(i =>
          i.id === item.id ? { ...i, data: withItemStatus(i.data ?? {}, nextItemStatus(i.data?.status)) } : i,
        ),
      }));
      ctx.display(next ? `Status set to ${next.label}.` : 'Status cleared.');
    },
  };
}
