// Slides decks (item 78) and open-ended activities (item 82). Pure: specs, validation and editing helpers.
// Evidence: Slides were created live with Add blank slide / Add template / Add activity controls; the tool
// catalogue lists Engage activities → Open-ended. Both run on this device only.
import type { Board, Item, WidgetKind } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import { validateItemStatus } from './board-settings.ts';

export const slideLayouts = ['title', 'content', 'section', 'two', 'quote', 'blank', 'activity'] as const;
export type SlideLayout = (typeof slideLayouts)[number];
export const slideLayoutLabels: Record<SlideLayout, string> = {
  title: 'Title',
  content: 'Title and content',
  section: 'Section header',
  two: 'Two columns',
  quote: 'Quote',
  blank: 'Blank',
  activity: 'Activity (poll)',
};
export type SlideOption = { id: string; label: string; votes: number };
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
  /** Presenter notes, shown only to the presenter (N while presenting the deck). */
  notes?: string;
};
export const SLIDE_NOTES_MAX = 2000;
export type DeckData = { slides: Slide[]; current: number };
export const DECK_MAX = 100;
export const SLIDE_TITLE_MAX = 300;
export const SLIDE_BODY_MAX = 4000;
export const SLIDE_OPTIONS_MAX = 8;

const uid = () => crypto.randomUUID();
const fail = (message: string): never => {
  throw new Error(message);
};
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function newSlide(layout: SlideLayout = 'content', fields: Partial<Omit<Slide, 'id' | 'layout'>> = {}): Slide {
  const slide: Slide = {
    id: uid(),
    layout,
    title:
      fields.title ?? (layout === 'blank' ? '' : layout === 'activity' ? 'What should we focus on next?' : 'Title'),
    body: fields.body ?? (layout === 'content' ? 'Add your key points' : ''),
    background: fields.background ?? (layout === 'section' ? '#25252c' : '#ffffff'),
  };
  if (layout === 'two' || fields.body2 !== undefined) slide.body2 = fields.body2 ?? 'Second column';
  if (layout === 'activity')
    slide.options =
      fields.options ?? ['Option A', 'Option B', 'Option C'].map(label => ({ id: uid(), label, votes: 0 }));
  return slide;
}

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
export function resetVotes(d: DeckData, slideId: string): DeckData {
  return {
    ...d,
    slides: d.slides.map(s => (s.id === slideId ? { ...s, options: s.options?.map(o => ({ ...o, votes: 0 })) } : s)),
  };
}
export const slideText = (s: Slide) =>
  [s.title, s.body, s.body2 ?? '', ...(s.options ?? []).map(o => o.label)].join(' ');

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
