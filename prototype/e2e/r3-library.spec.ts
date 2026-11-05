// Track R3: templates (picker, previews, rename, export/import), dashboard conveniences (Ctrl+E, last opened,
// list view, comment search that opens the board at the match), spaces with details and blueprints, the
// overview across boards, object info in the inspector, Details panel actions and the brand kit.
import { test, expect, openApp, seed, waitForSave, item, fit, axeViolations, type BoardJson } from './helpers';
import type { Page } from '@playwright/test';

const INDEX_KEY = 'boardroom.boards.v1';

/** Two boards: Roadmap (open) and Retro, which has a comment thread on a note. */
async function seedLibrary(page: Page) {
  await openApp(page);
  await page.evaluate(async index => {
    const m = await import('/src/model.ts');
    const note = (id: string, text: string, x = 0) => ({ ...m.createItem('note', x, 0), id, text });
    const boards: Record<string, BoardJson> = {
      b1: { ...m.newBoard(), title: 'Roadmap', items: [note('r1', 'Hiring plan for spring')] },
      b2: {
        ...m.newBoard(),
        title: 'Retro',
        items: [note('n1', 'What went well'), note('n2', 'Budget review', 600)],
        comments: [
          {
            id: 'th1',
            itemId: 'n2',
            x: 0,
            y: 0,
            messages: [{ id: 'm1', text: 'Check the travel costs', at: new Date().toISOString() }],
          },
        ],
      },
    };
    const now = new Date().toISOString();
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
        boards: Object.entries(boards).map(([id, b]) => ({
          id,
          title: b.title,
          createdAt: now,
          updatedAt: id === 'b2' ? new Date(Date.now() - 86_400_000).toISOString() : now,
          items: b.items.length,
          preview: [],
        })),
      }),
    );
  }, INDEX_KEY);
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
}
const cards = (page: Page) => page.getByRole('list', { name: 'Your boards' }).locator('.board-card');
const dashboard = (page: Page) => page.getByRole('dialog', { name: 'Boards' });
async function boardMenu(page: Page, entry: string, sub = 'Board') {
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page
    .locator('.main-menu-list [role="menuitem"]', { hasText: new RegExp(`^${sub}`) })
    .first()
    .hover();
  await page.locator('.main-menu-list').last().getByRole('menuitem', { name: entry }).click();
}

test('Ctrl+E opens the dashboard search; comment matches open the board at the object and thread', async ({ page }) => {
  await seedLibrary(page);
  await page.locator('svg.canvas').click({ position: { x: 700, y: 500 } });
  await page.keyboard.press('Control+e');
  const search = page.getByLabel('Find a board');
  await expect(search).toBeFocused();
  await page.getByRole('button', { name: 'Open Roadmap (open now)' }).focus();
  await page.keyboard.press('Control+e');
  await expect(search).toBeFocused();

  await search.fill('travel costs');
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByLabel('Content match in Retro')).toContainText('Comment matches');
  await page.getByRole('button', { name: 'Show the match in Retro' }).click();
  await expect(dashboard(page)).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Board name' })).toHaveValue('Retro');
  await expect(page.locator('.selection-bar').first()).toBeVisible();
  await expect(page.locator('.comment-thread').first()).toContainText('Check the travel costs');
});

