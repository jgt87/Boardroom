// Track R2: export fidelity (frame titles, selection SVG, export area, print), SVG/BMP images, spreadsheets
// into a Grid, original-file download, pictures dragged from web pages and image adjustments.
import { readFileSync } from 'node:fs';
import { test, expect, seed, savedBoard, waitForSave, pngBytes, item, openTools, center } from './helpers';
import type { Page } from '@playwright/test';

const seedBoard = (page: Page) =>
  seed(
    page,
    `const f = { ...m.createItem('frame', 0, 0), id: 'f1', text: 'Launch frame', w: 800, h: 450 };
     const a = { ...m.createItem('note', 40, 60), id: 'n1', text: 'Plan the launch' };
     const b = { ...m.createItem('note', 1000, 60), id: 'n2', text: 'Write the brief' };
     return { version: 1, title: 'R2', items: [f, a, b] };`,
  );
async function exportEntry(page: Page, label: string) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: label }).first().click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: readFileSync(path!) };
}
/** Drop files (or plain drag data) on the canvas at a screen point. */
async function drop(
  page: Page,
  at: { x: number; y: number },
  files: { name: string; type: string; b64: string }[],
  data: Record<string, string> = {},
) {
  await page.evaluate(
    ({ at, files, data }) => {
      const dt = new DataTransfer();
      for (const f of files)
        dt.items.add(new File([Uint8Array.from(atob(f.b64), ch => ch.charCodeAt(0))], f.name, { type: f.type }));
      for (const [k, v] of Object.entries(data)) dt.setData(k, v);
      const target = document.elementFromPoint(at.x, at.y) ?? document.querySelector('svg.canvas')!;
      target.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: dt }),
      );
    },
    { at, files, data },
  );
}
/** A 2×2 24-bit BMP. */
function bmpBytes(): Buffer {
  const row = Buffer.from([0, 0, 255, 0, 255, 0, 0, 0]); // two pixels + padding to 4 bytes
  const pixels = Buffer.concat([row, row]),
    header = Buffer.alloc(54);
  header.write('BM', 0, 'latin1');
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(2, 18);
  header.writeInt32LE(2, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  return Buffer.concat([header, pixels]);
}
const pageSizes = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(m => [+m[1], +m[2]]);

test.describe('R2 exports, files and images', () => {
  test('frame PDF pages keep the title; SVG of a selection holds only the selection', async ({ page }) => {
    await seedBoard(page);
    await page.keyboard.press('Escape');
    const pdf = await exportEntry(page, 'Export as PDF');
    const [[w, h]] = pageSizes(pdf.bytes);
    expect(w / h).toBeCloseTo(800 / (450 + 32), 2);

    const whole = await exportEntry(page, 'Export as SVG');
    expect(whole.bytes.toString('utf8')).toContain('Write the brief');
    // The frame title is drawn at a fixed size inside the exported page.
    expect(whole.bytes.toString('utf8')).toMatch(
      /class="frame-title"[^>]*font-size="16"|font-size="16"[^>]*class="frame-title"/,
    );

    await item(page, 'n1').click();
    const only = await exportEntry(page, 'Export as SVG');
    const text = only.bytes.toString('utf8');
    expect(text).toContain('Plan the launch');
    expect(text).not.toContain('Write the brief');
    expect(text).not.toContain('Launch frame');
  });

  test('a dragged area exports as PNG; Print shows a print-only copy of the selection', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__prints = 0;
      window.print = () => {
        (window as any).__prints++;
      };
    });
    await seedBoard(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.locator('.dropdown button', { hasText: 'Export an area' }).click();
    const layer = page.getByRole('application', { name: /Drag to choose the area/ });
    await expect(layer).toBeVisible();
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(500, 400, { steps: 6 });
    await page.mouse.up();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('toolbar', { name: 'Export area' }).getByRole('button', { name: 'PNG' }).click(),
    ]);
    const png = readFileSync((await download.path())!);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(png.readUInt32BE(16) / png.readUInt32BE(20)).toBeCloseTo(2, 1);
    await expect(layer).toHaveCount(0);

    // Escape leaves the picker without exporting.
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.locator('.dropdown button', { hasText: 'Export an area' }).click();
    await page.keyboard.press('Escape');
    await expect(layer).toHaveCount(0);

    await item(page, 'n1').click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.locator('.dropdown button', { hasText: /^Print/ }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__prints)).toBe(1);
    const src = await page.locator('#print-root img').getAttribute('src');
    expect(src).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(src!)).toContain('Plan the launch');
    expect(decodeURIComponent(src!)).not.toContain('Write the brief');
    await expect(page.locator('#print-root')).toBeHidden();
  });

  test('SVG and BMP files become PNG images; SVG scripts never run', async ({ page }) => {
    await seedBoard(page);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="window.__pwned=1"><script>window.__pwned=2</script><rect width="40" height="20" fill="#08f"/></svg>`;
    await drop(page, { x: 700, y: 650 }, [
      { name: 'logo.svg', type: 'image/svg+xml', b64: Buffer.from(svg).toString('base64') },
      { name: 'scan.bmp', type: 'image/bmp', b64: bmpBytes().toString('base64') },
    ]);
    await waitForSave(page, b => b.items.filter((i: any) => i.type === 'image').length === 2, 'two images');
    const images = (await savedBoard(page)).items.filter((i: any) => i.type === 'image');
    expect(images.map((i: any) => i.text).sort()).toEqual(['logo.png', 'scan.png']);
    const logo = images.find((i: any) => i.text === 'logo.png');
    expect(logo.w / logo.h).toBeCloseTo(2, 1);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
    const href = await item(page, logo.id).locator('image').getAttribute('href');
    expect(href).toMatch(/^data:image\/png;base64,/);
  });

  test('spreadsheets fill a new Grid from the gallery or an existing Grid when dropped on it', async ({ page }) => {
    await seed(
      page,
      `const g = { ...m.createItem('grid', 100, 600), id: 'g1' };
       return { version: 1, title: 'Grid', items: [g] };`,
    );
    await openTools(page, 'Media');
    await page
      .locator('.gallery-items')
      .getByRole('button', { name: /^Upload/ })
      .click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page
        .locator('.gallery-items')
        .getByRole('button', { name: /^Spreadsheet as Grid/ })
        .click(),
    ]);
    await chooser.setFiles({
      name: 'team.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Name,Role\nAda,Lead\nLin,Dev\n'),
    });
    await waitForSave(page, b => b.items.filter((i: any) => i.type === 'grid').length === 2, 'new grid');
    const made = (await savedBoard(page)).items.find((i: any) => i.type === 'grid' && i.id !== 'g1');
    expect(made.data.cells).toEqual([
      ['Name', 'Role'],
      ['Ada', 'Lead'],
      ['Lin', 'Dev'],
    ]);
    expect(made.name).toBe('team');
    await expect(page.getByRole('status')).toContainText('Imported 3 rows and 2 columns');

    await page.keyboard.press('Escape');
    const at = await center(item(page, 'g1'));
    await drop(page, at, [
      { name: 'scores.csv', type: 'text/csv', b64: Buffer.from('A,B,C\n1,2,3\n').toString('base64') },
    ]);
    await waitForSave(page, b => b.items.find((i: any) => i.id === 'g1')?.data.cells[1]?.[2] === '3', 'grid filled');
    const g1 = (await savedBoard(page)).items.find((i: any) => i.id === 'g1');
    expect(g1.data.rows).toBe(2);
    expect(g1.data.cols).toBe(3);
    expect((await savedBoard(page)).items.some((i: any) => i.type === 'table')).toBe(false);

    // The grid's own action imports into it as well.
    await item(page, 'g1').click();
    const [pick] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import CSV or Excel' }).click(),
    ]);
    await pick.setFiles({ name: 'one.csv', mimeType: 'text/csv', buffer: Buffer.from('only\n') });
    await waitForSave(page, b => b.items.find((i: any) => i.id === 'g1')?.data.cells[0][0] === 'only', 'action import');
  });

  test('images: flip, brightness, export carries the filter, and the original downloads', async ({ page }) => {
    await seedBoard(page);
    const png = await pngBytes(page, 300, 150);
    await drop(page, { x: 700, y: 650 }, [{ name: 'red.png', type: 'image/png', b64: png.toString('base64') }]);
    await waitForSave(page, b => b.items.some((i: any) => i.type === 'image'), 'image added');
    const img = (await savedBoard(page)).items.find((i: any) => i.type === 'image');
    await page.keyboard.press('Escape');
    await item(page, img.id).click();

    await page.getByRole('button', { name: 'Flip horizontally' }).click();
    await waitForSave(page, b => b.items.find((i: any) => i.id === img.id)?.adjust?.flipX === true, 'flipped');
    await expect(item(page, img.id).locator('g.image-adjusted')).toHaveAttribute('data-flip', 'x');

    await page.getByRole('button', { name: 'Brightness and contrast' }).click();
    const slider = page.getByRole('slider', { name: 'Brightness' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await waitForSave(page, b => b.items.find((i: any) => i.id === img.id)?.adjust?.brightness === 105, 'brighter');
    await expect(item(page, img.id).locator('feFuncR')).toHaveAttribute('slope', '1.05');

    // Undo restores the previous adjustment in one step.
    await page.locator('svg.canvas').focus();
    await page.keyboard.press('Control+z');
    await waitForSave(page, b => b.items.find((i: any) => i.id === img.id)?.adjust?.brightness === undefined, 'undo');
    await page.keyboard.press('Control+y');
    await waitForSave(page, b => b.items.find((i: any) => i.id === img.id)?.adjust?.brightness === 105, 'redo');

    await page.keyboard.press('Escape');
    const svg = await exportEntry(page, 'Export as SVG');
    expect(svg.bytes.toString('utf8')).toContain('feComponentTransfer');

    await item(page, img.id).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download original image' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('red.png');
    expect(readFileSync((await download.path())!).equals(png)).toBe(true);
  });

  test('pictures dragged from web pages become images; unreadable ones become bookmarks with a reason', async ({
    page,
  }) => {
    await seedBoard(page);
    const png = await pngBytes(page, 60, 30);
    await drop(page, { x: 700, y: 650 }, [], {
      'text/html': `<meta charset="utf-8"><img src="data:image/png;base64,${png.toString('base64')}" alt="red">`,
      'text/uri-list': 'https://example.com/gallery',
    });
    await waitForSave(page, b => b.items.some((i: any) => i.type === 'image'), 'image from web page');
    expect((await savedBoard(page)).items.find((i: any) => i.type === 'image').w).toBeGreaterThan(0);

    await drop(page, { x: 400, y: 650 }, [], { 'text/uri-list': 'https://127.0.0.1:1/never/cat.png' });
    await waitForSave(page, b => b.items.some((i: any) => i.type === 'bookmark'), 'bookmark fallback', 15_000);
    await expect(page.getByRole('status')).toContainText('could not be downloaded');
  });
});
