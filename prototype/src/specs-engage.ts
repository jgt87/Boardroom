// Pure specs for journey maps, program boards, word clouds, rankings and quizzes.
import type { Item, WidgetKind } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import {
  newJourney,
  newPlanner,
  JOURNEY_MAX,
  PLANNER_MAX,
  PLANNER_CARDS,
  WORD_MAX,
  WORD_LEN,
  RANK_MAX,
  QUIZ_MAX,
  OPTION_MAX,
  TITLE_MAX,
  plannerDependencyError,
  cellKey,
} from './engage.ts';
import type { JourneyData, PlannerData, WordCloudData, RankingData, QuizData } from './engage.ts';

const fail = (message: string): never => {
  throw new Error(message);
};
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 100;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const titled = (list: unknown, max: number, min = 1) =>
  Array.isArray(list) &&
  list.length >= min &&
  list.length <= max &&
  list.every(x => obj(x) && id(x.id) && str(x.title, TITLE_MAX)) &&
  new Set(list.map(x => (x as { id: string }).id)).size === list.length;
const d = <T>(i: Item) => (i.data ?? {}) as T;
const withData = (item: Item, data: Record<string, any>, extra: Partial<Item> = {}): Item => ({
  ...item,
  ...extra,
  data,
});
const uid = () => crypto.randomUUID();

export function validateJourney(x: JourneyData): void {
  if (
    !titled(x.stages, JOURNEY_MAX) ||
    !Array.isArray(x.lanes) ||
    !titled(x.lanes, JOURNEY_MAX) ||
    x.lanes.some(l => !['text', 'emotion'].includes(l.kind))
  )
    fail('Invalid journey stages or lanes.');
  if (x.lanes.filter(l => l.kind === 'emotion').length > 1) fail('A journey has one emotion lane.');
  if (!obj(x.cells) || !obj(x.emotions)) fail('Invalid journey cells.');
  const stages = new Set(x.stages.map(s => s.id)),
    lanes = new Set(x.lanes.map(l => l.id));
  for (const [k, v] of Object.entries(x.cells)) {
    const [s, l] = k.split(':');
    if (!stages.has(s) || !lanes.has(l) || k !== cellKey(s, l) || !str(v, 2000))
      fail('A journey cell refers to a missing stage or lane.');
  }
  for (const [s, v] of Object.entries(x.emotions))
    if (!stages.has(s) || !Number.isInteger(v) || (v as number) < -2 || (v as number) > 2)
      fail('Journey emotions range from −2 to 2.');
}
export function validatePlanner(x: PlannerData): void {
  if (!titled(x.iterations, PLANNER_MAX) || !titled(x.teams, PLANNER_MAX)) fail('Invalid planner iterations or teams.');
  const its = new Set(x.iterations.map(i => i.id)),
    teams = new Set(x.teams.map(t => t.id));
  if (
    !Array.isArray(x.cards) ||
    x.cards.length > PLANNER_CARDS ||
    new Set(x.cards.map(c => c?.id)).size !== x.cards.length ||
    x.cards.some(
      c =>
        !obj(c) ||
        !id(c.id) ||
        !str(c.title, TITLE_MAX) ||
        !teams.has(c.team) ||
        !its.has(c.iteration) ||
        (c.points !== undefined &&
          !(typeof c.points === 'number' && Number.isFinite(c.points) && c.points >= 0 && c.points <= 1000)),
    )
  )
    fail('Invalid planner cards.');
  if (!Array.isArray(x.dependencies) || x.dependencies.length > 1000) fail('Invalid planner dependencies.');
  let acc: PlannerData = { ...x, dependencies: [] };
  for (const dep of x.dependencies) {
    if (!obj(dep)) fail('Invalid planner dependency.');
    const e = plannerDependencyError(acc, dep.from, dep.to);
    if (e) fail(`Invalid planner dependency: ${e}`);
    acc = { ...acc, dependencies: [...acc.dependencies, dep] };
  }
}
export function validateWordCloud(x: WordCloudData): void {
  if (
    !str(x.prompt, 300) ||
    !Array.isArray(x.entries) ||
    x.entries.length > WORD_MAX ||
    x.entries.some(e => typeof e !== 'string' || !e.trim() || e.length > WORD_LEN)
  )
    fail(`Word cloud entries must be 1–${WORD_LEN} characters, up to ${WORD_MAX}.`);
}
export function validateRanking(x: RankingData): void {
  if (
    !str(x.question, 300) ||
    !Array.isArray(x.items) ||
    x.items.length < 2 ||
    x.items.length > RANK_MAX ||
    x.items.some(i => !obj(i) || !id(i.id) || !str(i.label, TITLE_MAX)) ||
    new Set(x.items.map(i => i.id)).size !== x.items.length
  )
    fail('A ranking needs 2–30 uniquely identified items.');
  const ids = new Set(x.items.map(i => i.id));
  if (!Array.isArray(x.order) || x.order.some(o => !ids.has(o)) || new Set(x.order).size !== x.order.length)
    fail('Ranking order refers to missing items.');
}
export function validateQuiz(x: QuizData): void {
  if (
    !Array.isArray(x.questions) ||
    !x.questions.length ||
    x.questions.length > QUIZ_MAX ||
    new Set(x.questions.map(q => q?.id)).size !== x.questions.length
  )
    fail('A quiz needs 1–30 questions.');
  for (const q of x.questions) {
    if (
      !obj(q) ||
      !id(q.id) ||
      !str(q.text, 500) ||
      !Array.isArray(q.options) ||
      q.options.length < 2 ||
      q.options.length > OPTION_MAX ||
      q.options.some(o => !str(o, TITLE_MAX))
    )
      fail('Each quiz question needs text and 2–8 options.');
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length)
      fail('The correct answer must be one of the options.');
  }
  if (!obj(x.answers) || typeof x.revealed !== 'boolean') fail('Invalid quiz answers.');
  const byId = new Map(x.questions.map(q => [q.id, q]));
  for (const [k, v] of Object.entries(x.answers)) {
    const q = byId.get(k);
    if (!q || !Number.isInteger(v) || (v as number) < 0 || (v as number) >= q.options.length)
      fail('A quiz answer refers to a missing question or option.');
  }
}

