import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, seed, fit, item, center, savedBoard, waitForSave } from './helpers';

async function exportEntry(page: Page, label: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: label }).click(),
  ]);
  return readFileSync((await download.path())!);
}
const rotationOf = async (page: Page, id: string) =>
  (await savedBoard(page)).items.find((i: { id: string }) => i.id === id)?.rotation;

test.describe('rotation, corner radius and go back (gaps D1, D8, D12)', () => {
  test('rotate handle turns an object, Shift snaps to 15 degrees, undo restores, export keeps it', async ({ page }) => {
    await seed(
      page,
      `const s = { ...m.createItem('rectangle', 200, 200, '#a8cdff'), id: 'spin', text: 'Spin me' };
       const other = { ...m.createItem('note', 700, 200), id: 'still', text: 'Still' };
       return { version: 1, title: 'Rotate', items: [s, other] };`,
    );
    await fit(page);
    const shape = item(page, 'spin');
    const c = await center(shape);
    await shape.click({ position: { x: 20, y: 20 } });
    const handle = page.locator('[data-rotate]');
    await expect(handle).toBeVisible();
    const h = await center(handle);
    // Drag the handle 50 degrees clockwise around the centre; Shift snaps the turn to 45.
    const radius = Math.hypot(h.x - c.x, h.y - c.y),
      a = Math.atan2(h.x - c.x, c.y - h.y) + (50 * Math.PI) / 180,
      to = { x: c.x + radius * Math.sin(a), y: c.y - radius * Math.cos(a) };
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(h.x + 6, h.y + 2, { steps: 2 });
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await waitForSave(page, b => b.items.find((i: { id: string }) => i.id === 'spin')?.rotation === 45, 'rotated 45');
    await expect(shape).toHaveAttribute('transform', /rotate\(45 /);
    // The rotated object's own centre did not move.
    const after = await center(shape);
    expect(Math.abs(after.x - c.x)).toBeLessThan(3);
    expect(Math.abs(after.y - c.y)).toBeLessThan(3);

    // One rotate gesture is one undo step.
    await page.locator('svg.canvas').focus();
    await page.keyboard.press('Control+z');
    await waitForSave(page, b => b.items.find((i: { id: string }) => i.id === 'spin')?.rotation === undefined, 'undo');
    await page.keyboard.press('Control+y');
    await waitForSave(page, b => b.items.find((i: { id: string }) => i.id === 'spin')?.rotation === 45, 'redo');
    expect(await rotationOf(page, 'still')).toBeUndefined();

    await page.keyboard.press('Escape');
    const svg = (await exportEntry(page, 'Export as SVG')).toString('utf8');
    expect(svg).toMatch(/rotate\(45 /);
    const png = await exportEntry(page, 'Export as PNG');
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  test('corner radius slider rounds a rectangle in one undo step', async ({ page }) => {
    await seed(
      page,
      `const s = { ...m.createItem('rectangle', 200, 200, '#ffffff'), id: 'box', w: 230, h: 130 };
       return { version: 1, title: 'Radius', items: [s] };`,
    );
    await fit(page);
    await item(page, 'box').click({ position: { x: 20, y: 20 } });
    const slider = page.getByRole('slider', { name: 'Corner radius' });
    await expect(slider).toHaveValue('4');
    await slider.focus();
    await page.keyboard.press('End');
    await waitForSave(page, b => b.items[0].style?.radius === 65, 'radius saved');
    await expect(item(page, 'box').locator('rect[rx="65"]')).toHaveCount(1);
    await page.locator('svg.canvas').focus();
    await page.keyboard.press('Control+z');
    await waitForSave(page, b => b.items[0].style?.radius === undefined, 'radius undone');
  });

  test('following an object link offers Go back to the previous view', async ({ page }) => {
    await seed(
      page,
      `const far = { ...m.createItem('note', 6000, 4000), id: 'far', text: 'Far away' };
       const near = { ...m.createItem('note', 0, 0), id: 'near', text: 'Start here', linkTo: 'far' };
       return { version: 1, title: 'Links', items: [near, far] };`,
    );
    await fit(page);
    const camera = page.locator('#objects');
    const before = await camera.getAttribute('transform');
    await page.locator('.link-badge').click();
    const toast = page.locator('.go-back-toast');
    await expect(toast).toBeVisible();
    await expect(camera).not.toHaveAttribute('transform', before!);
    await toast.getByRole('button', { name: 'Go back' }).click();
    await expect(camera).toHaveAttribute('transform', before!);
    await expect(toast).toBeHidden();
  });
});
