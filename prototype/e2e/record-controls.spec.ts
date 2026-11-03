import { test, expect, seed, item, fit, waitForSave, savedBoard } from './helpers';
const fixture = `return {version:1,title:'Record controls',items:[{...m.createItem('table',0,0),id:'w',w:1100,h:650,datasetId:'d'}],
recordSchemas:{d:{statuses:['Not started','In progress','Complete'],fields:[{id:'cost',name:'Cost',type:'number'}]}},datasets:{d:[
{id:'a',title:'Alpha',status:'Not started',assignee:'Alex',start:'',end:'',values:{cost:2}},
{id:'b',title:'Beta',status:'In progress',assignee:'Blair',start:'',end:'',values:{cost:8}},
{id:'c',title:'Gamma',status:'Complete',assignee:'Casey',start:'',end:'',values:{cost:10}},
{id:'d',title:'Alpha two',status:'Not started',assignee:'',start:'',end:'',values:{cost:3}}]}};`;
test('search and bulk actions affect only visible selection, with grouping and saved sort', async ({ page }) => {
  await seed(page, fixture);
  await fit(page);
  await page.getByRole('searchbox', { name: 'Search records' }).fill('Alpha');
  await expect(item(page, 'w').locator('tbody [data-record]')).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Select all visible records' }).check();
  await page.getByRole('combobox', { name: 'Set selected status' }).selectOption('Complete');
  await waitForSave(
    page,
    b =>
      b.datasets!.d.find(r => r.id === 'a').status === 'Complete' &&
      b.datasets!.d.find(r => r.id === 'd').status === 'Complete',
    'bulk edit',
  );
  expect((await savedBoard(page)).datasets!.d.find(r => r.id === 'b').status).toBe('In progress');
  await page.getByRole('searchbox', { name: 'Search records' }).fill('');
  await page.getByRole('combobox', { name: 'Sort records by' }).selectOption('title');
  await page.getByRole('button', { name: 'Sort direction' }).click();
  await page.getByRole('combobox', { name: 'Group records by' }).selectOption('status');
  await page.getByRole('button', { name: 'Complete (3)', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select all visible records' }).check();
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await waitForSave(
    page,
    b => b.datasets!.d.length === 3 && b.datasets!.d.every(r => r.status === 'Complete'),
    'hidden records retained',
  );
  await page.reload();
  expect((await savedBoard(page)).items[0].recordView.sort.direction).toBe('desc');
});
test('typed filters persist and filtered Timeline edits do not discard hidden rows', async ({ page }) => {
  await seed(page, fixture);
  await fit(page);
  await item(page, 'w').locator('.record-query-details summary').click();
  await page.getByRole('button', { name: '+ Filter', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter field 1' }).selectOption('field:cost');
  await page.getByRole('combobox', { name: 'Filter operator 1' }).selectOption('gt');
  const value = page.getByRole('textbox', { name: 'Filter value 1' });
  await value.fill('5');
  await value.press('Enter');
  await item(page, 'w').locator('.record-query-details summary').click();
  await expect(item(page, 'w').locator('tbody [data-record]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Layout: Table' }).click();
  await page.getByRole('menuitemradio', { name: 'Timeline', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Timeline title: Beta', exact: true });
  await title.fill('Revised Beta');
  await title.press('Enter');
  await waitForSave(
    page,
    b => b.datasets!.d.length === 4 && b.datasets!.d.find(r => r.id === 'b').title === 'Revised Beta',
    'filtered edit',
  );
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Timeline title: Alpha', exact: true })).toHaveCount(0);
});
test('dragging a Table record into a group updates its grouping field in one undo step', async ({ page }) => {
  await seed(page, fixture);
  await fit(page);
  await page.getByRole('combobox', { name: 'Group records by' }).selectOption('status');
  await page
    .getByRole('button', { name: 'Create synced card: Alpha', exact: true })
    .dragTo(item(page, 'w').locator('.record-group-heading').filter({ hasText: 'Complete' }));
  await waitForSave(page, b => b.datasets!.d.find(r => r.id === 'a').status === 'Complete', 'group drop');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.datasets!.d.find(r => r.id === 'a').status === 'Not started', 'undo group drop');
});
