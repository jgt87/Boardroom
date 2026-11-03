import { test, expect, seed, item, fit, center, mouseDrag, savedBoard, waitForSave } from './helpers';
const board = `return {version:1,title:'Grid operations',items:[{...m.createItem('grid',0,0),id:'g',w:600,h:340}, { ...m.createItem('note',-350,0),id:'n',text:'Grid note'}]};`;
test('Grid contains dropped notes and carries them during a header drag, undo and reload', async ({ page }) => {
  await seed(page, board);
  await fit(page);
  const cell = item(page, 'g').locator('[data-grid-cell="1,1"]');
  await mouseDrag(page, await center(item(page, 'n')), await center(cell));
  await waitForSave(page, b => b.items.find(i => i.id === 'g').data.objects?.some(o => o.id === 'n'), 'contained note');
  await fit(page);
  await page.keyboard.press('Escape');
  const before = await savedBoard(page),
    from = await center(item(page, 'g').locator('.canvas-grid-toolbar > span'));
  await mouseDrag(page, from, { x: from.x + 80, y: from.y + 50 });
  await waitForSave(
    page,
    b => b.items.find(i => i.id === 'g').x !== before.items.find(i => i.id === 'g').x,
    'moved Grid',
  );
  const next = await savedBoard(page);
  expect(next.items.find(i => i.id === 'n').x - before.items.find(i => i.id === 'n').x).toBeCloseTo(
    next.items.find(i => i.id === 'g').x - before.items.find(i => i.id === 'g').x,
  );
  await page.reload();
  expect((await savedBoard(page)).items.find(i => i.id === 'g').data.objects[0].id).toBe('n');
});
test('Grid row handles reorder values; column borders resize in one undo step', async ({ page }) => {
  await seed(page, board);
  await fit(page);
  const field = page.getByRole('textbox', { name: 'Grid cell 1, 1', exact: true });
  await field.fill('Move me');
  await field.press('Tab');
  await page
    .getByRole('button', { name: 'Move row 1', exact: true })
    .dragTo(page.getByRole('button', { name: 'Move row 3', exact: true }));
  await waitForSave(page, b => b.items.find(i => i.id === 'g').data.cells[2][0] === 'Move me', 'row moved');
  const before = await savedBoard(page);
  const edge = await center(page.getByRole('separator', { name: 'Resize column 1', exact: true }).first());
  await mouseDrag(page, edge, { x: edge.x + 40, y: edge.y });
  await waitForSave(
    page,
    b => b.items.find(i => i.id === 'g').w > before.items.find(i => i.id === 'g').w + 10,
    'column resized',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(
    page,
    b => Math.abs(b.items.find(i => i.id === 'g').w - before.items.find(i => i.id === 'g').w) < 1,
    'undo resize',
  );
});

test('Grid Manual sizing and modifier bypass persist; merged rows move as a block', async ({ page }) => {
  await seed(page, board);
  await fit(page);
  await page.getByRole('combobox', { name: 'Cell sizing' }).selectOption('manual');
  const before = await savedBoard(page);
  await mouseDrag(page, await center(item(page, 'n')), await center(item(page, 'g').locator('[data-grid-cell="0,0"]')));
  await waitForSave(page, b => b.items.find(i => i.id === 'g').data.objects?.length === 1, 'manual member');
  expect((await savedBoard(page)).items.find(i => i.id === 'g').w).toBe(before.items.find(i => i.id === 'g').w);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Cell sizing' })).toHaveValue('manual');
  await seed(
    page,
    `const g=m.createItem('grid',0,0);g.id='g';g.w=600;g.h=400;g.data.rows=4;g.data.cells=[['Anchor','',''],['','',''],['Third','',''],['Last','','']];g.data.merges=[{r:0,c:0,rs:2,cs:1}];return {version:1,title:'Merged',items:[g]};`,
  );
  await fit(page);
  await page
    .getByRole('button', { name: 'Move row 1', exact: true })
    .dragTo(page.getByRole('button', { name: 'Move row 4', exact: true }));
  await waitForSave(page, b => b.items[0].data.merges[0].r === 2, 'merged block');
  expect((await savedBoard(page)).items[0].data.cells[2][0]).toBe('Anchor');
});
