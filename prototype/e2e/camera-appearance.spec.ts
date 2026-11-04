import { readFileSync } from 'node:fs';
import { test, expect, seed, item, waitForSave, axeViolations } from './helpers';

test('precise camera controls apply zoom and center, reset, and dismiss with Escape', async ({ page }) => {
  await seed(page, `return {...m.newBoard(),items:[{...m.createItem('note',0,0),id:'n',text:'Camera'}]};`);
  await page.getByRole('button', { name: /Zoom and navigation:/ }).click();
  const view = page.getByRole('region', { name: 'View controls' });
  await view.getByLabel('Zoom (%)').fill('175');
  await view.getByLabel('Center X').fill('100');
  await view.getByLabel('Center Y').fill('-80');
  await view.getByRole('button', { name: 'Apply view' }).click();
  await expect(page.getByRole('button', { name: 'Zoom and navigation: 175%' })).toBeVisible();
  await expect(view.getByLabel('Center Y')).toHaveValue('-80');
  await view.getByRole('button', { name: 'Reset view' }).click();
  await expect(view.getByLabel('Center X')).toHaveValue('0');
  await expect(view.getByLabel('Zoom (%)')).toHaveValue('100');
  await page.keyboard.press('Escape');
  await expect(view).toBeHidden();
});

test('opacity and text metrics edit, persist, undo, reopen and export', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),items:[{...m.createItem('note',150,150),id:'n',text:'Precise text',format:{fontSize:28}}]};`,
  );
  await item(page, 'n').click();
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Properties' });
  await expect(inspector).toBeVisible();
  for (const [label, value] of [
    ['Opacity (%)', '45'],
    ['Font weight', '800'],
    ['Text offset Y', '12'],
  ]) {
    await inspector.getByRole('spinbutton', { name: label, exact: true }).fill(value);
    await inspector.getByRole('spinbutton', { name: label, exact: true }).press('Enter');
  }
  await waitForSave(
    page,
    b =>
      b.items[0].opacity === 0.45 && b.items[0].format?.fontWeight === 800 && b.items[0].format?.baselineOffsetY === 12,
  );
  await expect(item(page, 'n')).toHaveAttribute('opacity', '0.45');
  await expect(item(page, 'n').locator('.object-text')).toHaveCSS('font-weight', '800');
  await expect(item(page, 'n').locator('.object-text > span')).toHaveCSS('top', '12px');
  await inspector.getByRole('button', { name: 'Close properties' }).click();
  await page.keyboard.press('Control+z');
  await waitForSave(page, b => b.items[0].format?.baselineOffsetY === undefined);
  await page.keyboard.press('Control+Shift+z');
  await waitForSave(page, b => b.items[0].format?.baselineOffsetY === 12);
  await page.keyboard.press('Escape');
  await page.locator('.export-button').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: 'Export as SVG' }).click(),
  ]);
  const svg = readFileSync((await download.path())!, 'utf8');
  expect(svg).toContain('opacity="0.45"');
  expect(svg).toMatch(/font-weight:\s*800/);
  await page.reload();
  await expect(item(page, 'n')).toHaveAttribute('opacity', '0.45');
  await item(page, 'n').dblclick();
  await expect(page.getByRole('textbox', { name: 'Edit object text' })).toHaveCSS('font-weight', '800');
  await page.getByRole('textbox', { name: 'Edit object text' }).press('Escape');
  const toolbar = page.locator('.text-controls');
  await toolbar.getByRole('combobox', { name: 'Font weight', exact: true }).selectOption('600');
  await expect(toolbar.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await toolbar.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(item(page, 'n').locator('.object-text')).toHaveCSS('font-weight', '400');
  await toolbar.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(toolbar.getByRole('combobox', { name: 'Font weight', exact: true })).toHaveValue('700');
});

test('view controls and appearance fit desktop and phone layouts', async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await seed(
      page,
      `return {...m.newBoard(),items:[{...m.createItem('note',150,150),id:'n',text:'Plan the next step',opacity:0.75,format:{fontWeight:600,baselineOffsetY:8}}]};`,
    );
    await page.getByRole('button', { name: /Zoom and navigation:/ }).click();
    const view = page.getByRole('region', { name: 'View controls' });
    const bounds = await view.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    await expect(view.getByRole('button', { name: 'Apply view' })).toBeInViewport();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await item(page, 'n').click();
    await page.getByRole('button', { name: 'Properties', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: 'Opacity (%)', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`appearance-${viewport.width}.png`) });
  }
});

test('view menu offers zoom presets, grid, object dimensions and remembers them', async ({ page }) => {
  await seed(page, `return {...m.newBoard(),items:[{...m.createItem('note',0,0),id:'n',text:'Size me'}]};`);
  await page.getByRole('button', { name: /Zoom and navigation:/ }).click();
  const view = page.getByRole('region', { name: 'View controls' });
  await view.getByRole('group', { name: 'Zoom presets' }).getByRole('button', { name: '1200%' }).click();
  await expect(page.getByRole('button', { name: 'Zoom and navigation: 1200%' })).toBeVisible();
  await view.getByRole('group', { name: 'Zoom presets' }).getByRole('button', { name: '50%' }).click();
  await expect(page.getByRole('button', { name: 'Zoom and navigation: 50%' })).toBeVisible();
  await expect(page.locator('.canvas-grid')).toHaveCount(1);
  await view.getByLabel('Grid').uncheck();
  await expect(page.locator('.canvas-grid')).toHaveCount(0);
  await view.getByLabel('Object dimensions').check();
  await page.keyboard.press('Escape');
  await item(page, 'n').click();
  await expect(page.locator('.dimension-label')).toHaveText('210 × 210');
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
  await expect(page.locator('.canvas-grid')).toHaveCount(0);
});
