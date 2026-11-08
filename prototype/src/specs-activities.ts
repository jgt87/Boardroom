// Slides decks (item 78) and open-ended activities (item 82). Pure: specs, validation and editing helpers.
// Evidence: Slides were created live with Add blank slide / Add template / Add activity controls; the tool
// catalogue lists Engage activities → Open-ended. Both run on this device only.
import type { Board, Item, WidgetKind } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import { validateItemStatus } from './board-settings.ts';
import { validateSlideElements, elementText } from './slide-elements.ts';
import type { SlideElement } from './slide-elements.ts';

export const slideLayouts = [
  'title',
  'content',
  'section',
  'two',
  'quote',
  'blank',
  'activity',
  'scale',
  'wordcloud',
  'answers',
] as const;
export type SlideLayout = (typeof slideLayouts)[number];
export const slideLayoutLabels: Record<SlideLayout, string> = {
  title: 'Title',
  content: 'Title and content',
  section: 'Section header',
  two: 'Two columns',
  quote: 'Quote',
  blank: 'Blank',
  activity: 'Activity (poll)',
  scale: 'Activity (scale)',
  wordcloud: 'Activity (word cloud)',
  answers: 'Activity (open-ended)',
};
/** Layouts that collect responses on this device (poll, scale, word cloud, open-ended). */
export const activityLayouts: readonly SlideLayout[] = ['activity', 'scale', 'wordcloud', 'answers'];
export type SlideOption = { id: string; label: string; votes: number };
/** Rating scale: `votes[k]` is the number of ratings of k + 1. */
export type SlideScale = { max: 5 | 10; votes: number[] };
export type SlideWord = { text: string; count: number };
export type SlideAnswer = { id: string; text: string };
export type Slide = {
  id: string;
  layout: SlideLayout;
  title: string;
  body: string;
  /** Second column for the two-column layout. */
  body2?: string;
  background: string;
  /** Poll options for activity slides. */
  options?: SlideOption[];
  /** Rating tallies for scale slides. */
  scale?: SlideScale;
  /** Submitted words for word cloud slides (one entry per distinct word, case-insensitive). */
  words?: SlideWord[];
  /** Collected answers for open-ended slides. */
  answers?: SlideAnswer[];
  /** Presenter notes, shown only to the presenter (N while presenting the deck). */
  notes?: string;
  /**
   * Positioned text boxes, pictures and videos (R4-Q2: PowerPoint layouts, PDF pages, frame images). A blank
   * slide with elements draws only them; other layouts draw them over their fields. Optional: older decks load.
   */
  elements?: SlideElement[];
};
export const SLIDE_NOTES_MAX = 2000;
export type DeckData = { slides: Slide[]; current: number };
export const DECK_MAX = 100;
export const SLIDE_TITLE_MAX = 300;
export const SLIDE_BODY_MAX = 4000;
export const SLIDE_OPTIONS_MAX = 8;
/** Most distinct words in a word cloud, longest word, most answers on an open-ended slide, longest answer. */
export const SLIDE_WORDS_MAX = 100;
export const SLIDE_WORD_LEN = 40;
export const SLIDE_ANSWERS_MAX = 200;
export const SLIDE_ANSWER_LEN = 500;
const TALLY_MAX = 100000;
const defaultTitles: Partial<Record<SlideLayout, string>> = {
  activity: 'What should we focus on next?',
  scale: 'How confident are we in this plan?',
  wordcloud: 'Describe this week in one word',
  answers: 'What is one thing we should change?',
};

const uid = () => crypto.randomUUID();
const fail = (message: string): never => {
  throw new Error(message);
};
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const tally = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= TALLY_MAX;
/** Words are grouped case-insensitively with inner spaces collapsed. */
const wordKey = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function newSlide(layout: SlideLayout = 'content', fields: Partial<Omit<Slide, 'id' | 'layout'>> = {}): Slide {
  const slide: Slide = {
    id: uid(),
    layout,
    title: fields.title ?? (layout === 'blank' ? '' : (defaultTitles[layout] ?? 'Title')),
    body: fields.body ?? (layout === 'content' ? 'Add your key points' : ''),
    background: fields.background ?? (layout === 'section' ? '#25252c' : '#ffffff'),
  };
  if (layout === 'two' || fields.body2 !== undefined) slide.body2 = fields.body2 ?? 'Second column';
  if (layout === 'activity')
    slide.options =
      fields.options ?? ['Option A', 'Option B', 'Option C'].map(label => ({ id: uid(), label, votes: 0 }));
  if (layout === 'scale') slide.scale = fields.scale ?? emptyScale(5);
  if (layout === 'wordcloud') slide.words = fields.words ?? [];
  if (layout === 'answers') slide.answers = fields.answers ?? [];
  return slide;
}
export const emptyScale = (max: 5 | 10): SlideScale => ({ max, votes: Array(max).fill(0) });

