// Track L: board notes, note templates, record and sticky templates, gallery sort, quick-create links and
// Doc block selection helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board } from '../src/model.ts';
import {
  NOTES_MAX,
  isoDay,
  noteTemplateMarkdown,
  noteTemplates,
  noteTemplatesFor,
  notesFileName,
  setBoardNotes,
} from '../src/board-notes.ts';
import { boardContentParts } from '../src/board-library.ts';
import { applyRecordTemplate, isFreshDataset, recordTemplateData, recordTemplates } from '../src/record-templates.ts';
import { schemaOf } from '../src/record-schema.ts';
import { addStickySet, stickySets } from '../src/sticky-sets.ts';
import {
  isTemplateSort,
  sortTemplates,
  starterUseKey,
  templateBySlug,
  templateCatalog,
  templateSlug,
} from '../src/starter-templates.ts';
import { noteTemplateUse, parseTemplateUse, sortUserTemplates, userUseKey } from '../src/user-templates.ts';
import type { UserTemplate } from '../src/user-templates.ts';
import { parseDeepLink, parseQuickCreate } from '../src/deep-link.ts';
import { blockSpan, joinBlocks, moveBlocks, removeBlocks, stepBlockRange } from '../src/doc-tools.ts';
import { templateNames } from '../src/board-tools.ts';

let n = 0;
const ids = () => `id-${++n}`;

test('board notes are optional, validated, searchable and kept in backups', () => {
  const b = newBoard();
  assert.equal(parseBoard(JSON.parse(JSON.stringify(b))).notes, undefined);
  const withNotes = setBoardNotes(b, '# Kick-off\r\n\r\nDecide the **launch** date\n');
  assert.equal(withNotes.notes, '# Kick-off\n\nDecide the **launch** date');
  // A backup is the board JSON, so the notes survive a round trip.
  assert.equal(parseBoard(JSON.parse(JSON.stringify(withNotes))).notes, withNotes.notes);
  assert.ok(boardContentParts(withNotes).some(p => p.text.includes('launch')));
  // Clearing removes the field; unchanged notes return the same board (no undo step).
  assert.equal('notes' in setBoardNotes(withNotes, '   '), false);
  assert.equal(setBoardNotes(withNotes, withNotes.notes!), withNotes);
  assert.equal(setBoardNotes(b, 'x'.repeat(NOTES_MAX + 10)).notes!.length, NOTES_MAX);
  assert.throws(() => parseBoard({ ...b, notes: 42 }), /notes/);
  assert.throws(() => parseBoard({ ...b, notes: 'x'.repeat(NOTES_MAX + 1) }), /notes/);
  assert.equal(notesFileName('Q3 / planning'), 'Q3 planning notes.md');
  assert.equal(notesFileName(''), 'Board notes.md');
});

test('note templates cover meetings, retros, decisions and 1:1s with today’s date', () => {
  assert.deepEqual(
    noteTemplates.map(t => t.id),
    ['meeting', 'retro', 'decisions', 'one-on-one'],
  );
  const day = new Date(2026, 10, 5);
  assert.equal(isoDay(day), '2026-11-05');
  for (const t of noteTemplatesFor(day)) {
    assert.ok(!t.markdown.includes('{date}'), t.id);
    assert.ok(t.markdown.includes('2026-11-05'), t.id);
    assert.ok(t.markdown.startsWith('# '), t.id);
    // Tables cannot be edited in Docs yet, so templates avoid them.
    assert.ok(!t.markdown.includes('| ---'), t.id);
  }
  assert.match(noteTemplateMarkdown(noteTemplates[0], day), /\*\*Date:\*\* 2026-11-05/);
});

function recordsBoard(kind: 'table' | 'kanban' = 'table'): { board: Board; id: string } {
  const item = { ...createItem(kind, 0, 0), id: 'rec', text: kind === 'table' ? 'Table' : 'Kanban', datasetId: 'ds' };
  return {
    board: {
      ...newBoard(),
      items: [item],
      datasets: { ds: [{ id: 'r1', title: 'First task', status: 'Not started', assignee: '', start: '', end: '' }] },
    },
    id: item.id,
  };
}

