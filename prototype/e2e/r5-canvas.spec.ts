// Track R5 in the browser: Mermaid ER to entity tables and back to code, custom saved shapes, cluster frames,
// smart pen connectors, the colour menu, auto-lists, frame sorting and titles, and pen/touch input.
import { test, expect, seed, waitForSave, savedBoard, item, fit, selectViaLayers } from './helpers';

test('an ER diagram converts to entity tables and a selection converts back to Mermaid code', async ({ page }) => {
  await seed(
    page,
    `const d = { ...m.createItem('mermaid', 0, 0), id: 'mm', text: 'erDiagram\\n  CUSTOMER ||--o{ ORDER : places\\n  CUSTOMER {\\n    int id PK\\n    string name\\n  }' };
     return { version: 1, title: 'ER', items: [d] };`,
  );
  await fit(page);
  await expect(item(page, 'mm').locator('.mermaid-preview svg')).toBeVisible({ timeout: 20_000 });
  await item(page, 'mm').dblclick();
  await page.getByRole('button', { name: /Convert to shapes/ }).click();
  await waitForSave(page, b => b.items.filter(i => i.type === 'entity').length === 2, 'entity tables created');
  const b = await savedBoard(page);
  const customer = b.items.find(i => i.text === 'CUSTOMER');
  expect(customer.data.rows).toEqual([
    { name: 'id', type: 'int', key: 'PK' },
    { name: 'name', type: 'string' },
  ]);
  const line = b.items.find(i => i.type === 'arrow');
  expect([line.connector.startHead, line.connector.endHead, line.text]).toEqual(['one', 'zero-many', 'places']);
  await expect(item(page, customer.id).locator('text', { hasText: 'CUSTOMER' })).toBeVisible();

  // Shapes back to code: a flowchart object is created next to the selection.
  await seed(
    page,
    `const a = { ...m.createItem('rectangle', 0, 0), id: 'a', text: 'Start' };
     const c = { ...m.createItem('diamond', 400, 0), id: 'c', text: 'Ready?' };
     const l = { ...m.createItem('arrow', 0, 0), id: 'l', from: 'a', to: 'c', text: 'go' };
     return { version: 1, title: 'Flow', items: [a, c, l] };`,
  );
  await fit(page);
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+A');
  await item(page, 'a').click({ button: 'right', position: { x: 20, y: 20 } });
  await page.getByRole('menuitem', { name: 'Convert to Mermaid code' }).click();
  await waitForSave(page, x => x.items.some(i => i.type === 'mermaid'), 'mermaid created');
  const code = (await savedBoard(page)).items.find(i => i.type === 'mermaid').text;
  expect(code).toContain('n1["Start"]');
  expect(code).toContain('n2{"Ready?"}');
  expect(code).toContain('n1 -->|"go"| n2');
});

