// Pure logic for journey maps, program boards (planner), word clouds, rankings and quizzes.
// Evidence: catalogue entries "Journey Map", "Planner (Program Board)", "Dependencies",
// "Word cloud", "Ranking" and "Quiz" (the recorded tool inventory). All behaviour here is single-device.

const uid = () => crypto.randomUUID();
export const TITLE_MAX = 120;

// ---- Journey map ---------------------------------------------------------------------------------
export type JourneyLane = { id: string; title: string; kind: 'text' | 'emotion' };
export type JourneyData = {
  stages: { id: string; title: string }[];
  lanes: JourneyLane[];
  cells: Record<string, string>;
  emotions: Record<string, number>;
};
export const JOURNEY_MAX = 20;
export const cellKey = (stageId: string, laneId: string) => `${stageId}:${laneId}`;
export function newJourney(): JourneyData {
  const stages = ['Discover', 'Consider', 'Buy', 'Use'].map(title => ({ id: uid(), title }));
  const lanes: JourneyLane[] = [
    { id: uid(), title: 'Actions', kind: 'text' },
    { id: uid(), title: 'Thoughts', kind: 'text' },
    { id: uid(), title: 'Emotion', kind: 'emotion' },
  ];
  return { stages, lanes, cells: {}, emotions: Object.fromEntries(stages.map(s => [s.id, 0])) };
}
export function addStage(d: JourneyData, title = 'New stage'): JourneyData {
  if (d.stages.length >= JOURNEY_MAX) throw new Error(`A journey holds up to ${JOURNEY_MAX} stages.`);
  const s = { id: uid(), title };
  return { ...d, stages: [...d.stages, s], emotions: { ...d.emotions, [s.id]: 0 } };
}
/** Remove a stage and every cell and emotion that belonged to it. */
export function removeStage(d: JourneyData, id: string): JourneyData {
  if (d.stages.length <= 1) throw new Error('A journey needs at least one stage.');
  const emotions = { ...d.emotions };
  delete emotions[id];
  return {
    ...d,
    stages: d.stages.filter(s => s.id !== id),
    emotions,
    cells: Object.fromEntries(Object.entries(d.cells).filter(([k]) => !k.startsWith(`${id}:`))),
  };
}
export function addLane(
  d: JourneyData,
  kind: JourneyLane['kind'] = 'text',
  title = kind === 'emotion' ? 'Emotion' : 'New lane',
): JourneyData {
  if (d.lanes.length >= JOURNEY_MAX) throw new Error(`A journey holds up to ${JOURNEY_MAX} lanes.`);
  if (kind === 'emotion' && d.lanes.some(l => l.kind === 'emotion')) throw new Error('A journey has one emotion lane.');
  return { ...d, lanes: [...d.lanes, { id: uid(), title, kind }] };
}
/** Remove a lane and every cell that belonged to it. */
export function removeLane(d: JourneyData, id: string): JourneyData {
  if (d.lanes.length <= 1) throw new Error('A journey needs at least one lane.');
  return {
    ...d,
    lanes: d.lanes.filter(l => l.id !== id),
    cells: Object.fromEntries(Object.entries(d.cells).filter(([k]) => !k.endsWith(`:${id}`))),
  };
}
export const renameStage = (d: JourneyData, id: string, title: string): JourneyData => ({
  ...d,
  stages: d.stages.map(s => (s.id === id ? { ...s, title: title.slice(0, TITLE_MAX) } : s)),
});
export const renameLane = (d: JourneyData, id: string, title: string): JourneyData => ({
  ...d,
  lanes: d.lanes.map(l => (l.id === id ? { ...l, title: title.slice(0, TITLE_MAX) } : l)),
});
export function moveStage(d: JourneyData, id: string, delta: number): JourneyData {
  const i = d.stages.findIndex(s => s.id === id),
    j = i + delta;
  if (i < 0 || j < 0 || j >= d.stages.length) return d;
  const stages = d.stages.slice();
  [stages[i], stages[j]] = [stages[j], stages[i]];
  return { ...d, stages };
}
export function setCell(d: JourneyData, stageId: string, laneId: string, text: string): JourneyData {
  const cells = { ...d.cells },
    key = cellKey(stageId, laneId),
    clean = text.slice(0, 2000);
  if (clean.trim()) cells[key] = clean;
  else delete cells[key];
  return { ...d, cells };
}
export const setEmotion = (d: JourneyData, stageId: string, value: number): JourneyData => ({
  ...d,
  emotions: { ...d.emotions, [stageId]: Math.max(-2, Math.min(2, Math.round(value))) },
});