test('record templates apply columns, fields and examples only to a fresh Table or Kanban', () => {
  assert.deepEqual(
    recordTemplates.map(t => t.id),
    ['bugs', 'sprint', 'content', 'crm'],
  );
  for (const t of recordTemplates) assert.doesNotThrow(() => recordTemplateData(t, ids), t.id);
  const { board } = recordsBoard('kanban');
  assert.equal(isFreshDataset(board, 'ds'), true);
  const next = applyRecordTemplate(board, board.items[0], 'bugs', ids);
  assert.deepEqual(schemaOf(next, 'ds').statuses, ['Reported', 'Triaged', 'In progress', 'In review', 'Fixed']);
  assert.equal(next.datasets!.ds.length, 2);
  assert.equal(next.items[0].text, 'Bug tracker');
  assert.doesNotThrow(() => parseBoard(JSON.parse(JSON.stringify(next))));
  // Once applied (or after real edits) templates are no longer offered and never overwrite work.
  assert.equal(isFreshDataset(next, 'ds'), false);
  assert.equal(applyRecordTemplate(next, next.items[0], 'crm', ids), next);
  const edited: Board = { ...board, datasets: { ds: [{ ...board.datasets!.ds[0], title: 'Real work' }] } };
  assert.equal(isFreshDataset(edited, 'ds'), false);
  // A renamed object keeps its name.
  const named: Board = { ...board, items: [{ ...board.items[0], text: 'Team board' }] };
  assert.equal(applyRecordTemplate(named, named.items[0], 'sprint', ids).items[0].text, 'Team board');
  assert.equal(applyRecordTemplate(board, board.items[0], 'nope', ids), board);
});

test('sticky note sets are placed centred as one group', () => {
  const b = newBoard();
  for (const set of stickySets) {
    const made = addStickySet(b, set.id, { x: 500, y: 300 }, (x, y, f) => createItem('note', x, y, f))!;
    assert.equal(made.ids.length, set.notes.length);
    const notes = made.board.items.filter(i => made.ids.includes(i.id));
    assert.deepEqual(
      notes.map(i => i.fill),
      set.notes.map(s => s.fill),
    );
    assert.equal(new Set(notes.map(i => i.group)).size, 1);
    assert.equal(made.board.groups?.length, 1);
    const minX = Math.min(...notes.map(i => i.x)),
      maxX = Math.max(...notes.map(i => i.x + i.w));
    assert.equal((minX + maxX) / 2, 500);
  }
  assert.equal(
    addStickySet(b, 'missing', { x: 0, y: 0 }, (x, y, f) => createItem('note', x, y, f)),
    null,
  );
});

test('template gallery sorts by name, category and recent use', () => {
  assert.equal(isTemplateSort('recent'), true);
  assert.equal(isTemplateSort('size'), false);
  assert.deepEqual(sortTemplates(templateCatalog, 'default'), templateCatalog);
  const byName = sortTemplates(templateCatalog, 'name').map(t => t.name);
  assert.deepEqual(
    byName,
    [...byName].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
  );
  const byCategory = sortTemplates(templateCatalog, 'category');
  assert.equal(byCategory[0].category, 'Brainstorming');
  assert.equal(byCategory.at(-1)!.category, 'Meetings');
  let use = noteTemplateUse({}, starterUseKey('SWOT'), new Date('2026-01-01T00:00:00Z'));
  use = noteTemplateUse(use, starterUseKey('Icebreaker'), new Date('2026-02-01T00:00:00Z'));
  const recent = sortTemplates(templateCatalog, 'recent', use).map(t => t.name);
  assert.deepEqual(recent.slice(0, 3), ['Icebreaker', 'SWOT', templateCatalog[0].name]);
  // Stored use times are cleaned and capped.
  assert.deepEqual(parseTemplateUse('{"a":"2026-01-01T00:00:00.000Z","b":5,"c":"not a date"}'), {
    a: '2026-01-01T00:00:00.000Z',
  });
  assert.deepEqual(parseTemplateUse('[1]'), {});
  assert.deepEqual(parseTemplateUse('{bad'), {});
  let many = {};
  for (let k = 0; k < 120; k++) many = noteTemplateUse(many, `starter:${k}`, new Date(Date.UTC(2026, 0, 1, 0, k)));
  assert.equal(Object.keys(many).length, 100);
  assert.ok(!('starter:0' in many));
  const user = (id: string, name: string): UserTemplate => ({ id, name, created: '', count: 1, html: '' });
  const list = [user('1', 'beta'), user('2', 'Alpha'), user('3', 'gamma')];
  assert.deepEqual(
    sortUserTemplates(list, 'name').map(t => t.name),
    ['Alpha', 'beta', 'gamma'],
  );
  assert.deepEqual(
    sortUserTemplates(list, 'recent', { [userUseKey('3')]: '2026-01-01T00:00:00.000Z' }).map(t => t.id),
    ['3', '1', '2'],
  );
});

