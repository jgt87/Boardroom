// Track D in the browser: full-viewport focus views for formats and Docs, "Open in" a format object, slide
// images, the slide sorter and the scale, word cloud and open-ended slide layouts.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, seed, fit, item, waitForSave, savedBoard, selectViaLayers, axeViolations } from './helpers';

const formats = `return {version:1,title:'Focus',items:[
  {...m.createItem('kanban',0,0),id:'k1',text:'Sprint',datasetId:'d'},
  {...m.createItem('doc',900,0),id:'d1',text:'Notes',data:{markdown:'# Plan\\n\\nShip it'}}],
  datasets:{d:[{id:'r',title:'Task',status:'Not started',assignee:'',start:'',end:''}]}};`;

async function mainMenu(page: Page, ...path: string[]) {
  await page.getByRole('button', { name: 'Main menu' }).click();
  for (const [k, label] of path.entries()) {
    const target = page
      .locator('.main-menu-list')
      .last()
      .locator('[role="menuitem"],[role="menuitemcheckbox"]', { hasText: new RegExp(`^${label}`) })
      .first();
    if (k < path.length - 1) await target.hover();
    else await target.click();
  }
}

async function coversViewport(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!,
    view = page.viewportSize()!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.y)).toBe(0);
  expect(Math.round(box.width)).toBe(view.width);
  expect(Math.round(box.height)).toBe(view.height);
  return dialog;
}

test('Kanban and Doc editors open as full-viewport focus views with Close, Esc and a focus trap', async ({ page }) => {
  await seed(page, formats);
  await page.evaluate(() => (location.hash = '#object=k1&focus=1'));
  const kanban = await coversViewport(page, 'Edit kanban');
  await expect(kanban.getByRole('heading', { level: 2 })).toHaveText('Records · Sprint');
  const close = kanban.getByRole('button', { name: 'Cancel editing' });
  await expect(close).toBeFocused();
  await expect(kanban.locator('.focus-view-esc')).toContainText('Esc');
  // Tab and Shift+Tab stay inside the focus view.
  await page.keyboard.press('Shift+Tab');
  expect(await kanban.evaluate(el => el.contains(document.activeElement))).toBe(true);
  for (let k = 0; k < 4; k++) await page.keyboard.press('Tab');
  expect(await kanban.evaluate(el => el.contains(document.activeElement))).toBe(true);
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(kanban).toHaveCount(0);

  await page.evaluate(() => (location.hash = '#object=d1&focus=1'));
  const doc = await coversViewport(page, 'Doc');
  await expect(doc.getByRole('heading', { level: 2 })).toHaveText('Doc');
  await doc.getByRole('button', { name: 'Cancel doc' }).click();
  await expect(doc).toHaveCount(0);
});

