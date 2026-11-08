// Per-word rich text (spans over plain text) and the Doc Markdown extensions for highlight, colour and mentions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clone, createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import {
  activeSpans,
  applyStyle,
  cleanMentionName,
  fromRuns,
  hasStyle,
  lineRuns,
  linkAt,
  normalizeHref,
  normalizeSpans,
  replaceRange,
  runCss,
  runsOf,
  styleIn,
  textHash,
  toggleStyle,
  validateSpans,
  withRichText,
} from '../src/rich-text.ts';
import type { TextSpan } from '../src/rich-text.ts';
import { mentionMarkdown, plain, renderMarkdown } from '../src/markdown.ts';
import { copySelection, pastePayload } from '../src/clipboard.ts';

const text = 'Hello brave world';
const boardWith = (item: Item): Board => ({ ...newBoard(), items: [item] });

test('textHash is a stable 8-digit FNV-1a hex digest', () => {
  assert.equal(textHash(''), '811c9dc5');
  assert.equal(textHash('a'), 'e40c292c');
  assert.match(textHash(text), /^[0-9a-f]{8}$/);
  assert.notEqual(textHash(text), textHash(text + ' '));
});

test('toggleStyle adds, merges and removes styles over a range', () => {
  let spans = toggleStyle(text, [], 6, 11, 'bold');
  assert.deepEqual(spans, [{ start: 6, end: 11, bold: true }]);
  spans = toggleStyle(text, spans, 11, 17, 'bold');
  assert.deepEqual(spans, [{ start: 6, end: 17, bold: true }], 'adjacent equal spans merge');
  assert.ok(hasStyle(spans, 6, 17, 'bold'));
  assert.ok(!hasStyle(spans, 0, 17, 'bold'));
  // Partly bold: the toggle makes all of it bold first.
  spans = toggleStyle(text, spans, 0, 11, 'bold');
  assert.deepEqual(spans, [{ start: 0, end: 17, bold: true }]);
  spans = toggleStyle(text, spans, 6, 11, 'bold');
  assert.deepEqual(spans, [
    { start: 0, end: 6, bold: true },
    { start: 11, end: 17, bold: true },
  ]);
  spans = applyStyle(text, spans, 0, 17, { italic: true, color: '#D92D20' });
  assert.deepEqual(spans[1], { start: 6, end: 11, italic: true, color: '#d92d20' });
  spans = applyStyle(text, spans, 0, 17, { color: undefined, italic: undefined, bold: undefined });
  assert.deepEqual(spans, []);
});

test('styleIn and linkAt report the formatting of a selection', () => {
  const spans = applyStyle(text, toggleStyle(text, [], 0, 5, 'bold'), 0, 5, { href: 'https://example.com/' });
  assert.deepEqual(styleIn(spans, 0, 5), { bold: true, href: 'https://example.com/' });
  assert.deepEqual(styleIn(spans, 0, 8), { href: 'https://example.com/' });
  assert.equal(linkAt(spans, 2, 2)?.href, 'https://example.com/');
  assert.equal(linkAt(spans, 8, 8), null);
});

test('mentions stay whole: styling snaps to the chip and edits inside drop it', () => {
  const t = 'Hi @Ada Lovelace!';
  const spans: TextSpan[] = [{ start: 3, end: 16, mention: 'Ada Lovelace' }];
  assert.deepEqual(applyStyle(t, spans, 5, 8, { bold: true }), [
    { start: 3, end: 16, mention: 'Ada Lovelace', bold: true },
  ]);
  const edited = replaceRange(t, spans, 6, 7, 'X');
  assert.deepEqual(edited.spans, []);
  // Two chips next to each other are not merged.
  const two = normalizeSpans(
    [
      { start: 0, end: 4, mention: 'Ann' },
      { start: 4, end: 8, mention: 'Ann' },
    ],
    8,
  );
  assert.equal(two.length, 2);
});

test('replaceRange shifts, splits and styles inserted text', () => {
  const spans: TextSpan[] = [{ start: 6, end: 11, bold: true }];
  assert.deepEqual(replaceRange(text, spans, 0, 0, '>> ').spans, [{ start: 9, end: 14, bold: true }]);
  const mid = replaceRange(text, spans, 8, 9, '\n');
  assert.equal(mid.text, 'Hello br\nve world');
  assert.deepEqual(mid.spans, [
    { start: 6, end: 8, bold: true },
    { start: 9, end: 11, bold: true },
  ]);
  const linked = replaceRange(text, [], 17, 17, ' docs', { href: 'https://example.com/' });
  assert.deepEqual(linked.spans, [{ start: 17, end: 22, href: 'https://example.com/' }]);
});

