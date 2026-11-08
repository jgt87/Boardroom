// R4-Q2: Slides and presenting media. Videos play while presenting frames and decks, PDFs and frames become
// image slides, and PowerPoint pictures and layouts are imported. Every fixture is generated in the test.
import type { Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import {
  test,
  expect,
  seed,
  item,
  fit,
  savedBoard,
  waitForSave,
  webmBytes,
  pngBytes,
  pdfBytes,
  axeViolations,
  selectViaLayers,
} from './helpers';

async function drop(page: Page, bytes: Buffer, name: string, type: string, x: number, y: number) {
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
/** Drop the test clip in the middle of an object and wait for the video object. */
async function dropClipOn(page: Page, id: string) {
  const box = (await item(page, id).boundingBox())!;
  await drop(page, await webmBytes(), 'clip.webm', 'video/webm', box.x + box.width / 2, box.y + box.height / 2);
  await waitForSave(page, b => b.items.some(i => i.type === 'video'), 'video dropped', 20000);
}
async function upload(page: Page, label: RegExp, name: string, buffer: Buffer) {
  await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
  await page.getByRole('button', { name: 'Media', exact: true }).click();
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Upload/ })
    .click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.gallery-items').getByRole('button', { name: label }).click();
  await (await chooser).setFiles({ name, mimeType: 'application/octet-stream', buffer });
}
type Deck = { slides: { layout: string; title: string; elements?: { kind: string; assetId?: string }[] }[] };
const deckOf = async (page: Page) => (await savedBoard(page)).items.find(i => i.type === 'slides')?.data as Deck;

test('a video on a frame plays while presenting, with keys and Esc to stop', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Talk', items: [{ ...m.createItem('frame', 0, 0), id: 'f', text: 'Demo', w: 1200, h: 700 }] };`,
  );
  await fit(page);
  await dropClipOn(page, 'f');
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Presentation' })
    .getByRole('button', { name: 'Present from the start' })
    .click();
  const overlay = page.getByRole('dialog', { name: 'Presentation mode' });
  await expect(page.locator('.present-bar')).toContainText('Demo · 1 / 1');
  await overlay.getByRole('button', { name: 'Play clip' }).click();
  const playing = overlay.getByRole('group', { name: 'Playing clip' });
  await expect(playing.locator('video')).toHaveCount(1);
  await expect(playing.getByRole('toolbar', { name: 'Playback' })).toBeVisible();
  // Keys go to the player while it has focus: K pauses, and the presentation stays on this frame.
  await expect(playing.getByRole('group', { name: /player/ })).toBeFocused();
  await page.keyboard.press('k');
  await expect(playing.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  // Esc stops the video, not the presentation.
  await page.keyboard.press('Escape');
  await expect(playing).toHaveCount(0);
  await expect(overlay).toBeVisible();
  // K plays the frame's video from the keyboard; the Stop button ends it.
  await page.keyboard.press('k');
  await expect(playing).toBeVisible();
  await playing.getByRole('button', { name: 'Stop clip' }).click();
  await expect(playing).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
});

