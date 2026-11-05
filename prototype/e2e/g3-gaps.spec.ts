// Canvas gaps, round g3: a locked linked Mermaid frame keeps its code, cutting a linked diagram takes it whole,
// the shape inserted on a line can be chosen, resize cursors follow rotation, and brand colours appear in the
// inspector, the colour menu and widget editors.
import {
  test,
  expect,
  seed,
  waitForSave,
  savedBoard,
  item,
  fit,
  center,
  selectViaLayers,
  type BoardJson,
} from './helpers';

const FLOW = 'flowchart LR\\n  A[Start] --> B[Review]\\n  B --> C[Ship]';
const seedLinked = (locked: boolean) =>
  `const ml = await import('/src/mermaid-link.ts');
   const r = ml.convertToLinked('${FLOW}', { x: 0, y: 0 });
   const items = r.items.map(i => (i.id === r.frame.id ? { ...i, id: 'lf', ${locked ? 'locked: true' : ''} } : i))
     .map(i => (i.mermaidNode ? { ...i, mermaidNode: { ...i.mermaidNode, frame: 'lf' } } : i));
   const board = { version: 1, title: 'Linked', items };
   return { ...board, items: ml.keepShapes(board, 'lf').items };`;
const node = (b: BoardJson, key: string) => b.items.find(i => i.mermaidNode?.id === key);
const linkFrame = (b: BoardJson) => b.items.find(i => i.type === 'frame' && i.data?.mermaid);

test('a locked linked frame keeps its code and shows that the shapes were edited', async ({ page }) => {
  await seed(page, seedLinked(true));
  await fit(page);
  const before = await savedBoard(page);
  const code = linkFrame(before).data.mermaid.code;
  const badge = page.locator('[data-item="lf"] [data-mermaid-badge]');
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'synced');
  await item(page, node(before, 'C').id).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Launch');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => node(b, 'C').text === 'Launch', 'renamed');
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'shapes');
  await expect(badge).toContainText('shapes edited');
  expect(linkFrame(await savedBoard(page)).data.mermaid.code).toBe(code);
});

test('cutting a linked diagram removes it whole; paste brings back one copy', async ({ page }) => {
  await seed(page, seedLinked(false));
  await fit(page);
  const before = await savedBoard(page);
  await selectViaLayers(page, 'Flowchart');
  const html = await page.evaluate(() => {
    const dt = new DataTransfer();
    window.dispatchEvent(new ClipboardEvent('cut', { clipboardData: dt }));
    return dt.getData('text/html');
  });
  expect(html).toContain('boardroom-objects');
  await waitForSave(page, b => b.items.length === 0, 'everything cut');
  // One undo step brings the whole diagram back.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items.length === before.items.length, 'undo cut');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await waitForSave(page, b => b.items.length === 0, 'redo cut');
  await page.evaluate(h => {
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
  }, html);
  await waitForSave(page, b => b.items.length === before.items.length, 'pasted once');
  const pasted = await savedBoard(page);
  expect(pasted.items.filter(i => i.type === 'frame').length).toBe(1);
  await expect(page.locator(`[data-item="${linkFrame(pasted).id}"] [data-mermaid-badge]`)).toHaveAttribute(
    'data-mermaid-badge',
    'synced',
  );
});

test('cutting a plain frame keeps its contents, as Delete does', async ({ page }) => {
  await seed(
    page,
    `const f = { ...m.createItem('frame', 0, 0), id: 'f', text: 'Plain', w: 800, h: 500 };
     const r = { ...m.createItem('rectangle', 100, 100), id: 'r' };
     return { version: 1, title: 'Plain', items: [f, r] };`,
  );
  await fit(page);
  await selectViaLayers(page, 'Plain');
  await page.evaluate(() => window.dispatchEvent(new ClipboardEvent('cut', { clipboardData: new DataTransfer() })));
  await waitForSave(page, b => b.items.length === 1 && b.items[0].id === 'r', 'frame cut, contents kept');
});

test('the shape inserted on a line can be chosen, defaulting to the source shape', async ({ page }) => {
  await seed(
    page,
    `const a = { ...m.createItem('diamond', 0, 0, '#ffffff'), id: 'a', text: 'A' };
     const b = { ...m.createItem('rectangle', 700, 0, '#ffffff'), id: 'b', text: 'B' };
     const c = { ...m.createItem('arrow', 0, 0), id: 'c', from: 'a', to: 'b' };
     return { version: 1, title: 'Line', items: [a, b, c] };`,
  );
  await fit(page);
  const mid = await center(item(page, 'c'));
  await page.mouse.click(mid.x, mid.y);
  const button = page.getByRole('button', { name: 'Insert shape on line' });
  await button.click();
  const menu = page.getByRole('menu', { name: 'Shape to insert' });
  await expect(menu).toBeVisible();
  const first = menu.getByRole('menuitem').first();
  await expect(first).toHaveAttribute('data-kind', 'diamond');
  await expect(first).toBeFocused();
  await expect(menu.getByRole('menuitem')).toHaveCount(10);
  // Escape closes the menu and returns focus to the button.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();
  // Keyboard: open, move to the second entry (rectangle) and insert it.
  await page.keyboard.press('Enter');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').nth(1)).toHaveAttribute('data-kind', 'rectangle');
  await page.keyboard.press('Enter');
  await waitForSave(page, b => b.items.length === 5, 'split');
  let board = await savedBoard(page);
  expect(board.items.find(i => !['a', 'b'].includes(i.id) && i.type !== 'arrow').type).toBe('rectangle');
  // Undo, then pick the default with the mouse.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(page, b => b.items.length === 3, 'undo');
  await page.mouse.click(mid.x, mid.y);
  await button.click();
  await menu.getByRole('menuitem', { name: /Ellipse/ }).click();
  await waitForSave(page, b => b.items.length === 5, 'ellipse');
  board = await savedBoard(page);
  expect(board.items.find(i => !['a', 'b'].includes(i.id) && i.type !== 'arrow').type).toBe('ellipse');
});

