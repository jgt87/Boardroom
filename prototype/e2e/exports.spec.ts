import { readFileSync } from 'node:fs';
import { test, expect, seed, savedBoard, waitForSave, pngBytes, item } from './helpers';
import type { Page } from '@playwright/test';

async function seedWithImage(page: Page) {
  await seed(
    page,
    `const f = { ...m.createItem('frame', 0, 0), id: 'f1', text: 'Slide A', w: 800, h: 450 };
     const g = { ...m.createItem('frame', 900, 0), id: 'f2', text: 'Slide B', w: 800, h: 450 };
     const a = { ...m.createItem('note', 40, 60), id: 'n1', text: 'Plan the launch' };
     const b = { ...m.createItem('note', 300, 60), id: 'n2', text: 'Write the brief' };
     const c = { ...m.createItem('arrow', 0, 0), id: 'c1', from: 'n1', to: 'n2' };
     const k = { ...m.createItem('kanban', 0, 600), id: 'k1', datasetId: 'd1' };
     return { version: 1, title: 'Export', items: [f, g, a, b, c, k], datasets: { d1: [
       { id: 'r1', title: 'Design, "first"', status: 'Not started', assignee: '', start: '', end: '', points: 3 } ] } };`,
  );
  const png = await pngBytes(page, 300, 150);
  await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'red.png', { type: 'image/png' }));
    document
      .querySelector('svg.canvas')!
      .dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, clientX: 700, clientY: 700, dataTransfer: dt }),
      );
  }, png.toString('base64'));
  await waitForSave(page, b => b.items.some((i: any) => i.type === 'image'), 'image added');
  await page.keyboard.press('Escape');
}
async function exportEntry(page: Page, label: string) {
  await page.locator('.export-button').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: label }).click(),
  ]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: readFileSync(path!), path: path! };
}

test.describe('exports and backups', () => {
  test('every export downloads a valid file', async ({ page }) => {
    await seedWithImage(page);
    const json = await exportEntry(page, 'Save board as JSON');
    const parsed = JSON.parse(json.bytes.toString('utf8'));
    expect(parsed.items.length).toBe(7);
    expect(Object.keys(parsed.assets ?? {})).toHaveLength(1);

    const bundle = await exportEntry(page, 'Save board with media');
    expect(bundle.name).toMatch(/\.boardroom$/);
    expect(bundle.bytes.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');

    const svg = await exportEntry(page, 'Export as SVG');
    expect(svg.bytes.toString('utf8')).toMatch(/^<svg[\s\S]*Plan the launch/);

    const png = await exportEntry(page, 'Export as PNG');
    expect(png.bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    const jpg = await exportEntry(page, 'Export as JPG');
    expect([...jpg.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

    const pdf = await exportEntry(page, 'Export as PDF');
    expect(pdf.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((pdf.bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2);

    const csv = await exportEntry(page, 'Export records as CSV');
    const text = csv.bytes.toString('utf8').replace(/^\uFEFF/, '');
    expect(text.split('\r\n')[0]).toBe('Title,Status,Assignee,Start,End,Milestone,Points,Depends on,Tags,Link');
    expect(text).toContain('"Design, ""first""",Not started');
  });

  for (const kind of ['bundle', 'json'] as const) {
    test(`${kind} backup round trip restores objects and the image`, async ({ page }) => {
      await seedWithImage(page);
      const before = await savedBoard(page);
      const backup = await exportEntry(page, kind === 'bundle' ? 'Save board with media' : 'Save board as JSON');
      await page.locator('svg.canvas').focus();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await waitForSave(page, b => b.items.length === 0, 'board emptied');
      await page.locator('.export-button').click();
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.locator('.dropdown button', { hasText: 'Import backup' }).click(),
      ]);
      await chooser.setFiles(backup.path);
      await waitForSave(page, b => b.items.length === before.items.length, 'objects restored');
      const img = (await savedBoard(page)).items.find((i: any) => i.type === 'image');
      await expect(item(page, img.id).locator('image')).toHaveCount(1);
      await expect(page.getByRole('status')).toContainText('Board imported');
    });
  }
});