test('sort by last opened, list view, bulk duplicate and the overview across boards', async ({ page }) => {
  await seedLibrary(page);
  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  // The overview lists comments from boards that are not open.
  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByRole('list', { name: 'Comment threads' }).getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Recent activity' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Overview' }).click();
  // Retro was edited earlier, so "Last edited" lists Roadmap first; opening Retro moves it up under "Last opened".
  await expect(cards(page).first()).toContainText('Roadmap');
  await page.getByRole('button', { name: 'Open Retro' }).click();
  await page.keyboard.press('Control+e');
  await page.getByLabel('Sort boards').selectOption('opened');
  await expect(cards(page).first()).toContainText('Retro');

  await page.getByRole('button', { name: 'Show as list' }).click();
  await expect(page.locator('.board-grid.board-list')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('boardroom.dashboard.layout'))).toBe('list');

  await page.getByLabel('Select Roadmap').check();
  await page.getByLabel('Select Retro').check();
  await page.getByRole('toolbar', { name: 'Selected boards' }).getByRole('button', { name: 'Duplicate' }).click();
  await expect(cards(page)).toHaveCount(4);
  await expect(cards(page).filter({ hasText: 'Retro copy' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Overview' }).click();
  const comments = page.getByRole('list', { name: 'Comment threads' });
  await expect(comments.getByRole('button')).toHaveCount(2); // Retro and its copy
  await comments.getByRole('button').first().click();
  await expect(dashboard(page)).toHaveCount(0);
});

test('spaces get an emoji and description, start from a blueprint and save as a blueprint', async ({ page }) => {
  await seedLibrary(page);
  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  await page.getByRole('button', { name: 'New space' }).click();
  await page
    .getByRole('group', { name: 'Start from a blueprint' })
    .getByRole('button', { name: /Sprint/ })
    .click();
  await expect(page.getByLabel('Show boards')).toHaveValue('Sprint');
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('.space-title')).toContainText('Sprint');
  await expect(page.locator('.space-description')).toContainText('Plan the week');

  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Space emoji').fill('⚡');
  await page.getByLabel('Space description').fill('Two-week sprints for the app team');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.locator('.space-description')).toHaveText('Two-week sprints for the app team');
  const info = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).spaceInfo, INDEX_KEY);
  expect(info.Sprint).toEqual({ emoji: '⚡', description: 'Two-week sprints for the app team' });

  await page.getByRole('button', { name: 'Save as blueprint' }).click();
  await expect(page.locator('.dashboard-notice')).toContainText('as a blueprint with 3 boards');
  await page.getByRole('button', { name: 'New space' }).click();
  const saved = page.getByRole('group', { name: 'Start from a blueprint' });
  await expect(saved.getByRole('button', { name: 'Delete blueprint Sprint' })).toBeVisible();
  await saved.getByRole('button', { name: /^⚡ Sprint/ }).click();
  await expect(page.getByLabel('Show boards')).toHaveValue('Sprint 2');
  await expect(cards(page)).toHaveCount(3);
});

test('templates: picker after New board, previews, rename, export and import', async ({ page }) => {
  await seed(
    page,
    `const a={...m.createItem('note',0,0),id:'a',text:'Keep'},b={...m.createItem('note',400,0),id:'b',text:'Me'};
     return {...m.newBoard(),title:'Kickoff',items:[a,b]};`,
  );
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /^Save board as template/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved "Kickoff"' })).toBeVisible();

  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Templates' }).click();
  const panel = page.getByRole('complementary', { name: 'Templates' });
  const mine = panel.getByRole('list', { name: 'My templates' });
  await expect(mine.locator('.template-mini-thumb rect').first()).toBeAttached();
  await mine.getByRole('button', { name: 'Edit template Kickoff' }).click();
  await panel.getByLabel('Template name').fill('Team kickoff');
  await panel.getByLabel('Template description').fill('First meeting of a project');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(mine.getByRole('button', { name: /^Team kickoff/ })).toContainText('First meeting of a project');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    mine.getByRole('button', { name: 'Export template Team kickoff' }).click(),
  ]);
  const file = await download.path();
  await mine.getByRole('button', { name: 'Delete template Team kickoff' }).click();
  await expect(panel.getByRole('list', { name: 'My templates' })).toHaveCount(0);
  await panel.getByLabel('Choose a templates file').setInputFiles(file!);
  await expect(page.getByRole('status').filter({ hasText: 'Imported 1 template.' })).toBeVisible();
  await expect(
    panel.getByRole('list', { name: 'My templates' }).getByRole('button', { name: /^Team kickoff/ }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Close templates' }).click();

  // New board opens a picker with previews; a saved template and a new starter both work.
  await boardMenu(page, 'New board…');
  const picker = page.getByRole('dialog', { name: 'New board' });
  await expect(picker.locator('.template-tile')).not.toHaveCount(0);
  await picker.getByLabel('Search templates').fill('rice');
  await expect(picker.locator('.template-tile')).toHaveCount(1);
  await picker.getByRole('button', { name: /RICE scoring/ }).click();
  await waitForSave(page, b => b.title === 'RICE scoring' && b.items.some(i => i.text === 'Reach'), 'RICE board');
  await boardMenu(page, 'New board…');
  await page
    .getByRole('dialog', { name: 'New board' })
    .getByRole('button', { name: /^Team kickoff/ })
    .click();
  await waitForSave(page, b => b.title === 'Team kickoff' && b.items.length === 2, 'board from saved template');

  // The library backup carries the template.
  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  await expect(page.getByRole('region', { name: 'New board' }).locator('.new-board-thumb').first()).toBeAttached();
  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Back up all boards' }).click(),
  ]);
  expect(backup.suggestedFilename()).toMatch(/\.boardroom$/);
  await expect(page.getByRole('status').filter({ hasText: 'with 1 template' })).toBeVisible();
});

