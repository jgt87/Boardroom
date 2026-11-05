// CSV to sticky notes (import from other whiteboards): the Upload menu choice, the Table-or-notes question for a
// dropped spreadsheet, and the "Sticky notes per row" follow-up after pasting a note export.
import { test, expect, seed, fit, savedBoard, waitForSave, openTools } from './helpers';

const CSV =
  '\uFEFFContent,Color,Tags,Author,Category\r\n"Faster onboarding, please",yellow,"ux; web",Ana,Wins\r\n' +
  'Clear pricing,#a8cdff,,Ben,Wins\r\n,red,,,Risks\r\nVendor delay,pink,risk,Cy,Risks\r\nLoose idea,,,,\r\n';

const dropFile = (page: import('@playwright/test').Page, name: string, text: string) =>
  page.evaluate(
    ({ name, text }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: 'text/csv' }));
      document
        .querySelector('svg.canvas')!
        .dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, clientX: 500, clientY: 400, dataTransfer: dt }),
        );
    },
    { name, text },
  );

test('CSV as sticky notes imports from the Upload menu, with frames per category, in one undo step', async ({
  page,
}) => {
  await seed(page, `return { ...m.newBoard(), title: 'Retro', items: [] };`);
  await openTools(page, 'Media');
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Upload/ })
    .click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .locator('.gallery-items')
      .getByRole('button', { name: /^CSV as sticky notes/ })
      .click(),
  ]);
  await chooser.setFiles({ name: 'retro.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await waitForSave(page, b => b.items.length === 6, 'notes and frames');
  await expect(page.getByRole('status')).toContainText(
    'Added 4 sticky notes in 2 frames from the "Content" column. Skipped 1 row without text.',
  );
  const items = (await savedBoard(page)).items;
  expect(items.filter(i => i.type === 'frame').map(i => i.text)).toEqual(['Wins', 'Risks']);
  const first = items.find(i => i.text === 'Faster onboarding, please')!;
  expect(first).toMatchObject({ type: 'note', fill: '#ffe36e', tags: ['ux', 'web'], author: 'Ana' });
  expect(items.find(i => i.text === 'Clear pricing')!.fill).toBe('#a8cdff');
  await expect(page.locator('#objects [data-item]')).toHaveCount(6);

  // One undo step removes the whole import.
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+z');
  await waitForSave(page, b => b.items.length === 0, 'undone');
});

test('a dropped CSV asks: Table keeps the default, Sticky notes makes notes, Cancel adds nothing', async ({ page }) => {
  await seed(page, `return { ...m.newBoard(), title: 'Drop', items: [] };`);
  await fit(page);
  const dialog = page.getByRole('dialog', { name: 'Add a spreadsheet' });

  await dropFile(page, 'ideas.csv', 'Idea,Group\nA,One\nB,Two\n');
  await expect(dialog).toContainText('"ideas.csv"');
  await dialog.getByRole('button', { name: /^Cancel$/ }).click();
  await expect(dialog).toHaveCount(0);
  expect((await savedBoard(page)).items).toHaveLength(0);

  await dropFile(page, 'ideas.csv', 'Idea,Group\nA,One\nB,Two\n');
  await dialog.getByRole('button', { name: /^Sticky notes/ }).click();
  await waitForSave(page, b => b.items.filter(i => i.type === 'note').length === 2, 'notes from drop');
  expect((await savedBoard(page)).items.filter(i => i.type === 'frame')).toHaveLength(2);

  await dropFile(page, 'plan.csv', 'Title,Status\nDesign,In progress\n');
  await dialog.getByRole('button', { name: /^Table/ }).click();
  await waitForSave(page, b => b.items.some(i => i.type === 'table'), 'table from drop');
  expect((await savedBoard(page)).items.find(i => i.type === 'table')!.text).toBe('plan');
});

test('pasting a note export as cells or comma lines offers sticky notes per row', async ({ page }) => {
  await seed(page, `return { ...m.newBoard(), title: 'Paste', items: [] };`);
  await fit(page);
  const paste = (text: string) =>
    page.evaluate(text => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    }, text);

  // Tab-separated cells still become a Grid first.
  await paste('Text\tColour\nFirst\tblue\nSecond\tgreen');
  await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'grid', 'grid pasted');
  await page.getByRole('button', { name: 'Sticky notes per row' }).click();
  await waitForSave(page, b => b.items.length === 2 && b.items.every(i => i.type === 'note'), 'notes per row');
  const notes = (await savedBoard(page)).items;
  expect(notes.map(i => [i.text, i.fill])).toEqual([
    ['First', '#a8cdff'],
    ['Second', '#a9e8bb'],
  ]);

  // Comma lines become one note per line first; the follow-up reads them as rows.
  await paste('Title,Group\nAlpha,Now\nBeta,Later');
  await waitForSave(page, b => b.items.length === 5, 'line notes');
  await page.getByRole('button', { name: 'Sticky notes per row' }).click();
  await waitForSave(
    page,
    b => b.items.length === 6 && b.items.filter(i => i.type === 'frame').length === 2,
    'rows as notes in frames',
  );
  // A plain list without such a header gets no offer.
  await paste('Buy milk\nCall Ben');
  await waitForSave(page, b => b.items.length === 8, 'plain notes');
  await expect(page.getByRole('button', { name: 'Sticky notes per row' })).toHaveCount(0);
});
