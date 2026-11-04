import { test, expect, seed, item, waitForSave, savedBoard, fit, mouseDrag, center, openApp } from './helpers';

test('sticky select-and-type and Alt-drag duplicate are undoable', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Sticky',items:[{...m.createItem('note',200,200),id:'n',text:'Original'}]};`,
  );
  await item(page, 'n').click();
  await page.keyboard.type('Hello');
  await expect(page.getByRole('textbox', { name: 'Edit object text' })).toHaveValue('Hello');
  await page.keyboard.press('Control+Enter');
  await waitForSave(page, b => b.items[0].text === 'Hello', 'typed');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items[0].text === 'Original', 'undo');
  const before = await savedBoard(page),
    p = await center(item(page, 'n'));
  await page.keyboard.down('Alt');
  await mouseDrag(page, p, { x: p.x + 110, y: p.y + 60 });
  await page.keyboard.up('Alt');
  await waitForSave(page, b => b.items.length === 2, 'duplicate');
  expect((await savedBoard(page)).items.find(i => i.id === 'n').x).toBe(before.items[0].x);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items.length === 1, 'undo duplicate');
});

const records = `const w={...m.createItem(KIND,0,0),id:'w',datasetId:'d'};return {version:1,title:'Records',items:[w],datasets:{d:Array.from({length:12},(_,k)=>({id:'r'+k,title:'Task '+k,status:'Not started',assignee:'',start:'2026-11-03',end:'2026-11-06'}))}};`;
test('Kanban cards move and titles edit directly on canvas; all cards are reachable', async ({ page }) => {
  await seed(page, records.replace('KIND', "'kanban'"));
  await fit(page);
  const root = item(page, 'w');
  expect(await root.locator('.record-card').count()).toBe(12);
  const before = await savedBoard(page);
  await root
    .locator('[data-card="r0"]')
    .dragTo(root.locator('section[aria-label="Complete column"]'), { sourcePosition: { x: 5, y: 5 } });
  await waitForSave(
    page,
    b => b.datasets!.d[0].status === 'Complete' || b.datasets!.d.find(r => r.id === 'r0').status === 'Complete',
    'card moved',
  );
  expect((await savedBoard(page)).items[0].x).toBe(before.items[0].x);
  const title = page.getByRole('textbox', { name: 'Card title: Task 0', exact: true });
  await title.fill('Revised');
  await title.press('Enter');
  await waitForSave(page, b => b.datasets!.d.find(r => r.id === 'r0').title === 'Revised', 'title');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Card title: Revised', exact: true })).toBeVisible();
});
test('Table and Grid edit cells on canvas without a dialog', async ({ page }) => {
  await seed(page, records.replace('KIND', "'table'"));
  await fit(page);
  expect(await item(page, 'w').locator('tbody tr').count()).toBe(12);
  const title = page.getByRole('textbox', { name: 'Record title: Task 0', exact: true });
  await title.fill('Inline table');
  await title.press('Enter');
  await waitForSave(page, b => b.datasets!.d[0].title === 'Inline table', 'table');
  expect(await page.getByRole('dialog').count()).toBe(0);
  await seed(page, `return {version:1,title:'Grid',items:[{...m.createItem('grid',0,0),id:'g'}]};`);
  await fit(page);
  const cell = page.getByRole('textbox', { name: 'Grid cell 1, 1', exact: true });
  await cell.fill('Cell one');
  await cell.press('Tab');
  await waitForSave(page, b => b.items[0].data.cells[0][0] === 'Cell one', 'grid');
  await expect(page.getByRole('textbox', { name: 'Grid cell 1, 2', exact: true })).toBeFocused();
});
test('Timeline bar move and endpoint resizing change dates, not widget position', async ({ page }) => {
  await seed(page, records.replace('KIND', "'timeline'"));
  await fit(page);
  const before = await savedBoard(page),
    bar = item(page, 'w').locator('.timeline-bar').first(),
    p = await center(bar);
  await mouseDrag(page, p, { x: p.x + 150, y: p.y });
  await waitForSave(page, b => b.datasets!.d[0].start !== before.datasets!.d[0].start, 'schedule');
  expect((await savedBoard(page)).items[0].x).toBe(before.items[0].x);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.datasets!.d[0].start === before.datasets!.d[0].start, 'undo schedule');
  const end = await center(item(page, 'w').locator('.timeline-bar').first().locator('[data-time-handle="end"]'));
  await mouseDrag(page, end, { x: end.x + 150, y: end.y });
  await waitForSave(page, b => b.datasets!.d[0].end !== before.datasets!.d[0].end, 'resize');
});
test('Mind-map double-click edits inline and Shift+Enter preserves node count', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Mind map',items:[{...m.createItem('mindmap',0,0),id:'m',nodes:[{id:'root',parent:null,text:'Topic'}]}]};`,
  );
  await fit(page);
  await item(page, 'm').dblclick();
  const input = page.locator('.mind-canvas-input');
  await expect(input).toBeVisible();
  await input.fill('First');
  await input.press('End');
  await input.press('Shift+Enter');
  await input.press('S');
  await input.press('Escape');
  await waitForSave(page, b => b.items[0].nodes.length === 1 && b.items[0].nodes[0].text.includes('\n'), 'multiline');
});
test('Org chart and story map have editable child objects on canvas', async ({ page }) => {
  await seed(page, `return {version:1,title:'Org',items:[{...m.createItem('orgchart',0,0),id:'o'}]};`);
  await fit(page);
  const person = page.getByRole('textbox', { name: /^Person name:/ }).first();
  await person.fill('Alex');
  await person.press('Enter');
  await waitForSave(page, b => b.items[0].data.nodes[0].name === 'Alex', 'person');
  await seed(page, `return {version:1,title:'Story',items:[{...m.createItem('storymap',0,0),id:'s'}]};`);
  await fit(page);
  const story = page.getByRole('textbox', { name: /^Story:/ }).first();
  await story.fill('Inline story');
  await story.press('Control+Enter');
  await waitForSave(page, b => b.items[0].data.cards.some(c => c.title === 'Inline story'), 'story');
});

