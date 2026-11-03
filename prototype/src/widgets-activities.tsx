// Canvas views for Slides decks (item 78), PowerPoint import (item 84) and open-ended activities (item 82).
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Trash2, Play, X, StickyNote, Plus, RotateCcw } from 'lucide-react';
import type { Board, Item } from './model';
import { createItem } from './model';
import type { WidgetView, WidgetCtx } from './widget-types';
import { validateWidget } from './widget-specs';
import { CanvasField, canvasControl } from './canvas-fields';
import {
  slideLayouts,
  slideLayoutLabels,
  slideTemplates,
  newSlide,
  insertSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  updateSlide,
  setSlideLayout,
  voteOption,
  resetVotes,
  addResponse,
  responsesToNotes,
  DECK_MAX,
  SLIDE_TITLE_MAX,
  SLIDE_BODY_MAX,
  SLIDE_OPTIONS_MAX,
  OPEN_LEN,
  OPEN_MAX,
} from './specs-activities';
import type { DeckData, Slide, SlideLayout, OpenEndedData } from './specs-activities';
import './widgets-activities.css';

export const DECK_EVENT = 'boardroom:present-deck';
const uid = () => crypto.randomUUID();

/** Apply a data change as one undo step, validating the result and respecting locks. */
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
const darkBackground = (hex: string) => {
  const n = parseInt(hex.slice(1), 16),
    l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l < 140;
};
const lines = (text: string) => text.split('\n').filter(l => l.trim());