test('a board video placed on a slide plays in the deck presenter', async ({ page }) => {
  await seed(
    page,
    `const d = { ...m.createItem('slides', 0, 0), id: 'd' };
     return { version: 1, title: 'Deck', items: [d, { ...m.createItem('rectangle', 800, 0), id: 'spot', w: 300, h: 200 }] };`,
  );
  await fit(page);
  await dropClipOn(page, 'spot');
  const deck = item(page, 'd');
  await deck.getByRole('combobox', { name: 'Add a video to this slide' }).selectOption({ label: 'clip' });
  await waitForSave(page, b => !!b.items.find(i => i.id === 'd')?.data?.slides[0].elements?.length, 'video placed');
  const placed = (await deckOf(page)).slides[0].elements![0];
  expect(placed.kind).toBe('video');
  expect(placed.assetId).toBe((await savedBoard(page)).items.find(i => i.type === 'video')!.assetId);
  await deck.getByRole('button', { name: 'Present deck' }).click();
  const show = page.getByRole('dialog', { name: /^Presenting/ });
  await show.getByRole('button', { name: 'Play clip' }).click();
  await expect(show.locator('video')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(show.locator('video')).toHaveCount(0);
  await expect(show).toBeVisible();
  await show.getByRole('button', { name: 'Exit presentation' }).focus();
  await page.keyboard.press('k');
  await expect(show.locator('video')).toHaveCount(1);
  expect(await axeViolations(page)).toEqual([]);
});

test('a PDF becomes a deck with one image slide per page', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Empty', items: [] };`);
  await upload(page, /^PDF as Slides/, 'Handout.pdf', pdfBytes(3));
  await waitForSave(page, b => b.items.some(i => i.type === 'slides'), 'pdf imported', 30000);
  const board = await savedBoard(page),
    deck = board.items.find(i => i.type === 'slides')!;
  expect(deck.text).toBe('Handout');
  const slides = (deck.data as Deck).slides;
  expect(slides.map(s => [s.layout, s.title, s.elements?.[0].kind])).toEqual([
    ['blank', 'Page 1', 'image'],
    ['blank', 'Page 2', 'image'],
    ['blank', 'Page 3', 'image'],
  ]);
  await expect(page.getByRole('status').filter({ hasText: '3 pages imported as image slides' })).toBeVisible();
  await fit(page);
  const picture = item(page, deck.id).locator('.canvas-deck-stage img');
  await expect(picture).toHaveAttribute('alt', 'Handout, page 1');
  expect(await picture.evaluate(i => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000);
});

test('frames become image slides from the Present panel and the frame bar', async ({ page }) => {
  await seed(
    page,
    `const a = { ...m.createItem('frame', 0, 0), id: 'a', text: 'Intro', w: 640, h: 360 };
     const b = { ...m.createItem('frame', 800, 0), id: 'b', text: 'Plan', w: 640, h: 360 };
     return { version: 1, title: 'Frames', presentation: ['b', 'a'], items: [a, b, { ...m.createItem('note', 40, 40), text: 'Ship it' }] };`,
  );
  await fit(page);
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Presentation' })
    .getByRole('button', { name: 'Image slides from frames' })
    .click();
  await waitForSave(page, b => b.items.some(i => i.type === 'slides'), 'image deck created', 20000);
  const deck = await deckOf(page);
  expect(deck.slides.map(s => [s.title, s.elements?.[0].kind])).toEqual([
    ['Plan', 'image'],
    ['Intro', 'image'],
  ]);
  await expect(page.getByRole('status').filter({ hasText: 'Created a deck with 2 image slides' })).toBeVisible();
  // One frame from its selection bar.
  await page.keyboard.press('Escape');
  await selectViaLayers(page, 'Intro');
  await page.locator('.selection-bar').getByRole('button', { name: 'Make an image slide from this frame' }).click();
  await waitForSave(page, b => b.items.filter(i => i.type === 'slides').length === 2, 'second deck', 20000);
  const decks = (await savedBoard(page)).items.filter(i => i.type === 'slides');
  expect((decks[1].data as Deck).slides.map(s => s.title)).toEqual(['Intro']);
});

test('PowerPoint pictures and positions are imported', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Empty', items: [] };`);
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    xfrm = (x: number, y: number, cx: number, cy: number) =>
      `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
  const slide = `<p:sld><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(609600, 342900, 10972800, 1143000)}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr sz="4000"/><a:t>Roadmap</a:t></a:r></a:p></p:txBody></p:sp>
    <p:pic><p:nvPicPr><p:cNvPr id="3" name="Picture" descr="Team photo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr>${xfrm(6096000, 1714500, 4572000, 3429000)}</p:spPr></p:pic>
  </p:spTree></p:cSld></p:sld>`;
  const pptx = zipSync({
    'ppt/presentation.xml': strToU8(
      '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>',
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId1" Type="${REL}/slide" Target="slides/slide1.xml"/></Relationships>`,
    ),
    'ppt/slides/slide1.xml': strToU8(slide),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId2" Type="${REL}/image" Target="../media/image1.png"/></Relationships>`,
    ),
    'ppt/media/image1.png': new Uint8Array(await pngBytes(page, 160, 120, '#2a7a4b')),
  });
  await upload(page, /^PowerPoint as Slides/, 'Roadmap.pptx', Buffer.from(pptx));
  await waitForSave(page, b => b.items.some(i => i.type === 'slides'), 'pptx imported', 20000);
  const deck = await deckOf(page),
    els = deck.slides[0].elements!;
  expect([deck.slides[0].layout, deck.slides[0].title, els.map(e => e.kind)]).toEqual([
    'blank',
    'Roadmap',
    ['text', 'image'],
  ]);
  expect(els[1]).toMatchObject({ x: 0.5, y: 0.25, w: 0.375, h: 0.5 });
  await expect(page.getByRole('status').filter({ hasText: '1 picture imported' })).toBeVisible();
  await fit(page);
  const id = (await savedBoard(page)).items.find(i => i.type === 'slides')!.id;
  await expect(item(page, id).locator('.canvas-deck-stage img[alt="Team photo"]')).toBeVisible();
  // The picture survives a reload (stored in the asset store, not pruned).
  await page.reload();
  await fit(page);
  await expect(item(page, id).locator('.canvas-deck-stage img[alt="Team photo"]')).toBeVisible();
});
