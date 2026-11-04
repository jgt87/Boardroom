// Sticky stack peel animation (item 133): the sheet bends frame by frame while glued, tears off past a
// threshold, and springs back (taking nothing) when released early.
import { test, expect, openApp, savedBoard, waitForSave } from './helpers';
import type { Page } from '@playwright/test';

async function placePad(page: Page) {
  await openApp(page);
  await page.getByRole('button', { name: 'Sticky note', exact: true }).click();
  await page.getByRole('button', { name: 'Stack' }).click();
  await waitForSave(page, b => b.items.some(i => i.type === 'stickypad'), 'pad placed');
  const pad = (await savedBoard(page)).items.find(i => i.type === 'stickypad')!;
  const box = (await page.locator(`[data-pad-peel="${pad.id}"]`).boundingBox())!;
  return { pad, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
const sheetPath = (page: Page) =>
  page.locator('.sticky-peel-paper').evaluate(el => el.getAttribute('d') ?? '', undefined, { timeout: 2000 });

test('pulling the top sheet bends it frame by frame, then tears it off as a note', async ({ page }) => {
  const { pad, x, y } = await placePad(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  // A short pull: the sheet bends but stays glued (no note is in the board yet).
  await page.mouse.move(x + 20, y + 15, { steps: 3 });
  await expect(page.locator('.sticky-peel-paper')).toHaveCount(1);
  const early = await sheetPath(page);
  await page.mouse.move(x + 45, y + 30, { steps: 3 });
  await expect.poll(() => sheetPath(page)).not.toBe(early);
  // The pad's own curl is hidden while the overlay draws the moving sheet.
  await expect(page.locator(`[data-pad="${pad.id}"] .stickypad-curl`)).toHaveCSS('opacity', '0');
  // Successive animation frames keep changing the outline while the spring catches up with the pointer.
  await page.mouse.move(x + 300, y + 40, { steps: 6 });
  const frames = await page.evaluate(
    () =>
      new Promise<string[]>(resolve => {
        const out: string[] = [];
        const grab = () => {
          out.push(document.querySelector('.sticky-peel-paper')?.getAttribute('d') ?? '');
          if (out.length < 6) requestAnimationFrame(grab);
          else resolve(out);
        };
        requestAnimationFrame(grab);
      }),
  );
  expect(new Set(frames.filter(Boolean)).size).toBeGreaterThan(1);
  await page.mouse.up();
  await waitForSave(page, b => b.items.some(i => i.type === 'note'), 'note taken');
  // After it settles the overlay is gone, the note is visible and the pad's curl is back.
  await expect(page.locator('.sticky-peel')).toHaveCount(0, { timeout: 3000 });
  const note = (await savedBoard(page)).items.find(i => i.type === 'note')!;
  await expect(page.locator(`[data-item="${note.id}"]`)).toHaveCSS('opacity', '1');
  await expect(page.locator(`[data-pad="${pad.id}"] .stickypad-curl`)).toHaveCSS('opacity', '1');
  expect(note.fill).toBe(pad.fill);
});

test('releasing before the sheet tears off springs it back and takes nothing', async ({ page }) => {
  const { pad, x, y } = await placePad(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 25, y + 20, { steps: 4 });
  await expect(page.locator('.sticky-peel-paper')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.sticky-peel')).toHaveCount(0, { timeout: 3000 });
  // Give a stray save a chance to happen, then check nothing was taken and the pad did not move.
  await page.waitForTimeout(400);
  const board = await savedBoard(page);
  expect(board.items.filter(i => i.type === 'note')).toHaveLength(0);
  const after = board.items.find(i => i.id === pad.id)!;
  expect([after.x, after.y]).toEqual([pad.x, pad.y]);
});
