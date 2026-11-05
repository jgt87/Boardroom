// Track R1: keyboard editing, toolbars with roving focus, spoken details, the board outline, the
// accessibility report and links to objects.
import { test, expect, seed, item, savedBoard, waitForSave, axeViolations } from './helpers';
import type { Page } from '@playwright/test';

const announcer = (page: Page) => page.locator('#sr-announcer');
const canvas = (page: Page) => page.locator('svg.canvas');

async function seedRow(page: Page) {
  await seed(
    page,
    `return { version: 1, title: 'Keys', items: [
       { ...m.createItem('note', 0, 0), id: 'a', text: 'Alpha' },
       { ...m.createItem('note', 300, 0), id: 'b', text: 'Beta' },
       { ...m.createItem('note', 600, 0), id: 'c', text: 'Gamma' },
     ] };`,
  );
}

test.describe('R1 keyboard and assistive access', () => {
  test('Enter places the armed tool at the centre and Tab in a note starts the next one', async ({ page }) => {
    await seed(page, `return { version: 1, title: 'Place', items: [] };`);
    await canvas(page).focus();
    await page.keyboard.press('n');
    await page.keyboard.press('Enter');
    const editor = page.getByRole('textbox', { name: 'Edit object text' });
    await expect(editor).toBeFocused();
    await page.keyboard.type('First');
    await page.keyboard.press('Tab');
    await expect(editor).toBeFocused();
    await page.keyboard.type('Second');
    await page.keyboard.press('Escape');
    await waitForSave(page, b => b.items.length === 2 && b.items[1].text === 'Second', 'two notes');
    const [first, second] = (await savedBoard(page)).items;
    expect(first.text).toBe('First');
    expect(second.x).toBeGreaterThan(first.x + first.w);
    expect(second.y).toBe(first.y);
    // The first note sits at the centre of the view.
    const box = await item(page, first.id).boundingBox(),
      view = page.viewportSize()!;
    expect(Math.abs(box!.x + box!.width / 2 - view.width / 2)).toBeLessThan(20);
    // Undo: the second note's text, then (one step) the second note together with the first note's text.
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await waitForSave(page, b => b.items.length === 2 && b.items[1].text === '', 'undo text');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await waitForSave(page, b => b.items.length === 1 && b.items[0].text !== 'First', 'undo tab');
  });

  test('add to the selection, resize, details and repeat from the keyboard', async ({ page }) => {
    await seedRow(page);
    await canvas(page).focus();
    await page.keyboard.press('Tab');
    await expect(announcer(page)).toContainText('Alpha');
    await page.keyboard.press('Control+Shift+ArrowRight');
    await expect(announcer(page)).toContainText('2 objects selected');
    await expect(page.locator('.selection-bar').first()).toContainText('2 objects');
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await waitForSave(
      page,
      b => b.items.filter(i => ['a', 'b'].includes(i.id)).every(i => i.w === 220 && i.h === 220),
      'resized',
    );
    expect((await savedBoard(page)).items.find(i => i.id === 'c')!.w).toBe(210);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Alt+i');
    await expect(announcer(page)).toContainText('Alpha, at x 0, y 0, 220 by 220, Light yellow');
    await page.keyboard.press('Alt+s');
    await expect(announcer(page)).toContainText('3 objects');
    await page.keyboard.press('Alt+r');
    await expect(announcer(page)).toContainText('3 objects');
    // Alt+Home / Alt+End jump to the first and last loose object.
    await page.keyboard.press('Alt+Home');
    await expect(announcer(page)).toContainText('Alpha');
    await page.keyboard.press('Alt+End');
    await expect(announcer(page)).toContainText('Gamma');
  });

  test('enter and leave a group, then comment with Alt+C', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Group', groups: [{ id: 'g', parent: null }], items: [
         { ...m.createItem('note', 0, 0), id: 'a', text: 'One', group: 'g' },
         { ...m.createItem('note', 300, 0), id: 'b', text: 'Two', group: 'g' },
       ] };`,
    );
    await item(page, 'b').click();
    await expect(page.locator('.selection-bar').first()).toContainText('2 objects');
    await page.keyboard.press('Control+Shift+ArrowDown');
    await expect(announcer(page)).toContainText('One');
    await expect(page.locator('.selection-bar').first()).not.toContainText('2 objects');
    await page.keyboard.press('Control+Shift+ArrowUp');
    await expect(announcer(page)).toContainText('Group of 2 objects');
    await page.keyboard.press('Control+Shift+ArrowDown');
    await page.keyboard.press('Alt+c');
    await expect(page.getByRole('textbox', { name: 'New comment' })).toBeVisible();
  });

  test('toolbars use roving focus; B returns to the board and Ctrl+Enter focuses the selection toolbar', async ({
    page,
  }) => {
    await seedRow(page);
    const rail = page.getByRole('toolbar', { name: 'Tools', exact: true });
    const select = rail.getByRole('button', { name: 'Select' });
    await select.focus();
    await expect(rail.locator('[tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect(rail.getByRole('button', { name: 'Formats and Flows' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(rail.getByRole('button', { name: 'Tools, media and integrations' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(select).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(rail.getByRole('button', { name: 'Tools, media and integrations' })).toBeFocused();
    await expect(rail.locator('[tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('b');
    await expect(canvas(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Control+Enter');
    const bar = page.getByRole('toolbar', { name: 'Selection actions' });
    await expect(bar.locator(':focus')).toHaveCount(1);
    // Arrow keys move along the toolbar instead of moving the object.
    const before = (await savedBoard(page)).items[0].x;
    await page.keyboard.press('ArrowRight');
    await expect(bar.locator(':focus')).toHaveCount(1);
    expect((await savedBoard(page)).items[0].x).toBe(before);
    await expect(bar.getByRole('button', { name: /^Object colour: / })).toHaveAttribute(
      'aria-label',
      /: Light yellow$/,
    );
  });

  test('copy a link to an object and open it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seed(
      page,
      `return { version: 1, title: 'Links', items: [
         { ...m.createItem('note', 0, 0), id: 'a', text: 'Alpha' },
         { ...m.createItem('note', 4000, 3000), id: 'far', text: 'Far away' },
         { ...m.createItem('frame', -200, -200), id: 'f', text: 'Area', w: 800, h: 600 },
       ] };`,
    );
    await item(page, 'a').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Copy link to object' }).click();
    await expect(page.getByRole('status')).toContainText('Link copied');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#board=[\w-]+&item=a$/);
    // Opening a link selects and reveals the object (hash change on the open page).
    await page.goto(link.replace('item=a', 'item=far'));
    await expect(announcer(page)).toContainText('Far away');
    await expect(page.locator('.selection-bar').first()).toBeVisible();
    await expect(item(page, 'far')).toBeInViewport();
    expect(new URL(page.url()).hash).toBe('');
    // A fresh load with a frame link works too.
    await page.goto('/#frame=f');
    await expect(announcer(page)).toContainText('Area');
    await page.goto('/#item=missing');
    await expect(page.getByRole('status')).toContainText('not on this board');
  });

  test('board outline by frame and the grouped accessibility report', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Outline', items: [
         { ...m.createItem('frame', 0, 0), id: 'f', text: 'Ideas', w: 1000, h: 600 },
         { ...m.createItem('note', 100, 100), id: 'a', text: 'Inside' },
         { ...m.createItem('note', 3000, 0), id: 'z', text: 'Outside' },
         { ...m.createItem('image', 3000, 600), id: 'img', assetId: 'missing' },
         { ...m.createItem('note', 3000, 1200, '#7a7a7a'), id: 'grey', text: 'grey' },
       ] };`,
    );
    await canvas(page).focus();
    await page.keyboard.press('Alt+o');
    const outline = page.getByRole('complementary', { name: 'Board outline' });
    await expect(outline.getByRole('heading', { name: 'Ideas' })).toBeVisible();
    await expect(outline.getByRole('heading', { name: 'Not in a frame' })).toBeVisible();
    await outline.getByRole('button', { name: 'Sticky note: Outside' }).click();
    await expect(announcer(page)).toContainText('Outside');
    await expect(page.locator('.selection-bar').first()).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await outline.getByRole('button', { name: 'Close board outline' }).click();

    await page.getByRole('button', { name: 'Collaborate and review' }).click();
    await page.locator('.facilitate-menu button', { hasText: 'Accessibility check' }).click();
    const report = page.getByRole('complementary', { name: 'Accessibility check' });
    await expect(report.getByRole('heading', { name: /Descriptions/ })).toBeVisible();
    await expect(report.getByRole('heading', { name: /Contrast/ })).toBeVisible();
    await expect(report).toContainText('Error');
    await expect(report).toContainText('Missing description');
    expect(await axeViolations(page)).toEqual([]);
  });
});
