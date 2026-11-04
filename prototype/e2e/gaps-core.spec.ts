import { readFileSync } from 'node:fs';
import { test, expect, seed, fit, item, savedBoard, waitForSave, mouseDrag, center, webmBytes } from './helpers';
import type { Page } from '@playwright/test';

async function exportEntry(page: Page, label: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: label }).click(),
  ]);
  return readFileSync((await download.path())!, 'utf8');
}

test.describe('help-center gaps: core canvas', () => {
  test('A2: SVG export of a large board includes objects outside the view', async ({ page }) => {
    await seed(
      page,
      `const items = Array.from({ length: 450 }, (_, n) => ({ ...m.createItem('note', (n % 30) * 900, Math.floor(n / 30) * 900), id: 'n' + n, text: 'N' + n }));
       return { version: 1, title: 'Large', items };`,
    );
    // Zoom far in on one corner so most notes are culled from the DOM.
    await fit(page);
    for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
    const rendered = await page.locator('#objects [data-item^="n"]').count();
    expect(rendered).toBeLessThan(450);
    const svg = await exportEntry(page, 'Export as SVG');
    expect(svg.match(/data-item="n\d+"/g)?.length).toBe(450);
    // Culling comes back after the export.
    await expect.poll(() => page.locator('#objects [data-item^="n"]').count()).toBe(rendered);
  });

  test('B2/B6/B7: pasting cells, a link and lines creates a grid, a bookmark and notes', async ({ page }) => {
    await seed(page, `return { version: 1, title: 'Paste', items: [] };`);
    const paste = (text: string) =>
      page.evaluate(t => {
        const dt = new DataTransfer();
        dt.setData('text/plain', t);
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
      }, text);
    await paste('Name\tScore\nAda\t3');
    await paste('https://example.com/handbook');
    await paste('first idea\nsecond idea');
    await waitForSave(page, b => b.items.length === 4, 'pasted objects');
    const b = await savedBoard(page);
    expect(b.items.map(i => i.type)).toEqual(['grid', 'bookmark', 'note', 'note']);
    expect((b.items[0].data as { cells: string[][] }).cells).toEqual([
      ['Name', 'Score'],
      ['Ada', '3'],
    ]);
    await expect(page.locator('#objects [data-item]')).toHaveCount(4);
  });

  test('F5/F6/D6: keyboard zoom, pan, z-order, duplicate beside and clear contents', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Keys', items: [
         { ...m.createItem('note', 0, 0), id: 'a', text: 'Alpha' },
         { ...m.createItem('note', 100, 100), id: 'b', text: 'Beta' },
       ] };`,
    );
    await fit(page);
    const transform = () => page.locator('#objects').getAttribute('transform');
    const before = await transform();
    await page.keyboard.press('Control+=');
    await expect.poll(transform).not.toBe(before);
    const zoomed = await transform();
    await page.keyboard.press('ArrowRight');
    await expect.poll(transform).not.toBe(zoomed);

    await item(page, 'a').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('PageUp');
    await waitForSave(page, b => b.items.at(-1)!.id === 'a', 'brought to front');
    await page.keyboard.press('Shift+PageDown');
    await waitForSave(page, b => b.items[0].id === 'a', 'sent backward');

    await page.keyboard.press('Alt+ArrowRight');
    await waitForSave(page, b => b.items.length === 3, 'duplicated beside');
    let b = await savedBoard(page);
    const a = b.items.find(i => i.id === 'a')!,
      copy = b.items.find(i => !['a', 'b'].includes(i.id))!;
    expect(copy.x).toBe(a.x + a.w + 24);
    expect(copy.y).toBe(a.y);

    await page.keyboard.press('Control+Backspace');
    await waitForSave(page, b => b.items.find(i => i.id === copy.id)?.text === '', 'cleared');
    b = await savedBoard(page);
    expect(b.items.find(i => i.id === 'a')!.text).toBe('Alpha');
  });

  test('F1/F3/D4/D3/D10/D7: keyboard navigation, find and replace, switch type, frame around, paste style', async ({
    page,
  }) => {
    await seed(
      page,
      `return { version: 1, title: 'Edit', items: [
         { ...m.createItem('note', 0, 0), id: 'a', text: 'Plan alpha', fill: '#ff9d48' },
         { ...m.createItem('rectangle', 400, 0), id: 'b', text: 'plan beta' },
         { ...m.createItem('note', 0, 400), id: 'c', text: 'Gamma' },
       ] };`,
    );
    await fit(page);
    // Tab from the board selects objects in reading order and announces them.
    await page.locator('svg.canvas').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#sr-announcer')).toHaveText('Sticky note, Plan alpha');
    await page.keyboard.press('Tab');
    await expect(page.locator('#sr-announcer')).toHaveText(/^Rectangle, plan beta/);
    await page.keyboard.press('Control+ArrowLeft');
    await expect(page.locator('#sr-announcer')).toHaveText('Sticky note, Plan alpha');

    // Find and replace, limited to sticky notes.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+f');
    await page.getByRole('combobox', { name: 'Search text, labels and tags' }).fill('plan');
    await page.getByRole('combobox', { name: 'Object type' }).selectOption('note');
    await page.getByRole('button', { name: 'Replace', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Replace with' }).fill('Goal');
    await page.getByRole('button', { name: 'Replace all' }).click();
    await waitForSave(page, b => b.items[0].text === 'Goal alpha', 'replaced');
    expect((await savedBoard(page)).items[1].text).toBe('plan beta');
    await page.getByRole('button', { name: 'Close search' }).click();

    // Switch the rectangle to a sticky note.
    await item(page, 'b').click({ position: { x: 20, y: 20 } });
    await page.getByRole('combobox', { name: 'Switch type' }).selectOption('note');
    await waitForSave(page, b => b.items[1].type === 'note', 'switched');

    // Copy the orange note's style and paste it on Gamma.
    await page.keyboard.press('Escape');
    await item(page, 'a').click({ button: 'right', position: { x: 20, y: 20 } });
    await page.getByRole('menuitem', { name: /Copy style/ }).click();
    await page.keyboard.press('Escape');
    await item(page, 'c').click({ button: 'right', position: { x: 20, y: 20 } });
    await page.getByRole('menuitem', { name: /Paste style/ }).click();
    await waitForSave(page, b => b.items.find(i => i.id === 'c')!.fill === '#ff9d48', 'style pasted');

    // Frame around two objects.
    await page.keyboard.press('Escape');
    await item(page, 'a').click({ position: { x: 20, y: 20 } });
    await item(page, 'c').click({ position: { x: 20, y: 20 }, modifiers: ['Shift'] });
    await item(page, 'c').click({ button: 'right', position: { x: 20, y: 20 } });
    await page.getByRole('menuitem', { name: 'Create frame around' }).click();
    await waitForSave(page, b => b.items.some(i => i.type === 'frame'), 'frame created');
  });

  test('D2: snap to grid from the View menu', async ({ page }) => {
    await seed(page, `return { version: 1, title: 'Snap', items: [{ ...m.createItem('note', 13, 27), id: 'a' }] };`);
    await fit(page);
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page.locator('.main-menu-list [role="menuitem"]', { hasText: /^View/ }).first().hover();
    await page
      .locator('.main-menu-list')
      .last()
      .getByRole('menuitemcheckbox', { name: /Snap to grid/ })
      .click();
    await page.keyboard.press('Escape');
    const c = await center(item(page, 'a'));
    await mouseDrag(page, c, { x: c.x + 63, y: c.y + 41 });
    await waitForSave(page, b => b.items[0].x !== 13, 'moved');
    const a = (await savedBoard(page)).items[0];
    expect([a.x % 40, a.y % 40]).toEqual([0, 0]);
  });

  test('B11/B12: copy as image and choose the export image size', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seed(
      page,
      `return { version: 1, title: 'Img', items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Hi' }] };`,
    );
    await fit(page);
    const pngWidth = async (size: string) => {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      await page.getByRole('combobox', { name: 'Image size' }).selectOption(size);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.dropdown button', { hasText: 'Export as PNG' }).click(),
      ]);
      return readFileSync((await download.path())!).readUInt32BE(16);
    };
    const small = await pngWidth('1'),
      large = await pngWidth('4');
    expect(large).toBe(small * 4);
    await item(page, 'a').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Control+Shift+C');
    await expect(page.locator('.notice')).toContainText('Copied the selection as an image.');
    const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap(i => i.types));
    expect(types).toContain('image/png');
  });

  test('B10: a pasted image over 4 MB is downscaled instead of rejected', async ({ page }) => {
    await seed(page, `return { version: 1, title: 'Big image', items: [] };`);
    const bytes = await page.evaluate(async () => {
      // Random pixels do not compress, so this PNG is well over 4 MB.
      const c = document.createElement('canvas');
      c.width = 1800;
      c.height = 1400;
      const g = c.getContext('2d')!,
        img = g.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0;
      g.putImageData(img, 0, 0);
      const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));
      const file = new File([blob], 'noise.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
      return blob.size;
    });
    expect(bytes).toBeGreaterThan(4_000_000);
    await waitForSave(page, b => b.items.some(i => i.type === 'image'), 'image added', 20000);
    await expect(page.locator('.notice')).toHaveCount(0);
  });

  test('C16: a view-only board refuses edits until it is turned off', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Locked down', items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Keep' }] };`,
    );
    await fit(page);
    const toggleViewOnly = async () => {
      await page.getByRole('button', { name: 'Main menu' }).click();
      await page
        .locator('.main-menu-list [role="menuitem"]', { hasText: /^Board/ })
        .first()
        .hover();
      await page
        .locator('.main-menu-list')
        .last()
        .getByRole('menuitemcheckbox', { name: /View only/ })
        .click();
    };
    await toggleViewOnly();
    await waitForSave(page, b => b.viewOnly === true, 'view only on');
    await expect(page.locator('.board-status.view-only')).toBeVisible();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'new note');
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    await expect(page.locator('.notice')).toContainText('view-only');
    await item(page, 'a').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Delete');
    await page.keyboard.press('Escape');
    await toggleViewOnly();
    await waitForSave(page, b => b.viewOnly === undefined, 'view only off');
    const b = await savedBoard(page);
    expect(b.items.map(i => i.id)).toEqual(['a']);
  });

  test('C15: a saved version opens as a new board from History', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Now', items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Current' }] };`,
    );
    await page.evaluate(() => {
      const index = JSON.parse(localStorage.getItem('boardroom.boards.v1') ?? '{}');
      const old = {
        version: 1,
        title: 'Then',
        items: [{ id: 'old', type: 'note', x: 0, y: 0, w: 210, h: 210, text: 'Earlier', fill: '#fff49b' }],
      };
      localStorage.setItem(
        'boardroom.versions.' + index.activeId,
        JSON.stringify([{ at: '2026-11-01T10:00:00.000Z', title: 'Then', items: 1, board: old }]),
      );
    });
    await page.getByRole('button', { name: 'Main menu' }).click();
    await page
      .locator('.main-menu-list [role="menuitem"]', { hasText: /^Board/ })
      .first()
      .hover();
    await page
      .locator('.main-menu-list')
      .last()
      .getByRole('menuitem', { name: /^History/ })
      .click();
    const history = page.getByRole('complementary', { name: 'History' });
    await history.getByRole('button', { name: 'Restore as new board' }).click();
    await expect(page.locator('#objects [data-item="old"]')).toBeVisible();
    await expect(page.locator('.notice')).toContainText('Opened the version as a new board.');
  });

  test('F12: pin Card to the toolbar and drag tools onto the board', async ({ page }) => {
    await seed(page, `return { version: 1, title: 'Tools', items: [] };`);
    await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
    await page.getByRole('textbox', { name: 'Search tools' }).fill('card');
    await page.locator('.gallery-entry', { hasText: /^Card/ }).first().hover();
    await page.getByRole('button', { name: 'Pin Card to the toolbar' }).click();
    await page.getByRole('button', { name: 'Close tools' }).click();
    const pinned = page.locator('nav .pinned-tool', { hasText: 'Card' });
    await expect(pinned).toBeVisible();
    await pinned.dragTo(page.locator('svg.canvas'), { targetPosition: { x: 700, y: 400 } });
    await waitForSave(page, b => b.items.some(i => i.type === 'card'), 'card dropped');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Sticky note', exact: true }).dragTo(page.locator('svg.canvas'), {
      targetPosition: { x: 400, y: 300 },
    });
    await waitForSave(page, b => b.items.some(i => i.type === 'note'), 'note dropped');
    // The pin survives a reload (view preference).
    await page.reload();
    await expect(page.locator('nav .pinned-tool', { hasText: 'Card' })).toBeVisible();
  });

  test('D9: named layers take new objects, hide them and lock them', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Layers', items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Base' }] };`,
    );
    await fit(page);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Board layers' });
    await panel.getByRole('button', { name: 'Add layer' }).click();
    await waitForSave(page, b => (b.layers ?? []).length === 2, 'layer added');
    // The new layer is active, so pasted notes join it.
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'one\ntwo');
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    });
    await waitForSave(page, b => b.items.length === 3 && b.items.slice(1).every(i => !!i.layer), 'notes on layer');
    await panel.getByRole('button', { name: 'Hide Layer 2' }).click();
    await expect(page.locator('#objects [data-item]')).toHaveCount(1);
    await panel.getByRole('button', { name: 'Lock Layer 1' }).click();
    await item(page, 'a').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Delete');
    await page.waitForTimeout(400);
    expect((await savedBoard(page)).items.some(i => i.id === 'a')).toBe(true);
  });

  test('F11: two-finger pinch zooms the board', async ({ page }) => {
    await seed(page, `return { version: 1, title: 'Touch', items: [{ ...m.createItem('note', 0, 0), id: 'a' }] };`);
    await fit(page);
    const before = await page.locator('#objects').getAttribute('transform');
    await page.evaluate(() => {
      const svg = document.querySelector('svg.canvas')!;
      const ev = (type: string, id: number, x: number) =>
        svg.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'touch',
            clientX: x,
            clientY: 400,
            bubbles: true,
            button: 0,
            isPrimary: id === 1,
          }),
        );
      ev('pointerdown', 1, 600);
      ev('pointerdown', 2, 700);
      ev('pointermove', 1, 550);
      ev('pointermove', 2, 750);
      ev('pointerup', 1, 550);
      ev('pointerup', 2, 750);
    });
    const after = await page.locator('#objects').getAttribute('transform');
    const scale = (t: string | null) => Number(/scale\(([\d.]+)\)/.exec(t ?? '')?.[1]);
    expect(scale(after) / scale(before)).toBeCloseTo(2, 1);
    expect((await savedBoard(page)).items).toHaveLength(1);
  });

  test('B18: an encrypted backup is saved with a passphrase and opens again with it', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Vault', items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Secret' }] };`,
    );
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.locator('.dropdown button', { hasText: 'Save encrypted backup' }).click();
    const dialog = page.getByRole('dialog', { name: 'Save encrypted backup' });
    await dialog.getByLabel('Passphrase', { exact: true }).fill('correct horse');
    await dialog.getByLabel('Repeat passphrase').fill('correct horse');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Save encrypted backup' }).click(),
    ]);
    const file = (await download.path())!;
    expect(readFileSync(file, 'utf8')).not.toContain('Secret');
    // Change the board, then import the backup.
    await item(page, 'a').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Delete');
    await waitForSave(page, b => b.items.length === 0, 'deleted');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('.dropdown button', { hasText: 'Import backup' }).click(),
    ]);
    await chooser.setFiles(file);
    const open = page.getByRole('dialog', { name: 'Open encrypted backup' });
    await open.getByLabel('Passphrase', { exact: true }).fill('correct horse');
    await open.getByRole('button', { name: 'Open backup' }).click();
    await waitForSave(page, b => b.items.some(i => i.text === 'Secret'), 'restored');
  });

  test('D13: react to sticky notes and count stickers', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'React', items: [
         { ...m.createItem('note', 0, 0), id: 'n', text: 'Idea' },
         { ...m.createItem('stamp', 400, 0), id: 's' },
       ] };`,
    );
    await fit(page);
    await item(page, 'n').click({ position: { x: 20, y: 20 } });
    await page.getByRole('button', { name: 'React', exact: true }).click();
    await page.getByRole('button', { name: 'React 👍' }).click();
    await page.getByRole('button', { name: 'React 👍' }).click();
    await waitForSave(page, b => b.items[0].reactions?.['👍'] === 2, 'two thumbs');
    await expect(item(page, 'n').getByRole('img', { name: '👍 2' })).toBeAttached();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await item(page, 's').click();
    await page.getByRole('button', { name: /^\+1/ }).click();
    await waitForSave(page, b => b.items[1].data?.count === 2, 'sticker counted');
    await expect(item(page, 's').getByRole('img', { name: /stamp, 2$/ })).toBeAttached();
  });

  test('G10: @mention someone from a People widget in a comment', async ({ page }) => {
    await seed(
      page,
      `const people = { ...m.createItem('people', 400, 0), id: 'p' };
       people.data = { title: 'Team', members: [{ id: 'm1', name: 'Grace Hopper', color: '#4262ff' }] };
       return { version: 1, title: 'Mentions', items: [{ ...m.createItem('note', 0, 0), id: 'n', text: 'Idea' }, people] };`,
    );
    await fit(page);
    await item(page, 'n').click({ button: 'right', position: { x: 20, y: 20 } });
    await page.getByRole('menuitem', { name: /^Comment/ }).click();
    const field = page.getByRole('textbox', { name: 'New comment' });
    await field.pressSequentially('Ask @gra');
    await page.getByRole('group', { name: 'Mention someone' }).getByRole('button', { name: '@Grace Hopper' }).click();
    await expect(field).toHaveValue('Ask @Grace Hopper ');
    await field.pressSequentially('please');
    await page.keyboard.press('Control+Enter');
    await waitForSave(page, b => (b.comments ?? []).length === 1, 'comment saved');
    await expect(page.locator('mark.mention', { hasText: '@Grace Hopper' })).toBeVisible();
  });

  test('G12: estimate chips apply to selected cards and can be dragged onto a card', async ({ page }) => {
    await seed(
      page,
      `return { version: 1, title: 'Estimates', items: [
         { ...m.createItem('card', 0, 0), id: 'a', text: 'A' },
         { ...m.createItem('card', 400, 0), id: 'b', text: 'B' },
       ] };`,
    );
    await fit(page);
    await item(page, 'a').click({ position: { x: 4, y: 160 } });
    await page.getByRole('button', { name: 'Estimate', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Estimate' });
    await dialog.getByRole('group', { name: 'Story points' }).getByRole('button', { name: '5', exact: true }).click();
    await waitForSave(page, b => b.items[0].data?.points === 5, 'points set');
    await dialog
      .getByRole('group', { name: 'T-shirt size' })
      .getByRole('button', { name: 'M', exact: true })
      .dragTo(item(page, 'b'), { targetPosition: { x: 4, y: 160 } });
    await waitForSave(page, b => b.items[1].data?.size === 'M', 'size dropped on B');
  });

  test('G13: turn frames into slides and export the deck as PDF', async ({ page }) => {
    await seed(
      page,
      `const f = { ...m.createItem('frame', 0, 0), id: 'f', text: 'Plan', w: 600, h: 400 };
       return { version: 1, title: 'Deck', items: [f, { ...m.createItem('note', 40, 60), id: 'n', text: 'Ship it' }] };`,
    );
    await fit(page);
    const box = (await item(page, 'f').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.85, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Turn frames into slides' }).click();
    await waitForSave(page, b => b.items.some(i => i.type === 'slides'), 'deck created');
    const deck = (await savedBoard(page)).items.find(i => i.type === 'slides')!;
    expect((deck.data as { slides: { title: string; body: string }[] }).slides[0]).toMatchObject({
      title: 'Plan',
      body: '- Ship it',
    });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(
      readFileSync((await download.path())!)
        .subarray(0, 5)
        .toString('latin1'),
    ).toBe('%PDF-');
  });

  test('B9/G14: drop a video file, then find, rename and trim it from the recordings list', async ({ page }) => {
    await seed(page, `return { version: 1, title: 'Clips', items: [] };`);
    const bytes = [...(await webmBytes())];
    await page.evaluate(data => {
      const file = new File([new Uint8Array(data)], 'clip.webm', { type: 'video/webm' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const svg = document.querySelector('svg.canvas')!;
      svg.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 600, clientY: 400 }),
      );
    }, bytes);
    await waitForSave(page, b => b.items.some(i => i.type === 'video'), 'video dropped', 20000);
    await page.getByRole('button', { name: 'Formats and Flows' }).click();
    await page.locator('.gallery-items button', { hasText: 'Talktrack' }).first().click();
    const list = page.getByRole('region', { name: 'Recordings on this board' });
    await list.getByRole('button', { name: 'Rename or trim' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Video title').fill('Demo');
    await dialog.getByLabel('Trim start').fill('0:00.2');
    await dialog.getByLabel('Trim end').fill('0:00.6');
    await page.keyboard.press('Control+Enter');
    await waitForSave(page, b => b.items.find(i => i.type === 'video')?.text === 'Demo', 'renamed');
    const v = (await savedBoard(page)).items.find(i => i.type === 'video')!;
    expect(v.data?.trim).toEqual({ start: 0.2, end: 0.6 });
  });

  test('F12: pinned tools reorder by dragging one onto another', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('boardroom.view.v1', JSON.stringify({ pinned: ['card', 'grid'] })),
    );
    await seed(page, `return { version: 1, title: 'Pins', items: [] };`);
    const pins = page.locator('nav .pinned-tool');
    await expect(pins).toHaveCount(2);
    await pins.nth(1).dragTo(pins.nth(0));
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('boardroom.view.v1')!).pinned))
      .toEqual(['grid', 'card']);
    expect((await savedBoard(page)).items).toHaveLength(0);
  });
});
