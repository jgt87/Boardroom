import React, { useEffect, useRef, useState } from 'react';
import type { Item, ConnectorFormat, ConnectorHead, Point, Board, Side } from './model';
import { endpoints } from './model';
import { canConnect, addBend, removeBend, resetBends, setBendPoint, DEFAULT_CLEARANCE } from './connector-geometry';
import { bendsToPoints } from './routing';
import { pointAlong } from './board-tools';
import { addConnectorLabel, updateConnectorLabel, removeConnectorLabel, MAX_CONNECTOR_LABELS } from './diagram-gaps';
import {
  setConnectorLabelStyle,
  labelColors,
  labelSizes,
  MAIN_LABEL_SIZE,
  EXTRA_LABEL_SIZE,
  LABEL_COLOR,
} from './diagram-extras';
import { X, Plus, Trash2, RotateCcw } from 'lucide-react';
import './diagram-extras.css';
export { connectorGeometry } from './connector-geometry';
export function ConnectorControls({ item, onChange }: { item: Item; onChange: (format: ConnectorFormat) => void }) {
  const f = item.connector ?? {};
  const heads = [
    ['none', 'None'],
    ['arrow', 'Arrow'],
    ['open', 'Open arrow'],
    ['circle', 'Circle'],
    ['diamond', 'Diamond'],
    ['one', 'One (ERD)'],
    ['many', 'Many (ERD)'],
    ['zero-one', 'Zero or one (ERD)'],
    ['zero-many', 'Zero or many (ERD)'],
    ['one-many', 'One or many (ERD)'],
  ];
  return (
    <div className="connector-controls" aria-label="Connector formatting">
      <select
        aria-label="Connector path"
        value={f.path ?? 'straight'}
        onChange={e => onChange({ ...f, path: e.target.value as ConnectorFormat['path'] })}
      >
        <option value="straight">Straight</option>
        <option value="elbow">Elbow</option>
        <option value="curved">Curved</option>
      </select>
      <select
        aria-label="Line thickness"
        value={f.width ?? 2}
        onChange={e => onChange({ ...f, width: Number(e.target.value) })}
      >
        {[1, 2, 3, 4, 6, 8, 12].map(w => (
          <option key={w} value={w}>
            {w} px
          </option>
        ))}
      </select>
      <select
        aria-label="Line pattern"
        value={f.dash ?? 'solid'}
        onChange={e => onChange({ ...f, dash: e.target.value as ConnectorFormat['dash'] })}
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
      </select>
      {(['startHead', 'endHead'] as const).map(key => (
        <select
          key={key}
          aria-label={key === 'startHead' ? 'Start arrowhead' : 'End arrowhead'}
          title={key === 'startHead' ? 'Start arrowhead' : 'End arrowhead'}
          value={f[key] ?? (key === 'startHead' ? 'none' : 'arrow')}
          onChange={e => onChange({ ...f, [key]: e.target.value as ConnectorHead })}
        >
          {heads.map(([value, label]) => (
            <option key={value} value={value}>
              {key === 'startHead' ? 'Start' : 'End'}: {label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
export function ConnectorMarkers() {
  return (
    <>
      {(['arrow', 'open', 'circle', 'diamond'] as const).map(head => (
        <marker
          key={head}
          id={`connector-head-${head}`}
          viewBox="0 0 10 10"
          refX={head === 'circle' ? 8 : 9}
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          {head === 'arrow' ? (
            <path d="M0 0 L10 5 L0 10Z" fill="context-stroke" />
          ) : head === 'open' ? (
            <path d="M1 1 L9 5 L1 9" fill="none" stroke="context-stroke" strokeWidth="1.5" />
          ) : head === 'circle' ? (
            <circle cx="5" cy="5" r="3" fill="context-stroke" />
          ) : (
            <path d="M0 5 L5 1 L10 5 L5 9Z" fill="context-stroke" />
          )}
        </marker>
      ))}
      {crowHeads.map(([head, d, circleX]) => (
        <marker
          key={head}
          id={`connector-head-${head}`}
          viewBox="0 0 20 20"
          refX="20"
          refY="10"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse"
        >
          <path d={d} fill="none" stroke="context-stroke" strokeWidth="2.2" strokeLinecap="round" />
          {circleX !== undefined && (
            <circle cx={circleX} cy="10" r="3.6" fill="#ffffff" stroke="context-stroke" strokeWidth="2.2" />
          )}
        </marker>
      ))}
    </>
  );
}
/** ERD crow's-foot heads (gap E3): outline path in a 20 x 20 box pointing right, and an optional "zero" circle. */
const crowHeads: [ConnectorHead, string, number?][] = [
  ['one', 'M15 3 V17 M10 3 V17'],
  ['many', 'M20 3 L8 10 L20 17'],
  ['zero-one', 'M15 3 V17', 7],
  ['zero-many', 'M20 3 L11 10 L20 17', 5],
  ['one-many', 'M20 3 L11 10 L20 17 M7 3 V17'],
];
/**
 * Extra labels along a connector (gap E4); `at` is a fraction along the drawn path. Edited in the details panel;
 * on a selected connector each label can be dragged along the line (track R2-H).
 */
export function ConnectorLabels({ item, nodes }: { item: Item; nodes: Point[] }) {
  const labels = item.connector?.labels;
  if (!labels?.length || nodes.length < 2) return null;
  return (
    <g>
      {labels
        .filter(l => l.text.trim())
        .map(l => {
          const p = pointAlong(nodes, l.at),
            size = l.size ?? EXTRA_LABEL_SIZE,
            k = size / EXTRA_LABEL_SIZE,
            width = Math.min(200 * k, Math.max(40, l.text.length * 0.54 * size + 16)),
            height = Math.round(size * 1.3 + 9);
          return (
            <g key={l.id}>
              <rect
                data-label-drag={l.id}
                data-label-of={item.id}
                x={p.x - width / 2}
                y={p.y - height / 2}
                width={width}
                height={height}
                fill="transparent"
                style={{ cursor: 'grab' }}
              >
                <title>Drag to move the label along the line</title>
              </rect>
              <foreignObject
                data-connector-label={l.id}
                x={p.x - width / 2}
                y={p.y - height / 2}
                width={width}
                height={height}
                pointerEvents="none"
              >
                <div
                  className="object-text connector-caption"
                  title={l.text}
                  style={{
                    background: '#fff',
                    borderRadius: 4,
                    padding: '3px 6px',
                    fontSize: size,
                    fontFamily: 'Arial',
                    color: l.color ?? LABEL_COLOR,
                    textAlign: 'center',
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {l.text}
                </div>
              </foreignObject>
            </g>
          );
        })}
    </g>
  );
}
const sideOptions: [string, string][] = [
  ['', 'Auto'],
  ['top', 'Top'],
  ['right', 'Right'],
  ['bottom', 'Bottom'],
  ['left', 'Left'],
];
export function ConnectorDetails({
  item,
  board,
  onApply,
  onRoute,
  onClose,
}: {
  item: Item;
  board: Board;
  onApply: (start: string, end: string, text: string, sides: { start?: Side; end?: Side }) => void;
  onRoute: (change: (b: Board) => Board) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(item.from ?? ''),
    [end, setEnd] = useState(item.to ?? ''),
    [text, setText] = useState(item.text),
    [error, setError] = useState(''),
    field = useRef<HTMLTextAreaElement>(null);
  const [startSide, setStartSide] = useState<string>(item.connector?.startSide ?? ''),
    [endSide, setEndSide] = useState<string>(item.connector?.endSide ?? '');
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <aside
      className="connector-details floating"
      aria-label="Connector details"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel-heading">
        <h2>Label and connections</h2>
        <button className="icon-button" aria-label="Close connector details" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <form
        onSubmit={e => {
          e.preventDefault();
          try {
            onApply(start, end, text, {
              start: (startSide || undefined) as Side | undefined,
              end: (endSide || undefined) as Side | undefined,
            });
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label>
          Label
          <textarea
            ref={field}
            aria-label="Connector label"
            maxLength={200}
            value={text}
            onChange={e => setText(e.target.value)}
          />
        </label>
        {(['Start', 'End'] as const).map(name => (
          <label key={name}>
            {name} connection
            <select
              aria-label={`${name} connection`}
              value={name === 'Start' ? start : end}
              onChange={e => {
                (name === 'Start' ? setStart : setEnd)(e.target.value);
                setError('');
              }}
            >
              <option value="">Free endpoint</option>
              {board.items.filter(canConnect).map((i, index) => (
                <option key={i.id} value={i.id}>
                  {i.text.trim().replace(/\s+/g, ' ').slice(0, 45) || `Untitled ${i.type}`} · {index + 1}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="side-row">
          {(['Start', 'End'] as const).map(name => (
            <label key={name}>
              {name} side
              <select
                aria-label={`${name} attachment side`}
                value={name === 'Start' ? startSide : endSide}
                onChange={e => (name === 'Start' ? setStartSide : setEndSide)(e.target.value)}
              >
                {sideOptions.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p>
          Drag either end to reconnect; choose the same object twice for a self-loop. Hold Alt to leave an end free.
        </p>
        {error && (
          <p role="alert" className="format-error">
            {error}
          </p>
        )}
        <div className="note-details-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Apply
          </button>
        </div>
      </form>
      <LabelsEditor item={item} onRoute={onRoute} />
      <RouteEditor item={item} board={board} onRoute={onRoute} />
    </aside>
  );
}
/** Colour and font size of one connector label (track R2-H). Each change is one undo step. */
function LabelStyle({
  name,
  color,
  size,
  onChange,
}: {
  name: string;
  color?: string;
  size: number;
  onChange: (patch: { color?: string | null; size?: number | null }) => void;
}) {
  const sizes = labelSizes.includes(size) ? labelSizes : [...labelSizes, size].sort((a, b) => a - b);
  return (
    <>
      <select
        aria-label={`${name} colour`}
        value={color ?? LABEL_COLOR}
        onChange={e => onChange({ color: e.target.value === LABEL_COLOR ? null : e.target.value })}
      >
        {labelColors.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
        {color && !labelColors.some(([v]) => v === color) && <option value={color}>{color}</option>}
      </select>
      <select aria-label={`${name} size`} value={size} onChange={e => onChange({ size: Number(e.target.value) })}>
        {sizes.map(s => (
          <option key={s} value={s}>
            {s} px
          </option>
        ))}
      </select>
    </>
  );
}
/** Extra labels along the line (gap E4). Each change is one undo step. */
function LabelsEditor({ item, onRoute }: { item: Item; onRoute: (change: (b: Board) => Board) => void }) {
  const labels = item.connector?.labels ?? [];
  const [error, setError] = useState('');
  const run = (change: (b: Board) => Board) => {
    try {
      onRoute(change);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <section className="route-editor" aria-label="Extra labels">
      <div className="side-row label-style-row">
        <span>Main label</span>
        <LabelStyle
          name="Main label"
          color={item.connector?.labelColor}
          size={item.connector?.labelSize ?? MAIN_LABEL_SIZE}
          onChange={patch => run(b => setConnectorLabelStyle(b, item.id, null, patch))}
        />
      </div>
      <h3>More labels</h3>
      {labels.length > 0 && (
        <ol className="bend-list label-list">
          {labels.map((l, index) => (
            <li key={l.id}>
              <input
                aria-label={`Extra label ${index + 1} text`}
                key={`t${l.text}`}
                defaultValue={l.text}
                maxLength={200}
                onBlur={e => {
                  if (e.target.value !== l.text)
                    run(b => updateConnectorLabel(b, item.id, l.id, { text: e.target.value }));
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
              <label>
                At
                <input
                  aria-label={`Extra label ${index + 1} position`}
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  key={`a${l.at}`}
                  defaultValue={Math.round(l.at * 100)}
                  onBlur={e => {
                    const n = Number(e.target.value);
                    if (e.target.value.trim() !== '' && Number.isFinite(n) && n / 100 !== l.at)
                      run(b => updateConnectorLabel(b, item.id, l.id, { at: n / 100 }));
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                />
                %
              </label>
              <div className="label-style">
                <LabelStyle
                  name={`Extra label ${index + 1}`}
                  color={l.color}
                  size={l.size ?? EXTRA_LABEL_SIZE}
                  onChange={patch => run(b => setConnectorLabelStyle(b, item.id, l.id, patch))}
                />
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove extra label ${index + 1}`}
                onClick={() => run(b => removeConnectorLabel(b, item.id, l.id))}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="format-error">
          {error}
        </p>
      )}
      <div className="note-details-actions">
        <button
          type="button"
          disabled={labels.length >= MAX_CONNECTOR_LABELS}
          onClick={() => run(b => addConnectorLabel(b, item.id, 'Label', labels.length % 2 ? 0.75 : 0.25))}
        >
          <Plus size={15} />
          Add label
        </button>
      </div>
      <p>Positions run from 0% at the start to 100% at the end of the line.</p>
    </section>
  );
}
/** Routing options and the keyboard-accessible bend editor. Each change is one undo step. */
function RouteEditor({
  item,
  board,
  onRoute,
}: {
  item: Item;
  board: Board;
  onRoute: (change: (b: Board) => Board) => void;
}) {
  const c = item.connector ?? {},
    [a, b] = endpoints(item, board.items),
    points = c.bends ? bendsToPoints(a, b, c.bends) : [],
    set = (patch: Partial<ConnectorFormat>) =>
      onRoute(bd => ({
        ...bd,
        items: bd.items.map(i => (i.id === item.id ? { ...i, connector: { ...i.connector, ...patch } } : i)),
      }));
  const commitPoint = (index: number, axis: 'x' | 'y', value: string) => {
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n) || Math.round(points[index][axis]) === n) return;
    onRoute(bd => setBendPoint(bd, item.id, index, { ...points[index], [axis]: n }));
  };
  return (
    <section className="route-editor" aria-label="Connector route">
      <h3>Route</h3>
      <div className="side-row">
        <label className="check-row">
          <input
            type="checkbox"
            aria-label="Avoid objects"
            checked={c.avoid !== false}
            disabled={(c.path ?? 'straight') === 'straight'}
            onChange={e => set({ avoid: e.target.checked })}
          />
          Avoid objects
        </label>
        <label>
          Clearance
          <select
            aria-label="Route clearance"
            value={c.clearance ?? DEFAULT_CLEARANCE}
            onChange={e => set({ clearance: Number(e.target.value) })}
          >
            {[0, 8, 16, 24, 40, 60, 80].map(v => (
              <option key={v} value={v}>
                {v} px
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          aria-label="Line jumps"
          checked={c.jumps !== false}
          onChange={e => set({ jumps: e.target.checked })}
        />
        Jump over crossing lines
      </label>
      {c.labelAt !== undefined && (
        <button type="button" className="link-button" onClick={() => set({ labelAt: undefined })}>
          Re-centre label
        </button>
      )}
      {(c.path ?? 'straight') === 'straight' && !points.length && (
        <p>Straight lines connect directly. Choose Elbow or Curved to route around objects.</p>
      )}
      {points.length > 0 && (
        <ol className="bend-list">
          {points.map((p, index) => (
            <li key={index}>
              <span>Bend {index + 1}</span>
              <label>
                X
                <input
                  aria-label={`Bend ${index + 1} X`}
                  type="number"
                  key={`x${Math.round(p.x)}`}
                  defaultValue={Math.round(p.x)}
                  onBlur={e => commitPoint(index, 'x', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPoint(index, 'x', e.currentTarget.value);
                    }
                  }}
                />
              </label>
              <label>
                Y
                <input
                  aria-label={`Bend ${index + 1} Y`}
                  type="number"
                  key={`y${Math.round(p.y)}`}
                  defaultValue={Math.round(p.y)}
                  onBlur={e => commitPoint(index, 'y', e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPoint(index, 'y', e.currentTarget.value);
                    }
                  }}
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove bend ${index + 1}`}
                onClick={() => onRoute(bd => removeBend(bd, item.id, index))}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="note-details-actions">
        <button type="button" disabled={points.length >= 20} onClick={() => onRoute(bd => addBend(bd, item.id))}>
          <Plus size={15} />
          Add bend
        </button>
        <button type="button" disabled={!points.length} onClick={() => onRoute(bd => resetBends(bd, item.id))}>
          <RotateCcw size={15} />
          Reset to automatic
        </button>
      </div>
      <p>On the canvas, drag the square handles to bend the line. Esc cancels a drag.</p>
    </section>
  );
}
export function ConnectorCaption({
  item,
  mid,
  editing,
  onCommit,
}: {
  item: Item;
  mid: Point;
  editing: boolean;
  onCommit: (text: string) => void;
}) {
  // Colour and size of the caption (track R2-H); the default size keeps the original measurements.
  const size = item.connector?.labelSize ?? MAIN_LABEL_SIZE,
    k = size / MAIN_LABEL_SIZE,
    width = Math.min(240 * k, Math.max(80, item.text.length * 7 * k + 24)),
    height = Math.min(
      72 * k,
      Math.max(30, (Math.ceil((item.text.length * 7 * k) / width) + item.text.split('\n').length - 1) * 18 * k + 10),
    );
  if (editing)
    return (
      <foreignObject x={mid.x - 120} y={mid.y - 36} width={240} height={72}>
        <textarea
          aria-label="Edit connector label"
          className="connector-label-editor"
          defaultValue={item.text}
          autoFocus
          maxLength={200}
          onFocus={e => e.currentTarget.select()}
          onPointerDown={e => e.stopPropagation()}
          onBlur={e => onCommit(e.target.value)}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.currentTarget.value = item.text;
              e.currentTarget.blur();
            } else if (e.key === 'Enter' && !e.shiftKey) e.currentTarget.blur();
          }}
        />
      </foreignObject>
    );
  if (!item.text) return null;
  return (
    <>
      <rect
        data-caption={item.id}
        x={mid.x - width / 2}
        y={mid.y - height / 2}
        width={width}
        height={height}
        fill="transparent"
        style={{ cursor: 'grab' }}
      >
        <title>Drag to move the label along the line</title>
      </rect>
      <foreignObject x={mid.x - width / 2} y={mid.y - height / 2} width={width} height={height} pointerEvents="none">
        <div
          className="object-text connector-caption"
          title={item.text}
          style={{
            background: '#fff',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: size,
            fontFamily: 'Arial',
            color: item.connector?.labelColor ?? LABEL_COLOR,
            textAlign: 'center',
            lineHeight: 1.3,
            overflow: 'hidden',
          }}
        >
          {item.text}
        </div>
      </foreignObject>
    </>
  );
}

/** Reverse a connector: ends, attachments, heads and fixed sides swap; free ends keep their positions. */
export function swapConnectorEnds(item: Item): Item {
  const f = item.connector ?? {};
  const connector: ConnectorFormat = { ...f };
  const swap = <K extends keyof ConnectorFormat>(a: K, b: K) => {
    const x = f[a],
      y = f[b];
    if (y === undefined) delete connector[a];
    else connector[a] = y as ConnectorFormat[K];
    if (x === undefined) delete connector[b];
    else connector[b] = x as ConnectorFormat[K];
  };
  // A connector without explicit heads ends in an arrow; keep that visible after swapping.
  if (f.startHead === undefined && f.endHead === undefined) {
    connector.startHead = 'arrow';
    connector.endHead = 'none';
  } else swap('startHead', 'endHead');
  swap('startSide', 'endSide');
  const next: Item = { ...item, connector, x: item.x + item.w, y: item.y + item.h, w: -item.w, h: -item.h };
  if (item.to) next.from = item.to;
  else delete next.from;
  if (item.from) next.to = item.from;
  else delete next.to;
  if (connector.bends?.length) connector.bends = [...connector.bends].reverse().map(b => ({ u: 1 - b.u, v: -b.v }));
  return next;
}
