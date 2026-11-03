import { test, expect, openApp, fit } from './helpers';

test.describe('smoke', () => {
  test('loads the empty board and the sample board without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', m => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    await openApp(page);
    await expect(page.getByRole('heading', { name: 'A little room for big ideas.' })).toBeVisible();
    await page.getByRole('button', { name: 'Explore a sample board' }).click();
    await fit(page);
    await expect(page.locator('#objects [data-item]')).toHaveCount(4);
    await expect(page.locator('#objects').getByText('A space to think')).toBeVisible();
    await expect(page.getByText('Saved locally')).toBeVisible();
    await page.reload();
    await expect(page.locator('#objects [data-item]')).toHaveCount(4);
    expect(consoleErrors).toEqual([]);
  });
});
