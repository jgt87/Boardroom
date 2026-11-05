// Track L: board notes panel and note templates, Doc block selection, Table/Kanban starter columns, sticky
// note sets, template gallery sort and quick-create links.
import { test, expect, openApp, seed, fit, item, savedBoard, waitForSave, axeViolations } from './helpers';

const INDEX_KEY = 'boardroom.boards.v1';

test('board notes: docked panel, template, undo, export and reload', async ({ page }) => {
  await seed(
    page,
    `return { ...m.newBoard(), title: 'Planning', items: [{ ...m.createItem('note', 0, 0), id: 'n', text: 'Idea' }] };`,
  );
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Alt+N');
  const panel = page.getByRole('complementary', { name: 'Board notes' });
  await expect(panel).toBeVisible();
  const editor = panel.getByRole('textbox', { name: /^Board notes/ });
  await expect(editor).toHaveAttribute('data-placeholder', /Write notes/);

  await panel.getByRole('combobox', { name: 'Apply a doc template' }).selectOption({ label: 'Meeting notes' });
  await waitForSave(page, b => /^# Meeting notes/.test(String(b.notes ?? '')), 'meeting notes template saved');
  await expect(editor.locator('h1')).toHaveText('Meeting notes');
  expect(String((await savedBoard(page)).notes)).toMatch(/\*\*Date:\*\* \d{4}-\d{2}-\d{2}/);

  // Typing is saved when the editor loses focus, as one undo step.
  await editor.locator('h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' for launch');
  await editor.evaluate(el => (el as HTMLElement).blur());
  await waitForSave(page, b => String(b.notes ?? '').startsWith('# Meeting notes for launch'), 'typed notes saved');
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await waitForSave(page, b => /^# Meeting notes\n/.test(String(b.notes ?? '')), 'undo restores the template');

  // Notes are searchable from the dashboard content search and exported as Markdown.
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export notes as Markdown' }).click();
  expect((await download).suggestedFilename()).toBe('Planning notes.md');
  expect(await axeViolations(page)).toEqual([]);

  await panel.getByRole('button', { name: 'Close board notes' }).click();
  await expect(panel).toHaveCount(0);
  await page.reload();
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Alt+N');
  await expect(page.getByRole('complementary', { name: 'Board notes' }).locator('h1')).toHaveText('Meeting notes');
});

test('Doc blocks: Esc selects a block, Shift+Down extends, Alt+Up moves and Delete removes', async ({ page }) => {
  await seed(
    page,
    `const d = m.createItem('doc', 0, 0, '#ffffff');
     return { ...m.newBoard(), title: 'Docs', items: [{ ...d, id: 'doc', w: 520, h: 520, data: { markdown: '# Plan\\n\\nFirst\\n\\nSecond\\n\\nThird' } }] };`,
  );
  await fit(page);
  const content = item(page, 'doc').locator('.canvas-doc');
  await content.getByText('Second').click();
  await page.keyboard.press('Escape');
  const selected = content.locator('.doc-block-selected');
  await expect(selected).toHaveText('Second');
  await expect(content).toBeFocused();

  await page.keyboard.press('Alt+ArrowUp');
  await waitForSave(page, b => b.items[0].data.markdown === '# Plan\n\nSecond\n\nFirst\n\nThird', 'block moved up');
  await expect(content.locator('.doc-block-selected')).toHaveText('Second');
  await expect(item(page, 'doc').locator('.canvas-doc')).toBeFocused();

  await page.keyboard.press('Shift+ArrowDown');
  await expect(item(page, 'doc').locator('.doc-block-selected')).toHaveCount(2);
  // Printable keys never replace selected blocks.
  await page.keyboard.press('x');
  await expect(item(page, 'doc').locator('.canvas-doc')).toContainText('First');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(item(page, 'doc').locator('.canvas-doc')).not.toBeFocused();

  await item(page, 'doc').locator('.canvas-doc').getByText('First').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Delete');
  await waitForSave(page, b => b.items[0].data.markdown === '# Plan\n\nSecond', 'blocks deleted');
  await page.keyboard.press('Escape');
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await waitForSave(
    page,
    b => b.items[0].data.markdown === '# Plan\n\nSecond\n\nFirst\n\nThird',
    'undo restores blocks',
  );
});

test('a new Kanban offers starter columns until it holds real work', async ({ page }) => {
  await seed(
    page,
    `return { ...m.newBoard(), title: 'Records', items: [{ ...m.createItem('kanban', 0, 0, '#ffffff'), id: 'k', text: 'Kanban', datasetId: 'd' }],
      datasets: { d: [{ id: 'r1', title: 'First task', status: 'Not started', assignee: '', start: '', end: '' }] } };`,
  );
  await fit(page);
  const picker = item(page, 'k').getByRole('combobox', { name: 'Start from a template' });
  await picker.selectOption({ label: 'Sprint backlog' });
  await waitForSave(
    page,
    b => (b.recordSchemas as any)?.d?.statuses?.join() === 'Backlog,To do,In progress,Done',
    'sprint columns applied',
  );
  const board = await savedBoard(page);
  expect(board.items[0].text).toBe('Sprint backlog');
  expect(board.datasets!.d.map((r: any) => r.title)).toContain('As a user I can reset my password');
  await expect(item(page, 'k').getByRole('combobox', { name: 'Start from a template' })).toHaveCount(0);
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await waitForSave(page, b => !b.recordSchemas, 'undo restores the starter');
  await expect(item(page, 'k').getByRole('combobox', { name: 'Start from a template' })).toBeVisible();
});

test('sticky note sets are placed as one group', async ({ page }) => {
  await seed(page, `return { ...m.newBoard(), title: 'Sets', items: [] };`);
  await page.getByRole('button', { name: 'Sticky note', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Add a sticky note set' }).selectOption({ label: 'Retro' });
  await waitForSave(page, b => b.items.length === 3, 'set added');
  const board = await savedBoard(page);
  expect(board.items.map(i => i.text)).toEqual(['Went well', 'To improve', 'Actions']);
  expect(new Set(board.items.map(i => i.group)).size).toBe(1);
  expect((board.groups as any[]).length).toBe(1);
});

test('template gallery sorts by name and by recent use', async ({ page }) => {
  await seed(page, `return { ...m.newBoard(), title: 'Gallery', items: [] };`);
  const open = async () => {
    await page.getByRole('button', { name: 'Collaborate and review' }).click();
    await page.locator('.facilitate-menu button', { hasText: 'Templates' }).click();
    return page.getByRole('complementary', { name: 'Templates' });
  };
  let panel = await open();
  const names = () =>
    panel.getByRole('list', { name: 'Starter templates' }).locator('.template-mini-text > span').allTextContents();
  await panel.getByRole('combobox', { name: 'Sort templates' }).selectOption('name');
  const sorted = await names();
  expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  await panel.getByRole('button', { name: /^PEST analysis/ }).click();
  await waitForSave(page, b => b.items.length > 0, 'template inserted');

  panel = await open();
  // The sort choice is remembered; recently used puts the last template first.
  await expect(panel.getByRole('combobox', { name: 'Sort templates' })).toHaveValue('name');
  await panel.getByRole('combobox', { name: 'Sort templates' }).selectOption('recent');
  expect((await names())[0]).toBe('PEST analysis');
});

test('quick-create links open a new board once and clear the hash', async ({ page }) => {
  await openApp(page);
  const boards = () =>
    page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{"boards":[]}').boards.length as number, INDEX_KEY);
  const before = await boards();
  await page.goto('/#new=kanban-retro');
  await expect(page.locator('svg.canvas')).toBeVisible();
  await waitForSave(page, b => b.title === 'Kanban retro' && b.items.length > 0, 'template board created');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  const after = await boards();
  expect(after).toBeGreaterThan(before);
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
  expect(await boards()).toBe(after);

  // A hash change on the open page works too, including blank boards.
  await page.evaluate(() => (location.hash = '#new'));
  await waitForSave(page, b => b.title === 'Untitled board' && b.items.length === 0, 'blank board created');
  await expect.poll(() => boards()).toBe(after + 1);
  await page.evaluate(() => (location.hash = '#new=not-a-template'));
  await expect(page.getByRole('status').filter({ hasText: 'names no starter template' })).toBeVisible();
  expect(await boards()).toBe(after + 1);
});
