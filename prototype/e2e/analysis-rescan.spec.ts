// Items 78–85 in the browser: shape packs, wireframe button styles, Slides decks and presenting,
// PowerPoint and Markdown import, Doc slash menu/templates/export, open-ended activity, reactions, authors.
import { zipSync, strToU8 } from 'fflate';
import { test, expect, seed, item, fit, waitForSave, savedBoard, axeViolations } from './helpers';

const empty = `return {version:1,title:'Rescan',items:[]};`;

test('shape packs place pack shapes from the Shapes and lines menu', async ({ page }) => {
  await seed(page, empty);
  await page.getByRole('button', { name: 'Shapes and lines', exact: true }).click();
  const menu = page.getByRole('complementary', { name: 'Shapes and lines' });
  await menu.getByRole('button', { name: /More shapes/ }).click();
  await menu.getByRole('button', { name: 'BPMN', exact: true }).click();
  await expect(menu.getByRole('button', { name: 'BPMN', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await axeViolations(page)).toEqual([]);
  await menu.getByRole('button', { name: 'Exclusive gateway', exact: true }).click();
  await page.locator('svg.canvas').click({ position: { x: 650, y: 350 } });
  await waitForSave(page, b => b.items.some(i => i.type === 'exclusivegateway'), 'gateway placed');
  await page.getByRole('button', { name: 'Shapes and lines', exact: true }).click();
  await menu.getByRole('button', { name: /More shapes/ }).click();
  await menu.getByRole('button', { name: 'Flowchart', exact: true }).click();
  await menu.getByRole('button', { name: 'Document', exact: true }).click();
  await page.locator('svg.canvas').click({ position: { x: 300, y: 300 } });
  await waitForSave(page, b => b.items.some(i => i.type === 'document'), 'document shape placed');
});

test('wireframe library offers button styles and the selection bar changes them', async ({ page }) => {
  await seed(page, empty);
  await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
  await page.getByRole('button', { name: 'Libraries', exact: true }).click();
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Wireframe library/ })
    .click();
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Outline button with icon/ })
    .click();
  await page.locator('svg.canvas').click({ position: { x: 600, y: 350 } });
  await waitForSave(
    page,
    b => b.items.some(i => i.data?.variant === 'outline' && i.data?.icon === 'plus'),
    'outline button placed',
  );
  const id = (await savedBoard(page)).items[0].id;
  await expect(item(page, id).locator('.wf-button-outline svg')).toBeVisible();
  await page.getByRole('button', { name: /^Button style: outline/ }).click();
  await waitForSave(page, b => b.items[0].data.variant === 'rounded', 'style cycled');
});

const deck = `const d = m.createItem('slides', 100, 100);
  return {version:1,title:'Deck',items:[{...d,id:'deck',w:800,h:560}]};`;
