import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { RecordRow } from '../src/model.ts';
import {
  evaluateFormula,
  formulaRefs,
  numericFieldValue,
  parseFormula,
  renameFormulaRef,
} from '../src/record-formula.ts';
import {
  applySavedView,
  defaultSchema,
  deleteRecordView,
  formulaCycle,
  formulaError,
  normalizeRecordUrl,
  renameRecordField,
  renameRecordView,
  saveRecordView,
  setRecordSchema,
  validateRecordSchema,
  validateRecordValues,
} from '../src/record-schema.ts';
import type { RecordField, RecordSchema } from '../src/record-schema.ts';
import {
  calculateRecords,
  cleanRecordView,
  deleteRecords,
  duplicateRecords,
  formatCalc,
  groupedRecords,
  queryRecords,
  validateRecordView,
  withRecordValue,
} from '../src/record-query.ts';
import {
  addChildRecord,
  columnLoad,
  deleteRecord,
  descendantIds,
  indentRecord,
  outdentRecord,
  parentError,
  recordTree,
  recordsError,
  setParent,
} from '../src/records.ts';

const row = (id: string, extra: Partial<RecordRow> = {}): RecordRow => ({
  id,
  title: id.toUpperCase(),
  status: 'Not started',
  assignee: '',
  start: '',
  end: '',
  ...extra,
});
const fields: RecordField[] = [
  { id: 'effort', name: 'Effort', type: 'number' },
  { id: 'rate', name: 'Rate', type: 'number' },
  { id: 'cost', name: 'Cost', type: 'formula', formula: '{Effort} * {Rate}' },
  { id: 'total', name: 'Total', type: 'formula', formula: 'round({Cost} / 3, 2) + {Points}' },
];
const schema: RecordSchema = { ...defaultSchema, fields };

test('formula parser: precedence, unary minus, functions and references', () => {
  const run = (text: string, refs: Record<string, number | null> = {}) =>
    evaluateFormula(parseFormula(text), name => refs[name] ?? null);
  assert.equal(run('1 + 2 * 3'), 7);
  assert.equal(run('(1 + 2) * 3'), 9);
  assert.equal(run('-2 * -3'), 6);
  assert.equal(run('10 % 4 - 1'), 1);
  assert.equal(run('round(10 / 3, 2)'), 3.33);
  assert.equal(run('max(1, {A}, 3) + min(4, 5) + abs(-2)', { A: 9 }), 15);
  assert.equal(run('max(1, {A}, 3)', { A: 9 }), 9);
  assert.equal(run('{A} + 1'), null, 'missing reference gives null');
  assert.equal(run('1 / 0'), null, 'division by zero gives null');
  assert.equal(run('1e308 * 10'), null, 'overflow gives null');
  assert.deepEqual([...formulaRefs(parseFormula('{A} + {B} * {A}'))], ['A', 'B']);
  assert.equal(
    renameFormulaRef('{Effort} + { Effort } + {Effortless}', 'Effort', 'Work'),
    '{Work} + {Work} + {Effortless}',
  );
});

test('formula parser rejects malicious and malformed input without evaluating code', () => {
  for (const text of [
    '',
    'alert(1)',
    'constructor.constructor("return 1")()',
    '__proto__',
    '1 +',
    '(1',
    '1)',
    '{unterminated',
    '{}',
    '1 ; 2',
    '`1`',
    'this',
    'globalThis.process',
    'x'.repeat(501),
    '('.repeat(100) + '1' + ')'.repeat(100),
    '-'.repeat(100) + '1',
    Array(300).fill('1').join('+'),
    'round()',
    'abs(1, 2)',
    'max(' + Array(30).fill('1').join(',') + ')',
  ])
    assert.throws(() => parseFormula(text), Error, JSON.stringify(text.slice(0, 40)));
  // Field names are looked up, never executed.
  const tree = parseFormula('{constructor} + {__proto__}');
  assert.equal(
    evaluateFormula(tree, name => (Object.hasOwn({ a: 1 }, name) ? 1 : null)),
    null,
  );
});

