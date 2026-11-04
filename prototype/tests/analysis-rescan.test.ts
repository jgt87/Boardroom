// Items 78–85: Slides decks, Doc callouts/templates/import/export, shape packs, wireframe button styles,
// open-ended activities, reactions (UI only), PowerPoint import and sticky note authors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Item, Board } from '../src/model.ts';
import { shapeKinds, shapePacks, shapeLabels, shapeSizes, shapeEdge, shapeContains, textBox } from '../src/shapes.ts';
import { packKinds } from '../src/shape-packs.ts';
import { adoptGridObjects } from '../src/grid-canvas.ts';
import { checkAccessibility } from '../src/board-tools.ts';
import {
  newSlide,
  insertSlide,
  duplicateSlide,
  deleteSlide,
  moveSlide,
  setSlideLayout,
  voteOption,
  resetVotes,
  slideTemplates,
  addResponse,
  responsesToNotes,
  DECK_MAX,
  OPEN_MAX,
} from '../src/specs-activities.ts';
import type { DeckData, OpenEndedData } from '../src/specs-activities.ts';
import { parsePptx, slideFromXml, slideOrder } from '../src/pptx.ts';
import {
  docFromMarkdown,
  docTitle,
  markdownFileName,
  exportMarkdown,
  calloutOf,
  calloutMarkdown,
  filterSlash,
  docTemplates,
  DOC_MAX,
} from '../src/doc-tools.ts';
import { renderMarkdown } from '../src/markdown.ts';
import { applyDocFormat } from '../src/engage.ts';
import { cleanAuthor, initials, stampAuthors } from '../src/authors.ts';
import { widgetSearchText } from '../src/widget-specs.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const roundTrip = (b: Board) => assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
const deckOf = (i: Item) => i.data as DeckData;

// Item 80 — shape packs
test('shape packs list every shape once and new shapes have labels, sizes and attachable outlines', () => {
  const listed = shapePacks.flatMap(p => p.kinds);
  assert.deepEqual([...listed].sort(), [...shapeKinds].sort());
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual(
    shapePacks.map(p => p.name),
    ['Basic', 'Flowchart', 'Callouts', 'UML', 'BPMN', 'ERD'],
  );
  assert.ok(packKinds.length >= 35, 'packs add many shapes');
  for (const kind of packKinds) {
    assert.ok(shapeLabels[kind], kind);
    assert.equal(shapeSizes[kind].length, 2);
    const item = createItem(kind, 0, 0),
      e = shapeEdge(kind, item, { x: 5000, y: item.h / 2 });
    assert.ok(e.x > item.w / 2 - 0.01, `${kind} attaches toward the right`);
    const t = textBox(kind, item.w, item.h);
    assert.ok(shapeContains(kind, item.w, item.h, { x: t.x + t.w / 2, y: t.y + t.h / 2 }), kind);
  }
  roundTrip(board(...packKinds.map((k, n) => ({ ...createItem(k, n * 300, 0), text: shapeLabels[k] }))));
});
test('pack shapes join Grids and get contrast checks like basic shapes', () => {
  const grid = { ...createItem('grid', 0, 0), id: 'g' },
    doc = { ...createItem('document', 500, 500), id: 'doc' };
  const adopted = adoptGridObjects(board(grid, doc), ['doc'], { id: 'g', r: 0, c: 0 });
  assert.ok(
    (adopted.items.find(i => i.id === 'g')!.data as { objects?: { id: string }[] }).objects?.some(o => o.id === 'doc'),
  );
  // Mid grey fails with both dark and white text; a dark fill is drawn with white text and passes.
  const grey = { ...createItem('callout', 0, 0), text: 'Low contrast', fill: '#7a7a7a' };
  assert.ok(checkAccessibility(board(grey)).some(i => i.kind === 'contrast'));
  const dark = { ...createItem('callout', 0, 0), text: 'White text', fill: '#333333' };
  assert.ok(!checkAccessibility(board(dark)).some(i => i.kind === 'contrast'));
});