test('a board can open in a format object’s focus view', async ({ page }) => {
  await seed(page, formats);
  await mainMenu(page, 'Board', 'Start view', 'Open in: Kanban · Sprint');
  await waitForSave(page, b => b.startObject === 'k1', 'start object saved');
  await page.reload();
  await coversViewport(page, 'Edit kanban');
  await page.keyboard.press('Escape');
  await mainMenu(page, 'Board', 'Start view', 'Open in: Doc · Notes');
  await waitForSave(page, b => b.startObject === 'd1', 'start object changed');
  await page.reload();
  await coversViewport(page, 'Doc');
  await page.keyboard.press('Escape');
  // A link to another object wins over the start object.
  await page.goto('/#object=k1');
  await expect(page.locator('.selection-bar')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Doc' })).toHaveCount(0);
  await mainMenu(page, 'Board', 'Start view', 'Open in: Canvas');
  await waitForSave(page, b => b.startObject === undefined, 'start object cleared');
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

const deckBoard = `const s = await import('/src/specs-activities.ts');
  const slides = [s.newSlide('title', { title: 'Kickoff' }), s.newSlide('scale', { title: 'How ready are we?' }),
    s.newSlide('wordcloud', { title: 'One word' }), s.newSlide('answers', { title: 'What should change?' })];
  return {version:1,title:'Deck',items:[{...m.createItem('slides',0,0),id:'deck',text:'Team deck',w:900,h:640,
    data:{slides,current:0}}]};`;
const slidesOf = (b: { items: { data?: Record<string, unknown> }[] }) =>
  (b.items[0].data as { slides: Record<string, any>[] }).slides;

test('scale, word cloud and open-ended slides collect local responses on the canvas and when presenting', async ({
  page,
}) => {
  await seed(page, deckBoard);
  await fit(page);
  const deck = item(page, 'deck');
  await deck.getByRole('button', { name: 'Next slide' }).click();
  await deck.getByRole('button', { name: /^Rate 4/ }).click();
  await deck.getByRole('button', { name: /^Rate 4/ }).click();
  await deck.getByRole('button', { name: /^Rate 2/ }).click();
  await expect(deck.locator('.slide-scale-summary')).toHaveText('3 ratings · average 3.3');
  await waitForSave(page, b => slidesOf(b)[1].scale.votes.join() === '0,1,0,2,0', 'ratings saved');
  await deck.getByRole('combobox', { name: 'Scale range' }).selectOption('10');
  await expect(deck.getByRole('button', { name: /^Rate 10/ })).toBeVisible();

  await deck.getByRole('button', { name: 'Next slide' }).click();
  const word = deck.getByRole('textbox', { name: 'Add a word' });
  for (const w of ['Calm', 'calm', 'Busy']) {
    await word.fill(w);
    await word.press('Enter');
  }
  await waitForSave(page, b => slidesOf(b)[2].words?.length === 2, 'words saved');
  const sizes = await deck
    .locator('.slide-cloud-word')
    .evaluateAll(els => els.map(e => [e.firstChild?.textContent, parseFloat(getComputedStyle(e).fontSize)]));
  expect(sizes[0][0]).toBe('Calm');
  expect(sizes[0][1]).toBeGreaterThan(sizes[1][1] as number);

  await deck.getByRole('button', { name: 'Next slide' }).click();
  const answer = deck.getByRole('textbox', { name: 'Add an answer' });
  await answer.fill('Shorter meetings');
  await deck.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(deck.getByRole('list', { name: 'Answers' })).toContainText('Shorter meetings');

  // Presenting: typing an answer (with an "n" in it) neither toggles notes nor changes slides.
  await deck.getByRole('button', { name: 'Present deck' }).click();
  const presenter = page.getByRole('dialog', { name: /^Presenting/ });
  await presenter.getByRole('textbox', { name: 'Add an answer' }).fill('');
  await presenter.getByRole('textbox', { name: 'Add an answer' }).pressSequentially('No more slides');
  await presenter.getByRole('textbox', { name: 'Add an answer' }).press('Enter');
  await expect(presenter.getByRole('complementary', { name: 'Presenter notes' })).toHaveCount(0);
  await expect(presenter).toContainText('4 / 4');
  await waitForSave(page, b => slidesOf(b)[3].answers?.length === 2, 'answer from the presenter saved');
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(presenter).toHaveCount(0);
});

test('the visible slide exports as PNG', async ({ page }) => {
  await seed(page, deckBoard);
  await fit(page);
  await item(page, 'deck').getByRole('button', { name: 'Next slide' }).click();
  await selectViaLayers(page, 'Team deck');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export slide as PNG' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Team deck - slide 02.png');
  const png = readFileSync((await download.path())!);
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1920);
  expect(png.readUInt32BE(20)).toBe(1080);
});

test('every slide exports as a PNG in one ZIP', async ({ page }) => {
  await seed(page, deckBoard);
  await fit(page);
  await selectViaLayers(page, 'Team deck');
  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export all slides as PNG (ZIP)' }).click(),
  ]);
  expect(zip.suggestedFilename()).toBe('Team deck - slides.zip');
  const bytes = readFileSync((await zip.path())!);
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  for (let k = 1; k <= 4; k++) expect(bytes.includes(Buffer.from(`Team deck - slide 0${k}.png`))).toBe(true);
});

test('the slide sorter reorders by keyboard and drag and drop and edits the selected slide', async ({ page }) => {
  await seed(page, deckBoard);
  await fit(page);
  await item(page, 'deck').getByRole('button', { name: 'Open slide sorter' }).click();
  const sorter = await coversViewport(page, 'Slide sorter · Team deck');
  const thumbs = sorter.locator('.slide-thumb');
  await expect(thumbs).toHaveCount(4);
  await expect(thumbs.first()).toBeFocused();
  await expect(sorter.getByRole('button', { name: 'Close slide sorter' })).toBeVisible();

  // Arrow keys move between slides; Alt+arrow moves the focused slide.
  await page.keyboard.press('ArrowRight');
  await expect(thumbs.nth(1)).toBeFocused();
  await expect(thumbs.nth(1)).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Alt+ArrowLeft');
  await waitForSave(page, b => slidesOf(b)[0].title === 'How ready are we?', 'slide moved by keyboard');
  await expect(thumbs.nth(0)).toBeFocused();

  // Drag the last slide onto the first.
  await thumbs.nth(3).dragTo(thumbs.nth(0));
  await waitForSave(
    page,
    b =>
      slidesOf(b)
        .map(s => s.title)
        .join('|') === 'What should change?|How ready are we?|Kickoff|One word',
    'slide moved by drag and drop',
  );

  // Selecting a slide shows it in the editor beside the grid.
  await thumbs.nth(2).click();
  await expect(sorter.getByRole('combobox', { name: 'Slide layout' })).toHaveValue('title');
  await sorter.getByRole('combobox', { name: 'Slide layout' }).selectOption('wordcloud');
  await waitForSave(page, b => slidesOf(b)[2].layout === 'wordcloud', 'layout changed in the sorter');
  expect(await axeViolations(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(sorter).toHaveCount(0);
  // The canvas deck shows the slide chosen in the sorter.
  await expect(item(page, 'deck').locator('.canvas-deck-tools')).toContainText('3 / 4');
  expect((await savedBoard(page)).items[0].data.slides).toHaveLength(4);
});
