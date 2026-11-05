// Track R1-E: multi-statement scales, poll hide/reveal and Table export, voting results as a Table and the
// extended Action Shortcut actions.
import { test, expect, seed, fit, item, savedBoard, waitForSave } from './helpers';

test('a scale rates several statements; older single-marker scales still load', async ({ page }) => {
  await seed(
    page,
    `const s = { ...m.createItem('scale', 0, 0), id: 's', h: 260, data: {
       label: 'Team check', min: 1, max: 5, leftLabel: 'No', rightLabel: 'Yes',
       statements: [
         { id: 'a', text: 'Goal', tallies: [0, 0, 0, 0, 0] },
         { id: 'b', text: 'Plan', tallies: [0, 0, 1, 0, 0] },
       ] } };
     const old = { ...m.createItem('scale', 0, 400), id: 'old', data: {
       label: 'Old scale', min: 1, max: 5, value: 2, leftLabel: '', rightLabel: '' } };
     return { version: 1, title: 'Scales', items: [s, old] };`,
  );
  await fit(page);
  const scale = item(page, 's');
  await scale.getByRole('button', { name: 'Add a 4 for Goal' }).click();
  await scale.getByRole('button', { name: 'Add a 5 for Goal' }).click();
  await waitForSave(
    page,
    b => b.items[0].data.statements[0].tallies.join() === '0,0,0,1,1',
    'two responses on the first statement',
  );
  await expect(scale.getByLabel('Average for Goal')).toContainText('Avg 4.5');
  await expect(scale.getByLabel('Average for Plan')).toContainText('Avg 3');
  // The older scale reads as one statement whose marker counts as a response, and migrates on the next tally.
  const old = item(page, 'old');
  await expect(old.getByLabel('Average for Old scale')).toContainText('Avg 2');
  await old.getByRole('button', { name: 'Add a 4 for Old scale' }).click();
  await waitForSave(
    page,
    b => {
      const d = b.items[1].data;
      return d.value === undefined && d.statements?.[0]?.tallies.join() === '0,1,0,1,0';
    },
    'old scale migrated',
  );
  // The editor adds statements (up to six) and grows the object.
  // Double-click near the bottom edge, clear of the selection bar above the object.
  const box = (await scale.boundingBox())!;
  await scale.dblclick({ position: { x: 6, y: box.height - 6 } });
  const dialog = page.getByRole('dialog', { name: 'Alignment scale' });
  await dialog.getByRole('button', { name: 'Add statement' }).click();
  await dialog.getByRole('textbox', { name: 'Statement 3' }).fill('Roles');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items[0].data.statements.length === 3 && b.items[0].h >= 298, 'third statement');
  await expect(scale.getByRole('group', { name: 'Rate Roles' })).toBeVisible();
});

test('a poll hides results until revealed and exports to a Table', async ({ page }) => {
  await seed(
    page,
    `const p = { ...m.createItem('poll', 0, 0), id: 'p', data: { question: 'Lunch?', options: [
       { id: 'a', label: 'Pizza', votes: 2 }, { id: 'b', label: 'Salad', votes: 1 } ] } };
     return { version: 1, title: 'Poll', items: [p] };`,
  );
  await fit(page);
  const poll = item(page, 'p');
  await expect(poll.locator('.count')).toHaveCount(2);
  // Select by the footer, clear of the vote buttons and the resize handles.
  const select = async () => {
    const box = (await poll.boundingBox())!;
    await poll.click({ position: { x: box.width / 2, y: box.height - 10 } });
  };
  await select();
  await page.locator('.selection-bar').getByRole('button', { name: 'Hide results' }).click();
  await waitForSave(page, b => b.items[0].data.resultsHidden === true, 'results hidden');
  await expect(poll.locator('.count')).toHaveCount(0);
  await expect(poll.locator('.bar')).toHaveCount(0);
  await expect(poll).toContainText('results hidden');
  // Votes still count while hidden.
  await poll.getByRole('button', { name: 'Salad' }).click();
  await waitForSave(page, b => b.items[0].data.options[1].votes === 2, 'hidden vote counted');
  await select();
  await page.locator('.selection-bar').getByRole('button', { name: 'Reveal results' }).click();
  await waitForSave(page, b => b.items[0].data.resultsHidden === undefined, 'results revealed');
  await expect(poll.locator('.count')).toHaveCount(2);
  // Export to Table: one new Table with a dataset of options and votes, to the right of the poll.
  await select();
  await page.locator('.selection-bar').getByRole('button', { name: 'Export to Table' }).click();
  await waitForSave(page, b => b.items.some(i => i.type === 'table'), 'table created');
  const b = await savedBoard(page);
  const table = b.items.find(i => i.type === 'table')!;
  expect(table.x).toBeGreaterThan(b.items[0].x + b.items[0].w);
  expect(table.text).toBe('Lunch?');
  expect((b.datasets as any)[table.datasetId].map((r: any) => r.title)).toEqual(['Pizza', 'Salad']);
  await expect(item(page, table.id)).toBeVisible();
  // One undo step removes it.
  await page.keyboard.press('Control+z');
  await waitForSave(page, x => !x.items.some(i => i.type === 'table'), 'undo removes the table');
});

