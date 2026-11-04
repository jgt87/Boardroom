import { useState } from 'react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { CanvasField, canvasControl } from './canvas-fields';
import {
  layoutOrgChart,
  visibleOrgNodes,
  addChild,
  addSibling,
  removeNode,
  reparent,
  toggleCollapse,
  ORG_NODE_W,
  ORG_NODE_H,
} from './orgchart';
import type { OrgNode } from './orgchart';
import { orgMeta } from './orgchart';
import { addActivity, addRelease, addCard, removeCard, renameCard, rename, cellCards, moveCard } from './storymap';
import type { StoryMap } from './storymap';
const PERSON = 'application/x-boardroom-person',
  STORY = 'application/x-boardroom-story';

export function CanvasOrg({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const nodes = (item.data?.nodes ?? []) as OrgNode[];
  const [active, setActive] = useState(nodes[0]?.id ?? '');
  const { positions, width, height } = layoutOrgChart(nodes);
  const run = (fn: (nodes: OrgNode[]) => OrgNode[]) => {
    if (item.locked) return;
    try {
      ctx.update(b => ({
        ...b,
        items: b.items.map(i => (i.id === item.id ? { ...i, data: { ...i.data, nodes: fn(i.data!.nodes) } } : i)),
      }));
    } catch (e) {
      ctx.display((e as Error).message);
    }
  };
  const chosen = nodes.find(n => n.id === active);
  return (
    <div className="rich-object canvas-interactive" onDoubleClick={e => e.stopPropagation()}>
      <div className="rich-title canvas-widget-header">
        <span>{item.text || 'Org chart'}</span>
        <div {...canvasControl}>
          <button
            disabled={!!item.locked || !chosen}
            onClick={() =>
              run(v => {
                const result = addChild(v, active);
                setActive(result.id);
                return result.nodes;
              })
            }
          >
            + Person
          </button>
          <button
            disabled={!!item.locked || !chosen?.parent}
            onClick={() =>
              run(v => {
                const result = addSibling(v, active, 'after');
                setActive(result.id);
                return result.nodes;
              })
            }
          >
            + Sibling
          </button>
          <button disabled={!!item.locked || !chosen} onClick={() => run(v => toggleCollapse(v, active))}>
            Collapse / expand
          </button>
          <button
            disabled={!!item.locked || !chosen?.parent}
            onClick={() => {
              run(v => removeNode(v, active));
              setActive(nodes[0].id);
            }}
          >
            Delete person
          </button>
        </div>
      </div>
      <svg
        width="100%"
        height={Math.max(60, item.h - 48)}
        viewBox={`-12 -12 ${width + 24} ${height + 24}`}
        aria-label="Editable org chart"
      >
        {visibleOrgNodes(nodes).map(n => {
          const p = positions.get(n.id)!,
            parent = n.parent ? positions.get(n.parent) : null;
          return (
            <g key={n.id}>
              {parent && (
                <path
                  d={`M${parent.x + ORG_NODE_W / 2},${parent.y + ORG_NODE_H} V${p.y - 20} H${p.x + ORG_NODE_W / 2} V${p.y}`}
                  fill="none"
                  stroke="#a1a1aa"
                />
              )}
              <foreignObject x={p.x} y={p.y} width={ORG_NODE_W} height={ORG_NODE_H + 10}>
                <div
                  className={`canvas-person ${active === n.id ? 'active' : ''}`}
                  data-person={n.id}
                  draggable={!item.locked && !!n.parent}
                  {...canvasControl}
                  onPointerDownCapture={() => setActive(n.id)}
                  onDragStart={e => {
                    e.stopPropagation();
                    e.dataTransfer.setData(PERSON, n.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={e => {
                    if (!item.locked && e.dataTransfer.types.includes(PERSON)) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  onDrop={e => {
                    if (item.locked) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const id = e.dataTransfer.getData(PERSON);
                    if (id) run(v => reparent(v, id, n.id));
                  }}
                >
                  {item.locked ? (
                    <>
                      <strong>{n.name}</strong>
                      <span>{n.role}</span>
                      {(n.team || n.location) && <small className="canvas-person-meta">{orgMeta(n)}</small>}
                    </>
                  ) : (
                    <>
                      <CanvasField
                        label={`Person name: ${n.name}`}
                        value={n.name}
                        onCommit={name =>
                          run(v => v.map(p => (p.id === n.id ? { ...p, name: name.slice(0, 200) } : p)))
                        }
                      />
                      <CanvasField
                        label={`Person role: ${n.name}`}
                        value={n.role}
                        onCommit={role =>
                          run(v => v.map(p => (p.id === n.id ? { ...p, role: role.slice(0, 200) } : p)))
                        }
                      />
                      {(n.team || n.location) && <small className="canvas-person-meta">{orgMeta(n)}</small>}
                    </>
                  )}
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function CanvasStory({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const m = item.data as StoryMap;
  const run = (fn: (m: StoryMap) => StoryMap) => {
    if (item.locked) return;
    try {
      ctx.update(b => ({
        ...b,
        items: b.items.map(i => (i.id === item.id ? { ...i, data: fn(i.data as StoryMap) } : i)),
      }));
    } catch (e) {
      ctx.display((e as Error).message);
    }
  };
  return (
    <div className="rich-object canvas-interactive" onDoubleClick={e => e.stopPropagation()}>
      <div className="rich-title canvas-widget-header">
        <span>{item.text || 'User story map'}</span>
        <div {...canvasControl}>
          <button disabled={!!item.locked} onClick={() => run(addActivity)}>
            + Activity
          </button>
          <button disabled={!!item.locked} onClick={() => run(addRelease)}>
            + Release
          </button>
        </div>
      </div>
      <div className="canvas-story-body" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
        <div
          className="story-mini"
          style={{ gridTemplateColumns: `110px repeat(${m.activities.length}, minmax(160px,1fr))` }}
        >
          <span />
          {m.activities.map(a => (
            <b key={a.id}>
              {item.locked ? (
                a.title
              ) : (
                <CanvasField
                  label={`Activity: ${a.title}`}
                  value={a.title}
                  onCommit={title => run(v => rename(v, 'activity', a.id, title))}
                />
              )}
            </b>
          ))}
          {m.releases.map(r => (
            <div key={r.id} style={{ display: 'contents' }}>
              <em>
                {item.locked ? (
                  r.title
                ) : (
                  <CanvasField
                    label={`Release: ${r.title}`}
                    value={r.title}
                    onCommit={title => run(v => rename(v, 'release', r.id, title))}
                  />
                )}
              </em>
              {m.activities.map(a => (
                <div
                  key={a.id}
                  className="canvas-story-cell"
                  aria-label={`${a.title} / ${r.title}`}
                  onDragOver={e => {
                    if (!item.locked && e.dataTransfer.types.includes(STORY)) e.preventDefault();
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = e.dataTransfer.getData(STORY);
                    if (id) run(v => moveCard(v, id, a.id, r.id, null));
                  }}
                >
                  {cellCards(m, a.id, r.id).map(c => (
                    <div
                      key={c.id}
                      className="canvas-story-card"
                      data-story={c.id}
                      draggable={!item.locked}
                      onDragStart={e => {
                        e.dataTransfer.setData(STORY, c.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      {item.locked ? (
                        c.title
                      ) : (
                        <CanvasField
                          multiline
                          label={`Story: ${c.title}`}
                          value={c.title}
                          onCommit={title => run(v => renameCard(v, c.id, title))}
                        />
                      )}
                      {!item.locked && (
                        <button aria-label={`Delete story: ${c.title}`} onClick={() => run(v => removeCard(v, c.id))}>
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                  <button disabled={!!item.locked} onClick={() => run(v => addCard(v, a.id, r.id).map)}>
                    + Story
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