test('runs split text for rendering and join back to text and spans', () => {
  const spans: TextSpan[] = [
    { start: 0, end: 5, href: 'https://example.com/' },
    { start: 12, end: 17, bold: true },
  ];
  const runs = runsOf(text, spans);
  assert.deepEqual(
    runs.map(r => r.text),
    ['Hello', ' brave ', 'world'],
  );
  assert.deepEqual(fromRuns(runs), { text, spans });
  assert.deepEqual(runsOf('', []), [{ text: '', style: {} }]);
  const lines = lineRuns('one\ntwo', [{ start: 2, end: 5, italic: true }]);
  assert.deepEqual(lines, [
    [
      { text: 'on', style: {} },
      { text: 'e', style: { italic: true } },
    ],
    [
      { text: 't', style: { italic: true } },
      { text: 'wo', style: {} },
    ],
  ]);
  assert.deepEqual(runCss({ bold: true, strike: true, href: 'https://x.org/', highlight: '#fff27a' }), {
    fontWeight: '700',
    textDecoration: 'underline line-through',
    backgroundColor: '#fff27a',
  });
});

test('spans are ignored when they were made for different text', () => {
  const base = { ...createItem('text', 0, 0), text };
  const styled = withRichText(base, text, [{ start: 0, end: 5, bold: true }]);
  assert.equal(styled.spansFor, textHash(text));
  assert.deepEqual(activeSpans(styled), [{ start: 0, end: 5, bold: true }]);
  // Find and replace, switch type and other text changes keep the old spans but they no longer apply.
  const replaced = { ...styled, text: 'Howdy brave world' };
  assert.deepEqual(activeSpans(replaced), []);
  // Saving without styles removes both fields.
  const cleared = withRichText(styled, 'plain', []);
  assert.ok(!('spans' in cleared) && !('spansFor' in cleared));
});

test('normalizeHref accepts web and e-mail addresses only', () => {
  assert.equal(normalizeHref('example.com/docs'), 'https://example.com/docs');
  assert.equal(normalizeHref('http://example.com'), 'http://example.com/');
  assert.equal(normalizeHref('ada@example.com'), 'mailto:ada@example.com');
  assert.equal(normalizeHref('mailto:ada@example.com'), 'mailto:ada@example.com');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a link', 'intranet', 'https://u:p@x.org', ''])
    assert.equal(normalizeHref(bad), null, bad);
  assert.equal(cleanMentionName('  Ada [the] \n Lovelace '), 'Ada the Lovelace');
});

test('parseBoard accepts valid spans, rejects malformed ones, and old boards load unchanged', () => {
  const item = withRichText({ ...createItem('note', 0, 0), id: 'n', text }, text, [
    { start: 0, end: 5, href: 'https://example.com/' },
    { start: 6, end: 11, bold: true, color: '#112233', highlight: '#fff27a' },
    { start: 12, end: 17, mention: 'Ada' },
  ]);
  assert.deepEqual(parseBoard(boardWith(item)).items[0].spans, item.spans);
  // Stale spans (text changed elsewhere) still load: they are simply not used.
  const stale = { ...item, text: 'short' };
  assert.equal(parseBoard(boardWith(stale)).items[0].text, 'short');
  const old = { ...createItem('note', 0, 0), id: 'o', text };
  assert.ok(!('spans' in parseBoard(boardWith(old)).items[0]));
  const bad: [string, Partial<Item>][] = [
    ['spans without hash', { spans: [{ start: 0, end: 1, bold: true }], spansFor: undefined }],
    ['bad hash', { spansFor: 'xyz' }],
    [
      'overlap',
      {
        spans: [
          { start: 0, end: 5, bold: true },
          { start: 3, end: 6, italic: true },
        ],
      },
    ],
    ['empty range', { spans: [{ start: 2, end: 2, bold: true }] }],
    ['fraction', { spans: [{ start: 0.5, end: 2, bold: true }] }],
    ['negative', { spans: [{ start: -1, end: 2, bold: true }] }],
    ['named colour', { spans: [{ start: 0, end: 2, color: 'red' }] }],
    ['css injection', { spans: [{ start: 0, end: 2, highlight: '#fff;background:url(x)' }] }],
    ['script link', { spans: [{ start: 0, end: 2, href: 'javascript:alert(1)' }] }],
    ['long mention', { spans: [{ start: 0, end: 2, mention: 'x'.repeat(81) }] }],
    ['unknown key', { spans: [{ start: 0, end: 2, bold: true, style: 'x' } as TextSpan] }],
    ['flag type', { spans: [{ start: 0, end: 2, bold: 'yes' } as unknown as TextSpan] }],
    ['too many', { spans: Array.from({ length: 1001 }, (_, k) => ({ start: k, end: k + 1, bold: true })) }],
  ];
  for (const [label, change] of bad)
    assert.throws(() => parseBoard(boardWith({ ...item, ...change })), /Invalid text styling/, label);
  assert.doesNotThrow(() => validateSpans({}));
});