test('formula fields compute from number fields, Points and other formulas', () => {
  const r = row('a', { points: 5, values: { effort: 3, rate: 4 } });
  assert.equal(numericFieldValue(r, fields[2], fields), 12);
  assert.equal(numericFieldValue(r, fields[3], fields), 9);
  assert.equal(numericFieldValue(row('b'), fields[3], fields), null);
  validateRecordSchema(schema);
  assert.equal(
    formulaError(schema, '{Effort} + {Missing}'),
    '"Missing" is not a number field. Use {Points} or the name of a number or formula field.',
  );
  assert.equal(formulaError(schema, '{Total} * 2', 'cost'), 'Formula fields cannot refer to each other in a cycle.');
  assert.equal(formulaError(schema, '{Cost}', 'cost'), 'A formula cannot refer to its own field.');
  assert.equal(formulaError(schema, '{Effort} * 2'), null);
  assert.equal(formulaCycle([...fields.slice(0, 2), { ...fields[2], formula: '{Total}' }, fields[3]]), true);
  assert.throws(() =>
    validateRecordSchema({ ...schema, fields: [{ id: 'x', name: 'X', type: 'formula', formula: '{X} + 1' }] }),
  );
  assert.throws(() =>
    validateRecordSchema({ ...schema, fields: [{ id: 'x', name: 'X', type: 'formula', formula: 'eval(1)' }] }),
  );
  assert.throws(() =>
    validateRecordSchema({ ...schema, fields: [{ id: 'x', name: 'X', type: 'text', formula: '1' }] }),
  );
  // Formula values are calculated, never stored.
  assert.throws(() => validateRecordValues([row('a', { values: { cost: 3 } })], schema));
  assert.throws(() => withRecordValue(row('a'), 'field:cost', '4', schema));
  // Renaming a field rewrites formula references.
  const renamed = renameRecordField(schema, 'effort', 'Work');
  assert.equal(renamed.fields.find(f => f.id === 'cost')!.formula, '{Work} * {Rate}');
  // Sorting and filtering use computed values.
  const rows = [row('a', { values: { effort: 1, rate: 1 } }), row('b', { values: { effort: 5, rate: 2 } })];
  assert.deepEqual(
    queryRecords(rows, { sort: { field: 'field:cost', direction: 'desc' } }, '', schema).map(r => r.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    queryRecords(rows, { filters: [{ field: 'field:cost', op: 'gt', value: '5' }] }, '', schema).map(r => r.id),
    ['b'],
  );
});

test('link fields accept only http(s) URLs', () => {
  const s: RecordSchema = { ...defaultSchema, fields: [{ id: 'u', name: 'Link', type: 'url' }] };
  validateRecordSchema(s);
  assert.equal(normalizeRecordUrl('example.com/a'), 'https://example.com/a');
  assert.throws(() => normalizeRecordUrl('javascript:alert(1)'));
  assert.throws(() => normalizeRecordUrl('https://user:pw@example.com'));
  validateRecordValues([row('a', { values: { u: 'https://example.com/a' } })], s);
  assert.throws(() => validateRecordValues([row('a', { values: { u: 'javascript:alert(1)' } })], s));
  assert.throws(
    () => validateRecordValues([row('a', { values: { u: 'example.com' } })], s),
    'stored links are normalised',
  );
});

test('progress display settings validate', () => {
  validateRecordSchema({
    ...defaultSchema,
    fields: [{ id: 'p', name: 'P', type: 'number', display: 'progress', min: 0, max: 10 }],
  });
  validateRecordSchema({ ...defaultSchema, fields: [{ ...fields[0], display: 'progress' }] });
  for (const f of [
    { id: 'p', name: 'P', type: 'text', display: 'progress' },
    { id: 'p', name: 'P', type: 'number', display: 'bar' },
    { id: 'p', name: 'P', type: 'number', display: 'progress', min: 10, max: 10 },
    { id: 'p', name: 'P', type: 'number', display: 'progress', max: Number.NaN },
  ])
    assert.throws(() => validateRecordSchema({ ...defaultSchema, fields: [f as RecordField] }));
});

test('column calculations over visible rows', () => {
  const rows = [
    row('a', { points: 3, values: { effort: 2, rate: 1 } }),
    row('b', { points: 1, values: { effort: 4 } }),
    row('c', { values: { effort: 9, rate: 2 } }),
    row('d'),
  ];
  assert.equal(calculateRecords(rows, 'field:effort', 'sum', schema), 15);
  assert.equal(calculateRecords(rows, 'field:effort', 'avg', schema), 5);
  assert.equal(calculateRecords(rows, 'field:effort', 'min', schema), 2);
  assert.equal(calculateRecords(rows, 'field:effort', 'max', schema), 9);
  assert.equal(calculateRecords(rows, 'field:effort', 'median', schema), 4);
  assert.equal(calculateRecords(rows.slice(0, 2), 'field:effort', 'median', schema), 3);
  assert.equal(calculateRecords(rows, 'field:effort', 'count', schema), 3);
  assert.equal(calculateRecords(rows, 'field:cost', 'sum', schema), 20, 'formula columns');
  assert.equal(calculateRecords(rows, 'points', 'sum', schema), 4);
  assert.equal(calculateRecords([], 'field:effort', 'avg', schema), null);
  assert.equal(calculateRecords([], 'field:effort', 'sum', schema), 0);
  assert.equal(formatCalc(null), '—');
  assert.equal(formatCalc(10 / 3), '3.33');
  assert.equal(formatCalc(2.5), '2.5');
  const filtered = queryRecords(rows, { filters: [{ field: 'field:effort', op: 'gt', value: '3' }] }, '', schema);
  assert.equal(calculateRecords(filtered, 'field:effort', 'sum', schema), 13);
  // Stored with the view, validated, and cleaned when a field disappears.
  validateRecordView({ calcs: { 'field:effort': 'sum', title: 'count' } }, schema);
  assert.throws(() => validateRecordView({ calcs: { 'field:effort': 'eval' as 'sum' } }, schema));
  assert.throws(() => validateRecordView({ calcs: { 'field:gone': 'sum' } }, schema));
  assert.deepEqual(cleanRecordView({ calcs: { 'field:gone': 'sum', 'field:effort': 'avg' } }, schema).calcs, {
    'field:effort': 'avg',
  });
});

test('grouping for swimlanes and timeline rows keeps order within groups', () => {
  const rows = [
    row('a', { assignee: 'Ann' }),
    row('b', { assignee: 'Bo' }),
    row('c', { assignee: 'Ann' }),
    row('d', { assignee: '' }),
  ];
  assert.deepEqual(
    groupedRecords(rows, 'assignee').map(g => [g.value, g.rows.map(r => r.id)]),
    [
      ['Ann', ['a', 'c']],
      ['Bo', ['b']],
      ['', ['d']],
    ],
  );
  assert.deepEqual(
    groupedRecords([row('a', { values: { effort: 1, rate: 2 } })], 'field:cost', schema).map(g => g.value),
    ['2'],
  );
  // Moving a card into another lane sets the lane field.
  assert.equal(withRecordValue(rows[0], 'assignee', 'Bo', schema).assignee, 'Bo');
});

test('Kanban column settings: colours and capacities validate and follow status renames', () => {
  validateRecordSchema({
    ...defaultSchema,
    columns: { 'In progress': { color: '#ffeeaa', limit: 3 } },
    capacity: 'points',
  });
  for (const columns of [
    { Missing: { limit: 2 } },
    { 'In progress': { color: 'red' } },
    { 'In progress': { limit: 0 } },
    { 'In progress': { limit: 1.5 } },
    { 'In progress': { other: 1 } },
  ])
    assert.throws(() => validateRecordSchema({ ...defaultSchema, columns } as unknown as RecordSchema));
  assert.throws(() => validateRecordSchema({ ...defaultSchema, capacity: 'weight' as 'count' }));
  assert.equal(columnLoad([row('a', { points: 3 }), row('b', { points: 2 }), row('c')]), 3);
  assert.equal(columnLoad([row('a', { points: 3 }), row('b', { points: 2 }), row('c')], 'points'), 5);
  const board = {
    ...newBoard(),
    items: [{ ...createItem('kanban', 0, 0), id: 'w', datasetId: 'd' }],
    datasets: { d: [row('r')] },
  };
  const next = setRecordSchema(
    board,
    'd',
    {
      statuses: ['Doing', 'Complete'],
      fields: [],
      columns: { 'In progress': { limit: 2 }, 'Not started': { color: '#000000' } },
    },
    { from: 'In progress', to: 'Doing' },
  );
  assert.deepEqual(next.recordSchemas!.d.columns, { Doing: { limit: 2 } });
  parseBoard(next);
});

test('saved views: save, overwrite by name, rename, delete, apply; validated and cleaned', () => {
  let n = 0;
  const id = () => `v${++n}`;
  const config = {
    filters: [{ field: 'field:effort', op: 'gt' as const, value: '1' }],
    group: 'assignee',
    timeline: { scale: 'days' as const },
  };
  const first = saveRecordView(schema, ' Mine ', config, id);
  assert.equal(first.id, 'v1');
  assert.deepEqual(first.schema.views![0], {
    id: 'v1',
    name: 'Mine',
    config: { filters: config.filters, group: 'assignee' },
  });
  const again = saveRecordView(first.schema, 'Mine', { sort: { field: 'title', direction: 'asc' } }, id);
  assert.equal(again.id, 'v1');
  assert.equal(again.schema.views!.length, 1);
  assert.deepEqual(again.schema.views![0].config, { sort: { field: 'title', direction: 'asc' } });
  const second = saveRecordView(again.schema, 'Other', {}, id).schema;
  assert.throws(() => renameRecordView(second, 'v1', 'Other'));
  assert.throws(() => saveRecordView(second, '  ', {}, id));
  const renamed = renameRecordView(second, 'v1', 'Sorted');
  assert.deepEqual(
    renamed.views!.map(v => v.name),
    ['Sorted', 'Other'],
  );
  validateRecordSchema(renamed);
  assert.deepEqual(applySavedView({ timeline: { scale: 'weeks' }, group: 'status' }, renamed.views![0]), {
    sort: { field: 'title', direction: 'asc' },
    timeline: { scale: 'weeks' },
    activeView: 'v1',
  });
  assert.equal(deleteRecordView(deleteRecordView(renamed, 'v1'), 'v2').views, undefined);
  assert.throws(() =>
    validateRecordSchema({ ...schema, views: [{ id: 'a', name: 'A', config: { group: 'field:gone' } }] }),
  );
  assert.throws(() =>
    validateRecordSchema({
      ...schema,
      views: [
        { id: 'a', name: 'A', config: {} },
        { id: 'b', name: 'A', config: {} },
      ],
    }),
  );
  // Deleting a field cleans saved views instead of rejecting the schema change.
  const board = {
    ...newBoard(),
    items: [{ ...createItem('table', 0, 0), id: 'w', datasetId: 'd' }],
    datasets: { d: [row('r')] },
    recordSchemas: { d: renamed },
  };
  parseBoard(board);
  const without = setRecordSchema(board, 'd', { ...renamed, fields: [], views: first.schema.views });
  assert.equal(without.recordSchemas!.d.views![0].config.filters!.length, 0);
});

test('parent records: validation rejects missing parents and cycles', () => {
  assert.equal(recordsError([row('a'), row('b', { parent: 'a' })]), null);
  assert.match(recordsError([row('a', { parent: 'zz' })])!, /missing parent/);
  assert.match(recordsError([row('a', { parent: 'a' })])!, /own parent/);
  assert.match(recordsError([row('a', { parent: 'b' }), row('b', { parent: 'a' })])!, /cycle/);
  assert.match(
    recordsError([row('a', { parent: 'c' }), row('b', { parent: 'a' }), row('c', { parent: 'b' })])!,
    /cycle/,
  );
  assert.match(recordsError([row('a', { parent: 7 as unknown as string })])!, /missing parent/);
  const rows = [row('a'), row('b', { parent: 'a' }), row('c', { parent: 'b' })];
  assert.equal(parentError(rows, 'a', 'c'), 'A record cannot be nested inside its own child.');
  assert.equal(parentError(rows, 'a', 'a'), 'A record cannot be its own parent.');
  assert.equal(parentError(rows, 'c', 'a'), null);
  assert.throws(() => setParent(rows, 'a', 'b'));
  assert.equal(setParent(rows, 'c', undefined)[2].parent, undefined);
  assert.equal('parent' in setParent(rows, 'c', undefined)[2], false);
  assert.deepEqual([...descendantIds(rows, 'a')].sort(), ['b', 'c']);
});

test('parent records: outline order, collapse, add child, indent and outdent', () => {
  const rows = [row('a'), row('x'), row('b', { parent: 'a' }), row('c', { parent: 'b' }), row('d', { parent: 'a' })];
  assert.deepEqual(
    recordTree(rows).map(e => `${e.row.id}${e.depth}${e.children}`),
    ['a02', 'b11', 'c20', 'd10', 'x00'],
  );
  assert.deepEqual(
    recordTree(rows, ['b']).map(e => e.row.id),
    ['a', 'b', 'd', 'x'],
  );
  assert.equal(recordTree(rows, ['b'])[1].collapsed, true);
  // A filtered-out parent shows its children at the top level.
  assert.deepEqual(
    recordTree(rows.filter(r => r.id !== 'a')).map(e => `${e.row.id}${e.depth}`),
    ['x0', 'b0', 'c1', 'd0'],
  );
  const added = addChildRecord(rows, 'a', row('n'));
  assert.deepEqual(
    added.map(r => r.id),
    ['a', 'x', 'b', 'c', 'd', 'n'],
  );
  assert.equal(added[5].parent, 'a');
  assert.deepEqual(
    addChildRecord(rows, 'x', row('m')).map(r => r.id),
    ['a', 'x', 'm', 'b', 'c', 'd'],
  );
  const tree = recordTree(rows);
  assert.equal(indentRecord(rows, tree, 'd').find(r => r.id === 'd')!.parent, 'b');
  assert.equal(indentRecord(rows, tree, 'x').find(r => r.id === 'x')!.parent, 'a');
  assert.equal(indentRecord(rows, tree, 'a'), rows, 'first record cannot indent');
  assert.equal(outdentRecord(rows, 'c').find(r => r.id === 'c')!.parent, 'a');
  assert.equal(outdentRecord(rows, 'b').find(r => r.id === 'b')!.parent, undefined);
});

test('deleting a parent re-parents its children to the nearest surviving ancestor', () => {
  const rows = [row('a'), row('b', { parent: 'a' }), row('c', { parent: 'b' }), row('d', { parent: 'c' })];
  const one = deleteRecord(rows, 'b');
  assert.deepEqual(
    one.map(r => [r.id, r.parent]),
    [
      ['a', undefined],
      ['c', 'a'],
      ['d', 'c'],
    ],
  );
  const many = deleteRecords(rows, ['b', 'c']);
  assert.deepEqual(
    many.map(r => [r.id, r.parent]),
    [
      ['a', undefined],
      ['d', 'a'],
    ],
  );
  assert.equal('parent' in deleteRecord(rows, 'a')[0], false);
  assert.equal(recordsError(many), null);
  // Duplicates keep the hierarchy inside the copied set.
  let n = 0;
  const copy = duplicateRecords(rows, ['b', 'c'], () => `n${++n}`);
  assert.equal(copy.find(r => r.id === 'n1')!.parent, 'a');
  assert.equal(copy.find(r => r.id === 'n2')!.parent, 'n1');
  assert.equal(recordsError(copy), null);
});

test('old boards load unchanged and new record data round-trips through parseBoard', () => {
  const old = {
    ...newBoard(),
    items: [{ ...createItem('table', 0, 0), id: 'w', datasetId: 'd', recordView: { group: 'status' } }],
    datasets: { d: [row('a')] },
    recordSchemas: {
      d: { statuses: ['Not started', 'Done'], fields: [{ id: 'n', name: 'N', type: 'number' as const }] },
    },
  };
  assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(old))), JSON.parse(JSON.stringify(old)));
  const next = {
    ...old,
    items: [
      {
        ...old.items[0],
        recordView: { group: 'assignee', calcs: { 'field:n': 'sum' as const }, collapsed: ['a'], activeView: 'v' },
      },
    ],
    datasets: { d: [row('a', { values: { n: 2 } }), row('b', { parent: 'a' })] },
    recordSchemas: {
      d: {
        ...old.recordSchemas.d,
        fields: [
          { id: 'n', name: 'N', type: 'number' as const, display: 'progress' as const, max: 10 },
          { id: 'f', name: 'F', type: 'formula' as const, formula: '{N} * 2' },
          { id: 'u', name: 'U', type: 'url' as const },
        ],
        columns: { Done: { color: '#aabbcc', limit: 4 } },
        capacity: 'count' as const,
        views: [{ id: 'v', name: 'Mine', config: { group: 'assignee' } }],
      },
    },
  };
  parseBoard(JSON.parse(JSON.stringify(next)));
  assert.throws(() => parseBoard({ ...next, datasets: { d: [row('a', { parent: 'b' }), row('b', { parent: 'a' })] } }));
  assert.throws(() =>
    parseBoard({ ...next, items: [{ ...next.items[0], recordView: { collapsed: 'a' as unknown as string[] } }] }),
  );
});
