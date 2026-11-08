import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Item, MindNode } from './model';
import { removeBranch } from './model';
import { useLatest } from './use-latest';
import { ExternalLink, GripVertical, Minus, Plus } from 'lucide-react';
import { mindNodeShapes } from './model';
import { mindViewport } from './mindmap-bounds';
import {
  mindLayout,
  mindBranchPath,
  mindTopicColor,
  mindHiddenCount,
  toggleMindCollapse,
  revealMindNode,
  setMindColor,
  mindPalette,
  mindColorNames,
  mindStyleOf,
  MIND_NODE_W,
  MIND_NODE_H,
  moveMindBranch,
  mindDropTarget,
  MIND_COL,
  MIND_ROW,
  mindShapeRx,
  mindShapeLabels,
  setMindTopic,
} from './mindmap-style';
import './r5-canvas.css';
import { TopicLabel } from './mind-label';
import { retextTopic, toggleTopicStyle, topicStyleKey } from './mind-rich';
import type { ToggleKey } from './rich-text';

/** Web link field for the chosen topic: commits on Enter or blur; keys never reach the topic editor. */
function TopicLink({ value, onCommit }: { value: string; onCommit: (link: string) => boolean }) {
  const [text, setText] = useState(value),
    [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (text !== value) setInvalid(!onCommit(text));
  };
  return (
    <input
      aria-label="Topic link"
      aria-invalid={invalid}
      placeholder="Add a link"
      maxLength={2048}
      value={text}
      title={invalid ? 'Use an http or https website link.' : undefined}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setText(value);
          setInvalid(false);
        }
      }}
    />
  );
}

/**
 * In-place mind-map editing on the canvas (item 40). Mount inside the item's foreignObject.
 * Tab adds a child, Enter a sibling (a child of the central topic), arrows move between topics,
 * Ctrl+Delete (or Delete/Backspace on an empty topic) removes a branch, Esc commits and closes.
 * All edits are committed together with one onCommit call (one undo step).
 */
