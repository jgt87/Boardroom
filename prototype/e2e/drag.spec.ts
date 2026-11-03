import { test, expect, seed, savedBoard, waitForSave, item, center, mouseDrag, selectViaLayers } from './helpers';

test.describe('native pointer drag', () => {
  test('moves a sticky note and a wireframe by its body; a locked note stays put', async ({ page }) => {
    await seed(
      page,
      `const note = { ...m.createItem('note', 200, 200), id: 'note-1', text: 'Drag me' };
       const locked = { ...m.createItem('note', 600, 200), id: 'locked-1', text: 'Locked', locked: true };
       const wf = { ...media.wireframeItem('button', { x: 400, y: 560 }, (t, x, y) => m.createItem(t, x, y)), id: 'wf-1' };
       return { version: 1, title: 'Drag', items: [note, locked, wf] };`,
    );
    const before = await savedBoard(page);
    const pos = (b: any, id: string) => b.items.find((i: any) => i.id === id);
    const noteStart = await center(item(page, 'note-1'));
    await mouseDrag(page, noteStart, { x: noteStart.x + 150, y: noteStart.y + 20 });
    await waitForSave(page, b => pos(b, 'note-1').x > pos(before, 'note-1').x + 100, 'note moved right');

    const wfStart = await center(item(page, 'wf-1'));
    await mouseDrag(page, wfStart, { x: wfStart.x + 80, y: wfStart.y - 60 });
    await waitForSave(
      page,
      b => pos(b, 'wf-1').x > pos(before, 'wf-1').x + 50 && pos(b, 'wf-1').y < pos(before, 'wf-1').y - 30,
      'wireframe moved',
    );

    const lockedStart = await center(item(page, 'locked-1'));
    await mouseDrag(page, lockedStart, { x: lockedStart.x + 120, y: lockedStart.y + 120 });
    await page.waitForTimeout(600);
    const after = await savedBoard(page);
    expect([pos(after, 'locked-1').x, pos(after, 'locked-1').y]).toEqual([600, 200]);
    await expect(page.locator('.selection-bar').first()).toContainText('Locked');
  });

  test('moves a Kanban card between columns in the records editor', async ({ page }) => {
    await seed(
      page,
      `const k = { ...m.createItem('kanban', 100, 100), id: 'kan', datasetId: 'd1' };
       return { version: 1, title: 'Kanban', items: [k], datasets: { d1: [
         { id: 'r1', title: 'Design', status: 'Not started', assignee: '', start: '', end: '' },
         { id: 'r2', title: 'Build', status: 'In progress', assignee: '', start: '', end: '' } ] } };`,
    );
    await item(page, 'kan')
      .locator('.rich-title')
      .click({ position: { x: 8, y: 8 } });
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .locator('[data-card="r1"]')
      .dragTo(dialog.locator('section[aria-label="Complete column"]'), { sourcePosition: { x: 5, y: 5 } });
    await expect(dialog.locator('section[aria-label="Complete column"] [data-card="r1"]')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await waitForSave(
      page,
      b => b.datasets!.d1.find((r: any) => r.id === 'r1').status === 'Complete',
      'record status saved',
    );
  });

  test('moves a story between cells and reparents a person in the org chart', async ({ page }) => {
    await seed(
      page,
      `const s = { ...m.createItem('storymap', 0, 0), id: 'sm' };
       const o = { ...m.createItem('orgchart', 0, 600), id: 'org' };
       return { version: 1, title: 'Diagrams', items: [s, o] };`,
    );
    await item(page, 'sm')
      .locator('.rich-title')
      .click({ position: { x: 8, y: 8 } });
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog
      .locator('[data-story]', { hasText: 'Find the board' })
      .dragTo(dialog.locator('.story-cell[aria-label="Deliver · Release 2"]'));
    await waitForSave(
      page,
      b => {
        const map = b.items.find((i: any) => i.id === 'sm').data;
        const card = map.cards.find((c: any) => c.title === 'Find the board');
        return (
          map.activities.find((a: any) => a.id === card.activity)?.title === 'Deliver' &&
          map.releases.find((r: any) => r.id === card.release)?.title === 'Release 2'
        );
      },
      'story moved to Deliver / Release 2',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await item(page, 'org')
      .locator('.rich-title')
      .click({ position: { x: 8, y: 8 } });
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    dialog = page.getByRole('dialog');
    const people = dialog.locator('li[data-node]');
    await expect(people).toHaveCount(3);
    const [firstLead, secondLead] = [people.nth(1), people.nth(2)];
    const target = await firstLead.getAttribute('data-node');
    const moved = await secondLead.getAttribute('data-node');
    await secondLead.dragTo(firstLead);
    await waitForSave(
      page,
      b => b.items.find((i: any) => i.id === 'org').data.nodes.find((n: any) => n.id === moved).parent === target,
      'person reparented',
    );
  });

  test('reorders objects in the Layers panel', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Layers', items: ['A', 'B', 'C'].map((t, i) => ({ ...m.createItem('note', i * 260, 0), id: 'n' + t, text: 'Note ' + t })) };`,
    );
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const rows = page.locator('.layer-row');
    // Front-most first: C, B, A. Drag A (back) onto C (front).
    await rows.filter({ hasText: 'Note A' }).dragTo(rows.filter({ hasText: 'Note C' }));
    await waitForSave(page, b => b.items.at(-1).id === 'nA', 'A moved to the front');
  });

  test('dragging into an auto-layout container shows the drop line and adopts the object', async ({ page }) => {
    await seed(
      page,
      `const c = { ...m.createItem('autolayout', 400, 100), id: 'box' };
       const n = { ...m.createItem('note', 60, 500), id: 'loose', w: 140, h: 140, text: 'Adopt me' };
       return { version: 1, title: 'Auto layout', items: [c, n] };`,
    );
    const from = await center(item(page, 'loose'));
    const to = await center(item(page, 'box'));
    let indicatorSeen = false;
    await mouseDrag(page, from, to, 15, async () => {
      indicatorSeen = (await page.locator('line.drop-indicator').count()) > 0;
    });
    expect(indicatorSeen, 'drop indicator shown while dragging').toBe(true);
    await waitForSave(
      page,
      b => b.items.find((i: any) => i.id === 'box').data.children.includes('loose'),
      'container adopted the note',
    );
    await expect(page.locator('line.drop-indicator')).toHaveCount(0);
  });

  test('selecting through Layers then dragging keeps the object selected', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Sel', items: [{ ...m.createItem('rectangle', 300, 300), id: 'r1', text: 'Box' }] };`,
    );
    await selectViaLayers(page, 'Box');
    await expect(page.locator('.selection-bar').first()).toBeVisible();
    const c = await center(item(page, 'r1'));
    await mouseDrag(page, c, { x: c.x - 100, y: c.y + 50 });
    await waitForSave(page, b => b.items[0].x < 250, 'rectangle moved');
  });
});
