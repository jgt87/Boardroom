import React, { useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, GripVertical, Trash2 } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx } from './widget-types';
import { CanvasField, canvasControl } from './canvas-fields';
import { validateWidget } from './widget-specs';
import {
  addStage,
  removeStage,
  renameStage,
  moveStage,
  addLane,
  removeLane,
  renameLane,
  setCell,
  setEmotion,
  cellKey,
  addPlannerCard,
  updatePlannerCard,
  removePlannerCard,
  movePlannerCard,
  shiftPlannerCard,
  addPlannerDependency,
  removePlannerDependency,
  cellPoints,
  addTeam,
  addIteration,
  renameAxis,
  removeAxis,
  rankedIds,
  moveRank,
  moveRankBefore,
  addRankItem,
  removeRankItem,
  TITLE_MAX,
  moveJourneyContent,
  lateDependencies,
} from './engage';
import type { JourneyData, PlannerData, RankingData } from './engage';
import './canvas-engage.css';

function changeData<T>(item: Item, ctx: WidgetCtx, change: (value: T) => T) {
  if (item.locked) return;
  ctx.update(board => {
    const current = board.items.find(i => i.id === item.id);
    if (!current || current.locked) return board;
    const next = { ...current, data: change(current.data as T) as Record<string, unknown> };
    validateWidget(next);
    return { ...board, items: board.items.map(i => (i.id === item.id ? next : i)) };
  });
}
function Header({ item, children }: { item: Item; ctx: WidgetCtx; children?: React.ReactNode }) {
  return (
    <div className="canvas-advanced-header canvas-widget-header">
      <span>{item.text || item.type}</span>
      <div {...canvasControl}>
        <fieldset disabled={!!item.locked}>{children}</fieldset>
      </div>
    </div>
  );
}
const dropAllowed = (e: React.DragEvent, mime: string, locked?: boolean) => {
  if (!locked && [...e.dataTransfer.types].includes(mime)) {
    e.preventDefault();
    e.stopPropagation();
  }
};
function payload(e: React.DragEvent, mime: string, item: Item): Record<string, string> | null {
  if (item.locked) return null;
  const text = e.dataTransfer.getData(mime);
  if (!text || text.length > 2000) return null;
  try {
    const data = JSON.parse(text);
    return data?.widget === item.id ? data : null;
  } catch {
    return null;
  }
}
const PLANNER = 'application/x-boardroom-planner-card';
function PlannerDependencies({
  data,
  root,
  zoom,
  id,
}: {
  data: PlannerData;
  root: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  id: string;
}) {
  const [layout, setLayout] = useState<{
    width: number;
    height: number;
    cards: Map<string, { x: number; y: number; w: number; h: number }>;
  } | null>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const origin = el.getBoundingClientRect(),
        cards = new Map<string, { x: number; y: number; w: number; h: number }>();
      for (const card of el.querySelectorAll<HTMLElement>('[data-planner-card]')) {
        const r = card.getBoundingClientRect();
        cards.set(card.dataset.plannerCard!, {
          x: (r.left - origin.left) / zoom,
          y: (r.top - origin.top) / zoom,
          w: r.width / zoom,
          h: r.height / zoom,
        });
      }
      setLayout({ width: el.scrollWidth, height: el.scrollHeight, cards });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const card of el.querySelectorAll<HTMLElement>('[data-planner-card]')) observer.observe(card);
    return () => observer.disconnect();
  }, [data, root, zoom]);
  if (!layout) return null;
  const late = new Set(lateDependencies(data).map(dep => `${dep.from}>${dep.to}`));
  return (
    <svg className="canvas-planner-dependencies" width={layout.width} height={layout.height} aria-hidden="true">
      <defs>
        <marker
          id={`canvas-planner-head-${id}`}
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={6}
          markerHeight={6}
          orient="auto"
        >
          <path d="M0 0 L10 5 L0 10Z" fill="#5a5a66" />
        </marker>
      </defs>
      {data.dependencies.map(dep => {
        const a = layout.cards.get(dep.from),
          b = layout.cards.get(dep.to);
        if (!a || !b) return null;
        const x1 = a.x + a.w,
          y1 = a.y + a.h / 2,
          x2 = b.x,
          y2 = b.y + b.h / 2;
        return (
          <path
            key={`${dep.from}>${dep.to}`}
            data-planner-dependency={`${dep.from}>${dep.to}`}
            d={`M${x1} ${y1} C${x1 + 28} ${y1} ${x2 - 28} ${y2} ${x2} ${y2}`}
            fill="none"
            stroke={late.has(`${dep.from}>${dep.to}`) ? '#e5484d' : '#5a5a66'}
            strokeWidth={1.5}
            strokeDasharray={late.has(`${dep.from}>${dep.to}`) ? '4 3' : undefined}
            markerEnd={`url(#canvas-planner-head-${id})`}
          />
        );
      })}
    </svg>
  );
}
export function CanvasPlanner({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const grid = useRef<HTMLDivElement>(null);
  const focusAfter = useRef<string | null>(null);
  const d = item.data as PlannerData,
    set = (fn: (value: PlannerData) => PlannerData) => changeData(item, ctx, fn);
  useLayoutEffect(() => {
    if (!focusAfter.current) return;
    [...(grid.current?.querySelectorAll<HTMLElement>('[data-planner-card]') ?? [])]
      .find(el => el.dataset.plannerCard === focusAfter.current)
      ?.focus();
    focusAfter.current = null;
  }, [d]);
  const drop = (e: React.DragEvent, team: string, iteration: string, before: string | null = null) => {
    const value = payload(e, PLANNER, item);
    if (!value) return;
    e.preventDefault();
    e.stopPropagation();
    if (d.cards.some(c => c.id === value.id)) set(x => movePlannerCard(x, value.id, team, iteration, before));
  };
  return (
    <div className="canvas-advanced canvas-planner" onDoubleClick={e => e.stopPropagation()}>
      <Header item={item} ctx={ctx}>
        <button onClick={() => set(addIteration)}>+ Iteration</button>
        <button onClick={() => set(addTeam)}>+ Team</button>
      </Header>
      <div className="canvas-advanced-body" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
        <fieldset disabled={!!item.locked}>
          <div
            ref={grid}
            className="canvas-planner-grid"
            style={{ gridTemplateColumns: `120px repeat(${d.iterations.length}, minmax(200px, 1fr))` }}
          >
            <span />
            {d.iterations.map(it => (
              <div className="canvas-planner-axis" key={it.id}>
                <CanvasField
                  label={`Iteration: ${it.title}`}
                  value={it.title}
                  maxLength={TITLE_MAX}
                  onCommit={title => set(x => renameAxis(x, 'iterations', it.id, title))}
                />
                <button
                  aria-label={`Delete iteration: ${it.title}`}
                  disabled={d.iterations.length === 1}
                  onClick={() => set(x => removeAxis(x, 'iterations', it.id))}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {d.teams.map(team => (
              <React.Fragment key={team.id}>
                <div className="canvas-planner-axis">
                  <CanvasField
                    label={`Team: ${team.title}`}
                    value={team.title}
                    maxLength={TITLE_MAX}
                    onCommit={title => set(x => renameAxis(x, 'teams', team.id, title))}
                  />
                  <button
                    aria-label={`Delete team: ${team.title}`}
                    disabled={d.teams.length === 1}
                    onClick={() => set(x => removeAxis(x, 'teams', team.id))}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {d.iterations.map(it => (
                  <section
                    className="canvas-planner-cell"
                    key={it.id}
                    aria-label={`${team.title}, ${it.title}`}
                    onDragOver={e => dropAllowed(e, PLANNER, item.locked)}
                    onDrop={e => drop(e, team.id, it.id)}
                  >
                    <div className="canvas-planner-cell-top">
                      <small>{cellPoints(d, team.id, it.id)} points</small>
                      <button
                        aria-label={`Add card: ${team.title}, ${it.title}`}
                        onClick={() => set(x => addPlannerCard(x, team.id, it.id).data)}
                      >
                        + Card
                      </button>
                    </div>
                    {d.cards
                      .filter(c => c.team === team.id && c.iteration === it.id)
                      .map(card => (
                        <article
                          key={card.id}
                          data-planner-card={card.id}
                          className="canvas-planner-card"
                          draggable={!item.locked}
                          tabIndex={item.locked ? undefined : 0}
                          aria-label={`Planner card: ${card.title}. Alt plus arrow keys move it.`}
                          onDragStart={e => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData(PLANNER, JSON.stringify({ widget: item.id, id: card.id }));
                          }}
                          onDragOver={e => dropAllowed(e, PLANNER, item.locked)}
                          onDrop={e => drop(e, team.id, it.id, card.id)}
                          onKeyDown={e => {
                            if ((e.target as HTMLElement).closest('input,textarea,select,button')) return;
                            const direction = (
                              { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
                            )[e.key as 'ArrowUp'];
                            if (!item.locked && e.altKey && direction) {
                              e.preventDefault();
                              set(x => {
                                const next = shiftPlannerCard(x, card.id, direction);
                                if (next !== x) focusAfter.current = card.id;
                                return next;
                              });
                            }
                          }}
                        >
                          <CanvasField
                            label={`Planner card title: ${card.title}`}
                            value={card.title}
                            maxLength={TITLE_MAX}
                            onCommit={title => set(x => updatePlannerCard(x, card.id, { title }))}
                          />
                          <label className="canvas-card-points">
                            Points
                            <input
                              {...canvasControl}
                              type="number"
                              min={0}
                              max={1000}
                              step="any"
                              aria-label={`Points: ${card.title}`}
                              value={card.points ?? ''}
                              onChange={e =>
                                set(x =>
                                  updatePlannerCard(x, card.id, {
                                    points: e.target.value === '' ? undefined : Number(e.target.value),
                                  }),
                                )
                              }
                            />
                          </label>
                          <details className="canvas-card-dependencies">
                            <summary>Dependencies ({d.dependencies.filter(dep => dep.to === card.id).length})</summary>
                            <select
                              aria-label={`Blocked by: ${card.title}`}
                              value=""
                              onChange={e => {
                                if (e.target.value) set(x => addPlannerDependency(x, e.target.value, card.id));
                              }}
                            >
                              <option value="">Add dependency</option>
                              {d.cards
                                .filter(
                                  c =>
                                    c.id !== card.id &&
                                    !d.dependencies.some(dep => dep.from === c.id && dep.to === card.id),
                                )
                                .map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.title}
                                  </option>
                                ))}
                            </select>
                            {d.dependencies
                              .filter(dep => dep.to === card.id)
                              .map(dep => (
                                <button
                                  key={dep.from}
                                  aria-label={`Remove dependency: ${dep.from} to ${card.title}`}
                                  onClick={() => set(x => removePlannerDependency(x, dep.from, dep.to))}
                                >
                                  {d.cards.find(c => c.id === dep.from)?.title || 'Feature'} <Trash2 size={12} />
                                </button>
                              ))}
                          </details>
                          <button
                            aria-label={`Delete card: ${card.title}`}
                            onClick={() => set(x => removePlannerCard(x, card.id))}
                          >
                            <Trash2 size={12} />
                          </button>
                        </article>
                      ))}
                  </section>
                ))}
              </React.Fragment>
            ))}
            <PlannerDependencies data={d} root={grid} zoom={ctx.zoom} id={item.id} />
          </div>
        </fieldset>
      </div>
    </div>
  );
}

const JOURNEY = 'application/x-boardroom-journey-content';
export function CanvasJourney({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = item.data as JourneyData,
    set = (fn: (value: JourneyData) => JourneyData) => changeData(item, ctx, fn);
  return (
    <div className="canvas-advanced" onDoubleClick={e => e.stopPropagation()}>
      <Header item={item} ctx={ctx}>
        <button onClick={() => set(addStage)}>+ Stage</button>
        <button onClick={() => set(x => addLane(x))}>+ Lane</button>
      </Header>
      <div className="canvas-advanced-body" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
        <fieldset disabled={!!item.locked}>
          <div
            className="canvas-journey-grid"
            style={{ gridTemplateColumns: `120px repeat(${d.stages.length}, minmax(180px, 1fr))` }}
          >
            <span />
            {d.stages.map((stage, k) => (
              <div className="canvas-journey-stage" key={stage.id}>
                <CanvasField
                  label={`Stage title: ${stage.title}`}
                  value={stage.title}
                  maxLength={TITLE_MAX}
                  onCommit={title => set(x => renameStage(x, stage.id, title))}
                />
                <button
                  disabled={!k}
                  aria-label={`Move stage left: ${stage.title}`}
                  onClick={() => set(x => moveStage(x, stage.id, -1))}
                >
                  <ArrowLeft size={12} />
                </button>
                <button
                  disabled={k === d.stages.length - 1}
                  aria-label={`Move stage right: ${stage.title}`}
                  onClick={() => set(x => moveStage(x, stage.id, 1))}
                >
                  <ArrowRight size={12} />
                </button>
                <button
                  disabled={d.stages.length === 1}
                  aria-label={`Delete stage: ${stage.title}`}
                  onClick={() => set(x => removeStage(x, stage.id))}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {d.lanes.map(lane => (
              <React.Fragment key={lane.id}>
                <div className="canvas-journey-lane">
                  <CanvasField
                    label={`Lane title: ${lane.title}`}
                    value={lane.title}
                    maxLength={TITLE_MAX}
                    onCommit={title => set(x => renameLane(x, lane.id, title))}
                  />
                  <button
                    disabled={d.lanes.length === 1}
                    aria-label={`Delete lane: ${lane.title}`}
                    onClick={() => set(x => removeLane(x, lane.id))}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {d.stages.map((stage, index) =>
                  lane.kind === 'emotion' ? (
                    <div key={stage.id} className="canvas-journey-cell">
                      <label>
                        Emotion
                        <select
                          aria-label={`Emotion: ${stage.title}`}
                          value={d.emotions[stage.id] ?? 0}
                          onChange={e => set(x => setEmotion(x, stage.id, Number(e.target.value)))}
                        >
                          {['Very negative', 'Negative', 'Neutral', 'Positive', 'Very positive'].map((label, k) => (
                            <option key={k} value={k - 2}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <svg className="canvas-emotion-marker" viewBox="0 0 100 60" aria-hidden="true">
                        <path
                          d={`M0 ${30 - ((d.emotions[d.stages[Math.max(0, index - 1)].id] ?? 0) + (d.emotions[stage.id] ?? 0)) * 5} L50 ${30 - (d.emotions[stage.id] ?? 0) * 10} L100 ${30 - ((d.emotions[stage.id] ?? 0) + (d.emotions[d.stages[Math.min(d.stages.length - 1, index + 1)].id] ?? 0)) * 5}`}
                          fill="none"
                          stroke="#4262ff"
                          strokeWidth={2}
                        />
                        <line x1={0} x2={100} y1={30} y2={30} stroke="#d4d4da" />
                        <circle cx={50} cy={30 - (d.emotions[stage.id] ?? 0) * 10} r={5} fill="#4262ff" />
                      </svg>
                    </div>
                  ) : (
                    <div
                      className="canvas-journey-cell"
                      key={stage.id}
                      data-journey-cell={cellKey(stage.id, lane.id)}
                      onDragOver={e => dropAllowed(e, JOURNEY, item.locked)}
                      onDrop={e => {
                        const value = payload(e, JOURNEY, item);
                        if (!value) return;
                        e.preventDefault();
                        e.stopPropagation();
                        set(x => moveJourneyContent(x, value.stage, value.lane, stage.id, lane.id));
                      }}
                    >
                      <button
                        draggable={!item.locked}
                        aria-label={`Move content: ${lane.title}, ${stage.title}`}
                        className="canvas-journey-grip"
                        onDragStart={e => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData(
                            JOURNEY,
                            JSON.stringify({ widget: item.id, stage: stage.id, lane: lane.id }),
                          );
                        }}
                        onKeyDown={e => {
                          if (!e.altKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                          const target = d.stages[index + (e.key === 'ArrowLeft' ? -1 : 1)];
                          e.preventDefault();
                          e.stopPropagation();
                          if (target) set(x => moveJourneyContent(x, stage.id, lane.id, target.id, lane.id));
                        }}
                      >
                        <GripVertical size={13} />
                      </button>
                      <CanvasField
                        label={`${lane.title}: ${stage.title}`}
                        multiline
                        maxLength={2000}
                        value={d.cells[cellKey(stage.id, lane.id)] ?? ''}
                        onCommit={text => set(x => setCell(x, stage.id, lane.id, text))}
                      />
                    </div>
                  ),
                )}
              </React.Fragment>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}

const RANKING = 'application/x-boardroom-ranking-item';
export function CanvasRanking({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = item.data as RankingData,
    order = rankedIds(d),
    set = (fn: (value: RankingData) => RankingData) => changeData(item, ctx, fn);
  const drop = (e: React.DragEvent, before: string | null) => {
    const value = payload(e, RANKING, item);
    if (!value) return;
    e.preventDefault();
    e.stopPropagation();
    set(x => moveRankBefore(x, value.id, before));
  };
  return (
    <div className="canvas-advanced" onDoubleClick={e => e.stopPropagation()}>
      <Header item={item} ctx={ctx}>
        <button disabled={d.items.length >= 30} onClick={() => set(x => addRankItem(x, 'New item'))}>
          + Item
        </button>
        <button onClick={() => set(x => ({ ...x, order: x.items.map(i => i.id) }))}>Reset order</button>
      </Header>
      <div className="canvas-advanced-body" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
        <fieldset disabled={!!item.locked}>
          <CanvasField
            label="Ranking question"
            value={d.question}
            maxLength={300}
            onCommit={question => set(x => ({ ...x, question }))}
          />
          <ol className="canvas-ranking-list">
            {order.map((id, k) => {
              const entry = d.items.find(i => i.id === id)!;
              return (
                <li
                  key={id}
                  data-rank={id}
                  draggable={!item.locked}
                  tabIndex={item.locked ? undefined : 0}
                  aria-label={`Rank ${k + 1}: ${entry.label}. Alt plus arrow keys move it.`}
                  onDragStart={e => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData(RANKING, JSON.stringify({ widget: item.id, id }));
                  }}
                  onDragOver={e => dropAllowed(e, RANKING, item.locked)}
                  onDrop={e => drop(e, id)}
                  onKeyDown={e => {
                    if (
                      item.locked ||
                      !e.altKey ||
                      !['ArrowUp', 'ArrowDown'].includes(e.key) ||
                      (e.target as HTMLElement).closest('input,button')
                    )
                      return;
                    e.preventDefault();
                    set(x => moveRank(x, id, e.key === 'ArrowUp' ? -1 : 1));
                  }}
                >
                  <b>{k + 1}</b>
                  <CanvasField
                    label={`Ranking item: ${entry.label}`}
                    value={entry.label}
                    maxLength={TITLE_MAX}
                    onCommit={label =>
                      set(x => ({ ...x, items: x.items.map(i => (i.id === id ? { ...i, label } : i)) }))
                    }
                  />
                  <button
                    aria-label={`Move up: ${entry.label}`}
                    disabled={!k}
                    onClick={() => set(x => moveRank(x, id, -1))}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    aria-label={`Move down: ${entry.label}`}
                    disabled={k === order.length - 1}
                    onClick={() => set(x => moveRank(x, id, 1))}
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    aria-label={`Delete ranking item: ${entry.label}`}
                    disabled={d.items.length <= 2}
                    onClick={() => set(x => removeRankItem(x, id))}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ol>
          <div
            className="canvas-ranking-end"
            onDragOver={e => dropAllowed(e, RANKING, item.locked)}
            onDrop={e => drop(e, null)}
          >
            Drop here to rank last
          </div>
        </fieldset>
      </div>
    </div>
  );
}