export function MindmapCanvasEditor({
  item,
  onCommit,
  onClose,
}: {
  item: Item;
  onCommit: (nodes: MindNode[]) => void;
  onClose: () => void;
}) {
  const [nodes, setNodes] = useState<MindNode[]>(() => structuredClone(item.nodes ?? [])),
    [active, setActive] = useState(() => (item.nodes ?? []).find(n => n.parent === null)?.id ?? '');
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    target: string | null;
    positions: Map<string, { x: number; y: number }>;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const input = useRef<HTMLTextAreaElement>(null),
    branchDrag = useRef<{
      id: string;
      x: number;
      y: number;
      ratio: number;
      scale: number;
      base: MindNode[];
      next: MindNode[];
      target: string | null;
    } | null>(null),
    done = useRef(false),
    latest = useRef(nodes);
  latest.current = nodes;
  const style = mindStyleOf(item),
    basePositions = mindLayout(nodes, style.autoLayout ?? true, style.layout),
    positions = dragPreview?.positions ?? basePositions,
    xs = [...basePositions.values()],
    minX = Math.min(0, ...xs.map(p => p.x)),
    minY = Math.min(0, ...xs.map(p => p.y));
  const vbW = Math.max(0, ...xs.map(p => p.x)) - minX + MIND_NODE_W + 16,
    vbH = Math.max(0, ...xs.map(p => p.y)) - minY + MIND_NODE_H + 22;
  const frozenView = useRef(mindViewport(item));
  const scale = style.autoLayout === false ? item.w / frozenView.current.w : Math.min(item.w / vbW, item.h / vbH),
    offX = style.autoLayout === false ? (minX - 8 - frozenView.current.x) * scale : (item.w - vbW * scale) / 2,
    offY = style.autoLayout === false ? (minY - 8 - frozenView.current.y) * scale : (item.h - vbH * scale) / 2;
  /**
   * Toggle a style over the topic text the textarea has selected (decision R5-Q4). The text does not change, so
   * the textarea keeps its selection by itself.
   */
  const formatTopic = (key: ToggleKey) => {
    const el = input.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    const [start, end] = [el.selectionStart, el.selectionEnd];
    setNodes(latest.current.map(n => (n.id === active ? toggleTopicStyle(n, start, end, key) : n)));
  };
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onCommit(latest.current);
    onClose();
  };
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [active]);
  const commitRef = useLatest(onCommit);
  useEffect(
    () => () => {
      if (!done.current) {
        done.current = true;
        commitRef.current(latest.current);
      }
    },
    [commitRef],
  );
  const chosen = nodes.find(n => n.id === active),
    p = positions.get(active);
  const add = (sibling: boolean) => {
    if (!chosen || nodes.length >= 200) return;
    const n = {
      id: crypto.randomUUID(),
      parent: sibling && chosen.parent ? chosen.parent : chosen.id,
      text: 'New topic',
      ...(style.autoLayout === false && p
        ? { position: { x: Math.min(100000, p.x + (sibling ? 0 : MIND_COL)), y: Math.min(100000, p.y + MIND_ROW) } }
        : {}),
    };
    setNodes(revealMindNode([...nodes, n], n.id));
    setActive(n.id);
  };
  /** Collapse or expand a branch (gap E7); the toggled topic becomes the active one. */
  const toggle = (id: string) => {
    const next = toggleMindCollapse(nodes, id);
    setNodes(next);
    setActive(id);
  };
  const move = (key: string) => {
    if (!chosen) return;
    if (key === 'ArrowLeft' && chosen.parent) setActive(chosen.parent);
    else if (key === 'ArrowRight') {
      const child = nodes.find(n => n.parent === chosen.id);
      if (child) {
        if (chosen.collapsed) setNodes(revealMindNode(nodes, child.id));
        setActive(child.id);
      }
    } else {
      const order = nodes
        .filter(n => positions.has(n.id))
        .sort(
          (a, b) => positions.get(a.id)!.y - positions.get(b.id)!.y || positions.get(a.id)!.x - positions.get(b.id)!.x,
        );
      const sameColumn = order.filter(n => positions.get(n.id)!.x === p!.x),
        i = sameColumn.findIndex(n => n.id === active),
        next = sameColumn[key === 'ArrowUp' ? i - 1 : i + 1];
      if (next) setActive(next.id);
    }
  };
  const beginDrag = (id: string, e: React.PointerEvent<SVGElement | HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setActive(id);
    if (!nodes.find(n => n.id === id)?.parent) return;
    const base = nodes.map(n => ({ ...n, position: { ...basePositions.get(n.id)! } }));
    branchDrag.current = {
      id,
      x: e.clientX,
      y: e.clientY,
      ratio: item.w / svg.current!.getBoundingClientRect().width,
      scale,
      base,
      next: base,
      target: null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dragMove = (e: React.PointerEvent<SVGElement | HTMLButtonElement>) => {
    const drag = branchDrag.current;
    if (!drag || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.next = moveMindBranch(
      drag.base,
      drag.id,
      ((e.clientX - drag.x) * drag.ratio) / drag.scale,
      ((e.clientY - drag.y) * drag.ratio) / drag.scale,
    );
    const rect = svg.current!.getBoundingClientRect();
    const point = {
      x: ((e.clientX - rect.left) * drag.ratio - offX) / drag.scale - 8 + minX,
      y: ((e.clientY - rect.top) * drag.ratio - offY) / drag.scale - 8 + minY,
    };
    drag.target = e.ctrlKey || e.metaKey ? null : mindDropTarget(drag.base, drag.id, point, basePositions);
    setDragPreview({ id: drag.id, target: drag.target, positions: mindLayout(drag.next, false, style.layout) });
  };
  const dragEnd = (e: React.PointerEvent<SVGElement | HTMLButtonElement>) => {
    const drag = branchDrag.current;
    branchDrag.current = null;
    setDragPreview(null);
    if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= 5) {
      const target = e.ctrlKey || e.metaKey ? null : drag.target;
      const next = style.autoLayout === false ? drag.next : nodes;
      if (target || style.autoLayout === false)
        setNodes(next.map(n => (n.id === drag.id && target ? { ...n, parent: target } : n)));
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const cancelDrag = () => {
    branchDrag.current = null;
    setDragPreview(null);
  };
  return (
    <div
      className="mind-canvas-editor"
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => {
        if (e.target !== input.current && !(e.target as Element).closest('.mind-shape-row input')) e.preventDefault();
      }}
      onDoubleClick={e => e.stopPropagation()}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) finish();
      }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          if (branchDrag.current) {
            cancelDrag();
            return;
          }
          finish();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          add(false);
        } else if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          add(true);
        } else if (
          style.autoLayout === false &&
          e.altKey &&
          ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
          chosen
        ) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          setNodes(
            moveMindBranch(
              nodes,
              chosen.id,
              e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
              e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
            ),
          );
        } else if (
          ['ArrowUp', 'ArrowDown'].includes(e.key) ||
          (['ArrowLeft', 'ArrowRight'].includes(e.key) &&
            (e.altKey ||
              (input.current &&
                (e.key === 'ArrowLeft'
                  ? input.current.selectionStart === 0 && input.current.selectionEnd === 0
                  : input.current.selectionStart === input.current.value.length))))
        ) {
          e.preventDefault();
          move(e.key);
        } else if (
          chosen?.parent &&
          ((e.key === 'Delete' && (e.ctrlKey || e.metaKey)) ||
            (['Delete', 'Backspace'].includes(e.key) && !chosen.text))
        ) {
          e.preventDefault();
          const parent = chosen.parent;
          setNodes(removeBranch(nodes, chosen.id));
          setActive(parent);
        }
      }}
    >
      <svg ref={svg} width={item.w} height={item.h} aria-hidden="true" style={{ overflow: 'visible' }}>
        <g transform={`translate(${offX} ${offY}) scale(${scale}) translate(${8 - minX} ${8 - minY})`}>
          {nodes.map(n => {
            const q = positions.get(n.id),
              parent = n.parent ? positions.get(n.parent) : null,
              color = mindTopicColor(nodes, n.id, style.colorful),
              tinted = style.colorful || !!n.color;
            return (
              q && (
                <g
                  key={n.id}
                  data-topic={n.id}
                  onPointerDown={e => beginDrag(n.id, e)}
                  onPointerMove={dragMove}
                  onPointerUp={dragEnd}
                  onPointerCancel={cancelDrag}
                  onMouseDown={e => e.preventDefault()}
                  style={{ cursor: 'text' }}
                >
                  {parent && (
                    <path
                      d={mindBranchPath(style.branchStyle, parent, q, style.layout)}
                      fill="none"
                      stroke={color}
                      strokeWidth="2"
                    />
                  )}
                  {n.shape === 'underline' && (
                    <line
                      x1={q.x}
                      x2={q.x + MIND_NODE_W}
                      y1={q.y + MIND_NODE_H}
                      y2={q.y + MIND_NODE_H}
                      stroke={color}
                      strokeWidth="2.5"
                    />
                  )}
                  <rect
                    x={q.x}
                    y={q.y}
                    width={MIND_NODE_W}
                    height={MIND_NODE_H}
                    rx={mindShapeRx(n.shape)}
                    fill={
                      n.shape === 'underline'
                        ? 'transparent'
                        : n.parent
                          ? tinted
                            ? color + '22'
                            : '#edf0ff'
                          : (n.color ?? '#4262ff')
                    }
                    stroke={
                      dragPreview?.target === n.id
                        ? '#4262ff'
                        : n.id === active
                          ? '#25252c'
                          : n.parent && tinted
                            ? color
                            : 'none'
                    }
                    strokeDasharray={dragPreview?.target === n.id ? '5 3' : undefined}
                    strokeWidth={n.id === active ? 2 : 1}
                  />
                  {n.id !== active && (
                    <TopicLabel
                      node={n}
                      x={q.x + 12}
                      y={q.y}
                      fill={n.parent || n.shape === 'underline' ? '#25252c' : '#ffffff'}
                    />
                  )}
                </g>
              )
            );
          })}
        </g>
      </svg>
      {chosen && p && (
        <textarea
          ref={input}
          className="mind-canvas-input"
          aria-label="Topic text. Tab adds a child, Enter a sibling, arrows move, Esc finishes."
          maxLength={6000}
          value={chosen.text}
          style={{
            left: offX + (p.x - minX + 8) * scale,
            top: offY + (p.y - minY + 8) * scale,
            width: MIND_NODE_W * scale,
            height: MIND_NODE_H * scale,
            fontSize: Math.max(8, 14 * scale),
          }}
          onChange={e => setNodes(nodes.map(n => (n.id === active ? retextTopic(n, e.target.value) : n)))}
          onKeyDown={e => {
            // Ctrl+B / I / U / Shift+X: format the selected words (decision R5-Q4).
            const key = topicStyleKey(e);
            if (!key) return;
            e.preventDefault();
            e.stopPropagation();
            formatTopic(key);
          }}
        />
      )}
      {chosen && p && (
        // The same formatting as buttons; pressing them keeps the textarea's selection (the editor's mousedown
        // handler prevents the focus change).
        <div
          className="mind-format-bar floating"
          role="toolbar"
          aria-label="Topic text formatting"
          style={{ left: offX + (p.x - minX + 8) * scale, top: offY + (p.y - minY + 8) * scale - 34 }}
        >
          {(
            [
              ['bold', 'Bold (Ctrl+B)', <b key="b">B</b>],
              ['italic', 'Italic (Ctrl+I)', <i key="i">I</i>],
              ['underline', 'Underline (Ctrl+U)', <u key="u">U</u>],
              ['strike', 'Strikethrough (Ctrl+Shift+X)', <s key="s">S</s>],
            ] as const
          ).map(([key, label, glyph]) => (
            <button
              key={key}
              type="button"
              className="icon-button"
              aria-label={label}
              title={label}
              onClick={() => formatTopic(key)}
            >
              {glyph}
            </button>
          ))}
        </div>
      )}
      {nodes
        .filter(n => nodes.some(c => c.parent === n.id) && positions.has(n.id))
        .map(n => {
          const q = positions.get(n.id)!,
            down = style.layout === 'down';
          return (
            <button
              key={`fold-${n.id}`}
              className="mind-collapse-toggle"
              data-topic-toggle={n.id}
              aria-pressed={!!n.collapsed}
              aria-label={`${n.collapsed ? 'Expand' : 'Collapse'} branch: ${n.text || 'Untitled topic'}`}
              title={n.collapsed ? `Expand (${mindHiddenCount(nodes, n.id)} hidden)` : 'Collapse'}
              style={{
                left: offX + (q.x - minX + 8 + (down ? MIND_NODE_W / 2 : MIND_NODE_W / 2 + 12)) * scale,
                top: offY + (q.y - minY + 8 + (down ? MIND_NODE_H : MIND_NODE_H - 2)) * scale,
              }}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => toggle(n.id)}
            >
              {n.collapsed ? <Plus size={11} /> : <Minus size={11} />}
            </button>
          );
        })}
      {nodes
        .filter(n => n.parent && positions.has(n.id))
        .map(n => {
          const q = positions.get(n.id)!;
          return (
            <button
              key={n.id}
              className="mind-topic-handle"
              data-topic-handle={n.id}
              aria-label={`Move branch: ${n.text || 'Untitled topic'}`}
              style={{ left: offX + (q.x - minX + MIND_NODE_W) * scale, top: offY + (q.y - minY + 8) * scale }}
              onPointerDown={e => beginDrag(n.id, e)}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
              onPointerCancel={cancelDrag}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  setActive(n.id);
                  input.current?.focus();
                } else if (
                  style.autoLayout === false &&
                  e.altKey &&
                  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  const step = e.shiftKey ? 10 : 1;
                  setNodes(
                    moveMindBranch(
                      nodes,
                      n.id,
                      e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0,
                      e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0,
                    ),
                  );
                }
              }}
            >
              <GripVertical size={14} />
            </button>
          );
        })}
      {dragPreview && (
        <p className="mind-drag-status" role="status">
          {dragPreview.target
            ? `Attach to ${nodes.find(n => n.id === dragPreview.target)?.text || 'topic'}`
            : style.autoLayout === false
              ? 'Move branch · Ctrl keeps its parent'
              : 'Drop on a topic to attach'}
        </p>
      )}
      {chosen && (
        <div className="mind-shape-row" role="group" aria-label="Topic shape and link">
          {mindNodeShapes.map(s => (
            <button
              key={s}
              className={(chosen.shape ?? 'rounded') === s ? 'active' : ''}
              aria-pressed={(chosen.shape ?? 'rounded') === s}
              aria-label={`Topic shape ${mindShapeLabels[s]}`}
              onClick={() => setNodes(setMindTopic(nodes, chosen.id, { shape: s }))}
            >
              {mindShapeLabels[s]}
            </button>
          ))}
          <TopicLink
            key={chosen.id}
            value={chosen.link ?? ''}
            onCommit={link => {
              try {
                setNodes(setMindTopic(nodes, chosen.id, { link }));
                return true;
              } catch {
                return false;
              }
            }}
          />
          {chosen.link && (
            <a href={chosen.link} target="_blank" rel="noopener noreferrer" aria-label="Open topic link">
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}
      {chosen && (
        <div className="mind-color-row" role="group" aria-label="Topic colour">
          <button
            className={!chosen.color ? 'active' : ''}
            aria-pressed={!chosen.color}
            aria-label="Topic colour Automatic"
            title="Automatic colour"
            onClick={() => setNodes(setMindColor(nodes, chosen.id, ''))}
          >
            A
          </button>
          {mindPalette.map((c, index) => (
            <button
              key={c}
              className={chosen.color === c ? 'active' : ''}
              aria-pressed={chosen.color === c}
              aria-label={`Topic colour ${mindColorNames[index]}`}
              title={mindColorNames[index]}
              style={{ background: c }}
              onClick={() => setNodes(setMindColor(nodes, chosen.id, c))}
            />
          ))}
        </div>
      )}
      <p className="mind-canvas-hint">
        {style.autoLayout === false
          ? 'Drag grips or Alt + arrows to move · Ctrl keeps parent · Esc done'
          : 'Tab child · Enter sibling · Shift+Enter line break · Drag grips to attach · Esc done'}
      </p>
    </div>
  );
}
