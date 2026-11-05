// Track R2-K: pen pressure, the supported-browser notice, comment-only boards and sensitivity labels.
import { readFileSync } from 'node:fs';
import { test, expect, seed, savedBoard, waitForSave, fit, item, openApp } from './helpers';
import type { Page } from '@playwright/test';

/** Open main-menu submenus in turn (e.g. Board, then Sensitivity label) and click an entry in the last. */
async function menuPick(page: Page, submenu: RegExp | RegExp[], entry: RegExp) {
  await page.getByRole('button', { name: 'Main menu' }).click();
  for (const sub of [submenu].flat())
    await page.locator('.main-menu-list').last().locator('[role="menuitem"]', { hasText: sub }).first().hover();
  await page.locator('.main-menu-list').last().getByRole('menuitemcheckbox', { name: entry }).click();
  if (await page.locator('.main-menu-list').count()) await page.keyboard.press('Escape');
}
async function exportSvgText(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: 'Export as SVG' }).click(),
  ]);
  return readFileSync((await download.path())!, 'utf8');
}

test('a stylus stroke records pressure and draws a variable-width outline; mouse strokes stay plain', async ({
  page,
}) => {
  await seed(page, `return { version: 1, title: 'Ink', items: [] };`);
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('p');
  await page.evaluate(() => {
    const svg = document.querySelector('svg.canvas')!;
    const send = (type: string, x: number, y: number, pressure: number) =>
      svg.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'pen',
          clientX: x,
          clientY: y,
          pressure,
          bubbles: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          isPrimary: true,
        }),
      );
    send('pointerdown', 300, 300, 0.1);
    for (let k = 1; k <= 20; k++)
      send('pointermove', 300 + k * 12, 300 + Math.sin(k / 3) * 30, k <= 10 ? 0.1 + k * 0.08 : 0.9 - (k - 10) * 0.07);
    send('pointerup', 540, 300, 0);
  });
  await waitForSave(page, b => b.items.some(i => i.type === 'pen'), 'pen stroke');
  const stroke = (await savedBoard(page)).items.find(i => i.type === 'pen')!;
  const ps = stroke.points.map((p: { p?: number }) => p.p);
  expect(ps.every((p: unknown) => typeof p === 'number')).toBe(true);
  expect(Math.max(...ps) - Math.min(...ps)).toBeGreaterThan(0.3);
  await expect(item(page, stroke.id).locator('path.pen-pressure')).toHaveCount(1);

  // A mouse stroke in the same tool keeps plain points and a stroked path.
  await page.mouse.move(700, 600);
  await page.mouse.down();
  await page.mouse.move(800, 640, { steps: 8 });
  await page.mouse.move(900, 590, { steps: 8 });
  await page.mouse.up();
  await waitForSave(page, b => b.items.filter(i => i.type === 'pen').length === 2, 'mouse stroke');
  const mouse = (await savedBoard(page)).items.filter(i => i.type === 'pen')[1];
  expect(mouse.points.some((p: { p?: number }) => p.p !== undefined)).toBe(false);
  await expect(item(page, mouse.id).locator('path.pen-pressure')).toHaveCount(0);

  // Exports carry the variable-width outline.
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  expect(await exportSvgText(page)).toContain('pen-pressure');
});

