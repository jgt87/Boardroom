// Track G: video player controls and keys, Talktrack cuts with a waveform, animated GIF settings, image crop
// masks (one image or several at once) and pinned comment cards kept open on the canvas.
import type { Page } from '@playwright/test';
import { test, expect, seed, item, savedBoard, waitForSave, webmBytes, pngBytes } from './helpers';

async function drop(page: Page, bytes: Buffer, name: string, type: string, x = 600, y = 400) {
  await page.evaluate(
    ({ data, name, type, x, y }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(data)], name, { type }));
      document
        .querySelector('svg.canvas')!
        .dispatchEvent(
          new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y }),
        );
    },
    { data: [...bytes], name, type, x, y },
  );
}

/** Two-frame looping GIF (120×80), solid red then blue. */
function animatedGif(): Buffer {
  const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 120, 0, 80, 0, 0x81, 0, 0];
  const palette = [255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0];
  const loop = [0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0];
  const control = [0x21, 0xf9, 4, 0, 10, 0, 0, 0],
    descriptor = [0x2c, 0, 0, 0, 0, 120, 0, 80, 0, 0];
  const frame = (color: number) => [...control, ...descriptor, ...lzwSolid(120 * 80, color)];
  return Buffer.from([...header, ...palette, ...loop, ...frame(0), ...frame(1), 0x3b]);
}
function lzwSolid(count: number, color: number): number[] {
  const codes: number[] = [];
  for (let k = 0; k < count; k++) codes.push(4, color);
  codes.push(5);
  const bytes: number[] = [];
  let acc = 0,
    bits = 0;
  for (const c of codes) {
    acc |= c << bits;
    bits += 3;
    while (bits >= 8) {
      bytes.push(acc & 0xff);
      acc >>= 8;
      bits -= 8;
    }
  }
  if (bits) bytes.push(acc & 0xff);
  const out = [2];
  for (let k = 0; k < bytes.length; k += 255) {
    const chunk = bytes.slice(k, k + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

async function addVideo(page: Page) {
  await seed(page, `return { version: 1, title: 'Clips', items: [] };`);
  await drop(page, await webmBytes(), 'clip.webm', 'video/webm');
  await waitForSave(page, b => b.items.some(i => i.type === 'video'), 'video dropped', 20000);
  return (await savedBoard(page)).items.find(i => i.type === 'video')!.id as string;
}

test('the video player has ±10 s skips, a speed menu and player keys', async ({ page }) => {
  const id = await addVideo(page);
  const video = item(page, id);
  // Keep the clip from ending on its own while the controls are checked.
  await page.evaluate(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.resolve();
    };
  });
  await video.getByRole('button', { name: /^Play / }).click();
  const player = video.getByRole('group', { name: /player/ });
  await expect(player).toBeFocused();
  const controls = video.getByRole('toolbar', { name: 'Playback' });
  await expect(controls.getByRole('button', { name: 'Back 10 seconds' })).toBeVisible();
  const speed = controls.getByLabel('Playback speed');
  await expect(speed).toHaveValue('1');
  await page.keyboard.press('>');
  await expect(speed).toHaveValue('1.25');
  expect(await video.locator('video').evaluate(v => (v as HTMLVideoElement).playbackRate)).toBe(1.25);
  await page.keyboard.press('<');
  await page.keyboard.press('<');
  await expect(speed).toHaveValue('0.75');
  await speed.selectOption('2');
  expect(await video.locator('video').evaluate(v => (v as HTMLVideoElement).playbackRate)).toBe(2);
  // Player keys never reach the board: nothing is deleted or moved.
  await player.focus();
  await page.keyboard.press('j');
  await page.keyboard.press('ArrowLeft');
  expect((await savedBoard(page)).items.find(i => i.id === id)).toBeTruthy();
  // Skipping forward past the end of the short clip stops playback and shows the poster again.
  await controls.getByRole('button', { name: 'Forward 10 seconds' }).click();
  await expect(video.getByRole('button', { name: /^Play / })).toBeVisible();
});

test('a recording can have parts cut out of the middle, shown on a waveform', async ({ page }) => {
  await addVideo(page);
  await page.getByRole('button', { name: 'Formats and Flows' }).click();
  await page.locator('.gallery-items button', { hasText: 'Talktrack' }).first().click();
  await page
    .getByRole('region', { name: 'Recordings on this board' })
    .getByRole('button', { name: 'Rename or trim' })
    .click();
  const dialog = page.getByRole('dialog');
  // The waveform is drawn from the sound, or a note explains it could not be read.
  await expect(dialog.locator('svg.waveform, .waveform-note:not(:has-text("Reading"))')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add a cut' }).click();
  await dialog.getByLabel('Cut 1 start').fill('0:00.3');
  await dialog.getByLabel('Cut 1 end').fill('0:00.2');
  await expect(dialog.getByRole('alert')).toContainText('end after it starts');
  await dialog.getByLabel('Cut 1 end').fill('0:00.5');
  await page.keyboard.press('Control+Enter');
  await waitForSave(page, b => !!b.items.find(i => i.type === 'video')?.data?.cuts, 'cut saved');
  const v = (await savedBoard(page)).items.find(i => i.type === 'video')!;
  expect(v.data.cuts).toEqual([{ start: 0.3, end: 0.5 }]);
  // One undo step removes the cut again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitForSave(page, b => !b.items.find(i => i.type === 'video')?.data?.cuts, 'cut undone');
});

test('an animated GIF can start paused and play once, whatever the motion setting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seed(page, `return { ...m.newBoard(), title: 'GIF', items: [] };`);
  await drop(page, animatedGif(), 'spin.gif', 'image/gif', 700, 400);
  await waitForSave(page, b => b.items.some((i: any) => i.type === 'image'), 'gif added');
  const id = (await savedBoard(page)).items[0].id as string;
  const picture = item(page, id).locator('svg image');
  await expect(picture).toHaveAttribute('href', /^data:image\/gif;base64,/);
  // The canvas button pauses this GIF even with reduce motion off.
  await item(page, id).hover();
  await item(page, id).getByRole('button', { name: 'Pause animation' }).click();
  await expect(picture).toHaveAttribute('href', /^data:image\/png;base64,/);
  await item(page, id).getByRole('button', { name: 'Play animation' }).click();
  await expect(picture).toHaveAttribute('href', /^data:image\/gif;base64,/);

  // Stored settings from the selection bar: start paused, then play once.
  await item(page, id).click({ position: { x: 80, y: 50 } });
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  await bar.getByRole('button', { name: 'Start animation paused' }).click();
  await waitForSave(page, b => b.items[0].gif?.paused === true, 'starts paused');
  await expect(picture).toHaveAttribute('href', /^data:image\/png;base64,/);
  await bar.getByRole('button', { name: 'Play animation once' }).click();
  await waitForSave(page, b => b.items[0].gif?.once === true, 'plays once');
  await item(page, id).getByRole('button', { name: 'Play animation' }).click();
  const href = await picture.getAttribute('href');
  expect(href).toMatch(/^data:image\/gif;base64,/);
  expect(Buffer.from(href!.split(',')[1], 'base64').includes(Buffer.from('NETSCAPE2.0'))).toBe(false);
});

test('crop shapes apply to one image or to several selected images at once', async ({ page }) => {
  await seed(page, `return { ...m.newBoard(), title: 'Masks', items: [] };`);
  const png = await pngBytes(page);
  await drop(page, png, 'a.png', 'image/png', 400, 400);
  await waitForSave(page, b => b.items.length === 1, 'first image');
  await drop(page, png, 'b.png', 'image/png', 900, 400);
  await waitForSave(page, b => b.items.length === 2, 'second image');
  const [a, b] = (await savedBoard(page)).items.map(i => i.id as string);

  await item(page, a).click();
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  await bar.getByRole('button', { name: 'Crop shape' }).click();
  await page.getByRole('menuitemradio', { name: 'Hexagon' }).click();
  await waitForSave(page, x => x.items[0].style?.mask === 'hexagon', 'hexagon');
  await expect(item(page, a).locator('clipPath [data-mask="hexagon"]')).toHaveCount(1);

  // Bulk: select both and choose a heart; one undo step brings back the earlier shapes.
  await page.keyboard.press('Escape');
  await page.locator('svg.canvas').click({ position: { x: 1300, y: 150 } });
  await page.keyboard.press('Control+a');
  await expect(bar).toContainText('2 objects');
  await bar.getByRole('button', { name: 'Crop shape' }).click();
  await page.getByRole('menuitemradio', { name: 'Heart' }).click();
  await waitForSave(page, x => x.items.every(i => i.style?.mask === 'heart'), 'both hearts');
  for (const id of [a, b]) await expect(item(page, id).locator('clipPath [data-mask="heart"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitForSave(
    page,
    x => x.items.find(i => i.id === a)?.style?.mask === 'hexagon' && !x.items.find(i => i.id === b)?.style,
    'undo restores both',
  );
});

test('pinned comment threads stay open on the canvas until unpinned', async ({ page }) => {
  await seed(
    page,
    `return { ...m.newBoard(), comments: [
      { id: 't1', x: 300, y: 300, pinned: true, messages: [{ id: 'm1', text: 'Check the numbers', at: '2026-01-01T10:00:00.000Z' }] },
      { id: 't2', x: 800, y: 300, messages: [{ id: 'm2', text: 'Loose thought', at: '2026-01-01T10:00:00.000Z' }] },
    ] };`,
  );
  const card = page.getByRole('complementary', { name: /^Pinned comment: Check the numbers/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Check the numbers');
  await expect(page.getByRole('complementary', { name: /^Pinned comment: Loose thought/ })).toHaveCount(0);

  // Collapse to the header; it stays collapsed after a reload on this device.
  await card.getByRole('button', { name: 'Collapse pinned comment' }).click();
  await expect(card.getByRole('button', { name: 'Expand pinned comment' })).toHaveAttribute('aria-expanded', 'false');
  await expect(card.locator('ol')).toHaveCount(0);
  await page.reload();
  await expect(card.getByRole('button', { name: 'Expand pinned comment' })).toBeVisible();
  await card.getByRole('button', { name: 'Expand pinned comment' }).click();
  await expect(card.locator('ol')).toContainText('Check the numbers');

  // Pinning another thread from its popover keeps it open on the canvas as well.
  await page.locator('[data-comment="t2"]').click();
  await page.locator('.comment-popover').getByRole('button', { name: 'Pin thread' }).click();
  await waitForSave(page, b => b.comments?.find((t: any) => t.id === 't2')?.pinned === true, 't2 pinned');
  await page.keyboard.press('Escape');
  await expect(page.locator('.comment-popover')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: /^Pinned comment: Loose thought/ })).toBeVisible();

  // Unpinning removes the card.
  await card.getByRole('button', { name: 'Unpin thread' }).click();
  await waitForSave(page, b => !b.comments?.find((t: any) => t.id === 't1')?.pinned, 't1 unpinned');
  await expect(card).toHaveCount(0);
});
