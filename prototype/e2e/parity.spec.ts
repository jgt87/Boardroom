import { test, expect, seed, openApp, item, savedBoard, waitForSave, openTools, chooseTool, fit } from './helpers';

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
  await mainMenu(page, 'Preferences', 'Spell check');
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
  await expect(page.getByRole('button', { name: 'Pen colour Red' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Stroke width')).toHaveValue('5');
});

/** Open the main menu and follow a path of submenus, clicking the last entry. */
async function mainMenu(page: import('@playwright/test').Page, ...path: string[]) {
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

test('main menu sets status, background and a start view that is used on reload', async ({ page }) => {
  await seed(page, `return {...m.newBoard(),items:[{...m.createItem('note',2000,1500),id:'n',text:'Far'}]};`);
  await mainMenu(page, 'Assign status', 'In review');
  await expect(page.locator('.board-status')).toHaveText('In review');
  await mainMenu(page, 'Board', 'Background color', 'Light Blue');
  await expect(page.locator('svg.canvas')).toHaveCSS('background-color', 'rgb(227, 237, 255)');
  await page.keyboard.press('Escape');
  await expect(page.locator('.main-menu-list')).toHaveCount(0);
  await fit(page);
  await mainMenu(page, 'Board', 'Start view', 'Use current view');
  await waitForSave(page, b => !!b.startView && b.status === 'review' && b.background === '#e3edff', 'settings saved');
  await page.reload();
  await expect(item(page, 'n')).toBeInViewport();
  await expect(page.locator('.board-status')).toHaveText('In review');
});

test('preferences: single-key shortcuts, undo controls, comments and mouse navigation', async ({ page }) => {
  await openApp(page);
  await mainMenu(page, 'Accessibility', 'Single-character shortcuts');
  await mainMenu(page, 'View', 'Undo/Redo controls');
  await mainMenu(page, 'Preferences', 'Mouse or trackpad', 'Mouse');
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

test('main menu: history restores a deleted note, catch up, details, star and move to a space', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),title:'Plan',items:[{...m.createItem('note',0,0),id:'n',text:'Keep me'}]};`,
  );
  await item(page, 'n').click();
  await page.keyboard.press('Delete');
  await waitForSave(page, b => b.items.length === 0, 'note deleted');
  await mainMenu(page, 'Board', 'History');
  const history = page.getByRole('complementary', { name: 'History' });
  await expect(history.getByText(/deleted sticky note/)).toBeVisible();
  await history.getByRole('button', { name: 'Restore' }).click();
  await waitForSave(page, b => b.items.some(i => i.id === 'n'), 'note restored');
  await history.getByRole('button', { name: 'Close history' }).click();

  await mainMenu(page, 'Board', 'Catch up');
  const catchUp = page.getByRole('complementary', { name: 'Catch up' });
  await expect(catchUp.getByText(/added ·/)).toBeVisible();
  await catchUp.getByRole('button', { name: 'Close catch up' }).click();

  await mainMenu(page, 'Board', 'Star this board');
  await expect(
    page.locator('.main-menu-list').last().getByRole('menuitemcheckbox', { name: 'Star this board' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await mainMenu(page, 'Board', 'Move to');
  await page.getByLabel('New space name').fill('Design');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Design' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await mainMenu(page, 'Board', 'Details');
  const details = page.getByRole('complementary', { name: 'Board details' });
  await expect(details).toContainText('This browser · Design');
  await details.getByRole('button', { name: 'Close board details' }).click();

  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  await page.getByLabel('Show boards').selectOption('Design');
  await expect(page.getByRole('button', { name: 'Unstar Plan' })).toHaveAttribute('aria-pressed', 'true');
});

test('Do Not Disturb hides reaction animations but still announces them', async ({ page }) => {
  await openApp(page);
  await mainMenu(page, 'Preferences', 'Do Not Disturb');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-dnd', 'on');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('boardroom:reaction', { detail: '👍' })));
  await expect(page.getByText(/Reaction sent/)).toBeAttached();
  await expect(page.locator('.reaction-float')).toHaveCount(0);
});

test('sticky stack: each drag off the pad takes a new note and the pad stays', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Sticky note', exact: true }).click();
  await page.getByRole('button', { name: 'Stack' }).click();
  await waitForSave(page, b => b.items.some(i => i.type === 'stickypad'), 'pad placed');
  const pad = (await savedBoard(page)).items.find(i => i.type === 'stickypad')!;
  const peel = page.locator(`[data-pad-peel="${pad.id}"]`);
  for (const dx of [320, 560]) {
    const b = (await peel.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + 20, { steps: 8 });
    await page.mouse.up();
  }
  await waitForSave(page, b => b.items.filter(i => i.type === 'note').length === 2, 'two notes taken');
  const board = await savedBoard(page);
  expect(board.items.filter(i => i.type === 'stickypad')).toHaveLength(1);
  expect(board.items.filter(i => i.type === 'note').every(n => n.fill === pad.fill)).toBe(true);
});

test('Show author displays the last editor in the bottom-left of a sticky note', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('boardroom.profile.name', 'Sam Lee'));
  await seed(
    page,
    `return {...m.newBoard(),items:[{...m.createItem('note',200,200),id:'n',text:'Idea',author:'Alex'}]};`,
  );
  await item(page, 'n').click();
  await page.getByRole('button', { name: 'Show author' }).click();
  await expect(item(page, 'n').locator('.note-author')).toContainText('Alex');
  await item(page, 'n').dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Better idea');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => b.items[0]?.text === 'Better idea' && b.items[0]?.author === 'Sam Lee', 'last editor');
  await expect(item(page, 'n').locator('.note-author')).toContainText('Sam Lee');
  const tag = (await item(page, 'n').locator('.note-author').boundingBox())!,
    note = (await item(page, 'n').boundingBox())!;
  expect(tag.x - note.x).toBeLessThan(note.width / 2);
});

test('only one tool rail popup is open at a time', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Sticky note', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Colors' })).toBeVisible();
  await page.getByRole('button', { name: 'Shapes and lines', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Shapes and lines' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Colors' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Emoji and stickers' }).click();
  await expect(page.getByRole('complementary', { name: 'Shapes and lines' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
  await expect(page.locator('.emoji-picker, [aria-label="Emoji and stickers"][role="dialog"]')).toHaveCount(0);
});

test('selection shows a gapped outline, round corner handles and four connection dots that draw connectors', async ({
  page,
}) => {
  await seed(
    page,
    `return {...m.newBoard(),items:[{...m.createItem('note',300,250),id:'a'},{...m.createItem('note',800,250),id:'b'}]};`,
  );
  await item(page, 'a').click();
  await expect(page.locator('circle.resize-handle')).toHaveCount(4);
  await expect(page.locator('[data-anchor]')).toHaveCount(4);
  const outline = (await item(page, 'a').locator('.selection rect').boundingBox())!,
    note = (await item(page, 'a').locator('rect').first().boundingBox())!;
  expect(note.x - outline.x).toBeGreaterThan(4);
  const dot = (await page.locator('[data-anchor="right"]').boundingBox())!,
    target = (await item(page, 'b').boundingBox())!;
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  await page.mouse.up();
  await waitForSave(page, b => b.items.some(i => i.type === 'arrow' && i.from === 'a' && i.to === 'b'), 'connected');
});

test('connector from a connection dot: target highlight, curved with a gap, sides follow the notes, swap ends', async ({
  page,
}) => {
  await seed(
    page,
    `return {...m.newBoard(),items:[{...m.createItem('note',300,300),id:'a'},{...m.createItem('note',800,200),id:'b'}]};`,
  );
  await item(page, 'a').click();
  const dot = (await page.locator('[data-anchor="right"]').boundingBox())!,
    target = (await item(page, 'b').boundingBox())!;
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  await expect(page.locator('.connect-target')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.connect-target')).toHaveCount(0);
  await waitForSave(page, b => b.items.some(i => i.type === 'arrow' && i.to === 'b'), 'connected');
  const arrow = (await savedBoard(page)).items.find(i => i.type === 'arrow')!;
  expect(arrow.connector).toMatchObject({ path: 'curved', gap: 8 });
  const swapped = page.getByRole('button', { name: 'Swap line ends' });
  await swapped.click();
  await waitForSave(page, b => b.items.find(i => i.type === 'arrow')?.from === 'b', 'swapped');
  const after = (await savedBoard(page)).items.find(i => i.type === 'arrow')!;
  expect([after.from, after.to, after.connector.startHead, after.connector.endHead]).toEqual([
    'b',
    'a',
    'arrow',
    'none',
  ]);
});

test('opening History moves the tool rail to the right of the panel', async ({ page }) => {
  await openApp(page);
  const rail = page.getByRole('navigation', { name: 'Creation tools' });
  const before = (await rail.boundingBox())!;
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.locator('.main-menu-list').getByRole('menuitem', { name: 'Board' }).hover();
  await page.locator('.main-menu-list').last().getByRole('menuitem', { name: 'History' }).click();
  const panel = (await page.getByRole('complementary', { name: 'History' }).boundingBox())!;
  await expect.poll(async () => (await rail.boundingBox())!.x).toBeGreaterThan(panel.x + panel.width);
  await page.getByRole('button', { name: 'Close history' }).click();
  await expect.poll(async () => (await rail.boundingBox())!.x).toBeLessThan(before.x + 5);
});

test('reference chrome: header export, grouped top bar with Present, bottom bar help, zoom menu, compact note toolbar', async ({
  page,
}) => {
  await seed(page, `return {...m.newBoard(),items:[{...m.createItem('note',300,250),id:'n',text:'Hi'}]};`);
  const header = page.locator('.board-header');
  await expect(header.getByRole('button', { name: 'Main menu' })).toBeVisible();
  await header.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('.export-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.export-menu')).toHaveCount(0);
  await expect(page.locator('.document-actions').getByRole('button', { name: 'Present', exact: true })).toBeVisible();
  await expect(page.locator('.minimap, [aria-label="Minimap"]')).toHaveCount(0);
  const bar = page.locator('.zoom');
  for (const name of ['Frames', 'Zoom out', 'Zoom in', 'Help and resources'])
    await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
  await bar.getByRole('button', { name: 'Help and resources' }).click();
  await page.getByRole('menuitem', { name: /Keyboard shortcuts/ }).click();
  await expect(page.locator('.help')).toBeVisible();
  await page.getByRole('button', { name: 'Close shortcuts' }).click();
  await page.getByRole('button', { name: /Zoom and navigation:/ }).click();
  const zoomMenu = page.getByRole('group', { name: 'Zoom menu' });
  await zoomMenu.getByLabel('Show minimap').check();
  await expect(page.locator('.minimap').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await item(page, 'n').click();
  const toolbar = page.locator('.selection-bar.compact');
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole('button', { name: 'Italic' })).toHaveCount(0);
  await toolbar.getByRole('button', { name: 'More text options' }).click();
  await expect(toolbar.getByRole('button', { name: 'Italic' })).toBeVisible();
});
