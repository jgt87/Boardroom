import { test, expect, seed, fit, item, savedBoard, waitForSave } from './helpers';

test.describe('cards (item 115)', () => {
  test('card bar, panel, rich description, switch type and CSV', async ({ page }) => {
    await seed(
      page,
      `const card = { ...m.createItem('card', 0, 0), id: 'c1', text: 'Plan launch' };
       const card2 = { ...m.createItem('card', 320, 0), id: 'c2', text: 'Write notes' };
       const note = { ...m.createItem('note', 0, 300), id: 'n1', text: 'Idea' };
       const shape = { ...m.createItem('rectangle', 300, 300), id: 's1', text: 'Box' };
       const people = { ...m.createItem('people', 700, 0), id: 'p1' };
       people.data = { title: 'Team', members: [{ id: 'm1', name: 'Grace Hopper', color: '#4262ff' }] };
       return { version: 1, title: 'Cards', items: [card, card2, note, shape, people] };`,
    );
    await fit(page);
    const c1 = item(page, 'c1');

    // Select the first card (click its edge, not the title field) and set status, assignee, tag.
    await c1.click({ position: { x: 4, y: 30 } });
    const bar = page.locator('.selection-bar.floating');
    await bar.getByRole('button', { name: /Not started/ }).click();
    await page.getByRole('dialog', { name: 'Card status' }).getByRole('button', { name: 'In progress' }).click();
    await bar.getByRole('button', { name: /Assign/ }).click();
    await page.getByRole('dialog', { name: 'Assign card' }).getByRole('button', { name: 'Grace Hopper' }).click();
    await bar.getByRole('button', { name: 'Tags' }).click();
    const tags = page.getByRole('dialog', { name: 'Card tags' });
    await tags.getByRole('radio', { name: 'Tag colour Light red' }).click();
    await tags.getByLabel('New tag').fill('Urgent');
    await tags.getByRole('button', { name: 'Create' }).click();
    await expect(c1.locator('.w-tag', { hasText: 'Urgent' })).toHaveCSS('background-color', 'rgb(255, 227, 230)');
    await expect(c1.locator('.w-status')).toHaveText('In progress');
    await expect(c1.locator('.w-avatar')).toHaveText('GH');

    // Card panel with Ctrl+Shift+Enter; rich description with bold and a list.
    await page.keyboard.press('Escape');
    await c1.click({ position: { x: 4, y: 30 } });
    await page.keyboard.press('Control+Shift+Enter');
    const panel = page.getByRole('dialog').filter({ has: page.getByLabel('Card description') });
    const desc = panel.getByRole('textbox', { name: 'Card description' });
    await desc.click();
    await page.keyboard.press('Control+b');
    await page.keyboard.type('Bold');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- item one');
    await panel.getByLabel('Card start date').fill('2026-03-01');
    await panel.getByLabel('Card due date').fill('2026-03-10');
    await panel.getByLabel('Card status').selectOption({ label: 'No status' });
    await page.keyboard.press('Control+Enter');
    await waitForSave(page, b => !!b.items.find(i => i.id === 'c1')?.data?.description, 'card panel saved');
    let saved = await savedBoard(page);
    let c = saved.items.find(i => i.id === 'c1')!;
    expect(c.data!.description).toContain('**Bold**');
    expect(c.data!.description).toMatch(/^- item one$/m);
    expect(c.data!).toMatchObject({ status: '', start: '2026-03-01', due: '2026-03-10', assignee: 'Grace Hopper' });
    expect(saved.tagColors).toEqual({ Urgent: '#ffe3e6' });
    // Description is hidden on the face; an indicator shows instead.
    await expect(c1.locator('.w-card-hasdesc')).toBeVisible();
    await expect(c1).not.toContainText('item one');
    await expect(c1.locator('.w-status')).toHaveCount(0);

    // Expand icon on the card opens the panel too (deselect first so the selection bar is out of the way).
    await page.keyboard.press('Escape');
    await c1.getByRole('button', { name: 'Open card panel' }).click();
    await expect(desc.locator('strong').first()).toHaveText('Bold');
    await expect(desc.locator('ul li')).toHaveText('item one');
    await page.keyboard.press('Escape');

    // Remove a tag by clicking its remove button on the card.
    await c1.hover();
    await c1.getByRole('button', { name: 'Remove tag Urgent' }).click();
    await waitForSave(page, b => !b.items.find(i => i.id === 'c1')!.tags, 'tag removed');
    saved = await savedBoard(page);
    expect(saved.items.find(i => i.id === 'c1')!.tags).toBeUndefined();

    // Bulk switch type: note + shape become cards.
    await page.keyboard.press('Escape');
    await item(page, 'n1').click();
    await item(page, 's1').click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Switch 2 objects to cards' }).click();
    await waitForSave(page, b => b.items.find(i => i.id === 's1')!.type === 'card', 'switched to cards');
    saved = await savedBoard(page);
    expect(saved.items.filter(i => ['n1', 's1'].includes(i.id)).map(i => i.type)).toEqual(['card', 'card']);

    // CSV export of two selected cards.
    await page.keyboard.press('Escape');
    await c1.click({ position: { x: 4, y: 160 } });
    await item(page, 'c2').click({ position: { x: 4, y: 160 }, modifiers: ['Shift'] });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export to spreadsheet (CSV)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('boardroom-cards.csv');
    const text = await (await file.createReadStream()).toArray().then(b => Buffer.concat(b).toString('utf8'));
    expect(text).toContain('Plan launch');
    expect(text).toContain('Write notes');
    c = saved.items.find(i => i.id === 'c2')!;
    expect(c.type).toBe('card');
  });
});
