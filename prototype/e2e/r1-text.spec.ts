// Track B (r1): paste a link over selected words, long text as a Doc, cells as one sticky per cell, text corner
// resize scaling the font, and rectangle sticky notes.
import { test, expect, seed, waitForSave, savedBoard, item, fit, center, mouseDrag } from './helpers';
import type { Locator, Page } from '@playwright/test';

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
/** Dispatch a paste of plain text on `target` (the board when omitted). */
async function pasteText(page: Page, text: string, target?: Locator) {
  const handle = target ? await target.elementHandle() : await page.locator('svg.canvas').elementHandle();
  await handle!.evaluate((el, t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test('pasting a web address over selected words links them; other text replaces the selection', async ({ page }) => {
  await seed(
    page,
    `const t = { ...m.createItem('text', 100, 100), id: 't', w: 520, h: 120, text: 'Read the plan today' };
     return { version: 1, title: 'Paste link', items: [t] };`,
  );
  await fit(page);
  await item(page, 't').dblclick();
  const editor = page.getByRole('textbox', { name: 'Edit object text' });
  await expect(editor).toBeFocused();
  await selectText(editor, 'plan');
  await pasteText(page, 'https://example.com/plan', editor);
  await expect(editor.locator('a[href="https://example.com/plan"]')).toHaveText('plan');
  await expect(editor).toHaveText('Read the plan today');

  // Not a lone address: replaces the selected words as before.
  await selectText(editor, 'today');
  await pasteText(page, 'see https://example.com', editor);
  await expect(editor).toHaveText('Read the plan see https://example.com');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => b.items[0].text === 'Read the plan see https://example.com', 'text saved');
  const saved = (await savedBoard(page)).items[0];
  expect(saved.spans).toEqual([{ start: 9, end: 13, href: 'https://example.com/plan' }]);
});

test('long pasted prose becomes a Doc; short lines still become sticky notes', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Paste doc', items: [] };`);
  const para = 'This sentence belongs to a long pasted article about planning the quarter. ';
  const prose = `${para.repeat(5)}\n\n${para.repeat(5)}`;
  await pasteText(page, prose);
  await waitForSave(page, b => b.items.length === 1, 'doc pasted');
  const doc = (await savedBoard(page)).items[0];
  expect(doc.type).toBe('doc');
  expect(doc.data.markdown).toBe(prose.trim());
  await expect(page.getByRole('status').filter({ hasText: 'Long text pasted as a Doc.' })).toBeVisible();

  await pasteText(page, 'Alpha\nBeta');
  await waitForSave(page, b => b.items.length === 3, 'notes pasted');
  expect((await savedBoard(page)).items.slice(1).map(i => [i.type, i.text])).toEqual([
    ['note', 'Alpha'],
    ['note', 'Beta'],
  ]);
});

test('pasted cells become a grid, with a one-click switch to one sticky per cell', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Paste cells', items: [] };`);
  await pasteText(page, 'Name\tRole\nAda\tEngineer');
  await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'grid', 'grid pasted');
  const toast = page.getByRole('status').filter({ hasText: 'Pasted the cells as a grid.' });
  await toast.getByRole('button', { name: 'One sticky per cell' }).click();
  await waitForSave(page, b => b.items.length === 4 && b.items.every(i => i.type === 'note'), 'stickies');
  expect((await savedBoard(page)).items.map(i => i.text)).toEqual(['Name', 'Role', 'Ada', 'Engineer']);
  await expect(page.getByRole('status').filter({ hasText: 'Added 4 sticky notes.' })).toBeVisible();
  // One undo step back to the grid.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'grid', 'grid back');
});