/** Slide templates offered by "Add template". */
export const slideTemplates: { id: string; label: string; make: () => Slide }[] = [
  {
    id: 'cover',
    label: 'Cover',
    make: () => newSlide('title', { title: 'Presentation title', body: 'Presenter name · date' }),
  },
  {
    id: 'agenda',
    label: 'Agenda',
    make: () =>
      newSlide('content', { title: 'Agenda', body: '1. Context\n2. Discussion\n3. Decisions\n4. Next steps' }),
  },
  {
    id: 'compare',
    label: 'Comparison',
    make: () =>
      newSlide('two', { title: 'Options', body: 'Option A\n- Benefit\n- Cost', body2: 'Option B\n- Benefit\n- Cost' }),
  },
  {
    id: 'quote',
    label: 'Quote',
    make: () => newSlide('quote', { title: '“Make it simple, but significant.”', body: 'Source' }),
  },
  { id: 'section', label: 'Section break', make: () => newSlide('section', { title: 'Next section', body: '' }) },
  {
    id: 'closing',
    label: 'Thank you',
    make: () => newSlide('title', { title: 'Thank you', body: 'Questions?', background: '#eef1ff' }),
  },
];

export function validateDeck(d: DeckData): void {
  if (!Array.isArray(d.slides) || !d.slides.length || d.slides.length > DECK_MAX) fail('A deck has 1–100 slides.');
  if (new Set(d.slides.map(s => s?.id)).size !== d.slides.length) fail('Duplicate slide ids.');
  for (const s of d.slides) {
    if (
      !s ||
      typeof s !== 'object' ||
      !str(s.id, 100) ||
      !s.id ||
      !slideLayouts.includes(s.layout) ||
      !str(s.title, SLIDE_TITLE_MAX) ||
      !str(s.body, SLIDE_BODY_MAX) ||
      (s.body2 !== undefined && !str(s.body2, SLIDE_BODY_MAX)) ||
      (s.notes !== undefined && !str(s.notes, SLIDE_NOTES_MAX)) ||
      !hex(s.background)
    )
      fail('Invalid slide.');
    validateSlideElements(s.elements);
    if (s.options !== undefined) {
      if (
        !Array.isArray(s.options) ||
        s.options.length > SLIDE_OPTIONS_MAX ||
        new Set(s.options.map(o => o?.id)).size !== s.options.length ||
        s.options.some(
          o =>
            !o ||
            !str(o.id, 100) ||
            !o.id ||
            !str(o.label, 200) ||
            !Number.isInteger(o.votes) ||
            o.votes < 0 ||
            o.votes > 100000,
        )
      )
        fail('Invalid activity options.');
    }
    if (s.scale !== undefined) {
      const sc = s.scale;
      if (
        !sc ||
        (sc.max !== 5 && sc.max !== 10) ||
        !Array.isArray(sc.votes) ||
        sc.votes.length !== sc.max ||
        sc.votes.some(v => !tally(v))
      )
        fail('Invalid scale tallies.');
    }
    if (s.words !== undefined) {
      if (
        !Array.isArray(s.words) ||
        s.words.length > SLIDE_WORDS_MAX ||
        s.words.some(w => !w || !str(w.text, SLIDE_WORD_LEN) || !w.text.trim() || !tally(w.count) || w.count < 1) ||
        new Set(s.words.map(w => wordKey(w.text))).size !== s.words.length
      )
        fail('Invalid word cloud.');
    }
    if (s.answers !== undefined) {
      if (
        !Array.isArray(s.answers) ||
        s.answers.length > SLIDE_ANSWERS_MAX ||
        new Set(s.answers.map(a => a?.id)).size !== s.answers.length ||
        s.answers.some(a => !a || !str(a.id, 100) || !a.id || !str(a.text, SLIDE_ANSWER_LEN) || !a.text.trim())
      )
        fail('Invalid open-ended answers.');
    }
  }
  if (!Number.isInteger(d.current) || d.current < 0 || d.current >= d.slides.length) fail('Invalid current slide.');
}

