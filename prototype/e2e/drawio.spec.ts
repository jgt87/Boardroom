import { readFile } from 'node:fs/promises';
import { test, expect, seed, item, fit, savedBoard, waitForSave, pngBytes, axeViolations } from './helpers';
import type { Page } from '@playwright/test';

const source =
  '<mxfile><diagram id="page1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="shape" value="Original" vertex="1" parent="1"><mxGeometry x="40" y="40" width="160" height="80" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
const edited = source.replace('Original', 'Edited shape');
async function mockEditor(page: Page) {
  const png = 'data:image/png;base64,' + (await pngBytes(page, 320, 160)).toString('base64');
  const config = JSON.stringify({ png, edited });
  await page.route('https://embed.diagrams.net/**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><h1>Diagram editor fixture</h1><button id="edit">Edit sample shape</button><script>
  const config=${config};window.diagramSource='';
  const send=msg=>parent.postMessage(JSON.stringify(msg),'*');
  addEventListener('message',e=>{if(e.source!==parent)return;const m=JSON.parse(e.data);if(m.action==='load'){window.diagramSource=m.xml;send({event:'load',error:null});}if(m.action==='export')send({event:'export',format:'png',data:config.png,xml:m.xml||window.diagramSource});});
  document.getElementById('edit').onclick=()=>{window.diagramSource=config.edited;send({event:'autosave',xml:config.edited});};send({event:'init'});
  </script></body></html>`,
    }),
  );
}
async function seedDrawio(page: Page, locked = false) {
  await seed(
    page,
    `return {version:1,title:'Draw.io test',items:[{...m.createItem('drawio',0,0),id:'diagram',text:'Architecture',locked:${locked},data:{xml:${JSON.stringify(source)}}}]};`,
  );
  await fit(page);
}

test('Draw.io saves a local preview and editable source, reloads, reopens, exports and undoes', async ({ page }) => {
  await seedDrawio(page);
  await mockEditor(page);
  await item(page, 'diagram').dblclick();
  await expect(page.getByRole('dialog', { name: 'Draw.io diagram', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save diagram', exact: true })).toBeEnabled();
  expect(await axeViolations(page)).toEqual([]);
  const editor = page.frameLocator('iframe[title="Draw.io diagram editor"]');
  await editor.getByRole('button', { name: 'Edit sample shape' }).click();
  await page.getByRole('button', { name: 'Save diagram', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.xml === edited && !!b.items[0].assetId, 'diagram saved');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(item(page, 'diagram').locator('image')).toHaveAttribute('href', /^data:image\/png;base64,/);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.xml === source && !b.items[0].assetId, 'undo diagram');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.xml === edited && !!b.items[0].assetId, 'redo diagram');
  await page.reload();
  await expect(item(page, 'diagram').locator('image')).toHaveAttribute('href', /^data:image\/png;base64,/);
  await item(page, 'diagram').dblclick();
  await expect(page.getByRole('button', { name: 'Save diagram', exact: true })).toBeEnabled();
  expect(
    await page
      .frameLocator('iframe[title="Draw.io diagram editor"]')
      .locator('body')
      .evaluate(() => (window as Window & { diagramSource: string }).diagramSource),
  ).toBe(edited);
  await page.getByRole('button', { name: 'Cancel Draw.io editing' }).click();
  await item(page, 'diagram').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export .drawio', exact: true }).click();
  const file = await downloadPromise;
  expect(file.suggestedFilename()).toBe('Architecture.drawio');
  expect(await readFile((await file.path())!, 'utf8')).toBe(edited);
});

test('Draw.io import is staged until Save; cancel and invalid files leave the diagram unchanged', async ({ page }) => {
  await seedDrawio(page);
  await mockEditor(page);
  await item(page, 'diagram').dblclick();
  await expect(page.getByRole('button', { name: 'Save diagram', exact: true })).toBeEnabled();
  const before = await savedBoard(page);
  await page
    .getByLabel('Choose Draw.io file')
    .setInputFiles({ name: 'bad.drawio', mimeType: 'application/xml', buffer: Buffer.from('<mxfile>broken') });
  // Filtered by text: the app also keeps an (empty) alert region mounted for error notices (item 148).
  await expect(page.getByRole('alert').filter({ hasText: /not a Draw.io|malformed/ })).toBeVisible();
  expect((await savedBoard(page)).items).toEqual(before.items);
  await page
    .getByLabel('Choose Draw.io file')
    .setInputFiles({ name: 'Imported.drawio', mimeType: 'application/xml', buffer: Buffer.from(edited) });
  await expect(page.getByRole('textbox', { name: 'Diagram name' })).toHaveValue('Imported');
  await page.getByRole('button', { name: 'Cancel Draw.io editing' }).click();
  expect((await savedBoard(page)).items).toEqual(before.items);
});

test('Draw.io ignores forged messages, respects locked objects and handles offline imports', async ({ page }) => {
  await seedDrawio(page);
  await mockEditor(page);
  await item(page, 'diagram').dblclick();
  await expect(page.getByRole('button', { name: 'Save diagram', exact: true })).toBeEnabled();
  await page.evaluate(xml => window.postMessage(JSON.stringify({ event: 'autosave', xml }), '*'), edited);
  await page.getByRole('button', { name: 'Save diagram', exact: true }).click();
  await waitForSave(page, b => !!b.items[0].assetId, 'saved');
  expect((await savedBoard(page)).items[0].data.xml).toBe(source);
  await seedDrawio(page, true);
  await item(page, 'diagram').dblclick();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await seedDrawio(page);
  await page.unroute('https://embed.diagrams.net/**');
  await page.route('https://embed.diagrams.net/**', route => route.abort());
  await item(page, 'diagram').dblclick();
  await expect(page.getByRole('alert').filter({ hasText: 'could not connect' })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('region', { name: 'Diagram editor unavailable', exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="Draw.io diagram editor"]')).not.toBeVisible();
  await page
    .getByLabel('Choose Draw.io file')
    .setInputFiles({ name: 'Offline.drawio', mimeType: 'application/xml', buffer: Buffer.from(edited) });
  await expect(page.getByRole('region', { name: 'Diagram editor unavailable', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save source only', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.xml === edited && !b.items[0].assetId, 'offline source saved');
});

test('Draw.io is available under Diagramming and Diagram, uses placement, and accepts dropped files', async ({
  page,
}) => {
  await seed(page, `return {version:1,title:'Placement',items:[]};`);
  await mockEditor(page);
  await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
  await page.getByRole('button', { name: 'Diagramming', exact: true }).click();
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Draw.io Diagrams/ })
    .click();
  expect((await savedBoard(page)).items.length).toBe(0);
  await page.locator('svg.canvas').click({ position: { x: 650, y: 300 } });
  await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'drawio', 'placed');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => !b.items.length, 'undo');
  await page.locator('svg.canvas').dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle(xml => {
      const d = new DataTransfer();
      d.items.add(new File([xml], 'Dropped.drawio', { type: 'application/xml' }));
      return d;
    }, source),
  });
  // A dropped file asks whether it becomes a draw.io object or native shapes (P2-Q4).
  await page
    .getByRole('dialog', { name: 'Add a draw.io diagram' })
    .getByRole('button', { name: /^Draw.io object/ })
    .click();
  await waitForSave(page, b => b.items.length === 1 && b.items[0].data.xml === source, 'drop imported');
  await expect(page.getByRole('dialog', { name: 'Draw.io diagram', exact: true })).toBeVisible();
});

test.describe('Draw.io phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('editor controls fit the phone and host keyboard focus stays in the dialog', async ({ page }) => {
    await seedDrawio(page);
    await mockEditor(page);
    await item(page, 'diagram').dblclick();
    const save = page.getByRole('button', { name: 'Save diagram', exact: true });
    await expect(save).toBeEnabled();
    const box = await page.getByRole('dialog', { name: 'Draw.io diagram', exact: true }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    await save.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancel Draw.io editing' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(save).toBeFocused();
  });
});
