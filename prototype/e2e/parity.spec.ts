import { test, expect, seed, openApp, item, savedBoard, waitForSave, openTools, chooseTool } from './helpers';

/** Place the chosen catalogue tool at the centre of the canvas. */
async function placeTool(page: import('@playwright/test').Page, category: string, label: string) {
  await openTools(page, category);
  await chooseTool(page, label);
  const box = (await page.locator('svg.canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('People and User card widgets add members and use the profile name', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('boardroom.profile.name', 'Sam Lee'));
  await page.reload();
  await placeTool(page, 'Essentials', 'People');
  await waitForSave(page, b => b.items.some(i => i.type === 'people'), 'people placed');
  const people = (await savedBoard(page)).items.find(i => i.type === 'people')!;
  await item(page, people.id).dblclick();
  const dialog = page.getByRole('dialog', { name: 'People' });
  await dialog.getByRole('button', { name: 'Add me (Sam Lee)' }).click();
  await dialog.getByLabel('Person name').fill('Ana Ruiz');
  await dialog.getByLabel('Person role').fill('Engineer');
  await dialog.getByRole('button', { name: 'Add person' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items.find(i => i.type === 'people')?.data.members.length === 2, 'members saved');
  await expect(item(page, people.id).getByRole('list', { name: 'Team members' }).getByRole('listitem')).toHaveCount(2);

  await placeTool(page, 'Essentials', 'User card');
  await waitForSave(page, b => b.items.some(i => i.type === 'usercard'), 'user card placed');
  const card = (await savedBoard(page)).items.find(i => i.type === 'usercard')!;
  await item(page, card.id).dblclick();
  const cardDialog = page.getByRole('dialog', { name: 'User card' });
  await cardDialog.getByRole('button', { name: 'Use my profile name (Sam Lee)' }).click();
  await cardDialog.getByLabel('Email').fill('not-an-email');
  await expect(cardDialog.getByRole('alert')).toHaveText('Enter a valid email address or leave it empty.');
  await cardDialog.getByLabel('Email').fill('sam@example.com');
  await cardDialog.getByLabel('Role').fill('Designer');
  await cardDialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items.find(i => i.type === 'usercard')?.data.name === 'Sam Lee', 'card saved');
  await expect(item(page, card.id)).toContainText('Designer');
});

test('Action Shortcut jumps to a frame when clicked', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),items:[{...m.createItem('frame',3000,3000),id:'f',text:'Goal'},{...m.createItem('shortcut',400,300),id:'s'}]};`,
  );
  await item(page, 's').dblclick({ position: { x: 3, y: 3 } });
  const dialog = page.getByRole('dialog', { name: 'Action Shortcut' });
  await dialog.getByLabel('Shortcut action').selectOption('frame');
  await expect(dialog.getByRole('alert')).toHaveText('Choose a frame.');
  await dialog.getByLabel('Shortcut frame').selectOption('f');
  await dialog.getByLabel('Shortcut label').fill('Go to goal');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 's')?.data.target === 'f', 'shortcut saved');
  await item(page, 's').getByRole('button', { name: 'Go to goal' }).click();
  await expect(item(page, 'f')).toBeInViewport();
});

test('Save board as template, then insert and delete it from Templates', async ({ page }) => {
  await seed(
    page,
    `const a={...m.createItem('note',0,0),id:'a',text:'Keep'},b={...m.createItem('note',400,0),id:'b',text:'Me'};
     return {...m.newBoard(),title:'Kickoff',items:[a,b,{...m.createItem('arrow',0,0),id:'c',from:'a',to:'b'}]};`,
  );
  await page.getByRole('button', { name: 'Export' }).click();
  await page.getByRole('button', { name: /^Save board as template/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved "Kickoff" to My templates.' })).toBeVisible();
  await openTools(page, 'Essentials');
  await chooseTool(page, 'Templates');
  const mine = page.getByRole('list', { name: 'My templates' });
  await mine.getByRole('button', { name: /^Kickoff/ }).click();
  await waitForSave(page, b => b.items.length === 6, 'template inserted');
  const items = (await savedBoard(page)).items;
  const arrows = items.filter(i => i.type === 'arrow');
  expect(arrows).toHaveLength(2);
  expect(items.some(i => i.id === arrows[1].from) && arrows[1].from !== 'a').toBe(true);
  await openTools(page, 'Essentials');
  await chooseTool(page, 'Templates');
  await page.getByRole('button', { name: 'Delete template Kickoff' }).click();
  await expect(page.getByRole('list', { name: 'My templates' })).toHaveCount(0);
});

test('Frames button lists frames and adds one', async ({ page }) => {
  await seed(page, `return {...m.newBoard(),items:[{...m.createItem('frame',0,0),id:'f',text:'Intro'}]};`);
  await page.getByRole('button', { name: 'Frames', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Presentation' });
  await expect(panel.locator('.slide-name', { hasText: 'Intro' })).toBeVisible();
  await panel.getByRole('button', { name: 'Add frame' }).click();
  await waitForSave(page, b => b.items.filter(i => i.type === 'frame').length === 2, 'frame added');
  await expect(panel.locator('.slide-name', { hasText: 'Frame 2' })).toBeVisible();
});

test('dark sticky colours get white text, and spell check and capture panels are available', async ({ page }) => {
  await seed(page, `return {...m.newBoard(),items:[{...m.createItem('note',0,0,'#1f1f23'),id:'n',text:'Dark'}]};`);
  await expect(item(page, 'n').locator('.object-text')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('html')).toHaveAttribute('spellcheck', 'true');
  await page.getByRole('button', { name: /Zoom and navigation:/ }).click();
  await page.getByRole('region', { name: 'View controls' }).getByLabel('Spell check').uncheck();
  await expect(page.locator('html')).toHaveAttribute('spellcheck', 'false');
  await page.keyboard.press('Escape');
  await openTools(page, 'Formats');
  await chooseTool(page, 'Talktrack');
  const talk = page.getByRole('complementary', { name: 'Talktrack' });
  await expect(talk.getByRole('button', { name: 'Start recording' })).toBeVisible();
  await expect(talk.getByLabel('Record my voice')).toBeChecked();
  await talk.getByRole('button', { name: 'Close Talktrack' }).click();
  await expect(talk).toHaveCount(0);
});

test('Validation report lists diagram issues and selects the object', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),items:[{...m.createItem('rectangle',0,0),id:'a',text:'Start'},{...m.createItem('rectangle',400,0),id:'b',text:''},{...m.createItem('arrow',0,0),id:'c',from:'a',to:'b'}]};`,
  );
  await openTools(page, 'Other');
  await chooseTool(page, 'Validation report');
  const report = page.getByRole('complementary', { name: 'Validation report' });
  await expect(report.getByRole('listitem')).toHaveCount(1);
  await report.getByRole('button', { name: /has no label/ }).click();
  await expect(page.locator('.selection').first()).toBeVisible();
});

