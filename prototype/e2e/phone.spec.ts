import { test, expect, openApp, fit, selectViaLayers } from './helpers';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

async function overflow(page: Page) {
  return page.evaluate(() => {
    const w = innerWidth;
    return {
      innerWidth: w,
      scrollWidth: document.documentElement.scrollWidth,
      outside: [
        ...document.querySelectorAll<HTMLElement>(
          '.floating, .minimap, .document-actions, .canvas-footer > *, [role=dialog]',
        ),
      ]
        .filter(e => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > w + 1 || r.left < -1);
        })
        .map(e => String(e.className).slice(0, 50)),
    };
  });
}
async function expectFits(page: Page, state: string) {
  const o = await overflow(page);
  expect(o.innerWidth, state).toBe(390);
  expect(o.scrollWidth, `${state}: page scrolls sideways`).toBe(390);
  expect(o.outside, `${state}: elements outside the viewport`).toEqual([]);
}

test.describe('phone layout 390×844', () => {
  test('no horizontal overflow across the main UI states', async ({ page }) => {
    await openApp(page);
    await expectFits(page, 'empty board');
    // Header must not overlap the first document action.
    const header = await page.locator('.board-header').boundingBox();
    const search = await page.getByRole('button', { name: 'Search board' }).boundingBox();
    expect(header!.x + header!.width, 'header overlaps search').toBeLessThanOrEqual(search!.x + 1);

    await page.getByRole('button', { name: 'Explore a sample board' }).click();
    await fit(page);
    await expectFits(page, 'sample board');

    await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
    await expectFits(page, 'tools gallery');
    const nav = page.locator('nav[aria-label="Tool categories"]');
    expect(await nav.evaluate(n => n.scrollWidth > n.clientWidth), 'category tabs scroll horizontally').toBe(true);
    await page.getByRole('button', { name: 'Close tools' }).click();

    await page.getByRole('button', { name: 'Collaborate and review' }).click();
    await expectFits(page, 'collaborate menu');
    await page.getByRole('button', { name: 'Collaborate and review' }).click();

    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await expectFits(page, 'layers');
    await page.getByRole('button', { name: 'Close layers' }).click();

    await selectViaLayers(page, 'A space to think');
    await expect(page.locator('.selection-bar').first()).toBeVisible();
    await expectFits(page, 'selection bar');

    await page.getByRole('button', { name: 'Links and tags' }).click();
    await expectFits(page, 'note details');
  });

  test('editor dialog fits the phone', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Formats and Flows' }).click();
    await page.locator('.gallery-items > button', { hasText: 'Kanban' }).click();
    await page.locator('svg.canvas').click({ position: { x: 250, y: 550 } });
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectFits(page, 'records editor');
  });
});
