import React, { useEffect, useRef, useState } from 'react';
import type { Item, ConnectorFormat, ConnectorHead, Point, Board, Side } from './model';
import { endpoints } from './model';
import { canConnect, addBend, removeBend, resetBends, setBendPoint, DEFAULT_CLEARANCE } from './connector-geometry';
import { bendsToPoints } from './routing';
import { X, Plus, Trash2, RotateCcw } from 'lucide-react';
export { connectorGeometry } from './connector-geometry';
export function ConnectorControls({ item, onChange }: { item: Item; onChange: (format: ConnectorFormat) => void }) {
  const f = item.connector ?? {};
  const heads = [
    ['none', 'None'],
    ['arrow', 'Arrow'],
    ['open', 'Open arrow'],
    ['circle', 'Circle'],
    ['diamond', 'Diamond'],
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
    </>
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
      <RouteEditor item={item} board={board} onRoute={onRoute} />
    </aside>
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
  const width = Math.min(240, Math.max(80, item.text.length * 7 + 24)),
    height = Math.min(
      72,
      Math.max(30, (Math.ceil((item.text.length * 7) / width) + item.text.split('\n').length - 1) * 18 + 10),
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
            fontSize: 14,
            fontFamily: 'Arial',
            color: '#25252c',
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
