import type { KeyboardEvent } from 'react';

/** Canvas fields commit once on blur/Enter. Escape discards the draft. */
export function CanvasField({
  value,
  label,
  onCommit,
  multiline = false,
  onKeyDown,
  maxLength = 6000,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  maxLength?: number;
}) {
  const props = {
    className: 'canvas-field',
    'aria-label': label,
    defaultValue: value,
    maxLength,
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.currentTarget.value !== value) onCommit(e.currentTarget.value);
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        e.currentTarget.value = value;
        e.currentTarget.blur();
      } else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.currentTarget.blur();
      } else onKeyDown?.(e);
    },
  };
  return multiline ? <textarea key={value} {...props} /> : <input key={value} {...props} />;
}

export const canvasControl = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
};