test('dragging a text corner scales its font; a side handle reflows; locked text does not change', async ({ page }) => {
  await seed(
    page,
    `const t = { ...m.createItem('text', 100, 100), id: 't', w: 300, h: 60, text: 'Scale me', format: { fontSize: 20 } };
     const l = { ...m.createItem('text', 100, 400), id: 'l', w: 300, h: 60, text: 'Locked', locked: true };
     return { version: 1, title: 'Scale text', items: [t, l] };`,
  );
  await fit(page);
  await item(page, 't').click();
  const corner = page.locator('.selection [data-resize="se"]'),
    side = page.locator('.selection [data-resize="e"]');
  const before = (await savedBoard(page)).items[0];
  const box = (await item(page, 't').boundingBox())!;
  const from = await center(corner);
  await mouseDrag(page, from, { x: from.x + box.width / 2, y: from.y + 5 });
  await waitForSave(page, b => b.items[0].format?.fontSize !== 20, 'font scaled');
  const scaled = (await savedBoard(page)).items[0];
  expect(scaled.format.fontSize).toBeGreaterThanOrEqual(28);
  expect(scaled.format.fontSize).toBeLessThanOrEqual(32);
  // Proportions kept.
  expect(scaled.w / scaled.h).toBeCloseTo(before.w / before.h, 1);
  expect(scaled.format.fontSize / 20).toBeCloseTo(scaled.w / before.w, 1);

  // Side handle: wider box, same font.
  const s = await center(side);
  await mouseDrag(page, s, { x: s.x + 80, y: s.y });
  await waitForSave(page, b => b.items[0].w > scaled.w + 20, 'side resize');
  expect((await savedBoard(page)).items[0].format.fontSize).toBe(scaled.format.fontSize);

  // Undo the side resize, then the corner scale: one step each.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items[0].format?.fontSize === 20 && b.items[0].w === 300, 'undone');

  // A locked text object offers no resize handles at all.
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Escape');
  await item(page, 'l').click();
  await expect(page.locator('.selection [data-resize]')).toHaveCount(0);
});

test('rectangle sticky notes: shape option, size presets keep it, it survives a reload', async ({ page }) => {
  await seed(
    page,
    `const n = { ...m.createItem('note', 100, 100), id: 'n', w: 210, h: 210, text: '' };
     return { version: 1, title: 'Rectangle', items: [n] };`,
  );
  await fit(page);
  await item(page, 'n').click();
  await page.getByRole('combobox', { name: 'Sticky note shape' }).selectOption('rectangle');
  await waitForSave(page, b => b.items[0].noteShape === 'rectangle', 'rectangle saved');
  expect((await savedBoard(page)).items[0]).toMatchObject({ w: 420, h: 210, x: -5, y: 100 });
  await page.getByRole('combobox', { name: 'Sticky note size' }).selectOption('140');
  await waitForSave(page, b => b.items[0].h === 140, 'small rectangle');
  expect((await savedBoard(page)).items[0]).toMatchObject({ w: 280, h: 140, noteShape: 'rectangle' });

  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
  await fit(page);
  await item(page, 'n').click();
  await expect(page.getByRole('combobox', { name: 'Sticky note shape' })).toHaveValue('rectangle');
  await expect(page.getByRole('combobox', { name: 'Sticky note size' })).toHaveValue('140');

  // The caret on the empty rectangle note sits in the vertical middle.
  await item(page, 'n').dblclick();
  const editor = page.getByRole('textbox', { name: 'Edit object text' });
  await expect(editor).toBeFocused();
  const caret = await page.evaluate(() => {
    const r = getSelection()!.getRangeAt(0).getBoundingClientRect(),
      e = document.activeElement!.getBoundingClientRect();
    const mid = r.height ? r.top + r.height / 2 : NaN;
    return { mid, top: e.top, bottom: e.bottom, height: e.height };
  });
  if (!Number.isNaN(caret.mid)) {
    expect(Math.abs(caret.mid - (caret.top + caret.bottom) / 2)).toBeLessThan(caret.height * 0.15);
  } else {
    // Collapsed caret without a box: check that the first line's centre sits at the editor's middle
    // (in unzoomed CSS pixels). A large auto font can fill the note, leaving only a small padding.
    const line = await editor.evaluate(el => {
      const s = getComputedStyle(el);
      return { centre: parseFloat(s.paddingTop) + (parseFloat(s.fontSize) * 1.4) / 2, height: el.offsetHeight };
    });
    expect(Math.abs(line.centre - line.height / 2)).toBeLessThan(line.height * 0.15);
  }

  // Back to square.
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Sticky note shape' }).selectOption('square');
  await waitForSave(page, b => b.items[0].noteShape === undefined && b.items[0].w === 140, 'square again');
});
