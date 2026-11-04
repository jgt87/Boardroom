import { test, expect, seed, fit, item, waitForSave, savedBoard } from './helpers';

const fixture = (kind: string) => `return {version:1,title:'Record gaps',
items:[{...m.createItem('${kind}',0,0),id:'w',w:1250,h:700,datasetId:'d'}],
recordSchemas:{d:{statuses:['Not started','In progress','Complete'],fields:[
{id:'cost',name:'Cost',type:'number'},
{id:'done',name:'Done',type:'number',display:'progress',min:0,max:10},
{id:'double',name:'Double',type:'formula',formula:'{Cost} * 2'}],
columns:{'In progress':{color:'#fff4cc',limit:1}}}},
datasets:{d:[
{id:'a',title:'Alpha',status:'Not started',assignee:'Ann',start:'2026-01-05',end:'2026-01-09',values:{cost:2,done:5}},
{id:'b',title:'Beta',status:'In progress',assignee:'Bo',start:'2026-01-06',end:'2026-01-12',values:{cost:8}},
{id:'c',title:'Gamma',status:'In progress',assignee:'Ann',start:'2026-01-08',end:'2026-01-15',values:{cost:13}}]}};`;

test('Kanban swimlanes split cards by a second field and over-capacity columns are flagged', async ({ page }) => {
  await seed(page, fixture('kanban'));
  await fit(page);
  const w = item(page, 'w');
  // Capacity 1 with two cards in progress: the header is flagged.
  await expect(w.locator('[data-record-status="In progress"] .kanban-col-title')).toHaveAttribute(
    'data-over-capacity',
    'true',
  );
  await page.getByRole('combobox', { name: 'Swimlanes by' }).selectOption('assignee');
  await expect(w.locator('.kanban-lane')).toHaveCount(2);
  await expect(w.locator('.kanban-lane[data-lane="Ann"] [data-card]')).toHaveCount(2);
  await expect(w.locator('.kanban-lane[data-lane="Bo"] [data-card="b"]')).toBeVisible();
  await w.getByRole('button', { name: 'Add card to Complete in Bo lane' }).click();
  await waitForSave(
    page,
    b => b.datasets!.d.some(r => r.status === 'Complete' && r.assignee === 'Bo'),
    'card added in lane',
  );
  await w.getByRole('button', { name: 'Ann (2)' }).click();
  await expect(w.locator('.kanban-lane[data-lane="Ann"] [data-card]')).toHaveCount(0);
  await waitForSave(page, b => b.items[0].recordView?.hiddenGroups?.includes('Ann'), 'collapsed lane');
});

test('Table footer sum, progress bar, formula, saved view and child records', async ({ page }) => {
  await seed(page, fixture('table'));
  await fit(page);
  const w = item(page, 'w');
  // Progress bar and formula display.
  await expect(w.getByRole('progressbar', { name: 'Done progress' }).first()).toHaveAttribute('aria-valuenow', '5');
  await expect(w.locator('[data-record="c"] .record-formula-value')).toHaveText('26');
  // Footer sum over visible rows, then over a filtered subset.
  await w.getByRole('combobox', { name: 'Calculation: Cost' }).selectOption('sum');
  await expect(w.locator('[data-calc="cost"]')).toHaveText('23');
  await page.getByRole('searchbox', { name: 'Search records' }).fill('Ann');
  await expect(w.locator('[data-calc="cost"]')).toHaveText('15');
  await page.getByRole('searchbox', { name: 'Search records' }).fill('');
  await waitForSave(page, b => b.items[0].recordView?.calcs?.['field:cost'] === 'sum', 'calc saved');
  // Saved view: save a sort, change it, then switch back to the saved view.
  await page.getByRole('combobox', { name: 'Sort records by' }).selectOption('field:cost');
  await page.getByRole('button', { name: 'Sort direction' }).click();
  await page.getByRole('textbox', { name: 'New view name' }).fill('Most expensive');
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await waitForSave(page, b => b.recordSchemas!.d.views?.[0]?.name === 'Most expensive', 'view saved');
  await expect(w.locator('tbody [data-record]').first()).toHaveAttribute('data-record', 'c');
  await page.getByRole('combobox', { name: 'Sort records by' }).selectOption('');
  await expect(w.locator('tbody [data-record]').first()).toHaveAttribute('data-record', 'a');
  const viewId = (await savedBoard(page)).recordSchemas!.d.views[0].id;
  await page.getByRole('combobox', { name: 'Saved view' }).selectOption(viewId);
  await expect(w.locator('tbody [data-record]').first()).toHaveAttribute('data-record', 'c');
  await page.getByRole('combobox', { name: 'Sort records by' }).selectOption('');
  // Child record: add, indent shown, collapse hides it, and parent deletion keeps it.
  await w.getByRole('button', { name: 'Add child record: Alpha' }).click();
  await waitForSave(page, b => b.datasets!.d.some(r => r.parent === 'a'), 'child added');
  const childId = (await savedBoard(page)).datasets!.d.find(r => r.parent === 'a').id;
  await expect(w.locator(`[data-record="${childId}"]`)).toHaveAttribute('data-depth', '1');
  await w.getByRole('button', { name: 'Collapse child records: Alpha' }).click();
  await expect(w.locator(`[data-record="${childId}"]`)).toHaveCount(0);
  await w.getByRole('button', { name: 'Expand child records: Alpha' }).click();
  await w.getByRole('button', { name: 'Delete record: Alpha' }).click();
  await waitForSave(
    page,
    b => !b.datasets!.d.some(r => r.id === 'a') && b.datasets!.d.some(r => r.id === childId && !r.parent),
    'child re-parented',
  );
  await page.reload();
  expect((await savedBoard(page)).recordSchemas!.d.views.length).toBe(1);
});

test('Timeline groups rows under headings', async ({ page }) => {
  await seed(page, fixture('timeline'));
  await fit(page);
  const w = item(page, 'w');
  await page.getByRole('combobox', { name: 'Group records by' }).selectOption('assignee');
  await expect(w.locator('.timeline-group-heading')).toHaveCount(2);
  const order = await w
    .locator('.timeline-body > [data-timeline-group], .timeline-body > [data-record]')
    .evaluateAll(nodes =>
      nodes.map(n => (n as HTMLElement).dataset.timelineGroup ?? (n as HTMLElement).dataset.record),
    );
  expect(order).toEqual(['Ann', 'a', 'c', 'Bo', 'b']);
  await w.getByRole('button', { name: /Bo \(1\)/ }).click();
  await expect(w.locator('.timeline-body [data-record="b"]')).toHaveCount(0);
});