test('object info in the inspector, Details panel actions and the brand kit', async ({ page }) => {
  await seed(page, `return {...m.newBoard(),title:'Info',items:[{...m.createItem('note',0,0),id:'a',text:'Old'}]};`);
  await fit(page);
  // Editing stamps the modified time; the old note has no created time.
  await item(page, 'a').click();
  await page
    .locator('.selection-bar')
    .getByRole('button', { name: /^Object colour: / })
    .click();
  await page.getByRole('dialog', { name: 'Colours' }).getByRole('textbox', { name: 'Hex colour' }).fill('#a8cdff');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => !!b.items[0].modifiedAt && !b.items[0].createdAt, 'modified time stamped');
  await item(page, 'a').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Properties' }).click();
  const info = page.getByLabel('Object info');
  await expect(info).toContainText('Created');
  await expect(info).toContainText('Unknown');
  await expect(info.locator('dd').nth(1)).not.toHaveText('Unknown');
  await page.getByRole('button', { name: 'Close properties' }).click();

  // Details panel: move to a new space and duplicate.
  await page.evaluate(k => {
    const lib = JSON.parse(localStorage.getItem(k)!);
    localStorage.setItem(k, JSON.stringify({ ...lib, spaces: ['Ops'] }));
  }, INDEX_KEY);
  await page.reload();
  await boardMenu(page, 'Details');
  const details = page.getByRole('complementary', { name: 'Board details' });
  await details.getByLabel('Move board to space').selectOption('Ops');
  await expect
    .poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k)!).boards[0].space, INDEX_KEY))
    .toBe('Ops');
  await details.getByRole('button', { name: 'Duplicate board' }).click();
  await expect.poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k)!).boards.length, INDEX_KEY)).toBe(2);
  await details.getByRole('button', { name: 'Delete board' }).click();
  await expect(details.getByRole('button', { name: 'Move to trash' })).toBeVisible();
  await details.getByRole('button', { name: 'Keep' }).click();
  await page.getByRole('button', { name: 'Close board details' }).click();

  // Brand kit: a saved colour and font show first.
  await boardMenu(page, 'Brand kit', 'Preferences');
  const kit = page.getByRole('complementary', { name: 'Brand kit' });
  await kit.getByLabel('New brand colour').evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '#123456');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await kit.getByRole('button', { name: 'Add colour' }).click();
  await kit.getByLabel('Brand font').selectOption('Georgia');
  await expect(kit.getByRole('list', { name: 'Brand colours' })).toContainText('#123456');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('boardroom.brandkit.v1')!))).toEqual({
    colors: ['#123456'],
    font: 'Georgia',
  });
  await kit.getByRole('button', { name: 'Close brand kit' }).click();
  await item(page, 'a').click();
  await page.getByRole('group', { name: 'Brand colours' }).getByRole('button').first().click();
  await waitForSave(page, b => b.items[0].fill === '#123456', 'brand colour applied');
  await expect(page.getByLabel('Font family').locator('option').first()).toHaveText('Georgia');
});
