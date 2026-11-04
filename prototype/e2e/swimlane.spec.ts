// Swimlane diagrams (gap E6) in the browser: create from the tools gallery, add a lane, drop a sticky
// into a lane, move the swimlane with its contents, rename and resize a lane on the canvas, reorder
// lanes in the editor, undo, and persistence across a reload.
import { test, expect, openApp, openTools, chooseTool, savedBoard, waitForSave, item, mouseDrag } from './helpers';
import type { Page } from '@playwright/test';

const pool = async (page: Page) => (await savedBoard(page)).items.find(i => i.type === 'swimlane');
const sticky = async (page: Page) => (await savedBoard(page)).items.find(i => i.type === 'note');
/** Title of the lane at a sticky's centre (horizontal lanes below the 44px title band). */
function laneTitleOf(sw: any, n: any): string | undefined {
  let y = sw.y + 44;
  const cy = n.y + n.h / 2;
  for (const l of sw.data.lanes) {
    if (cy >= y && cy < y + l.size) return l.title;
    y += l.size;
  }
  return undefined;
}

test('swimlanes: create, add a lane, contain a sticky, move, rename, resize, reorder, undo and reload', async ({
  page,
}) => {
  await openApp(page);
  await openTools(page, 'Diagramming');
  await chooseTool(page, 'Swimlanes');
  const canvas = (await page.locator('svg.canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 220, canvas.y + 170);
  await waitForSave(page, b => b.items.some(i => i.type === 'swimlane'), 'swimlane placed');
  let sw = await pool(page);
  expect(sw.data.lanes.map((l: any) => l.title)).toEqual(['Lane 1', 'Lane 2', 'Lane 3']);
  const swim = item(page, sw.id);
  await expect(swim).toHaveAttribute('aria-label', /Swimlane, Swimlane diagram, 3 lanes: Lane 1, Lane 2, Lane 3/);

  // Select it from the title band and add a lane from the selection bar.
  const title = swim.locator('.swim-title');
  await title.click({ position: { x: 60, y: 22 } });
  await page.locator('.selection-bar').getByRole('button', { name: 'Add lane', exact: true }).click();
  await waitForSave(page, b => b.items.find(i => i.type === 'swimlane')?.data.lanes.length === 4, 'lane added');
  sw = await pool(page);

  // Drop a sticky note into lane 2 (to the right of its header).
  const laneTwo = sw.data.lanes[1].id,
    header = (await swim.locator(`[data-lane="${laneTwo}"] rect`).boundingBox())!;
  await page.keyboard.press('Escape');
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('n');
  await page.mouse.click(header.x + header.width + 150, header.y + 6);
  await waitForSave(page, b => b.items.some(i => i.type === 'note'), 'sticky placed');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  let n = await sticky(page);
  expect(laneTitleOf(sw, n)).toBe('Lane 2');

  // Move the swimlane by its title band: the sticky moves the same distance.
  const before = { sw: { x: sw.x, y: sw.y }, n: { x: n.x, y: n.y } };
  const tb = (await title.boundingBox())!;
  await mouseDrag(page, { x: tb.x + 60, y: tb.y + 22 }, { x: tb.x + 180, y: tb.y + 102 });
  await waitForSave(page, b => b.items.find(i => i.type === 'swimlane')?.x !== before.sw.x, 'swimlane moved');
  sw = await pool(page);
  n = await sticky(page);
  expect(n.x - before.n.x).toBeCloseTo(sw.x - before.sw.x, 3);
  expect(n.y - before.n.y).toBeCloseTo(sw.y - before.sw.y, 3);
  expect(sw.x).not.toBe(before.sw.x);

  // Rename lane 2 inline by double-clicking its header.
  await swim.locator(`[data-lane="${laneTwo}"]`).dblclick();
  const field = page.getByRole('textbox', { name: 'Lane title', exact: true });
  await field.fill('Operations');
  await field.press('Enter');
  await waitForSave(page, b => b.items.find(i => i.type === 'swimlane')?.data.lanes[1].title === 'Operations');
  await expect(swim.locator(`[data-lane="${laneTwo}"] text`)).toHaveText('Operations');

  // Drag the divider under lane 1 down: lane 1 grows and the sticky in lane 2 shifts with its lane.
  await title.click({ position: { x: 60, y: 22 } });
  const laneOne = sw.data.lanes[0].id,
    divider = swim.locator(`[data-divider="lanes:${laneOne}"]`),
    d = (await divider.boundingBox())!;
  const nBefore = await sticky(page),
    sizeBefore = sw.data.lanes[0].size;
  await mouseDrag(page, { x: d.x + 300, y: d.y + d.height / 2 }, { x: d.x + 300, y: d.y + d.height / 2 + 60 });
  await waitForSave(page, b => b.items.find(i => i.type === 'swimlane')?.data.lanes[0].size > sizeBefore, 'resized');
  sw = await pool(page);
  n = await sticky(page);
  const grown = sw.data.lanes[0].size - sizeBefore;
  expect(grown).toBeGreaterThan(20);
  expect(n.y - nBefore.y).toBeCloseTo(grown, 1);
  expect(laneTitleOf(sw, n)).toBe('Operations');

  // Reorder in the editor: move lane 2 up, so the sticky's lane comes first.
  await page.locator('.selection-bar .widget-action', { hasText: /^Edit$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Swimlanes' });
  await dialog.getByRole('button', { name: 'Move lane 2 up' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items.find(i => i.type === 'swimlane')?.data.lanes[0].title === 'Operations');
  const reordered = await pool(page),
    moved = await sticky(page);
  expect(laneTitleOf(reordered, moved)).toBe('Operations');
  expect(moved.y).toBeLessThan(n.y);

  // Undo restores the order and the sticky's place.
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await waitForSave(page, b => b.items.find(i => i.type === 'swimlane')?.data.lanes[1].title === 'Operations', 'undo');
  expect((await sticky(page)).y).toBeCloseTo(n.y, 3);

  // Reload: lanes, titles and the sticky's lane persist.
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
  const after = await pool(page);
  expect(after.data.lanes.map((l: any) => l.title)).toEqual(['Lane 1', 'Operations', 'Lane 3', 'Lane 4']);
  expect(laneTitleOf(after, await sticky(page))).toBe('Operations');
  await expect(item(page, after.id).locator(`[data-lane="${laneTwo}"] text`)).toHaveText('Operations');
});

test('switching orientation and adding a phase from the selection bar keep the sticky in its lane', async ({
  page,
}) => {
  await openApp(page);
  await openTools(page, 'Diagramming');
  await chooseTool(page, 'Swimlanes');
  const canvas = (await page.locator('svg.canvas').boundingBox())!;
  await page.mouse.click(canvas.x + 220, canvas.y + 170);
  await waitForSave(page, b => b.items.some(i => i.type === 'swimlane'), 'swimlane placed');
  const sw = await pool(page),
    swim = item(page, sw.id);
  const header = (await swim.locator(`[data-lane="${sw.data.lanes[1].id}"] rect`).boundingBox())!;
  await page.keyboard.press('Escape');
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('n');
  await page.mouse.click(header.x + header.width + 120, header.y + 6);
  await waitForSave(page, b => b.items.some(i => i.type === 'note'), 'sticky placed');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await swim.locator('.swim-title').click({ position: { x: 60, y: 22 } });
  const bar = page.locator('.selection-bar');
  await bar.getByRole('button', { name: 'Switch to vertical lanes' }).click();
  await waitForSave(page, b => b.items.find(i => i.type === 'swimlane')?.data.orientation === 'vertical');
  await bar.getByRole('button', { name: 'Add phase', exact: true }).click();
  await waitForSave(page, b => b.items.find(i => i.type === 'swimlane')?.data.phases?.length === 2);
  const v = await pool(page),
    n = await sticky(page);
  // Vertical lanes are columns after the phase band (36px) on the left.
  let x = v.x + 36,
    title = '';
  for (const l of v.data.lanes) {
    if (n.x + n.w / 2 >= x && n.x + n.w / 2 < x + l.size) title = l.title;
    x += l.size;
  }
  expect(title).toBe('Lane 2');
  await expect(swim.locator('.swim-phase-header')).toHaveCount(2);
});
