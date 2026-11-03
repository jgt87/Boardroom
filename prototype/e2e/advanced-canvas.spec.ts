import { test, expect, seed, item, fit, waitForSave, savedBoard, axeViolations } from './helpers';
const fixture = (kind: string, locked = false) =>
  `return {version:1,title:'Advanced canvas',items:[{...m.createItem('${kind}',0,0),id:'w',w:1100,h:650,locked:${locked}}]};`;
test('Planner cards edit and move on canvas with dependency lines, undo and reload', async ({ page }) => {
  await seed(page, fixture('planner'));
  await fit(page);
  const before = await savedBoard(page),
    data = before.items[0].data,
    id = data.cards[0].id;
  await item(page, 'w')
    .locator(`[data-planner-card="${id}"]`)
    .dragTo(page.getByRole('region', { name: 'Team B, Iteration 3', exact: true }), { sourcePosition: { x: 3, y: 3 } });
  await waitForSave(
    page,
    b => b.items[0].data.cards.find(c => c.id === id).iteration === data.iterations[2].id,
    'Planner move',
  );
  expect((await savedBoard(page)).items[0].x).toBe(before.items[0].x);
  await page.getByRole('spinbutton', { name: 'Points: Login API', exact: true }).fill('8');
  await waitForSave(page, b => b.items[0].data.cards.find(c => c.id === id).points === 8, 'Planner points');
  await expect(item(page, 'w').locator('[data-planner-dependency]')).toHaveCount(1);
  const movedCard = item(page, 'w').locator(`[data-planner-card="${id}"]`);
  await movedCard.focus();
  await movedCard.press('Alt+ArrowLeft');
  await waitForSave(
    page,
    b => b.items[0].data.cards.find(c => c.id === id).iteration === data.iterations[1].id,
    'keyboard move',
  );
  await expect(movedCard).toBeFocused();
  await movedCard.press('Alt+ArrowLeft');
  await waitForSave(
    page,
    b => b.items[0].data.cards.find(c => c.id === id).iteration === data.iterations[0].id,
    'second keyboard move',
  );
  await expect(movedCard).toBeFocused();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(
    page,
    b => b.items[0].data.cards.find(c => c.id === id).iteration === data.iterations[1].id,
    'undo keyboard move',
  );
  await page.reload();
  await expect(page.getByRole('spinbutton', { name: 'Points: Login API', exact: true })).toHaveValue('8');
});
test('Journey text edits and native cell-content moves preserve other cells; stages reorder', async ({ page }) => {
  await seed(page, fixture('journey'));
  await fit(page);
  const text = page.getByRole('textbox', { name: 'Actions: Discover', exact: true });
  await text.fill('Interview customers');
  await text.press('Control+Enter');
  await waitForSave(page, b => Object.values(b.items[0].data.cells).includes('Interview customers'), 'Journey text');
  const d = (await savedBoard(page)).items[0].data;
  await page
    .getByRole('button', { name: 'Move content: Actions, Discover', exact: true })
    .dragTo(item(page, 'w').locator(`[data-journey-cell="${d.stages[1].id}:${d.lanes[0].id}"]`));
  await waitForSave(
    page,
    b => b.items[0].data.cells[`${d.stages[1].id}:${d.lanes[0].id}`] === 'Interview customers',
    'Journey move',
  );
  await page.getByRole('button', { name: 'Move stage right: Discover' }).click();
  await waitForSave(page, b => b.items[0].data.stages[1].title === 'Discover', 'stage reorder');
  await page.getByRole('combobox', { name: 'Emotion: Discover', exact: true }).selectOption('2');
  await waitForSave(page, b => b.items[0].data.emotions[d.stages[0].id] === 2, 'emotion changed');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Actions: Consider', exact: true })).toHaveValue(
    'Interview customers',
  );
});
test('Ranking reorders directly with native drag and undo; controls pass accessibility scan', async ({ page }) => {
  await seed(page, fixture('ranking'));
  await fit(page);
  const before = (await savedBoard(page)).items[0].data,
    first = before.items[0].id,
    second = before.items[1].id;
  await item(page, 'w')
    .locator(`[data-rank="${second}"]`)
    .dragTo(item(page, 'w').locator(`[data-rank="${first}"]`), { sourcePosition: { x: 3, y: 3 } });
  await waitForSave(page, b => b.items[0].data.order[0] === second, 'Ranking move');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.order[0] === first, 'Ranking undo');
  expect(await axeViolations(page)).toEqual([]);
});
test('locked advanced widgets disable direct edits and dragging', async ({ page }) => {
  for (const kind of ['planner', 'journey', 'ranking']) {
    await seed(page, fixture(kind, true));
    await fit(page);
    const root = item(page, 'w');
    expect(await root.locator('[draggable="true"]').count()).toBe(0);
    for (const field of await root.locator('input,textarea,select').all()) await expect(field).toBeDisabled();
  }
});