test('a comment-only board accepts comments and refuses other edits', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Review', items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Keep' }],
       comments: [{ id: 't1', x: 300, y: 300, messages: [{ id: 'm1', text: 'First thought', at: '2026-01-01T10:00:00.000Z' }] }] };`,
  );
  await fit(page);
  await menuPick(page, /^Board/, /Comment only/);
  await waitForSave(page, b => b.commentOnly === true, 'comment only on');
  await expect(page.locator('.board-status.comment-only')).toHaveText('Comment only');

  // Deleting the note is refused with a clear message.
  await item(page, 'a').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Delete');
  await expect(page.locator('.notice')).toContainText('comment-only');
  await page.keyboard.press('Escape');

  // Replying to and resolving a comment is accepted.
  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Comments' }).click();
  await page
    .getByRole('complementary', { name: 'Comments' })
    .getByRole('button', { name: /First thought/ })
    .click();
  const thread = page.locator('.comment-popover');
  await thread.getByRole('textbox', { name: 'Reply' }).fill('Agreed');
  await thread.getByRole('textbox', { name: 'Reply' }).press('Control+Enter');
  await waitForSave(page, b => b.comments?.[0]?.messages.length === 2, 'reply saved');
  await thread.getByRole('button', { name: 'Resolve' }).click();
  await waitForSave(page, b => b.comments?.[0]?.resolved === true, 'resolved');

  const b = await savedBoard(page);
  expect(b.items.map(i => i.id)).toEqual(['a']);

  // Switching to view-only replaces comment-only; turning it off restores editing.
  await menuPick(page, /^Board/, /View only/);
  await waitForSave(page, x => x.viewOnly === true && x.commentOnly === undefined, 'view only replaces comment only');
  await expect(page.locator('.board-status.comment-only')).toHaveCount(0);
  await menuPick(page, /^Board/, /View only/);
  await waitForSave(page, x => x.viewOnly === undefined, 'editing again');
});

test('a sensitivity label shows in the top bar and on the dashboard, and is stamped on exports', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Plans', items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Budget' }] };`,
  );
  await menuPick(page, [/^Board/, /^Sensitivity label/], /^Confidential/);
  await waitForSave(page, b => b.sensitivity?.level === 'confidential', 'label saved');
  await expect(page.locator('.board-header .sensitivity-badge')).toHaveText('Confidential');

  const svg = await exportSvgText(page);
  expect(svg).toContain('sensitivity-stamp');
  expect(svg).toMatch(/<text[^>]*>Confidential<\/text>/);

  // A custom label with its own colour.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page
    .locator('.main-menu-list [role="menuitem"]', { hasText: /^Board/ })
    .first()
    .hover();
  await page
    .locator('.main-menu-list [role="menuitem"]', { hasText: /^Sensitivity label/ })
    .first()
    .hover();
  await page.getByRole('textbox', { name: 'Custom sensitivity label' }).fill('Board members only');
  await page.getByLabel('Custom label colour').fill('#7a1f8f');
  await page.locator('.sensitivity-form').getByRole('button', { name: 'Apply' }).click();
  await waitForSave(
    page,
    b => b.sensitivity?.level === 'custom' && b.sensitivity.label === 'Board members only',
    'custom label saved',
  );
  await expect(page.locator('.board-header .sensitivity-badge')).toHaveText('Board members only');
  await expect(page.locator('.board-header .sensitivity-badge')).toHaveCSS('background-color', 'rgb(122, 31, 143)');

  // The dashboard card shows the badge.
  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  await expect(page.locator('.board-card-title .sensitivity-badge', { hasText: 'Board members only' })).toBeVisible();
});

test('a browser missing a required feature shows a dismissible notice that stays dismissed', async ({ page }) => {
  await page.addInitScript(() => {
    const original = CSS.supports.bind(CSS);
    CSS.supports = ((q: string, v?: string) =>
      v === undefined && q.includes(':has')
        ? false
        : v === undefined
          ? original(q)
          : original(q, v)) as typeof CSS.supports;
  });
  await openApp(page);
  const notice = page.getByRole('status', { name: 'Browser support' });
  await expect(notice).toContainText('CSS :has()');
  // The board stays usable underneath.
  await expect(page.locator('svg.canvas')).toBeVisible();
  await notice.getByRole('button', { name: 'Dismiss browser notice' }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Browser support' })).toHaveCount(0);
});

test('a complete browser shows no notice', async ({ page }) => {
  await openApp(page);
  await page.waitForTimeout(300);
  await expect(page.getByRole('status', { name: 'Browser support' })).toHaveCount(0);
});
