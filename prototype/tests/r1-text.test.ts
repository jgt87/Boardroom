// Track B (r1): text editing, paste and sticky notes. Pure logic only; the browser parts are in e2e/r1-text.spec.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, noteSizeOf, noteSizePatch, parseBoard } from '../src/model.ts';
import { pastedLink } from '../src/rich-text.ts';
import {
  PASTE_DOC_LINE,
  PASTE_DOC_MIN,
  PASTE_NOTES_MAX,
  classifyPaste,
  isLongProse,
  itemsFromText,
  notesFromCells,
  parseDelimited,
} from '../src/smart-paste.ts';
import { DOC_MAX } from '../src/doc-tools.ts';
import { TEXT_FONT_MAX, TEXT_FONT_MIN, scaleTextFont, textCornerScales } from '../src/interactions.ts';

const at = { x: 0, y: 0 };

test('a pasted single web address links the selection; anything else is pasted as text', () => {
  assert.equal(pastedLink('https://example.com/docs'), 'https://example.com/docs');
  assert.equal(pastedLink('  http://example.com/a?b=1#c \n'), 'http://example.com/a?b=1#c');
  assert.equal(pastedLink('HTTPS://Example.com'), 'https://example.com/');
  for (const other of [
    'example.com',
    'www.example.com',
    'see https://example.com',
    'https://a.com https://b.com',
    'https://a.com\nhttps://b.com',
    'mailto:ada@example.com',
    'javascript:alert(1)',
    'ftp://example.com',
    '',
  ])
    assert.equal(pastedLink(other), null, other);
});

test('long prose pastes as a Doc; short multi-line text and plain lists keep their behaviour', () => {
  const para = 'This sentence is part of a long pasted article about planning. ';
  const prose = `${para.repeat(6)}\n\n${para.repeat(6)}\n\n${para.repeat(3)}`;
  assert.ok(prose.length > PASTE_DOC_MIN);
  assert.equal(classifyPaste(prose), 'doc');
  const made = itemsFromText(prose, { x: 500, y: 300 })!;
  assert.equal(made.kind, 'doc');
  assert.equal(made.items.length, 1);
  const doc = made.items[0];
  assert.equal(doc.type, 'doc');
  assert.equal(doc.data!.markdown, prose.trim());
  assert.equal(doc.x + doc.w / 2, 500);
  assert.equal(doc.y + doc.h / 2, 300);
  parseBoard({ ...newBoard(), items: [doc] });

  // One very long line (no paragraphs) is prose too.
  const oneLine = 'word '.repeat(200);
  assert.ok(oneLine.trim().length > PASTE_DOC_LINE);
  assert.equal(classifyPaste(oneLine), 'doc');

  // Windows line endings are normalised.
  assert.equal(itemsFromText(prose.replace(/\n/g, '\r\n'), at)!.items[0].data!.markdown, prose.trim());

  // Unchanged: short multi-line text becomes notes, one short line a text object.
  assert.equal(classifyPaste('Alpha\nBeta\nGamma'), 'lines');
  assert.equal(classifyPaste('Alpha\n\nBeta'), 'lines');
  assert.equal(classifyPaste('Just one line'), 'text');
  // A long list of short lines without paragraphs stays sticky notes.
  const list = Array.from({ length: 80 }, (_, n) => `Idea number ${n + 1}`).join('\n');
  assert.ok(list.length > PASTE_DOC_MIN);
  assert.equal(isLongProse(list), false);
  assert.equal(classifyPaste(list), 'lines');
  // Spreadsheet cells, Mermaid and addresses still win.
  assert.equal(classifyPaste(`a\tb\n${prose}`), 'cells');
  assert.equal(classifyPaste(`flowchart TD\n${prose}`), 'mermaid');

  // Over the Doc limit: truncated with a note.
  const huge = itemsFromText(`${'x'.repeat(DOC_MAX)}\n\nmore`, at)!;
  assert.equal(huge.items[0].data!.markdown.length, DOC_MAX);
  assert.match(huge.note ?? '', /Only the first/);
});

test('spreadsheet cells can become one sticky per cell, laid out like the cells', () => {
  const rows = parseDelimited('Name\tRole\nAda\t\nGrace\tAdmiral', '\t');
  const { items, truncated } = notesFromCells(rows, { x: 1000, y: 1000 });
  assert.equal(truncated, false);
  assert.deepEqual(
    items.map(i => i.text),
    ['Name', 'Role', 'Ada', 'Grace', 'Admiral'],
  );
  assert.ok(items.every(i => i.type === 'note'));
  const [name, role, ada, grace] = items;
  assert.equal(name.y, role.y);
  assert.ok(role.x > name.x);
  assert.equal(ada.x, name.x);
  assert.equal(grace.x, name.x);
  assert.ok(grace.y > ada.y && ada.y > name.y);
  // Centred on the paste point.
  const left = Math.min(...items.map(i => i.x)),
    right = Math.max(...items.map(i => i.x + i.w)),
    top = Math.min(...items.map(i => i.y)),
    bottom = Math.max(...items.map(i => i.y + i.h));
  assert.equal((left + right) / 2, 1000);
  assert.equal((top + bottom) / 2, 1000);
  parseBoard({ ...newBoard(), items });

  const many = notesFromCells(
    Array.from({ length: 30 }, () => Array.from({ length: 5 }, () => 'v')),
    at,
  );
  assert.equal(many.items.length, PASTE_NOTES_MAX);
  assert.equal(many.truncated, true);
  assert.deepEqual(notesFromCells([['', ' ']], at), { items: [], truncated: false });
});

