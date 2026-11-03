import { test, expect, seed, settle } from './helpers';

// Timings are taken inside the page with a forced synchronous layout after React flushes.
// requestAnimationFrame is not used: background tabs are throttled to one frame per second.
test.describe('performance at the 2,000-object limit', () => {
  test('drag, zoom and search stay within budget', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(
      page,
      `const kinds = ['note', 'rectangle', 'ellipse', 'roundrect', 'text', 'card'], items = [];
       for (let i = 0; i < 1700; i++) items.push({ ...m.createItem(kinds[i % kinds.length], (i % 50) * 260, Math.floor(i / 50) * 260), text: 'Item ' + i });
       for (let i = 0; i < 299; i++) items.push({ ...m.createItem('arrow', 0, 0), from: items[i * 5].id, to: items[i * 5 + 3].id, connector: { path: i % 2 ? 'elbow' : 'curved' } });
       return { version: 1, title: 'Performance', items };`,
    );
    await expect(page.locator('#objects [data-item]').first()).toBeVisible();
    const result = await page.evaluate(async () => {
      const settle = async (check: () => boolean = () => true) => {
        for (let k = 0; k < 400; k++) {
          await new Promise(r => setTimeout(r, 0));
          if (check()) break;
        }
        void document.body.offsetHeight;
      };
      const click = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click();
      const zoomLabel = () => document.querySelector('.zoom-label')!.textContent;
      const out: Record<string, number> = {};
      for (const label of ['Zoom in', 'Zoom out']) {
        const before = zoomLabel(),
          s = performance.now();
        click(label);
        await settle(() => zoomLabel() !== before);
        out[label] = performance.now() - s;
      }
      const s = performance.now();
      click('Search board');
      await settle(() => !!document.querySelector('[aria-label="Search text, labels and tags"]'));
      const input = document.querySelector<HTMLInputElement>('[aria-label="Search text, labels and tags"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Item 12');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(() => /of/.test(document.querySelector('.search-count')?.textContent ?? ''));
      out.search = performance.now() - s;
      out.rendered = document.querySelectorAll('#objects [data-item]').length;
      return out;
    });
    // Drag with real mouse events: each step is timed until React has flushed and layout is clean.
    const box = await page.locator('#objects [data-item] rect.object-hit-area').nth(5).boundingBox();
    const x0 = box!.x + box!.width / 2,
      y0 = box!.y + box!.height / 2;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    const steps: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const s = Date.now();
      await page.mouse.move(x0 + i * 6, y0 + i * 3);
      await settle(page);
      steps.push(Date.now() - s);
    }
    await page.mouse.up();
    steps.sort((a, b) => a - b);
    result.dragMedian = steps[10];
    result.dragP90 = steps[18];
    for (const [k, v] of Object.entries(result))
      test.info().annotations.push({ type: k, description: `${Math.round(v)}${k === 'rendered' ? '' : ' ms'}` });
    expect(result.dragMedian, 'drag step median').toBeLessThan(50);
    expect(Math.max(result['Zoom in'], result['Zoom out']), 'zoom').toBeLessThan(300);
    expect(result.search, 'search').toBeLessThan(500);
  });
});
