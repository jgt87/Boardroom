// Properties inspector (item 5): exact geometry, appearance, arrangement and metadata for the selection.
// Evidence: the audit's "Inspector UI and design-system tokens" module.
import React, { useEffect, useRef, useState } from 'react';
import { X, ArrowUp, ArrowDown, Lock, LockOpen, Eye, EyeOff, Unlink } from 'lucide-react';
import type { Board, Item, ShapeStyle } from './model';
import { editableIds, setLocked } from './arrange';
import { setRotation } from './interactions';
import { canRotate } from './rotation';
import { isShapeKind, shapeLabels } from './shapes';
import { specFor } from './widget-specs';
import { layerLabel } from './board-tools';
import { timeLabel } from './item-times';
import {
  MIXED,
  type Shared,
  altKinds,
  boardSummary,
  clearLink,
  connectorEnds,
  geometryOf,
  hasText,
  hasTextMetrics,
  layerPosition,
  moveLayer,
  selectedItems,
  setFill,
  setOpacity,
  setTextMetric,
  setGeometry,
  setHiddenFlag,
  setStyleField,
  setTextField,
  setTextSize,
  shared,
} from './inspector-model';
import './inspector.css';
import { kindLabels, linkOf, linkState, stateLabels } from './mermaid-link';

type Props = {
  board: Board;
  selected: string[];
  onChange: (change: (b: Board) => Board) => void;
  onClose: () => void;
  /** Open the code panel of a frame linked to Mermaid code. */
  onEditMermaid?: (id: string) => void;
};
const DEFAULT_BORDER = { borderColor: '#2d2d34', borderWidth: 1.5, borderStyle: 'solid', borderOpacity: 1 } as const;
const round = (n: number) => Math.round(n * 10) / 10;
const kindLabel = (i: Item) => (isShapeKind(i.type) ? shapeLabels[i.type] : (specFor(i.type)?.label ?? i.type));

/** Text/number input that commits on Enter or blur and reverts on Escape. */
function CommitField({
  label,
  value,
  mixed,
  type = 'number',
  disabled,
  onCommit,
  min,
  max,
  maxLength,
}: {
  label: string;
  value: string;
  mixed?: boolean;
  type?: 'number' | 'text';
  disabled?: boolean;
  onCommit: (value: string) => void;
  min?: number;
  max?: number;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value && !(mixed && draft === '')) onCommit(draft);
  };
  return (
    <label className="inspector-field">
      <span>{label}</span>
      <input
        type={type}
        value={draft}
        placeholder={mixed ? 'Mixed' : undefined}
        disabled={disabled}
        min={min}
        max={max}
        maxLength={maxLength}
        step={type === 'number' ? 1 : undefined}
        aria-label={label}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape' && draft !== value) {
            e.preventDefault();
            e.stopPropagation();
            setDraft(value);
          }
        }}
      />
    </label>
  );
}

const show = <T,>(v: Shared<T>, f: (x: T) => string) => (v === MIXED || v === undefined ? '' : f(v));