test('voting results go on the board as a Table beside the voted objects', async ({ page }) => {
  await seed(
    page,
    `const notes = ['Alpha', 'Bravo'].map((t, i) => ({ ...m.createItem('note', i * 300, 100), id: 'v' + i, text: t }));
     const s = { ...m.createItem('shortcut', 0, -300), id: 'sc', text: 'Vote', data: { action: 'voting', target: '' } };
     return { version: 1, title: 'Vote', items: [...notes, s], votingResults: [{
       endedAt: '2026-11-04T10:00:00.000Z', budget: 3, name: 'Round one',
       totals: [{ id: 'v1', label: 'Bravo', votes: 2 }, { id: 'v0', label: 'Alpha', votes: 1 }] }] };`,
  );
  await fit(page);
  // The shortcut opens the voting panel.
  await item(page, 'sc').getByRole('button', { name: 'Vote' }).click();
  const panel = page.getByRole('complementary', { name: 'Dot voting' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Add result Round one to the board as a table' }).click();
  await waitForSave(page, b => b.items.some(i => i.type === 'table'), 'results table created');
  const b = await savedBoard(page);
  const table = b.items.find(i => i.type === 'table')!;
  expect(table.text).toBe('Round one');
  expect(table.x).toBeGreaterThan(300 + b.items[1].w);
  expect(table.y).toBe(100);
  expect((b.datasets as any)[table.datasetId].map((r: any) => r.title)).toEqual(['Bravo', 'Alpha']);
  await panel.getByRole('button', { name: 'Close dot voting' }).click();
  await page.keyboard.press('Control+z');
  await waitForSave(page, x => !x.items.some(i => i.type === 'table') && !x.datasets, 'one undo step');
});

test('action shortcuts run more board actions and the picker groups them', async ({ page }) => {
  await seed(
    page,
    `const mk = (id, action, y) => ({ ...m.createItem('shortcut', 0, y), id, text: id, data: { action, target: '' } });
     return { version: 1, title: 'Shortcuts', items: [
       mk('grid', 'grid', 0), mk('comments', 'comments', 100), mk('layers', 'layers', 200),
       mk('note', 'tool-note', 300), mk('viewonly', 'viewonly', 400) ] };`,
  );
  await fit(page);
  const run = (id: string) => item(page, id).getByRole('button', { name: id, exact: true }).click();
  const grid = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('boardroom.view.v1') ?? '{}').grid as boolean | undefined);
  const before = await grid();
  await run('grid');
  await expect.poll(grid).toBe(before === false);
  await run('comments');
  await expect(page.getByRole('complementary', { name: 'Comments' })).toBeVisible();
  await run('layers');
  await expect(page.getByRole('complementary', { name: 'Layers' })).toBeVisible();
  await page.keyboard.press('Escape');
  await run('note');
  await expect(page.getByRole('button', { name: 'Sticky note', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await run('viewonly');
  await waitForSave(page, b => b.viewOnly === true, 'view only on');
  await run('viewonly');
  await waitForSave(page, b => !b.viewOnly, 'view only off');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  // The editor lists the actions in groups.
  const last = item(page, 'viewonly'),
    box = (await last.boundingBox())!;
  await last.dblclick({ position: { x: 3, y: box.height - 3 } });
  const dialog = page.getByRole('dialog', { name: 'Action Shortcut' });
  const select = dialog.getByLabel('Shortcut action');
  await expect(select.locator('optgroup')).toHaveCount(7);
  expect(await select.locator('option').count()).toBeGreaterThanOrEqual(15);
  await select.selectOption('timer');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items[4].data.action === 'timer', 'action changed');
});
