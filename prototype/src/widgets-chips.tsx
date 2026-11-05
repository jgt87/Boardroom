// Estimate palette and dot pile views (track F), and the chip button shared with the People widget's avatars.
// A chip drags onto an object (canvas-surface.tsx handles the drop) or, pressed with objects selected, applies
// to the selection. Only the chips capture the pointer, so the widget body stays selectable and draggable.
import React, { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import './widgets-chips.css';
import type { Item } from './model';
import type { WidgetCtx, WidgetView } from './widget-types';
import { Dialog, data, patchItem, stop } from './widget-kit';
import { spokenColor } from './access-tools';
import {
  CHIP_MIME,
  DOT_PILE_MAX,
  dotColors,
  dotsLeft,
  dotsPlaced,
  encodeChip,
  estimateLabel,
  paletteValues,
} from './chip-rules';
import type { Chip, DotPileData, EstimatePaletteData, EstimateScale } from './chip-rules';
import { applyChip, chipName, recolorDots, returnAllDots } from './chips';

/** Apply a pressed chip to the current selection (without the widget that holds the chip). */
export function applyChipToSelection(ctx: WidgetCtx, ownerId: string, chip: Chip) {
  const ids = (ctx.selection?.() ?? []).filter(id => id !== ownerId);
  if (!ids.length) {
    ctx.display(
      chip.kind === 'dot'
        ? 'Select objects first, or drag the dot onto one.'
        : 'Select cards or sticky notes first, or drag the chip onto one.',
    );
    return;
  }
  let applied = 0;
  ctx.update(b => {
    const r = applyChip(b, ids, chip);
    applied = r.applied;
    return r.board;
  });
  if (applied) ctx.display(`Applied ${chipName(chip)} to ${applied === 1 ? '1 object' : `${applied} objects`}.`);
}

/** A draggable chip that also applies to the selection when pressed (Enter, Space or click). */
export function ChipButton({
  chip,
  ownerId,
  ctx,
  label,
  className,
  style,
  tabIndex,
  pressed,
  children,
}: {
  chip: Chip;
  ownerId: string;
  ctx: WidgetCtx;
  label: string;
  className?: string;
  style?: React.CSSProperties;
  tabIndex?: number;
  pressed?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      draggable
      className={`w-chip ${className ?? ''}`}
      style={style}
      tabIndex={tabIndex}
      aria-label={label}
      aria-pressed={pressed}
      title={`${label}: drag onto an object, or press to apply to the selection`}
      data-chip={encodeChip(chip)}
      onPointerDown={stop}
      onDoubleClick={stop}
      onDragStart={e => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(CHIP_MIME, encodeChip(chip));
      }}
      onClick={e => {
        e.stopPropagation();
        applyChipToSelection(ctx, ownerId, chip);
      }}
    >
      {children}
    </button>
  );
}

const scaleNames: Record<EstimateScale, string> = { points: 'Story points', tshirt: 'T-shirt sizes' };

function EstimatesRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<EstimatePaletteData>(item),
    scale: EstimateScale = d.scale === 'tshirt' ? 'tshirt' : 'points';
  return (
    <div className="w-chips" role="group" aria-label="Estimate chips">
      <div className="w-chips-head">
        <strong>{scaleNames[scale]}</strong>
        <span className="w-chips-switch" role="radiogroup" aria-label="Estimate scale">
          {(['points', 'tshirt'] as const).map(s => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={scale === s}
              disabled={!!item.locked}
              onPointerDown={stop}
              onDoubleClick={stop}
              onClick={() => patchItem(ctx, item.id, i => ({ ...i, data: { ...data(i), scale: s } }))}
            >
              {s === 'points' ? 'Points' : 'Sizes'}
            </button>
          ))}
        </span>
      </div>
      <div className="w-chips-row" role="group" aria-label={scaleNames[scale]}>
        {paletteValues[scale].map(v => (
          <ChipButton
            key={v}
            chip={{ kind: 'estimate', value: v }}
            ownerId={item.id}
            ctx={ctx}
            label={`Estimate ${v === '?' ? 'unknown' : estimateLabel(v)}`}
          >
            {estimateLabel(v)}
          </ChipButton>
        ))}
        <ChipButton
          chip={{ kind: 'estimate', value: '' }}
          ownerId={item.id}
          ctx={ctx}
          label="Clear estimate"
          className="w-chip-clear"
        >
          <X size={14} />
        </ChipButton>
      </div>
    </div>
  );
}

function DotPileRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<DotPileData>(item),
    left = dotsLeft(ctx.board, item);
  return (
    <div className="w-chips w-dotpile" role="group" aria-label={`Dot pile ${d.title}`}>
      <div className="w-chips-head">
        <strong>{d.title || 'Dots'}</strong>
        <span className="w-dotpile-left">
          {left} of {d.total} left
        </span>
      </div>
      <div className="w-dotpile-dots" role="group" aria-label="Voting dots">
        {Array.from({ length: d.total }, (_, k) =>
          k < left ? (
            <ChipButton
              key={k}
              chip={{ kind: 'dot', pile: item.id }}
              ownerId={item.id}
              ctx={ctx}
              label={`Voting dot, ${left} left`}
              className="w-dot"
              style={{ background: d.color }}
              tabIndex={k === 0 ? 0 : -1}
            />
          ) : (
            <span key={k} className="w-dot used" style={{ borderColor: d.color }} aria-hidden="true" />
          ),
        )}
      </div>
    </div>
  );
}

function DotPileEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [d, setD] = useState(data<DotPileData>(item)),
    [total, setTotal] = useState(String(data<DotPileData>(item).total));
  const n = Number(total),
    error =
      !Number.isInteger(n) || n < 1 || n > DOT_PILE_MAX
        ? `Choose 1 to ${DOT_PILE_MAX} dots.`
        : /[<>]/.test(d.title)
          ? 'Remove < and > from the title.'
          : '';
  const placed = dotsPlaced(ctx.board, item.id);
  return (
    <Dialog
      title="Dot pile"
      hint={
        placed ? `${placed} placed on the board. Click a placed dot to return it.` : 'Drag dots onto objects to vote.'
      }
      onClose={onClose}
      error={error}
      applyDisabled={!!error}
      onApply={() => {
        if (error) return;
        ctx.update(b =>
          recolorDots(
            {
              ...b,
              items: b.items.map(i =>
                i.id === item.id ? { ...i, data: { title: d.title.trim(), total: n, color: d.color } } : i,
              ),
            },
            item.id,
            d.color,
          ),
        );
        onClose();
      }}
    >
      <div className="w-form">
        <label className="span2">
          Title
          <input
            aria-label="Dot pile title"
            value={d.title}
            maxLength={80}
            onChange={e => setD({ ...d, title: e.target.value })}
          />
        </label>
        <label>
          Dots per pile
          <input
            aria-label="Number of dots"
            type="number"
            min={1}
            max={DOT_PILE_MAX}
            value={total}
            onChange={e => setTotal(e.target.value)}
          />
        </label>
        <fieldset className="span2 w-swatches">
          <legend>Dot colour</legend>
          {dotColors.map(c => (
            <button
              key={c}
              aria-label={`Dot colour ${spokenColor(c)}`}
              title={spokenColor(c)}
              aria-pressed={d.color === c}
              style={{ background: c }}
              onClick={() => setD({ ...d, color: c })}
            />
          ))}
        </fieldset>
      </div>
    </Dialog>
  );
}

export const chipViews: WidgetView[] = [
  { kind: 'estimates', mode: 'html', Render: EstimatesRender, interactive: true },
  {
    kind: 'dotpile',
    mode: 'html',
    Render: DotPileRender,
    Editor: DotPileEditor,
    interactive: true,
    actions: (item, ctx) => [
      {
        label: 'Return all dots',
        icon: <RotateCcw size={16} />,
        disabled: !dotsPlaced(ctx.board, item.id),
        run: () => ctx.update(b => returnAllDots(b, item.id)),
      },
    ],
  },
];
