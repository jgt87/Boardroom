// Per-word rich text: bold, links and @mention chips in canvas text objects, and links, highlight, colour and
// mentions in Docs. Everything is saved, survives a reload and renders on the canvas.
import { test, expect, seed, waitForSave, savedBoard, item, fit } from './helpers';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Select the first occurrence of `text` inside `root`. */
async function selectText(root: Locator, text: string) {
  await root.evaluate((el, t) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = (n.textContent ?? '').indexOf(t);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + t.length);
      const sel = getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    throw new Error(`Text not found: ${t}`);
  }, text);
}
/** Record window.open calls instead of opening tabs. */
async function trapOpen(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = ((url: string) => {
      (window as unknown as { opened: string[] }).opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as { opened: string[] }).opened);

test('canvas text: bold a word, link with Ctrl+K, mention chip, and it all persists', async ({ page }) => {
  await seed(
    page,
    `const t = { ...m.createItem('text', 100, 100), id: 't', w: 520, h: 120, text: 'Hello brave world' };
     const u = { ...m.createItem('usercard', 800, 100), id: 'u' };
     u.data = { ...u.data, name: 'Ada Lovelace' };
     return { version: 1, title: 'Rich', items: [t, u] };`,
  );
  await fit(page);
  await item(page, 't').dblclick();
  const editor = page.getByRole('textbox', { name: 'Edit object text' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Hello brave world');

  // Bold one word with the shortcut; the mini toolbar shows it as pressed.
  await selectText(editor, 'world');
  await page.keyboard.press('Control+B');
  await expect(editor.locator('[data-b]')).toHaveText('world');
  const toolbar = page.getByRole('toolbar', { name: 'Selected text formatting' });
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');

  // Italic from the toolbar, then off again with the shortcut.
  await selectText(editor, 'brave');
  await toolbar.getByRole('button', { name: 'Italic' }).click();
  await expect(editor.locator('[data-i]')).toHaveText('brave');
  await page.keyboard.press('Control+I');
  await expect(editor.locator('[data-i]')).toHaveCount(0);

  // Ctrl+K opens the inline link popover (no browser dialog).
  await selectText(editor, 'Hello');
  await page.keyboard.press('Control+K');
  const popover = page.getByRole('dialog', { name: 'Add link' });
  await popover.getByRole('textbox', { name: 'Link address' }).fill('not a link');
  await page.keyboard.press('Enter');
  await expect(popover.getByText('Use a web or e-mail address.')).toBeVisible();
  await popover.getByRole('textbox', { name: 'Link address' }).fill('example.com/docs');
  await page.keyboard.press('Enter');
  await expect(popover).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expect(editor.locator('a[href="https://example.com/docs"]')).toHaveText('Hello');

  // Typing @ suggests people and inserts a chip.
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' @Ad');
  const people = page.getByRole('listbox', { name: 'Mention someone' });
  await expect(people.getByRole('option', { name: '@Ada Lovelace' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(editor.locator('.text-mention')).toHaveText('@Ada Lovelace');
  await page.keyboard.type('thanks');
  await page.keyboard.press('Escape');

  await waitForSave(page, b => b.items[0].text === 'Hello brave world @Ada Lovelace thanks', 'rich text saved');
  const saved = (await savedBoard(page)).items[0];
  expect(saved.spansFor).toMatch(/^[0-9a-f]{8}$/);
  // Text typed right after the bold word continues it, as in other editors; the chip has its own style.
  expect(saved.spans[0]).toEqual({ start: 0, end: 5, href: 'https://example.com/docs' });
  expect(saved.spans[1]).toMatchObject({ start: 12, bold: true });
  expect(saved.spans[1].end).toBeGreaterThanOrEqual(17);
  expect(saved.spans.at(-1)).toEqual({ start: 18, end: 31, mention: 'Ada Lovelace' });

  const check = async () => {
    const t = item(page, 't');
    await expect(t.locator('strong')).toHaveText('world');
    await expect(t.locator('a.text-link')).toHaveText('Hello');
    await expect(t.locator('a.text-link')).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await expect(t.locator('.text-mention')).toHaveText('@Ada Lovelace');
  };
  await check();
  await page.reload();
  await check();

  // Exports draw the same styled HTML.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: 'Export as SVG' }).click(),
  ]);
  const svg = readFileSync((await download.path())!, 'utf8');
  expect(svg).toMatch(/<strong[^>]*>world ?<\/strong>/);
  expect(svg).toContain('class="text-mention"');
  expect(svg).toContain('href="https://example.com/docs"');
  await page.keyboard.press('Escape');

  // A plain click on the link selects the object; Ctrl+click opens the link.
  await trapOpen(page);
  const linkEl = item(page, 't').locator('a.text-link');
  await linkEl.click();
  await expect(item(page, 't').locator('.selection')).toHaveCount(1);
  expect(await opened(page)).toEqual([]);
  await linkEl.click({ modifiers: ['Control'] });
  await expect.poll(() => opened(page)).toEqual(['https://example.com/docs']);

  // Editing again starts from the styled text.
  await item(page, 't').dblclick({ position: { x: 40, y: 100 } });
  await expect(editor.locator('[data-b]')).toHaveText('world');
  await expect(editor.locator('.text-mention')).toHaveText('@Ada Lovelace');
  await page.keyboard.press('Escape');
});

test('canvas text: changing the text elsewhere drops the styles instead of misplacing them', async ({ page }) => {
  await seed(
    page,
    `const n = { ...m.createItem('note', 100, 100), id: 'n', text: 'Plan the launch' };
     return { version: 1, title: 'Stale', items: [n, { ...n, id: 'm', x: 400, spans: [{ start: 0, end: 4, bold: true }], spansFor: '00000000' }] };`,
  );
  await fit(page);
  await expect(item(page, 'm').locator('strong')).toHaveCount(0);
  await expect(item(page, 'm')).toContainText('Plan the launch');
  // Sticky notes: Tab hands over to a new note and keeps the styles of the first.
  await item(page, 'n').dblclick();
  const editor = page.getByRole('textbox', { name: 'Edit object text' });
  await selectText(editor, 'Plan');
  await page.keyboard.press('Control+U');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Tab');
  await expect(editor).toBeFocused();
  await page.keyboard.type('Next');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => b.items.length === 3 && b.items[2].text === 'Next', 'next note');
  const first = (await savedBoard(page)).items[0];
  expect(first.spans).toEqual([{ start: 0, end: 4, underline: true }]);
});

test('doc: link, highlight, colour and mention round-trip through Markdown', async ({ page }) => {
  await seed(
    page,
    `const d = { ...m.createItem('doc', 100, 100), id: 'doc', w: 640, h: 480, data: { markdown: 'Intro text here and <b>raw</b>' } };
     const u = { ...m.createItem('usercard', 900, 100), id: 'u' };
     u.data = { ...u.data, name: 'Ada Lovelace' };
     return { version: 1, title: 'Docs', items: [d, u] };`,
  );
  await fit(page);
  await trapOpen(page);
  const doc = item(page, 'doc');
  const editor = doc.getByRole('textbox', { name: /^Document content/ });
  await expect(editor).toContainText('<b>raw</b>');
  await editor.getByText(/Intro/).click();

  await selectText(editor, 'text');
  await page.keyboard.press('Control+K');
  const popover = doc.getByRole('dialog', { name: 'Add link' });
  await popover.getByRole('textbox', { name: 'Link address' }).fill('https://example.org/page');
  await popover.getByRole('button', { name: 'Add link' }).click();
  await expect(popover).toHaveCount(0);
  await expect(editor.locator('a[href="https://example.org/page"]')).toHaveText('text');

  await selectText(editor, 'Intro');
  await doc.getByRole('button', { name: 'Highlight document text' }).click();
  await doc.getByRole('button', { name: 'Highlight colour: Yellow' }).click();
  await expect(editor.locator('mark')).toHaveText('Intro');
  // A second highlight colour (R6a-Q2).
  await selectText(editor, 'and');
  await doc.getByRole('button', { name: 'Highlight document text' }).click();
  await doc.getByRole('button', { name: 'Highlight colour: Green' }).click();
  await expect(editor.locator('mark.doc-mark')).toHaveText('and');

  await selectText(editor, 'here');
  await doc.getByRole('button', { name: 'Document text colour', exact: true }).click();
  await doc.getByRole('button', { name: 'Document text colour: Red' }).click();
  await expect(editor.locator('span.doc-color')).toHaveText('here');

  await page.keyboard.press('Control+End');
  await page.keyboard.type(' @Ad');
  const people = doc.getByRole('listbox', { name: 'Mention someone' });
  await expect(people.getByRole('option', { name: '@Ada Lovelace' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(editor.locator('.doc-mention')).toHaveText('@Ada Lovelace');
  await page.keyboard.press('Control+Enter');

  await waitForSave(page, b => (b.items[0].data.markdown as string).includes('@[Ada Lovelace]'), 'doc saved');
  const md = (await savedBoard(page)).items[0].data.markdown as string;
  expect(md).toContain('==Intro==');
  expect(md).toContain('{mark:#c3f3c8}and{/mark}');
  expect(md).toContain('[text](https://example.org/page)');
  expect(md).toContain('{color:#d92d20}here{/color}');
  expect(md).toContain('@[Ada Lovelace]');

  await page.reload();
  await trapOpen(page);
  await expect(editor.locator('mark:not(.doc-mark)')).toHaveText('Intro');
  await expect(editor.locator('mark.doc-mark')).toHaveCSS('background-color', 'rgb(195, 243, 200)');
  await expect(editor.locator('span.doc-color')).toHaveText('here');
  await expect(editor.locator('span.doc-color')).toHaveCSS('color', 'rgb(217, 45, 32)');
  await expect(editor.locator('.doc-mention')).toHaveText('@Ada Lovelace');
  await expect(editor.locator('.doc-mention')).toHaveAttribute('contenteditable', 'false');
  await expect(editor.locator('b')).toHaveCount(0);

  // Ctrl+click opens a link from the editor; Ctrl+K on it edits or removes it.
  await editor.locator('a').click({ modifiers: ['Control'] });
  await expect.poll(() => opened(page)).toEqual(['https://example.org/page']);
  await selectText(editor, 'text');
  await page.keyboard.press('Control+K');
  const edit = doc.getByRole('dialog', { name: 'Edit link' });
  await expect(edit.getByRole('textbox', { name: 'Link address' })).toHaveValue('https://example.org/page');
  await edit.getByRole('button', { name: 'Remove' }).click();
  await expect(editor.locator('a')).toHaveCount(0);
  await page.keyboard.press('Control+Enter');
  await waitForSave(page, b => !(b.items[0].data.markdown as string).includes('](https'), 'link removed');
});

test('double-clicking an empty sticky note puts the caret in the vertical middle', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Empty', items: [{ ...m.createItem('note', 0, 0), id: 'n', text: '' }] };`,
  );
  await fit(page);
  const box = (await item(page, 'n').boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const editor = page.locator('.object-editor.rich-editor');
  await expect(editor).toBeFocused();
  // Padding and font size are in board units; the editor sits inside the zoomed canvas, so scale them to screen.
  const caretMiddle = await editor.evaluate(el => {
    const cs = getComputedStyle(el),
      r = el.getBoundingClientRect(),
      zoom = r.height / (el as HTMLElement).offsetHeight;
    return r.top + (parseFloat(cs.paddingTop) + parseFloat(cs.fontSize) * 0.7) * zoom;
  });
  expect(Math.abs(caretMiddle - (box.y + box.height / 2))).toBeLessThan(box.height * 0.05);
});