const withSlides = (d: DeckData, slides: Slide[], current: number): DeckData => ({
  ...d,
  slides,
  current: clamp(current, 0, slides.length - 1),
});
/** Insert a slide after the current one and select it. Returns the deck unchanged at the limit. */
export function insertSlide(d: DeckData, slide: Slide): DeckData {
  if (d.slides.length >= DECK_MAX) return d;
  const at = d.current + 1;
  return withSlides(d, [...d.slides.slice(0, at), slide, ...d.slides.slice(at)], at);
}
export function duplicateSlide(d: DeckData, index = d.current): DeckData {
  const s = d.slides[index];
  if (!s) return d;
  const copy = structuredClone(s);
  copy.id = uid();
  if (copy.options) copy.options = copy.options.map(o => ({ ...o, id: uid() }));
  if (copy.answers) copy.answers = copy.answers.map(a => ({ ...a, id: uid() }));
  return insertSlide({ ...d, current: index }, copy);
}
export function deleteSlide(d: DeckData, index = d.current): DeckData {
  if (d.slides.length <= 1 || !d.slides[index]) return d;
  return withSlides(
    d,
    d.slides.filter((_, k) => k !== index),
    index >= d.current ? Math.min(d.current, d.slides.length - 2) : d.current - 1,
  );
}
/** Move a slide by delta positions; the moved slide stays selected. */
export function moveSlide(d: DeckData, index: number, delta: number): DeckData {
  const to = index + delta;
  if (!d.slides[index] || to < 0 || to >= d.slides.length) return d;
  const slides = [...d.slides],
    [s] = slides.splice(index, 1);
  slides.splice(to, 0, s);
  return withSlides(d, slides, to);
}
export function updateSlide(d: DeckData, id: string, change: Partial<Slide>): DeckData {
  return { ...d, slides: d.slides.map(s => (s.id === id ? { ...s, ...change } : s)) };
}
/** Change layout, keeping text and adding the fields the new layout needs. */
export function setSlideLayout(d: DeckData, id: string, layout: SlideLayout): DeckData {
  return {
    ...d,
    slides: d.slides.map(s => {
      if (s.id !== id) return s;
      const next: Slide = { ...s, layout };
      if (layout === 'two' && next.body2 === undefined) next.body2 = '';
      if (layout === 'activity' && !next.options?.length) next.options = newSlide('activity').options;
      if (layout === 'scale' && !next.scale) next.scale = emptyScale(5);
      if (layout === 'wordcloud' && !next.words) next.words = [];
      if (layout === 'answers' && !next.answers) next.answers = [];
      return next;
    }),
  };
}
export function voteOption(d: DeckData, slideId: string, optionId: string, delta = 1): DeckData {
  return {
    ...d,
    slides: d.slides.map(s =>
      s.id !== slideId
        ? s
        : {
            ...s,
            options: s.options?.map(o => (o.id === optionId ? { ...o, votes: clamp(o.votes + delta, 0, 100000) } : o)),
          },
    ),
  };
}
/** Clear the slide's local responses: poll votes, scale ratings, word cloud words and open-ended answers. */
export function resetVotes(d: DeckData, slideId: string): DeckData {
  return mapSlide(d, slideId, s => {
    const next: Slide = { ...s };
    if (s.options) next.options = s.options.map(o => ({ ...o, votes: 0 }));
    if (s.scale) next.scale = emptyScale(s.scale.max);
    if (s.words) next.words = [];
    if (s.answers) next.answers = [];
    return next;
  });
}
const mapSlide = (d: DeckData, slideId: string, fn: (s: Slide) => Slide): DeckData => ({
  ...d,
  slides: d.slides.map(s => (s.id === slideId ? fn(s) : s)),
});
/** True when the slide holds any local responses. */
export function hasResponses(s: Slide): boolean {
  return (
    (s.options ?? []).some(o => o.votes > 0) ||
    (s.scale?.votes ?? []).some(v => v > 0) ||
    !!s.words?.length ||
    !!s.answers?.length
  );
}

