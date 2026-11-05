// Decided open questions (round 2): a video remembers its speed (P2-Q1), cuts are drawn on the Talktrack waveform
// (P2-Q3), callout tails pick the callout (P2-Q5), Mermaid-linked frames get a status chip (P2-Q7) and a dropped
// .drawio file asks how to add it, importing every page as shapes (P2-Q4).
import type { Page } from '@playwright/test';
import { test, expect, seed, item, fit, waitForSave, savedBoard, mouseDrag, webmBytes } from './helpers';

async function dropFile(page: Page, bytes: Buffer, name: string, type: string, x = 600, y = 400) {
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
async function addVideo(page: Page) {
  await seed(page, `return { version: 1, title: 'Clips', items: [] };`);
  await dropFile(page, await webmBytes(), 'clip.webm', 'video/webm');
  await waitForSave(page, b => b.items.some(i => i.type === 'video'), 'video dropped', 20000);
  return (await savedBoard(page)).items.find(i => i.type === 'video')!.id as string;
}
const keepPlaying = (page: Page) =>
  page.evaluate(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.resolve();
    };
  });

test('a video remembers its playback speed after a reload', async ({ page }) => {
  const id = await addVideo(page);
  await keepPlaying(page);
  await item(page, id)
    .getByRole('button', { name: /^Play / })
    .click();
  const speed = item(page, id).getByLabel('Playback speed');
  await speed.selectOption('1.5');
  await waitForSave(page, b => b.items.find(i => i.id === id)?.data?.rate === 1.5, 'speed remembered');
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
  await keepPlaying(page);
  await item(page, id)
    .getByRole('button', { name: /^Play / })
    .click();
  await expect(item(page, id).getByLabel('Playback speed')).toHaveValue('1.5');
  await expect
    .poll(() =>
      item(page, id)
        .locator('video')
        .evaluate(v => (v as HTMLVideoElement).playbackRate),
    )
    .toBe(1.5);
  // Back to normal speed: the field is removed again.
  await item(page, id).getByLabel('Playback speed').selectOption('1');
  await waitForSave(page, b => b.items.find(i => i.id === id)?.data?.rate === undefined, 'normal speed');
});

