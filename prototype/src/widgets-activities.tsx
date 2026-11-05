// Canvas views for Slides decks (item 78), PowerPoint import (item 84) and open-ended activities (item 82).
// Track D adds scale, word cloud and open-ended slide layouts, slide images (PNG) and a slide sorter that
// opens in the full-viewport focus view.
import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  Trash2,
  Play,
  X,
  StickyNote,
  Plus,
  RotateCcw,
  NotebookPen,
  Image as ImageIcon,
  Images,
  LayoutGrid,
} from 'lucide-react';
import type { Board, Item } from './model';
import { createItem } from './model';
import type { WidgetView, WidgetCtx } from './widget-types';
import { validateWidget } from './widget-specs';
import { CanvasField, canvasControl } from './canvas-fields';
import {
  slideLayouts,
  slideLayoutLabels,
  slideTemplates,
  activityLayouts,
  newSlide,
  insertSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  reorderSlide,
  gridStep,
  updateSlide,
  setSlideLayout,
  voteOption,
  resetVotes,
  hasResponses,
  rateScale,
  setScaleMax,
  scaleSummary,
  addWord,
  removeWord,
  wordCloudLayout,
  addAnswer,
  removeAnswer,
  addResponse,
  responsesToNotes,
  DECK_MAX,
  SLIDE_TITLE_MAX,
  SLIDE_BODY_MAX,
  SLIDE_OPTIONS_MAX,
  SLIDE_NOTES_MAX,
  SLIDE_WORD_LEN,
  SLIDE_WORDS_MAX,
  SLIDE_ANSWER_LEN,
  SLIDE_ANSWERS_MAX,
  OPEN_LEN,
  OPEN_MAX,
} from './specs-activities';
import type { DeckData, Slide, SlideLayout, OpenEndedData } from './specs-activities';
import { StatusChip, statusAction } from './status-chip';
import { saveBlobFile } from './widget-kit';
import { pdfFileName } from './doc-pdf';
import { FocusView } from './focus-view';
import './widgets-activities.css';
import { BrandSwatches } from './brand-kit-panel';

export const DECK_EVENT = 'boardroom:present-deck';
/** Ask a canvas deck to show a slide (detail { id, index }), e.g. the one chosen in the slide sorter. */
const DECK_SHOW_EVENT = 'boardroom:deck-show';
const SLIDE_MIME = 'application/x-boardroom-slide';
const uid = () => crypto.randomUUID();
/** The slide each canvas deck shows, so selection-bar actions act on the visible slide. */
const shownSlide = new Map<string, number>();
const visibleIndex = (item: Item) =>
  Math.min(shownSlide.get(item.id) ?? (item.data as DeckData).current, (item.data as DeckData).slides.length - 1);

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

/** A one-line response box: Enter or Add submits and clears it. */
function ResponseInput({
  label,
  placeholder,
  maxLength,
  disabled,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  maxLength: number;
  disabled?: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text);
    setText('');
  };
  return (
    <div className="slide-response-add">
      <input
        aria-label={label}
        placeholder={placeholder}
        maxLength={maxLength}
        value={text}
        disabled={disabled}
        onPointerDown={e => e.stopPropagation()}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button disabled={disabled || !text.trim()} onClick={submit}>
        Add
      </button>
    </div>
  );
}

/** Apply a deck change from a slide (votes, ratings, words, answers). */
type Respond = (change: (deck: DeckData) => DeckData) => void;

