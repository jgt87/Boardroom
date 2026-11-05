// Decided open questions (round qA) in the browser: widget editors and record settings use the shared colour menu
// (P1-Q1), new sticky notes take the last sticky colour (P1-Q2), "?" is an unknown card estimate (P1-Q6), the
// T-shirt sizing entry places Sizes chips (P1-Q7) and poll results export to a minimal Table (P1-Q8).
import { test, expect, seed, fit, item, savedBoard, waitForSave, openTools, chooseTool } from './helpers';

const canvas = (page: import('@playwright/test').Page) => page.locator('svg.canvas');

test('widget editors and record settings pick colours from the shared colour menu', async ({ page }) => {
  await seed(
    page,
    `const s = { ...m.createItem('shortcut', 0, 0), id: 's' };
     const k = { ...m.createItem('kanban', 0, 300), id: 'k', datasetId: 'd' };
     return { version: 1, title: 'Menus', items: [s, k],
       datasets: { d: [{ id: 'r', title: 'Task', status: 'Not started', assignee: '', start: '', end: '' }] } };`,
  );
  await fit(page);
  // No native colour inputs remain in the editor; the menu opens above the dialog and takes a typed hex colour.
  await item(page, 's').dblclick({ position: { x: 3, y: 3 } });
  const dialog = page.getByRole('dialog', { name: 'Action Shortcut' });
  await expect(dialog.locator('input[type="color"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^Shortcut colour: / }).click();
  const menu = page.getByRole('dialog', { name: 'Colours for shortcut colour' });
  await menu.getByRole('textbox', { name: 'Hex colour' }).fill('#7a1f8f');
  await menu.getByRole('textbox', { name: 'Hex colour' }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 's')?.fill === '#7a1f8f', 'shortcut colour');

  // Kanban column colour in the fields panel.
  const k = item(page, 'k');
  await k.getByText('Fields', { exact: true }).click();
  await k.getByRole('button', { name: /^Column colour: Not started: / }).click();
  await page
    .getByRole('dialog', { name: 'Colours for column colour: not started' })
    .getByRole('button', { name: 'Use colour Light green', exact: true })
    .click();
  await waitForSave(
    page,
    b => (b.recordSchemas as any)?.d?.columns?.['Not started']?.color === '#86efac',
    'column colour from the menu',
  );
});

test('new sticky notes take the last colour picked for sticky notes only', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Stickies', items: [
       { ...m.createItem('note', 0, 0), id: 'n', text: 'One' },
       { ...m.createItem('rectangle', 400, 0, '#ffffff'), id: 'r' },
     ] };`,
  );
  await fit(page);
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  const pick = async (id: string, name: string) => {
    await item(page, id).click({ position: { x: 20, y: 150 } });
    await bar.getByRole('button', { name: /^Object colour: / }).click();
    await page
      .getByRole('dialog', { name: /^Colours for / })
      .getByRole('button', { name: `Use colour ${name}`, exact: true })
      .click();
    await page.keyboard.press('Escape');
  };
  await pick('n', 'Light green');
  await waitForSave(page, b => b.items[0].fill === '#86efac', 'sticky recoloured');
  // The tool-rail sticky swatch follows it.
  await page.keyboard.press('Escape');
  await canvas(page).focus();
  await page.keyboard.press('n');
  await expect(page.getByRole('group', { name: 'Colors' }).getByRole('button', { pressed: true })).toHaveAttribute(
    'aria-label',
    /^Use colour (Light green|#86efac)$/,
  );
  await page.keyboard.press('Escape');
  // A colour picked afterwards for a shape leaves the sticky colour alone.
  await pick('r', 'Dark red');
  await waitForSave(page, b => b.items[1].fill === '#b91c1c', 'shape recoloured');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await canvas(page).focus();
  await page.keyboard.press('n');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => b.items.length === 3, 'new note');
  expect((await savedBoard(page)).items[2].fill).toBe('#86efac');
});

test('"?" marks a card estimate as unknown and shows "? pt"', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Unknown', items: [
       { ...m.createItem('estimates', 0, 0), id: 'pal' },
       { ...m.createItem('card', 0, 200), id: 'c', text: 'Card', data: { ...m.createItem('card', 0, 0).data, points: 5 } },
     ] };`,
  );
  await fit(page);
  await expect(item(page, 'c').locator('.w-estimate')).toHaveText('5 pt');
  await item(page, 'pal')
    .getByRole('button', { name: 'Estimate unknown', exact: true })
    .dragTo(item(page, 'c'), { targetPosition: { x: 16, y: 24 } });
  await waitForSave(
    page,
    b => {
      const d = b.items.find(i => i.id === 'c')?.data;
      return d?.pointsUnknown === true && d?.points === undefined;
    },
    'unknown estimate stored',
  );
  await expect(item(page, 'c').locator('.w-estimate')).toHaveText('? pt');
  // The card bar offers the same "?" next to the story points.
  await item(page, 'c').click({ position: { x: 16, y: 24 } });
  await page.getByRole('button', { name: 'Estimate', exact: true }).click();
  await page.getByRole('group', { name: 'Story points' }).getByRole('button', { name: '3', exact: true }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 'c')?.data?.points === 3, 'points replace unknown');
  expect((await savedBoard(page)).items.find(i => i.id === 'c')?.data?.pointsUnknown).toBeUndefined();
  await page.getByRole('button', { name: 'Points unknown' }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 'c')?.data?.pointsUnknown === true, 'unknown again');
});

