import React, { useLayoutEffect, useRef, useState } from 'react';
export function AnchoredPanel({
  anchor,
  children,
  placement = 'right',
}: {
  anchor: string;
  children: React.ReactNode;
  placement?: 'right' | 'below';
}) {
  const panel = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: 80, top: 90 });
  useLayoutEffect(() => {
    const place = () => {
      const trigger = document.querySelector<HTMLElement>(`[data-tool-anchor="${anchor}"]`),
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