// ---- Scale slides -----------------------------------------------------------------------------------------
/** Add (or with a negative delta, remove) one rating of `rating` (1-based). */
export function rateScale(d: DeckData, slideId: string, rating: number, delta = 1): DeckData {
  return mapSlide(d, slideId, s => {
    if (!s.scale || !Number.isInteger(rating) || rating < 1 || rating > s.scale.max) return s;
    const votes = s.scale.votes.map((v, k) => (k === rating - 1 ? clamp(v + delta, 0, TALLY_MAX) : v));
    return { ...s, scale: { ...s.scale, votes } };
  });
}
/** Switch between 1–5 and 1–10. Ratings are cleared, since they do not carry over between ranges. */
export function setScaleMax(d: DeckData, slideId: string, max: 5 | 10): DeckData {
  return mapSlide(d, slideId, s => (s.scale && s.scale.max === max ? s : { ...s, scale: emptyScale(max) }));
}
/** Number of ratings and their average (0 when nobody has rated). */
export function scaleSummary(scale: SlideScale): { total: number; average: number } {
  const total = scale.votes.reduce((n, v) => n + v, 0),
    sum = scale.votes.reduce((n, v, k) => n + v * (k + 1), 0);
  return { total, average: total ? Math.round((sum / total) * 10) / 10 : 0 };
}

// ---- Word cloud slides ------------------------------------------------------------------------------------
/**
 * Add a word (or short phrase) to a word cloud: matching words (ignoring case and extra spaces) are counted
 * together. Returns the deck unchanged when the text is empty or the cloud is full.
 */
export function addWord(d: DeckData, slideId: string, text: string): DeckData {
  const clean = text.trim().replace(/\s+/g, ' ').slice(0, SLIDE_WORD_LEN).trim();
  if (!clean) return d;
  return mapSlide(d, slideId, s => {
    const words = s.words ?? [],
      key = wordKey(clean),
      at = words.findIndex(w => wordKey(w.text) === key);
    if (at >= 0)
      return { ...s, words: words.map((w, k) => (k === at ? { ...w, count: clamp(w.count + 1, 1, TALLY_MAX) } : w)) };
    if (words.length >= SLIDE_WORDS_MAX) return s;
    return { ...s, words: [...words, { text: clean, count: 1 }] };
  });
}
export function removeWord(d: DeckData, slideId: string, text: string): DeckData {
  const key = wordKey(text);
  return mapSlide(d, slideId, s => ({ ...s, words: (s.words ?? []).filter(w => wordKey(w.text) !== key) }));
}
/**
 * Font sizes for a word cloud, most frequent first: sizes grow with the count (square-root scale) between
 * `min` and `max`. Ties keep the order the words were first entered.
 */
export function wordCloudLayout(words: SlideWord[], min = 1, max = 3): { text: string; count: number; size: number }[] {
  if (!words.length) return [];
  const top = Math.max(...words.map(w => w.count)),
    low = Math.min(...words.map(w => w.count)),
    span = Math.sqrt(top) - Math.sqrt(low);
  return words
    .map((w, k) => ({ w, k }))
    .sort((a, b) => b.w.count - a.w.count || a.k - b.k)
    .map(({ w }) => ({
      text: w.text,
      count: w.count,
      size: span ? min + ((Math.sqrt(w.count) - Math.sqrt(low)) / span) * (max - min) : (min + max) / 2,
    }));
}

// ---- Open-ended slides ------------------------------------------------------------------------------------
/** Add a trimmed answer; the deck is unchanged when it is empty or the slide is full. */
export function addAnswer(d: DeckData, slideId: string, text: string): DeckData {
  const clean = text.trim().slice(0, SLIDE_ANSWER_LEN).trim();
  if (!clean) return d;
  return mapSlide(d, slideId, s =>
    (s.answers ?? []).length >= SLIDE_ANSWERS_MAX
      ? s
      : { ...s, answers: [...(s.answers ?? []), { id: uid(), text: clean }] },
  );
}
export function removeAnswer(d: DeckData, slideId: string, answerId: string): DeckData {
  return mapSlide(d, slideId, s => ({ ...s, answers: (s.answers ?? []).filter(a => a.id !== answerId) }));
}

