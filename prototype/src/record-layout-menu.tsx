import { useEffect, useRef, useState } from 'react';
import { Table2, Columns3, CalendarRange, ChevronDown, Check } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { canvasControl } from './canvas-fields';

const layouts = [
  { kind: 'table', label: 'Table', Icon: Table2 },
  { kind: 'kanban', label: 'Kanban', Icon: Columns3 },
  { kind: 'timeline', label: 'Timeline', Icon: CalendarRange },
] as const;

export function RecordLayoutMenu({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const current = layouts.find(l => l.kind === item.type) ?? layouts[0];
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <div ref={root} className="record-layout-menu" {...canvasControl}>
      <button
        ref={trigger}
        className="record-layout-trigger"
        aria-label={`Layout: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open && !item.locked}
        disabled={!!item.locked}
        onClick={() => setOpen(value => !value)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <current.Icon size={15} />
        <span>{current.label}</span>
        <ChevronDown size={13} />
      </button>
      {open && !item.locked && (
        <div
          className="record-layout-options"
          role="menu"
          aria-label="Record layouts"
          onKeyDown={event => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
              return;
            }
            if (event.key === 'Tab') {
              close();
              return;
            }
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : event.key === 'ArrowDown'
                    ? (index + 1) % items.length
                    : event.key === 'ArrowUp'
                      ? (index + items.length - 1) % items.length
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              items[next]?.focus();
            }
          }}
        >
          {layouts.map(({ kind, label, Icon }) => (
            <button
              key={kind}
              role="menuitemradio"
              aria-checked={item.type === kind}
              onClick={() => {
                close();
                if (kind !== item.type)
                  ctx.update(board => ({
                    ...board,
                    items: board.items.map(i => (i.id === item.id && !i.locked ? { ...i, type: kind } : i)),
                  }));
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
              {item.type === kind && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