// Item 78 — Slides decks
test('slide decks add, template, duplicate, reorder, change layout and delete slides', () => {
  const item = createItem('slides', 0, 0);
  let d = deckOf(item);
  assert.equal(d.slides.length, 2);
  d = insertSlide(d, newSlide('blank'));
  assert.deepEqual([d.current, d.slides[1].layout], [1, 'blank']);
  for (const t of slideTemplates) d = insertSlide(d, t.make());
  assert.equal(d.slides.length, 3 + slideTemplates.length);
  const dupFrom = d.slides[d.current];
  d = duplicateSlide(d);
  assert.notEqual(d.slides[d.current].id, dupFrom.id);
  assert.equal(d.slides[d.current].title, dupFrom.title);
  const moving = d.slides[0].id;
  d = moveSlide(d, 0, 1);
  assert.deepEqual([d.slides[1].id, d.current], [moving, 1]);
  assert.equal(moveSlide(d, 0, -1), d, 'cannot move before the first slide');
  d = setSlideLayout(d, d.slides[0].id, 'activity');
  assert.ok(d.slides[0].options!.length >= 2);
  d = setSlideLayout(d, d.slides[0].id, 'two');
  assert.equal(d.slides[0].body2, '');
  const count = d.slides.length;
  d = deleteSlide({ ...d, current: count - 1 });
  assert.deepEqual([d.slides.length, d.current], [count - 1, count - 2]);
  let one: DeckData = { slides: [newSlide()], current: 0 };
  assert.equal(deleteSlide(one), one, 'the last slide stays');
  one = { slides: Array.from({ length: DECK_MAX }, () => newSlide()), current: 0 };
  assert.equal(insertSlide(one, newSlide()), one, 'deck size is limited');
  roundTrip(board({ ...item, data: d }));
});
test('activity slides count votes locally; invalid decks are rejected on load', () => {
  const s = newSlide('activity');
  let d: DeckData = { slides: [s], current: 0 };
  d = voteOption(voteOption(d, s.id, s.options![1].id), s.id, s.options![1].id);
  assert.equal(d.slides[0].options![1].votes, 2);
  assert.equal(voteOption(d, s.id, s.options![0].id, -1).slides[0].options![0].votes, 0, 'votes never go negative');
  assert.ok(resetVotes(d, s.id).slides[0].options!.every(o => o.votes === 0));
  const item = { ...createItem('slides', 0, 0), data: d };
  assert.match(widgetSearchText(item), /focus on next/);
  for (const data of [
    { slides: [], current: 0 },
    { slides: [s], current: 1 },
    { slides: [s, s], current: 0 },
    { slides: [{ ...s, layout: 'hero' }], current: 0 },
    { slides: [{ ...s, background: 'red' }], current: 0 },
    { slides: [{ ...s, options: [{ id: 'a', label: 'A', votes: -1 }] }], current: 0 },
  ])
    assert.throws(() => parseBoard(board({ ...item, data })), JSON.stringify(data).slice(0, 80));
});

