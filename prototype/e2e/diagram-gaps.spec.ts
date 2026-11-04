// Diagramming gaps: quick connect (E1), insert shape on a line (E2), crow's-foot heads (E3), extra labels (E4),
// Shift for 45-degree lines (E5), mind map collapse, colour, layout and outline export (E7, B14), and org chart
// team/location fields with CSV import and export (E8, B13).
import { readFile } from 'node:fs/promises';
import { test, expect, seed, item, fit, center, waitForSave, savedBoard } from './helpers';

const shapes = `const a={...m.createItem('rectangle',0,0,'#ffffff'),id:'a',text:'A'};
const b={...m.createItem('rectangle',600,0,'#ffffff'),id:'b',text:'B'};`;

test('"+" handle adds a connected copy on that side', async ({ page }) => {
  await seed(page, `${shapes} return {version:1,title:'Quick',items:[a]};`);
  await fit(page);
  await item(page, 'a').click();
  await page.locator('[data-quick-connect="bottom"]').click();
  await waitForSave(page, b => b.items.length === 3, 'connected copy');
  const board = await savedBoard(page);
  const copy = board.items.find(i => i.type === 'rectangle' && i.id !== 'a');
  const line = board.items.find(i => i.type === 'arrow');
  expect(copy.y).toBeGreaterThan(board.items.find(i => i.id === 'a').y);
  expect(line.from).toBe('a');
  expect(line.to).toBe(copy.id);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items.length === 1, 'undo copy');
});

test('connector: insert shape, crow foot heads and extra labels', async ({ page }) => {
  await seed(
    page,
    `${shapes} const c={...m.createItem('arrow',0,0),id:'c',from:'a',to:'b'}; return {version:1,title:'Line',items:[a,b,c]};`,
  );
  await fit(page);
  const mid = await center(item(page, 'c'));
  await page.mouse.click(mid.x, mid.y);
  await expect(page.getByRole('button', { name: 'Insert shape on line' })).toBeVisible();

  await page.getByLabel('End arrowhead').selectOption('many');
  await page.getByLabel('Start arrowhead').selectOption('one');
  await waitForSave(page, b => b.items.find(i => i.id === 'c').connector?.endHead === 'many', 'crow foot');
  await expect(item(page, 'c').locator('path[marker-end="url(#connector-head-many)"]')).toHaveCount(1);
  await expect(page.locator('marker#connector-head-one-many')).toHaveCount(1);

  await page.getByRole('button', { name: 'Connector details' }).click();
  await page.getByRole('button', { name: 'Add label' }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 'c').connector?.labels?.length === 1, 'label');
  const text = page.getByLabel('Extra label 1 text');
  await text.fill('1..*');
  await text.press('Enter');
  await waitForSave(page, b => b.items.find(i => i.id === 'c').connector.labels[0].text === '1..*', 'label text');
  await expect(item(page, 'c').locator('[data-connector-label]')).toContainText('1..*');
  await page.getByRole('button', { name: 'Close connector details' }).click();

  await page.getByRole('button', { name: 'Insert shape on line' }).click();
  await waitForSave(page, b => b.items.length === 5, 'split connector');
  const board = await savedBoard(page);
  const inserted = board.items.find(i => i.type === 'rectangle' && !['a', 'b'].includes(i.id));
  const second = board.items.find(i => i.type === 'arrow' && i.id !== 'c');
  expect(board.items.find(i => i.id === 'c').to).toBe(inserted.id);
  expect(second.from).toBe(inserted.id);
  expect(second.to).toBe('b');
});

test('Shift keeps a new line at 45-degree steps', async ({ page }) => {
  await seed(page, `return {version:1,title:'Empty',items:[]};`);
  const box = (await page.locator('svg.canvas').boundingBox())!;
  const x = box.x + box.width / 2 - 150,
    y = box.y + box.height / 2;
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('l');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(x + 100, y + 12, { steps: 4 });
  await page.mouse.move(x + 220, y + 25, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await waitForSave(page, b => b.items.some(i => i.type === 'arrow'), 'line');
  const line = (await savedBoard(page)).items.find(i => i.type === 'arrow');
  expect(Math.abs(line.h)).toBeLessThan(0.001);
  expect(line.w).toBeGreaterThan(100);
});

const mindFixture = `return {version:1,title:'Mind',items:[{...m.createItem('mindmap',0,0),id:'m',w:900,h:500,nodes:[
{id:'root',parent:null,text:'Root'},{id:'a',parent:'root',text:'Alpha'},{id:'c',parent:'a',text:'Child'},
{id:'b',parent:'root',text:'Beta'}]}]};`;

test('mind map topics collapse, take colours, change layout and export an outline', async ({ page }) => {
  await seed(page, mindFixture);
  await fit(page);
  await item(page, 'm').dblclick();
  await page.locator('[data-topic-toggle="a"]').click();
  await page.getByRole('button', { name: 'Topic colour Red' }).click();
  await page.keyboard.press('Escape');
  await waitForSave(page, b => b.items[0].nodes.find(n => n.id === 'a').collapsed === true, 'collapsed');
  const nodes = (await savedBoard(page)).items[0].nodes;
  expect(nodes.find(n => n.id === 'a').color).toBe('#e5484d');
  await expect(item(page, 'm').locator('[data-mind-topic="c"]')).toHaveCount(0);
  await expect(item(page, 'm').locator('.mind-collapsed-badge')).toContainText('+1');

  await item(page, 'm').click();
  await page.getByLabel('Mind map layout').selectOption('down');
  await waitForSave(page, b => b.items[0].data?.layout === 'down', 'layout');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export outline as Markdown' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Root.md');
  expect(await readFile((await file.path())!, 'utf8')).toBe('# Root\n\n- Alpha\n  - Child\n- Beta\n');
});

test('org chart keeps team and location and round-trips CSV', async ({ page }) => {
  await seed(
    page,
    `const o={...m.createItem('orgchart',0,0),id:'o',data:{nodes:[{id:'root',parent:null,name:'Director',role:'Lead',team:'Core',location:'Oslo'},{id:'x',parent:'root',name:'Alex',role:'Dev'}]}};return {version:1,title:'Org',items:[o]};`,
  );
  await fit(page);
  await expect(item(page, 'o').locator('.canvas-person-meta').first()).toHaveText('Core · Oslo');
  await item(page, 'o').locator('.rich-title span').first().click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const team = page.getByLabel('Person team');
  await expect(team).toHaveValue('Core');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const csv = await readFile((await (await download).path())!, 'utf8');
  expect(csv).toContain('Director,Lead,Core,Oslo,');

  await page.getByLabel('Org chart CSV file').setInputFiles({
    name: 'people.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Role,Team,Location,Manager\nRae,CEO,Exec,Rome,\nSam,CTO,Tech,Turin,Rae\n'),
  });
  await waitForSave(
    page,
    b => b.items[0].data.nodes.length === 2 && b.items[0].data.nodes.some(n => n.name === 'Sam' && n.team === 'Tech'),
    'imported',
  );
  const people = (await savedBoard(page)).items[0].data.nodes;
  expect(people.find(n => n.name === 'Sam').parent).toBe(people.find(n => n.name === 'Rae').id);
});