test('text corner resize scales the font; side handles, Shift and auto size do not', () => {
  const text = { ...createItem('text', 0, 0), id: 't', w: 200, h: 50, format: { fontSize: 20 } };
  assert.equal(textCornerScales(text, 'se', false), true);
  assert.equal(textCornerScales(text, 'nw', false), true);
  assert.equal(textCornerScales(text, 'e', false), false);
  assert.equal(textCornerScales(text, 's', false), false);
  assert.equal(textCornerScales(text, 'se', true), false);
  assert.equal(textCornerScales({ ...text, format: { fontSize: 'auto' } }, 'se', false), false);
  assert.equal(textCornerScales({ ...createItem('note', 0, 0) }, 'se', false), false);
  assert.equal(textCornerScales(undefined, 'se', false), false);

  const before = { ...newBoard(), items: [text] };
  const grown = { ...before, items: [{ ...text, w: 300, h: 75 }] };
  assert.equal(scaleTextFont(grown, before, 't').items[0].format!.fontSize, 30);
  const shrunk = { ...before, items: [{ ...text, w: 130, h: 32.5 }] };
  assert.equal(scaleTextFont(shrunk, before, 't').items[0].format!.fontSize, 13);
  // Clamped to the range parseBoard accepts, rounded to half points.
  const tiny = { ...before, items: [{ ...text, w: 20, h: 5 }] };
  assert.equal(scaleTextFont(tiny, before, 't').items[0].format!.fontSize, TEXT_FONT_MIN);
  const huge = { ...before, items: [{ ...text, w: 2000, h: 500 }] };
  assert.equal(scaleTextFont(huge, before, 't').items[0].format!.fontSize, TEXT_FONT_MAX);
  const odd = { ...before, items: [{ ...text, w: 213, h: 53 }] };
  assert.equal(scaleTextFont(odd, before, 't').items[0].format!.fontSize, 21.5);
  parseBoard(scaleTextFont(odd, before, 't'));
  // Default size (28) when no font size is stored; other format fields are kept.
  const plain = { ...text, format: { bold: true } };
  const scaled = scaleTextFont({ ...before, items: [{ ...plain, w: 100 }] }, { ...before, items: [plain] }, 't');
  assert.deepEqual(scaled.items[0].format, { bold: true, fontSize: 14 });
  // Unknown ids and other kinds are left alone.
  assert.equal(scaleTextFont(grown, before, 'missing'), grown);
});

test('rectangle sticky notes: presets, centre kept, persisted and validated', () => {
  const note = { ...createItem('note', 0, 0), x: 0, y: 0, w: 210, h: 210 };
  assert.equal(noteSizeOf(note), 210);
  const wide = { ...note, ...noteSizePatch(note, 'keep', 'rectangle') };
  assert.deepEqual([wide.w, wide.h, wide.noteShape], [420, 210, 'rectangle']);
  assert.equal(wide.x + wide.w / 2, 105);
  assert.equal(wide.y + wide.h / 2, 105);
  assert.equal(noteSizeOf(wide), 210);
  // Size presets keep the rectangle shape.
  const large = { ...wide, ...noteSizePatch(wide, 300) };
  assert.deepEqual([large.w, large.h, large.noteShape], [600, 300, 'rectangle']);
  assert.equal(noteSizeOf(large), 300);
  // Back to square drops the field.
  const square = { ...large, ...noteSizePatch(large, 300, 'square') };
  assert.deepEqual([square.w, square.h, square.noteShape], [300, 300, undefined]);
  assert.equal('noteShape' in JSON.parse(JSON.stringify(square)), false);
  // A free resize reads as custom; switching shape keeps the height.
  const custom = { ...wide, w: 333, h: 180 };
  assert.equal(noteSizeOf(custom), 'custom');
  assert.deepEqual([noteSizePatch(custom, 'keep', 'square').w, noteSizePatch(custom, 'keep', 'square').h], [180, 180]);

  const board = parseBoard(JSON.parse(JSON.stringify({ ...newBoard(), items: [{ ...wide, id: 'n' }] })));
  assert.equal(board.items[0].noteShape, 'rectangle');
  assert.throws(
    () => parseBoard({ ...newBoard(), items: [{ ...wide, noteShape: 'circle' }] }),
    /Invalid sticky note shape/,
  );
});