test('a selection saved as a shape is placed again from My shapes as one group', async ({ page }) => {
  await seed(
    page,
    `const a = { ...m.createItem('rectangle', 0, 0), id: 'a', text: 'Rack' };
     const b = { ...m.createItem('ellipse', 300, 0), id: 'b' };
     return { version: 1, title: 'Shapes', items: [a, b] };`,
  );
  await fit(page);
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+A');
  await item(page, 'a').click({ button: 'right', position: { x: 20, y: 20 } });
  await page.getByRole('menuitem', { name: 'Save as shape' }).click();
  await expect(page.getByText('to My shapes in the Shapes menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Shapes and lines', exact: true }).click();
  const mine = page.getByRole('group', { name: 'My shapes' });
  await mine.getByRole('button', { name: 'Custom shape', exact: true }).click();
  await waitForSave(page, x => x.items.length === 4, 'shape placed');
  const placed = (await savedBoard(page)).items.filter(i => !['a', 'b'].includes(i.id));
  expect(placed.map(i => i.type).sort()).toEqual(['ellipse', 'rectangle']);
  expect(placed[0].group).toBeTruthy();
  expect(placed[0].group).toBe(placed[1].group);

  // The entity table is in the same menu and the saved shape can be removed.
  await page.getByRole('button', { name: 'Shapes and lines', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entity table' })).toBeVisible();
  await mine.getByRole('button', { name: 'Remove shape Custom shape' }).click();
  await expect(mine.getByText('Right-click a selection')).toBeVisible();
});

test('notes cluster into one movable frame; frames sort by position and hide titles', async ({ page }) => {
  await seed(
    page,
    `const n = (id, x, y) => ({ ...m.createItem('note', x, y), id, text: id });
     const f = (id, x, y, text) => ({ ...m.createItem('frame', x, y), id, text, w: 300, h: 200 });
     return { version: 1, title: 'Cluster', items: [f('f2', 2000, 0, 'Second'), f('f1', 1500, 0, 'First'), n('a', 0, 0), n('b', 400, 300), n('c', 800, 0)] };`,
  );
  await fit(page);
  await item(page, 'a').click({ position: { x: 20, y: 20 } });
  await item(page, 'b').click({ position: { x: 20, y: 20 }, modifiers: ['Shift'] });
  await item(page, 'c').click({ position: { x: 20, y: 20 }, modifiers: ['Shift'] });
  await page.locator('.selection-bar').getByRole('button', { name: 'Cluster notes' }).click();
  await page.getByRole('dialog', { name: 'Cluster notes' }).getByRole('button', { name: 'One cluster' }).click();
  await waitForSave(page, b => b.items.some(i => i.type === 'frame' && i.text === 'Cluster (3)'), 'cluster frame');
  const b = await savedBoard(page);
  const frame = b.items.find(i => i.text === 'Cluster (3)');
  for (const id of ['a', 'b', 'c']) {
    const n = b.items.find(i => i.id === id);
    expect(n.x >= frame.x && n.y >= frame.y && n.x + n.w <= frame.x + frame.w && n.y + n.h <= frame.y + frame.h).toBe(
      true,
    );
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Presentation' });
  await panel.getByRole('button', { name: 'Sort by position' }).click();
  await waitForSave(page, x => JSON.stringify(x.presentation) === JSON.stringify([frame.id, 'f1', 'f2']), 'sorted');
  await panel.getByRole('button', { name: 'Close presentation' }).click();

  await selectViaLayers(page, 'First');
  await page.locator('.selection-bar').getByRole('button', { name: 'Hide frame title' }).click();
  await waitForSave(page, x => x.items.find(i => i.id === 'f1')?.data?.hideTitle === true, 'title hidden');
  await page.keyboard.press('Escape');
  await expect(item(page, 'f1').locator('text', { hasText: 'First' })).toHaveCount(0);
});

test('typed list markers become a bullet list and the colour menu remembers colours', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Text', items: [{ ...m.createItem('note', 0, 0), id: 'n' }] };`);
  await fit(page);
  await item(page, 'n').dblclick();
  await page.keyboard.type('- milk');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('- eggs');
  await page.keyboard.press('Escape');
  await waitForSave(
    page,
    b => b.items[0].text === 'milk\neggs' && b.items[0].format?.list === 'bullet',
    'bullet list from typed markers',
  );

  await item(page, 'n').click({ position: { x: 20, y: 20 } });
  await page
    .locator('.selection-bar')
    .getByRole('button', { name: /^Object colour: / })
    .click();
  const menu = page.getByRole('dialog', { name: 'Colours' });
  await menu.getByRole('button', { name: 'Save current' }).click();
  await expect(
    menu.getByRole('group', { name: 'Saved colours' }).getByRole('button', { name: /Use colour/ }),
  ).toHaveCount(1);
  await menu.getByRole('group', { name: 'Board colours' }).getByRole('button').first().click();
  await expect(
    menu.getByRole('group', { name: 'Recent colours' }).getByRole('button', { name: /Use colour/ }),
  ).toHaveCount(1);
  const stored = await page.evaluate(() => localStorage.getItem('boardroom.colors.saved.v1'));
  expect(JSON.parse(stored!)).toEqual(['#fff49b']);
});

test('the smart pen connects two shapes with a line drawn between them', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Pen', items: [{ ...m.createItem('rectangle', 0, 0), id: 'a' }, { ...m.createItem('rectangle', 500, 0), id: 'b' }] };`,
  );
  await fit(page);
  await page.keyboard.press('p');
  await page.getByRole('group', { name: 'Pen mode' }).getByRole('button', { name: 'Smart pen' }).click();
  await expect(page.getByText('A line between two objects becomes a connector')).toBeVisible();
  const a = (await item(page, 'a').boundingBox())!,
    b = (await item(page, 'b').boundingBox())!;
  const y = a.y + a.height / 2;
  await page.mouse.move(a.x + a.width / 2, y);
  await page.mouse.down();
  for (let s = 1; s <= 12; s++)
    await page.mouse.move(a.x + a.width / 2 + ((b.x + b.width / 2 - a.x - a.width / 2) * s) / 12, y);
  await page.mouse.up();
  await waitForSave(page, x => x.items.some(i => i.type === 'arrow' && i.from === 'a' && i.to === 'b'), 'bound line');
  expect((await savedBoard(page)).items.some(i => i.type === 'pen')).toBe(false);
});

test('pen draws, a finger pans in the pen tool, and a resting palm is ignored', async ({ page }) => {
  await seed(page, `return { version: 1, title: 'Touch', items: [{ ...m.createItem('note', 0, 0), id: 'a' }] };`);
  await fit(page);
  await page.keyboard.press('p');
  const send = (events: [string, string, number, number, number][]) =>
    page.evaluate(list => {
      const svg = document.querySelector('svg.canvas')!;
      for (const [type, pointerType, id, x, y] of list)
        svg.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType,
            clientX: x,
            clientY: y,
            bubbles: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            isPrimary: true,
          }),
        );
    }, events);
  const transform = () => page.locator('#objects').getAttribute('transform');

  // A pen stroke with a palm resting on the screen: one stroke, no pan.
  const before = await transform();
  await send([
    ['pointerdown', 'pen', 1, 300, 300],
    ['pointerdown', 'touch', 5, 600, 500],
    ['pointermove', 'pen', 1, 340, 320],
    ['pointermove', 'touch', 5, 700, 600],
    ['pointermove', 'pen', 1, 380, 360],
    ['pointerup', 'pen', 1, 380, 360],
    ['pointerup', 'touch', 5, 700, 600],
  ]);
  await waitForSave(page, b => b.items.filter(i => i.type === 'pen').length === 1, 'pen stroke');
  expect(await transform()).toBe(before);

  // After the palm grace period one finger pans instead of drawing.
  await page.waitForTimeout(500);
  await send([
    ['pointerdown', 'touch', 1, 500, 400],
    ['pointermove', 'touch', 1, 560, 430],
    ['pointermove', 'touch', 1, 620, 460],
    ['pointerup', 'touch', 1, 620, 460],
  ]);
  await expect.poll(transform).not.toBe(before);
  await page.waitForTimeout(400);
  expect((await savedBoard(page)).items.filter(i => i.type === 'pen')).toHaveLength(1);
});
