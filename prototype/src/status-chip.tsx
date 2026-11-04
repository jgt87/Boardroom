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