// ---- Planner (program board) --------------------------------------------------------------------
export type PlannerCard = { id: string; title: string; team: string; iteration: string; points?: number };
export type PlannerData = {
  iterations: { id: string; title: string }[];
  teams: { id: string; title: string }[];
  cards: PlannerCard[];
  dependencies: { from: string; to: string }[];
};
export const PLANNER_MAX = 12,
  PLANNER_CARDS = 300;
export function newPlanner(): PlannerData {
  const iterations = ['Iteration 1', 'Iteration 2', 'Iteration 3'].map(title => ({ id: uid(), title }));
  const teams = ['Team A', 'Team B'].map(title => ({ id: uid(), title }));
  const a = { id: uid(), title: 'Login API', team: teams[0].id, iteration: iterations[0].id, points: 3 },
    b = { id: uid(), title: 'Login screen', team: teams[1].id, iteration: iterations[1].id, points: 2 };
  return { iterations, teams, cards: [a, b], dependencies: [{ from: a.id, to: b.id }] };
}
export function addPlannerCard(
  d: PlannerData,
  team: string,
  iteration: string,
  title = 'New feature',
): { data: PlannerData; id: string } {
  if (d.cards.length >= PLANNER_CARDS) throw new Error(`A board holds up to ${PLANNER_CARDS} cards.`);
  if (!d.teams.some(t => t.id === team) || !d.iterations.some(i => i.id === iteration))
    throw new Error('Choose an existing team and iteration.');
  const card = { id: uid(), title, team, iteration };
  return { data: { ...d, cards: [...d.cards, card] }, id: card.id };
}
export function updatePlannerCard(
  d: PlannerData,
  id: string,
  patch: Partial<Pick<PlannerCard, 'title' | 'points'>>,
): PlannerData {
  return {
    ...d,
    cards: d.cards.map(c => {
      if (c.id !== id) return c;
      const n = { ...c, ...patch, title: (patch.title ?? c.title).slice(0, TITLE_MAX) };
      if (n.points === undefined || !Number.isFinite(n.points)) delete n.points;
      else n.points = Math.max(0, Math.min(1000, n.points));
      return n;
    }),
  };
}
export function removePlannerCard(d: PlannerData, id: string): PlannerData {
  return {
    ...d,
    cards: d.cards.filter(c => c.id !== id),
    dependencies: d.dependencies.filter(x => x.from !== id && x.to !== id),
  };
}
/** Move a card into a cell, before another card of that cell (or to the end of the cell). */
export function movePlannerCard(
  d: PlannerData,
  id: string,
  team: string,
  iteration: string,
  beforeId: string | null = null,
): PlannerData {
  const card = d.cards.find(c => c.id === id);
  if (!card) throw new Error('That card no longer exists.');
  if (!d.teams.some(t => t.id === team) || !d.iterations.some(i => i.id === iteration))
    throw new Error('Choose an existing team and iteration.');
  const rest = d.cards.filter(c => c.id !== id),
    moved = { ...card, team, iteration };
  let at = beforeId ? rest.findIndex(c => c.id === beforeId) : -1;
  if (at < 0) {
    const last = rest
      .map((c, k) => (c.team === team && c.iteration === iteration ? k : -1))
      .filter(k => k >= 0)
      .at(-1);
    at = last === undefined ? rest.length : last + 1;
  }
  return { ...d, cards: [...rest.slice(0, at), moved, ...rest.slice(at)] };
}
/** Keyboard move: left/right changes iteration, up/down changes team. */
export function shiftPlannerCard(d: PlannerData, id: string, dir: 'left' | 'right' | 'up' | 'down'): PlannerData {
  const c = d.cards.find(x => x.id === id);
  if (!c) return d;
  const it = d.iterations.findIndex(i => i.id === c.iteration),
    tm = d.teams.findIndex(t => t.id === c.team);
  const ni = it + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0),
    nt = tm + (dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
  if (ni < 0 || ni >= d.iterations.length || nt < 0 || nt >= d.teams.length) return d;
  return movePlannerCard(d, id, d.teams[nt].id, d.iterations[ni].id);
}
/** Why "to depends on from" cannot be added, or null. */
export function plannerDependencyError(d: PlannerData, from: string, to: string): string | null {
  const ids = new Set(d.cards.map(c => c.id));
  if (!ids.has(from) || !ids.has(to)) return 'Choose two existing cards.';
  if (from === to) return 'A card cannot depend on itself.';
  if (d.dependencies.some(x => x.from === from && x.to === to)) return 'That dependency already exists.';
  // Adding from→to creates a cycle when `from` is already reachable from `to`.
  const next = new Map<string, string[]>();
  for (const x of d.dependencies) next.set(x.from, [...(next.get(x.from) ?? []), x.to]);
  const stack = [to],
    seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === from) return 'This dependency would create a cycle.';
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(next.get(n) ?? []));
  }
  return null;
}
export function addPlannerDependency(d: PlannerData, from: string, to: string): PlannerData {
  const error = plannerDependencyError(d, from, to);
  if (error) throw new Error(error);
  return { ...d, dependencies: [...d.dependencies, { from, to }] };
}
export const removePlannerDependency = (d: PlannerData, from: string, to: string): PlannerData => ({
  ...d,
  dependencies: d.dependencies.filter(x => !(x.from === from && x.to === to)),
});
/** Dependencies whose dependent card (`to`) is planned in an earlier iteration than the card it waits for. */
export function lateDependencies(d: PlannerData): { from: string; to: string }[] {
  const order = new Map(d.iterations.map((i, k) => [i.id, k])),
    byId = new Map(d.cards.map(c => [c.id, c]));
  return d.dependencies.filter(x => {
    const a = byId.get(x.from),
      b = byId.get(x.to);
    return !!a && !!b && (order.get(b.iteration) ?? 0) < (order.get(a.iteration) ?? 0);
  });
}
export function cellPoints(d: PlannerData, team: string, iteration: string): number {
  return d.cards.filter(c => c.team === team && c.iteration === iteration).reduce((s, c) => s + (c.points ?? 0), 0);
}
function addAxis(list: { id: string; title: string }[], title: string, label: string) {
  if (list.length >= PLANNER_MAX) throw new Error(`A board holds up to ${PLANNER_MAX} ${label}.`);
  return [...list, { id: uid(), title }];
}
export const addIteration = (d: PlannerData, title = `Iteration ${d.iterations.length + 1}`): PlannerData => ({
  ...d,
  iterations: addAxis(d.iterations, title, 'iterations'),
});
export const addTeam = (d: PlannerData, title = `Team ${String.fromCharCode(65 + d.teams.length)}`): PlannerData => ({
  ...d,
  teams: addAxis(d.teams, title, 'teams'),
});
/** Remove an iteration or team; its cards move to the neighbouring one so nothing is lost silently. */
export function removeAxis(d: PlannerData, axis: 'iterations' | 'teams', id: string): PlannerData {
  const list = d[axis];
  if (list.length <= 1) throw new Error(`A board needs at least one ${axis === 'teams' ? 'team' : 'iteration'}.`);
  const k = list.findIndex(x => x.id === id);
  if (k < 0) return d;
  const target = list[k + 1] ?? list[k - 1],
    key = axis === 'teams' ? 'team' : 'iteration';
  return {
    ...d,
    [axis]: list.filter(x => x.id !== id),
    cards: d.cards.map(c => (c[key] === id ? { ...c, [key]: target.id } : c)),
  };
}
export const renameAxis = (d: PlannerData, axis: 'iterations' | 'teams', id: string, title: string): PlannerData => ({
  ...d,
  [axis]: d[axis].map(x => (x.id === id ? { ...x, title: title.slice(0, TITLE_MAX) } : x)),
});
export type PlannerLayout = {
  header: number;
  side: number;
  cellW: number;
  cellH: number;
  cards: Map<string, { x: number; y: number; w: number; h: number }>;
};
/** Deterministic canvas layout: a header row, a team column, uniform cells, cards stacked per cell. */
export function plannerLayout(d: PlannerData, w: number, h: number): PlannerLayout {
  const header = 30,
    side = Math.min(110, Math.max(70, w * 0.16)),
    cellW = (w - side) / Math.max(1, d.iterations.length),
    cellH = (h - header) / Math.max(1, d.teams.length),
    cards = new Map<string, { x: number; y: number; w: number; h: number }>();
  d.teams.forEach((t, ti) =>
    d.iterations.forEach((it, ii) => {
      d.cards
        .filter(c => c.team === t.id && c.iteration === it.id)
        .forEach((c, k) =>
          cards.set(c.id, { x: side + ii * cellW + 6, y: header + ti * cellH + 6 + k * 30, w: cellW - 12, h: 26 }),
        );
    }),
  );
  return { header, side, cellW, cellH, cards };
}

