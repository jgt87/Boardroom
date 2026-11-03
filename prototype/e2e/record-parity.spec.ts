import { test, expect, seed, fit, item, center, mouseDrag, waitForSave, savedBoard } from './helpers';

const fixture = (kind: string) => `const w={...m.createItem('${kind}',0,0),id:'w',w:850,h:450,datasetId:'d'};
return {version:1,title:'Record parity',items:[w,{...m.createItem('note',-350,100),id:'n',text:'Convert this idea'}],
datasets:{d:[{id:'r',title:'Existing record',status:'Not started',assignee:'',start:'',end:''}]}};`;

for (const kind of ['table', 'kanban', 'timeline']) {
  test(`sticky pointer drop copies into ${kind}, preserves source, undo and reload`, async ({ page }) => {
    await seed(page, fixture(kind));
    await fit(page);
    const before = await savedBoard(page);
    const target =
      kind === 'kanban'
        ? item(page, 'w').getByRole('button', { name: 'Add card to Complete' })
        : item(page, 'w').locator('.canvas-record-body');
    await mouseDrag(page, await center(item(page, 'n')), await center(target));
    await waitForSave(page, b => b.datasets!.d.length === 2, 'copied record');
    const after = await savedBoard(page);
    expect(after.items.find(i => i.id === 'n')).toEqual(before.items.find(i => i.id === 'n'));
    const added = after.datasets!.d.find(r => r.id !== 'r');
    expect(added.title).toBe('Convert this idea');
    if (kind === 'kanban') expect(added.status).toBe('Complete');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await waitForSave(page, b => b.datasets!.d.length === 1, 'undo copy');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await waitForSave(page, b => b.datasets!.d.length === 2, 'redo copy');
    await page.reload();
    expect((await savedBoard(page)).datasets!.d.length).toBe(2);
  });
}

test('record handles create synced cards; edits fan out and record deletion leaves blank cards', async ({ page }) => {
  await seed(page, fixture('table'));
  await fit(page);
  await page.getByRole('button', { name: 'Create synced card: Existing record', exact: true }).click();
  await waitForSave(page, b => b.items.some(i => i.recordRef), 'synced card');
  const c = (await savedBoard(page)).items.find(i => i.recordRef).id;
  await fit(page);
  const title = item(page, c).getByRole('textbox', { name: 'Card title: Existing record', exact: true });
  await title.fill('Updated from card');
  await title.press('Enter');
  await waitForSave(page, b => b.datasets!.d[0].title === 'Updated from card', 'reverse sync');
  const record = page.getByRole('textbox', { name: 'Record title: Updated from card', exact: true });
  await record.fill('Updated from table');
  await record.press('Enter');
  await waitForSave(page, b => b.items.find(i => i.id === c).text === 'Updated from table', 'forward sync');
  await page.reload();
  await page.getByRole('button', { name: 'Delete record: Updated from table' }).click();
  await waitForSave(
    page,
    b => b.datasets!.d.length === 0 && b.items.find(i => i.id === c).text === '',
    'blank deleted source',
  );
  await expect(item(page, c).getByLabel('Source record deleted')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(
    page,
    b => b.datasets!.d.length === 1 && b.items.find(i => i.id === c).text === 'Updated from table',
    'undo deletion',
  );
});

test('native handle drag creates a linked card on the canvas', async ({ page }) => {
  await seed(page, fixture('kanban'));
  await fit(page);
  const canvas = page.locator('svg.canvas');
  await page
    .getByRole('button', { name: 'Create synced card: Existing record' })
    .dragTo(canvas, { targetPosition: { x: 1050, y: 700 } });
  await waitForSave(page, b => b.items.some(i => i.recordRef?.recordId === 'r'), 'drag-out card');
});

test('undated Timeline record can be scheduled directly and undone', async ({ page }) => {
  await seed(page, fixture('timeline'));
  await fit(page);
  await page.getByRole('button', { name: 'Schedule record: Existing record' }).click();
  await waitForSave(
    page,
    b => !!b.datasets!.d[0].start && b.datasets!.d[0].start === b.datasets!.d[0].end,
    'scheduled',
  );
  await expect(item(page, 'w').locator('.timeline-bar')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.datasets!.d[0].start === '', 'undo schedule');
  await expect(page.getByRole('button', { name: 'Schedule record: Existing record' })).toBeVisible();
});

test('partial Timeline dates can be completed on canvas and locked records cannot create cards', async ({ page }) => {
  await seed(page, fixture('timeline').replace("start:'',end:''", "start:'',end:'2026-11-10'"));
  await fit(page);
  await page.getByRole('button', { name: 'Add missing start date: Existing record' }).click();
  await waitForSave(page, b => b.datasets!.d[0].start === '2026-11-10', 'complete partial date');
  await seed(page, fixture('table').replace("id:'w',w:850", "id:'w',locked:true,w:850"));
  await fit(page);
  await expect(page.getByRole('button', { name: 'Create synced card: Existing record' })).toHaveCount(0);
  await mouseDrag(page, await center(item(page, 'n')), await center(item(page, 'w').locator('.canvas-record-body')));
  await page.waitForTimeout(500);
  expect((await savedBoard(page)).datasets!.d.length).toBe(1);
});