test('quick-create links make a blank, template or format board', () => {
  assert.deepEqual(parseQuickCreate('#new'), { kind: 'blank' });
  assert.deepEqual(parseQuickCreate('#new='), { kind: 'blank' });
  assert.deepEqual(parseQuickCreate('#new=kanban-retro'), { kind: 'template', name: 'Kanban retro' });
  assert.deepEqual(parseQuickCreate('#new=Kanban%20retro'), { kind: 'template', name: 'Kanban retro' });
  assert.deepEqual(parseQuickCreate('#new=SWOT'), { kind: 'template', name: 'SWOT' });
  assert.deepEqual(parseQuickCreate('#new=doc'), { kind: 'format', format: 'doc' });
  assert.deepEqual(parseQuickCreate('#new=nothing-here'), { kind: 'unknown', id: 'nothing-here' });
  assert.equal(parseQuickCreate('#board=abc'), null);
  assert.equal(parseQuickCreate('#newsletter'), null);
  assert.equal(parseQuickCreate(''), null);
  // Quick-create hashes are never mistaken for board links.
  assert.equal(parseDeepLink('#new=swot'), null);
  // Every gallery template has a usable slug.
  for (const name of templateNames) assert.equal(templateBySlug(templateSlug(name))?.name, name);
  assert.equal(templateSlug('Cross-functional flowchart'), 'cross-functional-flowchart');
});

test('Doc block selection: step, extend, move and delete blocks', () => {
  const r = { anchor: 1, focus: 1 };
  assert.deepEqual(stepBlockRange(r, 1, false, 4), { anchor: 2, focus: 2 });
  assert.deepEqual(stepBlockRange(r, 1, true, 4), { anchor: 1, focus: 2 });
  assert.deepEqual(stepBlockRange({ anchor: 3, focus: 3 }, 1, true, 4), { anchor: 3, focus: 3 });
  assert.deepEqual(stepBlockRange({ anchor: 0, focus: 0 }, -1, false, 4), { anchor: 0, focus: 0 });
  assert.deepEqual(blockSpan({ anchor: 3, focus: 1 }), [1, 3]);
  const blocks = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveBlocks(blocks, { anchor: 1, focus: 2 }, -1), {
    blocks: ['b', 'c', 'a', 'd'],
    range: { anchor: 0, focus: 1 },
  });
  assert.deepEqual(moveBlocks(blocks, { anchor: 2, focus: 1 }, 1), {
    blocks: ['a', 'd', 'b', 'c'],
    range: { anchor: 3, focus: 2 },
  });
  assert.equal(moveBlocks(blocks, { anchor: 0, focus: 0 }, -1), null);
  assert.equal(moveBlocks(blocks, { anchor: 2, focus: 3 }, 1), null);
  assert.deepEqual(removeBlocks(blocks, { anchor: 1, focus: 2 }), { blocks: ['a', 'd'], caret: 1 });
  assert.deepEqual(removeBlocks(blocks, { anchor: 3, focus: 3 }), { blocks: ['a', 'b', 'c'], caret: 2 });
  assert.deepEqual(removeBlocks(['a'], { anchor: 0, focus: 0 }), { blocks: [], caret: -1 });
  assert.equal(joinBlocks(['# Title\n\n', '- one\n- two\n\n', '\n\n', 'Text\n\n']), '# Title\n\n- one\n- two\n\nText');
});