// ---- Word cloud -------------------------------------------------------------------------------------
export type WordCloudData = { prompt: string; entries: string[] };
export const WORD_MAX = 500,
  WORD_LEN = 40;
const stopWords = new Set(
  'a an and are as at be but by for from has have i in is it its of on or our so that the their them they this to was we were what when which who will with you your'.split(
    ' ',
  ),
);
/** Case-insensitive word frequencies (whole entries and their words), stop words removed, most frequent first. */
export function wordFrequencies(entries: string[]): { word: string; count: number }[] {
  const counts = new Map<string, { word: string; count: number }>();
  for (const entry of entries) {
    const words = entry
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}'-]+/u)
      .map(w => w.replace(/^['-]+|['-]+$/g, ''))
      .filter(w => w.length > 1 && !stopWords.has(w));
    for (const w of new Set(words)) {
      const c = counts.get(w);
      if (c) c.count++;
      else counts.set(w, { word: w, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}
export type CloudWord = { word: string; count: number; x: number; y: number; w: number; h: number; size: number };
const overlap = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/**
 * Deterministic spiral layout centred in a w×h box. Boxes are top-left based and never overlap;
 * words that do not fit are skipped. Width is estimated from character count (0.58 em per char).
 */
export function layoutWordCloud(
  freqs: { word: string; count: number }[],
  w: number,
  h: number,
  maxWords = 80,
): CloudWord[] {
  const placed: CloudWord[] = [],
    top = freqs[0]?.count ?? 1,
    low = freqs.at(-1)?.count ?? 1,
    base = Math.max(10, Math.min(w, h) / 9);
  for (const f of freqs.slice(0, maxWords)) {
    const ratio = top === low ? 1 : (f.count - low) / (top - low),
      size = Math.round(Math.max(11, base * (0.45 + 0.75 * ratio))),
      bw = Math.ceil(f.word.length * size * 0.58) + 4,
      bh = Math.ceil(size * 1.15);
    if (bw > w || bh > h) continue;
    for (let step = 0; step < 1500; step++) {
      const angle = step * 0.35,
        radius = 2.2 * Math.sqrt(step) * Math.max(1, size / 8);
      const x = Math.round(w / 2 + radius * Math.cos(angle) * (w / Math.max(w, h)) - bw / 2),
        y = Math.round(h / 2 + radius * Math.sin(angle) * (h / Math.max(w, h)) - bh / 2);
      const box = { x, y, w: bw, h: bh };
      if (x < 0 || y < 0 || x + bw > w || y + bh > h) continue;
      if (placed.some(p => overlap(p, box))) continue;
      placed.push({ ...box, word: f.word, count: f.count, size });
      break;
    }
  }
  return placed;
}
export function addEntry(d: WordCloudData, text: string): WordCloudData {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Type a word or short phrase.');
  if (clean.length > WORD_LEN) throw new Error(`Keep entries to ${WORD_LEN} characters.`);
  if (d.entries.length >= WORD_MAX) throw new Error(`A word cloud holds up to ${WORD_MAX} entries.`);
  return { ...d, entries: [...d.entries, clean] };
}

// ---- Ranking -------------------------------------------------------------------------------------
export type RankingData = { question: string; items: { id: string; label: string }[]; order: string[] };
export const RANK_MAX = 30;
/** Order that lists every item exactly once: stored order first (unknown ids dropped), then new items. */
export function rankedIds(d: RankingData): string[] {
  const ids = new Set(d.items.map(i => i.id)),
    seen = new Set<string>(),
    out: string[] = [];
  for (const id of d.order)
    if (ids.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  for (const i of d.items) if (!seen.has(i.id)) out.push(i.id);
  return out;
}
export function moveRank(d: RankingData, id: string, delta: number): RankingData {
  const order = rankedIds(d),
    i = order.indexOf(id),
    j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return { ...d, order };
  [order[i], order[j]] = [order[j], order[i]];
  return { ...d, order };
}
export function moveRankBefore(d: RankingData, id: string, beforeId: string | null): RankingData {
  const order = rankedIds(d).filter(x => x !== id);
  if (!d.items.some(i => i.id === id)) return d;
  const at = beforeId ? order.indexOf(beforeId) : -1;
  order.splice(at < 0 ? order.length : at, 0, id);
  return { ...d, order };
}
export function addRankItem(d: RankingData, label: string): RankingData {
  if (d.items.length >= RANK_MAX) throw new Error(`A ranking holds up to ${RANK_MAX} items.`);
  const item = { id: uid(), label: label.slice(0, TITLE_MAX) };
  return { ...d, items: [...d.items, item], order: [...rankedIds(d), item.id] };
}
export function removeRankItem(d: RankingData, id: string): RankingData {
  if (d.items.length <= 2) throw new Error('A ranking needs at least two items.');
  return { ...d, items: d.items.filter(i => i.id !== id), order: d.order.filter(x => x !== id) };
}

// ---- Quiz ----------------------------------------------------------------------------------------
export type QuizQuestion = { id: string; text: string; options: string[]; correct: number };
export type QuizData = { questions: QuizQuestion[]; answers: Record<string, number>; revealed: boolean };
export const QUIZ_MAX = 30,
  OPTION_MAX = 8;
export function quizScore(d: QuizData): { correct: number; answered: number; total: number } {
  let correct = 0,
    answered = 0;
  for (const q of d.questions) {
    const a = d.answers[q.id];
    if (a === undefined) continue;
    answered++;
    if (a === q.correct) correct++;
  }
  return { correct, answered, total: d.questions.length };
}
export function answerQuiz(d: QuizData, questionId: string, option: number): QuizData {
  if (d.revealed) throw new Error('Reset the quiz to answer again.');
  const q = d.questions.find(x => x.id === questionId);
  if (!q) throw new Error('That question no longer exists.');
  if (!Number.isInteger(option) || option < 0 || option >= q.options.length)
    throw new Error('Choose one of the options.');
  return { ...d, answers: { ...d.answers, [questionId]: option } };
}
export const resetQuiz = (d: QuizData): QuizData => ({ ...d, answers: {}, revealed: false });
export function addQuestion(d: QuizData): QuizData {
  if (d.questions.length >= QUIZ_MAX) throw new Error(`A quiz holds up to ${QUIZ_MAX} questions.`);
  return {
    ...d,
    questions: [...d.questions, { id: uid(), text: 'New question', options: ['Option A', 'Option B'], correct: 0 }],
  };
}
export function removeQuestion(d: QuizData, id: string): QuizData {
  if (d.questions.length <= 1) throw new Error('A quiz needs at least one question.');
  const answers = { ...d.answers };
  delete answers[id];
  return { ...d, questions: d.questions.filter(q => q.id !== id), answers };
}
/** Replace a question; clears its stored answer when the options changed. */
export function updateQuestion(d: QuizData, q: QuizQuestion): QuizData {
  const prev = d.questions.find(x => x.id === q.id);
  if (!prev) return d;
  const options = q.options.slice(0, OPTION_MAX).map(o => o.slice(0, TITLE_MAX)),
    next = { ...q, text: q.text.slice(0, 500), options, correct: Math.max(0, Math.min(options.length - 1, q.correct)) };
  const answers = { ...d.answers };
  if (prev.options.length !== options.length || prev.options.some((o, i) => o !== options[i])) delete answers[q.id];
  return { ...d, questions: d.questions.map(x => (x.id === q.id ? next : x)), answers };
}

// ---- Doc formatting (markdown source edits) -----------------------------------------------------------
export type DocFormat =
  'bold' | 'italic' | 'code' | 'link' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'check' | 'quote';
const linePrefixes: Partial<Record<DocFormat, string>> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  bullet: '- ',
  check: '- [ ] ',
  quote: '> ',
};
/**
 * Apply a formatting command to the markdown selection [start, end). Wrapping commands toggle
 * their markers; line commands toggle a prefix on every selected line (headings replace each other).
 * Returns the new text and the selection to restore.
 */
export function applyDocFormat(
  text: string,
  start: number,
  end: number,
  kind: DocFormat,
): { text: string; start: number; end: number } {
  const s = Math.max(0, Math.min(start, end)),
    e = Math.min(text.length, Math.max(start, end)),
    sel = text.slice(s, e);
  const wrap = (open: string, close = open, placeholder = 'text') => {
    if (text.slice(s - open.length, s) === open && text.slice(e, e + close.length) === close)
      return {
        text: text.slice(0, s - open.length) + sel + text.slice(e + close.length),
        start: s - open.length,
        end: e - open.length,
      };
    const body = sel || placeholder;
    return {
      text: text.slice(0, s) + open + body + close + text.slice(e),
      start: s + open.length,
      end: s + open.length + body.length,
    };
  };
  if (kind === 'bold') return wrap('**');
  if (kind === 'italic') return wrap('_');
  if (kind === 'code') return sel.includes('\n') ? wrap('```\n', '\n```', 'code') : wrap('`', '`', 'code');
  if (kind === 'link') {
    const label = sel || 'link text',
      url = 'https://',
      next = text.slice(0, s) + `[${label}](${url})` + text.slice(e),
      at = s + label.length + 3;
    return { text: next, start: at, end: at + url.length };
  }
  const lineStart = text.lastIndexOf('\n', s - 1) + 1,
    nl = text.indexOf('\n', e > s && text[e - 1] === '\n' ? e - 1 : e),
    lineEnd = nl < 0 ? text.length : nl;
  const lines = text.slice(lineStart, lineEnd).split('\n'),
    heading = /^#{1,6}\s+/,
    numbered = /^\d+\.\s+/;
  let out: string[];
  if (kind === 'number') {
    const all = lines.every(l => numbered.test(l));
    out = lines.map((l, k) =>
      all ? l.replace(numbered, '') : `${k + 1}. ${l.replace(numbered, '').replace(/^- (\[[ x]\] )?/, '')}`,
    );
  } else {
    const prefix = linePrefixes[kind]!,
      has = (l: string) => l.startsWith(prefix) && !(kind === 'bullet' && /^- \[[ x]\] /.test(l)),
      all = lines.every(has);
    out = lines.map(l =>
      all
        ? l.slice(prefix.length)
        : kind.startsWith('h')
          ? prefix + l.replace(heading, '')
          : prefix + l.replace(/^(- \[[ x]\] |- |> |\d+\.\s+)/, ''),
    );
  }
  const block = out.join('\n');
  return {
    text: text.slice(0, lineStart) + block + text.slice(lineEnd),
    start: lineStart,
    end: lineStart + block.length,
  };
}
