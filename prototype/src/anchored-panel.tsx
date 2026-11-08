import React, { useLayoutEffect, useRef, useState } from 'react';
import { usePopup } from './popup';

const triggerOf = (anchor: string) => document.querySelector<HTMLElement>(`[data-tool-anchor="${anchor}"]`);

/**
 * A panel placed beside (or below) the control marked `data-tool-anchor`. With `onDismiss` (item 144: the rail
 * pop-outs) it closes on a press outside it and its anchor, Esc (focus back to the anchor, selection kept) and
 * Tab out, and focuses its first row or field when it opens.
 */
export function AnchoredPanel({
  anchor,
  children,
  placement = 'right',
  onDismiss,
}: {
  anchor: string;
  children: React.ReactNode;
  placement?: 'right' | 'below';
  onDismiss?: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: 80, top: 90 });
  // Placed beside the rail with fixed coordinates (DESIGN.md), so scrolling does not move it away from its anchor.
  usePopup(!!onDismiss, panel, () => onDismiss?.(), {
    focusFirst: true,
    closeOnScroll: false,
    trigger: () => triggerOf(anchor),
  });
  useLayoutEffect(() => {
    const place = () => {
      const trigger = triggerOf(anchor),
        el = panel.current;
      if (!trigger || !el) return;
      const rect = trigger.getBoundingClientRect(),
        box = el.getBoundingClientRect(),
        left =
          placement === 'below'
            ? Math.max(12, Math.min(rect.left, innerWidth - Math.min(320, box.width) - 12))
            : Math.min(rect.right + 10, innerWidth - 100),
        top = Math.max(
          84,
          Math.min(placement === 'below' ? rect.bottom + 8 : rect.top - 8, innerHeight - 80 - box.height),
        );
      setPosition(p => (p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    addEventListener('resize', place);
    return () => {
      observer.disconnect();
      removeEventListener('resize', place);
    };
  }, [anchor, placement]);
  return (
    <div
      ref={panel}
      className="anchored-panel"
      style={{ left: position.left, top: position.top, maxWidth: `calc(100vw - ${position.left + 12}px)` }}
    >
      {children}
    </div>
  );
}