export const engageSpecs: WidgetSpec[] = [
  {
    kind: 'journey' as WidgetKind,
    label: 'Journey map',
    description: 'Map stages, actions, thoughts and the emotion curve of an experience',
    category: 'Diagramming',
    size: [760, 340],
    init: i => withData(i, newJourney(), { text: 'Customer journey' }),
    validate: i => validateJourney(d<JourneyData>(i)),
    searchText: i => {
      const x = d<JourneyData>(i);
      return [...x.stages.map(s => s.title), ...x.lanes.map(l => l.title), ...Object.values(x.cells ?? {})].join(' ');
    },
  },
  {
    kind: 'planner' as WidgetKind,
    label: 'Planner',
    description: 'Program board: plan features by team and iteration with dependencies',
    category: 'Planning',
    size: [760, 360],
    init: i => withData(i, newPlanner(), { text: 'Program board' }),
    validate: i => validatePlanner(d<PlannerData>(i)),
    searchText: i => {
      const x = d<PlannerData>(i);
      return [...x.iterations.map(v => v.title), ...x.teams.map(t => t.title), ...x.cards.map(c => c.title)].join(' ');
    },
  },
  {
    kind: 'wordcloud' as WidgetKind,
    label: 'Word cloud',
    description: 'Collect words and see the themes grow (on this device)',
    category: 'Collaboration',
    size: [520, 320],
    init: i =>
      withData(i, {
        prompt: 'One word for this week?',
        entries: ['Focus', 'Progress', 'Busy', 'Progress', 'Learning'],
      }),
    validate: i => validateWordCloud(d<WordCloudData>(i)),
    searchText: i => {
      const x = d<WordCloudData>(i);
      return [x.prompt, ...x.entries].join(' ');
    },
  },
  {
    kind: 'ranking' as WidgetKind,
    label: 'Ranking',
    description: 'Order items by priority with drag or keyboard',
    category: 'Collaboration',
    size: [340, 300],
    init: i => {
      const items = ['Speed', 'Quality', 'Cost'].map(label => ({ id: uid(), label }));
      return withData(i, { question: 'What matters most?', items, order: items.map(x => x.id) });
    },
    validate: i => validateRanking(d<RankingData>(i)),
    searchText: i => {
      const x = d<RankingData>(i);
      return [x.question, ...x.items.map(v => v.label)].join(' ');
    },
  },
  {
    kind: 'quiz' as WidgetKind,
    label: 'Quiz',
    description: 'Ask multiple-choice questions and reveal the score (on this device)',
    category: 'Collaboration',
    size: [420, 340],
    init: i =>
      withData(
        i,
        {
          questions: [
            { id: uid(), text: 'Which planet is largest?', options: ['Mars', 'Jupiter', 'Venus'], correct: 1 },
          ],
          answers: {},
          revealed: false,
        },
        { text: 'Quiz' },
      ),
    validate: i => validateQuiz(d<QuizData>(i)),
    searchText: i =>
      d<QuizData>(i)
        .questions.map(q => [q.text, ...q.options].join(' '))
        .join(' '),
  },
];