test('the T-shirt sizing gallery entry places the estimate palette in Sizes mode', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Sizes', items: [] };`);
  await openTools(page, 'Planning');
  await chooseTool(page, 'T-shirt sizing');
  await canvas(page).click({ position: { x: 500, y: 350 } });
  await waitForSave(page, b => b.items.some(i => i.type === 'estimates'), 'palette placed');
  const palette = (await savedBoard(page)).items[0];
  expect(palette.data?.scale).toBe('tshirt');
  await expect(item(page, palette.id).getByRole('radio', { name: 'Sizes' })).toBeChecked();
  await expect(item(page, palette.id).getByRole('button', { name: 'Estimate XL', exact: true })).toBeVisible();
  // Story points still start in Points mode.
  await openTools(page, 'Planning');
  await chooseTool(page, 'Story points');
  await canvas(page).click({ position: { x: 500, y: 600 } });
  await waitForSave(page, b => b.items.length === 2, 'second palette');
  expect((await savedBoard(page)).items[1].data?.scale).toBe('points');
});

test('a poll exports to a minimal Table without a status column', async ({ page }) => {
  await seed(
    page,
    `const p = { ...m.createItem('poll', 0, 0), id: 'p', data: { question: 'Lunch?', options: [
       { id: 'a', label: 'Pizza', votes: 2 }, { id: 'b', label: 'Salad', votes: 1 } ] } };
     return { version: 1, title: 'Poll', items: [p] };`,
  );
  await fit(page);
  const poll = item(page, 'p');
  const box = (await poll.boundingBox())!;
  await poll.click({ position: { x: box.width / 2, y: box.height - 10 } });
  await page.locator('.selection-bar').getByRole('button', { name: 'Export to Table' }).click();
  await waitForSave(page, b => b.items.some(i => i.type === 'table'), 'table created');
  const b = await savedBoard(page);
  const table = b.items.find(i => i.type === 'table')!;
  expect((b.recordSchemas as any)[table.datasetId!].hiddenBuiltIns).toEqual(['status', 'assignee', 'start', 'end']);
  await fit(page);
  const t = item(page, table.id);
  const headers = t.locator('table.canvas-record-table thead th');
  await expect(headers.filter({ hasText: 'Votes' })).toHaveCount(1);
  await expect(headers.filter({ hasText: 'Status' })).toHaveCount(0);
  await expect(t.getByText('Not started')).toHaveCount(0);
  // The status column can be shown again from the fields panel.
  await t.getByText('Fields', { exact: true }).click();
  await t.getByRole('checkbox', { name: 'Show column: Status' }).check();
  await waitForSave(
    page,
    x => (x.recordSchemas as any)[table.datasetId!].hiddenBuiltIns?.join() === 'assignee,start,end',
    'status column shown',
  );
  await expect(headers.filter({ hasText: 'Status' })).toHaveCount(1);
});
