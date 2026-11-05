// Track R2: export fidelity (frame titles, selection SVG, export area, print), SVG/BMP images, spreadsheets
// into a Grid, original-file download, pictures dragged from web pages and image adjustments.
// Track J: OpenDocument and RTF import, File objects, Office and Power BI embeds, duplicate layer, large
// grids, the auto-layout spacing handle and click-through in the web page export.
import { readFileSync } from 'node:fs';
import { test, expect, seed, savedBoard, waitForSave, pngBytes, item, openTools, center, mouseDrag } from './helpers';
import type { Page } from '@playwright/test';
import { strToU8, unzipSync, zipSync } from 'fflate';

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

// ---- Track J: files, embeds and containers ---------------------------------------------------------
const odf = (mime: string, content: string) =>
  Buffer.from(zipSync({ mimetype: [strToU8(mime), { level: 0 }], 'content.xml': strToU8(content) })).toString('base64');
const canvasPoint = async (page: Page) => {
  const box = (await page.locator('svg.canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('J1: ODT, ODP and RTF files dropped on the board become Docs and Slides', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Imports', items: [] };`);
  const odt = odf(
    'application/vnd.oasis.opendocument.text',
    `<office:document-content><office:automatic-styles><style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles><office:body><office:text><text:h text:outline-level="1">Roadmap</text:h><text:p>Ship <text:span text:style-name="T1">faster</text:span></text:p></office:text></office:body></office:document-content>`,
  );
  const odp = odf(
    'application/vnd.oasis.opendocument.presentation',
    `<office:document-content><office:body><office:presentation><draw:page><draw:frame presentation:class="title"><draw:text-box><text:p>Hello deck</text:p></draw:text-box></draw:frame></draw:page><draw:page><draw:frame presentation:class="title"><draw:text-box><text:p>Second</text:p></draw:text-box></draw:frame></draw:page></office:presentation></office:body></office:document-content>`,
  );
  const rtf = Buffer.from(String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}\pard\b Notes\b0  from the call\par}`).toString(
    'base64',
  );
  await drop(page, await canvasPoint(page), [
    { name: 'plan.odt', type: 'application/vnd.oasis.opendocument.text', b64: odt },
    { name: 'deck.odp', type: 'application/vnd.oasis.opendocument.presentation', b64: odp },
    { name: 'call.rtf', type: 'application/rtf', b64: rtf },
  ]);
  await waitForSave(
    page,
    b =>
      b.items.some(i => i.type === 'doc' && i.data.markdown === '# Roadmap\n\nShip **faster**') &&
      b.items.some(i => i.type === 'slides' && i.text === 'deck' && i.data.slides.length === 2) &&
      b.items.some(i => i.type === 'doc' && i.data.markdown === '**Notes** from the call'),
    'ODT, ODP and RTF imported',
  );
});

test('J2: other files are kept as File objects that download the original and travel in bundles', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Files', items: [] };`);
  const bytes = Buffer.from([80, 75, 1, 2, 3, 4, 5]);
  await drop(page, await canvasPoint(page), [
    { name: 'drawing.odg', type: 'application/vnd.oasis.opendocument.graphics', b64: bytes.toString('base64') },
  ]);
  await waitForSave(page, b => b.items.some(i => i.type === 'file'), 'file object added');
  const file = page.locator('#objects .file-object');
  await expect(file).toContainText('drawing.odg');
  await expect(file).toContainText('7 bytes');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download drawing.odg' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('drawing.odg');
  expect(readFileSync((await download.path())!)).toEqual(bytes);
  const bundle = await exportEntry(page, 'Save board with media');
  const entries = unzipSync(new Uint8Array(bundle.bytes));
  const media = Object.keys(entries).filter(n => n.endsWith('.bin'));
  expect(media).toHaveLength(1);
  expect(Buffer.from(entries[media[0]])).toEqual(bytes);
});

test('J3: Office Online and Power BI embed links are framed only after activation and allowed by the CSP', async ({
  page,
}) => {
  await seed(
    page,
    `const e = { ...m.createItem('embed', 0, 0), id: 'e1', data: { url: 'https://onedrive.live.com/embed?resid=A%211&authkey=k', provider: 'office' } };
     const p = { ...m.createItem('embed', 600, 0), id: 'e2', data: { url: 'https://app.powerbi.com/view?r=abc', provider: 'powerbi' } };
     return { version: 1, title: 'Embeds', items: [e, p] };`,
  );
  await expect(item(page, 'e1')).toContainText('Office document');
  await expect(item(page, 'e2')).toContainText('Power BI report');
  await expect(page.locator('#objects iframe')).toHaveCount(0);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  for (const origin of ['https://onedrive.live.com', 'https://*.sharepoint.com', 'https://app.powerbi.com'])
    expect(csp).toContain(origin);
});