export function PropertiesInspector({ board, selected, onChange, onClose, onEditMermaid }: Props) {
  const panel = useRef<HTMLElement>(null);
  const items = selectedItems(board, selected);
  const locked = items.some(i => i.locked);
  const single = items.length === 1 ? items[0] : null;
  const num = (field: 'x' | 'y' | 'w' | 'h') => (v: string) => {
    const n = Number(v);
    if (v.trim() !== '' && Number.isFinite(n)) onChange(b => setGeometry(b, selected, field, n));
  };

  const heading = (
    <div className="panel-heading">
      <h2>Properties{items.length > 1 && <span>{items.length}</span>}</h2>
      <button className="icon-button" aria-label="Close properties" onClick={onClose}>
        <X size={17} />
      </button>
    </div>
  );
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    } else e.stopPropagation();
  };

  if (!items.length) {
    const s = boardSummary(board);
    return (
      <aside ref={panel} className="inspector floating" aria-label="Properties" onKeyDown={keys}>
        {heading}
        <dl className="inspector-summary">
          <dt>Board</dt>
          <dd>{s.title || 'Untitled board'}</dd>
          <dt>Objects</dt>
          <dd>{s.objects}</dd>
          <dt>Frames</dt>
          <dd>{s.frames}</dd>
          <dt>Connectors</dt>
          <dd>{s.connectors}</dd>
        </dl>
        <p className="inspector-hint">Select objects to see and edit their exact position, size and style.</p>
      </aside>
    );
  }

  const geo = geometryOf(board, selected);
  const geomItems = items.filter(i => i.type !== 'arrow');
  const many = geomItems.length > 1;
  const fill = shared(items, i => i.fill);
  const allText = items.every(i => i.type === 'text');
  const allTextBearing = items.every(hasText);
  const fontSize = shared(items, i => String(i.format?.fontSize ?? 'auto'));
  const allShapes = items.every(i => isShapeKind(i.type));
  const border = <K extends keyof typeof DEFAULT_BORDER>(k: K) =>
    shared(items, i => (i.style?.[k] ?? DEFAULT_BORDER[k]) as ShapeStyle[K]);
  const grouped = shared(items, i => !!i.group);
  const hidden = items.every(i => i.hidden);
  const linkTarget = single?.linkTo ? board.items.find(i => i.id === single.linkTo) : undefined;

  return (
    <aside ref={panel} className="inspector floating" aria-label="Properties" onKeyDown={keys}>
      {heading}
      <p className="inspector-kind">
        {single ? kindLabel(single) : `${items.length} objects`}
        {locked && (
          <span className="inspector-locked">
            <Lock size={12} /> Locked
          </span>
        )}
      </p>

      {geo && geomItems.length > 0 && (
        <fieldset className="inspector-section">
          <legend>{many ? 'Selection bounds' : 'Position and size'}</legend>
          <div className="inspector-grid">
            <CommitField
              label="X"
              value={String(round(geo.x))}
              disabled={locked}
              onCommit={num('x')}
              min={-1e7}
              max={1e7}
            />
            <CommitField
              label="Y"
              value={String(round(geo.y))}
              disabled={locked}
              onCommit={num('y')}
              min={-1e7}
              max={1e7}
            />
            <CommitField
              label="W"
              value={String(round(geo.w))}
              disabled={locked}
              onCommit={num('w')}
              min={40}
              max={1e7}
            />
            <CommitField
              label="H"
              value={String(round(geo.h))}
              disabled={locked}
              onCommit={num('h')}
              min={30}
              max={1e7}
            />
          </div>
          {geomItems.some(canRotate) && (
            <CommitField
              label="Rotation (°)"
              value={show(
                shared(geomItems.filter(canRotate), i => i.rotation ?? 0),
                v => String(round(v)),
              )}
              mixed={shared(geomItems.filter(canRotate), i => i.rotation ?? 0) === MIXED}
              disabled={locked}
              min={-360}
              max={360}
              onCommit={v => {
                const n = Number(v);
                if (v.trim() !== '' && Number.isFinite(n)) onChange(b => setRotation(b, editableIds(b, selected), n));
              }}
            />
          )}
          {many && <p className="inspector-hint">Editing moves or scales the selection as one box.</p>}
        </fieldset>
      )}

      {single &&
        linkOf(single) &&
        (() => {
          const link = linkOf(single)!;
          return (
            <fieldset className="inspector-section">
              <legend>Mermaid code</legend>
              <dl className="inspector-summary">
                <dt>Diagram</dt>
                <dd>{kindLabels[link.kind]}</dd>
                <dt>Sync</dt>
                <dd>{stateLabels[linkState(board, single.id)].replace('Mermaid · ', '')}</dd>
                <dt>Code</dt>
                <dd>{link.code.split('\n').length} lines</dd>
              </dl>
              {onEditMermaid && (
                <div className="inspector-toggles">
                  <button onClick={() => onEditMermaid(single.id)}>Edit Mermaid code</button>
                </div>
              )}
            </fieldset>
          );
        })()}

      {single?.type === 'arrow' &&
        (() => {
          const ends = connectorEnds(board, single);
          return (
            <fieldset className="inspector-section">
              <legend>Connector</legend>
              <dl className="inspector-summary">
                <dt>Start</dt>
                <dd>
                  {ends.start.x}, {ends.start.y}
                </dd>
                <dt>End</dt>
                <dd>
                  {ends.end.x}, {ends.end.y}
                </dd>
              </dl>
            </fieldset>
          );
        })()}

      <fieldset className="inspector-section">
        <legend>Appearance</legend>
        <CommitField
          label="Opacity (%)"
          value={show(
            shared(items, i => (i.opacity ?? 1) * 100),
            String,
          )}
          mixed={shared(items, i => i.opacity ?? 1) === MIXED}
          disabled={locked}
          min={0}
          max={100}
          onCommit={v => {
            if (v.trim()) onChange(b => setOpacity(b, selected, Number(v) / 100));
          }}
        />
        {items.every(hasTextMetrics) && (
          <>
            <CommitField
              label="Font weight"
              value={show(
                shared(items, i => i.format?.fontWeight ?? (i.format?.bold ? 700 : 400)),
                String,
              )}
              mixed={shared(items, i => i.format?.fontWeight ?? (i.format?.bold ? 700 : 400)) === MIXED}
              disabled={locked}
              min={100}
              max={900}
              onCommit={v => {
                if (v.trim()) onChange(b => setTextMetric(b, selected, 'fontWeight', Number(v)));
              }}
            />
            <CommitField
              label="Text offset Y"
              value={show(
                shared(items, i => i.format?.baselineOffsetY ?? 0),
                String,
              )}
              mixed={shared(items, i => i.format?.baselineOffsetY ?? 0) === MIXED}
              disabled={locked}
              min={-200}
              max={200}
              onCommit={v => {
                if (v.trim()) onChange(b => setTextMetric(b, selected, 'baselineOffsetY', Number(v)));
              }}
            />
          </>
        )}
        <label className="inspector-field">
          <span>{allText ? 'Text colour' : 'Fill'}</span>
          <input
            type="color"
            aria-label={allText ? 'Text colour' : 'Fill colour'}
            disabled={locked}
            value={show(fill, v => v) || '#ffffff'}
            onChange={e => onChange(b => setFill(b, selected, e.target.value))}
          />
          {fill === MIXED && <small>Mixed</small>}
        </label>
        {allTextBearing && (
          <label className="inspector-field">
            <span>Font size</span>
            <select
              aria-label="Font size"
              disabled={locked}
              value={fontSize === MIXED ? '' : (fontSize ?? 'auto')}
              onChange={e =>
                onChange(b => setTextSize(b, selected, e.target.value === 'auto' ? 'auto' : Number(e.target.value)))
              }
            >
              {fontSize === MIXED && (
                <option value="" disabled>
                  Mixed
                </option>
              )}
              <option value="auto">Auto</option>
              {[10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        {allShapes && (
          <>
            <label className="inspector-field">
              <span>Border</span>
              <input
                type="color"
                aria-label="Border colour"
                disabled={locked}
                value={show(border('borderColor'), v => String(v)) || DEFAULT_BORDER.borderColor}
                onChange={e => onChange(b => setStyleField(b, selected, 'borderColor', e.target.value))}
              />
            </label>
            <CommitField
              label="Border width"
              value={show(border('borderWidth'), v => String(v))}
              mixed={border('borderWidth') === MIXED}
              disabled={locked}
              min={0}
              max={24}
              onCommit={v => onChange(b => setStyleField(b, selected, 'borderWidth', Number(v)))}
            />
            <label className="inspector-field">
              <span>Border style</span>
              <select
                aria-label="Border style"
                disabled={locked}
                value={show(border('borderStyle'), v => String(v))}
                onChange={e =>
                  onChange(b => setStyleField(b, selected, 'borderStyle', e.target.value as ShapeStyle['borderStyle']))
                }
              >
                {border('borderStyle') === MIXED && (
                  <option value="" disabled>
                    Mixed
                  </option>
                )}
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
            <CommitField
              label="Border opacity %"
              value={show(border('borderOpacity'), v => String(Math.round(Number(v) * 100)))}
              mixed={border('borderOpacity') === MIXED}
              disabled={locked}
              min={0}
              max={100}
              onCommit={v => onChange(b => setStyleField(b, selected, 'borderOpacity', Number(v) / 100))}
            />
          </>
        )}
      </fieldset>

      <fieldset className="inspector-section">
        <legend>Arrangement</legend>
        {single && (
          <div className="inspector-row">
            <span>
              Layer {layerPosition(board, single.id)} of {board.items.length}
            </span>
            <button
              className="icon-button"
              aria-label="Bring forward"
              disabled={locked || layerPosition(board, single.id) === board.items.length}
              onClick={() => onChange(b => moveLayer(b, single.id, 1))}
            >
              <ArrowUp size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Send backward"
              disabled={locked || layerPosition(board, single.id) === 1}
              onClick={() => onChange(b => moveLayer(b, single.id, -1))}
            >
              <ArrowDown size={15} />
            </button>
          </div>
        )}
        <p className="inspector-row">
          <span>Group</span>
          <span>{grouped === MIXED ? 'Mixed' : grouped ? 'Grouped' : 'Not grouped'}</span>
        </p>
        <div className="inspector-toggles">
          <button
            className={locked ? 'active' : ''}
            aria-pressed={locked}
            onClick={() => onChange(b => setLocked(b, selected, !locked))}
          >
            {locked ? <Lock size={15} /> : <LockOpen size={15} />}
            {locked ? 'Locked' : 'Lock'}
          </button>
          <button
            className={hidden ? 'active' : ''}
            aria-pressed={hidden}
            disabled={locked}
            onClick={() => onChange(b => setHiddenFlag(b, selected, !hidden))}
          >
            {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            {hidden ? 'Hidden' : 'Visible'}
          </button>
        </div>
      </fieldset>

      {single && (
        <fieldset className="inspector-section">
          <legend>Details</legend>
          <CommitField
            label="Layer name"
            type="text"
            value={single.name ?? ''}
            disabled={locked}
            maxLength={200}
            onCommit={v => onChange(b => setTextField(b, single.id, 'name', v, 200))}
          />
          {altKinds.has(single.type) && (
            <CommitField
              label="Description"
              type="text"
              value={single.alt ?? ''}
              disabled={locked}
              maxLength={1000}
              onCommit={v => onChange(b => setTextField(b, single.id, 'alt', v, 1000))}
            />
          )}
          {single.linkTo && (
            <div className="inspector-row">
              <span>Links to {linkTarget ? layerLabel(linkTarget) : 'a missing object'}</span>
              <button
                className="icon-button"
                aria-label="Clear link"
                disabled={locked}
                onClick={() => onChange(b => clearLink(b, single.id))}
              >
                <Unlink size={15} />
              </button>
            </div>
          )}
          <p className="inspector-row">
            <span>Kind</span>
            <span>{kindLabel(single)}</span>
          </p>
        </fieldset>
      )}
      {single && (
        <fieldset className="inspector-section">
          <legend>Info</legend>
          <dl className="inspector-summary" aria-label="Object info">
            <dt>Created</dt>
            <dd>{timeLabel(single.createdAt)}</dd>
            <dt>Last modified</dt>
            <dd>{timeLabel(single.modifiedAt)}</dd>
            {single.author && (
              <>
                <dt>Author</dt>
                <dd>{single.author}</dd>
              </>
            )}
          </dl>
        </fieldset>
      )}
    </aside>
  );
}
