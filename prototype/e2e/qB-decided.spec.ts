// Decided open questions: placed dots on paste and duplicate (P1-Q5), read-only board settings on a
// comment-only board (P2-Q11), the sensitivity label on the web page export (P2-Q12) and the original file kept
// beside an Office/OpenDocument conversion (P2-Q8).
import { readFileSync } from 'node:fs';
import { test, expect, seed, savedBoard, waitForSave, fit, item } from './helpers';
import type { Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

const copyHtml = (page: Page) =>
  page.evaluate(() => {
    const dt = new DataTransfer();
    window.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt }));
    return dt.getData('text/html');
  });
const pasteHtml = (page: Page, html: string) =>
  page.evaluate(h => {
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
  }, html);

test('P1-Q5: paste and duplicate drop placed dots unless the dot pile comes along', async ({ page }) => {
  await seed(
    page,
    `const pile = { ...m.createItem('dotpile', 0, 0), id: 'a', data: { title: 'Votes', total: 5, color: '#e8445a' } };
     const note = { ...m.createItem('note', 400, 0), id: 'n', text: 'Idea', dots: [{ pile: 'a', color: '#e8445a', n: 2 }] };
     return { version: 1, title: 'Dots', items: [pile, note] };`,
  );
  await fit(page);
  // The voted object alone: the copy has no dots.
  await item(page, 'n').click({ position: { x: 20, y: 60 } });
  await pasteHtml(page, await copyHtml(page));
  await waitForSave(page, b => b.items.length === 3, 'object pasted');
  let b = await savedBoard(page);
  expect(b.items.find(i => i.id !== 'n' && i.type === 'note')!.dots).toBeUndefined();
  expect(b.items.find(i => i.id === 'n')!.dots).toEqual([{ pile: 'a', color: '#e8445a', n: 2 }]);
  // Duplicate (Ctrl+D) of the object alone: no dots either.
  await item(page, 'n').click({ position: { x: 20, y: 60 } });
  await page.keyboard.press('Control+d');
  await waitForSave(page, x => x.items.length === 4, 'object duplicated');
  b = await savedBoard(page);
  expect(b.items.filter(i => i.type === 'note' && i.dots).map(i => i.id)).toEqual(['n']);
  // The pile and the object together: the copy keeps its dots, pointing at the pasted pile.
  await page.keyboard.press('Escape');
  await item(page, 'a').click({ position: { x: 20, y: 20 } });
  await item(page, 'n').click({ position: { x: 20, y: 60 }, modifiers: ['Shift'] });
  await pasteHtml(page, await copyHtml(page));
  await waitForSave(page, x => x.items.length === 6, 'pile and object pasted');
  b = await savedBoard(page);
  const newPile = b.items.find(i => i.type === 'dotpile' && i.id !== 'a')!;
  const withDots = b.items.filter(i => i.type === 'note' && i.dots);
  expect(withDots.map(i => i.dots[0].pile).sort()).toEqual(['a', newPile.id].sort());
  // The pasted pile shows 3 of 5 dots left, as the original does.
  await expect(page.locator(`[data-item="${newPile.id}"]`)).toContainText('3 of 5 left');
});

test('P2-Q11: board settings are read-only on a comment-only board', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Review', commentOnly: true, status: 'draft', sensitivity: { level: 'internal' },
       items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Keep' }] };`,
  );
  await expect(page.getByRole('textbox', { name: 'Board name' })).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.locator('.main-menu-list [role="menuitem"]', { hasText: /^Assign status/ }).hover();
  const statusList = page.locator('.main-menu-list').last();
  await expect(statusList.locator('.settings-locked-note')).toContainText('comment-only');
  const done = statusList.getByRole('menuitemcheckbox', { name: /^Done/ });
  await expect(done).toHaveAttribute('aria-disabled', 'true');
  await expect(statusList.getByRole('menuitemcheckbox', { name: /^Draft/ })).toHaveAttribute('aria-checked', 'true');
  await done.click({ force: true });
  await page.keyboard.press('Escape');
  // Sensitivity: the presets are disabled and the custom form cannot be used.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page
    .locator('.main-menu-list [role="menuitem"]', { hasText: /^Board/ })
    .first()
    .hover();
  await page
    .locator('.main-menu-list')
    .last()
    .locator('[role="menuitem"]', { hasText: /^Sensitivity label/ })
    .hover();
  const labelList = page.locator('.main-menu-list').last();
  await expect(labelList.getByRole('menuitemcheckbox', { name: /^Restricted/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(labelList.getByRole('textbox', { name: 'Custom sensitivity label' })).toHaveAttribute('readonly', '');
  await expect(labelList.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await page.keyboard.press('Escape');
  const b = await savedBoard(page);
  expect(b.status).toBe('draft');
  expect(b.sensitivity).toEqual({ level: 'internal' });
  await expect(page.locator('.notice')).toHaveCount(0);
});

test('P2-Q12: the web page export shows the sensitivity label', async ({ page, context }) => {
  await seed(
    page,
    `return { version: 1, title: 'Plans', sensitivity: { level: 'confidential' },
       items: [{ ...m.createItem('note', 0, 0), id: 'a', text: 'Budget' }] };`,
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: 'Export as web page' }).first().click(),
  ]);
  const html = readFileSync((await download.path())!, 'utf8');
  const viewer = await context.newPage();
  await viewer.setContent(html);
  await expect(viewer.locator('header .sensitivity-badge')).toHaveText('Confidential');
  await expect(viewer.locator('.sensitivity-page-stamp')).toBeVisible();
  await expect(viewer.locator('.sensitivity-page-stamp')).toHaveText('Confidential');
  // The SVG keeps its own corner stamp, as image exports do.
  await expect(viewer.locator('#board svg .sensitivity-stamp')).toHaveCount(1);
  await viewer.close();
});

test('P2-Q8: a converted OpenDocument file is kept beside the Doc, in one undo step', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Imports', items: [] };`);
  const odt = Buffer.from(
    zipSync({
      mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
      'content.xml': strToU8(
        '<office:document-content><office:body><office:text><text:h text:outline-level="1">Roadmap</text:h></office:text></office:body></office:document-content>',
      ),
    }),
  );
  const box = (await page.locator('svg.canvas').boundingBox())!;
  await page.evaluate(
    ({ at, b64 }) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))], 'plan.odt', {
          type: 'application/vnd.oasis.opendocument.text',
        }),
      );
      const target = document.elementFromPoint(at.x, at.y) ?? document.querySelector('svg.canvas')!;
      target.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: dt }),
      );
    },
    { at: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, b64: odt.toString('base64') },
  );
  await waitForSave(page, b => b.items.length === 2, 'doc and original added');
  const b = await savedBoard(page);
  const doc = b.items.find(i => i.type === 'doc')!,
    file = b.items.find(i => i.type === 'file')!;
  expect(doc.data.markdown).toBe('# Roadmap');
  expect(file.text).toBe('plan.odt');
  expect(file.data.size).toBe(odt.length);
  expect(file.x).toBeGreaterThan(doc.x + doc.w);
  expect(file.y).toBe(doc.y);
  await expect(page.getByRole('status')).toContainText('original file is kept');
  // The kept original downloads byte for byte.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download plan.odt' }).click(),
  ]);
  expect(readFileSync((await download.path())!)).toEqual(odt);
  // One undo step removes both.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, x => x.items.length === 0, 'both undone');
});