test('resize cursors follow the rotation of the object', async ({ page }) => {
  await seed(
    page,
    `const a = { ...m.createItem('rectangle', 0, 0), id: 'a', rotation: 90 };
     const b = { ...m.createItem('rectangle', 600, 0), id: 'b' };
     return { version: 1, title: 'Turned', items: [a, b] };`,
  );
  await fit(page);
  const cursor = (h: string) =>
    page.locator(`.selection [data-resize="${h}"]`).evaluate(el => getComputedStyle(el).cursor);
  await item(page, 'b').click();
  expect(await cursor('e')).toBe('ew-resize');
  expect(await cursor('ne')).toBe('nesw-resize');
  await item(page, 'a').click();
  expect(await cursor('e')).toBe('ns-resize');
  expect(await cursor('n')).toBe('ew-resize');
  expect(await cursor('ne')).toBe('nwse-resize');
});

test('brand colours appear in the inspector, the colour menu and widget editors', async ({ page }) => {
  await seed(
    page,
    `localStorage.setItem('boardroom.brandkit.v1', JSON.stringify({ colors: ['#123456', '#abcdef'] }));
     const a = { ...m.createItem('rectangle', 0, 0, '#ffffff'), id: 'a' };
     const s = { ...m.createItem('shortcut', 600, 0), id: 's' };
     return { version: 1, title: 'Brand', items: [a, s] };`,
  );
  await fit(page);
  await item(page, 'a').click();
  // Colour menu: a Brand row first.
  await page.getByRole('button', { name: /^Object colour: / }).click();
  const colours = page.getByRole('dialog', { name: 'Colours' });
  await colours.getByRole('group', { name: 'Brand colours' }).getByRole('button').nth(1).click();
  await waitForSave(page, b => b.items[0].fill === '#abcdef', 'brand colour from the menu');
  await page.keyboard.press('Escape');
  // Inspector: fill and border.
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Properties' });
  await inspector.getByRole('button', { name: /^Fill colour: / }).click();
  await page
    .getByRole('dialog', { name: 'Colours for fill colour' })
    .getByRole('group', { name: 'Brand colours' })
    .getByRole('button')
    .first()
    .click();
  await waitForSave(page, b => b.items[0].fill === '#123456', 'inspector fill');
  await page.keyboard.press('Escape');
  await inspector.getByRole('button', { name: /^Border colour: / }).click();
  await page
    .getByRole('dialog', { name: 'Colours for border colour' })
    .getByRole('group', { name: 'Brand colours' })
    .getByRole('button')
    .nth(1)
    .click();
  await waitForSave(page, b => b.items[0].style?.borderColor === '#abcdef', 'inspector border');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  // Widget editor.
  await item(page, 's').dblclick({ position: { x: 3, y: 3 } });
  const dialog = page.getByRole('dialog', { name: 'Action Shortcut' });
  await dialog.getByRole('group', { name: 'Brand colours for shortcut' }).getByRole('button').first().click();
  await expect(dialog.getByLabel('Shortcut colour')).toHaveValue('#123456');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 's').fill === '#123456', 'shortcut colour');
  // An empty kit shows no brand swatches anywhere.
  await page.evaluate(() => localStorage.removeItem('boardroom.brandkit.v1'));
  await page.reload();
  await fit(page);
  await item(page, 'a').click();
  await expect(page.getByRole('group', { name: /Brand colours/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Properties', exact: true }).click();
  await expect(page.getByRole('group', { name: /Brand colours/ })).toHaveCount(0);
});

test('Enter on a focused selection-bar button presses it instead of opening the editor', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Enter', items: [{ ...m.createItem('note', 0, 0), id: 'n1', text: 'Hi' }] };`,
  );
  await fit(page);
  await item(page, 'n1').click();
  const lock = page.getByRole('button', { name: 'Lock', exact: true });
  await lock.focus();
  await page.keyboard.press('Enter');
  await waitForSave(page, b => !!b.items.find(i => i.id === 'n1')?.locked, 'locked by Enter on the button');
  await expect(page.locator('[contenteditable=true], textarea.object-editor')).toHaveCount(0);
});
