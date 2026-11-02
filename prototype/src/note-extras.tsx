import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Board, Item } from './model';
import { noteEmojis, datasetChoices } from './notes';
import type { ConversionTarget } from './notes';
import { shapeKinds, shapeLabels } from './shapes';
import type { ShapeKind } from './shapes';
import { ShapeGlyph } from './shape-tools';

/** Marker drawn on the note's top-left corner, outside the text area, scaled with the note. */
export function EmojiBadge({ item }: { item: Item }) {
  if (!item.emoji) return null;
  const size = Math.max(22, Math.min(44, Math.min(item.w, item.h) * 0.16));
  return (
    <g pointerEvents="none" aria-hidden="true">
      <circle cx={0} cy={0} r={size * 0.62} fill="#ffffff" stroke="#e4e4e8" strokeWidth="1" />
      <text x={0} y={size * 0.02} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.72}>
        {item.emoji}
      </text>
    </g>
  );
}

/** Anchored emoji grid. Arrow keys move between emojis; Enter/Space chooses. */
export function EmojiPicker({
  current,
  onChoose,
  onClose,
}: {
  current?: string;
  onChoose: (emoji: string | undefined) => void;
  onClose: () => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    (
      (grid.current?.querySelector('[aria-pressed=true]') as HTMLElement) ?? grid.current?.querySelector('button')
    )?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    const buttons = [...(grid.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])],
      index = buttons.indexOf(document.activeElement as HTMLButtonElement),
      step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[e.key];
    if (step && index >= 0) {
      e.preventDefault();
      buttons[Math.max(0, Math.min(buttons.length - 1, index + step))].focus();
    }
  };
  return (
    <aside className="emoji-picker floating" aria-label="Note marker" onKeyDown={keys}>
      <div className="panel-heading">
        <h2>Marker</h2>
        <button className="icon-button" aria-label="Close marker picker" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div ref={grid} className="emoji-grid" role="group" aria-label="Emoji">
        {noteEmojis.map(e => (
          <button
            key={e}
            aria-label={`Use ${e}`}
            aria-pressed={current === e}
            className={current === e ? 'active' : ''}
            onClick={() => onChoose(e)}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="note-details-actions">
        <button disabled={!current} onClick={() => onChoose(undefined)}>
          Remove marker
        </button>
      </div>
      <p>Markers are saved with this note on this board. They are not shared reactions.</p>
    </aside>
  );
}

/** Choose what a sticky note becomes. Conversion is a single undoable change. */
export function ConvertPanel({
  board,
  onConvert,
  onClose,
}: {
  board: Board;
  onConvert: (target: ConversionTarget) => void;
  onClose: () => void;
}) {
  const datasets = datasetChoices(board),
    [shape, setShape] = useState<ShapeKind>('rectangle'),
    [dataset, setDataset] = useState<string>(datasets[0]?.id ?? 'new'),
    first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    first.current?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return (
    <aside
      className="convert-panel floating"
      aria-label="Convert sticky note"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel-heading">
        <h2>Convert note</h2>
        <button className="icon-button" aria-label="Close convert" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <section>
        <h3>Card</h3>
        <p>Keeps the title, tags, link and colour; adds assignee, due date and status fields.</p>
        <button onClick={() => onConvert({ kind: 'card' })}>Convert to card</button>
      </section>
      <section>
        <h3>Text</h3>
        <p>Keeps text, formatting, links, tags and connectors.</p>
        <button ref={first} onClick={() => onConvert({ kind: 'text' })}>
          Convert to text
        </button>
      </section>
      <section>
        <h3>Shape</h3>
        <div className="convert-row">
          <select aria-label="Target shape" value={shape} onChange={e => setShape(e.target.value as ShapeKind)}>
            {shapeKinds.map(k => (
              <option key={k} value={k}>
                {shapeLabels[k]}
              </option>
            ))}
          </select>
          <span className="convert-glyph">
            <ShapeGlyph kind={shape} />
          </span>
          <button onClick={() => onConvert({ kind: 'shape', shape })}>Convert</button>
        </div>
        <p>The note colour becomes the shape fill.</p>
      </section>
      <section>
        <h3>Record</h3>
        <div className="convert-row">
          <select aria-label="Target dataset" value={dataset} onChange={e => setDataset(e.target.value)}>
            {datasets.map(d => (
              <option key={d.id} value={d.id}>
                {d.label} ({d.count})
              </option>
            ))}
            <option value="new">New table</option>
          </select>
          <button onClick={() => onConvert({ kind: 'record', datasetId: dataset })}>Add as record</button>
        </div>
        <p>
          Text becomes the record title; tags and link are kept. Connectors move to the table view. The emoji marker is
          not carried over.
        </p>
      </section>
    </aside>
  );
}