test('a cut is drawn by dragging across the waveform and resized by its edge; one undo step', async ({ page }) => {
  await addVideo(page);
  const duration = (await savedBoard(page)).items.find(i => i.type === 'video')!.data.duration as number;
  expect(duration).toBeGreaterThan(0.5);
  await page.getByRole('button', { name: 'Formats and Flows' }).click();
  await page.locator('.gallery-items button', { hasText: 'Talktrack' }).first().click();
  await page
    .getByRole('region', { name: 'Recordings on this board' })
    .getByRole('button', { name: 'Rename or trim' })
    .click();
  const dialog = page.getByRole('dialog');
  const wave = dialog.locator('svg.waveform');
  await expect(wave).toBeVisible();
  // The dialog grows (and re-centres) as cut rows are added, so measure the waveform before every drag.
  let box = (await wave.boundingBox())!;
  const at = (f: number) => ({ x: box.x + box.width * f, y: box.y + box.height / 2 });
  await mouseDrag(page, at(0.2), at(0.5), 10);
  box = (await wave.boundingBox())!;
  await expect(dialog.getByLabel('Cut 1 start')).toBeVisible();
  const tenth = (f: number) => Math.round(duration * f * 10) / 10;
  const value = async (label: string) => {
    const t = await dialog.getByLabel(label).inputValue();
    const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(t)!;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  expect(Math.abs((await value('Cut 1 start')) - tenth(0.2))).toBeLessThanOrEqual(0.15);
  expect(Math.abs((await value('Cut 1 end')) - tenth(0.5))).toBeLessThanOrEqual(0.15);
  // Drag the cut's end edge further right; its start stays.
  await mouseDrag(page, at(0.5), at(0.75), 10);
  box = (await wave.boundingBox())!;
  await expect(dialog.getByLabel('Cut 2 start')).toHaveCount(0);
  expect(Math.abs((await value('Cut 1 end')) - tenth(0.75))).toBeLessThanOrEqual(0.15);
  expect(Math.abs((await value('Cut 1 start')) - tenth(0.2))).toBeLessThanOrEqual(0.15);
  // A click without a drag adds nothing; typed entry still works beside it.
  await page.mouse.click(at(0.9).x, at(0.9).y);
  await expect(dialog.getByLabel('Cut 2 start')).toHaveCount(0);
  await page.keyboard.press('Control+Enter');
  await waitForSave(page, b => !!b.items.find(i => i.type === 'video')?.data?.cuts, 'cut saved');
  const cuts = (await savedBoard(page)).items.find(i => i.type === 'video')!.data.cuts;
  expect(cuts).toHaveLength(1);
  expect(cuts[0].start).toBeLessThan(cuts[0].end);
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitForSave(page, b => !b.items.find(i => i.type === 'video')?.data?.cuts, 'cut undone');
});

test('clicking or dragging a callout tail selects and moves the callout', async ({ page }) => {
  await seed(
    page,
    `const c={...m.createItem('callout',0,0,'#fff49b'),id:'c',text:'Look',w:240,h:150,tail:{x:120,y:330}};
     const r={...m.createItem('rectangle',600,0,'#ffffff'),id:'r',text:'Other'};
     return {version:1,title:'Tail',items:[c,r]};`,
  );
  await fit(page);
  const tail = item(page, 'c').locator('.callout-tail-hit');
  await expect(tail).toHaveCount(1);
  const box = (await tail.boundingBox())!;
  // Near the tip, where the drawn tail is only a few pixels wide, and just beside it.
  const near = { x: box.x + box.width / 2 + 2, y: box.y + box.height * 0.92 };
  await page.mouse.click(near.x, near.y);
  await expect(page.getByRole('button', { name: 'Reset callout tail' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Reset callout tail' })).toHaveCount(0);
  const before = (await savedBoard(page)).items.find(i => i.id === 'c')!;
  const grab = { x: box.x + box.width / 2, y: box.y + box.height * 0.7 };
  await mouseDrag(page, grab, { x: grab.x + 120, y: grab.y });
  await waitForSave(page, b => b.items.find(i => i.id === 'c').x > before.x + 20, 'callout moved by its tail');
  const after = (await savedBoard(page)).items.find(i => i.id === 'c')!;
  expect(after.y).toBeCloseTo(before.y, -1);
  expect(after.tail).toEqual(before.tail);
});

test('a frame linked to Mermaid code shows a status chip set from the selection bar', async ({ page }) => {
  await seed(
    page,
    `const ml = await import('/src/mermaid-link.ts');
     const r = ml.convertToLinked('flowchart LR\\n  A[Start] --> B[Ship]', { x: 0, y: 0 });
     return { ...m.newBoard(), title: 'Linked', items: r.items };`,
  );
  await fit(page);
  const frame = (await savedBoard(page)).items.find(i => i.type === 'frame' && i.data?.mermaid)!;
  const area = (await item(page, frame.id).locator('.object-hit-area').first().boundingBox())!;
  await page.mouse.click(area.x + 12, area.y + area.height - 12);
  await page.getByRole('toolbar', { name: 'Selection actions' }).getByRole('button', { name: 'Status: None' }).click();
  const chip = item(page, frame.id).locator(':scope > .item-status-chip-svg');
  await expect(chip).toHaveAttribute('data-status', 'draft');
  await waitForSave(page, b => b.items.find(i => i.id === frame.id)?.data?.status === 'draft', 'frame status');
  // The status does not count as a diagram change: the link stays in sync.
  await expect(item(page, frame.id).locator('[data-mermaid-badge]')).toHaveAttribute('data-mermaid-badge', 'synced');
  await page.reload();
  await expect(item(page, frame.id).locator(':scope > .item-status-chip-svg text')).toHaveText('Draft');
});

const page2 = (name: string, label: string) =>
  `<diagram id="${name}" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
  `<mxCell id="a" value="${label} A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell>` +
  `<mxCell id="b" value="${label} B" vertex="1" parent="1"><mxGeometry x="220" y="100" width="120" height="60" as="geometry"/></mxCell>` +
  `<mxCell id="e" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>` +
  `</root></mxGraphModel></diagram>`;
const twoPages = Buffer.from(`<mxfile>${page2('Overview', 'O')}${page2('Detail', 'D')}</mxfile>`);

test('a dropped .drawio file asks how to add it; native shapes bring every page in its own frame', async ({ page }) => {
  await seed(page, `return { ...m.newBoard(), title: 'Draw', items: [] };`);
  // Cancel adds nothing.
  await dropFile(page, twoPages, 'Plan.drawio', 'application/xml');
  const ask = page.getByRole('dialog', { name: 'Add a draw.io diagram' });
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('Plan.drawio');
  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  expect((await savedBoard(page)).items).toHaveLength(0);
  // Native shapes: one frame per page, named after it, with the page's shapes and connector inside.
  await dropFile(page, twoPages, 'Plan.drawio', 'application/xml');
  await ask.getByRole('button', { name: /^Native shapes/ }).click();
  await waitForSave(page, b => b.items.filter(i => i.type === 'frame').length === 2, 'pages imported');
  const b = await savedBoard(page);
  expect(b.items.filter(i => i.type === 'frame').map(i => i.text)).toEqual(['Overview', 'Detail']);
  expect(b.items.filter(i => i.type === 'rectangle')).toHaveLength(4);
  expect(b.items.filter(i => i.type === 'arrow')).toHaveLength(2);
  await expect(page.getByRole('status').filter({ hasText: '2 pages sit side by side' }).first()).toBeAttached();
  // One undo step removes the whole import.
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitForSave(page, b => !b.items.length, 'import undone');
  // The draw.io object keeps the file as it is.
  await dropFile(page, twoPages, 'Plan.drawio', 'application/xml');
  await ask.getByRole('button', { name: /^Draw.io object/ }).click();
  await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'drawio', 'object added');
});
