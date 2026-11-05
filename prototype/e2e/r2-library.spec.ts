// Track R2-I: board emoji, backups of one or selected boards, the catch-up walkthrough, batch restore that keeps
// connectors attached, boards in this space, saved view order, Timeline flags and bar warnings, and status chips
// on Mermaid, mind-map and draw.io objects.
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { test, expect, openApp, seed, waitForSave, savedBoard, item, fit, type BoardJson } from './helpers';
import type { Page } from '@playwright/test';

const INDEX_KEY = 'boardroom.boards.v1';

/** Three boards: Roadmap (open) and Retro in the Product space, Budget with no space. */
async function seedLibrary(page: Page) {
  await openApp(page);
  await page.evaluate(async index => {
    const m = await import('/src/model.ts');
    const note = (id: string, text: string, x = 0) => ({ ...m.createItem('note', x, 0), id, text });
    const boards: Record<string, BoardJson> = {
      b1: { ...m.newBoard(), title: 'Roadmap', items: [note('r1', 'Spring plan')] },
      b2: { ...m.newBoard(), title: 'Retro', items: [note('n1', 'What went well')] },
      b3: { ...m.newBoard(), title: 'Budget', items: [note('m1', 'Costs')] },
    };
    const now = Date.now();
    for (const [id, b] of Object.entries(boards)) {
      m.parseBoard(b);
      localStorage.setItem(`boardroom.board.${id}`, JSON.stringify(b));
    }
    localStorage.setItem('boardroom.document.v1', JSON.stringify(boards.b1));
    localStorage.setItem(
      index,
      JSON.stringify({
        version: 1,
        activeId: 'b1',
        spaces: ['Product'],
        boards: Object.entries(boards).map(([id, b], k) => ({
          id,
          title: b.title,
          createdAt: new Date(now - k * 1000).toISOString(),
          updatedAt: new Date(now - k * 1000).toISOString(),
          items: b.items.length,
          preview: [],
          ...(id === 'b3' ? {} : { space: 'Product' }),
          ...(id === 'b2' ? { emoji: '📊' } : {}),
        })),
      }),
    );
  }, INDEX_KEY);
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
}
async function mainMenu(page: Page, ...path: string[]) {
  if (await page.locator('.main-menu-list').count()) await page.keyboard.press('Escape');
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
const dashboard = (page: Page) => page.getByRole('dialog', { name: 'Boards' });
const cards = (page: Page) => dashboard(page).getByRole('list', { name: 'Your boards' }).locator('.board-card');
/** Boards listed in a downloaded backup's manifest. */
async function backupBoards(path: string): Promise<{ title: string; emoji?: string; space?: string }[]> {
  const files = unzipSync(new Uint8Array(await readFile(path)));
  return JSON.parse(strFromU8(files['library.json'])).boards;
}

test('board emoji from the board menu shows beside the name and on the dashboard card', async ({ page }) => {
  await seedLibrary(page);
  await mainMenu(page, 'Board', 'Board emoji');
  await page.getByRole('button', { name: 'Use 🚀 as the board emoji' }).click();
  await expect(page.locator('.board-header [data-board-emoji]')).toHaveText('🚀');
  await expect
    .poll(() =>
      page.evaluate(k => JSON.parse(localStorage.getItem(k)!).boards.find((b: any) => b.id === 'b1').emoji, INDEX_KEY),
    )
    .toBe('🚀');
  await page.keyboard.press('Escape');
  // Details panel: change it by typing.
  await mainMenu(page, 'Board', 'Details');
  const details = page.getByRole('complementary', { name: 'Board details' });
  await details.getByLabel('Board emoji').fill('🎯');
  await details.getByLabel('Board emoji').press('Enter');
  await expect(page.locator('.board-header [data-board-emoji]')).toHaveText('🎯');
  await details.getByRole('button', { name: 'Close board details' }).click();
  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  await expect(cards(page).filter({ hasText: 'Roadmap' }).locator('[data-board-emoji]')).toHaveText('🎯');
  await expect(cards(page).filter({ hasText: 'Retro' }).locator('[data-board-emoji]')).toHaveText('📊');
  await expect(cards(page).filter({ hasText: 'Budget' }).locator('[data-board-emoji]')).toHaveCount(0);
});

test('dashboard backs up one board from its card and the selected boards together', async ({ page }) => {
  await seedLibrary(page);
  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  let wait = page.waitForEvent('download');
  await dashboard(page).getByRole('button', { name: 'Back up Retro' }).click();
  let download = await wait;
  expect(download.suggestedFilename()).toMatch(/^boardroom-Retro-\d{4}-\d{2}-\d{2}\.boardroom$/);
  const one = await backupBoards(await download.path());
  expect(one.map(b => b.title)).toEqual(['Retro']);
  expect(one[0]).toMatchObject({ emoji: '📊', space: 'Product' });

  await dashboard(page).getByRole('checkbox', { name: 'Select Roadmap' }).check();
  await dashboard(page).getByRole('checkbox', { name: 'Select Budget' }).check();
  wait = page.waitForEvent('download');
  await dashboard(page)
    .getByRole('toolbar', { name: 'Selected boards' })
    .getByRole('button', { name: 'Back up', exact: true })
    .click();
  download = await wait;
  expect(download.suggestedFilename()).toMatch(/^boardroom-2-boards-/);
  expect((await backupBoards(await download.path())).map(b => b.title).sort()).toEqual(['Budget', 'Roadmap']);
  await expect(page.getByRole('status').filter({ hasText: 'Backed up 2 boards' }).first()).toBeAttached();
});

test('board menu lists the other boards in this space and opens one', async ({ page }) => {
  await seedLibrary(page);
  await mainMenu(page, 'Board', 'Boards in this space');
  const list = page.locator('.main-menu-list').last();
  await expect(list).toContainText('Product');
  await expect(list.getByRole('menuitem')).toHaveCount(1);
  await list.getByRole('menuitem', { name: '📊 Retro' }).click();
  await expect(page.getByLabel('Board name')).toHaveValue('Retro');
  await mainMenu(page, 'Board', 'Boards in this space');
  await expect(page.locator('.main-menu-list').last().getByRole('menuitem', { name: 'Roadmap' })).toBeVisible();
});

test('catch up steps through the changed objects one at a time', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),title:'Plan',items:[
      {...m.createItem('note',0,0),id:'a',text:'First'},
      {...m.createItem('note',3000,0),id:'b',text:'Second'},
      {...m.createItem('note',6000,0),id:'c',text:'Third'}]};`,
  );
  await page.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem('boardroom.boards.v1')!);
    const at = (min: number) => new Date(Date.now() - min * 60000).toISOString();
    localStorage.setItem(
      `boardroom.activity.${lib.activeId}`,
      JSON.stringify([
        { id: 'e3', at: at(5), action: 'edited', itemId: 'c', type: 'note', label: 'Third' },
        { id: 'e2', at: at(10), action: 'added', itemId: 'b', type: 'note', label: 'Second' },
        { id: 'e1', at: at(15), action: 'added', itemId: 'a', type: 'note', label: 'First' },
      ]),
    );
  });
  await mainMenu(page, 'Board', 'Catch up');
  const panel = page.getByRole('complementary', { name: 'Catch up' });
  await panel.getByRole('combobox', { name: 'Time period' }).selectOption('day');
  await panel.getByRole('button', { name: 'Step through the changes' }).click();
  await expect(panel.locator('.catchup-step')).toHaveText('1 of 3');
  await expect(panel.locator('.catchup-current')).toContainText('added sticky note · First');
  await expect(panel.getByRole('button', { name: 'Previous change' })).toBeDisabled();
  const zoomOf = () => page.getByRole('button', { name: /Zoom and navigation/ }).getAttribute('aria-label');
  const first = await item(page, 'a').boundingBox();
  expect(first).not.toBeNull();
  await panel.getByRole('button', { name: 'Next change' }).click();
  await expect(panel.locator('.catchup-step')).toHaveText('2 of 3');
  await expect(panel.locator('.catchup-current')).toContainText('Second');
  // The view moved to the second note: it is now on screen and the first is not.
  const view = page.viewportSize()!;
  await expect
    .poll(async () => {
      const b = await item(page, 'b').boundingBox();
      return !!b && b.x > 0 && b.x < view.width;
    })
    .toBe(true);
  await panel.getByRole('button', { name: 'Next change' }).click();
  await expect(panel.locator('.catchup-step')).toHaveText('3 of 3');
  await expect(panel.locator('.catchup-current')).toContainText('edited sticky note · Third');
  await expect(panel.getByRole('button', { name: 'Next change' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Previous change' }).click();
  await expect(panel.locator('.catchup-step')).toHaveText('2 of 3');
  expect(await zoomOf()).toBeTruthy();
});

test('history restores several deleted objects in one undo step and re-attaches their connector', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),title:'Flow',items:[
      {...m.createItem('note',0,0),id:'a',text:'Alpha'},
      {...m.createItem('note',500,0),id:'b',text:'Beta'},
      {...m.createItem('note',1000,0),id:'k',text:'Keep'},
      {...m.createItem('arrow',200,100),id:'ab',from:'a',to:'b',w:300,h:0}]};`,
  );
  await fit(page);
  await item(page, 'a').click();
  await item(page, 'b').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await waitForSave(page, b => b.items.length === 1, 'two notes and the connector deleted');
  await mainMenu(page, 'Board', 'History');
  const history = page.getByRole('complementary', { name: 'History' });
  await history.getByRole('checkbox', { name: 'Select deleted sticky note: Alpha' }).check();
  await history.getByRole('checkbox', { name: 'Select deleted sticky note: Beta' }).check();
  await expect(history.getByRole('group', { name: 'Restore several' })).toContainText('2 selected');
  await history.getByRole('button', { name: 'Restore selected' }).click();
  await waitForSave(page, b => b.items.length === 4, 'notes and connector restored');
  const restored = await savedBoard(page);
  expect(restored.items.find(i => i.id === 'ab')).toMatchObject({ from: 'a', to: 'b' });
  await expect(page.getByRole('status').filter({ hasText: '1 connector was re-attached' }).first()).toBeAttached();
  // One undo step takes all three away again.
  await history.getByRole('button', { name: 'Close history' }).click();
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+z');
  await waitForSave(page, b => b.items.length === 1, 'restore undone in one step');
});