// Item 84 — PowerPoint import
const sp = (type: string | null, ...paras: string[]) =>
  `<p:sp><p:nvSpPr><p:nvPr>${type ? `<p:ph type="${type}"/>` : '<p:ph idx="1"/>'}</p:nvPr></p:nvSpPr><p:txBody>${paras
    .map(t => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`)
    .join('')}</p:txBody></p:sp>`;
const slideXml = (...shapes: string[]) =>
  `<?xml version="1.0"?><p:sld><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`;
function pptx(slides: string[], order: number[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'ppt/presentation.xml': strToU8(
      `<p:presentation><p:sldIdLst>${order.map(n => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`).join('')}</p:sldIdLst></p:presentation>`,
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<Relationships>${slides
        .map(
          (_, k) =>
            `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${k + 1}.xml"/>`,
        )
        .join('')}<Relationship Id="rId99" Type="http://x/theme" Target="theme/theme1.xml"/></Relationships>`,
    ),
    'ppt/media/image1.png': new Uint8Array(10),
  };
  slides.forEach((xml, k) => (files[`ppt/slides/slide${k + 1}.xml`] = strToU8(xml)));
  return zipSync(files);
}
test('PowerPoint files become slides in presentation order with titles and text', () => {
  const bytes = pptx(
    [
      slideXml(sp('ctrTitle', 'Quarterly review'), sp('subTitle', 'Team &amp; partners')),
      slideXml(sp('title', 'Results'), sp(null, 'Revenue up', 'Costs down')),
      slideXml(),
    ],
    [2, 1, 3],
  );
  const slides = parsePptx(bytes);
  assert.deepEqual(
    slides.map(s => [s.layout, s.title, s.body]),
    [
      ['content', 'Results', 'Revenue up\nCosts down'],
      ['title', 'Quarterly review', 'Team & partners'],
      ['blank', '', ''],
    ],
  );
  const item = { ...createItem('slides', 0, 0), data: { slides, current: 0 } };
  roundTrip(board(item));
  assert.deepEqual(slideOrder('<p:sldId r:id="rX"/>', ''), []);
  assert.equal(slideFromXml(slideXml(sp('title', 'A &lt;b&gt; &#9731;'))).title, 'A <b> ☃');
  assert.throws(() => parsePptx(strToU8('not a zip')), /PowerPoint/);
  assert.throws(() => parsePptx(zipSync({ 'word/document.xml': strToU8('<w/>') })), /PowerPoint/);
});

// Item 79 — Doc callouts, slash menu, templates, Markdown import/export
test('callouts render as labelled blocks and the editor inserts them', () => {
  const html = renderMarkdown('> [!WARNING]\n> Mind the gap\n\n> Plain quote');
  assert.match(html, /class="doc-callout doc-callout-warning" role="note" aria-label="Warning"/);
  assert.match(html, /<p>Mind the gap<\/p>/);
  assert.doesNotMatch(html, /\[!WARNING\]/);
  assert.match(html, /<blockquote>/, 'ordinary quotes are unchanged');
  assert.deepEqual(calloutOf('[!tip]\nRest'), { kind: 'tip', rest: 'Rest' });
  assert.equal(calloutOf('Nothing'), null);
  assert.equal(calloutMarkdown('note', 'A\nB'), '> [!NOTE]\n> A\n> B\n');
  const r = applyDocFormat('Intro\nKey point', 6, 15, 'callout');
  assert.equal(r.text, 'Intro\n> [!NOTE]\n> Key point\n');
  assert.equal(r.text.slice(r.start, r.end), 'Key point');
  assert.match(renderMarkdown(r.text), /doc-callout-note/);
});
test('slash commands filter by name; templates are valid Markdown documents', () => {
  assert.ok(filterSlash('').length >= 12);
  assert.deepEqual(
    filterSlash('head').map(c => c.id),
    ['h1', 'h2', 'h3'],
  );
  assert.ok(filterSlash('warn').some(c => c.callout === 'warning'));
  assert.deepEqual(filterSlash('zzz'), []);
  assert.equal(docTemplates.length, 4);
  for (const t of docTemplates) {
    assert.match(t.markdown, /^# /);
    assert.ok(t.markdown.length < DOC_MAX);
    const doc = { ...createItem('doc', 0, 0), data: { markdown: t.markdown } };
    roundTrip(board(doc));
  }
});
test('Markdown files import as Docs and Docs export with safe names', () => {
  const d = docFromMarkdown('﻿# Launch *plan*\r\n\r\n- one\r\n', 'notes.md');
  assert.deepEqual(d, { markdown: '# Launch *plan*\n\n- one\n', title: 'Launch plan', truncated: false });
  assert.equal(docTitle('no heading', 'Project notes.markdown'), 'Project notes');
  assert.equal(docTitle('', ''), 'Untitled doc');
  const long = docFromMarkdown('x'.repeat(DOC_MAX + 5));
  assert.deepEqual([long.markdown.length, long.truncated], [DOC_MAX, true]);
  assert.throws(() => docFromMarkdown('bin\u0000ary'), /Markdown/);
  assert.equal(markdownFileName('Q3: plan / draft?'), 'Q3 plan draft.md');
  assert.equal(markdownFileName('   '), 'doc.md');
  assert.equal(exportMarkdown('# A'), '# A\n');
});

// Item 82 — open-ended activity
test('open-ended responses are trimmed, bounded and convert to sticky notes in one change', () => {
  const item = { ...createItem('openended', 100, 100), id: 'oe' };
  let d = item.data as OpenEndedData;
  assert.equal(addResponse(d, '   '), null);
  d = addResponse(d, '  More pairing  ')!;
  d = addResponse(d, 'Shorter meetings')!;
  assert.deepEqual(
    d.responses.map(r => r.text),
    ['More pairing', 'Shorter meetings'],
  );
  const full: OpenEndedData = {
    prompt: '',
    responses: Array.from({ length: OPEN_MAX }, (_, k) => ({ id: `r${k}`, text: 'x' })),
  };
  assert.equal(addResponse(full, 'one more'), null);
  const b = board({ ...item, data: d }),
    out = responsesToNotes(b, 'oe', (t, x, y) => createItem(t, x, y));
  assert.equal(out.ids.length, 2);
  const notes = out.board.items.filter(i => out.ids.includes(i.id));
  assert.deepEqual(
    notes.map(n => [n.type, n.text]),
    [
      ['note', 'More pairing'],
      ['note', 'Shorter meetings'],
    ],
  );
  assert.ok(notes.every(n => n.x >= item.x + item.w));
  roundTrip(out.board);
  for (const data of [
    { prompt: 1, responses: [] },
    { prompt: '', responses: [{ id: 'a', text: '  ' }] },
  ])
    assert.throws(() => parseBoard(board({ ...item, data })));
});

// Item 85 — sticky note authors
test('authors are recorded on new sticky notes only and validated on load', () => {
  assert.equal(cleanAuthor('  Sam\u0007  <Lee>  '), 'Sam Lee');
  assert.equal(initials('sam lee jones'), 'SL');
  const old = { ...createItem('note', 0, 0), id: 'old' },
    prev = board(old),
    fresh = { ...createItem('note', 300, 0), id: 'new' },
    shape = { ...createItem('rectangle', 600, 0), id: 'shape' },
    pasted = { ...createItem('note', 900, 0), id: 'pasted', author: 'Alex' };
  const next = stampAuthors(prev, board(old, fresh, shape, pasted), ' Sam ');
  assert.deepEqual(
    next.items.map(i => i.author),
    [undefined, 'Sam', undefined, 'Alex'],
  );
  const same = board(old, fresh);
  assert.equal(stampAuthors(prev, same, ''), same, 'no name, no change');
  roundTrip({ ...next, showAuthors: true });
  assert.throws(() => parseBoard(board({ ...fresh, author: '' })));
  assert.throws(() => parseBoard(board({ ...fresh, author: '<b>x' })));
  assert.throws(() => parseBoard({ ...board(), showAuthors: 'yes' } as unknown));
});
