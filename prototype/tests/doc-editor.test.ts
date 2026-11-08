// Richer Doc editor (R4-Q4): date chips, comments anchored to Doc text and board objects dropped into a Doc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import { plain, renderMarkdown } from '../src/markdown.ts';
import { docBlocks } from '../src/doc-pdf.ts';
import { widgetSearchText as searchText } from '../src/widget-specs.ts';
import {
  canDropIntoDoc,
  dropIntoDoc,
  commentIds,
  dateMarkdown,
  detachedThreads,
  docBlockCount,
  droppableLabel,
  escapeMarkdownText,
  insertDocBlock,
  isIsoDate,
  isObjectLinkHref,
  newDocThread,
  objectBlockMarkdown,
  objectLinkHref,
  readableDate,
  replyDocThread,
  resolveDocThread,
  todayIso,
  unwrapComment,
  validateDocThreads,
} from '../src/doc-rich.ts';

test('date chips: only real ISO dates, readable everywhere', () => {
  assert.ok(isIsoDate('2026-11-08'));
  assert.ok(isIsoDate('2024-02-29'));
  for (const bad of ['2025-02-29', '2026-13-01', '2026-00-10', '2026-1-8', '0999-01-01', '2026-11-08x', 20261108])
    assert.equal(isIsoDate(bad), false, String(bad));
  assert.equal(readableDate('2026-11-08'), '8 Nov 2026');
  assert.equal(dateMarkdown('2026-11-08'), '@date[2026-11-08]');
  assert.equal(dateMarkdown('2026-02-30'), '');
  assert.equal(todayIso(new Date(2026, 0, 5)), '2026-01-05');

  const html = renderMarkdown('Due @date[2026-11-08] and @date[2026-02-30].');
  assert.match(html, /<span class="doc-date" contenteditable="false" data-date="2026-11-08">8 Nov 2026<\/span>/);
  // An invalid date stays literal text, never a chip.
  assert.match(html, /@date\[2026-02-30\]/);
  assert.equal((html.match(/doc-date/g) ?? []).length, 1);
  assert.equal(plain('Due @date[2026-11-08]'), 'Due 8 Nov 2026');
  assert.deepEqual(docBlocks('Due @date[2026-11-08]'), [{ kind: 'paragraph', text: 'Due 8 Nov 2026' }]);
});