// ---- Slide sorter ------------------------------------------------------------------------------------------
/** Move the slide at `from` to position `to` (drag and drop in the sorter); the moved slide becomes current. */
export function reorderSlide(d: DeckData, from: number, to: number): DeckData {
  if (!d.slides[from] || from === to) return d;
  return moveSlide(d, from, clamp(to, 0, d.slides.length - 1) - from);
}
/** Target index in a grid of `columns` for an arrow key, or null when the key does not move. */
export function gridStep(index: number, count: number, columns: number, key: string): number | null {
  const cols = Math.max(1, columns),
    to =
      key === 'ArrowLeft'
        ? index - 1
        : key === 'ArrowRight'
          ? index + 1
          : key === 'ArrowUp'
            ? index - cols
            : key === 'ArrowDown'
              ? index + cols
              : key === 'Home'
                ? 0
                : key === 'End'
                  ? count - 1
                  : null;
  if (to === null) return null;
  return to < 0 || to >= count ? null : to;
}

export const slideText = (s: Slide) =>
  [
    s.title,
    s.body,
    s.body2 ?? '',
    ...(s.options ?? []).map(o => o.label),
    ...(s.words ?? []).map(w => w.text),
    ...(s.answers ?? []).map(a => a.text),
    elementText(s),
  ].join(' ');

// ---- Open-ended activity (item 82) --------------------------------------------------------------------
export type OpenResponse = { id: string; text: string };
export type OpenEndedData = { prompt: string; responses: OpenResponse[] };
export const OPEN_MAX = 200;
export const OPEN_LEN = 500;
export function validateOpenEnded(d: OpenEndedData): void {
  if (!str(d.prompt, 300)) fail('Invalid open-ended prompt.');
  if (
    !Array.isArray(d.responses) ||
    d.responses.length > OPEN_MAX ||
    new Set(d.responses.map(r => r?.id)).size !== d.responses.length ||
    d.responses.some(r => !r || !str(r.id, 100) || !r.id || !str(r.text, OPEN_LEN) || !r.text.trim())
  )
    fail('Invalid open-ended responses.');
}
/** Add a trimmed response. Returns null when it is empty or the activity is full. */
export function addResponse(d: OpenEndedData, text: string): OpenEndedData | null {
  const t = text.trim().slice(0, OPEN_LEN);
  if (!t || d.responses.length >= OPEN_MAX) return null;
  return { ...d, responses: [...d.responses, { id: uid(), text: t }] };
}
/** Sticky notes for every response, in a grid to the right of the activity. One undo step in the caller. */
export function responsesToNotes(
  board: Board,
  id: string,
  make: (type: 'note', x: number, y: number) => Item,
): { board: Board; ids: string[] } {
  const item = board.items.find(i => i.id === id);
  if (!item || item.type !== 'openended') return { board, ids: [] };
  const responses = (item.data as OpenEndedData).responses,
    space = Math.max(0, 2000 - board.items.length),
    notes: Item[] = responses.slice(0, space).map((r, k) => ({
      ...make('note', item.x + item.w + 40 + (k % 4) * 230, item.y + Math.floor(k / 4) * 230),
      text: r.text,
    }));
  return { board: { ...board, items: [...board.items, ...notes] }, ids: notes.map(n => n.id) };
}

const data = <T>(i: Item) => (i.data ?? {}) as T;
export const activitySpecs: WidgetSpec[] = [
  {
    kind: 'slides' as WidgetKind,
    label: 'Slides',
    description: 'Build and present a slide deck',
    category: 'Collaboration',
    size: [640, 470],
    init: i => ({
      ...i,
      fill: '#ffffff',
      text: 'Untitled deck',
      data: {
        slides: [newSlide('title', { title: 'Presentation title', body: 'Subtitle' }), newSlide('content')],
        current: 0,
      } satisfies DeckData,
    }),
    validate: i => {
      validateDeck(data<DeckData>(i));
      validateItemStatus(i.data);
    },
    searchText: i => data<DeckData>(i).slides.map(slideText).join(' '),
  },
  {
    kind: 'openended' as WidgetKind,
    label: 'Open-ended',
    description: 'Collect free-text responses to a question (on this device)',
    category: 'Collaboration',
    size: [520, 360],
    init: i => ({
      ...i,
      fill: '#ffffff',
      text: 'Open-ended',
      data: { prompt: 'What is one thing we should change?', responses: [] } satisfies OpenEndedData,
    }),
    validate: i => validateOpenEnded(data<OpenEndedData>(i)),
    searchText: i => {
      const d = data<OpenEndedData>(i);
      return [d.prompt, ...d.responses.map(r => r.text)].join(' ');
    },
  },
];