test('Stickies capture turns a photo of notes into sticky notes', async ({ page }) => {
  await openApp(page);
  const photo = Buffer.from(
    (
      await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 300;
        c.height = 200;
        const g = c.getContext('2d')!;
        g.fillStyle = '#ececec';
        g.fillRect(0, 0, 300, 200);
        g.fillStyle = '#ffe36e';
        g.fillRect(20, 30, 80, 80);
        g.fillStyle = '#ffa0a7';
        g.fillRect(160, 40, 80, 80);
        return c.toDataURL('image/png');
      })
    ).split(',')[1]!,
    'base64',
  );
  await openTools(page, 'Other');
  await chooseTool(page, 'Stickies capture');
  const panel = page.getByRole('complementary', { name: 'Stickies capture' });
  await panel
    .getByLabel('Sticky notes photo')
    .setInputFiles({ name: 'wall.png', mimeType: 'image/png', buffer: photo });
  await expect(panel.getByText('Found 2 sticky notes.')).toBeVisible();
  await panel.getByLabel('Also add the photo').uncheck();
  await panel.getByRole('button', { name: 'Add 2 notes' }).click();
  await waitForSave(page, b => b.items.filter(i => i.type === 'note').length === 2, 'notes created');
  const notes = (await savedBoard(page)).items.filter(i => i.type === 'note');
  expect(notes.map(n => n.fill)).toEqual(['#ffe36e', '#ffa0a7']);
  expect(notes[1].x).toBeGreaterThan(notes[0].x);
});

