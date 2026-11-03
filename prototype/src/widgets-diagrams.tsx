import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Rows3,
  Columns3,
  WrapText,
} from 'lucide-react';
import type { Item } from './model';
import type { WidgetView, WidgetCtx } from './widget-types';
import {
  layoutOrgChart,
  visibleOrgNodes,
  addChild,
  addSibling,
  removeNode,
  moveSibling,
  reparent,
  toggleCollapse,
  ORG_NODE_W,
  ORG_NODE_H,
} from './orgchart';
import type { OrgNode } from './orgchart';
import {
  addActivity,
  addRelease,
  rename,
  removeLane,
  addCard,
  removeCard,
  renameCard,
  cellCards,
  moveCard,
  shiftCard,
} from './storymap';
import type { StoryMap } from './storymap';
import { setLayoutOption, AUTOLAYOUT_HEADER } from './autolayout';
import type { AutoLayoutData } from './autolayout';
// Custom drag types: during a native drag only the type list is readable in dragover.
const STORY_MIME = 'application/x-boardroom-story',
  ORG_MIME = 'application/x-boardroom-person';
import { useLatest } from './use-latest';
import './widgets-diagrams.css';
import { CanvasOrg, CanvasStory } from './canvas-diagrams';

function useDialogFocus(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, [ref]);
}
/** Live editor shell: every change is already saved (one undo step each), so there is only Close. */
function Dialog({
  title,
  hint,
  onClose,
  error,
  children,
  wide,
}: {
  title: string;
  hint: string;
  onClose: () => void;
  error?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useDialogFocus(close);
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <div
        className={`format-editor diagram-editor ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            <p>{hint}</p>
          </div>
          <button
            ref={close}
            className="icon-button"
            aria-label={`Close ${title.toLowerCase()} editor`}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="diagram-editor-body">{children}</div>
        {error && (
          <p className="format-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span>Each change is saved as you make it and can be undone separately.</span>
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
/** Text input that keeps keystrokes local and commits once on blur or Enter (one undo step per field edit). */
function CommitInput({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
>) {
  const [text, setText] = useState(value),
    focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <input
      {...rest}
      value={text}
      onFocus={e => {
        focused.current = true;
        rest.onFocus?.(e);
      }}
      onChange={e => setText(e.target.value)}
      onBlur={e => {
        focused.current = false;
        commit();
        rest.onBlur?.(e);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape' && text !== value) {
          e.stopPropagation();
          setText(value);
        }
        rest.onKeyDown?.(e);
      }}
    />
  );
}
/** The current version of the item on the board; closes the editor when it was deleted or undone away. */
function useLiveItem(item: Item, ctx: WidgetCtx, onClose: () => void) {
  const live = ctx.board.items.find(i => i.id === item.id && i.type === item.type),
    exists = !!live,
    closeRef = useLatest(onClose);
  useEffect(() => {
    if (!exists) closeRef.current();
  }, [exists, closeRef]);
  return live;
}

// ---- Org chart (item 35) --------------------------------------------------------------------
function OrgDiagram({
  nodes,
  width,
  height,
  active,
}: {
  nodes: OrgNode[];
  width: number;
  height: number;
  active?: string;
}) {
  const visible = visibleOrgNodes(nodes),
    { positions, width: w, height: h } = layoutOrgChart(nodes);
  const hidden = (id: string) => {
    let count = 0;
    const walk = (p: string) =>
      nodes
        .filter(n => n.parent === p)
        .forEach(c => {
          count++;
          walk(c.id);
        });
    walk(id);
    return count;
  };
  return (
    <svg
      width={width}
      height={height}
      viewBox={`-12 -12 ${w + 24} ${h + 24}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Org chart"
    >
      {visible
        .filter(n => n.parent && positions.has(n.parent))
        .map(n => {
          const a = positions.get(n.parent!)!,
            b = positions.get(n.id)!,
            midY = a.y + ORG_NODE_H + 28;
          return (
            <path
              key={`l${n.id}`}
              d={`M${a.x + ORG_NODE_W / 2} ${a.y + ORG_NODE_H} V${midY} H${b.x + ORG_NODE_W / 2} V${b.y}`}
              fill="none"
              stroke="#a1a1aa"
              strokeWidth="1.5"
            />
          );
        })}
      {visible.map(n => {
        const p = positions.get(n.id)!,
          more = n.collapsed ? hidden(n.id) : 0;
        return (
          <g key={n.id}>
            <rect
              x={p.x}
              y={p.y}
              width={ORG_NODE_W}
              height={ORG_NODE_H}
              rx="8"
              fill={n.parent ? '#ffffff' : '#edf0ff'}
              stroke={n.id === active ? '#4262ff' : '#d4d4da'}
              strokeWidth={n.id === active ? 2.5 : 1.2}
            />
            <text x={p.x + 12} y={p.y + 26} fontSize="14" fontWeight="600" fill="#25252c">
              {n.name.length > 20 ? n.name.slice(0, 19) + '…' : n.name || 'Unnamed'}
            </text>
            <text x={p.x + 12} y={p.y + 46} fontSize="12" fill="#696973">
              {n.role.length > 24 ? n.role.slice(0, 23) + '…' : n.role}
            </text>
            {more > 0 && (
              <g>
                <rect
                  x={p.x + ORG_NODE_W / 2 - 18}
                  y={p.y + ORG_NODE_H - 8}
                  width="36"
                  height="16"
                  rx="8"
                  fill="#4262ff"
                />
                <text x={p.x + ORG_NODE_W / 2} y={p.y + ORG_NODE_H + 4} fontSize="10" fill="#fff" textAnchor="middle">
                  +{more}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
function orgOrder(nodes: OrgNode[]): { node: OrgNode; depth: number }[] {
  const out: { node: OrgNode; depth: number }[] = [],
    visit = (n: OrgNode, depth: number) => {
      out.push({ node: n, depth });
      nodes.filter(c => c.parent === n.id).forEach(c => visit(c, depth + 1));
    };
  const root = nodes.find(n => n.parent === null);
  if (root) visit(root, 0);
  return out;
}
function OrgEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const live = useLiveItem(item, ctx, onClose),
    liveNodes: OrgNode[] | undefined = live?.data?.nodes,
    nodes = useMemo(() => liveNodes ?? [], [liveNodes]);
  const [active, setActive] = useState(nodes[0]?.id ?? ''),
    [error, setError] = useState(''),
    [drag, setDrag] = useState<string | null>(null),
    list = useRef<HTMLOListElement>(null),
    focusAfter = useRef<string | null>(null);
  const chosen = nodes.find(n => n.id === active);
  useEffect(() => {
    if (!chosen && nodes[0]) setActive(nodes[0].id);
  }, [chosen, nodes]);
  /** Validate against the current nodes, then save as one undo step. */
  const run = (fn: () => OrgNode[] | { nodes: OrgNode[]; id: string }) => {
    try {
      const r = fn(),
        next = Array.isArray(r) ? r : r.nodes;
      if (!Array.isArray(r)) setActive(r.id);
      setError('');
      if (next !== nodes)
        ctx.update(b => ({
          ...b,
          items: b.items.map(i => (i.id === item.id ? { ...i, data: { ...i.data, nodes: next } } : i)),
        }));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const setField = (field: 'name' | 'role', value: string) =>
    run(() => nodes.map(n => (n.id === active ? { ...n, [field]: value.slice(0, 200) } : n)));
  useLayoutEffect(() => {
    if (focusAfter.current) {
      list.current?.querySelector<HTMLElement>(`[data-node="${focusAfter.current}"]`)?.focus();
      focusAfter.current = null;
    }
  });
  const keyMove = (e: React.KeyboardEvent, n: OrgNode) => {
    if (!e.altKey) return;
    const siblings = nodes.filter(s => s.parent === n.parent),
      i = siblings.indexOf(n),
      parent = nodes.find(p => p.id === n.parent);
    const action = {
      ArrowUp: () => moveSibling(nodes, n.id, -1),
      ArrowDown: () => moveSibling(nodes, n.id, 1),
      ArrowLeft: () => (parent?.parent ? reparent(nodes, n.id, parent.parent, null) : nodes),
      ArrowRight: () => (i > 0 ? reparent(nodes, n.id, siblings[i - 1].id, null) : nodes),
    }[e.key as 'ArrowUp'];
    if (!action) return;
    e.preventDefault();
    focusAfter.current = n.id;
    run(action);
  };
  if (!live) return null;
  return (
    <Dialog
      title="Org chart"
      hint="Drag a person onto someone to make them their report. Alt + arrows reorder and indent. Every change can be undone."
      onClose={onClose}
      error={error}
      wide
    >
      <section className="org-side">
        <ol ref={list} className="org-list" role="listbox" aria-label="People">
          {orgOrder(nodes).map(({ node: n, depth }) => (
            <li
              key={n.id}
              data-node={n.id}
              role="option"
              tabIndex={0}
              draggable={n.parent !== null}
              aria-selected={n.id === active}
              className={`${n.id === active ? 'active' : ''} ${drag && drag !== n.id ? 'droppable' : ''}`}
              style={{ paddingLeft: 10 + depth * 18 }}
              onClick={() => setActive(n.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActive(n.id);
                }
                keyMove(e, n);
              }}
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(ORG_MIME, n.id);
                e.dataTransfer.setData('text/plain', n.name);
                setTimeout(() => setDrag(n.id));
              }}
              onDragEnd={() => setDrag(null)}
              onDragOver={e => {
                if (drag !== n.id && (drag || e.dataTransfer.types.includes(ORG_MIME))) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={e => {
                e.preventDefault();
                const id = drag ?? e.dataTransfer.getData(ORG_MIME);
                if (id && id !== n.id) {
                  focusAfter.current = id;
                  run(() => reparent(nodes, id, n.id, null));
                }
                setDrag(null);
              }}
            >
              <span>{n.name || 'Unnamed'}</span>
              <small>{n.role}</small>
              {n.collapsed && <em>collapsed</em>}
            </li>
          ))}
        </ol>
        {chosen && (
          <div className="org-fields">
            <label>
              Name
              <CommitInput
                key={`name-${active}`}
                aria-label="Person name"
                maxLength={200}
                value={chosen.name}
                onCommit={v => setField('name', v)}
              />
            </label>
            <label>
              Role
              <CommitInput
                key={`role-${active}`}
                aria-label="Person role"
                maxLength={200}
                value={chosen.role}
                onCommit={v => setField('role', v)}
              />
            </label>
            <div className="format-actions wrap">
              <button onClick={() => run(() => addChild(nodes, active))}>
                <Plus size={15} />
                Add report
              </button>
              <button disabled={!chosen.parent} onClick={() => run(() => addSibling(nodes, active, 'before'))}>
                Sibling before
              </button>
              <button disabled={!chosen.parent} onClick={() => run(() => addSibling(nodes, active, 'after'))}>
                Sibling after
              </button>
              <button
                disabled={!chosen.parent}
                aria-label="Move earlier"
                onClick={() => run(() => moveSibling(nodes, active, -1))}
              >
                <ArrowUp size={15} />
              </button>
              <button
                disabled={!chosen.parent}
                aria-label="Move later"
                onClick={() => run(() => moveSibling(nodes, active, 1))}
              >
                <ArrowDown size={15} />
              </button>
              <button
                disabled={!nodes.some(n => n.parent === active)}
                onClick={() => run(() => toggleCollapse(nodes, active))}
              >
                {chosen.collapsed ? (
                  <>
                    <ChevronsUpDown size={15} />
                    Expand
                  </>
                ) : (
                  <>
                    <ChevronsDownUp size={15} />
                    Collapse
                  </>
                )}
              </button>
              <button
                disabled={!chosen.parent}
                onClick={() => {
                  const parent = chosen.parent!;
                  run(() => removeNode(nodes, active));
                  setActive(parent);
                }}
              >
                <Trash2 size={15} />
                Remove
              </button>
            </div>
            <p className="format-hint">{nodes.length} / 200 people</p>
          </div>
        )}
      </section>
      <div className="diagram-live org-live">
        <OrgDiagram nodes={nodes} width={560} height={420} active={active} />
      </div>
    </Dialog>
  );
}

// ---- Story map (item 36) ---------------------------------------------------------------------
function StoryEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const live = useLiveItem(item, ctx, onClose),
    map = live?.data as StoryMap | undefined;
  const [selected, setSelected] = useState<string | null>(null),
    [drag, setDrag] = useState<string | null>(null),
    [error, setError] = useState(''),
    grid = useRef<HTMLDivElement>(null),
    focusAfter = useRef<string | null>(null);
  /** Validate against the current map, then save as one undo step. */
  const run = (fn: (m: StoryMap) => StoryMap) => {
    if (!map) return;
    try {
      const next = fn(map);
      setError('');
      if (next !== map)
        ctx.update(b => ({ ...b, items: b.items.map(i => (i.id === item.id ? { ...i, data: next } : i)) }));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  useLayoutEffect(() => {
    if (focusAfter.current) {
      grid.current?.querySelector<HTMLElement>(`[data-story="${focusAfter.current}"]`)?.focus();
      focusAfter.current = null;
    }
  });
  if (!map) return null;
  const card = map.cards.find(c => c.id === selected);
  return (
    <Dialog
      title="User story map"
      hint="Drag stories between cells, or focus a story and press Alt + arrow keys. Every change can be undone."
      onClose={onClose}
      error={error}
      wide
    >
      <div className="story-toolbar">
        <button onClick={() => run(addActivity)}>
          <Plus size={15} />
          Activity
        </button>
        <button onClick={() => run(addRelease)}>
          <Plus size={15} />
          Release
        </button>
        <span>{map.cards.length} stories</span>
        {card && (
          <label className="story-selected">
            Selected story
            <CommitInput
              key={`story-${card.id}`}
              aria-label="Story title"
              maxLength={1000}
              value={card.title}
              onCommit={v => run(m => renameCard(m, card.id, v))}
            />
            <button
              className="icon-button"
              aria-label="Delete story"
              onClick={() => {
                run(m => removeCard(m, card.id));
                setSelected(null);
              }}
            >
              <Trash2 size={15} />
            </button>
          </label>
        )}
      </div>
      <div
        ref={grid}
        className="story-grid"
        style={{ gridTemplateColumns: `140px repeat(${map.activities.length}, minmax(150px, 1fr))` }}
      >
        <div className="story-corner" />
        {map.activities.map(a => (
          <div key={a.id} className="story-activity">
            <CommitInput
              aria-label="Activity title"
              maxLength={200}
              value={a.title}
              onCommit={v => run(m => rename(m, 'activity', a.id, v))}
            />
            <small>{map.cards.filter(c => c.activity === a.id).length}</small>
            <button
              className="icon-button"
              aria-label={`Remove activity ${a.title}`}
              disabled={map.activities.length === 1}
              onClick={() => run(m => removeLane(m, 'activity', a.id))}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {map.releases.map(r => (
          <React.Fragment key={r.id}>
            <div className="story-release">
              <CommitInput
                aria-label="Release title"
                maxLength={200}
                value={r.title}
                onCommit={v => run(m => rename(m, 'release', r.id, v))}
              />
              <small>{map.cards.filter(c => c.release === r.id).length} stories</small>
              <button
                className="icon-button"
                aria-label={`Remove release ${r.title}`}
                disabled={map.releases.length === 1}
                onClick={() => run(m => removeLane(m, 'release', r.id))}
              >
                <Trash2 size={13} />
              </button>
            </div>
            {map.activities.map(a => {
              const cards = cellCards(map, a.id, r.id);
              return (
                <div
                  key={a.id}
                  className="story-cell"
                  aria-label={`${a.title} · ${r.title}`}
                  onDragOver={e => {
                    if (drag || e.dataTransfer.types.includes(STORY_MIME)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    const id = drag ?? e.dataTransfer.getData(STORY_MIME);
                    if (id) {
                      focusAfter.current = id;
                      run(m => moveCard(m, id, a.id, r.id, null));
                    }
                    setDrag(null);
                  }}
                >
                  {cards.map(c => (
                    <div
                      key={c.id}
                      data-story={c.id}
                      className={`story-card ${selected === c.id ? 'active' : ''} ${drag === c.id ? 'dragging' : ''}`}
                      tabIndex={0}
                      draggable
                      role="button"
                      aria-label={`${c.title}. Alt plus arrow keys move this story.`}
                      onClick={() => setSelected(c.id)}
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData(STORY_MIME, c.id);
                        e.dataTransfer.setData('text/plain', c.title);
                        setTimeout(() => setDrag(c.id));
                      }}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={e => {
                        if (drag !== c.id && (drag || e.dataTransfer.types.includes(STORY_MIME))) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                        }
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const id = drag ?? e.dataTransfer.getData(STORY_MIME);
                        if (id && id !== c.id) {
                          focusAfter.current = id;
                          run(m => moveCard(m, id, a.id, r.id, c.id));
                        }
                        setDrag(null);
                      }}
                      onKeyDown={e => {
                        const dir = (
                          { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
                        )[e.key as 'ArrowUp'];
                        if (e.key === 'Enter') setSelected(c.id);
                        if (!e.altKey || !dir) return;
                        e.preventDefault();
                        focusAfter.current = c.id;
                        run(m => shiftCard(m, c.id, dir));
                      }}
                    >
                      {c.title || 'Untitled story'}
                    </div>
                  ))}
                  {!cards.length && <span className="story-placeholder">Drop stories here</span>}
                  <button
                    className="story-add"
                    aria-label={`Add story to ${a.title}, ${r.title}`}
                    onClick={() => {
                      try {
                        const n = addCard(map, a.id, r.id);
                        setSelected(n.id);
                        setError('');
                        ctx.update(b => ({
                          ...b,
                          items: b.items.map(i => (i.id === item.id ? { ...i, data: n.map } : i)),
                        }));
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </Dialog>
  );
}
// ---- Views -------------------------------------------------------------------------------------
export const diagramViews: WidgetView[] = [
  {
    kind: 'orgchart',
    interactive: true,
    mode: 'html',
    Editor: OrgEditor,
    Render: ({ item, ctx }) => <CanvasOrg item={item} ctx={ctx} />,
  },
  { kind: 'storymap', mode: 'html', interactive: true, Editor: StoryEditor, Render: CanvasStory },
  {
    kind: 'autolayout',
    mode: 'svg',
    textEdit: true,
    Render: ({ item, ctx }) => {
      const d = item.data as AutoLayoutData | undefined;
      return (
        <g>
          <rect
            width={item.w}
            height={item.h}
            rx="10"
            fill="#fafafb"
            fillOpacity=".6"
            stroke={ctx.selected ? '#4262ff' : '#a1a1aa'}
            strokeDasharray="6 4"
            strokeWidth={1.5 / ctx.zoom}
          />
          <text x="12" y={AUTOLAYOUT_HEADER / 2 + 5} fontSize="13" fill="#52525b" fontWeight="600">
            {item.text || 'Auto layout'}
          </text>
          <text x={item.w - 12} y={AUTOLAYOUT_HEADER / 2 + 5} fontSize="11" fill="#8a8a94" textAnchor="end">
            {d
              ? `${d.direction === 'row' ? 'Row' : 'Column'}${d.wrap && d.direction === 'row' ? ' · wrap' : ''} · ${d.children.length}`
              : ''}
          </text>
          {d && !d.children.length && (
            <text x={item.w / 2} y={item.h / 2 + 10} fontSize="13" fill="#a1a1aa" textAnchor="middle">
              Drag objects here to arrange them
            </text>
          )}
        </g>
      );
    },
    actions: (item, ctx) => {
      const d = item.data as AutoLayoutData;
      return [
        {
          label: d.direction === 'row' ? 'Switch to column' : 'Switch to row',
          icon: d.direction === 'row' ? <Rows3 size={17} /> : <Columns3 size={17} />,
          run: () =>
            ctx.update(b => setLayoutOption(b, item.id, { direction: d.direction === 'row' ? 'column' : 'row' })),
        },
        {
          label: 'Wrap into rows',
          icon: <WrapText size={17} />,
          pressed: d.wrap,
          disabled: d.direction === 'column',
          run: () => ctx.update(b => setLayoutOption(b, item.id, { wrap: !d.wrap })),
        },
        {
          label: `Gap ${d.gap} px — change`,
          icon: <span className="gap-chip">{d.gap}</span>,
          run: () => {
            const steps = [8, 16, 24, 40];
            ctx.update(b => setLayoutOption(b, item.id, { gap: steps[(steps.indexOf(d.gap) + 1) % steps.length] }));
          },
        },
      ];
    },
  },
];
