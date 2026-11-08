// Richer Doc editor (R4-Q4): date chips, block selection with a visible bar, comments anchored to Doc text and
// board objects dragged into a Doc.
import { test, expect, seed, waitForSave, savedBoard, item, fit, center, mouseDrag } from './helpers';
import type { Page } from '@playwright/test';

const docBoard = (markdown: string, extra = '') =>
  `const d = { ...m.createItem('doc', 0, 0, '#ffffff'), id: 'doc', w: 640, h: 560, data: { markdown: ${JSON.stringify(markdown)} } };
   ${extra}
   return { ...m.newBoard(), title: 'Docs', items: [d${extra ? ', ...more' : ''}] };`;
const mdOf = (b: { items: { id: string; data?: Record<string, unknown> }[] }) =>
  String(b.items.find(i => i.id === 'doc')!.data!.markdown);

/** Record what the page puts on the clipboard (the copy and cut events), without clipboard permissions. */
async function trapClipboard(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    for (const type of ['copy', 'cut'])
      addEventListener(type, e => w.copied.push((e as ClipboardEvent).clipboardData?.getData('text/plain') ?? ''));
  });
}
const copied = (page: Page) => page.evaluate(() => (window as unknown as { copied: string[] }).copied);

test('date chips: insert from the toolbar and from /date, saved as @date[…] and shown readable', async ({ page }) => {
  await seed(page, docBoard('# Plan\n\nDue'));
  await fit(page);
  const doc = item(page, 'doc'),
    editor = doc.getByRole('textbox', { name: /^Document content/ });
  await editor.getByText('Due').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await doc.getByRole('button', { name: 'Insert date' }).click();
  const picker = doc.getByRole('dialog', { name: 'Insert date' });
  await picker.getByLabel('Date').fill('2026-11-08');
  await picker.getByRole('button', { name: 'Insert date' }).click();
  await expect(picker).toHaveCount(0);
  await expect(editor.locator('.doc-date')).toHaveText('8 Nov 2026');
  await expect(editor.locator('.doc-date')).toHaveAttribute('contenteditable', 'false');

  // The slash menu offers the same picker on a new line; Enter in the picker inserts.
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/date');
  await expect(doc.getByRole('listbox', { name: 'Insert block' }).getByRole('option', { name: /Date/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await picker.getByLabel('Date').fill('2027-01-31');
  await picker.getByLabel('Date').press('Enter');
  await expect(editor.locator('.doc-date')).toHaveCount(2);
  await page.keyboard.press('Control+Enter');

  await waitForSave(page, b => mdOf(b).includes('@date[2027-01-31]'), 'dates saved');
  expect(mdOf(await savedBoard(page))).toMatch(/Due\s@date\[2026-11-08\]/);
  await page.reload();
  await expect(editor.locator('.doc-date').first()).toHaveText('8 Nov 2026');
  await expect(editor.locator('.doc-date').nth(1)).toHaveText('31 Jan 2027');
});

test('block selection: bar and keys extend, move, copy, cut and delete, one undo step each', async ({ page }) => {
  await seed(page, docBoard('# Plan\n\nFirst\n\nSecond\n\nThird'));
  await fit(page);
  await trapClipboard(page);
  const doc = item(page, 'doc'),
    editor = doc.locator('.canvas-doc');
  await editor.getByText('First').click();
  // The visible control does what Esc does.
  await doc.getByRole('button', { name: 'Select block' }).click();
  const bar = doc.getByRole('toolbar', { name: 'Selected blocks' });
  await expect(bar).toContainText('1 block selected');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(bar).toContainText('2 blocks selected');
  await expect(editor.locator('.doc-block-selected')).toHaveText(['First', 'Second']);

  // Alt+Shift+Down moves them; the bar's button moves them back.
  await page.keyboard.press('Alt+Shift+ArrowDown');
  await waitForSave(page, b => mdOf(b) === '# Plan\n\nThird\n\nFirst\n\nSecond', 'moved down');
  await bar.getByRole('button', { name: 'Move blocks up' }).click();
  await waitForSave(page, b => mdOf(b) === '# Plan\n\nFirst\n\nSecond\n\nThird', 'moved up');
  await expect(editor.locator('.doc-block-selected')).toHaveCount(2);

  // Copy from the bar and with Ctrl+C: the blocks go on the clipboard as Markdown.
  await bar.getByRole('button', { name: 'Copy blocks' }).click();
  await page.keyboard.press('Control+C');
  await expect.poll(() => copied(page)).toEqual(['First\n\nSecond', 'First\n\nSecond']);

  // Cut with Ctrl+X removes them as one step; undo brings them back.
  await page.keyboard.press('Control+X');
  await waitForSave(page, b => mdOf(b) === '# Plan\n\nThird', 'cut');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await waitForSave(page, b => mdOf(b) === '# Plan\n\nFirst\n\nSecond\n\nThird', 'undo cut');

  // Delete from the bar; clicking leaves block selection; typing leaves it too, without replacing blocks.
  await editor.getByText('Third').click();
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Delete blocks' }).click();
  await waitForSave(page, b => mdOf(b) === '# Plan\n\nFirst\n\nSecond', 'deleted');
  await editor.getByText('First').click();
  await expect(bar).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(bar).toBeVisible();
  await page.keyboard.type('!');
  await expect(bar).toHaveCount(0);
  await expect(editor.locator('p')).toHaveText(['First!', 'Second']);
});

test('comments: add on selected text, reply, resolve, detach when the text goes, delete', async ({ page }) => {
  await seed(page, docBoard('# Plan\n\nShip the **beta** next week.\n\nKeep this line.'));
  await fit(page);
  const doc = item(page, 'doc'),
    editor = doc.getByRole('textbox', { name: /^Document content/ });
  await editor.getByText('Ship').click();
  await expect(editor.locator('strong')).toHaveText('beta');
  // Select "the beta next", across the bold word.
  await editor.evaluate(el => {
    const p = el.querySelector('p')!,
      range = document.createRange();
    range.setStart(p.firstChild!, 5);
    range.setEnd(p.lastChild!, 5);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await doc.getByRole('button', { name: 'Comment on selected text' }).click();
  const composer = doc.getByRole('dialog', { name: 'Add comment' });
  await expect(composer).toContainText('the beta next');
  await composer.getByRole('textbox', { name: 'Comment' }).fill('Is next week realistic?');
  await composer.getByRole('textbox', { name: 'Comment' }).press('Enter');
  await expect(composer).toHaveCount(0);

  await waitForSave(page, b => mdOf(b).includes('{comment:'), 'comment saved');
  let board = await savedBoard(page);
  const thread = (board.items[0].data!.comments as { id: string; quote: string }[])[0];
  expect(mdOf(board)).toBe(`# Plan\n\nShip {comment:${thread.id}}the **beta** next{/comment} week.\n\nKeep this line.`);
  expect(thread.quote).toBe('the beta next');
  await expect(editor.locator('.doc-comment')).toHaveText('the beta next');

  const panel = doc.getByRole('complementary', { name: 'Doc comments' });
  await expect(panel).toBeVisible();
  const entry = panel.getByRole('listitem', { name: 'Comment on "the beta next"' });
  await expect(entry).toContainText('Is next week realistic?');
  await entry.getByRole('textbox', { name: /^Reply/ }).fill('Yes, with two people.');
  await entry.getByRole('button', { name: 'Reply' }).click();
  await waitForSave(page, b => JSON.stringify(b.items[0].data!.comments).includes('two people'), 'reply saved');
  await entry.getByRole('button', { name: 'Resolve' }).click();
  await waitForSave(
    page,
    b => (b.items[0].data!.comments as { resolved?: boolean }[])[0].resolved === true,
    'resolved',
  );
  await expect(editor.locator('.doc-comment')).toHaveClass(/doc-comment-resolved/);
  await entry.getByRole('button', { name: 'Reopen' }).click();
  await expect(editor.locator('.doc-comment')).not.toHaveClass(/doc-comment-resolved/);

  // Deleting the commented paragraph detaches the thread visibly instead of dropping it.
  await editor.getByText('week').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await waitForSave(page, b => !mdOf(b).includes('{comment:'), 'text removed');
  await expect(page.getByText(/The text of 1 comment was removed/)).toBeVisible();
  board = await savedBoard(page);
  expect((board.items[0].data!.comments as unknown[]).length).toBe(1);
  await expect(panel.getByRole('heading', { name: 'Text removed' })).toBeVisible();
  const orphan = panel.getByRole('listitem', { name: 'Comment on "the beta next"' });
  await expect(orphan).toContainText('Text removed');
  await orphan.getByRole('button', { name: 'Delete' }).click();
  await waitForSave(page, b => !b.items[0].data!.comments, 'thread deleted');
  await expect(panel).toContainText('Select text and press Comment');

  // Reload keeps comments valid; the panel opens from the toolbar.
  await page.reload();
  await expect(item(page, 'doc').getByRole('button', { name: 'Comments (0)' })).toBeVisible();
});

test('drag a sticky note onto a Doc: its text and a link go in at the drop point, one undo step', async ({ page }) => {
  await seed(
    page,
    docBoard(
      '# Plan\n\nFirst\n\nLast',
      `const more = [{ ...m.createItem('note', 900, 40), id: 'n1', text: 'Call *Ada* <b>today</b>' }];`,
    ),
  );
  await fit(page);
  const doc = item(page, 'doc'),
    editor = doc.locator('.canvas-doc');
  const before = (await savedBoard(page)).items.find(i => i.id === 'n1') as unknown as { x: number; y: number };
  const last = await editor.getByText('Last').boundingBox();
  await mouseDrag(page, await center(item(page, 'n1')), { x: last!.x + 40, y: last!.y + 2 }, 16, async () => {
    // While over the Doc, the drop line shows where the text will go.
    await expect(page.locator('line.drop-indicator')).toHaveCount(1);
  });
  await waitForSave(page, b => mdOf(b).includes('object=n1'), 'note dropped into the doc');
  const board = await savedBoard(page);
  const boardId = await page.evaluate(() => JSON.parse(localStorage.getItem('boardroom.boards.v1') ?? '{}').activeId);
  expect(mdOf(board)).toBe(
    `# Plan\n\nFirst\n\nCall \\*Ada\\* <b>today</b> ([sticky note](#board=${boardId}&object=n1))\n\nLast`,
  );
  // The note stays where it was.
  const after = board.items.find(i => i.id === 'n1') as unknown as { x: number; y: number };
  expect([after.x, after.y]).toEqual([before.x, before.y]);
  const link = editor.locator('a.doc-object-link');
  await expect(link).toHaveText('sticky note');
  await expect(editor).toContainText('Call *Ada* <b>today</b>');

  // Ctrl+click on the link shows the object, as any object link does (it is selected and its bar appears).
  await link.click({ modifiers: ['Control'] });
  await expect(page.locator('.selection-bar').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');

  // One undo removes the inserted block.
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await waitForSave(page, b => mdOf(b) === '# Plan\n\nFirst\n\nLast', 'undo drop');
});
