// Track R2-H: draggable and styled connector labels, callout tails attached to objects, diagram templates,
// org chart custom fields, Timeline drop dates and draw.io files imported as native shapes.
import { test, expect, seed, item, fit, center, waitForSave, savedBoard, mouseDrag, openTools } from './helpers';

const shapes = `const a={...m.createItem('rectangle',0,0,'#ffffff'),id:'a',text:'A'};
const b={...m.createItem('rectangle',700,0,'#ffffff'),id:'b',text:'B'};`;

test('extra connector labels drag along the line and take a colour and size', async ({ page }) => {
  await seed(
    page,
    `${shapes} const c={...m.createItem('arrow',0,0),id:'c',from:'a',to:'b',text:'Main',
      connector:{labels:[{id:'x',text:'Extra',at:0.25}]}}; return {version:1,title:'Labels',items:[a,b,c]};`,
  );
  await fit(page);
  const line = item(page, 'c');
  const main = await center(line.locator('[data-caption="c"]'));
  // Select the connector by clicking its line between the labels.
  const extra = await center(line.locator('[data-label-drag="x"]'));
  await page.mouse.click((main.x + extra.x) / 2 + 30, main.y);
  await expect(page.getByRole('button', { name: 'Connector details' })).toBeVisible();
  const from = await center(line.locator('[data-label-drag="x"]'));
  await mouseDrag(page, from, { x: from.x + (main.x - from.x) * 2.2, y: from.y });
  await waitForSave(page, b => b.items.find(i => i.id === 'c').connector.labels[0].at > 0.6, 'label dragged');
  // One undo step puts it back.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 'c').connector.labels[0].at === 0.25, 'label undo');

  await page.getByRole('button', { name: 'Connector details' }).click();
  await page.getByLabel('Extra label 1 colour').selectOption({ label: 'Red' });
  await page.getByLabel('Extra label 1 size').selectOption('20');
  await page.getByLabel('Main label size').selectOption('18');
  await waitForSave(
    page,
    b => {
      const c = b.items.find(i => i.id === 'c').connector;
      return c.labels[0].color === '#d1242f' && c.labels[0].size === 20 && c.labelSize === 18;
    },
    'label styles',
  );
  await expect(line.locator('[data-connector-label="x"] div')).toHaveCSS('font-size', '20px');
  await expect(line.locator('[data-connector-label="x"] div')).toHaveCSS('color', 'rgb(209, 36, 47)');
});

test('a callout tail attaches to an object, follows it and resets', async ({ page }) => {
  await seed(
    page,
    `const c={...m.createItem('callout',0,0,'#fff49b'),id:'c',text:'Look here'};
     const t={...m.createItem('rectangle',600,320,'#ffffff'),id:'t',text:'Target'};
     return {version:1,title:'Callout',items:[c,t]};`,
  );
  await fit(page);
  await item(page, 'c').click();
  const handle = page.locator('[data-callout-tail="c"]');
  await expect(handle).toBeVisible();
  await mouseDrag(page, await center(handle), await center(item(page, 't')));
  await waitForSave(page, b => b.items.find(i => i.id === 'c').tail?.target === 't', 'tail attached');
  await expect(item(page, 'c').locator('[data-callout-tail-shape="c"]')).toHaveCount(1);
  const before = await center(handle);
  // Move the target: the tail follows.
  await page.keyboard.press('Escape');
  await mouseDrag(page, await center(item(page, 't')), { x: (await center(item(page, 't'))).x + 200, y: 200 });
  await waitForSave(page, b => b.items.find(i => i.id === 't').x > 700, 'target moved');
  await item(page, 'c').click({ position: { x: 40, y: 30 } });
  const after = await center(handle);
  expect(after.x).toBeGreaterThan(before.x + 50);
  await page.getByRole('button', { name: 'Reset callout tail' }).click();
  await waitForSave(page, b => !b.items.find(i => i.id === 'c').tail, 'tail reset');
});

