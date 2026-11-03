import { test, expect, seed, item, fit, center, mouseDrag, waitForSave, savedBoard } from './helpers';
const fixture = (
  auto: boolean,
) => `return {version:1,title:'Manual map',items:[{...m.createItem('mindmap',0,0),id:'m',w:900,h:500,data:{autoLayout:${auto}},nodes:[
{id:'root',parent:null,text:'Root',position:{x:0,y:80}}, {id:'a',parent:'root',text:'Alpha',position:{x:210,y:0}},
{id:'b',parent:'root',text:'Beta',position:{x:210,y:160}}, {id:'c',parent:'a',text:'Child',position:{x:420,y:0}}]}]};`;
test('manual branch drag preserves parent and descendants through undo and reload', async ({ page }) => {
  await seed(page, fixture(false));
  await fit(page);
  await item(page, 'm').dblclick();
  const from = await center(page.locator('[data-topic-handle="a"]'));
  await page.keyboard.down('Control');
  await mouseDrag(page, from, { x: from.x + 60, y: from.y + 60 });
  await page.keyboard.up('Control');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => b.items[0].nodes.find(n => n.id === 'a').position.x !== 210, 'manual position');
  const after = await savedBoard(page),
    a = after.items[0].nodes.find(n => n.id === 'a'),
    c = after.items[0].nodes.find(n => n.id === 'c');
  expect(a.parent).toBe('root');
  expect(c.parent).toBe('a');
  expect(c.position.x - a.position.x).toBeCloseTo(210);
  await page.reload();
  expect((await savedBoard(page)).items[0].nodes.find(n => n.id === 'a').position).toEqual(a.position);
});
test('automatic branch reassignment shows target feedback and prevents cycles', async ({ page }) => {
  await seed(page, fixture(true));
  await fit(page);
  await item(page, 'm').dblclick();
  const from = await center(page.locator('[data-topic-handle="c"]'));
  const to = await center(page.locator('[data-topic="b"] rect'));
  await mouseDrag(page, from, to, 12, async () => {
    await expect(page.getByRole('status')).toHaveText('Attach to Beta');
    await expect(page.locator('[data-topic="b"] rect')).toHaveAttribute('stroke-dasharray', '5 3');
  });
  await page.keyboard.press('Escape');
  await waitForSave(page, b => b.items[0].nodes.find(n => n.id === 'c').parent === 'b', 'reassigned branch');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items[0].nodes.find(n => n.id === 'c').parent === 'a', 'undo branch');
});

test('auto layout toggles through toolbar and an Escape-cancelled drag leaves nodes unchanged', async ({ page }) => {
  await seed(page, fixture(true));
  await fit(page);
  await item(page, 'm').click();
  await page.getByRole('button', { name: 'Mind map auto layout' }).click();
  await waitForSave(
    page,
    b => b.items[0].data.autoLayout === false && b.items[0].nodes.every(n => n.position),
    'manual mode',
  );
  const before = (await savedBoard(page)).items[0].nodes;
  await item(page, 'm').dblclick();
  const from = await center(page.locator('[data-topic-handle="a"]'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mind-canvas-input')).toHaveCount(0);
  expect((await savedBoard(page)).items[0].nodes).toEqual(before);
});

test('manual map grows after an outer branch move without rescaling untouched topics', async ({ page }) => {
  await seed(page, fixture(false));
  await fit(page);
  await item(page, 'm').dblclick();
  const untouched = page.locator('[data-topic="b"] rect');
  const before = await untouched.boundingBox();
  const from = await center(page.locator('[data-topic-handle="a"]'));
  await page.keyboard.down('Control');
  await mouseDrag(page, from, { x: from.x - 180, y: from.y + 180 });
  await page.keyboard.up('Control');
  const during = await untouched.boundingBox();
  expect(during.x).toBeCloseTo(before.x, 0);
  expect(during.width).toBeCloseTo(before.width, 0);
  await page.keyboard.press('Escape');
  await waitForSave(page, b => !!b.items[0].data.manualViewport, 'manual viewport saved');
  const saved = (await savedBoard(page)).items[0];
  expect(saved.w).toBeGreaterThan(900);
  await item(page, 'm').dblclick();
  const after = await untouched.boundingBox();
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.width).toBeCloseTo(before.width, 0);
  await page.keyboard.press('Escape');
  await page.reload();
  expect((await savedBoard(page)).items[0].data.manualViewport).toEqual(saved.data.manualViewport);
});
