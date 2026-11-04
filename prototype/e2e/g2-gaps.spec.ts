// File and data handling gaps in the browser: the XLSX worksheet picker (Q16), ambiguous CSV dates (Q15), kept
// SVG and BMP originals (R2-Q3) and blueprints in library backups (R3-Q2).
import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { test, expect, seed, savedBoard, waitForSave, item, fit, axeViolations } from './helpers';
import type { Page } from '@playwright/test';

/** A workbook with one inline-string worksheet per entry. */
function workbook(sheets: { name: string; rows: string[][] }[]): Buffer {
  const x = (s: string) => strToU8(`<?xml version="1.0"?>${s}`);
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': x(
      '<workbook><sheets>' +
        sheets.map((s, k) => `<sheet name="${s.name}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('') +
        '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': x(
      '<Relationships>' +
        sheets.map((_, k) => `<Relationship Id="rId${k + 1}" Target="worksheets/s${k + 1}.xml"/>`).join('') +
        '</Relationships>',
    ),
  };
  sheets.forEach((s, k) => {
    files[`xl/worksheets/s${k + 1}.xml`] = x(
      '<worksheet><sheetData>' +
        s.rows
          .map(r => '<row>' + r.map(c => `<c t="inlineStr"><is><t>${c}</t></is></c>`).join('') + '</row>')
          .join('') +
        '</sheetData></worksheet>',
    );
  });
  return Buffer.from(zipSync(files));
}
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const importInput = (page: Page) => page.locator('input[aria-label="Choose a document to import"]');

/** A 2×2 24-bit BMP. */
function bmpBytes(): Buffer {
  const row = Buffer.from([0, 0, 255, 0, 255, 0, 0, 0]);
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
/** Drop files on the canvas at a screen point. */
async function drop(page: Page, at: { x: number; y: number }, files: { name: string; type: string; b64: string }[]) {
  await page.evaluate(
    ({ at, files }) => {
      const dt = new DataTransfer();
      for (const f of files)
        dt.items.add(new File([Uint8Array.from(atob(f.b64), ch => ch.charCodeAt(0))], f.name, { type: f.type }));
      const target = document.elementFromPoint(at.x, at.y) ?? document.querySelector('svg.canvas')!;
      target.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: dt }),
      );
    },
    { at, files },
  );
}
async function downloadOriginal(page: Page, id: string) {
  // Select only this image (a drop selects everything it added).
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Escape');
  await item(page, id).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download original image' }).click(),
  ]);
  return { name: download.suggestedFilename(), bytes: readFileSync((await download.path())!) };
}

test.describe('G2 file and data handling', () => {
  test('an Excel file with several worksheets asks which one to import', async ({ page }) => {
    await seed(page, `return { ...m.newBoard(), title: 'Sheets', items: [] };`);
    const book = workbook([
      { name: 'Summary', rows: [['Total'], ['3']] },
      {
        name: 'Tasks',
        rows: [
          ['Title', 'Owner'],
          ['Ship', 'Ana'],
          ['Test', 'Ben'],
        ],
      },
    ]);
    // Cancel leaves the board unchanged.
    await importInput(page).setInputFiles({ name: 'plan.xlsx', mimeType: XLSX_MIME, buffer: book });
    const picker = page.getByRole('dialog', { name: 'Choose a worksheet' });
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('plan.xlsx has 2 worksheets');
    await expect(picker.getByRole('button', { name: 'Summary' })).toBeFocused();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    expect((await savedBoard(page)).items).toHaveLength(0);

    // Choosing the second sheet imports its rows.
    await importInput(page).setInputFiles({ name: 'plan.xlsx', mimeType: XLSX_MIME, buffer: book });
    await picker.getByRole('button', { name: 'Tasks' }).click();
    await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'table', 'table from the second sheet');
    const b = await savedBoard(page);
    expect(b.datasets![b.items[0].datasetId].map((r: any) => [r.title, r.assignee])).toEqual([
      ['Ship', 'Ana'],
      ['Test', 'Ben'],
    ]);
    await expect(page.getByRole('status').filter({ hasText: 'Imported 2 records' })).toBeVisible();

    // A single-sheet workbook imports straight away.
    await importInput(page).setInputFiles({
      name: 'one.xlsx',
      mimeType: XLSX_MIME,
      buffer: workbook([{ name: 'Only', rows: [['Title'], ['Solo']] }]),
    });
    await waitForSave(page, b => b.items.length === 2, 'single-sheet table');
    await expect(picker).toBeHidden();
  });

  test('slashed CSV dates are read in the order their column settles', async ({ page }) => {
    await seed(
      page,
      `return { ...m.newBoard(), title: 'Dates', items: [{ ...m.createItem('table', 0, 0, '#ffffff'), id: 't', text: 'Plan', datasetId: 'd', w: 900, h: 420 }],
        datasets: { d: [] } };`,
    );
    await fit(page);
    const csv = 'Title,Start,Due\nDesign,03/04/2026,03/04/2026\nBuild,25/04/2026,05/06/2026\n';
    await item(page, 't')
      .locator('input[aria-label="Choose a CSV or Excel file to import"]')
      .setInputFiles({ name: 'plan.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await waitForSave(page, b => b.datasets?.d?.length === 2, 'rows imported');
    const rows = (await savedBoard(page)).datasets!.d;
    expect(rows.map((r: any) => [r.title, r.start, r.end])).toEqual([
      ['Design', '2026-04-03', ''],
      ['Build', '2026-04-25', ''],
    ]);
    const status = page.getByRole('status').filter({ hasText: 'Imported 2 records.' });
    await expect(status).toContainText('Dates in "Start" were read as day/month/year.');
    await expect(status).toContainText('Dates in "Due" could be day/month or month/day, so they were left empty.');
  });

  test('SVG and BMP images keep their original file for "Download original"', async ({ page }) => {
    await seed(page, `return { ...m.newBoard(), title: 'Originals', items: [] };`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" onload="window.__pwned=1"><script>window.__pwned=2</script><rect width="40" height="20" fill="#08f"/></svg>`;
    const bmp = bmpBytes();
    await drop(page, { x: 700, y: 450 }, [
      { name: 'logo.svg', type: 'image/svg+xml', b64: Buffer.from(svg).toString('base64') },
      { name: 'scan.bmp', type: 'image/bmp', b64: bmp.toString('base64') },
    ]);
    await waitForSave(
      page,
      b => b.items.filter((i: any) => i.type === 'image' && i.originalAssetId).length === 2,
      'two images with originals',
    );
    const images = (await savedBoard(page)).items;
    const logo = images.find((i: any) => i.text === 'logo.png'),
      scan = images.find((i: any) => i.text === 'scan.png');
    // The board draws the PNG; the SVG source is never placed in the page.
    await expect(item(page, logo.id).locator('image')).toHaveAttribute('href', /^data:image\/png;base64,/);
    expect(await page.locator('#objects [href^="data:image/svg"], #objects [src^="data:image/svg"]').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();

    const svgDownload = await downloadOriginal(page, logo.id);
    expect(svgDownload.name).toBe('logo.svg');
    expect(svgDownload.bytes.toString('utf8')).toBe(svg);
    await page.keyboard.press('Escape');
    const bmpDownload = await downloadOriginal(page, scan.id);
    expect(bmpDownload.name).toBe('scan.bmp');
    expect(bmpDownload.bytes.equals(bmp)).toBe(true);

    // After a reload (startup pruning runs), the original is still stored.
    await page.reload();
    await expect(page.locator('svg.canvas')).toBeVisible();
    await expect(item(page, logo.id).locator('image')).toHaveAttribute('href', /^data:image\/png/);
    expect((await downloadOriginal(page, logo.id)).name).toBe('logo.svg');

    // Both backups carry the originals: base64 assets in JSON, media files in the .boardroom bundle.
    await page.keyboard.press('Escape');
    const exportFile = async (label: string) => {
      await page.getByRole('button', { name: 'Export', exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.dropdown button', { hasText: label }).first().click(),
      ]);
      return readFileSync((await download.path())!);
    };
    const json = JSON.parse((await exportFile('Save board as JSON')).toString('utf8'));
    expect(json.assets[logo.originalAssetId].mime).toBe('image/svg+xml');
    expect(Buffer.from(json.assets[logo.originalAssetId].data.split(',')[1], 'base64').toString('utf8')).toBe(svg);
    expect(json.assets[scan.originalAssetId].mime).toBe('image/bmp');
    const zip = (await exportFile('Save board with media')).toString('latin1');
    expect(zip).toContain(`media/${logo.originalAssetId}.svg`);
    expect(zip).toContain(`media/${scan.originalAssetId}.bmp`);
  });

  test('library backups carry saved blueprints and restore them next to existing ones', async ({ page }) => {
    await seed(
      page,
      `return { ...m.newBoard(), title: 'Home', items: [{ ...m.createItem('note', 0, 0), id: 'n', text: 'Hi' }] };`,
    );
    const blueprint = {
      id: 'bp-offsite',
      name: 'Offsite',
      emoji: '🧭',
      created: '2026-11-01T00:00:00.000Z',
      boards: [{ title: 'Agenda', template: 'Meeting agenda' }],
    };
    await page.evaluate(bp => localStorage.setItem('boardroom.blueprints.v1', JSON.stringify([bp])), blueprint);
    await page.reload();
    await page.getByRole('button', { name: 'boardroom: all boards' }).click();
    const [backup] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Back up all boards' }).click(),
    ]);
    await expect(page.getByRole('status').filter({ hasText: 'with 1 blueprint' })).toBeVisible();
    const file = await backup.path();

    // Forget the blueprint, then restore the backup from the Boards dialog.
    await page.evaluate(() => localStorage.removeItem('boardroom.blueprints.v1'));
    await page.reload();
    await page.getByRole('button', { name: 'boardroom: all boards' }).click();
    const group = page.getByRole('group', { name: 'Start from a blueprint' });
    await page.getByRole('button', { name: 'New space' }).click();
    await expect(group.getByRole('button', { name: /Sprint/ })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Delete blueprint Offsite' })).toHaveCount(0);
    // The list in the open dialog refreshes once the restore settles.
    await page.getByLabel('Choose a backup to import', { exact: true }).setInputFiles(file!);
    await expect(page.getByRole('status').filter({ hasText: 'Added 1 blueprint.' })).toBeVisible();
    await expect(group.getByRole('button', { name: 'Delete blueprint Offsite' })).toBeVisible();
    await expect(group.getByRole('button', { name: /Offsite \(1 boards\)/ })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('boardroom.blueprints.v1') ?? '[]'));
    expect(stored.map((b: any) => [b.id, b.name])).toEqual([['bp-offsite', 'Offsite']]);

    // Restoring the same backup again does not duplicate the blueprint.
    await page.getByLabel('Choose a backup to import', { exact: true }).setInputFiles(file!);
    await expect(page.getByRole('status').filter({ hasText: /Restored \d+ boards?/ })).toBeVisible();
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem('boardroom.blueprints.v1') ?? '[]'));
    expect(again).toHaveLength(1);
  });
});
