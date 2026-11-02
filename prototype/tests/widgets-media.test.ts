import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Item, Board } from '../src/model.ts';
import {
  normalizeHttpsUrl,
  embedSource,
  isVideoProvider,
  wireframeComponents,
  wireframeItem,
  screenContents,
  screenOf,
  linkTarget,
  applyScreenFormat,
  mediaSpecs,
} from '../src/specs-media.ts';
import {
  renderMarkdown,
  docOutline,
  looksLikeMarkdown,
  markdownToItems,
  markdownSummary,
  plain,
} from '../src/markdown.ts';

const board = (...items: Item[]): Board => ({ ...newBoard(), items });
const roundTrip = (b: Board) => assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(b))), b);
const png = 'data:image/jpeg;base64,/9j/4AAQ';

// Item 32 — links and embed allow-list (item 30 video links)
test('bookmark links are normalised to https and unsafe links are rejected', () => {
  assert.equal(normalizeHttpsUrl('example.com/a?b=1'), 'https://example.com/a?b=1');
  for (const bad of [
    '',
    'http://example.com',
    'javascript:alert(1)',
    'https://user:pw@example.com',
    'ftp://x.com',
    'https://localhost',
    'x'.repeat(3000),
  ])
    assert.throws(() => normalizeHttpsUrl(bad));
});
test('embeds accept only the allow-listed providers and map them to embeddable addresses', () => {
  assert.deepEqual(embedSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5'), {
    provider: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5',
    src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  });
  assert.equal(embedSource('https://youtu.be/dQw4w9WgXcQ').src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(embedSource('vimeo.com/76979871').src, 'https://player.vimeo.com/video/76979871');
  assert.equal(embedSource('https://www.google.com/maps/embed?pb=!1m18').provider, 'maps');
  assert.match(
    embedSource('https://www.figma.com/design/abc123/Board').src,
    /^https:\/\/www\.figma\.com\/embed\?embed_host=share&url=https%3A%2F%2F/,
  );
  assert.equal(
    embedSource('https://codepen.io/team/pen/abcXYZ').src,
    'https://codepen.io/team/embed/abcXYZ?default-tab=result',
  );
  assert.ok(isVideoProvider('youtube') && isVideoProvider('vimeo') && !isVideoProvider('maps'));
  for (const bad of [
    'https://evil.example/watch?v=dQw4w9WgXcQ',
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.google.com/maps/place/x',
    'https://youtube.com.evil.io/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/channel/abc',
  ])
    assert.throws(() => embedSource(bad), bad);
});

