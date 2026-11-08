// Swimlane diagram view, inline lane renaming, divider dragging and the lanes editor (gap E6).
import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, Columns3, Plus, Rows3, Trash2 } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx, WidgetView } from './widget-types';
import { Dialog } from './widget-kit';
import { readableTextOn } from './board-tools';
import {
  SWIM_DEFAULT_LANE,
  SWIM_DEFAULT_PHASE,
  SWIM_MAX,
  SWIM_MAX_SECTIONS,
  SWIM_MIN,
  swimColors,
  swimData,
  swimlaneLayout,
} from './specs-swimlane';
import type { Rect, SwimAxis, SwimCell, SwimSection, SwimlaneData } from './specs-swimlane';
import {
  addSection,
  moveSection,
  patchSection,
  relayoutSwimlane,
  removeSection,
  resizeSection,
  sectionContentCount,
  setSwimOrientation,
  withoutSection,
} from './swimlane';
import { askChoice } from './choice-prompt';
import { usePopup } from './popup';
import './widgets-swimlane.css';

const colorLabels = ['Rose', 'Peach', 'Butter', 'Mint', 'Sky', 'Lavender', 'Grey'];
const clip = (text: string, chars: number) =>
  text.length > chars ? text.slice(0, Math.max(1, chars - 1)) + '…' : text;
const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation();
/** SVG rect attributes for a layout rectangle. */
const box = (r: Rect) => ({ x: r.x, y: r.y, width: r.w, height: r.h });
type Editing = { axis: SwimAxis | 'title'; id: string } | null;
type Drag = { axis: SwimAxis; id: string; start: number; base: number; delta: number; pointer: number } | null;

/** Inline text field over a header; Enter or leaving the field saves, Esc cancels. */
function InlineTitle({
  box,
  value,
  label,
  onDone,
}: {
  box: Rect;
  value: string;
  label: string;
  onDone: (v: string | null) => void;
}) {
  const [text, setText] = useState(value),
    done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <foreignObject x={box.x} y={box.y} width={Math.max(60, box.w)} height={box.h} className="swim-inline">
      <input
        aria-label={label}
        autoFocus
        maxLength={200}
        value={text}
        onChange={e => setText(e.target.value)}
        onPointerDown={stopEvent}
        onDoubleClick={stopEvent}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') finish(text);
          if (e.key === 'Escape') finish(null);
        }}
        onBlur={() => finish(text)}
      />
    </foreignObject>
  );
}

function SwimlaneRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const [editing, setEditing] = useState<Editing>(null),
    [activeLane, setActiveLane] = useState<string | null>(null),
    [drag, setDrag] = useState<Drag>(null),
    lastPress = useRef<{ key: string; at: number } | null>(null);
  if (!swimData(item)?.lanes) return null;
  const l = swimlaneLayout(item),
    horizontal = l.orientation === 'horizontal',
    z = ctx.zoom || 1,
    headerFill = item.fill,
    ink = readableTextOn(headerFill);
  const commit = (axis: SwimAxis | 'title', id: string, value: string | null) => {
    setEditing(null);
    if (value === null) return;
    if (axis === 'title') {
      if (value !== item.text)
        ctx.update(b => ({
          ...b,
          items: b.items.map(i => (i.id === item.id ? { ...i, text: value.slice(0, 200) } : i)),
        }));
    } else {
      const list = axis === 'lanes' ? l.lanes : l.phases;
      if (list.find(c => c.section.id === id)?.section.title !== value)
        ctx.update(b => patchSection(b, item.id, axis, id, { title: value }));
    }
  };
  // Double-clicking a header renames it in place. The canvas captures the pointer on the first press, so
  // the second press is recognised here (and kept from the canvas) rather than through the dblclick event.
  const begin = (axis: SwimAxis | 'title', id: string) => {
    if (item.locked) return ctx.display('This object is locked. Unlock it to edit.');
    setEditing({ axis, id });
  };
  const startEdit = (axis: SwimAxis | 'title', id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      const key = `${axis}:${id}`,
        last = lastPress.current,
        now = e.timeStamp;
      lastPress.current = { key, at: now };
      if (e.button !== 0 || !last || last.key !== key || now - last.at > 450) return;
      e.stopPropagation();
      lastPress.current = null;
      begin(axis, id);
    },
    onDoubleClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!editing) begin(axis, id);
    },
  });
  // Divider drag: the far edge of a lane or phase; later lanes and their objects shift along.
  const along = (axis: SwimAxis, e: React.PointerEvent) => ((axis === 'lanes') === horizontal ? e.clientY : e.clientX);
  const dividerProps = (axis: SwimAxis, cell: SwimCell) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || item.locked) return;
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setDrag({ axis, id: cell.section.id, start: along(axis, e), base: cell.size, delta: 0, pointer: e.pointerId });
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag || drag.pointer !== e.pointerId) return;
      e.stopPropagation();
      const delta = Math.max(SWIM_MIN - drag.base, (along(axis, e) - drag.start) / z);
      setDrag({ ...drag, delta });
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (!drag || drag.pointer !== e.pointerId) return;
      e.stopPropagation();
      setDrag(null);
      if (Math.abs(drag.delta) >= 1)
        ctx.update(b => resizeSection(b, item.id, drag.axis, drag.id, drag.base + drag.delta));
    },
    onPointerCancel: () => setDrag(null),
    onDoubleClick: stopEvent,
  });
  const hairline = { vectorEffect: 'non-scaling-stroke' as const };
  const grip = 10 / z;
  const laneText = (c: SwimCell) => {
    const t = c.section.title || `Lane ${c.index + 1}`;
    return horizontal ? (
      <text
        x={c.header.w / 2}
        y={c.header.y + c.header.h / 2}
        transform={`rotate(-90 ${c.header.w / 2} ${c.header.y + c.header.h / 2})`}
        dy="5"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill={readableTextOn(c.section.color ?? headerFill)}
      >
        {clip(t, Math.floor((c.size - 12) / 8))}
      </text>
    ) : (
      <text
        x={c.header.x + c.header.w / 2}
        y={c.header.y + c.header.h / 2 + 5}
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill={readableTextOn(c.section.color ?? headerFill)}
      >
        {clip(t, Math.floor((c.size - 12) / 8))}
      </text>
    );
  };
  const editBox = (axis: SwimAxis, c: SwimCell): Rect =>
    axis === 'lanes' && horizontal
      ? { x: l.body.x + 6, y: c.start + 6, w: Math.min(260, l.body.w - 12), h: 32 }
      : axis === 'phases' && !horizontal
        ? { x: l.body.x + 6, y: c.start + 6, w: Math.min(260, l.body.w - 12), h: 32 }
        : { x: c.header.x + 4, y: c.header.y + Math.max(0, (c.header.h - 32) / 2), w: c.header.w - 8, h: 32 };
  const guide = (() => {
    if (!drag) return null;
    const list = drag.axis === 'lanes' ? l.lanes : l.phases,
      c = list.find(x => x.section.id === drag.id);
    if (!c) return null;
    const at = c.start + c.size + drag.delta,
      laneAxisIsY = (drag.axis === 'lanes') === horizontal;
    return laneAxisIsY ? (
      <line x1={0} x2={item.w} y1={at} y2={at} stroke="#4262ff" strokeWidth={2} strokeDasharray="6 4" {...hairline} />
    ) : (
      <line x1={at} x2={at} y1={0} y2={item.h} stroke="#4262ff" strokeWidth={2} strokeDasharray="6 4" {...hairline} />
    );
  })();
  return (
    <g className="swimlane">
      <rect width={item.w} height={item.h} fill="#ffffff" />
      {l.lanes.map(c =>
        c.section.color ? (
          <rect key={'b' + c.section.id} {...box(c.body)} fill={c.section.color} fillOpacity={0.45} />
        ) : null,
      )}
      {l.title && (
        <g className="swim-title" {...startEdit('title', item.id)}>
          <rect {...box(l.title)} fill={headerFill} />
          <text x={14} y={l.title.h / 2 + 6} fontSize="16" fontWeight="700" fill={ink}>
            {clip(item.text || 'Untitled swimlane', Math.floor((item.w - 28) / 9))}
          </text>
        </g>
      )}
      {l.phases.map(c => (
        <g key={'p' + c.section.id} className="swim-phase-header" {...startEdit('phases', c.section.id)}>
          <rect {...box(c.header)} fill={c.section.color ?? '#fafafb'} />
          {horizontal ? (
            <text
              x={c.header.x + c.header.w / 2}
              y={c.header.y + c.header.h / 2 + 5}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill={readableTextOn(c.section.color ?? '#fafafb')}
            >
              {clip(c.section.title || `Phase ${c.index + 1}`, Math.floor((c.size - 12) / 7.5))}
            </text>
          ) : (
            <text
              x={c.header.w / 2}
              y={c.header.y + c.header.h / 2}
              dy="5"
              transform={`rotate(-90 ${c.header.w / 2} ${c.header.y + c.header.h / 2})`}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill={readableTextOn(c.section.color ?? '#fafafb')}
            >
              {clip(c.section.title || `Phase ${c.index + 1}`, Math.floor((c.size - 12) / 7.5))}
            </text>
          )}
        </g>
      ))}
      {l.lanes.map(c => (
        <g
          key={'h' + c.section.id}
          className="swim-lane-header"
          data-lane={c.section.id}
          {...startEdit('lanes', c.section.id)}
          // The canvas captures the pointer on press, so no click reaches the header: show its bar on press
          // (the press still selects the swimlane; a second press renames, as before).
          onPointerDown={e => {
            setActiveLane(c.section.id);
            startEdit('lanes', c.section.id).onPointerDown(e);
          }}
        >
          <rect {...box(c.header)} fill={c.section.color ?? headerFill} />
          {laneText(c)}
        </g>
      ))}
      {/* Dividers: between lanes across the whole pool, between phases across the lane bodies. */}
      {l.lanes
        .slice(1)
        .map(c =>
          horizontal ? (
            <line
              key={'d' + c.section.id}
              x1={0}
              x2={item.w}
              y1={c.start}
              y2={c.start}
              stroke="#a1a1aa"
              {...hairline}
            />
          ) : (
            <line
              key={'d' + c.section.id}
              x1={c.start}
              x2={c.start}
              y1={l.title?.h ?? 0}
              y2={item.h}
              stroke="#a1a1aa"
              {...hairline}
            />
          ),
        )}
      {l.phases
        .slice(1)
        .map(c =>
          horizontal ? (
            <line
              key={'q' + c.section.id}
              x1={c.start}
              x2={c.start}
              y1={l.title?.h ?? 0}
              y2={item.h}
              stroke="#c5c5ce"
              strokeDasharray="6 5"
              {...hairline}
            />
          ) : (
            <line
              key={'q' + c.section.id}
              x1={0}
              x2={item.w}
              y1={c.start}
              y2={c.start}
              stroke="#c5c5ce"
              strokeDasharray="6 5"
              {...hairline}
            />
          ),
        )}
      {horizontal ? (
        <line x1={l.body.x} x2={l.body.x} y1={l.title?.h ?? 0} y2={item.h} stroke="#a1a1aa" {...hairline} />
      ) : (
        <line x1={0} x2={item.w} y1={l.body.y} y2={l.body.y} stroke="#a1a1aa" {...hairline} />
      )}
      {l.title && <line x1={0} x2={item.w} y1={l.title.h} y2={l.title.h} stroke="#a1a1aa" {...hairline} />}
      {l.phases.length > 0 &&
        (horizontal ? (
          <line x1={l.body.x} x2={item.w} y1={l.body.y} y2={l.body.y} stroke="#a1a1aa" {...hairline} />
        ) : (
          <line x1={l.body.x} x2={l.body.x} y1={l.body.y} y2={item.h} stroke="#a1a1aa" {...hairline} />
        ))}
      <rect
        width={item.w}
        height={item.h}
        fill="none"
        stroke={ctx.selected ? '#4262ff' : '#8a8a94'}
        strokeWidth={1.25}
        {...hairline}
      />
      {ctx.selected &&
        !item.locked &&
        (['lanes', 'phases'] as const).flatMap(axis =>
          (axis === 'lanes' ? l.lanes : l.phases).map(c => {
            const end = c.start + c.size,
              acrossY = (axis === 'lanes') === horizontal;
            const r: Rect = acrossY
              ? {
                  x: axis === 'lanes' ? 0 : l.body.x,
                  y: end - grip / 2,
                  w: item.w - (axis === 'lanes' ? 0 : l.body.x),
                  h: grip,
                }
              : {
                  x: end - grip / 2,
                  y: axis === 'lanes' ? (l.title?.h ?? 0) : l.body.y,
                  w: grip,
                  h: item.h - (axis === 'lanes' ? (l.title?.h ?? 0) : l.body.y),
                };
            return (
              <rect
                key={axis + c.section.id}
                className="swim-divider"
                data-divider={`${axis}:${c.section.id}`}
                {...box(r)}
                fill="transparent"
                style={{ cursor: acrossY ? 'row-resize' : 'col-resize' }}
                {...dividerProps(axis, c)}
              />
            );
          }),
        )}
      {guide}
      {editing &&
        (() => {
          if (editing.axis === 'title')
            return (
              <InlineTitle
                box={{ x: 8, y: 6, w: Math.min(420, item.w - 16), h: 32 }}
                value={item.text}
                label="Swimlane title"
                onDone={v => commit('title', item.id, v)}
              />
            );
          const axis = editing.axis,
            c = (axis === 'lanes' ? l.lanes : l.phases).find(x => x.section.id === editing.id);
          if (!c) return null;
          return (
            <InlineTitle
              box={editBox(axis, c)}
              value={c.section.title}
              label={axis === 'lanes' ? 'Lane title' : 'Phase title'}
              onDone={v => commit(axis, c.section.id, v)}
            />
          );
        })()}
      {activeLane &&
        ctx.selected &&
        !item.locked &&
        !editing &&
        (() => {
          const k = l.lanes.findIndex(c => c.section.id === activeLane);
          if (k < 0) return null;
          const c = l.lanes[k];
          return (
            <LaneBar
              key={activeLane}
              item={item}
              ctx={ctx}
              lane={c.section}
              index={k}
              count={l.lanes.length}
              horizontal={horizontal}
              // Just above the swimlane: the bar is drawn with the swimlane, so objects inside it would cover it.
              at={{ x: horizontal ? 0 : c.header.x, y: -46 / z }}
              zoom={z}
              onClose={() => setActiveLane(null)}
            />
          );
        })()}
    </g>
  );
}

