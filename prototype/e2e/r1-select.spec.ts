// Track C: partial-overlap selection, touch long press, Kanban and story map keyboard creation, and
// Ctrl+Shift+Down with nothing selected.
import { test, expect, seed, item, savedBoard, waitForSave, center, mouseDrag } from './helpers';
import type { Page } from '@playwright/test';

const canvas = (page: Page) => page.locator('svg.canvas');
const menu = (page: Page) => page.getByRole('menu', { name: 'Actions' });

async function seedNotes(page: Page) {
  await seed(
    page,
    `return { version: 1, title: 'Select', items: [
       { ...m.createItem('note', 200, 200), id: 'a', text: 'Alpha' },
       { ...m.createItem('note', 500, 200), id: 'b', text: 'Beta' },
     ] };`,
  );
}
/** A real touch through the browser's input pipeline (pointerType 'touch'), held for `hold` ms. */
async function touchHold(page: Page, at: { x: number; y: number }, hold: number, moveBy = 0) {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(at.x, at.y) });
  if (moveBy)
    for (let s = 1; s <= 4; s++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(at.x + (moveBy * s) / 4, at.y + (moveBy * s) / 4),
      });
  await page.waitForTimeout(hold);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('Track C selection, touch and widget keyboard', () => {
  test('the selection box picks touched objects only when the setting is on (Alt inverts it)', async ({ page }) => {
    await seedNotes(page);
    const a = (await item(page, 'a').boundingBox())!,
      b = (await item(page, 'b').boundingBox())!;
    // A box around Alpha that reaches halfway across Beta: contains Alpha, touches Beta.
    const from = { x: a.x - 20, y: a.y - 20 },
      to = { x: b.x + b.width / 2, y: a.y + a.height + 20 };
    const selection = () => page.locator('.selection-bar').first();
    await mouseDrag(page, from, to);
    await expect(selection()).toBeVisible();
    await expect(selection()).not.toContainText('2 objects');

    await page.keyboard.press('Escape');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.keyboard.down('Alt');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(selection()).toContainText('2 objects');

    // With the setting on, a plain drag picks both.
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem('boardroom.view.v1') ?? '{}');
      localStorage.setItem('boardroom.view.v1', JSON.stringify({ ...prefs, marqueeTouch: true }));
    });
    await page.reload();
    await expect(canvas(page)).toBeVisible();
    await mouseDrag(page, from, to);
    await expect(selection()).toContainText('2 objects');
  });

  test('the setting is listed in the Accessibility menu', async ({ page }) => {
    await seedNotes(page);
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page
      .locator('.main-menu-list')
      .last()
      .locator('[role="menuitem"]', { hasText: /^Accessibility/ })
      .first()
      .hover();
    const toggle = page
      .locator('.main-menu-list')
      .last()
      .locator('[role="menuitemcheckbox"]', { hasText: /^Select objects the box touches/ })
      .first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('boardroom.view.v1') ?? '{}').marqueeTouch))
      .toBe(true);
  });

  test.describe('touch', () => {
    test.use({ hasTouch: true });

    test('a long press selects an object and opens its menu; on empty canvas it opens the canvas menu', async ({
      page,
    }) => {
      await seedNotes(page);
      const at = await center(item(page, 'b'));
      await touchHold(page, at, 800);
      await expect(menu(page)).toBeVisible();
      await expect(menu(page).getByRole('menuitem', { name: 'Delete' })).toBeVisible();
      await expect(page.locator('.selection-bar').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu(page)).toHaveCount(0);
      // The note did not move.
      const b = (await savedBoard(page)).items.find(i => i.id === 'b')!;
      expect([b.x, b.y]).toEqual([500, 200]);

      const box = (await canvas(page).boundingBox())!;
      await touchHold(page, { x: box.x + box.width - 200, y: box.y + box.height - 150 }, 800);
      await expect(menu(page)).toBeVisible();
      await expect(menu(page).getByRole('menuitem', { name: 'Add sticky note here' })).toBeVisible();
      await page.keyboard.press('Escape');

      // Moving the finger cancels the long press.
      await touchHold(page, { x: box.x + box.width - 300, y: box.y + box.height - 250 }, 800, 40);
      await expect(menu(page)).toHaveCount(0);
    });
  });

  test('Kanban: Enter and Ctrl+arrows add cards, Tab moves between cards, one undo step each', async ({ page }) => {
    await seed(
      page,
      `const k = { ...m.createItem('kanban', 100, 100), id: 'kan', datasetId: 'd1' };
       return { version: 1, title: 'Kanban', items: [k], datasets: { d1: [
         { id: 'r1', title: 'Design', status: 'Not started', assignee: '', start: '', end: '' },
         { id: 'r2', title: 'Plan', status: 'Not started', assignee: '', start: '', end: '' },
         { id: 'r3', title: 'Build', status: 'In progress', assignee: '', start: '', end: '' } ] } };`,
    );
    const kan = item(page, 'kan');
    await kan.locator('[data-card="r1"]').focus();
    await page.keyboard.press('Tab');
    await expect(kan.locator('[data-card="r2"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(kan.locator('[data-card="r1"]')).toBeFocused();

    await page.keyboard.press('Enter');
    const title = kan.locator('.canvas-field:focus');
    await expect(title).toBeVisible();
    await page.keyboard.type('Review');
    await page.keyboard.press('Enter');
    await waitForSave(
      page,
      b =>
        b
          .datasets!.d1.filter((r: any) => r.status === 'Not started')
          .map((r: any) => r.title)
          .join() === 'Design,Review,Plan',
      'card added below Design',
    );

    await kan.locator('[data-card="r3"]').focus();
    await page.keyboard.press('Control+ArrowUp');
    await expect(kan.locator('.canvas-field:focus')).toBeVisible();
    await page.keyboard.press('Escape');
    await waitForSave(
      page,
      b =>
        b
          .datasets!.d1.filter((r: any) => r.status === 'In progress')
          .map((r: any) => r.title)
          .join() === 'New task,Build',
      'card added above Build',
    );
    // One undo step removes the card added last.
    await canvas(page).focus();
    await page.keyboard.press('Control+z');
    await waitForSave(page, b => b.datasets!.d1.length === 4, 'undo removes the new card');
  });

  test('story map: Tab adds a sibling to the right, Ctrl+Down/Up add stories below/above', async ({ page }) => {
    await seed(
      page,
      `const s={...m.createItem('storymap',0,0),id:'s',data:{activities:[{id:'a',title:'Explore'},{id:'b',title:'Deliver'}],releases:[{id:'r1',title:'Now'}],cards:[{id:'c',title:'Build',activity:'a',release:'r1'}]}};return {version:1,title:'Story keys',items:[s]};`,
    );
    await item(page, 's')
      .locator('.rich-title')
      .click({ position: { x: 8, y: 8 } });
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('[data-story="c"]').focus();
    const map = async () => (await savedBoard(page)).items.find(i => i.id === 's')!.data;

    await page.keyboard.press('Tab');
    await waitForSave(
      page,
      b => b.items[0].data.cards.some((c: any) => c.activity === 'b'),
      'sibling story in Deliver',
    );
    const sibling = (await map()).cards.find((c: any) => c.activity === 'b').id;
    await expect(dialog.locator(`[data-story="${sibling}"]`)).toBeFocused();

    await dialog.locator('[data-story="c"]').focus();
    await page.keyboard.press('Control+ArrowDown');
    await waitForSave(page, b => b.items[0].data.cards.filter((c: any) => c.activity === 'a').length === 2, 'below');
    await page.keyboard.press('Control+ArrowUp');
    await waitForSave(page, b => b.items[0].data.cards.filter((c: any) => c.activity === 'a').length === 3, 'above');
    const ids = (await map()).cards.filter((c: any) => c.activity === 'a').map((c: any) => c.id);
    // Order in the cell: Build, the story added above, then the story added below Build (still focused before).
    expect(ids[0]).toBe('c');
    await expect(dialog.locator(`[data-story="${ids[1]}"]`)).toBeFocused();
  });

  test('Ctrl+Shift+Down with nothing selected selects the first object in reading order', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Order', items: [
         { ...m.createItem('note', 600, 400), id: 'late', text: 'Late' },
         { ...m.createItem('note', 300, 0), id: 'second', text: 'Second' },
         { ...m.createItem('note', 0, 10), id: 'first', text: 'First' },
       ] };`,
    );
    await canvas(page).focus();
    await page.keyboard.press('Control+Shift+ArrowDown');
    await expect(page.locator('#sr-announcer')).toContainText('First');
    await expect(page.locator('.selection-bar').first()).toBeVisible();
  });
});