// Items 33–34 — docs and Markdown
test('markdown rendering escapes HTML, neutralises unsafe links and never loads images', () => {
  const html = renderMarkdown(
    '# Hi\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)> text [bad](javascript:alert(1)) [ok](https://a.com)\n\n![p](https://tracker.example/p.png)\n\n- [ ] todo\n- [x] done',
  );
  assert.ok(!/<script/i.test(html));
  assert.ok(!/<img/i.test(html));
  assert.ok(!/javascript:/i.test(html.replace(/&lt;[^&]*&gt;/g, '')));
  assert.ok(!/href="javascript/i.test(html));
  assert.match(html, /<a href="https:\/\/a\.com" target="_blank" rel="noopener noreferrer nofollow">ok<\/a>/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /<h1 id="doc-h-0">Hi<\/h1>/);
  assert.match(html, /doc-image-alt/);
});
test('outline lists headings in order with ids matching the rendered anchors', () => {
  const md = '# A\n\ntext\n\n## B **bold**\n\n```\n# not a heading\n```\n\nSetext\n======\n\n> ### Quoted';
  const outline = docOutline(md);
  assert.deepEqual(
    outline.map(h => [h.level, h.text, h.index]),
    [
      [1, 'A', 0],
      [2, 'B bold', 1],
      [1, 'Setext', 2],
      [3, 'Quoted', 3],
    ],
  );
  const html = renderMarkdown(md);
  for (const h of outline) assert.ok(html.includes(`id="doc-h-${h.index}"`));
  const big = '# H\n' + 'para '.repeat(4000);
  const t = performance.now();
  renderMarkdown(big);
  docOutline(big);
  assert.ok(performance.now() - t < 500);
});
test('markdown paste detection and conversion to text, notes and a doc', () => {
  assert.equal(looksLikeMarkdown('Just a sentence.'), false);
  assert.equal(looksLikeMarkdown('one line\nsecond line'), false);
  assert.equal(looksLikeMarkdown('# Title'), true);
  assert.equal(looksLikeMarkdown('- a\n- b'), true);
  assert.equal(looksLikeMarkdown('Intro\n1. first'), true);
  const md = '# Plan\n\nSome **intro** with <b>html</b>.\n\n- Research\n- Build\n  - nested\n\n## Later\n\n1. Ship';
  const text = markdownToItems(md, 'text', { x: 10, y: 20 });
  assert.deepEqual(
    text.map(i => i.type),
    ['text', 'text', 'text', 'text', 'text'],
  );
  assert.deepEqual(text[0].format, { fontSize: 40, bold: true, align: 'left' });
  assert.equal(text[1].text, 'Some intro with html.');
  assert.equal(text[2].format?.list, 'bullet');
  assert.equal(text[2].text, 'Research\nBuild\nnested');
  assert.equal(text[4].format?.list, 'number');
  assert.ok(text.every((t, i) => i === 0 || t.y >= text[i - 1].y + text[i - 1].h));
  assert.equal(text[0].x, 10);
  const notes = markdownToItems(md, 'notes', { x: 0, y: 0 });
  assert.deepEqual(
    notes.map(n => n.text),
    ['Research', 'Build', 'nested', 'Ship'],
  );
  assert.deepEqual([notes[3].x, notes[3].y], [690, 0]);
  assert.deepEqual(markdownSummary(md), { text: 5, notes: 4 });
  const doc = markdownToItems(md, 'doc', { x: 0, y: 0 });
  assert.equal(doc.length, 1);
  assert.equal(doc[0].type, 'doc');
  assert.equal(doc[0].data?.markdown, md);
  assert.equal(plain('[a](https://x.y) `c` ~~d~~ ![i](u)'), 'a (https://x.y) c d i');
  const many = markdownToItems(Array.from({ length: 150 }, (_, i) => `- item ${i}`).join('\n'), 'notes', {
    x: 0,
    y: 0,
  });
  assert.equal(many.length, 100);
  roundTrip(board(...text, ...notes, ...doc));
});

// Items 37–38 — wireframes and prototype screens
test('wireframe components create valid items and reject unknown or malformed data', () => {
  const items = wireframeComponents.map((c, i) => wireframeItem(c.component, { x: i * 300, y: 0 }, createItem));
  for (const [i, c] of wireframeComponents.entries()) {
    assert.equal(items[i].data?.component, c.component);
    assert.deepEqual([items[i].w, items[i].h], c.size);
  }
  roundTrip(board(...items));
  const button = items.find(i => i.data?.component === 'button')!;
  for (const data of [
    { component: 'carousel' },
    { component: 'button', state: {} },
    { component: 'button', link: '' },
    { component: 'select', options: 'a,b' },
    { component: 'select', options: Array(21).fill('x') },
  ])
    assert.throws(() => parseBoard(board({ ...button, data })), JSON.stringify(data));
  assert.equal(createItem('wireframe', 0, 0).data?.component, 'button');
});
test('screens size from device presets, report their contents and resolve links gracefully', () => {
  const screen = { ...createItem('screen', 0, 0), id: 's1' },
    other = { ...createItem('screen', 1000, 0), id: 's2' };
  assert.deepEqual([screen.w, screen.h, screen.data?.device], [390, 844, 'phone']);
  const inside = wireframeItem('button', { x: 195, y: 400 }, createItem),
    edge = { ...createItem('note', 350, 800), w: 100, h: 100 },
    outside = createItem('note', 600, 0),
    line = { ...createItem('arrow', 10, 10), w: 20, h: 20 };
  const b = board(screen, other, inside, edge, outside, line);
  assert.deepEqual(
    screenContents(b, 's1').map(i => i.id),
    [inside.id],
  );
  assert.equal(screenOf(b, inside.id)?.id, 's1');
  assert.deepEqual(screenContents(b, 'missing'), []);
  assert.equal(linkTarget(b, 's2')?.id, 's2');
  assert.equal(linkTarget(b, inside.id), undefined);
  assert.equal(linkTarget(b, 'deleted'), undefined);
  const tablet = applyScreenFormat(b, 's1', 'tablet', 'landscape', '#f0f0f0').items[0];
  assert.deepEqual([tablet.x, tablet.y, tablet.w, tablet.h, tablet.data?.background], [0, 0, 1180, 820, '#f0f0f0']);
  roundTrip({ ...b, items: [tablet, ...b.items.slice(1)] });
  for (const data of [
    { device: 'watch', orientation: 'portrait', background: '#ffffff' },
    { device: 'phone', orientation: 'up', background: '#ffffff' },
    { device: 'phone', orientation: 'portrait', background: 'blue' },
  ])
    assert.throws(() => parseBoard(board({ ...screen, data })));
});

// Items 30–33 — media kinds validate and round-trip
test('video, pdf, bookmark, embed and doc items round-trip and reject invalid data', () => {
  const video = { ...createItem('video', 0, 0), assetId: 'v1', data: { poster: png, duration: 12.5 } },
    pdf = { ...createItem('pdf', 0, 0), assetId: 'p1', data: { page: 2, pages: 3, thumb: png } };
  const bookmark = {
    ...createItem('bookmark', 0, 0),
    data: { url: 'https://example.com/', title: 'Example', description: 'A site', layout: 'small' },
  };
  const embed = { ...createItem('embed', 0, 0), data: { url: 'https://youtu.be/dQw4w9WgXcQ', provider: 'youtube' } },
    doc = createItem('doc', 0, 0);
  assert.deepEqual(createItem('bookmark', 0, 0).data, { url: '', title: '', description: '', layout: 'big' });
  assert.deepEqual(createItem('embed', 0, 0).data, { url: '', provider: '' });
  assert.match(doc.data?.markdown, /^# Untitled doc/);
  roundTrip(board(video, pdf, bookmark, embed, doc, createItem('bookmark', 0, 0), createItem('embed', 0, 0)));
  const bad: [Item, any][] = [
    [video, { ...video, assetId: undefined }],
    [video, { ...video, data: { poster: 'data:text/html;base64,PHNjcmlwdD4=' } }],
    [pdf, { ...pdf, data: { page: 4, pages: 3 } }],
    [pdf, { ...pdf, data: { page: 0, pages: 3 } }],
    [pdf, { ...pdf, assetId: '' }],
    [bookmark, { ...bookmark, data: { ...bookmark.data, url: 'http://example.com/' } }],
    [bookmark, { ...bookmark, data: { ...bookmark.data, layout: 'huge' } }],
    [bookmark, { ...bookmark, data: { ...bookmark.data, url: 'example.com' } }],
    [embed, { ...embed, data: { url: 'https://evil.example/x', provider: 'youtube' } }],
    [embed, { ...embed, data: { url: 'https://youtu.be/dQw4w9WgXcQ', provider: 'vimeo' } }],
    [embed, { ...embed, data: { url: '', provider: 'youtube' } }],
    [doc, { ...doc, data: { markdown: 'x'.repeat(60001) } }],
    [doc, { ...doc, data: null }],
  ];
  for (const [, item] of bad) assert.throws(() => parseBoard(board(item)), JSON.stringify(item.data)?.slice(0, 60));
  assert.deepEqual(
    mediaSpecs.map(s => s.kind),
    ['video', 'pdf', 'bookmark', 'embed', 'doc', 'wireframe', 'screen'],
  );
  assert.equal(mediaSpecs.find(s => s.kind === 'wireframe')?.hiddenInGallery, true);
});
