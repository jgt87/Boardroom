// Track R1a in the browser: the colour menu's palette with shades, keyboard swatches and hex entry, the same menu
// in the border and inspector controls, and the last-used colour for new shapes, text and connectors.
import { test, expect, seed, waitForSave, savedBoard, item, fit } from './helpers';

const canvas = (page: import('@playwright/test').Page) => page.locator('svg.canvas');

test('the colour menu offers shades, keyboard swatches and a validated hex field', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Colours', items: [{ ...m.createItem('rectangle', 0, 0, '#ffffff'), id: 'a' }] };`,
  );
  await fit(page);
  await item(page, 'a').click();
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  await bar.getByRole('button', { name: 'Object colour: White' }).click();
  const menu = page.getByRole('dialog', { name: 'Colours for object colour' });
  const palette = menu.getByRole('group', { name: 'Palette' });
  await expect(palette.getByRole('button')).toHaveCount(50);
  // Shades light to dark for one hue, each with a spoken name.
  for (const name of ['Pale blue', 'Light blue', 'Blue', 'Dark blue', 'Deep blue'])
    await expect(palette.getByRole('button', { name: `Use colour ${name}`, exact: true })).toBeVisible();
  await palette.getByRole('button', { name: 'Use colour Dark blue', exact: true }).click();
  await waitForSave(page, b => b.items[0].fill === '#1d4ed8', 'shade from the palette');
  await expect(palette.getByRole('button', { name: 'Use colour Dark blue', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Keyboard: the chosen cell is the Tab stop; arrows move through the grid and Enter applies.
  const chosen = palette.getByRole('button', { name: 'Use colour Dark blue', exact: true });
  await chosen.focus();
  await page.keyboard.press('ArrowRight');
  await expect(palette.getByRole('button', { name: 'Use colour Dark violet', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(palette.getByRole('button', { name: 'Use colour Violet', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await waitForSave(page, b => b.items[0].fill === '#8b5cf6', 'shade from the keyboard');
  expect((await savedBoard(page)).items[0].x).toBe(0);

  // Hex entry: invalid input shows an inline error; Enter applies a valid #rgb.
  const hex = menu.getByRole('textbox', { name: 'Hex colour' });
  await expect(hex).toHaveValue('#8b5cf6');
  await hex.fill('#12g');
  await hex.press('Enter');
  await expect(menu.getByRole('alert')).toContainText('hex colour');
  await expect(hex).toHaveAttribute('aria-invalid', 'true');
  await hex.fill('#0a8');
  await expect(menu.getByRole('alert')).toHaveCount(0);
  await hex.press('Enter');
  await waitForSave(page, b => b.items[0].fill === '#00aa88', 'typed hex colour');
  await expect(menu.getByRole('group', { name: 'Recent colours' }).getByRole('button')).toHaveCount(3);

  // Escape closes the menu and returns focus to its trigger, which names the new colour.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(bar.getByRole('button', { name: /^Object colour: / })).toBeFocused();

  // The border control uses the same menu.
  await bar.getByRole('button', { name: /^Border colour: / }).click();
  await page
    .getByRole('dialog', { name: 'Colours for border colour' })
    .getByRole('button', { name: 'Use colour Deep red', exact: true })
    .click();
  await waitForSave(page, b => b.items[0].style?.borderColor === '#7f1d1d', 'border shade');
  await page.keyboard.press('Escape');

  // So does the inspector.
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Properties' });
  await inspector.getByRole('button', { name: /^Fill colour: / }).click();
  const fillMenu = page.getByRole('dialog', { name: 'Colours for fill colour' });
  await fillMenu.getByRole('textbox', { name: 'Hex colour' }).fill('ffedd5');
  await fillMenu.getByRole('button', { name: 'Apply' }).click();
  await waitForSave(page, b => b.items[0].fill === '#ffedd5', 'inspector hex');
  await expect(inspector.getByRole('button', { name: 'Fill colour: Pale orange' })).toBeVisible();
});

test('new shapes, text and connectors reuse the colour last applied to their kind', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Last colour', items: [
       { ...m.createItem('rectangle', 0, 0, '#ffffff'), id: 'r' },
       { ...m.createItem('text', 0, 300), id: 't', text: 'Title' },
       { ...m.createItem('arrow', 400, 0), id: 'l' },
     ] };`,
  );
  await fit(page);
  const bar = page.getByRole('toolbar', { name: 'Selection actions' });
  const pick = async (id: string, trigger: RegExp, name: string) => {
    await item(page, id).click();
    await bar.getByRole('button', { name: trigger }).click();
    await page
      .getByRole('dialog', { name: /^Colours for / })
      .getByRole('button', { name: `Use colour ${name}`, exact: true })
      .click();
    await page.keyboard.press('Escape');
  };
  await pick('r', /^Object colour: /, 'Light green');
  await pick('t', /^Text colour: /, 'Dark red');
  await waitForSave(page, b => b.items[0].fill === '#86efac' && b.items[1].fill === '#b91c1c', 'colours applied');
  // The connector: select it through the board (its line is thin), then use the same menu.
  await item(page, 'l').click({ force: true });
  await bar.getByRole('button', { name: /^Line colour: / }).click();
  await page
    .getByRole('dialog', { name: 'Colours for line colour' })
    .getByRole('button', { name: 'Use colour Blue', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await waitForSave(page, b => b.items[2].fill === '#3b82f6', 'line colour applied');

  const place = async (key: string) => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await canvas(page).focus();
    await page.keyboard.press(key);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
  };
  await place('r');
  await place('d');
  await place('t');
  await place('l');
  await waitForSave(page, b => b.items.length === 7, 'four new objects');
  const added = (await savedBoard(page)).items.slice(3);
  expect(added.map(i => [i.type, i.fill])).toEqual([
    ['rectangle', '#86efac'],
    ['diamond', '#86efac'],
    ['text', '#b91c1c'],
    ['arrow', '#3b82f6'],
  ]);
  // Sticky notes keep their own tool colour.
  await place('n');
  await waitForSave(page, b => b.items.length === 8, 'new note');
  expect((await savedBoard(page)).items[7].fill).not.toBe('#86efac');
});
