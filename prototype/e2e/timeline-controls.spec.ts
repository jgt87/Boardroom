import { test, expect, seed, item, fit, waitForSave, savedBoard, center, mouseDrag, axeViolations } from './helpers';
const fixture = `return {version:1,title:'Timeline controls',items:[{...m.createItem('timeline',0,0),id:'w',w:1100,h:650,datasetId:'d'}],datasets:{d:[
{id:'a',title:'Alpha',status:'Not started',assignee:'',start:'2026-11-03',end:'2026-11-06'},
{id:'b',title:'Beta',status:'Not started',assignee:'',start:'2026-11-08',end:'2026-11-10'},
{id:'c',title:'Gamma',status:'Complete',assignee:'',start:'2026-11-11',end:'2026-11-14'}]}};`;
test('Timeline scales and manual range persist; Autofit restores a fitted calendar', async ({ page }) => {
  await seed(page, fixture);
  await fit(page);
  await page.getByRole('combobox', { name: 'Timeline scale' }).selectOption('quarters');
  await expect(item(page, 'w').locator('.timeline-calendar')).toContainText('Q4 2026');
  await page.getByRole('combobox', { name: 'Timeline scale' }).selectOption('days');
  await page.getByLabel('Timeline range start', { exact: true }).fill('2026-01-01');
  await page.getByLabel('Timeline range end', { exact: true }).fill('2026-12-31');
  await waitForSave(page, b => b.items[0].recordView?.timeline?.end === '2026-12-31', 'range saved');
  expect(
    await item(page, 'w')
      .locator('.timeline-scroll')
      .evaluate(el => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await page.reload();
  await expect(page.getByLabel('Timeline range end', { exact: true })).toHaveValue('2026-12-31');
  await page.getByRole('button', { name: 'Autofit', exact: true }).click();
  await waitForSave(
    page,
    b => b.items[0].recordView.timeline.fit === true && !b.items[0].recordView.timeline.start,
    'Autofit',
  );
  expect(
    await item(page, 'w')
      .locator('.timeline-scroll')
      .evaluate(el => el.scrollWidth <= el.clientWidth + 2),
  ).toBe(true);
  expect(await axeViolations(page)).toEqual([]);
});
test('Timeline rows reorder natively and by keyboard without changing dates', async ({ page }) => {
  await seed(page, fixture);
  await fit(page);
  await page
    .getByRole('button', { name: 'Move Timeline row: Alpha', exact: true })
    .dragTo(page.getByRole('button', { name: 'Move Timeline row: Gamma', exact: true }));
  await waitForSave(page, b => b.datasets!.d.map(r => r.id).join(',') === 'b,a,c', 'row reordered');
  const handle = page.getByRole('button', { name: 'Move Timeline row: Alpha', exact: true });
  await handle.focus();
  await handle.press('Alt+ArrowUp');
  await waitForSave(page, b => b.datasets!.d[0].id === 'a', 'keyboard reorder');
  await expect(handle).toBeFocused();
  expect((await savedBoard(page)).datasets!.d[0].start).toBe('2026-11-03');
  await page
    .getByRole('button', { name: 'Move Timeline row: Alpha', exact: true })
    .dragTo(item(page, 'w').locator('.timeline-row-end'));
  await waitForSave(page, b => b.datasets!.d.at(-1).id === 'a', 'native move to end');
});
test('dragged Timeline dependencies validate cycles, cancel cleanly and appear in Table', async ({ page }) => {
  await seed(page, fixture);
  await fit(page);
  const bar = (id: string) => item(page, 'w').locator(`[data-record="${id}"] .timeline-bar`);
  await mouseDrag(
    page,
    await center(page.getByRole('button', { name: 'Connect dependency from Alpha', exact: true })),
    await center(bar('b')),
    12,
    async () => {
      await expect(item(page, 'w').locator('[data-dependency-preview]')).toHaveCount(1);
    },
  );
  await waitForSave(page, b => b.datasets!.d.find(r => r.id === 'b').dependsOn?.includes('a'), 'dependency created');
  await mouseDrag(
    page,
    await center(page.getByRole('button', { name: 'Connect dependency from Beta', exact: true })),
    await center(bar('a')),
  );
  await expect(item(page, 'w').getByRole('status')).toContainText('cycle');
  expect((await savedBoard(page)).datasets!.d.find(r => r.id === 'a').dependsOn).toBeUndefined();
  await mouseDrag(
    page,
    await center(page.getByRole('button', { name: 'Connect dependency from Alpha', exact: true })),
    await center(bar('c')),
    12,
    async () => {
      await page.keyboard.press('Escape');
    },
  );
  expect((await savedBoard(page)).datasets!.d.find(r => r.id === 'c').dependsOn).toBeUndefined();
  await page.getByRole('button', { name: 'Layout: Timeline' }).click();
  await page.getByRole('menuitemradio', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Blocked by', exact: true })).toBeVisible();
  await expect(item(page, 'w').locator('[data-record="b"]')).toContainText('Alpha');
});
