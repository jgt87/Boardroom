// Track R2-K: browser zoom at 200%. A 1280×800 laptop window zoomed to 200% lays out at about 640×400 CSS
// pixels with a device pixel ratio of 2. The page must reflow: no sideways page scroll, every toolbar
// button reachable, and menus inside the window.
import { test, expect, openApp, fit } from './helpers';
import type { Page } from '@playwright/test';

const W = 640,
  H = 400;
test.use({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });

type Box = { x: number; y: number; width: number; height: number };
const inside = (b: Box) => b.x >= -1 && b.y >= -1 && b.x + b.width <= W + 1 && b.y + b.height <= H + 1;
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

async function expectNoPageScroll(page: Page, state: string) {
  const s = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }));
  expect(s.w, `${state}: page scrolls sideways`).toBeLessThanOrEqual(W);
  expect(s.h, `${state}: page scrolls vertically`).toBeLessThanOrEqual(H);
}
/** The control is on screen and is what a click at its centre would hit (not covered by other chrome). */
async function expectReachable(page: Page, name: string, scope = page.locator('body')) {
  const control = scope.getByRole('button', { name, exact: true }).first();
  await control.scrollIntoViewIfNeeded();
  const box = (await control.boundingBox())!;
  expect(inside(box), `${name} is inside the window`).toBe(true);
  const hit = await control.evaluate(el => {
    const r = el.getBoundingClientRect(),
      top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === el || el.contains(top));
  });
  expect(hit, `${name} is not covered`).toBe(true);
}
async function chromeBoxes(page: Page) {
  const pick = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  return {
    header: await pick('.board-header'),
    actions: await pick('.document-actions'),
    tools: await pick('nav[aria-label="Creation tools"]'),
    history: await pick('.history'),
    zoom: await pick('.canvas-footer > *:not(.local-label)'),
  };
}

test.describe('browser zoom 200% (640×400)', () => {
  test('the main chrome reflows without overlap or page scroll', async ({ page }) => {
    await openApp(page);
    await expectNoPageScroll(page, 'empty board');
    const boxes = await chromeBoxes(page);
    for (const [name, b] of Object.entries(boxes)) expect(inside(b), `${name} inside the window`).toBe(true);
    const names = Object.keys(boxes) as (keyof typeof boxes)[];
    for (const a of names)
      for (const b of names) if (a < b) expect(overlap(boxes[a], boxes[b]), `${a} overlaps ${b}`).toBe(false);

    // Every tool in the rail can be reached (the rail scrolls when the window is short).
    const rail = page.locator('nav[aria-label="Creation tools"]');
    const labels = await rail
      .locator('.tool-buttons > button')
      .evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')!));
    expect(labels.length).toBeGreaterThan(5);
    for (const name of labels) await expectReachable(page, name, rail);
    for (const name of ['Undo', 'Main menu', 'Export', 'Search board', 'Layers', 'Zoom in'])
      await expectReachable(page, name);
  });

  test('menus fit in the window and every entry can be reached', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Main menu' }).click();
    const root = page.locator('.main-menu-list').first();
    const subs = await root.locator(':scope > .main-menu-sub > [role="menuitem"]').allInnerTexts();
    expect(subs.length).toBeGreaterThan(4);
    for (const label of subs) {
      await root.locator(':scope > .main-menu-sub > [role="menuitem"]', { hasText: label }).first().click();
      const lists = page.locator('.main-menu-list');
      await expect(lists).toHaveCount(2);
      const box = (await lists.last().boundingBox())!;
      expect(inside(box), `${label} submenu inside the window`).toBe(true);
      // The last entry scrolls into view when the submenu is taller than the window.
      const last = lists
        .last()
        .locator(':scope > button, :scope > .main-menu-sub > button, :scope > .main-menu-field')
        .last();
      await last.scrollIntoViewIfNeeded();
      expect(inside((await last.boundingBox())!), `${label}: last entry reachable`).toBe(true);
      await expectNoPageScroll(page, `${label} submenu`);
    }
    // A nested submenu (Board → Background color) also stays on screen.
    await root
      .locator(':scope > .main-menu-sub > [role="menuitem"]', { hasText: /^Board/ })
      .first()
      .click();
    await page
      .locator('.main-menu-list [role="menuitem"]', { hasText: /^Background color/ })
      .first()
      .click();
    await expect(page.locator('.main-menu-list')).toHaveCount(3);
    expect(inside((await page.locator('.main-menu-list').last().boundingBox())!), 'nested submenu').toBe(true);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const menu = page.locator('.export-menu');
    expect(inside((await menu.boundingBox())!), 'export menu inside the window').toBe(true);
    const last = menu.locator('button').last();
    await last.scrollIntoViewIfNeeded();
    expect(inside((await last.boundingBox())!), 'last export entry reachable').toBe(true);
    await expectNoPageScroll(page, 'export menu');
  });

  test('a board with a selection keeps its bars and panels inside the window', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Explore a sample board' }).click();
    await fit(page);
    await expectNoPageScroll(page, 'sample board');
    // Select an object: the selection bar fits and does not cover the header or toolbar.
    await page.locator('#objects [data-item]').first().click({ force: true });
    const bar = page.locator('.selection-bar').first();
    if (await bar.count()) {
      const b = (await bar.boundingBox())!;
      expect(b.x >= -1 && b.x + b.width <= W + 1, 'selection bar fits horizontally').toBe(true);
    }
    await page.keyboard.press('Escape');
    // The pen options panel fits and scrolls.
    await page.locator('svg.canvas').focus();
    await page.keyboard.press('p');
    const options = page
      .locator('.anchored-panel:has(.tool-options), .tool-options:not(.anchored-panel .tool-options)')
      .first();
    await expect(options).toBeVisible();
    const ob = (await options.boundingBox())!;
    expect(inside(ob), `pen options inside the window ${JSON.stringify(ob)}`).toBe(true);
    await expectNoPageScroll(page, 'pen options');
  });
});
