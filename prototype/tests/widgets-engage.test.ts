import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Item, Board, WidgetKind } from '../src/model.ts';
import {
  engageSpecs,
  validateJourney,
  validatePlanner,
  validateWordCloud,
  validateRanking,
  validateQuiz,
} from '../src/specs-engage.ts';
import {
  newJourney,
  addStage,
  removeStage,
  addLane,
  removeLane,
  setCell,
  setEmotion,
  cellKey,
  newPlanner,
  addPlannerCard,
  movePlannerCard,
  shiftPlannerCard,
  addPlannerDependency,
  plannerDependencyError,
  lateDependencies,
  cellPoints,
  removeAxis,
  removePlannerCard,
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
  updateQuestion,
  applyDocFormat,
} from '../src/engage.ts';
import type { PlannerData, RankingData, QuizData } from '../src/engage.ts';

const spec = (k: string) => engageSpecs.find(s => s.kind === k)!;
const fresh = (k: string): Item => spec(k).init!({ ...createItem('note', 0, 0), type: k as WidgetKind });

test('journey: cells and emotions are cleaned when stages or lanes are removed', () => {
  let d = newJourney();
  const [s1, s2] = d.stages,
    lane = d.lanes[0];
  d = setCell(d, s1.id, lane.id, 'Search');
  d = setCell(d, s2.id, lane.id, 'Compare');
  d = setEmotion(d, s2.id, 5);
  assert.equal(d.emotions[s2.id], 2);
  const noStage = removeStage(d, s1.id);
  assert.deepEqual(Object.keys(noStage.cells), [cellKey(s2.id, lane.id)]);
  assert.equal(s1.id in noStage.emotions, false);
  validateJourney(noStage);
  const noLane = removeLane(d, lane.id);
  assert.deepEqual(noLane.cells, {});
  validateJourney(noLane);
  assert.throws(() => addLane(d, 'emotion'), /one emotion lane/);
  d = addStage(d);
  assert.equal(d.stages.length, 5);
  assert.equal(setCell(d, s1.id, lane.id, '  ').cells[cellKey(s1.id, lane.id)], undefined);
  assert.throws(() => validateJourney({ ...d, cells: { 'ghost:lane': 'x' } }), /missing/);
  assert.throws(() => validateJourney({ ...d, emotions: { [s1.id]: 3 } }));
});
test('planner: moves, dependency cycles, late dependencies and capacity', () => {
  let d: PlannerData = newPlanner();
  const [a, b] = d.cards,
    [t1, t2] = d.teams,
    [i1, i2, i3] = d.iterations;
  assert.deepEqual(lateDependencies(d), []);
  d = movePlannerCard(d, b.id, t2.id, i1.id);
  assert.deepEqual(lateDependencies(d), []);
  d = movePlannerCard(d, a.id, t1.id, i3.id);
  assert.deepEqual(
    lateDependencies(d).map(x => [x.from, x.to]),
    [[a.id, b.id]],
  );
  assert.equal(plannerDependencyError(d, b.id, a.id), 'This dependency would create a cycle.');
  assert.equal(plannerDependencyError(d, a.id, a.id), 'A card cannot depend on itself.');
  assert.throws(() => addPlannerDependency(d, a.id, b.id), /already exists/);
  const c = addPlannerCard(d, t1.id, i3.id, 'Docs');
  d = c.data;
  d = addPlannerDependency(d, b.id, c.id);
  assert.equal(plannerDependencyError(d, c.id, a.id), 'This dependency would create a cycle.');
  assert.equal(cellPoints(d, t1.id, i3.id), 3);
  const shifted = shiftPlannerCard(d, a.id, 'left');
  assert.equal(shifted.cards.find(x => x.id === a.id)!.iteration, i2.id);
  assert.equal(shiftPlannerCard(d, a.id, 'up'), d);
  const merged = removeAxis(d, 'iterations', i3.id);
  assert.ok(merged.cards.every(x => x.iteration !== i3.id));
  validatePlanner(merged);
  assert.deepEqual(removePlannerCard(d, b.id).dependencies, []);
  assert.throws(() => validatePlanner({ ...d, dependencies: [...d.dependencies, { from: c.id, to: a.id }] }), /cycle/);
  assert.throws(() => validatePlanner({ ...d, cards: [{ ...a, team: 'ghost' }] }));
});
test('word cloud: grouping, stop words, deterministic non-overlapping layout', () => {
  const f = wordFrequencies(['Team spirit', 'team', 'The TEAM rocks', 'spirit']);
  assert.deepEqual(f.slice(0, 2), [
    { word: 'team', count: 3 },
    { word: 'spirit', count: 2 },
  ]);
  assert.ok(!f.some(x => x.word === 'the'));
  const many = Array.from({ length: 60 }, (_, k) => `word${k % 25} theme${k % 7}`),
    a = layoutWordCloud(wordFrequencies(many), 500, 300),
    b = layoutWordCloud(wordFrequencies(many), 500, 300);
  assert.deepEqual(a, b);
  assert.ok(a.length > 10);
  for (let i = 0; i < a.length; i++) {
    assert.ok(a[i].x >= 0 && a[i].y >= 0 && a[i].x + a[i].w <= 500 && a[i].y + a[i].h <= 300);
    for (let j = i + 1; j < a.length; j++) {
      const p = a[i],
        q = a[j];
      assert.ok(
        !(p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y),
        `${p.word} overlaps ${q.word}`,
      );
    }
  }
  assert.ok(a[0].size >= a.at(-1)!.size);
  assert.throws(() => addEntry({ prompt: '', entries: [] }, 'x'.repeat(41)));
  assert.throws(() => validateWordCloud({ prompt: '', entries: [''] }));
});
test('ranking: reorder by step and by drop, stored order repaired', () => {
  let d: RankingData = {
    question: 'Q',
    items: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ],
    order: ['c', 'a'],
  };
  assert.deepEqual(rankedIds(d), ['c', 'a', 'b']);
  d = moveRank(d, 'b', -1);
  assert.deepEqual(d.order, ['c', 'b', 'a']);
  d = moveRankBefore(d, 'a', 'c');
  assert.deepEqual(d.order, ['a', 'c', 'b']);
  d = addRankItem(d, 'D');
  assert.equal(rankedIds(d).length, 4);
  d = removeRankItem(d, 'c');
  assert.deepEqual(rankedIds(d).slice(0, 2), ['a', 'b']);
  validateRanking(d);
  assert.throws(() => validateRanking({ ...d, order: ['ghost'] }));
  assert.throws(() => removeRankItem(removeRankItem(d, 'a'), 'b'));
});
test('quiz: answering, scoring, reveal lock, option edits clear answers', () => {
  let d: QuizData = {
    questions: [
      { id: 'q1', text: '2+2', options: ['3', '4'], correct: 1 },
      { id: 'q2', text: 'Sky', options: ['Blue', 'Green'], correct: 0 },
    ],
    answers: {},
    revealed: false,
  };
  d = answerQuiz(d, 'q1', 1);
  d = answerQuiz(d, 'q2', 1);
  assert.deepEqual(quizScore(d), { correct: 1, answered: 2, total: 2 });
  assert.throws(() => answerQuiz({ ...d, revealed: true }, 'q1', 0));
  assert.throws(() => answerQuiz(d, 'q1', 5));
  assert.equal(updateQuestion(d, { ...d.questions[0], options: ['3', '4', '5'] }).answers.q1, undefined);
  assert.equal(updateQuestion(d, { ...d.questions[0], text: 'Two plus two' }).answers.q1, 1);
  assert.deepEqual(resetQuiz(d).answers, {});
  validateQuiz(d);
  assert.throws(() => validateQuiz({ ...d, questions: [{ ...d.questions[0], correct: 2 }] }), /correct answer/);
  assert.throws(() => validateQuiz({ ...d, answers: { ghost: 0 } }));
});
test('doc formatting wraps, toggles and prefixes markdown selections', () => {
  const t = 'hello world';
  let r = applyDocFormat(t, 0, 5, 'bold');
  assert.equal(r.text, '**hello** world');
  assert.deepEqual([r.start, r.end], [2, 7]);
  r = applyDocFormat(r.text, r.start, r.end, 'bold');
  assert.equal(r.text, t);
  assert.equal(applyDocFormat('a\nb', 0, 3, 'bullet').text, '- a\n- b');
  assert.equal(applyDocFormat('- a\n- b', 0, 7, 'bullet').text, 'a\nb');
  assert.equal(applyDocFormat('a\nb', 0, 3, 'number').text, '1. a\n2. b');
  assert.equal(applyDocFormat('## Title', 3, 3, 'h1').text, '# Title');
  assert.equal(applyDocFormat('task', 0, 4, 'check').text, '- [ ] task');
  assert.equal(applyDocFormat('- [ ] task', 0, 10, 'bullet').text, '- task');
  const link = applyDocFormat('see docs', 4, 8, 'link');
  assert.equal(link.text, 'see [docs](https://)');
  assert.equal(link.text.slice(link.start, link.end), 'https://');
  assert.equal(applyDocFormat('x', 0, 1, 'code').text, '`x`');
  assert.equal(applyDocFormat('a\nb', 0, 3, 'code').text, '```\na\nb\n```');
  assert.equal(applyDocFormat('q', 0, 1, 'quote').text, '> q');
});
test('every engage kind initialises valid data and rejects malformed data', () => {
  for (const k of ['journey', 'planner', 'wordcloud', 'ranking', 'quiz']) {
    const item = fresh(k);
    spec(k).validate(item);
    assert.ok(spec(k).searchText!(item).length > 0, k);
    assert.throws(() => spec(k).validate({ ...item, data: {} }), k);
  }
});
// Needs the kinds wired into model.ts (WidgetKind / widgetKinds) and widget-specs.ts before it can pass.
test('engage kinds round-trip through JSON and parseBoard', () => {
  const items = ['journey', 'planner', 'wordcloud', 'ranking', 'quiz'].map(k => createItem(k as WidgetKind, 0, 0));
  for (const i of items) assert.ok(i.data, `${i.type} init ran through createItem`);
  const b: Board = { ...newBoard(), items };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
  assert.throws(() => parseBoard({ ...b, items: [{ ...items[4], data: { ...items[4].data, questions: [] } }] }));
});
