// Shared menu behaviour (items 142, 143, 145, 149): outside press, Esc (focus back to the trigger), Tab, arrow
// keys with wrap, Home/End, and menu roles, for the Collaborate, Export and main menus.
import { test, expect, seed } from './helpers';
import type { Page } from '@playwright/test';

const focusedLabel = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.getAttribute('aria-label') || el?.textContent?.trim().slice(0, 40) || el?.tagName || '';
  });

test.beforeEach(async ({ page }) => {
  await seed(
    page,
    `const n = m.createItem('note', 0, 0); n.id = 'n1'; return { version: 1, title: 'Menus', items: [n] };`,
  );
});

test('the Collaborate menu closes on an outside press and on Esc, which returns focus to its button', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: 'Collaborate and review' });
  const menu = page.getByRole('menu', { name: 'Collaborate and review' });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  await trigger.click();
  await expect(menu).toBeVisible();
  // Opening focuses the first row; arrows wrap; Home/End jump.
  await expect.poll(() => focusedLabel(page)).toMatch(/^Dot voting/);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => focusedLabel(page)).toMatch(/^Note authors/);
  await page.keyboard.press('Home');
  await expect.poll(() => focusedLabel(page)).toMatch(/^Dot voting/);
  await page.keyboard.press('End');
  await expect.poll(() => focusedLabel(page)).toMatch(/^Note authors/);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect.poll(() => focusedLabel(page)).toBe('Collaborate and review');
  // Outside press closes it (this used to keep it open).
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(600, 500);
  await expect(menu).toHaveCount(0);
  // Tab out closes it too.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
});

test('Esc in a menu closes only the menu and keeps the selection', async ({ page }) => {
  await page.locator('[data-item="n1"]').click();
  await expect(page.locator('.selection-bar').first()).toBeVisible();
  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Collaborate and review' })).toHaveCount(0);
  await expect(page.locator('.selection-bar').first()).toBeVisible();
});

test('the Export menu is a menu: ArrowDown opens it, arrows move, Esc goes back to the button', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Export', exact: true });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Export' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // Pressing outside closes it.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(600, 500);
  await expect(menu).toHaveCount(0);
});

test('the main menu supports Home/End and Esc returns focus to its button', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Main menu' });
  await trigger.click();
  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();
  const rows = menu.locator(':scope > [role^="menuitem"], :scope > .main-menu-sub > [role="menuitem"]');
  await rows.first().focus();
  await page.keyboard.press('End');
  await expect(rows.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('the right-click menu fits a short window: every row can be reached (item 147)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.locator('[data-item="n1"]').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Actions' });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(500);
  // The last row scrolls into view inside the menu, and the menu stays open.
  const last = menu.getByRole('menuitem').last();
  await page.keyboard.press('End');
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect(menu).toBeVisible();
  // Resizing the window closes it.
  await page.setViewportSize({ width: 420, height: 520 });
  await expect(menu).toHaveCount(0);
});

test('rail pop-outs close on an outside press and on Esc, which keeps the selection (item 144)', async ({ page }) => {
  await page.locator('[data-item="n1"]').click();
  const shapesButton = page.getByRole('button', { name: 'Shapes and lines', exact: true });
  await expect(shapesButton).toHaveAttribute('aria-haspopup', 'menu');
  await shapesButton.click();
  const shapes = page.getByRole('menu', { name: 'Shapes and lines choices' });
  await expect(shapes).toBeVisible();
  await expect(shapesButton).toHaveAttribute('aria-expanded', 'true');
  // Opening focuses the first row; arrows move.
  await expect(shapes.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(shapes.getByRole('menuitem').nth(1)).toBeFocused();
  // Esc closes only the pop-out: the note stays selected and focus goes back to the rail button.
  await page.keyboard.press('Escape');
  await expect(shapes).toHaveCount(0);
  await expect(shapesButton).toBeFocused();
  await expect(page.locator('.selection-bar').first()).toBeVisible();
  // A press outside closes it; pressing the rail button again toggles it closed too.
  await shapesButton.click();
  await expect(shapes).toBeVisible();
  await page.mouse.click(700, 120);
  await expect(shapes).toHaveCount(0);
  await shapesButton.click();
  await expect(shapes).toBeVisible();
  await shapesButton.click();
  await expect(shapes).toHaveCount(0);
  // The tools gallery closes on an outside press as well.
  await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
  const gallery = page.locator('.anchored-panel');
  await expect(gallery).toBeVisible();
  await page.mouse.click(700, 120);
  await expect(gallery).toHaveCount(0);
});

test('Templates opens beside its rail button, or below Collaborate when chosen there', async ({ page }) => {
  const railButton = page.getByRole('button', { name: 'Templates', exact: true });
  const panel = page.getByRole('complementary', { name: 'Templates' });
  await railButton.click();
  await expect(panel).toBeVisible();
  await expect(railButton).toHaveAttribute('aria-expanded', 'true');
  const rail = (await railButton.boundingBox())!,
    beside = (await panel.boundingBox())!;
  // DESIGN.md: rail panels open 10px to the right of their button.
  expect(Math.round(beside.x - (rail.x + rail.width))).toBe(10);
  // A press outside closes it; a second press on the rail button too.
  await page.mouse.click(900, 500);
  await expect(panel).toHaveCount(0);
  await railButton.click();
  await expect(panel).toBeVisible();
  await railButton.click();
  await expect(panel).toHaveCount(0);
  // From the Collaborate and review menu it opens below that button, as before.
  const collaborate = page.getByRole('button', { name: 'Collaborate and review' });
  await collaborate.click();
  await page
    .getByRole('menu', { name: 'Collaborate and review' })
    .getByRole('menuitem', { name: /^Templates/ })
    .click();
  await expect(panel).toBeVisible();
  const below = (await panel.boundingBox())!,
    top = (await collaborate.boundingBox())!;
  expect(below.y).toBeGreaterThan(top.y + top.height);
});

test('notice live regions exist before the first notice; info goes to status, errors to alert (item 148)', async ({
  page,
}) => {
  const status = page.locator('.notice-region[role="status"]'),
    alert = page.locator('.notice-region[role="alert"]');
  await expect(status).toBeAttached();
  await expect(alert).toBeAttached();
  await expect(status).toBeEmpty();
  // Copying an object link shows an information notice: it lands in the status region, not the alert one.
  await page.locator('[data-item="n1"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy link to object' }).click();
  await expect(status).toContainText('Link copied');
  await expect(alert).toBeEmpty();
});

test('an editor dialog keeps Tab inside and gives focus back when it closes (item 146)', async ({ page }) => {
  await seed(
    page,
    `const q = m.createItem('qr', 0, 0); q.id = 'q1'; return { version: 1, title: 'Dialog', items: [q] };`,
  );
  await page.locator('[data-item="q1"]').click();
  const edit = page.locator('.selection-bar .widget-action', { hasText: /^Edit$/ });
  await edit.focus();
  await edit.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Twenty Tabs and Shift+Tabs never leave the dialog.
  for (let k = 0; k < 20; k++) {
    await page.keyboard.press(k % 3 ? 'Tab' : 'Shift+Tab');
    expect(await dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
});
