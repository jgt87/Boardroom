// Views and live editors for journey maps, program boards, word clouds, rankings and quizzes.
// Editors commit every change immediately through ctx.update, so each change is one undo step.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  RotateCcw,
  Link2,
} from 'lucide-react';
import type { Item, WidgetKind } from './model';
import type { WidgetView, WidgetCtx } from './widget-types';
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
  lateDependencies,
  cellPoints,
  addIteration,
  addTeam,
  removeAxis,
  renameAxis,
  plannerDependencyError,
  wordFrequencies,
  layoutWordCloud,
  addEntry,
  rankedIds,
  moveRank,
  moveRankBefore,
  addRankItem,
  removeRankItem,
  quizScore,
  answerQuiz,
  resetQuiz,
  addQuestion,
  removeQuestion,
  updateQuestion,
  TITLE_MAX,
  WORD_LEN,
} from './engage';
import type { JourneyData, PlannerData, WordCloudData, RankingData, QuizData, QuizQuestion } from './engage';
import './widgets-engage.css';
import { CanvasJourney, CanvasPlanner, CanvasRanking } from './canvas-engage';

const data = <T,>(i: Item) => (i.data ?? {}) as T;
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
/** Commit a data change for one item as its own undo step; errors become a notice. */
function commitData<T>(ctx: WidgetCtx, item: Item, change: (d: T) => T): boolean {
  try {
    const next = change(data<T>(item));
    ctx.update(b => ({
      ...b,
      items: b.items.map(i => (i.id === item.id ? { ...i, data: next as Record<string, any> } : i)),
    }));
    return true;
  } catch (error) {
    ctx.display((error as Error).message);
    return false;
  }
}
const commitText = (ctx: WidgetCtx, item: Item, text: string) =>
  ctx.update(b => ({ ...b, items: b.items.map(i => (i.id === item.id ? { ...i, text: text.slice(0, 200) } : i)) }));

/** Text input that commits on blur or Enter (one undo step per edit, not per keystroke). */
function InlineText({
  value,
  label,
  onCommit,
  multiline,
  max = TITLE_MAX,
  placeholder,
}: {
  value: string;
  label: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  max?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    'aria-label': label,
    value: draft,
    maxLength: max,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
  };
  return multiline ? (
    <textarea
      {...common}
      onKeyDown={e => {
        if (e.key === 'Escape' && draft !== value) {
          setDraft(value);
          e.stopPropagation();
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  ) : (
    <input
      {...common}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape' && draft !== value) {
          setDraft(value);
          e.stopPropagation();
        }
      }}
    />
  );
}

