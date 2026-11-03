import { GripVertical } from 'lucide-react';
import { canvasControl } from './canvas-fields';
const MIME = 'application/x-boardroom-grid-axis';
export function GridAxisHandle({
  id,
  axis,
  index,
  count,
  disabled,
  onMove,
}: {
  id: string;
  axis: 'row' | 'column';
  index: number;
  count: number;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <button
      {...canvasControl}
      className={`grid-axis-handle grid-${axis}-handle`}
      draggable={!disabled}
      disabled={disabled}
      aria-label={`Move ${axis} ${index + 1}`}
      title={`Drag to reorder ${axis}; Alt + arrow keys also move it`}
      onDragStart={e => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(MIME, JSON.stringify({ id, axis, index }));
      }}
      onDragOver={e => {
        if ([...e.dataTransfer.types].includes(MIME)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={e => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const value = JSON.parse(e.dataTransfer.getData(MIME));
          if (
            !disabled &&
            value.id === id &&
            value.axis === axis &&
            Number.isInteger(value.index) &&
            value.index >= 0 &&
            value.index < count
          )
            onMove(value.index, index);
        } catch {
          /* Ignore foreign drag data. */
        }
      }}
      onKeyDown={e => {
        if (!e.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        const to = index + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1);
        if (to >= 0 && to < count) onMove(index, to);
      }}
    >
      <GripVertical size={12} />
    </button>
  );
}
