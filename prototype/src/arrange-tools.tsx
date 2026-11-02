import React from 'react';
import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Group,
  Ungroup,
  X,
} from 'lucide-react';
import type { AlignMode } from './arrange';

const aligns: { mode: AlignMode; label: string; icon: typeof AlignStartVertical }[] = [
  { mode: 'left', label: 'Align left', icon: AlignStartVertical },
  { mode: 'center', label: 'Align centers horizontally', icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { mode: 'middle', label: 'Align middles vertically', icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
];
/** Alignment, distribution and grouping commands. Each command is one undo step. */
export function ArrangePanel({
  canAlign,
  canDistribute,
  canGroup,
  grouped,
  onAlign,
  onDistribute,
  onGroup,
  onUngroup,
  onClose,
}: {
  canAlign: boolean;
  canDistribute: boolean;
  canGroup: boolean;
  grouped: boolean;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
  onGroup: () => void;
  onUngroup: () => void;
  onClose: () => void;
}) {
  return (
    <aside
      className="arrange-panel floating"
      aria-label="Arrange"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel-heading">
        <h2>Arrange</h2>
        <button className="icon-button" aria-label="Close arrange" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <h3>Align</h3>
      <div className="arrange-grid">
        {aligns.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            className="icon-button"
            aria-label={label}
            title={label}
            disabled={!canAlign}
            onClick={() => onAlign(mode)}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <h3>Distribute</h3>
      <div className="arrange-grid two">
        <button disabled={!canDistribute} onClick={() => onDistribute('horizontal')}>
          <AlignHorizontalSpaceAround size={17} />
          Horizontally
        </button>
        <button disabled={!canDistribute} onClick={() => onDistribute('vertical')}>
          <AlignVerticalSpaceAround size={17} />
          Vertically
        </button>
      </div>
      <h3>Group</h3>
      <div className="arrange-grid two">
        <button disabled={!canGroup} onClick={onGroup} title="Group (Ctrl G)">
          <Group size={17} />
          Group
        </button>
        <button disabled={!grouped} onClick={onUngroup} title="Ungroup (Ctrl Shift G)">
          <Ungroup size={17} />
          Ungroup
        </button>
      </div>
      <p>
        {!canAlign
          ? 'Select two or more unlocked objects to align.'
          : !canDistribute
            ? 'Distribution needs three or more objects.'
            : 'Outer objects stay in place when distributing.'}{' '}
        Locked objects are never moved.
      </p>
    </aside>
  );
}
