// More starter templates with categories and search (gap list I5). Pure: no React, no DOM.
// Each template is laid out from `at` with the board's own objects (frames, sticky notes, text, shapes).
import type { Item, Point } from './model.ts';

export type Make = (type: Item['type'], x: number, y: number, fill?: string) => Item;
export const templateCategories = [
  'Brainstorming',
  'Agile',
  'Strategy',
  'Research',
  'Planning',
  'Diagramming',
  'Meetings',
] as const;
export type TemplateCategory = (typeof templateCategories)[number];
export type StarterName =
  | 'Brainstorm'
  | 'Kanban retro'
  | 'Product roadmap'
  | 'Customer journey'
  | 'Business model canvas'
  | 'PEST analysis'
  | 'Lean canvas'
  | 'Mind dump'
  | 'RICE scoring'
  | 'PI planning'
  | 'Meeting agenda'
  | 'Icebreaker'
  | 'Brainwriting'
  | 'User story map';
export const starterNames: StarterName[] = [
  'Brainstorm',
  'Kanban retro',
  'Product roadmap',
  'Customer journey',
  'Business model canvas',
  'PEST analysis',
  'Lean canvas',
  'Mind dump',
  'RICE scoring',
  'PI planning',
  'Meeting agenda',
  'Icebreaker',
  'Brainwriting',
  'User story map',
];
export type TemplateInfo = { name: string; category: TemplateCategory; about: string; keywords?: string };
/** Every gallery template (the original four first), with its category and description. */
export const templateCatalog: TemplateInfo[] = [
  {
    name: 'Retrospective',
    category: 'Agile',
    about: 'Three frames: went well, to improve, actions',
    keywords: 'retro sprint',
  },
  { name: 'SWOT', category: 'Strategy', about: 'Strengths, weaknesses, opportunities, threats', keywords: 'analysis' },
  { name: 'Weekly plan', category: 'Planning', about: 'One column per weekday', keywords: 'calendar week schedule' },
  { name: 'Flowchart', category: 'Diagramming', about: 'Start, process, decision and end', keywords: 'process flow' },
  {
    name: 'Brainstorm',
    category: 'Brainstorming',
    about: 'A central question with idea clusters around it',
    keywords: 'ideas ideation',
  },
  {
    name: 'Kanban retro',
    category: 'Agile',
    about: 'Start, stop, continue and action columns',
    keywords: 'retrospective sprint board',
  },
  {
    name: 'Product roadmap',
    category: 'Planning',
    about: 'Four quarters with now, next and later lanes',
    keywords: 'quarters timeline release',
  },
  {
    name: 'Customer journey',
    category: 'Research',
    about: 'Stages by actions, thoughts, feelings and opportunities',
    keywords: 'ux experience map persona',
  },
  {
    name: 'Business model canvas',
    category: 'Strategy',
    about: 'Nine building blocks of a business model',
    keywords: 'bmc value proposition',
  },
  {
    name: 'PEST analysis',
    category: 'Strategy',
    about: 'Political, economic, social and technological factors',
    keywords: 'pestle environment',
  },
  {
    name: 'Lean canvas',
    category: 'Strategy',
    about: 'Problem, solution, metrics and advantage for a new idea',
    keywords: 'startup',
  },
  {
    name: 'Mind dump',
    category: 'Brainstorming',
    about: 'Write everything down, then sort it into groups',
    keywords: 'notes sort affinity',
  },
  {
    name: 'RICE scoring',
    category: 'Strategy',
    about: 'Score ideas by reach, impact, confidence and effort',
    keywords: 'prioritise prioritize backlog ranking',
  },
  {
    name: 'PI planning',
    category: 'Agile',
    about: 'Teams by iterations with objectives, risks and dependencies',
    keywords: 'program increment safe iteration release train',
  },
  {
    name: 'Meeting agenda',
    category: 'Meetings',
    about: 'Goal, timed topics, decisions and action items',
    keywords: 'agenda notes minutes actions',
  },
  {
    name: 'Icebreaker',
    category: 'Meetings',
    about: 'Warm-up questions with space for everyone to answer',
    keywords: 'warm up energizer team check-in',
  },
  {
    name: 'Brainwriting',
    category: 'Brainstorming',
    about: 'Each person writes ideas, then builds on the others in rounds',
    keywords: 'ideas silent 635 ideation',
  },
  {
    name: 'User story map',
    category: 'Agile',
    about: 'Activities and steps across the top, stories in release slices below',
    keywords: 'backlog mvp journey release',
  },
];
/** Templates matching a search text (name, category, description, keywords) and an optional category. */
export function filterTemplates(query: string, category: TemplateCategory | null = null): TemplateInfo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return templateCatalog.filter(t => {
    if (category && t.category !== category) return false;
    const hay = `${t.name} ${t.category} ${t.about} ${t.keywords ?? ''}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

const colors = {
  yellow: '#fff49b',
  green: '#a9e8bb',
  orange: '#ffb879',
  blue: '#a8cdff',
  pink: '#ffc0d9',
  violet: '#d6c4ff',
};
/** Starter content for one of the added templates, laid out from `at`. */
export function starterItems(name: StarterName, at: Point, make: Make): Item[] {
  const frame = (s: string, x: number, y: number, w: number, h: number) => ({
    ...make('frame', at.x + x, at.y + y),
    text: s,
    w,
    h,
  });
  const note = (s: string, x: number, y: number, fill: string) => ({
    ...make('note', at.x + x, at.y + y, fill),
    text: s,
    w: 160,
    h: 160,
  });
  const label = (s: string, x: number, y: number, w = 300, size = 28) => ({
    ...make('text', at.x + x, at.y + y),
    text: s,
    w,
    h: Math.ceil(size * 1.4) + 12,
    format: { bold: true, fontSize: size },
  });
  const grid = (titles: string[], cols: number, w: number, h: number, gap = 20) =>
    titles.map((t, k) => frame(t, (k % cols) * (w + gap), Math.floor(k / cols) * (h + gap), w, h));
  switch (name) {
    case 'Brainstorm': {
      const centre = {
        ...make('ellipse', at.x + 420, at.y + 300),
        text: 'What question are we exploring?',
        w: 320,
        h: 180,
      };
      const spots: [number, number, string][] = [
        [100, 60, colors.yellow],
        [820, 60, colors.green],
        [60, 560, colors.blue],
        [860, 560, colors.pink],
        [460, 40, colors.orange],
        [460, 560, colors.violet],
      ];
      return [centre, ...spots.map(([x, y, fill]) => note('Idea', x, y, fill))];
    }
    case 'Kanban retro':
      return [
        ...grid(['Start', 'Stop', 'Continue', 'Actions'], 4, 300, 560),
        note('Something to start', 20, 60, colors.green),
        note('Something to stop', 340, 60, colors.pink),
        note('Something to keep', 660, 60, colors.blue),
        note('Owner: action', 980, 60, colors.yellow),
      ];
    case 'Product roadmap': {
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'],
        lanes = ['Now', 'Next', 'Later'];
      return [
        ...quarters.map((q, k) => label(q, 180 + k * 300, 0, 280)),
        ...lanes.map((l, k) => label(l, 0, 80 + k * 220, 160, 22)),
        ...lanes.flatMap((l, r) =>
          quarters.map((q, c) => frame(`${q} ${l.toLowerCase()}`, 180 + c * 300, 70 + r * 220, 280, 200)),
        ),
        note('Feature or theme', 200, 110, colors.blue),
        note('Feature or theme', 500, 330, colors.green),
        note('Feature or theme', 800, 550, colors.yellow),
      ];
    }
    case 'Customer journey': {
      const stages = ['Discover', 'Consider', 'Buy', 'Use', 'Recommend'],
        rows = ['Actions', 'Thoughts', 'Feelings', 'Opportunities'],
        fills = [colors.yellow, colors.blue, colors.pink, colors.green];
      return [
        label('Persona: who is this journey for?', 0, -70, 700, 24),
        ...stages.map((s, k) => frame(s, 200 + k * 240, 0, 220, 4 * 190 + 50)),
        ...rows.map((r, k) => label(r, 0, 60 + k * 190, 180, 20)),
        ...rows.flatMap((_, r) => stages.map((__, c) => note('', 230 + c * 240, 50 + r * 190, fills[r]))),
      ];
    }
    case 'Business model canvas':
      return [
        frame('Key partners', 0, 0, 240, 520),
        frame('Key activities', 260, 0, 240, 250),
        frame('Key resources', 260, 270, 240, 250),
        frame('Value propositions', 520, 0, 240, 520),
        frame('Customer relationships', 780, 0, 240, 250),
        frame('Channels', 780, 270, 240, 250),
        frame('Customer segments', 1040, 0, 240, 520),
        frame('Cost structure', 0, 540, 630, 240),
        frame('Revenue streams', 650, 540, 630, 240),
      ];
    case 'PEST analysis':
      return [
        ...grid(['Political', 'Economic', 'Social', 'Technological'], 2, 440, 340),
        note('Factor', 30, 60, colors.blue),
        note('Factor', 490, 60, colors.green),
        note('Factor', 30, 420, colors.yellow),
        note('Factor', 490, 420, colors.pink),
      ];
    case 'Lean canvas':
      return [
        frame('Problem', 0, 0, 240, 520),
        frame('Solution', 260, 0, 240, 250),
        frame('Key metrics', 260, 270, 240, 250),
        frame('Unique value proposition', 520, 0, 240, 520),
        frame('Unfair advantage', 780, 0, 240, 250),
        frame('Channels', 780, 270, 240, 250),
        frame('Customer segments', 1040, 0, 240, 520),
        frame('Cost structure', 0, 540, 630, 220),
        frame('Revenue streams', 650, 540, 630, 220),
      ];
    case 'Mind dump':
      return [
        frame('Everything on your mind', 0, 0, 720, 460),
        ...Array.from({ length: 8 }, (_, k) =>
          note('Thought', 30 + (k % 4) * 170, 60 + Math.floor(k / 4) * 190, colors.yellow),
        ),
        ...grid(['Group A', 'Group B', 'Group C'], 3, 300, 360).map(f => ({ ...f, x: f.x + 780, y: f.y })),
      ];
    case 'RICE scoring': {
      const cols = ['Idea', 'Reach', 'Impact', 'Confidence', 'Effort', 'Score'],
        widths = [300, 140, 140, 160, 140, 160];
      const xs = widths.map((_, k) => widths.slice(0, k).reduce((a, b) => a + b + 10, 0));
      return [
        label('RICE scoring: (Reach × Impact × Confidence) ÷ Effort', 0, -80, 1100, 24),
        ...cols.map((c, k) => frame(c, xs[k], 0, widths[k], 600)),
        ...[0, 1, 2].map(r => note(`Idea ${r + 1}`, 70, 60 + r * 180, colors.yellow)),
        note('People per quarter', xs[1] - 10, 60, colors.blue),
        note('0.25 to 3', xs[2] - 10, 60, colors.green),
        note('50% to 100%', xs[3], 60, colors.pink),
        note('Person-months', xs[4] - 10, 60, colors.orange),
      ];
    }
    case 'PI planning': {
      const iterations = ['Iteration 1', 'Iteration 2', 'Iteration 3', 'Iteration 4'],
        teams = ['Team A', 'Team B', 'Team C'];
      return [
        ...iterations.map((t, k) => label(t, 180 + k * 260, 0, 240, 22)),
        ...teams.map((t, k) => label(t, 0, 80 + k * 220, 160, 22)),
        ...teams.flatMap((_, r) =>
          iterations.map((it, c) => frame(`${teams[r]} · ${it}`, 180 + c * 260, 60 + r * 220, 240, 200)),
        ),
        frame('PI objectives', 1260, 60, 300, 300),
        frame('Risks (resolve, own, accept, mitigate)', 1260, 380, 300, 300),
        note('Feature', 200, 110, colors.blue),
        note('Dependency', 460, 330, colors.pink),
        note('Objective', 1290, 120, colors.green),
        note('Risk', 1290, 440, colors.orange),
      ];
    }
    case 'Meeting agenda':
      return [
        label('Meeting title · date', 0, -80, 700, 28),
        frame('Goal', 0, 0, 360, 240),
        frame('Agenda (topic · owner · minutes)', 380, 0, 520, 520),
        frame('Decisions', 920, 0, 360, 250),
        frame('Action items', 920, 270, 360, 250),
        frame('Parking lot', 0, 260, 360, 260),
        note('What should this meeting achieve?', 30, 60, colors.yellow),
        note('1. Topic · owner · 10 min', 410, 60, colors.blue),
        note('2. Topic · owner · 15 min', 590, 60, colors.blue),
        note('Owner: action by date', 950, 330, colors.green),
      ];
    case 'Icebreaker': {
      const questions = [
        'What made you smile this week?',
        'One thing on your desk and why',
        'Your perfect weekend in three words',
        'A skill you would like to learn',
      ];
      return [
        label('Icebreaker: pick a question and add a note', 0, -80, 900, 24),
        ...questions.map((q, k) => frame(q, (k % 2) * 520, Math.floor(k / 2) * 380, 500, 360)),
        ...questions.map((_, k) =>
          note(
            'My answer',
            (k % 2) * 520 + 30,
            Math.floor(k / 2) * 380 + 60,
            [colors.yellow, colors.green, colors.pink, colors.violet][k],
          ),
        ),
      ];
    }
    case 'Brainwriting': {
      const people = ['Person 1', 'Person 2', 'Person 3'],
        rounds = ['Round 1', 'Round 2', 'Round 3'];
      return [
        label('Write three ideas, pass them on, build on the ideas you receive', 0, -80, 1100, 22),
        ...rounds.map((r, k) => label(r, 180 + k * 300, 0, 280, 22)),
        ...people.map((p, k) => label(p, 0, 80 + k * 220, 160, 22)),
        ...people.flatMap((p, r) =>
          rounds.map((rd, c) => frame(`${p} · ${rd}`, 180 + c * 300, 60 + r * 220, 280, 200)),
        ),
        note('Idea', 200, 110, colors.yellow),
        note('Builds on…', 500, 330, colors.green),
        note('Builds on…', 800, 550, colors.blue),
      ];
    }
    case 'User story map': {
      const activities = ['Discover', 'Sign up', 'Use', 'Share'],
        releases = ['Release 1 (MVP)', 'Release 2', 'Later'];
      return [
        ...activities.map((a, k) => ({ ...note(a, 200 + k * 260, 0, colors.orange), h: 100 })),
        ...activities.map((_, k) => ({ ...note('Step', 200 + k * 260, 120, colors.blue), h: 100 })),
        ...releases.map((r, k) => frame(r, 180, 250 + k * 240, 4 * 260, 220)),
        ...releases.map((r, k) => label(r, 0, 300 + k * 240, 170, 18)),
        note('Story', 200, 300, colors.yellow),
        note('Story', 460, 300, colors.yellow),
        note('Story', 720, 540, colors.yellow),
      ];
    }
  }
}