test('pen panel: smart pen turns a drawn box into a rectangle, lasso selects, presets apply', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),items:[{...m.createItem('note',600,100),id:'n1'},{...m.createItem('note',850,100),id:'n2'}]};`,
  );
  await page.keyboard.press('p');
  const pen = page.getByRole('group', { name: 'Pen mode' });
  await pen.getByRole('button', { name: 'Smart pen' }).click();
  const box = (await page.locator('svg.canvas').boundingBox())!;
  const at = (x: number, y: number) => ({ x: box.x + x, y: box.y + y });
  const corners = [at(200, 300), at(420, 300), at(420, 450), at(200, 450), at(200, 303)];
  await page.mouse.move(corners[0].x, corners[0].y);
  await page.mouse.down();
  for (let k = 1; k < corners.length; k++)
    for (let s = 1; s <= 8; s++) {
      const a = corners[k - 1],
        b = corners[k];
      await page.mouse.move(a.x + ((b.x - a.x) * s) / 8, a.y + ((b.y - a.y) * s) / 8);
    }
  await page.mouse.up();
  await waitForSave(page, b => b.items.some(i => i.type === 'rectangle'), 'rectangle recognised');
  expect((await savedBoard(page)).items.some(i => i.type === 'pen')).toBe(false);

  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  await pen.getByRole('button', { name: 'Lasso' }).click();
  const n1 = (await item(page, 'n1').boundingBox())!,
    n2 = (await item(page, 'n2').boundingBox())!;
  const loop = [
    { x: n1.x - 20, y: n1.y - 20 },
    { x: n2.x + n2.width + 20, y: n2.y - 20 },
    { x: n2.x + n2.width + 20, y: n2.y + n2.height + 20 },
    { x: n1.x - 20, y: n1.y + n1.height + 20 },
    { x: n1.x - 20, y: n1.y - 18 },
  ];
  await page.mouse.move(loop[0].x, loop[0].y);
  await page.mouse.down();
  for (const p of loop.slice(1)) await page.mouse.move(p.x, p.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.selection rect[stroke="#4262ff"]').first()).toBeVisible();

  await page.keyboard.press('p');
  await page.getByRole('group', { name: 'Pen presets' }).getByRole('button', { name: 'Preset 2' }).click();
  await expect(page.getByRole('button', { name: 'Pen colour #e5484d' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Stroke width')).toHaveValue('5');
});

test('board menu sets status, background and a start view that is used on reload', async ({ page }) => {
  await seed(page, `return {...m.newBoard(),items:[{...m.createItem('note',2000,1500),id:'n',text:'Far'}]};`);
  await page.getByRole('button', { name: 'Board menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Board settings' });
  await menu
    .getByRole('radiogroup', { name: 'Board status' })
    .getByRole('radio', { name: /In review/ })
    .click();
  await expect(page.locator('.board-status')).toHaveText('In review');
  await menu.getByRole('radio', { name: 'Light Blue' }).click();
  await expect(page.locator('svg.canvas')).toHaveCSS('background-color', 'rgb(227, 237, 255)');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await page.getByRole('button', { name: 'Board menu' }).click();
  await menu.getByRole('button', { name: 'Use current view' }).click();
  await waitForSave(page, b => !!b.startView && b.status === 'review' && b.background === '#e3edff', 'settings saved');
  await page.reload();
  await expect(item(page, 'n')).toBeInViewport();
  await expect(page.locator('.board-status')).toHaveText('In review');
});

test('preferences: single-key shortcuts, undo controls, comments and mouse navigation', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Zoom and navigation:/ }).click();
  const view = page.getByRole('region', { name: 'View controls' });
  await view.getByLabel('Single-character shortcuts').uncheck();
  await view.getByLabel('Undo/Redo controls').uncheck();
  await view.getByLabel('Navigate with').selectOption('mouse');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await page.locator('svg.canvas').click({ position: { x: 250, y: 250 } });
  await page.keyboard.press('n');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const box = (await page.locator('svg.canvas').boundingBox())!;
  await page.mouse.move(box.x + 250, box.y + 250);
  await page.mouse.wheel(0, -300);
  await expect(page.getByRole('button', { name: /Zoom and navigation: (?!100%)/ })).toBeVisible();
});

test('command palette runs a tool and a view action from the keyboard', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await palette.getByLabel('Search commands').fill('hide grid');
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);
  await expect(page.locator('.canvas-grid')).toHaveCount(0);
  await page.keyboard.press('Control+/');
  await palette.getByLabel('Search commands').fill('validation');
  await palette.getByRole('option', { name: /Validation report/ }).click();
  await expect(page.getByRole('complementary', { name: 'Validation report' })).toBeVisible();
});

test('board menu: history restores a deleted note, catch up, details, star and move to a space', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),title:'Plan',items:[{...m.createItem('note',0,0),id:'n',text:'Keep me'}]};`,
  );
  await item(page, 'n').click();
  await page.keyboard.press('Delete');
  await waitForSave(page, b => b.items.length === 0, 'note deleted');
  const openMenu = () => page.getByRole('button', { name: 'Board menu' }).click();
  await openMenu();
  await page.getByRole('dialog', { name: 'Board settings' }).getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('complementary', { name: 'History' });
  await expect(history.getByText(/deleted sticky note/)).toBeVisible();
  await history.getByRole('button', { name: 'Restore' }).click();
  await waitForSave(page, b => b.items.some(i => i.id === 'n'), 'note restored');
  await history.getByRole('button', { name: 'Close history' }).click();

  await openMenu();
  await page.getByRole('dialog', { name: 'Board settings' }).getByRole('button', { name: 'Catch up' }).click();
  const catchUp = page.getByRole('complementary', { name: 'Catch up' });
  await expect(catchUp.getByText(/1 added · 0 edited · 1 deleted|added ·/)).toBeVisible();
  await catchUp.getByRole('button', { name: 'Close catch up' }).click();

  await openMenu();
  const menu = page.getByRole('dialog', { name: 'Board settings' });
  await menu.getByRole('button', { name: 'Star this board' }).click();
  await menu.getByLabel('New space name').fill('Design');
  await menu.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(menu.getByRole('radio', { name: 'Design' })).toHaveAttribute('aria-checked', 'true');
  await menu.getByRole('button', { name: 'Details' }).click();
  const details = page.getByRole('complementary', { name: 'Board details' });
  await expect(details).toContainText('This browser · Design');
  await expect(details).toContainText('Plan');
  await details.getByRole('button', { name: 'Close board details' }).click();

  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  await page.getByLabel('Show boards').selectOption('Design');
  await expect(page.getByRole('button', { name: 'Unstar Plan' })).toHaveAttribute('aria-pressed', 'true');
});

test('Do Not Disturb hides reaction animations but still announces them', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Zoom and navigation:/ }).click();
  await page.getByRole('region', { name: 'View controls' }).getByLabel('Do Not Disturb').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-dnd', 'on');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('boardroom:reaction', { detail: '👍' })));
  await expect(page.getByText(/Reaction sent/)).toBeAttached();
  await expect(page.locator('.reaction-float')).toHaveCount(0);
});