/** One slide. Editable on the canvas; read-only (apart from responding) when presenting or as a thumbnail. */
function SlideFace({
  slide,
  edit,
  onChange,
  onRespond,
}: {
  slide: Slide;
  edit: boolean;
  onChange?: (change: Partial<Slide>) => void;
  onRespond?: Respond;
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
                {onRespond && (
                  <button
                    aria-label={`+1 vote for ${o.label}`}
                    onClick={() => onRespond(d => voteOption(d, slide.id, o.id, 1))}
                  >
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
      {slide.layout === 'scale' && slide.scale && (
        <>
          {field('title', 'Scale statement', false, 'slide-heading')}
          <ScaleTally slide={slide} onRespond={onRespond} />
        </>
      )}
      {slide.layout === 'wordcloud' && (
        <>
          {field('title', 'Word cloud question', false, 'slide-heading')}
          {onRespond && (
            <ResponseInput
              label="Add a word"
              placeholder="Type a word and press Enter"
              maxLength={SLIDE_WORD_LEN}
              disabled={(slide.words ?? []).length >= SLIDE_WORDS_MAX}
              onSubmit={text => onRespond(d => addWord(d, slide.id, text))}
            />
          )}
          <ul className="slide-cloud" aria-label="Word cloud">
            {wordCloudLayout(slide.words ?? [], 2.2, 7).map(w => (
              <li
                key={w.text.toLowerCase()}
                className="slide-cloud-word"
                style={{ fontSize: `${w.size}cqw` }}
                title={`${w.text}: ${w.count}`}
              >
                {w.text}
                <span className="sr-only"> ({w.count})</span>
                {edit && (
                  <button
                    aria-label={`Remove word ${w.text}`}
                    onClick={() => onRespond?.(d => removeWord(d, slide.id, w.text))}
                  >
                    <X size={10} />
                  </button>
                )}
              </li>
            ))}
            {!slide.words?.length && (
              <li className="slide-empty">Words appear here, sized by how often they are entered</li>
            )}
          </ul>
        </>
      )}
      {slide.layout === 'answers' && (
        <>
          {field('title', 'Open-ended question', false, 'slide-heading')}
          {onRespond && (
            <ResponseInput
              label="Add an answer"
              placeholder="Type an answer and press Enter"
              maxLength={SLIDE_ANSWER_LEN}
              disabled={(slide.answers ?? []).length >= SLIDE_ANSWERS_MAX}
              onSubmit={text => onRespond(d => addAnswer(d, slide.id, text))}
            />
          )}
          <ul className="slide-answers" aria-label="Answers">
            {(slide.answers ?? []).map(a => (
              <li key={a.id}>
                <span>{a.text}</span>
                {edit && (
                  <button
                    aria-label={`Remove answer: ${a.text}`}
                    onClick={() => onRespond?.(d => removeAnswer(d, slide.id, a.id))}
                  >
                    <X size={10} />
                  </button>
                )}
              </li>
            ))}
            {!slide.answers?.length && <li className="slide-empty">Answers appear here</li>}
          </ul>
        </>
      )}
    </div>
  );
}

/** Rating buttons with a bar per rating, plus the count and average. */
function ScaleTally({ slide, onRespond }: { slide: Slide; onRespond?: Respond }) {
  const scale = slide.scale!,
    top = Math.max(1, ...scale.votes),
    { total, average } = scaleSummary(scale);
  return (
    <div className="slide-scale">
      <ol className="slide-scale-bars" aria-label={`Ratings from 1 to ${scale.max}`}>
        {scale.votes.map((v, k) => (
          <li key={k}>
            <b aria-hidden="true">{v}</b>
            <div className="slide-scale-bar" style={{ height: `${(v / top) * 100}%` }} />
            {onRespond ? (
              <button
                aria-label={`Rate ${k + 1} (${v} ${v === 1 ? 'rating' : 'ratings'})`}
                onClick={() => onRespond(d => rateScale(d, slide.id, k + 1))}
              >
                {k + 1}
              </button>
            ) : (
              <span aria-label={`${k + 1}: ${v} ${v === 1 ? 'rating' : 'ratings'}`}>{k + 1}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="slide-scale-summary" aria-live="polite">
        {total} {total === 1 ? 'rating' : 'ratings'}
        {total ? ` · average ${average}` : ''}
      </p>
    </div>
  );
}

/** Deck state for an editing surface: the visible slide index (local) and changes applied as one undo step. */
function useDeckEditing(item: Item, ctx: WidgetCtx, initial: number) {
  const d = item.data as DeckData,
    [index, setIndex] = useState(() => Math.max(0, Math.min(initial, d.slides.length - 1))),
    current = Math.min(index, d.slides.length - 1),
    slide = d.slides[current];
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
  return { d, current, slide, setIndex, set, locked: !!item.locked };
}
type DeckEditing = ReturnType<typeof useDeckEditing>;

/** Add slide, layout, background, duplicate, delete and response controls for the visible slide. */
function DeckBar({ deck }: { deck: DeckEditing }) {
  const { d, slide, set, locked } = deck;
  const add = (choice: string) => {
    if (choice.startsWith('layout:')) set(x => insertSlide(x, newSlide(choice.slice(7) as SlideLayout)));
    else {
      const t = slideTemplates.find(t => t.id === choice.slice(9));
      if (t) set(x => insertSlide(x, t.make()));
    }
  };
  return (
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
            .filter(l => !activityLayouts.includes(l))
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
          <option value="layout:scale">Scale (1–5 or 1–10)</option>
          <option value="layout:wordcloud">Word cloud</option>
          <option value="layout:answers">Open-ended answers</option>
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
      {slide.layout === 'scale' && slide.scale && (
        <select
          aria-label="Scale range"
          value={slide.scale.max}
          onChange={e => set(x => setScaleMax(x, slide.id, Number(e.target.value) === 10 ? 10 : 5))}
        >
          <option value={5}>1–5</option>
          <option value={10}>1–10</option>
        </select>
      )}
      <label className="color-chip" title="Slide background">
        <input
          type="color"
          aria-label="Slide background"
          value={slide.background}
          onChange={e => set(x => updateSlide(x, slide.id, { background: e.target.value }))}
        />
        <span style={{ background: slide.background }} />
      </label>
      <BrandSwatches
        label="Brand colours for slide background"
        value={slide.background}
        onPick={c => set(x => updateSlide(x, slide.id, { background: c }))}
      />
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
      {activityLayouts.includes(slide.layout) && (
        <button
          aria-label={slide.layout === 'activity' ? 'Reset votes' : 'Reset responses'}
          disabled={!hasResponses(slide)}
          onClick={() => set(x => resetVotes(x, slide.id))}
        >
          <RotateCcw size={13} />
        </button>
      )}
    </fieldset>
  );
}

/** The editable visible slide. */
function DeckStage({ deck }: { deck: DeckEditing }) {
  const { slide, set, locked } = deck;
  return (
    <div className="canvas-deck-stage" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
      <SlideFace
        key={slide.id}
        slide={slide}
        edit={!locked}
        onChange={change => set(x => updateSlide(x, slide.id, change))}
        onRespond={locked ? undefined : set}
      />
    </div>
  );
}

function DeckNotes({ deck }: { deck: DeckEditing }) {
  const { slide, set, locked } = deck;
  return (
    <div className="canvas-deck-notes" {...canvasControl} onKeyDown={e => e.stopPropagation()}>
      {locked ? (
        slide.notes && <p>{slide.notes}</p>
      ) : (
        <CanvasField
          key={slide.id}
          label="Presenter notes for this slide"
          placeholder="Presenter notes (shown only to you while presenting)"
          value={slide.notes ?? ''}
          multiline
          maxLength={SLIDE_NOTES_MAX}
          onCommit={notes =>
            set(x => {
              const next = updateSlide(x, slide.id, { notes });
              if (!notes.trim()) delete next.slides.find(s => s.id === slide.id)!.notes;
              return next;
            })
          }
        />
      )}
    </div>
  );
}

function CanvasDeck({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const deck = useDeckEditing(item, ctx, (item.data as DeckData).current),
    { d, current, setIndex, set, locked } = deck;
  useEffect(() => {
    shownSlide.set(item.id, current);
  }, [item.id, current]);
  useEffect(() => () => void shownSlide.delete(item.id), [item.id]);
  useEffect(() => {
    const show = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id === item.id && Number.isInteger(detail.index)) setIndex(detail.index);
    };
    addEventListener(DECK_SHOW_EVENT, show);
    return () => removeEventListener(DECK_SHOW_EVENT, show);
  }, [item.id, setIndex]);
  return (
    <div className="canvas-deck canvas-interactive" onDoubleClick={e => e.stopPropagation()}>
      <div className="canvas-deck-header canvas-widget-header">
        <span>{item.text || 'Slides'}</span>
        <StatusChip status={item.data?.status} />
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
          {ctx.openEditor && !locked && (
            <button aria-label="Open slide sorter" title="Slide sorter" onClick={() => ctx.openEditor!()}>
              <LayoutGrid size={13} />
            </button>
          )}
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
      <DeckBar deck={deck} />
      <DeckStage deck={deck} />
      <DeckNotes deck={deck} />
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

/**
 * Slide sorter in the full-viewport focus view: a grid of slide thumbnails (drag and drop, or Alt+arrow keys
 * to reorder; arrows move between slides; Enter or a click selects) beside the editor for the selected slide.
 */
function SlideSorter({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const deck = useDeckEditing(item, ctx, visibleIndex(item)),
    { d, current, setIndex, set, locked } = deck,
    grid = useRef<HTMLOListElement>(null),
    [dropAt, setDropAt] = useState<number | null>(null),
    [message, setMessage] = useState('');
  const focusSlide = (k: number) =>
    requestAnimationFrame(() => grid.current?.querySelectorAll<HTMLElement>('.slide-thumb')[k]?.focus());
  const columns = () => {
    const thumbs = [...(grid.current?.querySelectorAll<HTMLElement>('.slide-thumb') ?? [])];
    if (!thumbs.length) return 1;
    const top = thumbs[0].offsetTop;
    return Math.max(1, thumbs.filter(t => t.offsetTop === top).length);
  };
  const move = (from: number, to: number) => {
    if (locked || from === to) return;
    setIndex(from);
    set(x => reorderSlide({ ...x, current: from }, from, to));
    setMessage(`Slide moved to position ${to + 1} of ${d.slides.length}.`);
    focusSlide(to);
  };
  const close = () => {
    window.dispatchEvent(new CustomEvent(DECK_SHOW_EVENT, { detail: { id: item.id, index: current } }));
    onClose();
  };
  return (
    <FocusView
      title={`Slide sorter · ${item.text || 'Slides'}`}
      hint="Drag slides, or press Alt with an arrow key, to reorder. Select a slide to edit it."
      closeLabel="Close slide sorter"
      initialFocus=".slide-thumb[aria-current='true']"
      onClose={close}
      className="slide-sorter-view"
      headerExtra={
        <button
          className="slide-sorter-present"
          onClick={() => {
            close();
            window.dispatchEvent(new CustomEvent(DECK_EVENT, { detail: { id: item.id, index: current } }));
          }}
        >
          <Play size={14} /> Present
        </button>
      }
    >
      <div className="focus-view-body slide-sorter">
        <section className="slide-sorter-grid-wrap" aria-label="Slide sorter">
          <ol ref={grid} className="slide-sorter-grid" aria-describedby={`${item.id}-sorter-hint`}>
            {d.slides.map((s, k) => (
              <li
                key={s.id}
                className={`${dropAt === k ? 'slide-drop-target' : ''}`}
                draggable={!locked}
                onDragStart={e => {
                  e.dataTransfer.setData(SLIDE_MIME, String(k));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={e => {
                  if (!e.dataTransfer.types.includes(SLIDE_MIME)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropAt !== k) setDropAt(k);
                }}
                onDragLeave={() => setDropAt(at => (at === k ? null : at))}
                onDrop={e => {
                  const from = Number(e.dataTransfer.getData(SLIDE_MIME));
                  setDropAt(null);
                  if (!Number.isInteger(from)) return;
                  e.preventDefault();
                  move(from, k);
                }}
                onDragEnd={() => setDropAt(null)}
              >
                <button
                  className="slide-thumb"
                  aria-current={k === current ? 'true' : undefined}
                  tabIndex={k === current ? 0 : -1}
                  onClick={() => setIndex(k)}
                  onKeyDown={e => {
                    const to = gridStep(k, d.slides.length, columns(), e.key);
                    if (to === null) return;
                    e.preventDefault();
                    if (e.altKey) move(k, to);
                    else {
                      setIndex(to);
                      focusSlide(to);
                    }
                  }}
                >
                  <span className="slide-thumb-face" aria-hidden="true">
                    <SlideFace slide={s} edit={false} />
                  </span>
                  <span className="slide-thumb-caption">
                    <span className="sr-only">Slide </span>
                    <b>{k + 1}</b>
                    <span className="sr-only"> of {d.slides.length}:</span> {s.title || slideLayoutLabels[s.layout]}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p id={`${item.id}-sorter-hint`} className="sr-only">
            Arrow keys move between slides. Alt plus an arrow key moves the focused slide.
          </p>
          <p className="sr-only" aria-live="polite">
            {message}
          </p>
        </section>
        <section className="slide-sorter-editor canvas-deck" aria-label={`Edit slide ${current + 1}`}>
          <DeckBar deck={deck} />
          <DeckStage deck={deck} />
          <DeckNotes deck={deck} />
        </section>
      </div>
    </FocusView>
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
    [showNotes, setShowNotes] = useState(false),
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
        // Typing a word or an answer must not change slides.
        if ((e.target as HTMLElement).closest('input,textarea') && e.key !== 'Escape') {
          e.stopPropagation();
          return;
        }
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
        } else if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setShowNotes(s => !s);
        }
        if (e.key !== 'Tab') e.stopPropagation();
      }}
    >
      <div className="deck-presenter-stage">
        <SlideFace
          slide={slide}
          edit={false}
          onRespond={
            item.locked
              ? undefined
              : change => {
                  const current = boardRef.current.items.find(i => i.id === item.id);
                  if (!current || current.locked) return;
                  const next = { ...current, data: change(current.data as DeckData) };
                  try {
                    validateWidget(next);
                  } catch {
                    return;
                  }
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
        <button
          aria-label="Presenter notes"
          aria-pressed={showNotes}
          title="Presenter notes (N)"
          onClick={() => setShowNotes(!showNotes)}
        >
          <NotebookPen size={18} />
        </button>
        <button ref={close} aria-label="Exit presentation" onClick={exit}>
          <X size={18} /> Exit
        </button>
      </div>
      {showNotes && (
        <aside className="deck-presenter-notes" aria-label="Presenter notes">
          <h2>Notes</h2>
          {slide.notes || 'No notes for this slide.'}
        </aside>
      )}
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
    Editor: p => <SlideSorter {...p} />,
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
      {
        // Deck as PDF, one page per slide (gap G13).
        label: 'Export PDF',
        icon: <FileDown size={17} />,
        run: () => {
          void import('./deck-tools')
            .then(m => m.deckPdf(item.text || 'Slides', item.data as DeckData))
            .then(blob => saveBlobFile(blob, pdfFileName(item.text || 'Slides')))
            .catch(() => ctx.display('The deck could not be exported as PDF.'));
        },
      },
      {
        // The visible slide as a 1920×1080 PNG (track D).
        label: 'Export slide as PNG',
        icon: <ImageIcon size={17} />,
        run: () => {
          const d = item.data as DeckData,
            k = visibleIndex(item);
          void import('./deck-tools')
            .then(async m => {
              const blob = await m.slidePng(d.slides[k]);
              saveBlobFile(blob, m.slidePngName(item.text || 'Slides', k, d.slides.length));
              ctx.display(`Slide ${k + 1} exported as PNG.`);
            })
            .catch(() => ctx.display('The slide could not be exported as PNG.'));
        },
      },
      {
        label: 'Export all slides as PNG (ZIP)',
        icon: <Images size={17} />,
        run: () => {
          const d = item.data as DeckData,
            title = item.text || 'Slides';
          void import('./deck-tools')
            .then(async m => {
              saveBlobFile(await m.deckPngZip(title, d), `${pdfFileName(title).replace(/\.pdf$/i, '')} - slides.zip`);
              ctx.display(`${d.slides.length} ${d.slides.length === 1 ? 'slide' : 'slides'} exported as PNG files.`);
            })
            .catch(() => ctx.display('The slides could not be exported as PNG.'));
        },
      },
      statusAction(item, ctx),
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