test('date chips and comment markers never inject markup', () => {
  const html = renderMarkdown('{comment:a"><b>x}hi{/comment} @date[<i>] {comment:ok}<img src=x onerror=1>{/comment}');
  assert.ok(!html.includes('<b>'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<i>'));
  assert.match(html, /<span class="doc-comment" data-comment="ok">&lt;img/);
});

test('comment markers: rendered, stripped from plain text, search and PDF', () => {
  const md = 'Intro {comment:c1}**bold** words{/comment} end';
  assert.match(renderMarkdown(md), /<span class="doc-comment" data-comment="c1"><strong>bold<\/strong> words<\/span>/);
  assert.equal(plain(md), 'Intro bold words end');
  assert.deepEqual(commentIds(md + ' {comment:c2}x{/comment}'), ['c1', 'c2']);
  assert.equal(unwrapComment(md, 'c1'), 'Intro **bold** words end');
  assert.equal(unwrapComment(md, 'other'), md);
  assert.deepEqual(docBlocks(md), [{ kind: 'paragraph', text: 'Intro bold words end' }]);

  const doc = { ...createItem('doc', 0, 0), data: { markdown: md + ' on @date[2026-11-08]', comments: [] } };
  const found = searchText(doc);
  assert.match(found, /8 Nov 2026/);
  assert.ok(!found.includes('{comment'));
});

test('comment threads: create, reply, resolve, detach and validate', () => {
  const t = newDocThread('  some   text ', ' First ', { id: 't1', messageId: 'm1', at: '2026-11-08T10:00:00.000Z' });
  assert.deepEqual(t, {
    id: 't1',
    quote: 'some text',
    messages: [{ id: 'm1', text: 'First', at: '2026-11-08T10:00:00.000Z' }],
  });
  assert.throws(() => newDocThread('x', '  ', { id: 't2', messageId: 'm' }), /Write a comment first/);
  assert.throws(() => newDocThread('x', 'a'.repeat(2001), { id: 't2', messageId: 'm' }), /2,000/);
  let threads = replyDocThread([t], 't1', 'Reply', { messageId: 'm2', author: 'Ada' });
  assert.equal(threads[0].messages[1].author, 'Ada');
  threads = resolveDocThread(threads, 't1', true);
  assert.equal(threads[0].resolved, true);
  assert.equal('resolved' in resolveDocThread(threads, 't1', false)[0], false);
  assert.deepEqual(
    detachedThreads('{comment:t1}x{/comment}', threads).map(x => x.id),
    [],
  );
  assert.deepEqual(
    detachedThreads('text removed', threads).map(x => x.id),
    ['t1'],
  );

  validateDocThreads(undefined);
  validateDocThreads(threads);
  const bad: unknown[] = [
    'x',
    [{ ...t, id: 'bad id' }],
    [t, t],
    [{ ...t, messages: [] }],
    [{ ...t, messages: [{ id: 'm', text: '', at: '2026-11-08T10:00:00Z' }] }],
    [{ ...t, messages: [{ id: 'm', text: 'x', at: 'yesterday' }] }],
    [{ ...t, resolved: 'yes' }],
    [{ ...t, quote: 'q'.repeat(201) }],
    Array.from({ length: 301 }, (_, k) => ({ ...t, id: `t${k}` })),
  ];
  for (const value of bad) assert.throws(() => validateDocThreads(value), /Invalid doc comments/);

  // The Doc spec validates them on load.
  const doc = { ...createItem('doc', 0, 0), data: { markdown: '{comment:t1}x{/comment}', comments: threads } };
  const board = parseBoard({ ...newBoard(), items: [doc] });
  assert.deepEqual(board.items[0].data!.comments, threads);
  assert.throws(() => parseBoard({ ...newBoard(), items: [{ ...doc, data: { ...doc.data, comments: [{ id: 1 }] } }] }));
});

test('object links and dropped blocks', () => {
  assert.equal(objectLinkHref('n1', 'b1'), '#board=b1&object=n1');
  assert.equal(objectLinkHref('n1'), '#object=n1');
  assert.ok(isObjectLinkHref('#board=b1&object=n1'));
  for (const bad of ['#board=b1', '#object=a b', 'javascript:x', '#board=b1&object=n1&x=1', '#object="><b>'])
    assert.equal(isObjectLinkHref(bad), false, bad);
  assert.match(
    renderMarkdown('[sticky note](#board=b1&object=n1)'),
    /<a href="#board=b1&amp;object=n1" class="doc-object-link"[^>]*>sticky note<\/a>/,
  );
  assert.ok(!renderMarkdown('[x](#evil)').includes('<a'));

  const isShape = (k: string) => ['rectangle', 'ellipse'].includes(k);
  const note = { ...createItem('note', 0, 0), id: 'n1', text: '# Buy *milk* <b>now</b>\n@[Ada] {comment:x}' };
  assert.equal(droppableLabel(note, isShape), 'sticky note');
  assert.equal(droppableLabel({ ...createItem('rectangle', 0, 0) }, isShape), 'shape');
  assert.equal(droppableLabel({ ...createItem('doc', 0, 0) }, isShape), null);
  const block = objectBlockMarkdown(note, 'sticky note', 'b1');
  assert.ok(block.endsWith('([sticky note](#board=b1&object=n1))'));
  const html = renderMarkdown(block);
  assert.ok(!html.includes('<h1') && !html.includes('<em>') && !html.includes('<b>') && !html.includes('doc-mention'));
  assert.match(html, /# Buy \*milk\* &lt;b&gt;now&lt;\/b&gt; @\[Ada\] \{comment:x\}/);
  assert.equal(escapeMarkdownText('1. step'), '1\\. step');
  assert.equal(objectBlockMarkdown({ ...note, text: '' }, 'sticky note', 'b1'), '[sticky note](#board=b1&object=n1)');
  assert.equal(plain(block).endsWith('(sticky note)'), true);
});

test('insertDocBlock places a block before a top-level block', () => {
  const md = '# Title\n\nFirst paragraph.\n\n- a\n- b\n\nLast.';
  assert.equal(docBlockCount(md), 4);
  assert.equal(insertDocBlock(md, 0, 'New'), 'New\n\n' + md);
  assert.equal(insertDocBlock(md, 2, 'New'), '# Title\n\nFirst paragraph.\n\nNew\n\n- a\n- b\n\nLast.');
  assert.equal(insertDocBlock(md, 4, 'New'), md + '\n\nNew');
  assert.equal(insertDocBlock(md, 99, 'New'), md + '\n\nNew');
  assert.equal(insertDocBlock('', 0, 'New'), 'New');
  assert.equal(docBlockCount(insertDocBlock(md, 1, 'New')), 5);
});

test('dropIntoDoc copies object text and links into a Doc as one change', () => {
  const doc = { ...createItem('doc', 0, 0), id: 'd', data: { markdown: '# Plan\n\nEnd.' } };
  const note = { ...createItem('note', 500, 0), id: 'n', text: 'Call Ada' };
  const shape = { ...createItem('rectangle', 800, 0), id: 's', text: 'Box' };
  const frame = { ...createItem('frame', 0, 600), id: 'f' };
  const board = { ...newBoard(), items: [doc, note, shape, frame] };
  const next = dropIntoDoc(board, ['n', 's'], { targetId: 'd', index: 1 }, 'b1');
  assert.equal(
    next.items[0].data!.markdown,
    '# Plan\n\nCall Ada ([sticky note](#board=b1&object=n))\n\nBox ([shape](#board=b1&object=s))\n\nEnd.',
  );
  assert.deepEqual(next.items.slice(1), board.items.slice(1));
  assert.equal(canDropIntoDoc(board, ['f'], { targetId: 'd', index: 0 }), false);
  assert.equal(canDropIntoDoc(board, ['n', 'f'], { targetId: 'd', index: 0 }), false);
  assert.equal(canDropIntoDoc(board, ['d'], { targetId: 'd', index: 0 }), false);
  const locked = { ...board, items: [{ ...doc, locked: true }, note] };
  assert.equal(dropIntoDoc(locked, ['n'], { targetId: 'd', index: 0 }), locked);
  // Past the size limit nothing changes.
  assert.equal(dropIntoDoc(board, ['n'], { targetId: 'd', index: 0 }, 'b1', 20), board);
});
