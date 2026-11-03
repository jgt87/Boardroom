import { GripVertical } from 'lucide-react';
import type { RecordRow } from './model';
import { canvasControl } from './canvas-fields';

export const RECORD_CARD_MIME = 'application/x-boardroom-record';
export function RecordCardHandle({
  row,
  sourceId,
  onCreate,
}: {
  row: RecordRow;
  sourceId: string;
  onCreate: (id: string) => void;
}) {
  return (
    <button
      {...canvasControl}
      className="record-card-handle"
      draggable
      aria-label={`Create synced card: ${row.title || 'Untitled record'}`}
      title="Drag to canvas to create a synced card, or click to place beside this view"
      onClick={() => onCreate(row.id)}
      onDragStart={e => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(RECORD_CARD_MIME, JSON.stringify({ sourceId, recordId: row.id }));
      }}
    >
      <GripVertical size={14} />
    </button>
  );
}