test('slides decks edit on the canvas, add slides and templates, and present full screen', async ({ page }) => {
  await seed(page, deck);
  await fit(page);
  const d = item(page, 'deck');
  const title = d.getByRole('textbox', { name: 'Slide title', exact: true });
  await title.fill('Launch plan');
  await title.press('Enter');
  await waitForSave(page, b => b.items[0].data.slides[0].title === 'Launch plan', 'title saved');
  await d.getByRole('combobox', { name: 'Add slide' }).selectOption('template:agenda');
  await waitForSave(page, b => b.items[0].data.slides.length === 3, 'template added');
  await expect(d.getByRole('textbox', { name: 'Slide title', exact: true })).toHaveValue('Agenda');
  await d.getByRole('combobox', { name: 'Add slide' }).selectOption('layout:activity');
  await waitForSave(page, b => b.items[0].data.slides[2].layout === 'activity', 'activity added');
  await d.getByRole('button', { name: '+1 vote for Option B', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.slides[2].options[1].votes === 1, 'vote counted');
  const thumb = d.getByRole('button', { name: /^Slide 3 / });
  await thumb.focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await waitForSave(page, b => b.items[0].data.slides[1].layout === 'activity', 'slide moved left');
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.slides[2].layout === 'activity', 'undo move');
  await d.getByRole('button', { name: 'Present deck' }).click();
  const show = page.getByRole('dialog', { name: /^Presenting/ });
  await expect(show).toBeVisible();
  await expect(show.getByRole('button', { name: 'Exit presentation' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(show).toContainText('Launch plan');
  await page.keyboard.press('ArrowRight');
  await expect(show).toContainText('2 / 4');
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(show).toHaveCount(0);
});

test('the Slides format places a deck and PowerPoint files import as decks', async ({ page }) => {
  await seed(page, empty);
  await page.getByRole('button', { name: 'Formats and Flows', exact: true }).click();
  await page.locator('.formats-menu').getByRole('button', { name: 'Slides', exact: true }).click();
  await page.locator('svg.canvas').click({ position: { x: 600, y: 360 } });
  await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'slides', 'deck placed');
  const rels = `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`;
  const sp = (type: string, t: string) =>
    `<p:sp><p:nvSpPr><p:nvPr><p:ph type="${type}"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const pptx = zipSync({
    'ppt/presentation.xml': strToU8(
      '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>',
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(rels),
    'ppt/slides/slide1.xml': strToU8(`<p:sld>${sp('ctrTitle', 'Imported deck')}</p:sld>`),
    'ppt/slides/slide2.xml': strToU8(`<p:sld>${sp('title', 'Second')}${sp('body', 'Point one')}</p:sld>`),
  });
  await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
  await page.getByRole('button', { name: 'Media', exact: true }).click();
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Upload/ })
    .click();
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^PowerPoint as Slides/ })
    .click();
  await (
    await chooser
  ).setFiles({ name: 'Review.pptx', mimeType: 'application/octet-stream', buffer: Buffer.from(pptx) });
  // The original .pptx is kept beside the deck as a File object (P2-Q8).
  await waitForSave(page, b => b.items.length === 3 && b.items[2].type === 'file', 'pptx imported');
  const imported = (await savedBoard(page)).items[1];
  expect([imported.text, imported.data.slides.map((s: { title: string }) => s.title)]).toEqual([
    'Review',
    ['Imported deck', 'Second'],
  ]);
  await expect(page.getByRole('status').filter({ hasText: '2 slides imported' })).toBeVisible();
});

test('Docs get a slash menu, callouts, templates, Markdown upload and export', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Docs',items:[{...m.createItem('doc',100,100),id:'doc',w:600,h:520,data:{markdown:'# Plan\\n\\nIntro'}}]};`,
  );
  await fit(page);
  const editor = item(page, 'doc').getByRole('textbox', { name: /^Document content/ });
  await editor.getByText('Intro', { exact: true }).click();
  await expect(editor).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/warn');
  const menu = page.getByRole('listbox', { name: 'Insert block' });
  await expect(menu.getByRole('option', { name: /Warning callout/ })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(item(page, 'doc').locator('.doc-callout-warning')).toBeVisible();
  await page.keyboard.type('Check the release date');
  await page.keyboard.press('Control+Enter');
  await waitForSave(page, b => b.items[0].data.markdown.includes('> [!WARNING]'), 'callout saved');
  await item(page, 'doc').getByRole('combobox', { name: 'Apply a doc template' }).selectOption('retro');
  await waitForSave(page, b => b.items[0].data.markdown.startsWith('# Retrospective'), 'template applied');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items[0].data.markdown.includes('> [!WARNING]'), 'template undone');
  await item(page, 'doc').locator('.rich-title > span').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export as Markdown' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.md$/);
  await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
  await page.getByRole('button', { name: 'Media', exact: true }).click();
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Upload/ })
    .click();
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Markdown as Doc/ })
    .click();
  await (
    await chooser
  ).setFiles({
    name: 'notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Release notes\n\n> [!TIP]\n> Ship small\n'),
  });
  await waitForSave(page, b => b.items.length === 2 && b.items[1].text === 'Release notes', 'markdown imported');
});

