import { test, expect, seed, fit, item, savedBoard, waitForSave, axeViolations } from './helpers';

test('new record tools create independent entities while layout switching keeps one dataset', async ({ page }) => {
  await seed(page, 'return {...m.newBoard(),items:[]};');
  for (const [index, kind] of ['Kanban', 'Table', 'Timeline'].entries()) {
    await page.getByRole('button', { name: 'Formats and Flows', exact: true }).click();
    await page.locator('.formats-menu').getByRole('button', { name: kind, exact: true }).click();
    const point = [
      { x: 220, y: 180 },
      { x: 220, y: 760 },
      { x: 1190, y: 180 },
    ][index];
    await page.mouse.click(point.x, point.y);
    await waitForSave(page, b => b.items.length === index + 1, `new ${kind}`);
  }
  const before = await savedBoard(page);
  expect(new Set(before.items.map(i => i.id)).size).toBe(3);
  expect(new Set(before.items.map(i => i.datasetId)).size).toBe(3);
  expect(Object.keys(before.datasets!).length).toBe(3);
  await fit(page);
  await page.keyboard.press('Escape');
  const kanban = before.items.find(i => i.type === 'kanban');
  const layout = item(page, kanban.id).getByRole('button', { name: 'Layout: Kanban', exact: true });
  await expect(item(page, kanban.id).getByRole('button', { name: 'Table', exact: true })).toHaveCount(0);
  await layout.click();
  const menu = item(page, kanban.id).getByRole('menu', { name: 'Record layouts' });
  expect(await axeViolations(page)).toEqual([]);
  await expect(menu.getByRole('menuitemradio', { name: 'Kanban', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitemradio', { name: 'Table', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(layout).toBeFocused();
  await layout.click();
  await menu.getByRole('menuitemradio', { name: 'Table', exact: true }).click();
  await waitForSave(page, b => b.items.find(i => i.id === kanban.id).type === 'table', 'layout switched');
  const after = await savedBoard(page);
  expect(after.items.length).toBe(3);
  expect(after.items.find(i => i.id === kanban.id).datasetId).toBe(kanban.datasetId);
  expect(after.datasets).toEqual(before.datasets);
  expect(after.items.filter(i => i.id !== kanban.id)).toEqual(before.items.filter(i => i.id !== kanban.id));
});

test('layout menu dismisses on outside click and stays disabled for locked record widgets', async ({ page }) => {
  const body = `return {version:1,title:'Layout menu',items:[{...m.createItem('table',0,0),id:'w',datasetId:'d'}],datasets:{d:[]}};`;
  await seed(page, body);
  await fit(page);
  await page.getByRole('button', { name: 'Layout: Table' }).click();
  await expect(page.getByRole('menu', { name: 'Record layouts' })).toBeVisible();
  await page.mouse.click(1200, 800);
  await expect(page.getByRole('menu', { name: 'Record layouts' })).toHaveCount(0);
  await seed(page, body.replace("id:'w'", "id:'w',locked:true"));
  await fit(page);
  await expect(page.getByRole('button', { name: 'Layout: Table' })).toBeDisabled();
});