test('copy and paste carry spans with the object', () => {
  const item = withRichText({ ...createItem('text', 10, 10), id: 't', text }, text, [{ start: 0, end: 5, bold: true }]);
  const board = boardWith(item),
    payload = copySelection(board, ['t'], {})!;
  const pasted = pastePayload(board, clone(payload), { x: 100, y: 100 });
  const copy = pasted.board.items.find(i => i.id === pasted.ids[0])!;
  assert.deepEqual(copy.spans, item.spans);
  assert.equal(copy.spansFor, item.spansFor);
  assert.deepEqual(activeSpans(copy), [{ start: 0, end: 5, bold: true }]);
});

test('Doc Markdown: highlight, colour and mention render safely and strip to plain text', () => {
  assert.equal(renderMarkdown('a ==hi there== b').trim(), '<p>a <mark>hi there</mark> b</p>');
  assert.equal(
    renderMarkdown('x {color:#FF0000}red **b**{/color} y').trim(),
    '<p>x <span class="doc-color" style="color:#ff0000">red <strong>b</strong></span> y</p>',
  );
  // Only six-digit hex colours: anything else stays literal text.
  assert.equal(renderMarkdown('{color:red}no{/color}').trim(), '<p>{color:red}no{/color}</p>');
  assert.ok(!renderMarkdown('{color:#ff0000;background:url(x)}no{/color}').includes('style='));
  assert.equal(
    renderMarkdown('hey @[Ada Lovelace]!').trim(),
    '<p>hey <span class="doc-mention" contenteditable="false" data-mention="Ada Lovelace">@Ada Lovelace</span>!</p>',
  );
  const evil = renderMarkdown('@[<img src=x onerror=alert(1)>]');
  assert.ok(!evil.includes('<img'), evil);
  assert.ok(evil.includes('&lt;img'), evil);
  assert.ok(!renderMarkdown('<script>x</script> ==<b>y</b>==').includes('<script>'));
  // Escaped markers stay literal.
  assert.equal(
    renderMarkdown('\\=\\=no\\=\\= \\{color:#ff0000}z{/color}').trim(),
    '<p>==no== {color:#ff0000}z{/color}</p>',
  );
  assert.equal(
    plain('Some ==marked== {color:#1c64f2}blue{/color} with @[Ada Lovelace] ++u++'),
    'Some marked blue with @Ada Lovelace u',
  );
  assert.equal(mentionMarkdown(' Ada [x]\nLee '), '@[Ada x Lee]');
});

test('turning the object Bold off clears per-word bold and keeps other word styles and links (R6a-Q3)', async () => {
  const { withoutWordBold, withRichText: rich, activeSpans: active } = await import('../src/rich-text.ts');
  const base = { ...createItem('text', 0, 0), text: 'one two three' };
  const styled = rich(base, base.text, [
    { start: 0, end: 3, bold: true, italic: true },
    { start: 4, end: 7, bold: true, href: 'https://example.com/' },
  ]);
  assert.deepEqual(active(withoutWordBold(styled)), [
    { start: 0, end: 3, italic: true },
    { start: 4, end: 7, href: 'https://example.com/' },
  ]);
  // Nothing to clear: the same object comes back; spans that were only bold disappear entirely.
  assert.equal(withoutWordBold(base), base);
  assert.equal(withoutWordBold(rich(base, base.text, [{ start: 0, end: 3, bold: true }])).spans, undefined);
});