/**
 * The bar for the lane whose header was clicked (decision R6b-Q2, 2026-11-08): move the lane earlier or later,
 * set its colour, or delete it (asking about its objects). Kept at screen size whatever the zoom; closes on Esc or
 * a press outside it, like other pop-ups.
 */
function LaneBar({
  item,
  ctx,
  lane,
  index,
  count,
  horizontal,
  at,
  zoom,
  onClose,
}: {
  item: Item;
  ctx: WidgetCtx;
  lane: SwimSection;
  index: number;
  count: number;
  horizontal: boolean;
  at: { x: number; y: number };
  zoom: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  usePopup(true, ref, onClose, { closeOnScroll: false });
  const title = lane.title || `Lane ${index + 1}`;
  const remove = async () => {
    const next = withoutSection(ctx.board, item.id, 'lanes', lane.id);
    const how = await askAboutContents(sectionContentCount(ctx.board, item.id, next), `“${title}”`);
    if (!how) return;
    onClose();
    ctx.update(b => removeSection(b, item.id, 'lanes', lane.id, how === 'keep').board);
  };
  const W = 228,
    H = 40;
  return (
    <foreignObject x={at.x} y={at.y} width={W / zoom} height={H / zoom}>
      <div
        ref={ref}
        className="swim-lane-bar floating"
        role="toolbar"
        aria-label={`Lane ${title}`}
        style={{ transform: `scale(${1 / zoom})`, transformOrigin: '0 0', width: W, height: H }}
      >
        <button
          className="icon-button"
          aria-label={`Move lane ${title} ${horizontal ? 'up' : 'left'}`}
          disabled={index === 0}
          onPointerDown={stopEvent}
          onClick={() => ctx.update(b => moveSection(b, item.id, 'lanes', lane.id, -1))}
        >
          <ArrowUp size={15} />
        </button>
        <button
          className="icon-button"
          aria-label={`Move lane ${title} ${horizontal ? 'down' : 'right'}`}
          disabled={index === count - 1}
          onPointerDown={stopEvent}
          onClick={() => ctx.update(b => moveSection(b, item.id, 'lanes', lane.id, 1))}
        >
          <ArrowDown size={15} />
        </button>
        <select
          aria-label={`Lane ${title} colour`}
          value={lane.color ?? ''}
          onPointerDown={stopEvent}
          onChange={e => ctx.update(b => patchSection(b, item.id, 'lanes', lane.id, { color: e.target.value || null }))}
        >
          <option value="">No colour</option>
          {swimColors.map((c, j) => (
            <option key={c} value={c}>
              {colorLabels[j]}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          aria-label={`Delete lane ${title}`}
          disabled={count === 1}
          onPointerDown={stopEvent}
          onClick={() => void remove()}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </foreignObject>
  );
}

/** Rows for one axis in the editor: title, size, colour, move up/down and remove. */
function SectionRows({
  axis,
  list,
  setList,
  horizontal,
}: {
  axis: SwimAxis;
  list: SwimSection[];
  setList: (next: SwimSection[]) => void;
  horizontal: boolean;
}) {
  const noun = axis === 'lanes' ? 'Lane' : 'Phase',
    earlier = (axis === 'lanes') === horizontal ? 'up' : 'left',
    later = (axis === 'lanes') === horizontal ? 'down' : 'right';
  const patch = (k: number, p: Partial<SwimSection>) => setList(list.map((s, j) => (j === k ? { ...s, ...p } : s)));
  const move = (k: number, d: -1 | 1) => {
    const next = [...list];
    [next[k], next[k + d]] = [next[k + d], next[k]];
    setList(next);
  };
  return (
    <div className="swim-rows" role="group" aria-label={axis === 'lanes' ? 'Lanes' : 'Phases'}>
      {list.map((s, k) => (
        <div className="swim-row" key={s.id}>
          <input
            aria-label={`${noun} ${k + 1} title`}
            maxLength={200}
            value={s.title}
            onChange={e => patch(k, { title: e.target.value })}
          />
          <input
            aria-label={`${noun} ${k + 1} size`}
            type="number"
            min={SWIM_MIN}
            max={SWIM_MAX}
            step={10}
            value={Math.round(s.size)}
            onChange={e => patch(k, { size: Number(e.target.value) })}
          />
          <select
            aria-label={`${noun} ${k + 1} colour`}
            value={s.color ?? ''}
            onChange={e => {
              const { color: _c, ...rest } = s;
              void _c;
              setList(list.map((x, j) => (j === k ? (e.target.value ? { ...rest, color: e.target.value } : rest) : x)));
            }}
          >
            <option value="">No colour</option>
            {swimColors.map((c, j) => (
              <option key={c} value={c}>
                {colorLabels[j]}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label={`Move ${noun.toLowerCase()} ${k + 1} ${earlier}`}
            disabled={k === 0}
            onClick={() => move(k, -1)}
          >
            <ArrowUp size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={`Move ${noun.toLowerCase()} ${k + 1} ${later}`}
            disabled={k === list.length - 1}
            onClick={() => move(k, 1)}
          >
            <ArrowDown size={15} />
          </button>
          <button
            className="icon-button"
            aria-label={`Delete ${noun.toLowerCase()} ${k + 1}`}
            disabled={axis === 'lanes' && list.length === 1}
            onClick={() => setList(list.filter((_, j) => j !== k))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        className="swim-add"
        disabled={list.length >= SWIM_MAX_SECTIONS}
        onClick={() => {
          const used = new Set(list.map(s => s.title));
          let n = list.length + 1;
          while (used.has(`${noun} ${n}`)) n++;
          setList([
            ...list,
            {
              id: crypto.randomUUID(),
              title: `${noun} ${n}`,
              size: axis === 'lanes' ? SWIM_DEFAULT_LANE : list.length ? SWIM_DEFAULT_PHASE : SWIM_DEFAULT_PHASE,
            },
          ]);
        }}
      >
        <Plus size={14} /> Add {noun.toLowerCase()}
      </button>
    </div>
  );
}

/**
 * Deleting lanes or phases that hold objects asks what to do with them (decision R6b-Q3, 2026-11-08): delete them
 * too, or keep them on the board where they are. Resolves to null on Cancel.
 */
async function askAboutContents(count: number, what: string): Promise<'delete' | 'keep' | null> {
  if (!count) return 'delete';
  const objects = `${count} ${count === 1 ? 'object' : 'objects'}`;
  const how = await askChoice(
    `Delete ${what}`,
    `${what} holds ${objects}. What should happen to ${count === 1 ? 'it' : 'them'}?`,
    [
      { id: 'delete', label: `Delete the ${objects} too`, detail: 'Undo brings them back' },
      { id: 'keep', label: `Keep the ${objects} on the board`, detail: 'They stay where they are' },
    ],
  );
  return how === 'delete' || how === 'keep' ? how : null;
}

function SwimlaneEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = swimData(item);
  const [title, setTitle] = useState(item.text),
    [showTitle, setShowTitle] = useState(!d.hideTitle),
    [orientation, setOrientation] = useState(d.orientation),
    [lanes, setLanes] = useState<SwimSection[]>(d.lanes),
    [phases, setPhases] = useState<SwimSection[]>(d.phases ?? []);
  const horizontal = orientation === 'horizontal';
  const apply = () => {
    const fix = (list: SwimSection[]) =>
      list.map(s => ({
        ...s,
        title: s.title.slice(0, 200),
        size: Number.isFinite(s.size) ? Math.min(SWIM_MAX, Math.max(SWIM_MIN, s.size)) : SWIM_MIN,
      }));
    const next: SwimlaneData = { orientation, lanes: fix(lanes) };
    if (phases.length) next.phases = fix(phases);
    if (!showTitle) next.hideTitle = true;
    const lost = [...d.lanes, ...(d.phases ?? [])]
      .filter(s => ![...lanes, ...phases].some(x => x.id === s.id))
      .map(s => s.title || 'Untitled');
    void (async () => {
      const count = lost.length ? sectionContentCount(ctx.board, item.id, next) : 0;
      const how = await askAboutContents(count, lost.length === 1 ? `“${lost[0]}”` : `${lost.length} lanes and phases`);
      if (!how) return;
      let removed = 0;
      ctx.update(b => {
        const r = relayoutSwimlane(b, item.id, next, { text: title.slice(0, 200) }, how === 'keep');
        removed = r.removed;
        return r.board;
      });
      if (lost.length)
        ctx.display(
          `Deleted ${lost.join(', ')}${removed ? ` with ${removed} ${removed === 1 ? 'object' : 'objects'}` : how === 'keep' && count ? `; its objects stay on the board` : ''}. Undo restores it.`,
        );
      onClose();
    })();
  };
  return (
    <Dialog
      title="Swimlanes"
      hint="Objects move with their lane when lanes are reordered or resized. Deleting a lane deletes the objects in it."
      onClose={onClose}
      onApply={apply}
      wide
    >
      <div className="swim-editor">
        <div className="swim-top">
          <label>
            Title
            <input aria-label="Swimlane title" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className="check-inline">
            <input type="checkbox" checked={showTitle} onChange={e => setShowTitle(e.target.checked)} />
            Show title band
          </label>
          <label>
            Lanes run
            <select
              aria-label="Lane orientation"
              value={orientation}
              onChange={e => setOrientation(e.target.value as SwimlaneData['orientation'])}
            >
              <option value="horizontal">Horizontally (rows)</option>
              <option value="vertical">Vertically (columns)</option>
            </select>
          </label>
        </div>
        <h3>Lanes</h3>
        <SectionRows axis="lanes" list={lanes} setList={setLanes} horizontal={horizontal} />
        <h3>Phases</h3>
        <SectionRows axis="phases" list={phases} setList={setPhases} horizontal={horizontal} />
      </div>
    </Dialog>
  );
}

export const swimlaneView: WidgetView = {
  kind: 'swimlane',
  mode: 'svg',
  Render: SwimlaneRender,
  Editor: SwimlaneEditor,
  actions: (item, ctx) => {
    const d = swimData(item),
      horizontal = d?.orientation !== 'vertical';
    return [
      {
        label: 'Add lane',
        icon: horizontal ? <Rows3 size={17} /> : <Columns3 size={17} />,
        disabled: (d?.lanes.length ?? 0) >= SWIM_MAX_SECTIONS,
        run: () => ctx.update(b => addSection(b, item.id, 'lanes')),
      },
      {
        label: 'Add phase',
        icon: horizontal ? <Columns3 size={17} /> : <Rows3 size={17} />,
        disabled: (d?.phases?.length ?? 0) >= SWIM_MAX_SECTIONS,
        run: () => ctx.update(b => addSection(b, item.id, 'phases')),
      },
      {
        label: horizontal ? 'Switch to vertical lanes' : 'Switch to horizontal lanes',
        icon: <ArrowLeftRight size={17} />,
        run: () => ctx.update(b => setSwimOrientation(b, item.id, horizontal ? 'vertical' : 'horizontal')),
      },
    ];
  },
};