/** Live focus dialog: no Apply step, because every change is already saved. */
function LiveDialog({
  title,
  hint,
  onClose,
  wide,
  children,
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    (
      box.current?.querySelector<HTMLElement>('input,textarea,select,[tabindex="0"]') ??
      box.current?.querySelector<HTMLElement>('button')
    )?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
      onPointerDown={stop}
    >
      <div
        ref={box}
        className={`format-editor widget-editor eg-editor ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            <p>{hint ?? 'Every change is saved immediately and can be undone one step at a time.'}</p>
          </div>
          <button className="icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="widget-editor-body">{children}</div>
        <footer>
          <span>Changes are saved as you go · Esc closes</span>
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---- Journey map -----------------------------------------------------------------------------------
const emotionLabel = ['Very negative', 'Negative', 'Neutral', 'Positive', 'Very positive'],
  emotionFace = ['😣', '🙁', '😐', '🙂', '😄'];
function JourneyRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  return <CanvasJourney item={item} ctx={ctx} />;
}
function JourneyEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<JourneyData>(item),
    set = (change: (x: JourneyData) => JourneyData) => commitData(ctx, item, change);
  return (
    <LiveDialog title="Journey map" onClose={onClose} wide>
      <label className="eg-field">
        Title
        <InlineText label="Journey title" value={item.text} onCommit={v => commitText(ctx, item, v)} />
      </label>
      <div className="eg-scroll">
        <table className="eg-table">
          <thead>
            <tr>
              <th>
                <span className="sr-only">Row</span>
              </th>
              {d.stages.map((s, k) => (
                <th key={s.id}>
                  <InlineText
                    label={`Stage ${k + 1} title`}
                    value={s.title}
                    onCommit={v => set(x => renameStage(x, s.id, v))}
                  />
                  <div className="eg-tools">
                    <button
                      className="icon-button"
                      aria-label={`Move ${s.title} earlier`}
                      disabled={!k}
                      onClick={() => set(x => moveStage(x, s.id, -1))}
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Move ${s.title} later`}
                      disabled={k === d.stages.length - 1}
                      onClick={() => set(x => moveStage(x, s.id, 1))}
                    >
                      <ArrowRight size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove stage ${s.title}`}
                      disabled={d.stages.length <= 1}
                      onClick={() => set(x => removeStage(x, s.id))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.lanes.map((l, li) => (
              <tr key={l.id}>
                <th scope="row">
                  <InlineText
                    label={`Lane ${li + 1} title`}
                    value={l.title}
                    onCommit={v => set(x => renameLane(x, l.id, v))}
                  />
                  <button
                    className="icon-button"
                    aria-label={`Remove lane ${l.title}`}
                    disabled={d.lanes.length <= 1}
                    onClick={() => set(x => removeLane(x, l.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </th>
                {d.stages.map(s => (
                  <td key={s.id}>
                    {l.kind === 'emotion' ? (
                      <select
                        aria-label={`Emotion for ${s.title}`}
                        value={d.emotions[s.id] ?? 0}
                        onChange={e => set(x => setEmotion(x, s.id, Number(e.target.value)))}
                      >
                        {emotionLabel.map((lab, k) => (
                          <option key={k} value={k - 2}>
                            {emotionFace[k]} {lab}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <InlineText
                        multiline
                        max={2000}
                        label={`${l.title} for ${s.title}`}
                        value={d.cells[cellKey(s.id, l.id)] ?? ''}
                        onCommit={v => set(x => setCell(x, s.id, l.id, v))}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="w-row eg-actions">
        <button onClick={() => set(x => addStage(x))}>
          <Plus size={14} />
          Add stage
        </button>
        <button onClick={() => set(x => addLane(x, 'text'))}>
          <Plus size={14} />
          Add lane
        </button>
        <button disabled={d.lanes.some(l => l.kind === 'emotion')} onClick={() => set(x => addLane(x, 'emotion'))}>
          <Plus size={14} />
          Add emotion lane
        </button>
      </div>
    </LiveDialog>
  );
}

// ---- Planner (program board) -------------------------------------------------------------------------
function PlannerRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  return <CanvasPlanner item={item} ctx={ctx} />;
}
function PlannerEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<PlannerData>(item),
    [active, setActive] = useState<string | null>(d.cards[0]?.id ?? null),
    [dragging, setDragging] = useState<string | null>(null),
    [depFrom, setDepFrom] = useState(''),
    focusAfter = useRef<string | null>(null),
    root = useRef<HTMLDivElement>(null);
  const set = (change: (x: PlannerData) => PlannerData) => commitData(ctx, item, change),
    card = d.cards.find(c => c.id === active),
    late = lateDependencies(d),
    title = (id: string) => d.cards.find(c => c.id === id)?.title || 'Untitled';
  useEffect(() => {
    if (focusAfter.current) {
      root.current?.querySelector<HTMLElement>(`[data-pl-card="${focusAfter.current}"]`)?.focus();
      focusAfter.current = null;
    }
  });
  return (
    <LiveDialog
      title="Planner"
      onClose={onClose}
      wide
      hint="Drag cards between cells, or focus a card and press Alt + arrow keys. Red dashed links start before the card they depend on is planned."
    >
      <div ref={root} className="eg-scroll">
        <table className="eg-table eg-planner-table">
          <thead>
            <tr>
              <th>
                <span className="sr-only">Row</span>
              </th>
              {d.iterations.map((it, k) => (
                <th key={it.id}>
                  <InlineText
                    label={`Iteration ${k + 1} title`}
                    value={it.title}
                    onCommit={v => set(x => renameAxis(x, 'iterations', it.id, v))}
                  />
                  <button
                    className="icon-button"
                    aria-label={`Remove ${it.title}`}
                    disabled={d.iterations.length <= 1}
                    onClick={() => set(x => removeAxis(x, 'iterations', it.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.teams.map((t, tk) => (
              <tr key={t.id}>
                <th scope="row">
                  <InlineText
                    label={`Team ${tk + 1} name`}
                    value={t.title}
                    onCommit={v => set(x => renameAxis(x, 'teams', t.id, v))}
                  />
                  <button
                    className="icon-button"
                    aria-label={`Remove ${t.title}`}
                    disabled={d.teams.length <= 1}
                    onClick={() => set(x => removeAxis(x, 'teams', t.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </th>
                {d.iterations.map(it => (
                  <td
                    key={it.id}
                    className="eg-drop"
                    onDragOver={e => {
                      if (dragging || e.dataTransfer.types.includes('text/plain')) e.preventDefault();
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      const id = dragging ?? e.dataTransfer.getData('text/plain');
                      if (id) set(x => movePlannerCard(x, id, t.id, it.id));
                      setDragging(null);
                    }}
                  >
                    {d.cards
                      .filter(c => c.team === t.id && c.iteration === it.id)
                      .map(c => (
                        <div
                          key={c.id}
                          data-pl-card={c.id}
                          tabIndex={0}
                          draggable
                          className={`eg-pl-chip ${active === c.id ? 'active' : ''} ${late.some(x => x.to === c.id) ? 'late' : ''}`}
                          aria-label={`${c.title || 'Untitled'}, ${t.title}, ${it.title}. Alt plus arrow keys move it.`}
                          onClick={() => setActive(c.id)}
                          onDragStart={e => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', c.id);
                            setTimeout(() => setDragging(c.id));
                          }}
                          onDragEnd={() => setDragging(null)}
                          onDragOver={e => {
                            if (dragging !== c.id && (dragging || e.dataTransfer.types.includes('text/plain'))) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            const id = dragging ?? e.dataTransfer.getData('text/plain');
                            if (id && id !== c.id) set(x => movePlannerCard(x, id, t.id, it.id, c.id));
                            setDragging(null);
                          }}
                          onKeyDown={e => {
                            const dir = (
                              { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const
                            )[e.key as 'ArrowLeft'];
                            if (!e.altKey || !dir) return;
                            e.preventDefault();
                            focusAfter.current = c.id;
                            set(x => shiftPlannerCard(x, c.id, dir));
                          }}
                        >
                          <span>{c.title || 'Untitled'}</span>
                          {c.points !== undefined && <b>{c.points}</b>}
                        </div>
                      ))}
                    <button
                      className="eg-add-chip"
                      aria-label={`Add card for ${t.title} in ${it.title}`}
                      onClick={() => {
                        let created = '';
                        if (
                          set(x => {
                            const r = addPlannerCard(x, t.id, it.id);
                            created = r.id;
                            return r.data;
                          })
                        )
                          setActive(created);
                      }}
                    >
                      <Plus size={13} />
                    </button>
                    {cellPoints(d, t.id, it.id) > 0 && (
                      <small className="eg-cap">{cellPoints(d, t.id, it.id)} pt</small>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="w-row eg-actions">
        <button onClick={() => set(x => addIteration(x))}>
          <Plus size={14} />
          Add iteration
        </button>
        <button onClick={() => set(x => addTeam(x))}>
          <Plus size={14} />
          Add team
        </button>
      </div>
      {card && (
        <section className="eg-card-panel" aria-label="Selected card">
          <div className="w-form">
            <label>
              Title
              <InlineText
                label="Card title"
                value={card.title}
                onCommit={v => set(x => updatePlannerCard(x, card.id, { title: v }))}
              />
            </label>
            <label>
              Points
              <input
                aria-label="Card points"
                type="number"
                min={0}
                max={1000}
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
          </div>
          <h3>Dependencies</h3>
          <ul className="eg-deps">
            {d.dependencies
              .filter(x => x.to === card.id || x.from === card.id)
              .map(x => (
                <li
                  key={`${x.from}${x.to}`}
                  className={late.some(l => l.from === x.from && l.to === x.to) ? 'late' : ''}
                >
                  <Link2 size={13} />
                  {x.to === card.id ? (
                    <>
                      Waits for <b>{title(x.from)}</b>
                    </>
                  ) : (
                    <>
                      Blocks <b>{title(x.to)}</b>
                    </>
                  )}
                  <button
                    className="icon-button"
                    aria-label="Remove dependency"
                    onClick={() => set(y => removePlannerDependency(y, x.from, x.to))}
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
          </ul>
          <div className="w-row">
            <select aria-label="This card waits for" value={depFrom} onChange={e => setDepFrom(e.target.value)}>
              <option value="">Waits for…</option>
              {d.cards
                .filter(c => c.id !== card.id)
                .map(c => (
                  <option key={c.id} value={c.id} disabled={!!plannerDependencyError(d, c.id, card.id)}>
                    {c.title || 'Untitled'}
                  </option>
                ))}
            </select>
            <button
              disabled={!depFrom}
              onClick={() => {
                if (set(x => addPlannerDependency(x, depFrom, card.id))) setDepFrom('');
              }}
            >
              Add dependency
            </button>
            <button
              onClick={() => {
                set(x => removePlannerCard(x, card.id));
                setActive(null);
              }}
            >
              <Trash2 size={14} />
              Delete card
            </button>
          </div>
        </section>
      )}
    </LiveDialog>
  );
}

// ---- Word cloud --------------------------------------------------------------------------------------
const cloudColors = ['#4262ff', '#e5484d', '#12a594', '#f76b15', '#8e4ec6', '#0090ff', '#d6409f', '#46a758'];
function WordCloudRender({ item }: { item: Item }) {
  const d = data<WordCloudData>(item),
    top = 34,
    words = useMemo(
      () => layoutWordCloud(wordFrequencies(d.entries), Math.max(40, item.w - 16), Math.max(40, item.h - top - 8)),
      [d.entries, item.w, item.h],
    );
  return (
    <g>
      <rect width={item.w} height={item.h} rx="10" fill="#ffffff" stroke="#dcdce3" />
      <text x={12} y={22} fontSize="14" fontWeight="700" fill="#25252c" fontFamily="Arial">
        {d.prompt || 'Word cloud'}
      </text>
      <text x={item.w - 12} y={22} fontSize="11" textAnchor="end" fill="#8a8a94" fontFamily="Arial">
        {d.entries.length} {d.entries.length === 1 ? 'entry' : 'entries'}
      </text>
      <g transform={`translate(8 ${top})`}>
        {words.map((w, k) => (
          <text
            key={w.word}
            x={w.x + w.w / 2}
            y={w.y + w.h * 0.8}
            fontSize={w.size}
            textAnchor="middle"
            fontFamily="Arial"
            fontWeight={k < 3 ? 700 : 400}
            fill={cloudColors[k % cloudColors.length]}
          >
            <title>{`${w.word} · ${w.count}`}</title>
            {w.word}
          </text>
        ))}
        {!words.length && (
          <text
            x={(item.w - 16) / 2}
            y={(item.h - top) / 2}
            textAnchor="middle"
            fontSize="13"
            fill="#8a8a94"
            fontFamily="Arial"
          >
            Add entries to grow the cloud
          </text>
        )}
      </g>
    </g>
  );
}
function WordCloudEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<WordCloudData>(item),
    [entry, setEntry] = useState(''),
    set = (change: (x: WordCloudData) => WordCloudData) => commitData(ctx, item, change),
    freqs = wordFrequencies(d.entries).slice(0, 12);
  const add = () => {
    if (set(x => addEntry(x, entry))) setEntry('');
  };
  return (
    <LiveDialog
      title="Word cloud"
      onClose={onClose}
      hint="Entries are collected on this device. Common words such as “the” and “and” are ignored."
    >
      <div className="w-form">
        <label className="span2">
          Prompt
          <InlineText
            label="Word cloud prompt"
            max={300}
            value={d.prompt}
            onCommit={v => set(x => ({ ...x, prompt: v }))}
          />
        </label>
        <label className="span2">
          New entry
          <div className="w-row">
            <input
              aria-label="New entry"
              maxLength={WORD_LEN}
              value={entry}
              placeholder="Type a word or short phrase"
              onChange={e => setEntry(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button className="primary" disabled={!entry.trim()} onClick={add}>
              <Plus size={14} />
              Add
            </button>
          </div>
        </label>
      </div>
      {freqs.length > 0 && (
        <p className="format-hint">Top themes: {freqs.map(f => `${f.word} (${f.count})`).join(', ')}</p>
      )}
      <ul className="eg-entries">
        {d.entries.map((e, k) => (
          <li key={`${k}${e}`}>
            <span>{e}</span>
            <button
              className="icon-button"
              aria-label={`Remove ${e}`}
              onClick={() => set(x => ({ ...x, entries: x.entries.filter((_, j) => j !== k) }))}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="w-row eg-actions">
        <button disabled={!d.entries.length} onClick={() => set(x => ({ ...x, entries: [] }))}>
          <Trash2 size={14} />
          Clear all
        </button>
      </div>
    </LiveDialog>
  );
}

// ---- Ranking ---------------------------------------------------------------------------------------
function RankingRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  return <CanvasRanking item={item} ctx={ctx} />;
}
function RankingEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<RankingData>(item),
    byId = new Map(d.items.map(i => [i.id, i])),
    [dragging, setDragging] = useState<string | null>(null),
    focusAfter = useRef<string | null>(null),
    list = useRef<HTMLOListElement>(null),
    set = (change: (x: RankingData) => RankingData) => commitData(ctx, item, change);
  useEffect(() => {
    if (focusAfter.current) {
      list.current?.querySelector<HTMLElement>(`[data-rank="${focusAfter.current}"]`)?.focus();
      focusAfter.current = null;
    }
  });
  const order = rankedIds(d);
  return (
    <LiveDialog
      title="Ranking"
      onClose={onClose}
      hint="Drag items, or focus an item and press Alt + ↑/↓ to change its rank."
    >
      <label className="eg-field">
        Question
        <InlineText
          label="Ranking question"
          max={300}
          value={d.question}
          onCommit={v => set(x => ({ ...x, question: v }))}
        />
      </label>
      <ol ref={list} className="eg-rank-list">
        {order.map((id, k) => (
          <li
            key={id}
            data-rank={id}
            tabIndex={0}
            draggable
            className={dragging === id ? 'dragging' : ''}
            aria-label={`Rank ${k + 1}: ${byId.get(id)?.label}. Alt plus arrow keys move it.`}
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', id);
              setTimeout(() => setDragging(id));
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={e => {
              if (dragging !== id && (dragging || e.dataTransfer.types.includes('text/plain'))) e.preventDefault();
            }}
            onDrop={e => {
              e.preventDefault();
              const from = dragging ?? e.dataTransfer.getData('text/plain');
              if (from && from !== id) set(x => moveRankBefore(x, from, id));
              setDragging(null);
            }}
            onKeyDown={e => {
              if (
                !e.altKey ||
                (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') ||
                (e.target as HTMLElement).tagName === 'INPUT'
              )
                return;
              e.preventDefault();
              focusAfter.current = id;
              set(x => moveRank(x, id, e.key === 'ArrowUp' ? -1 : 1));
            }}
          >
            <b>{k + 1}</b>
            <InlineText
              label={`Item ${k + 1}`}
              value={byId.get(id)?.label ?? ''}
              onCommit={v => set(x => ({ ...x, items: x.items.map(i => (i.id === id ? { ...i, label: v } : i)) }))}
            />
            <button
              className="icon-button"
              aria-label="Move up"
              disabled={!k}
              onClick={() => set(x => moveRank(x, id, -1))}
            >
              <ArrowUp size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="Move down"
              disabled={k === order.length - 1}
              onClick={() => set(x => moveRank(x, id, 1))}
            >
              <ArrowDown size={14} />
            </button>
            <button
              className="icon-button"
              aria-label="Remove item"
              disabled={d.items.length <= 2}
              onClick={() => set(x => removeRankItem(x, id))}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ol>
      <div className="w-row eg-actions">
        <button onClick={() => set(x => addRankItem(x, `Item ${x.items.length + 1}`))}>
          <Plus size={14} />
          Add item
        </button>
      </div>
    </LiveDialog>
  );
}

// ---- Quiz ------------------------------------------------------------------------------------------
function QuizRender({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = data<QuizData>(item),
    s = quizScore(d),
    answer = (q: QuizQuestion, k: number) => commitData<QuizData>(ctx, item, x => answerQuiz(x, q.id, k));
  return (
    <div className="eg-quiz">
      <div className="eg-title">
        {item.text || 'Quiz'}
        <span>{d.revealed ? `Score ${s.correct} / ${s.total}` : `${s.answered} / ${s.total} answered`}</span>
      </div>
      <ol>
        {d.questions.map(q => (
          <li key={q.id}>
            <p>{q.text || 'Untitled question'}</p>
            <div className="eg-options">
              {q.options.map((o, k) => {
                const picked = d.answers[q.id] === k,
                  state = d.revealed ? (k === q.correct ? 'correct' : picked ? 'wrong' : '') : picked ? 'picked' : '';
                return (
                  <button
                    key={k}
                    className={`eg-option ${state}`}
                    aria-pressed={picked}
                    disabled={d.revealed}
                    onPointerDown={stop}
                    onClick={e => {
                      e.stopPropagation();
                      answer(q, k);
                    }}
                  >
                    {o || `Option ${k + 1}`}
                    {d.revealed && k === q.correct && ' ✓'}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
function QuizEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<QuizData>(item),
    set = (change: (x: QuizData) => QuizData) => commitData(ctx, item, change),
    up = (q: QuizQuestion) => set(x => updateQuestion(x, q));
  return (
    <LiveDialog
      title="Quiz"
      onClose={onClose}
      wide
      hint="Answers and scores stay on this device. Changing a question's options clears its answer."
    >
      <label className="eg-field">
        Title
        <InlineText label="Quiz title" value={item.text} onCommit={v => commitText(ctx, item, v)} />
      </label>
      <ol className="eg-questions">
        {d.questions.map((q, n) => (
          <li key={q.id}>
            <div className="w-row">
              <InlineText label={`Question ${n + 1}`} max={500} value={q.text} onCommit={v => up({ ...q, text: v })} />
              <button
                className="icon-button"
                aria-label={`Remove question ${n + 1}`}
                disabled={d.questions.length <= 1}
                onClick={() => set(x => removeQuestion(x, q.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <fieldset>
              <legend>Options · choose the correct answer</legend>
              {q.options.map((o, k) => (
                <div key={k} className="eg-opt-row">
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    aria-label={`Option ${k + 1} is correct`}
                    checked={q.correct === k}
                    onChange={() => up({ ...q, correct: k })}
                  />
                  <InlineText
                    label={`Question ${n + 1} option ${k + 1}`}
                    value={o}
                    onCommit={v => up({ ...q, options: q.options.map((x, j) => (j === k ? v : x)) })}
                  />
                  <button
                    className="icon-button"
                    aria-label={`Remove option ${k + 1}`}
                    disabled={q.options.length <= 2}
                    onClick={() =>
                      up({
                        ...q,
                        options: q.options.filter((_, j) => j !== k),
                        correct: q.correct > k ? q.correct - 1 : q.correct === k ? 0 : q.correct,
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                disabled={q.options.length >= 8}
                onClick={() =>
                  up({ ...q, options: [...q.options, `Option ${String.fromCharCode(65 + q.options.length)}`] })
                }
              >
                <Plus size={13} />
                Add option
              </button>
            </fieldset>
          </li>
        ))}
      </ol>
      <div className="w-row eg-actions">
        <button onClick={() => set(addQuestion)}>
          <Plus size={14} />
          Add question
        </button>
        <button onClick={() => set(resetQuiz)}>
          <RotateCcw size={14} />
          Reset answers
        </button>
      </div>
    </LiveDialog>
  );
}

export const engageViews: WidgetView[] = [
  {
    kind: 'journey' as WidgetKind,
    interactive: true,
    mode: 'html',
    Render: p => <JourneyRender {...p} />,
    Editor: p => <JourneyEditor {...p} />,
  },
  {
    kind: 'planner' as WidgetKind,
    interactive: true,
    mode: 'html',
    Render: p => <PlannerRender {...p} />,
    Editor: p => <PlannerEditor {...p} />,
  },
  {
    kind: 'wordcloud' as WidgetKind,
    mode: 'svg',
    Render: p => <WordCloudRender {...p} />,
    Editor: p => <WordCloudEditor {...p} />,
  },
  {
    kind: 'ranking' as WidgetKind,
    interactive: true,
    mode: 'html',
    Render: p => <RankingRender {...p} />,
    Editor: p => <RankingEditor {...p} />,
    actions: (item, ctx) => {
      const d = data<RankingData>(item);
      return [
        {
          label: 'Original order',
          icon: <RotateCcw size={15} />,
          disabled: rankedIds(d).every((id, k) => d.items[k]?.id === id),
          run: () => commitData<RankingData>(ctx, item, x => ({ ...x, order: d.items.map(i => i.id) })),
        },
      ];
    },
  },
  {
    kind: 'quiz' as WidgetKind,
    mode: 'html',
    interactive: true,
    Render: p => <QuizRender {...p} />,
    Editor: p => <QuizEditor {...p} />,
    actions: (item, ctx) => {
      const d = data<QuizData>(item);
      return [
        {
          label: d.revealed ? 'Hide answers' : 'Reveal answers',
          icon: d.revealed ? <EyeOff size={15} /> : <Eye size={15} />,
          pressed: d.revealed,
          run: () => commitData<QuizData>(ctx, item, x => ({ ...x, revealed: !x.revealed })),
        },
        {
          label: 'Reset',
          icon: <RotateCcw size={15} />,
          disabled: !Object.keys(d.answers).length && !d.revealed,
          run: () => commitData<QuizData>(ctx, item, resetQuiz),
        },
      ];
    },
  },
];