test('diagram templates insert connected native shapes', async ({ page }) => {
  await seed(page, `return {version:1,title:'Templates',items:[]};`);
  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Templates' }).click();
  const panel = page.getByRole('complementary', { name: 'Templates' });
  await panel.getByRole('button', { name: 'Diagramming', exact: true }).click();
  for (const name of ['Org chart', 'Mind map', 'Sequence diagram', 'ER diagram', 'Network diagram', 'Decision tree'])
    await expect(panel.getByRole('button', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  await panel.getByRole('button', { name: /^ER diagram/ }).click();
  await waitForSave(
    page,
    b => b.items.some(i => i.type === 'arrow' && i.connector?.endHead === 'zero-many' && i.from && i.to),
    'ER diagram inserted',
  );
  const board = await savedBoard(page);
  expect(board.items.filter(i => i.type === 'rectangle').length).toBe(4);
});

test('org chart people get custom fields and the chart chooses what cards show', async ({ page }) => {
  await seed(
    page,
    `const o={...m.createItem('orgchart',0,0),id:'o',data:{nodes:[{id:'root',parent:null,name:'Director',role:'Lead',team:'Core'},{id:'x',parent:'root',name:'Alex',role:'Dev'}]}};return {version:1,title:'Org',items:[o]};`,
  );
  await fit(page);
  await item(page, 'o').locator('.rich-title span').first().click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Add field' }).click();
  await waitForSave(page, b => b.items[0].data.nodes[0].fields?.[0]?.name === 'Field', 'field added');
  const name = page.getByLabel('Field 1 name');
  await name.fill('Email');
  await name.press('Tab');
  await waitForSave(page, b => b.items[0].data.nodes[0].fields?.[0]?.name === 'Email', 'field renamed');
  const value = page.getByLabel('Email value');
  await value.fill('d@example.com');
  await value.press('Tab');
  await waitForSave(page, b => b.items[0].data.nodes[0].fields?.[0]?.value === 'd@example.com', 'field value');
  await page.getByLabel('Show Email on cards').check();
  await page.getByLabel('Show Team on cards').uncheck();
  await waitForSave(page, b => JSON.stringify(b.items[0].data.cardFields) === '["Location","Email"]', 'card fields');
  await page.keyboard.press('Escape');
  await expect(item(page, 'o').locator('.canvas-person-meta').first()).toHaveText('d@example.com');
  await item(page, 'o').locator('.rich-title span').first().click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Org chart CSV file').setInputFiles({
    name: 'people.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Role,Manager,Desk\nRae,CEO,,1A\nSam,CTO,Rae,2B\n'),
  });
  await waitForSave(
    page,
    b =>
      b.items[0].data.nodes.some(n => n.name === 'Sam' && n.fields?.[0]?.name === 'Desk' && n.fields[0].value === '2B'),
    'csv custom fields',
  );
});

test('a note dropped on a Timeline is scheduled where it lands', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Timeline',
      items:[{...m.createItem('timeline',0,0),id:'w',w:1100,h:420,datasetId:'d'},
        {...m.createItem('note',0,520,'#fff49b'),id:'n',text:'Launch',w:120,h:120}],
      datasets:{d:[{id:'a',title:'Alpha',status:'Not started',assignee:'',start:'2026-01-05',end:'2026-01-30'}]}};`,
  );
  await fit(page);
  const axis = item(page, 'w').locator('[data-timeline-axis]');
  const box = (await axis.boundingBox())!;
  const track = (await item(page, 'w').locator('.timeline-row-track').first().boundingBox())!;
  const drop = { x: box.x + box.width * 0.5, y: track.y + track.height / 2 };
  const expected = await axis.evaluate((el, f) => {
    const [min, max, scale] = (el as HTMLElement).dataset.timelineAxis!.split(':');
    const span = Number(max) - Number(min) + 86400000,
      day = Number(min) + Math.floor((f * span) / 86400000) * 86400000;
    return { start: new Date(day).toISOString().slice(0, 10), scale };
  }, 0.5);
  await mouseDrag(page, await center(item(page, 'n')), drop, 16);
  await waitForSave(page, b => b.datasets.d.some(r => r.title === 'Launch'), 'copied to timeline');
  const row = (await savedBoard(page)).datasets.d.find(r => r.title === 'Launch');
  // Rounding of the pointer position can land on the neighbouring day.
  expect(Math.abs(Date.parse(row.start) - Date.parse(expected.start))).toBeLessThanOrEqual(86400000);
  expect((Date.parse(row.end) - Date.parse(row.start)) / 86400000).toBe(expected.scale === 'days' ? 0 : 6);
});

const DRAWIO = `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="s" value="Start" style="ellipse;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="d" value="Ready?" style="rhombus;fillColor=#fff2cc;fontColor=#d79b00;" vertex="1" parent="1"><mxGeometry x="260" y="30" width="120" height="80" as="geometry"/></mxCell>
<mxCell id="e" value="next" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="s" target="d"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel></diagram></mxfile>`;

test('a Draw.io widget converts to native shapes in one undo step', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Draw.io',items:[{...m.createItem('drawio',0,0),id:'w',text:'Flow',data:{xml:${JSON.stringify(DRAWIO)}}}]};`,
  );
  await fit(page);
  await item(page, 'w').click();
  await page.getByRole('button', { name: 'Convert to shapes', exact: true }).click();
  await waitForSave(
    page,
    b =>
      !b.items.some(i => i.id === 'w') &&
      b.items.some(i => i.type === 'ellipse' && i.fill === '#dae8fc') &&
      b.items.some(i => i.type === 'diamond') &&
      b.items.some(i => i.type === 'arrow' && i.from && i.to && i.text === 'next'),
    'converted',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Imported 2 shapes and 1 connector.' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items.length === 1 && b.items[0].id === 'w', 'undo convert');
});

test('Draw.io as shapes imports a file from the upload menu', async ({ page }) => {
  await seed(page, `return {version:1,title:'Import',items:[]};`);
  await openTools(page, 'Media');
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Upload/ })
    .click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .locator('.gallery-items')
      .getByRole('button', { name: /^Draw\.io as shapes/ })
      .click(),
  ]);
  await chooser.setFiles({ name: 'flow.drawio', mimeType: 'application/xml', buffer: Buffer.from(DRAWIO) });
  await waitForSave(page, b => b.items.length === 3 && b.items.some(i => i.type === 'diamond'), 'imported shapes');
});