test('saved views reorder by keyboard and by dragging', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Views',items:[{...m.createItem('table',0,0),id:'w',w:1250,h:700,datasetId:'d'}],
    recordSchemas:{d:{statuses:['Not started','In progress','Complete'],fields:[],views:[
      {id:'v1',name:'One',config:{}},{id:'v2',name:'Two',config:{}},{id:'v3',name:'Three',config:{}}]}},
    datasets:{d:[{id:'a',title:'Alpha',status:'Not started',assignee:'',start:'',end:''}]}};`,
  );
  await fit(page);
  const w = item(page, 'w');
  await w.locator('.record-view-order > summary').click();
  const order = w.getByRole('list', { name: 'Saved view order' });
  await order.getByRole('button', { name: /^Move view: Three/ }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await waitForSave(
    page,
    b => b.recordSchemas.d.views.map((v: any) => v.name).join() === 'One,Three,Two',
    'moved up by keyboard',
  );
  await expect(order.getByRole('button', { name: /^Move view: Three \(2 of 3\)/ })).toBeFocused();
  await order
    .getByRole('button', { name: /^Move view: Two/ })
    .dragTo(order.getByRole('button', { name: /^Move view: One/ }));
  await waitForSave(
    page,
    b => b.recordSchemas.d.views.map((v: any) => v.name).join() === 'Two,One,Three',
    'moved first by dragging',
  );
  await expect(w.getByRole('combobox', { name: 'Saved view' }).locator('option').nth(1)).toHaveText('Two');
});

test('Timeline free flags are drawn and saved; invalid bars show a warning with a tooltip', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Timeline',items:[{...m.createItem('timeline',0,0),id:'w',w:1100,h:500,datasetId:'d'}],datasets:{d:[
{id:'a',title:'Design',status:'Not started',assignee:'',start:'2026-11-03',end:'2026-11-10'},
{id:'b',title:'Build',status:'Not started',assignee:'',start:'2026-11-08',end:'2026-11-14',dependsOn:['a']},
{id:'c',title:'Odd',status:'Not started',assignee:'',start:'2026-11-12',end:'2026-11-31'}]}};`,
  );
  await fit(page);
  const w = item(page, 'w');
  await w.locator('.timeline-flag-controls > summary').click();
  await w.getByLabel('Flag date').fill('2026-11-09');
  await w.getByLabel('Flag label').fill('Launch');
  await w.getByRole('combobox', { name: 'Flag colour' }).selectOption({ label: 'Green' });
  await w.getByRole('button', { name: 'Add flag' }).click();
  await waitForSave(
    page,
    b => (b.recordSchemas as any)?.d?.timelineFlags?.[0]?.label === 'Launch',
    'flag saved on the dataset (shared by its Timelines, P2-Q6)',
  );
  const flag = w.locator('.timeline-flag');
  await expect(flag).toHaveCount(1);
  await expect(flag).toContainText('Launch');
  await expect(flag).toHaveAttribute('title', 'Launch · 2026-11-09');
  expect(((await savedBoard(page)).recordSchemas as any).d.timelineFlags[0].color).toBe('#30a46c');
  // Warnings: Build starts before Design ends; Odd ends on a day that does not exist.
  await expect(w.locator('[data-bar-warning]')).toHaveCount(2);
  await expect(w.locator('[data-bar-warning="b"]')).toHaveAttribute('title', 'Starts before “Design” ends.');
  await expect(w.locator('[data-bar-warning="c"]')).toHaveAttribute('title', /2026-11-31 is not a real calendar day/);
  await expect(w.locator('[data-bar-warning="a"]')).toHaveCount(0);
  // Remove the flag.
  await w.getByRole('button', { name: 'Remove flag Launch' }).click();
  await waitForSave(page, b => !(b.recordSchemas as any)?.d?.timelineFlags, 'flag removed');
  await expect(w.locator('.timeline-flag')).toHaveCount(0);
});

test('Mermaid, mind-map and draw.io objects show a status chip set from the selection bar', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),title:'Diagrams',items:[
      {...m.createItem('mermaid',0,0),id:'mm'},
      {...m.createItem('mindmap',800,0),id:'mi',nodes:[{id:'r',parent:null,text:'Idea'}]},
      {...m.createItem('drawio',1600,0),id:'dr'}]};`,
  );
  await fit(page);
  for (const id of ['mm', 'mi', 'dr']) {
    await item(page, id).click({ position: { x: 30, y: 60 } });
    await page
      .getByRole('toolbar', { name: 'Selection actions' })
      .getByRole('button', { name: 'Status: None' })
      .click();
    await expect(item(page, id).locator('.item-status-chip-svg')).toHaveAttribute('data-status', 'draft');
    await waitForSave(page, b => b.items.find(i => i.id === id)?.data?.status === 'draft', `${id} status`);
    await page.keyboard.press('Escape');
  }
  await expect(item(page, 'mm').locator('.item-status-chip-svg text')).toHaveText('Draft');
  // One undo step clears the last one again.
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(item(page, 'dr').locator('.item-status-chip-svg')).toHaveCount(0);
});
