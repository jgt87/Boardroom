import { test, expect, seed, savedBoard, waitForSave, item, center, mouseDrag, selectViaLayers, fit } from './helpers';

test.describe('feature smoke', () => {
  test('connector bend drag commits and undo restores the automatic route', async ({ page }) => {
    await seed(
      page,
      `const a = { ...m.createItem('rectangle', 100, 200), id: 'a', text: 'Start' };
       const b = { ...m.createItem('rectangle', 800, 200), id: 'b', text: 'End' };
       const c = { ...m.createItem('arrow', 0, 0), id: 'c', from: 'a', to: 'b', text: 'routed', connector: { path: 'elbow' } };
       return { version: 1, title: 'Bends', items: [a, b, c] };`,
    );
    await selectViaLayers(page, 'routed');
    const handle = page.locator('[data-bend^="segment"]').first();
    await expect(handle).toBeVisible();
    const h = await center(handle);
    await mouseDrag(page, h, { x: h.x, y: h.y - 120 });
    await waitForSave(
      page,
      b => (b.items.find((i: any) => i.id === 'c').connector.bends ?? []).length > 0,
      'bends saved',
    );
    await page.getByRole('button', { name: 'Undo' }).click();
    await waitForSave(page, b => !b.items.find((i: any) => i.id === 'c').connector.bends, 'bends undone');
  });

  test('self-loop connector is drawn outside its object', async ({ page }) => {
    await seed(
      page,
      `const n = { ...m.createItem('note', 300, 300), id: 'n' };
       const loop = { ...m.createItem('arrow', 0, 0), id: 'loop', from: 'n', to: 'n', text: 'retry', connector: { path: 'curved', startSide: 'right', endSide: 'top' } };
       return { version: 1, title: 'Loop', items: [n, loop] };`,
    );
    const note = await item(page, 'n').locator('rect.object-hit-area').boundingBox();
    const path = await item(page, 'loop').locator('path').last().boundingBox();
    expect(path!.x + path!.width).toBeGreaterThan(note!.x + note!.width);
    expect(path!.y).toBeLessThan(note!.y);
    await expect(item(page, 'loop')).toContainText('retry');
  });

  test('search highlights matches and moves between them', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Search', items: ['Alpha roadmap', 'Beta', 'Gamma roadmap'].map((t, i) => ({ ...m.createItem('note', i * 300, 0), text: t })) };`,
    );
    await page.locator('svg.canvas').focus();
    await page.keyboard.press('Control+F');
    await page.getByRole('combobox', { name: 'Search text, labels and tags' }).fill('roadmap');
    await expect(page.locator('.search-count')).toHaveText('1 of 2');
    await expect(page.locator('#objects .search-hit')).toHaveCount(2);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.search-count')).toHaveText('2 of 2');
    const before = JSON.stringify((await savedBoard(page)).items.map((i: any) => i.text));
    expect(before).toContain('Alpha roadmap');
  });

  test('presentation mode follows the stored order and Esc restores the editor', async ({ page }) => {
    await seed(
      page,
      `const a = { ...m.createItem('frame', 0, 0), id: 'fa', text: 'First slide' }, b = { ...m.createItem('frame', 900, 0), id: 'fb', text: 'Second slide' };
       return { version: 1, title: 'Slides', items: [a, b], presentation: ['fb', 'fa'] };`,
    );
    await page.getByRole('button', { name: 'Presentation', exact: true }).click();
    await page.getByRole('button', { name: 'Present from the start' }).click();
    const bar = page.locator('.present-bar');
    await expect(bar).toContainText('Second slide · 1 / 2');
    await expect(page.locator('.board-header')).toBeHidden();
    await page.keyboard.press('ArrowRight');
    await expect(bar).toContainText('First slide · 2 / 2');
    await page.keyboard.press('Escape');
    await expect(page.locator('.present-overlay')).toHaveCount(0);
    await expect(page.locator('.board-header')).toBeVisible();
  });

  test('Mermaid flowchart converts to native shapes in one undo step', async ({ page }) => {
    await seed(
      page,
      `const d = { ...m.createItem('mermaid', 0, 0), id: 'mm', text: 'flowchart LR\\n  A[Start] --> B{Ready?}\\n  B -->|yes| C(Ship)\\n  B -- no --> D[(Backlog)]' };
       return { version: 1, title: 'Mermaid', items: [d] };`,
    );
    await fit(page);
    // The first Mermaid render is heavy; wait for it so the two clicks register as a double-click.
    await expect(item(page, 'mm').locator('.mermaid-preview svg')).toBeVisible({ timeout: 20_000 });
    await item(page, 'mm').dblclick();
    await page.getByRole('button', { name: /Convert to shapes/ }).click();
    await waitForSave(
      page,
      b =>
        !b.items.some((i: any) => i.id === 'mm') &&
        b.items.filter((i: any) => i.type !== 'arrow' && i.type !== 'frame').length === 4,
      'converted',
    );
    const b = await savedBoard(page);
    // The shapes sit in a frame that keeps the Mermaid code (see mermaid-link.spec.ts).
    expect(b.items.find((i: any) => i.type === 'frame').data.mermaid.code).toContain('B -- no --> D');
    expect(
      b.items
        .filter((i: any) => i.type !== 'arrow' && i.type !== 'frame')
        .map((i: any) => `${i.type}:${i.text}`)
        .sort(),
    ).toEqual(['cylinder:Backlog', 'diamond:Ready?', 'rectangle:Start', 'roundrect:Ship']);
    expect(
      b.items
        .filter((i: any) => i.type === 'arrow')
        .map((i: any) => i.text)
        .sort(),
    ).toEqual(['', 'no', 'yes']);
    await page.getByRole('button', { name: 'Undo' }).click();
    await waitForSave(page, x => x.items.length === 1 && x.items[0].id === 'mm', 'undo restores the diagram');
  });

  test('dot voting enforces the budget; comments attach to objects', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Vote', items: ['One', 'Two'].map((t, i) => ({ ...m.createItem('note', i * 300, 100), id: 'v' + i, text: t })) };`,
    );
    await page.getByRole('button', { name: 'Collaborate and review' }).click();
    await page.locator('.facilitate-menu button', { hasText: 'Dot voting' }).click();
    await page.getByRole('spinbutton', { name: 'Votes per session' }).fill('1');
    await page.getByRole('button', { name: 'Vote on whole board' }).click();
    const add = page.locator('[data-vote="1"]');
    await expect(add).toHaveCount(2);
    await add.first().dispatchEvent('pointerdown');
    await add.nth(1).dispatchEvent('pointerdown');
    // A refused vote is an error notice, announced through the alert region (item 148).
    await expect(page.getByRole('alert').filter({ hasText: 'All 1 votes are used' })).toBeVisible();
    await page.getByRole('button', { name: 'End vote and keep results' }).click();
    await waitForSave(page, b => !b.voting && b.votingResults?.[0]?.totals?.[0]?.votes === 1, 'results stored');
    await page.getByRole('button', { name: 'Close dot voting' }).click();

    await selectViaLayers(page, 'Two');
    await page.getByRole('button', { name: 'Comment on object' }).click();
    await page.getByRole('textbox', { name: 'New comment' }).fill('Needs an owner');
    await page.locator('.comment-popover').getByRole('button', { name: 'Comment' }).click();
    await waitForSave(
      page,
      b => b.comments?.[0]?.itemId === 'v1' && b.comments[0].messages[0].text === 'Needs an owner',
      'comment saved',
    );
    await expect(page.locator('.comment-pin')).toHaveCount(1);
  });

  test('prototype preview toggles inputs without editing the board', async ({ page }) => {
    test.setTimeout(20_000);
    await seed(
      page,
      `const s = { ...m.createItem('screen', 0, 0), id: 'scr' };
       const t = { ...media.wireframeItem('toggle', { x: s.x + s.w / 2, y: s.y + 200 }, (k, x, y) => m.createItem(k, x, y)), id: 'tog' };
       return { version: 1, title: 'Proto', items: [s, t] };`,
    );
    await selectViaLayers(page, 'screen', 'type');
    await page.locator('.selection-bar .widget-action', { hasText: 'Preview prototype' }).click();
    await expect(page.locator('.proto-preview')).toBeVisible();
    const toggle = item(page, 'tog').locator('[role=switch]');
    await expect(toggle).toHaveCount(1, { timeout: 3000 });
    const before = await toggle.getAttribute('aria-checked');
    await toggle.click();
    await expect(toggle).not.toHaveAttribute('aria-checked', before!);
    await page.keyboard.press('Escape');
    await expect(page.locator('.proto-preview')).toHaveCount(0);
    expect((await savedBoard(page)).items.find((i: any) => i.id === 'tog').data.state).toBe(true);
  });

  test('timer pauses, frame contents hide, and crossing connectors jump', async ({ page }) => {
    await seed(
      page,
      `const f = { ...m.createItem('frame', 0, 0), id: 'fr', text: 'Hidden frame' }, n = { ...m.createItem('note', 40, 60), id: 'inner', text: 'Secret' };
       const h = { ...m.createItem('arrow', 0, 0), id: 'h', x: 900, y: 300, w: 400, h: 0 }, v = { ...m.createItem('arrow', 0, 0), id: 'v', x: 1100, y: 100, w: 0, h: 400 };
       return { version: 1, title: 'Misc', items: [f, n, h, v] };`,
    );
    await expect(item(page, 'v').locator('path').last()).toHaveAttribute('d', / A\d/);

    await page.getByRole('button', { name: 'Collaborate and review' }).click();
    await page.locator('.facilitate-menu button', { hasText: 'Timer' }).click();
    await page.getByRole('combobox', { name: 'Timer duration' }).selectOption({ label: '1 min' });
    await page.getByRole('button', { name: 'Start timer' }).click();
    await page.waitForTimeout(1300);
    await page.getByRole('button', { name: 'Pause timer' }).click();
    const paused = await page.locator('.board-timer .clock').textContent();
    expect(paused).toMatch(/^00:5\d$/);
    await page.waitForTimeout(1200);
    await expect(page.locator('.board-timer .clock')).toHaveText(paused!);

    await selectViaLayers(page, 'Hidden frame');
    await page.getByRole('button', { name: 'Hide contents' }).click();
    await expect(page.locator('.frame-cover')).toHaveCount(1);
    await expect(item(page, 'inner')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show contents' }).click();
    await expect(item(page, 'inner')).toHaveCount(1);
  });
});
