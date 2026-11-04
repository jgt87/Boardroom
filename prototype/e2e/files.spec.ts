import {
  test,
  expect,
  openApp,
  savedBoard,
  waitForSave,
  openTools,
  chooseTool,
  pngBytes,
  webmBytes,
  pdfBytes,
} from './helpers';
import type { Page } from '@playwright/test';

async function pickFile(
  page: Page,
  open: () => Promise<void>,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open()]);
  await chooser.setFiles(file);
}
const items = async (page: Page, type: string) =>
  (await savedBoard(page))?.items.filter((i: any) => i.type === type) ?? [];

test.describe('files and media', () => {
  test('image upload through the file chooser keeps the aspect ratio and survives reload', async ({ page }) => {
    await openApp(page);
    const png = await pngBytes(page, 400, 200);
    await pickFile(
      page,
      async () => {
        await openTools(page, 'Media');
        await chooseTool(page, 'Image');
      },
      { name: 'wide.png', mimeType: 'image/png', buffer: png },
    );
    await waitForSave(page, b => b.items.some((i: any) => i.type === 'image'), 'image saved');
    const [img] = await items(page, 'image');
    expect(img.w / img.h).toBeCloseTo(2, 2);
    await page.reload();
    await expect(page.locator(`#objects [data-item="${img.id}"] image`)).toHaveCount(1);
  });

  test('video and PDF are added through Tools → Media with poster and thumbnail', async ({ page }) => {
    await openApp(page);
    const webm = await webmBytes();
    await pickFile(
      page,
      async () => {
        await openTools(page, 'Media');
        await chooseTool(page, 'Video');
      },
      { name: 'clip.webm', mimeType: 'video/webm', buffer: webm },
    );
    await waitForSave(page, b => b.items.some((i: any) => i.type === 'video'), 'video saved', 30_000);
    const [video] = await items(page, 'video');
    expect(video.assetId).toBeTruthy();
    expect(String(video.data?.poster ?? '')).toMatch(/^data:image\//);

    await pickFile(
      page,
      async () => {
        await openTools(page, 'Media');
        await chooseTool(page, 'PDF');
      },
      { name: 'two-pages.pdf', mimeType: 'application/pdf', buffer: pdfBytes(2) },
    );
    let last = '';
    for (let t = 0; t < 40 && !/pdf/.test(last); t++) {
      await page.waitForTimeout(500);
      const b = await savedBoard(page);
      last = `${b?.items.map((i: any) => i.type).join(',')} | status: ${await page
        .getByRole('status')
        .textContent({ timeout: 200 })
        .catch(() => 'none')}`;
    }
    expect(last, 'pdf saved').toMatch(/pdf/);
    const [pdf] = await items(page, 'pdf');
    expect(pdf.data.pages).toBe(2);
    expect(String(pdf.data.thumb ?? '')).toMatch(/^data:image\//);
  });

  test('image drop adds the image and an unsupported file is refused with a message', async ({ page }) => {
    await openApp(page);
    const png = await pngBytes(page, 90, 90, '#2f9e44');
    await page.evaluate(async b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
      dt.items.add(new File(['II*'], 'scan.tiff', { type: 'image/tiff' }));
      document
        .querySelector('svg.canvas')!
        .dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, clientX: 500, clientY: 400, dataTransfer: dt }),
        );
    }, png.toString('base64'));
    await waitForSave(
      page,
      b => b.items.some((i: any) => i.type === 'image' && i.text === 'dropped.png'),
      'dropped image saved',
    );
    await expect(page.getByRole('status')).toContainText('"scan.tiff" is not a supported image');
  });

  test('pastes an image from the real clipboard with Ctrl+V', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-specific');
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5199' });
    await openApp(page);
    await page.mouse.click(700, 120);
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 60;
      c.height = 40;
      c.getContext('2d')!.fillRect(0, 0, 60, 40);
      const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    });
    await page.keyboard.press('Control+V');
    await waitForSave(page, b => b.items.some((i: any) => i.type === 'image'), 'pasted image saved');
    const [img] = await items(page, 'image');
    expect([img.w, img.h]).toEqual([60, 40]);
  });
});
