// Board library gaps: trash and restore, status filter, description and content search, and a
// "Back up all boards" file restored next to the existing boards.
import { test, expect, openApp, type BoardJson } from './helpers';
import type { Page } from '@playwright/test';

const INDEX_KEY = 'boardroom.boards.v1';

/** Seed a library written by an older version (index entries without status or description). */
async function seedLibrary(page: Page) {
  await openApp(page);
  await page.evaluate(async index => {
    const m = await import('/src/model.ts');
    const note = (text: string) => ({ ...m.createItem('note', 0, 0), text });
    const boards: Record<string, BoardJson> = {
      b1: { ...m.newBoard(), title: 'Roadmap', status: 'done', items: [note('Hiring plan for spring')] },
      b2: { ...m.newBoard(), title: 'Retro', items: [note('What went well')] },
    };
    const now = new Date().toISOString();
    for (const [id, b] of Object.entries(boards)) {
      m.parseBoard(b);
      localStorage.setItem(`boardroom.board.${id}`, JSON.stringify(b));
    }
    localStorage.setItem('boardroom.document.v1', JSON.stringify(boards.b1));
    localStorage.setItem(
      index,
      JSON.stringify({
        version: 1,
        activeId: 'b1',
        boards: Object.entries(boards).map(([id, b]) => ({
          id,
          title: b.title,
          createdAt: now,
          updatedAt: now,
          items: b.items.length,
          preview: [],
        })),
      }),
    );
  }, INDEX_KEY);
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
}
const openDashboard = (page: Page) => page.getByRole('button', { name: 'boardroom: all boards' }).click();
const cards = (page: Page) => page.getByRole('list', { name: 'Your boards' }).locator('.board-card');

test('boards move to the trash, are restored and can be deleted forever', async ({ page }) => {
  await seedLibrary(page);
  await openDashboard(page);
  await expect(cards(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete Retro' }).click();
  await expect(cards(page)).toHaveCount(1);
  expect(await page.evaluate(() => !!localStorage.getItem('boardroom.board.b2'))).toBe(true);

  await page.getByRole('button', { name: 'Trash (1)' }).click();
  await page.getByRole('button', { name: 'Restore Retro' }).click();
  await expect(page.getByText('The trash is empty.')).toBeVisible();
  await page.getByRole('button', { name: /^Trash/ }).click();
  await expect(cards(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Delete Retro' }).click();
  await page.getByRole('button', { name: 'Trash (1)' }).click();
  await page.getByRole('button', { name: 'Delete Retro forever' }).click();
  await page.getByRole('alert').getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.getByText('The trash is empty.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('boardroom.board.b2'))).toBeNull();
});

test('dashboard cards show the status and the status filter narrows the list', async ({ page }) => {
  await seedLibrary(page);
  await openDashboard(page);
  await expect(cards(page).filter({ hasText: 'Roadmap' }).locator('.card-status')).toHaveText('Done');
  await page.getByLabel('Filter by status').selectOption('Done');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Roadmap');
  await page.getByLabel('Filter by status').selectOption('none');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Retro');
});

test('the description is edited in Details and found by dashboard search, as is board content', async ({ page }) => {
  await seedLibrary(page);
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page
    .locator('.main-menu-list [role="menuitem"]', { hasText: /^Board/ })
    .first()
    .hover();
  await page.locator('.main-menu-list').last().getByRole('menuitem', { name: 'Details' }).click();
  const details = page.getByRole('complementary', { name: 'Board details' });
  await details.getByLabel('Board description').fill('Quarterly planning for the team');
  await details.getByRole('button', { name: 'Close board details' }).click();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('boardroom.board.b1') ?? '{}').description))
    .toBe('Quarterly planning for the team');

  await openDashboard(page);
  await expect(cards(page).filter({ hasText: 'Roadmap' })).toContainText('Quarterly planning for the team');
  await page.getByLabel('Find a board').fill('quarterly');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Roadmap');
  await page.getByLabel('Find a board').fill('went well');
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByLabel('Content match in Retro')).toContainText('what went well');
});

test('back up all boards, then restore the file next to the existing boards', async ({ page }) => {
  await seedLibrary(page);
  await openDashboard(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Back up all boards' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^boardroom-library-.*\.boardroom$/);
  const path = (await download.path())!;
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import', exact: true }).click(),
  ]);
  await chooser.setFiles(path);
  await expect(page.getByRole('status')).toContainText('Restored 2 boards');
  await expect(cards(page)).toHaveCount(4);
  await expect(cards(page).filter({ hasText: 'Roadmap' })).toHaveCount(2);
  const index = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), INDEX_KEY);
  expect(index.activeId).toBe('b1');
  expect(new Set(index.boards.map((b: { id: string }) => b.id)).size).toBe(4);
});