test('open-ended responses collect on the canvas and convert to sticky notes', async ({ page }) => {
  await seed(page, `return {version:1,title:'Open',items:[{...m.createItem('openended',100,100),id:'oe'}]};`);
  await fit(page);
  const box = item(page, 'oe').getByRole('textbox', { name: 'New response' });
  await box.fill('More pairing');
  await box.press('Enter');
  await box.fill('Fewer meetings');
  await box.press('Enter');
  await waitForSave(page, b => b.items[0].data.responses.length === 2, 'responses saved');
  await item(page, 'oe').locator('.canvas-widget-header > span').click();
  await page.getByRole('button', { name: 'Convert responses to sticky notes' }).click();
  await waitForSave(page, b => b.items.filter(i => i.type === 'note').length === 2, 'notes created');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => !b.items.some(i => i.type === 'note'), 'undo conversion');
});

test('reactions float without changing the board; authors label new sticky notes', async ({ page }) => {
  await seed(page, empty);
  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.getByRole('button', { name: /^Reactions/ }).click();
  await page.getByRole('button', { name: 'Celebrate', exact: true }).click();
  await expect(page.locator('.reaction-float').first()).toBeAttached();
  await expect(page.locator('[aria-live="polite"]', { hasText: 'Reaction sent: Celebrate' })).toBeAttached();
  expect((await savedBoard(page)).items).toEqual([]);
  await page.getByRole('button', { name: 'Close reactions' }).click();
  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.getByRole('button', { name: /^Note authors/ }).click();
  await page.getByRole('textbox', { name: 'Your name on new sticky notes' }).fill('Sam Lee');
  await page.getByRole('checkbox', { name: 'Show authors on sticky notes' }).check();
  await waitForSave(page, b => b.showAuthors === true, 'setting saved');
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Close note authors' }).click();
  await page.getByRole('button', { name: 'Sticky note', exact: true }).first().click();
  await page.locator('svg.canvas').click({ position: { x: 600, y: 360 } });
  await waitForSave(page, b => b.items.some(i => i.type === 'note' && i.author === 'Sam Lee'), 'author recorded');
  await page.keyboard.press('Escape');
  await expect(page.locator('.note-author', { hasText: 'Sam Lee' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.note-author', { hasText: 'Sam Lee' })).toBeVisible();
});

test('the tool rail Emoji and stickers button places emoji and stickers by clicking the board', async ({ page }) => {
  await seed(page, empty);
  await page.getByRole('button', { name: 'Emoji and stickers', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Emoji and stickers' });
  await expect(panel.getByRole('button', { name: 'Star sticker' })).toBeVisible();
  await panel.getByRole('textbox', { name: 'Search emoji' }).fill('rocket');
  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  expect((await savedBoard(page)).items.length).toBe(0);
  await page.locator('svg.canvas').click({ position: { x: 600, y: 360 } });
  await waitForSave(page, b => b.items.length === 1 && b.items[0].data.emoji === '🚀', 'emoji placed');
  expect((await savedBoard(page)).items[0].type).toBe('stamp');
  await page.getByRole('button', { name: 'Emoji and stickers', exact: true }).click();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Star sticker' }).click();
  await page.locator('svg.canvas').click({ position: { x: 800, y: 360 } });
  await waitForSave(page, b => b.items.some(i => i.data?.stamp === 'star'), 'sticker placed');
  await page.getByRole('button', { name: 'Emoji and stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Heart sticker' }).click();
  await page.keyboard.press('Escape');
  await page.locator('svg.canvas').click({ position: { x: 400, y: 500 } });
  expect((await savedBoard(page)).items.length).toBe(2);
});