/** One slide. Editable on the canvas; read-only (apart from voting) when presenting. */
function SlideFace({
  slide,
  edit,
  onChange,
  onVote,
}: {
  slide: Slide;
  edit: boolean;
  onChange?: (change: Partial<Slide>) => void;
  onVote?: (optionId: string, delta: number) => void;
}) {
  const field = (key: 'title' | 'body' | 'body2', label: string, multiline: boolean, className: string) => {
    const value = slide[key] ?? '';
    if (edit)
      return (
        <div className={`slide-field ${className}`}>
          <CanvasField
            label={label}
            value={value}
            multiline={multiline}
            maxLength={key === 'title' ? SLIDE_TITLE_MAX : SLIDE_BODY_MAX}
            onCommit={v => onChange?.({ [key]: v })}
          />
        </div>
      );
    if (!value.trim()) return null;
    if (multiline && className.includes('slide-body'))
      return (
        <ul className={`slide-field ${className}`}>
          {lines(value).map((l, k) => (
            <li key={k}>{l.replace(/^\s*([-*•]|\d+[.)])\s+/, '')}</li>
          ))}
        </ul>
      );
    return <div className={`slide-field ${className}`}>{value}</div>;
  };
  const total = (slide.options ?? []).reduce((n, o) => n + o.votes, 0);
  return (
    <div
      className={`slide-face slide-layout-${slide.layout} ${darkBackground(slide.background) ? 'slide-dark' : ''}`}
      style={{ background: slide.background }}
    >
      {slide.layout === 'title' && (
        <>
          {field('title', 'Slide title', false, 'slide-title')}
          {field('body', 'Slide subtitle', false, 'slide-subtitle')}
        </>
      )}
      {slide.layout === 'section' && (
        <>
          {field('title', 'Section title', false, 'slide-title')}
          {field('body', 'Section subtitle', false, 'slide-subtitle')}
        </>
      )}
      {slide.layout === 'content' && (
        <>
          {field('title', 'Slide title', false, 'slide-heading')}
          {field('body', 'Slide content, one point per line', true, 'slide-body')}
        </>
      )}
      {slide.layout === 'two' && (
        <>
          {field('title', 'Slide title', false, 'slide-heading')}
          <div className="slide-columns">
            {field('body', 'Left column, one point per line', true, 'slide-body')}
            {field('body2', 'Right column, one point per line', true, 'slide-body')}
          </div>
        </>
      )}
      {slide.layout === 'quote' && (
        <>
          {field('title', 'Quote', true, 'slide-quote')}
          {field('body', 'Quote source', false, 'slide-source')}
        </>
      )}
      {slide.layout === 'blank' && field('title', 'Slide text', true, 'slide-blank-text')}
      {slide.layout === 'activity' && (
        <>
          {field('title', 'Activity question', false, 'slide-heading')}
          <ol className="slide-options">
            {(slide.options ?? []).map(o => (
              <li key={o.id}>
                <div className="slide-option-bar" style={{ width: `${total ? (o.votes / total) * 100 : 0}%` }} />
                {edit ? (
                  <CanvasField
                    label={`Option: ${o.label}`}
                    value={o.label}
                    maxLength={200}
                    onCommit={label =>
                      onChange?.({ options: slide.options!.map(x => (x.id === o.id ? { ...x, label } : x)) })
                    }
                  />
                ) : (
                  <span>{o.label}</span>
                )}
                <b aria-label={`${o.votes} votes`}>{o.votes}</b>
                {onVote && (
                  <button aria-label={`+1 vote for ${o.label}`} onClick={() => onVote(o.id, 1)}>
                    +1
                  </button>
                )}
                {edit && (
                  <button
                    aria-label={`Remove option ${o.label}`}
                    disabled={(slide.options ?? []).length <= 2}
                    onClick={() => onChange?.({ options: slide.options!.filter(x => x.id !== o.id) })}
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {edit && (
            <button
              className="slide-add-option"
              disabled={(slide.options ?? []).length >= SLIDE_OPTIONS_MAX}
              onClick={() =>
                onChange?.({
                  options: [
                    ...(slide.options ?? []),
                    { id: uid(), label: `Option ${(slide.options?.length ?? 0) + 1}`, votes: 0 },
                  ],
                })
              }
            >
              <Plus size={12} /> Option
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CanvasDeck({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = item.data as DeckData,
    [index, setIndex] = useState(() => Math.min(d.current, d.slides.length - 1)),
    current = Math.min(index, d.slides.length - 1),
    slide = d.slides[current],
    locked = !!item.locked;
  useEffect(() => {
    if (index > d.slides.length - 1) setIndex(d.slides.length - 1);
  }, [index, d.slides.length]);
  /** Edits operate on the visible slide; the resulting selection is kept and persisted. */
  const set = (fn: (x: DeckData) => DeckData) => {
    let selected = current;
    changeData<DeckData>(item, ctx, x => {
      const next = fn({ ...x, current: Math.min(current, x.slides.length - 1) });
      selected = next.current;
      return next;
    });
    setIndex(selected);
  };
  const add = (choice: string) => {
    if (choice.startsWith('layout:')) set(x => insertSlide(x, newSlide(choice.slice(7) as SlideLayout)));
    else {
      const t = slideTemplates.find(t => t.id === choice.slice(9));
      if (t) set(x => insertSlide(x, t.make()));
    }
  };
  return (
    <div className="canvas-deck canvas-interactive" onDoubleClick={e => e.stopPropagation()}>
      <div className="canvas-deck-header canvas-widget-header">
        <span>{item.text || 'Slides'}</span>
        <div {...canvasControl} className="canvas-deck-tools">
          <button aria-label="Previous slide" disabled={current === 0} onClick={() => setIndex(current - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span aria-live="polite">
            {current + 1} / {d.slides.length}
          </span>
          <button
            aria-label="Next slide"
            disabled={current >= d.slides.length - 1}
            onClick={() => setIndex(current + 1)}
          >
            <ChevronRight size={14} />
          </button>
          <button
            aria-label="Present deck"
            onClick={() =>
              window.dispatchEvent(new CustomEvent(DECK_EVENT, { detail: { id: item.id, index: current } }))
            }
          >
            <Play size={13} /> Present
          </button>
        </div>
      </div>
      <fieldset className="canvas-deck-bar" disabled={locked} {...canvasControl}>
        <select
          aria-label="Add slide"
          value=""
          disabled={d.slides.length >= DECK_MAX}
          onChange={e => {
            add(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="">+ Add slide…</option>
          <optgroup label="Blank">
            {slideLayouts
              .filter(l => l !== 'activity')
              .map(l => (
                <option key={l} value={`layout:${l}`}>
                  {slideLayoutLabels[l]}
                </option>
              ))}
          </optgroup>
          <optgroup label="Templates">
            {slideTemplates.map(t => (
              <option key={t.id} value={`template:${t.id}`}>
                {t.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Activity">
            <option value="layout:activity">Poll question</option>
          </optgroup>
        </select>
        <select
          aria-label="Slide layout"
          value={slide.layout}
          onChange={e => set(x => setSlideLayout(x, slide.id, e.target.value as SlideLayout))}
        >
          {slideLayouts.map(l => (
            <option key={l} value={l}>
              {slideLayoutLabels[l]}
            </option>
          ))}
        </select>
        <label className="color-chip" title="Slide background">
          <input
            type="color"
            aria-label="Slide background"
            value={slide.background}
            onChange={e => set(x => updateSlide(x, slide.id, { background: e.target.value }))}
          />
          <span style={{ background: slide.background }} />
        </label>
        <button
          aria-label="Duplicate slide"
          disabled={d.slides.length >= DECK_MAX}
          onClick={() => set(x => duplicateSlide(x))}
        >
          <Copy size={13} />
        </button>
        <button aria-label="Delete slide" disabled={d.slides.length <= 1} onClick={() => set(x => deleteSlide(x))}>
          <Trash2 size={13} />
        </button>
        {slide.layout === 'activity' && (
          <button aria-label="Reset votes" onClick={() => set(x => resetVotes(x, slide.id))}>
            <RotateCcw size={13} />
          </button>
        )}
      </fieldset>
      <div className="canvas-deck-stage" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
        <SlideFace
          key={slide.id}
          slide={slide}
          edit={!locked}
          onChange={change => set(x => updateSlide(x, slide.id, change))}
          onVote={locked ? undefined : (id, delta) => set(x => voteOption(x, slide.id, id, delta))}
        />
      </div>
      <ol className="canvas-deck-strip" aria-label="Slides" {...canvasControl}>
        {d.slides.map((s, k) => (
          <li key={s.id}>
            <button
              aria-current={k === current ? 'true' : undefined}
              aria-describedby={`${item.id}-strip-hint`}
              style={{ background: s.background }}
              className={darkBackground(s.background) ? 'slide-dark' : ''}
              onClick={() => setIndex(k)}
              onKeyDown={e => {
                e.stopPropagation();
                if (locked || !e.altKey || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                e.preventDefault();
                const strip = e.currentTarget.closest('ol');
                setIndex(k);
                set(x => moveSlide({ ...x, current: k }, k, e.key === 'ArrowLeft' ? -1 : 1));
                requestAnimationFrame(() =>
                  (strip?.querySelector('[aria-current="true"]') as HTMLElement | null)?.focus(),
                );
              }}
            >
              <b>
                <span className="sr-only">Slide </span>
                {k + 1}
              </b>{' '}
              <span>{s.title || slideLayoutLabels[s.layout]}</span>
            </button>
          </li>
        ))}
      </ol>
      <p id={`${item.id}-strip-hint`} className="sr-only">
        Alt plus left or right arrow moves the focused slide.
      </p>
    </div>
  );
}

/** Full-screen deck presentation, opened by the Present action. Arrow keys move; Escape exits. */
export function DeckPresenter({
  board,
  update,
  boardRef,
}: {
  board: Board;
  update: (board: Board) => void;
  boardRef: { current: Board };
}) {
  const [target, setTarget] = useState<{ id: string; index: number } | null>(null),
    close = useRef<HTMLButtonElement>(null),
    opener = useRef<Element | null>(null);
  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id) {
        opener.current = document.activeElement;
        setTarget({ id: String(detail.id), index: Number(detail.index) || 0 });
      }
    };
    addEventListener(DECK_EVENT, open);
    return () => removeEventListener(DECK_EVENT, open);
  }, []);
  const item = target ? board.items.find(i => i.id === target.id && i.type === 'slides') : undefined,
    deck = item?.data as DeckData | undefined,
    index = deck && target ? Math.max(0, Math.min(target.index, deck.slides.length - 1)) : 0;
  const exit = () => {
    setTarget(null);
    (opener.current as HTMLElement | null)?.focus?.();
  };
  useEffect(() => {
    if (target && !deck) setTarget(null);
  }, [target, deck]);
  useEffect(() => {
    if (deck) close.current?.focus();
  }, [!!deck]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!target || !item || !deck) return null;
  const go = (k: number) => setTarget({ id: item.id, index: Math.max(0, Math.min(deck.slides.length - 1, k)) });
  const slide = deck.slides[index];
  return (
    <div
      className="deck-presenter"
      role="dialog"
      aria-modal="true"
      aria-label={`Presenting ${item.text || 'deck'}`}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          exit();
        } else if (
          ['ArrowRight', 'PageDown'].includes(e.key) ||
          (e.key === ' ' && !(e.target as HTMLElement).closest('button'))
        ) {
          e.preventDefault();
          go(index + 1);
        } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
          e.preventDefault();
          go(index - 1);
        } else if (e.key === 'Home') {
          e.preventDefault();
          go(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          go(deck.slides.length - 1);
        }
        if (e.key !== 'Tab') e.stopPropagation();
      }}
    >
      <div className="deck-presenter-stage">
        <SlideFace
          slide={slide}
          edit={false}
          onVote={
            item.locked
              ? undefined
              : (optionId, delta) => {
                  const current = boardRef.current.items.find(i => i.id === item.id);
                  if (!current || current.locked) return;
                  const next = { ...current, data: voteOption(current.data as DeckData, slide.id, optionId, delta) };
                  update({
                    ...boardRef.current,
                    items: boardRef.current.items.map(i => (i.id === item.id ? next : i)),
                  });
                }
          }
        />
      </div>
      <div className="deck-presenter-bar">
        <button aria-label="Previous slide" disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeft size={18} />
        </button>
        <span aria-live="polite">
          {index + 1} / {deck.slides.length}
        </span>
        <button aria-label="Next slide" disabled={index >= deck.slides.length - 1} onClick={() => go(index + 1)}>
          <ChevronRight size={18} />
        </button>
        <button ref={close} aria-label="Exit presentation" onClick={exit}>
          <X size={18} /> Exit
        </button>
      </div>
    </div>
  );
}

function CanvasOpenEnded({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const d = item.data as OpenEndedData,
    [draft, setDraft] = useState(''),
    locked = !!item.locked,
    set = (fn: (x: OpenEndedData) => OpenEndedData) => changeData<OpenEndedData>(item, ctx, fn);
  const submit = () => {
    const next = addResponse(d, draft);
    if (!next) return;
    set(x => addResponse(x, draft) ?? x);
    setDraft('');
  };
  return (
    <div className="canvas-advanced canvas-open" onDoubleClick={e => e.stopPropagation()}>
      <div className="canvas-advanced-header canvas-widget-header">
        <span>
          {item.text || 'Open-ended'} · {d.responses.length} {d.responses.length === 1 ? 'response' : 'responses'}
        </span>
      </div>
      <div className="canvas-advanced-body" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
        <fieldset disabled={locked}>
          <CanvasField
            label="Open-ended prompt"
            value={d.prompt}
            maxLength={300}
            onCommit={prompt => set(x => ({ ...x, prompt }))}
          />
          <div className="canvas-open-add">
            <input
              aria-label="New response"
              placeholder="Type a response and press Enter"
              maxLength={OPEN_LEN}
              value={draft}
              disabled={d.responses.length >= OPEN_MAX}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button disabled={!draft.trim()} onClick={submit}>
              Add
            </button>
          </div>
          <ul className="canvas-open-list" aria-label="Responses">
            {d.responses.map(r => (
              <li key={r.id}>
                <span>{r.text}</span>
                <button
                  aria-label={`Remove response: ${r.text}`}
                  onClick={() => set(x => ({ ...x, responses: x.responses.filter(y => y.id !== r.id) }))}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
            {!d.responses.length && <li className="canvas-open-empty">Responses appear here</li>}
          </ul>
        </fieldset>
      </div>
    </div>
  );
}

export const activityViews: WidgetView[] = [
  {
    kind: 'slides',
    mode: 'html',
    interactive: true,
    Render: p => <CanvasDeck {...p} />,
    actions: (item, ctx) => [
      {
        label: 'Present deck',
        icon: <Play size={17} />,
        run: () => window.dispatchEvent(new CustomEvent(DECK_EVENT, { detail: { id: item.id, index: 0 } })),
      },
      {
        label: 'Add slide',
        icon: <Plus size={17} />,
        disabled: !!item.locked || (item.data as DeckData).slides.length >= DECK_MAX,
        run: () => {
          const d = item.data as DeckData;
          changeData<DeckData>(item, ctx, x =>
            insertSlide({ ...x, current: x.slides.length - 1 }, newSlide('content')),
          );
          ctx.display(`Slide ${d.slides.length + 1} added at the end.`);
        },
      },
    ],
  },
  {
    kind: 'openended',
    mode: 'html',
    interactive: true,
    Render: p => <CanvasOpenEnded {...p} />,
    actions: (item, ctx) => [
      {
        label: 'Convert responses to sticky notes',
        icon: <StickyNote size={17} />,
        disabled: !(item.data as OpenEndedData).responses.length,
        run: () => {
          let count = 0;
          ctx.update(b => {
            const r = responsesToNotes(b, item.id, (t, x, y) => createItem(t, x, y));
            count = r.ids.length;
            return r.board;
          });
          ctx.display(`${count} sticky ${count === 1 ? 'note' : 'notes'} created. Undo removes them.`);
        },
      },
    ],
  },
];
