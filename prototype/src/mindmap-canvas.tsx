import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Item, MindNode } from './model';
import { removeBranch } from './model';
import { mindLayout, mindBranchPath, mindBranchColor, mindStyleOf, MIND_NODE_W, MIND_NODE_H } from './mindmap-style';

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
  const input = useRef<HTMLInputElement>(null),
    done = useRef(false),
    latest = useRef(nodes);
  latest.current = nodes;
  const style = mindStyleOf(item),
    positions = mindLayout(nodes),
    xs = [...positions.values()];
  const vbW = Math.max(0, ...xs.map(p => p.x)) + MIND_NODE_W + 16,
    vbH = Math.max(0, ...xs.map(p => p.y)) + MIND_NODE_H + 22;
  const scale = Math.min(item.w / vbW, item.h / vbH),
    offX = (item.w - vbW * scale) / 2,
    offY = (item.h - vbH * scale) / 2;
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
  useEffect(
    () => () => {
      if (!done.current) {
        done.current = true;
        onCommit(latest.current);
      }
    },
    [],
  );
  const chosen = nodes.find(n => n.id === active),
    p = positions.get(active);
  const add = (sibling: boolean) => {
    if (!chosen || nodes.length >= 200) return;
    const n = {
      id: crypto.randomUUID(),
      parent: sibling && chosen.parent ? chosen.parent : chosen.id,
      text: 'New topic',
    };
    setNodes([...nodes, n]);
    setActive(n.id);
  };
  const move = (key: string) => {
    if (!chosen) return;
    if (key === 'ArrowLeft' && chosen.parent) setActive(chosen.parent);
    else if (key === 'ArrowRight') {
      const child = nodes.find(n => n.parent === chosen.id);
      if (child) setActive(child.id);
    } else {
      const order = [...nodes].sort(
        (a, b) => positions.get(a.id)!.y - positions.get(b.id)!.y || positions.get(a.id)!.x - positions.get(b.id)!.x,
      );
      const sameColumn = order.filter(n => positions.get(n.id)!.x === p!.x),
        i = sameColumn.findIndex(n => n.id === active),
        next = sameColumn[key === 'ArrowUp' ? i - 1 : i + 1];
      if (next) setActive(next.id);
    }
  };
  return (
    <div
      className="mind-canvas-editor"
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => {
        if (e.target !== input.current) e.preventDefault();
      }}
      onDoubleClick={e => e.stopPropagation()}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) finish();
      }}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finish();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          add(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          add(true);
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
      <svg width={item.w} height={item.h} aria-hidden="true">
        <g transform={`translate(${offX} ${offY}) scale(${scale}) translate(8 8)`}>
          {nodes.map(n => {
            const q = positions.get(n.id),
              parent = n.parent ? positions.get(n.parent) : null,
              color = mindBranchColor(nodes, n.id, style.colorful);
            return (
              q && (
                <g
                  key={n.id}
                  onPointerDown={e => {
                    e.preventDefault();
                    setActive(n.id);
                  }}
                  onMouseDown={e => e.preventDefault()}
                  style={{ cursor: 'text' }}
                >
                  {parent && (
                    <path d={mindBranchPath(style.branchStyle, parent, q)} fill="none" stroke={color} strokeWidth="2" />
                  )}
                  <rect
                    x={q.x}
                    y={q.y}
                    width={MIND_NODE_W}
                    height={MIND_NODE_H}
                    rx="9"
                    fill={n.parent ? (style.colorful ? color + '22' : '#edf0ff') : '#4262ff'}
                    stroke={n.id === active ? '#25252c' : n.parent && style.colorful ? color : 'none'}
                    strokeWidth={n.id === active ? 2 : 1}
                  />
                  {n.id !== active && (
                    <text x={q.x + 12} y={q.y + 29} fill={n.parent ? '#25252c' : '#ffffff'} fontSize="14">
                      {n.text.length > 22 ? n.text.slice(0, 21) + '…' : n.text || 'Untitled topic'}
                    </text>
                  )}
                </g>
              )
            );
          })}
        </g>
      </svg>
      {chosen && p && (
        <input
          ref={input}
          className="mind-canvas-input"
          aria-label="Topic text. Tab adds a child, Enter a sibling, arrows move, Esc finishes."
          maxLength={6000}
          value={chosen.text}
          style={{
            left: offX + (p.x + 8) * scale,
            top: offY + (p.y + 8) * scale,
            width: MIND_NODE_W * scale,
            height: MIND_NODE_H * scale,
            fontSize: Math.max(8, 14 * scale),
          }}
          onChange={e => setNodes(nodes.map(n => (n.id === active ? { ...n, text: e.target.value } : n)))}
        />
      )}
      <p className="mind-canvas-hint">Tab child · Enter sibling · arrows move · Ctrl+Delete removes · Esc done</p>
    </div>
  );
}
