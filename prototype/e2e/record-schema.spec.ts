import { test, expect, seed, item, fit, waitForSave, savedBoard, axeViolations } from './helpers';
const board = `return {version:1,title:'Custom records',items:[{...m.createItem('table',0,0),id:'w',w:1000,h:600,datasetId:'d'}],datasets:{d:[{id:'r',title:'Ship release',status:'Not started',assignee:'',start:'',end:''}]}};`;
test('custom fields and renamed statuses work across layouts, synced cards, undo and reload', async ({ page }) => {
  await seed(page, board);
  await fit(page);
  await item(page, 'w').locator('.record-fields > summary').click();
  const status = page.getByRole('textbox', { name: 'Rename status: Not started', exact: true });
  await status.fill('Ready');
  await status.press('Enter');
  await waitForSave(page, b => b.datasets!.d[0].status === 'Ready', 'renamed status');
  await page.getByRole('textbox', { name: 'New field name' }).fill('Effort');
  await page.getByRole('combobox', { name: 'Field type', exact: true }).selectOption('number');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  expect(await axeViolations(page)).toEqual([]);
  await item(page, 'w').locator('.record-fields > summary').click();
  await page.getByRole('spinbutton', { name: 'Effort: Ship release' }).fill('5');
  await waitForSave(page, b => Object.values(b.datasets!.d[0].values ?? {}).includes(5), 'typed value');
  await page.getByRole('button', { name: 'Create synced card: Ship release' }).click();
  await waitForSave(page, b => b.items.some(i => i.recordRef), 'created synced card');
  await fit(page);
  const c = (await savedBoard(page)).items.find(i => i.recordRef).id;
  await item(page, c).getByRole('spinbutton', { name: 'Effort: Ship release' }).fill('8');
  await waitForSave(page, b => Object.values(b.datasets!.d[0].values ?? {}).includes(8), 'card custom field');
  await item(page, 'w').getByRole('button', { name: 'Layout: Table', exact: true }).click();
  await item(page, 'w').getByRole('menuitemradio', { name: 'Kanban', exact: true }).click();
  await expect(item(page, 'w').getByRole('button', { name: 'Add card to Ready' })).toBeVisible();
  await page.reload();
  await expect(item(page, c).getByRole('spinbutton', { name: 'Effort: Ship release' })).toHaveValue('8');
});

test('single-select fields can group Kanban cards and column drag changes their field', async ({ page }) => {
  await seed(page, board);
  await fit(page);
  await item(page, 'w').locator('.record-fields > summary').click();
  await page.getByRole('textbox', { name: 'New field name' }).fill('Priority');
  await page.getByRole('combobox', { name: 'Field type', exact: true }).selectOption('select');
  await page.getByLabel('Options (comma separated)').fill('High, Low');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await item(page, 'w').locator('.record-fields > summary').click();
  await page.getByRole('combobox', { name: 'Priority: Ship release' }).selectOption('High');
  await waitForSave(page, b => Object.values(b.datasets!.d[0].values ?? {}).includes('High'), 'priority saved');
  await item(page, 'w').getByRole('button', { name: 'Layout: Table', exact: true }).click();
  await item(page, 'w').getByRole('menuitemradio', { name: 'Kanban', exact: true }).click();
  const field = Object.keys((await savedBoard(page)).datasets!.d[0].values)[0];
  await page.getByRole('combobox', { name: 'Kanban column field' }).selectOption(field);
  await item(page, 'w')
    .locator('[data-card="r"]')
    .dragTo(item(page, 'w').getByRole('region', { name: 'Low column' }), { sourcePosition: { x: 5, y: 5 } });
  await waitForSave(page, b => b.datasets!.d[0].values[field] === 'Low', 'group drag');
  expect((await savedBoard(page)).datasets!.d[0].status).toBe('Not started');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.datasets!.d[0].values[field] === 'High', 'undo grouped move');
});