test('J4: duplicating a layer copies its objects and re-points connectors, in one undo step', async ({ page }) => {
  await seed(
    page,
    `const a = { ...m.createItem('rectangle', 0, 0), id: 'a', text: 'A', layer: 'L' };
     const b = { ...m.createItem('rectangle', 400, 0), id: 'b', text: 'B', layer: 'L' };
     const c = { ...m.createItem('arrow', 0, 0), id: 'c', from: 'a', to: 'b', layer: 'L' };
     return { version: 1, title: 'Layers', items: [a, b, c], layers: [{ id: 'base', name: 'Layer 1' }, { id: 'L', name: 'Shapes' }] };`,
  );
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Board layers' });
  await panel.getByRole('button', { name: 'Duplicate Shapes' }).click();
  await expect(page.getByRole('status')).toContainText('Duplicated Shapes with 3 objects');
  await waitForSave(
    page,
    b => {
      const copies = b.items.filter(i => i.layer && i.layer !== 'L');
      const arrow = copies.find(i => i.type === 'arrow');
      return (
        (b.layers as { name: string }[]).some(l => l.name === 'Shapes copy') &&
        copies.length === 3 &&
        !!arrow &&
        copies.some(i => i.id === arrow.from) &&
        copies.some(i => i.id === arrow.to)
      );
    },
    'layer duplicated',
  );
  await page.getByRole('button', { name: 'Close layers' }).click();
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+z');
  await waitForSave(page, b => b.items.length === 3 && (b.layers as unknown[]).length === 2, 'one undo removes it');
});

test('J5: a 50 × 50 grid renders with one live field and edits a cell', async ({ page }) => {
  await seed(
    page,
    `const cells = Array.from({ length: 50 }, (_, r) => Array.from({ length: 50 }, (_, c) => (r === 0 && c === 0 ? 'Top' : '')));
     const g = { ...m.createItem('grid', 0, 0), id: 'g', w: 50 * 140, h: 42 + 50 * 40, data: { rows: 50, cols: 50, cells, merges: [], align: 'left' } };
     return { version: 1, title: 'Big grid', items: [g] };`,
  );
  const grid = item(page, 'g');
  await expect(grid.locator('td[data-grid-cell]')).toHaveCount(2500);
  expect(await grid.locator('textarea').count()).toBeLessThanOrEqual(1);
  // The rows and columns buttons respect the 2,500-cell limit.
  await expect(grid.getByRole('button', { name: '+ Row' })).toBeDisabled();
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Alt+1');
  await grid.locator('td[data-grid-cell="1,1"]').click();
  const field = grid.getByRole('textbox', { name: 'Grid cell 2, 2' });
  await expect(field).toBeFocused();
  await field.fill('Hello');
  await page.keyboard.press('Tab');
  await expect(grid.getByRole('textbox', { name: 'Grid cell 2, 3' })).toBeFocused();
  await waitForSave(page, b => b.items[0].data.cells[1][1] === 'Hello', 'cell edited');
  expect(await grid.locator('textarea').count()).toBe(1);
});

test('J6: dragging the auto-layout spacing handle previews and sets the gap in one undo step', async ({ page }) => {
  await seed(
    page,
    `const kids = ['k1', 'k2', 'k3'].map((id, k) => ({ ...m.createItem('note', 0, 0), id, w: 120, h: 120, text: 'N' + k }));
     const c = { ...m.createItem('autolayout', 0, 0), id: 'box', w: 600, data: { direction: 'row', gap: 16, padding: 20, wrap: true, children: kids.map(k => k.id) } };
     return { version: 1, title: 'Gap', items: [c, ...kids] };`,
  );
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Alt+1');
  const box = (await item(page, 'box').boundingBox())!;
  // Empty space inside the container, right of its children.
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12);
  const handle = page.locator('[data-gap-handle="box"]');
  await expect(handle).toBeVisible();
  const from = await center(handle),
    k2before = (await item(page, 'k2').boundingBox())!.x;
  let previewed = false;
  await mouseDrag(page, from, { x: from.x + 40, y: from.y }, 10, async () => {
    previewed = (await item(page, 'k2').boundingBox())!.x > k2before + 20;
  });
  expect(previewed, 'children move while dragging').toBe(true);
  await waitForSave(page, b => b.items.find(i => i.id === 'box').data.gap > 40, 'gap widened');
  await page.keyboard.press('Control+z');
  await waitForSave(page, b => b.items.find(i => i.id === 'box').data.gap === 16, 'one undo restores the gap');
});

test('J7: the web page export clicks through linked objects and returns with Back', async ({ page, context }) => {
  await seed(
    page,
    `const f = { ...m.createItem('frame', 2000, 0), id: 'f1', text: 'Details', w: 600, h: 400 };
     const n = { ...m.createItem('note', 0, 0), id: 'n1', text: 'Open details', linkTo: 'f1' };
     return { version: 1, title: 'Click-through', items: [f, n] };`,
  );
  const exported = await exportEntry(page, 'Export as web page');
  expect(exported.name).toBe('Click-through.html');
  const viewer = await context.newPage();
  await viewer.setContent(exported.bytes.toString('utf8'));
  const board = viewer.locator('#board');
  const before = await board.evaluate(el => (el as HTMLElement).style.transform);
  await viewer.getByRole('button', { name: 'Go to Details' }).click();
  await expect.poll(() => board.evaluate(el => (el as HTMLElement).style.transform)).not.toBe(before);
  await expect(viewer.getByRole('button', { name: 'Back to the previous view' })).toBeVisible();
  await viewer.getByRole('button', { name: 'Back to the previous view' }).click();
  await expect.poll(() => board.evaluate(el => (el as HTMLElement).style.transform)).toBe(before);
  await expect(viewer.getByRole('button', { name: 'Back to the previous view' })).toBeHidden();
  await viewer.close();
});