test('Org chart reparent and story-map card moves use native canvas drags', async ({ page }) => {
  await seed(
    page,
    `const o={...m.createItem('orgchart',0,0),id:'o',data:{nodes:[{id:'root',parent:null,name:'Director',role:''},{id:'a',parent:'root',name:'Alex',role:''},{id:'b',parent:'root',name:'Blair',role:''}]}};return {version:1,title:'Org drag',items:[o]};`,
  );
  await fit(page);
  await page.locator('[data-person="a"]').dragTo(page.locator('[data-person="b"]'), { sourcePosition: { x: 4, y: 4 } });
  await waitForSave(page, b => b.items[0].data.nodes.find(n => n.id === 'a').parent === 'b', 'reparent');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.nodes.find(n => n.id === 'a').parent === 'root', 'undo reparent');
  await seed(
    page,
    `const s={...m.createItem('storymap',0,0),id:'s',data:{activities:[{id:'a',title:'Explore'},{id:'b',title:'Deliver'}],releases:[{id:'r1',title:'Now'},{id:'r2',title:'Next'}],cards:[{id:'c',title:'Build',activity:'a',release:'r1'}]}};return {version:1,title:'Story drag',items:[s]};`,
  );
  await fit(page);
  await page
    .locator('[data-story="c"]')
    .dragTo(page.locator('.canvas-story-cell[aria-label="Deliver / Next"]'), { sourcePosition: { x: 4, y: 4 } });
  await waitForSave(
    page,
    b => b.items[0].data.cards[0].activity === 'b' && b.items[0].data.cards[0].release === 'r2',
    'story move',
  );
});

test('Canvas record controls respect locking and keep their coordinates at another zoom', async ({ page }) => {
  await seed(page, records.replace('KIND', "'kanban'"));
  await fit(page);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  const before = await savedBoard(page);
  await item(page, 'w')
    .locator('[data-card="r0"]')
    .dragTo(item(page, 'w').locator('section[aria-label="In progress column"]'), { sourcePosition: { x: 4, y: 4 } });
  await waitForSave(page, b => b.datasets!.d.find(r => r.id === 'r0').status === 'In progress', 'zoom drag');
  expect((await savedBoard(page)).items[0].x).toBe(before.items[0].x);
  await seed(page, records.replace('KIND', "'kanban'").replace("id:'w',datasetId", "id:'w',locked:true,datasetId"));
  await fit(page);
  expect(await item(page, 'w').locator('.record-card[draggable="true"]').count()).toBe(0);
  const p = await center(item(page, 'w').locator('.rich-title'));
  await mouseDrag(page, p, { x: p.x + 90, y: p.y + 60 });
  expect((await savedBoard(page)).items[0].x).toBe(0);
});
test('Doc edits formatted content on canvas and survives reload', async ({ page }) => {
  await seed(page, `return {version:1,title:'Doc',items:[{...m.createItem('doc',0,0),id:'d'}]};`);
  await fit(page);
  const doc = page.getByRole('textbox', { name: 'Document content' });
  await doc.fill('Inline document');
  await doc.press('Control+Enter');
  await waitForSave(page, b => b.items[0].data.markdown.includes('Inline document'), 'doc');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Document content' })).toContainText('Inline document');
});
test('Formats menu ordering, diagram submenu, placement and Escape cancellation', async ({ page }) => {
  await seed(page, `return {version:1,title:'Placement',items:[]};`);
  await page.getByRole('button', { name: 'Formats and Flows', exact: true }).click();
  const menu = page.locator('.formats-menu');
  const names = await menu.locator('.gallery-items strong').allTextContents();
  expect(names.slice(0, 5)).toEqual(['Prototype', 'Diagram', 'Table', 'Timeline', 'Kanban']);
  await menu.getByRole('button', { name: 'Diagram', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'Build with Mermaid code', exact: true })).toBeVisible();
  await menu.getByRole('button', { name: 'Back', exact: true }).click();
  await menu.getByRole('button', { name: 'Kanban', exact: true }).click();
  expect((await savedBoard(page)).items.length).toBe(0);
  await page.locator('svg.canvas').click({ position: { x: 650, y: 350 } });
  await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'kanban', 'placed');
  expect(await page.getByRole('dialog').count()).toBe(0);
  await page.getByRole('button', { name: 'Formats and Flows', exact: true }).click();
  await page.locator('.formats-menu').getByRole('button', { name: 'Table', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('svg.canvas').click({ position: { x: 1000, y: 700 } });
  expect((await savedBoard(page)).items.length).toBe(1);
});

test('the Select button toggles between Select and Pan without opening a menu', async ({ page }) => {
  await openApp(page);
  const rail = page.getByRole('navigation', { name: 'Creation tools' });
  await rail.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(rail.getByRole('button', { name: 'Pan', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('complementary', { name: 'Selection tools' })).toHaveCount(0);
  await rail.getByRole('button', { name: 'Pan', exact: true }).click();
  await expect(rail.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('top-right action buttons share one height', async ({ page }) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openApp(page);
    const heights = await page
      .locator('.document-actions button')
      .evaluateAll(els =>
        els.filter(e => e.getBoundingClientRect().width > 0).map(e => e.getBoundingClientRect().height),
      );
    expect(heights.length).toBeGreaterThan(4);
    expect(new Set(heights).size, `heights at ${viewport.width}px: ${heights}`).toBe(1);
  }
});
