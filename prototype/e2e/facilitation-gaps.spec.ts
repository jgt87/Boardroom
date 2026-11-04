// Presentation and facilitation gaps in the browser: presenter notes and hidden frames while presenting,
// the slide overview, timer exact time and +1 minute, keyword clustering, and editing a comment.
import { test, expect, seed, waitForSave, savedBoard, selectViaLayers } from './helpers';

test('presenter notes, hidden frames, slide overview and pop-out notes', async ({ page, context }) => {
  await seed(
    page,
    `const f = (id, x, text) => ({ ...m.createItem('frame', x, 0), id, text });
     return { version: 1, title: 'Deck', items: [f('fa', 0, 'Intro'), f('fb', 900, 'Middle'), f('fc', 1800, 'Outro')] };`,
  );
  await selectViaLayers(page, 'Middle');
  await page.locator('.selection-bar').getByRole('button', { name: 'Hide from presentation' }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 'fb')?.data?.skipInPresentation === true, 'frame hidden');

  await selectViaLayers(page, 'Intro');
  await page.locator('.selection-bar').getByRole('button', { name: 'Presenter notes' }).click();
  await page.getByRole('textbox', { name: 'Presenter notes text' }).fill('Welcome the team');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await waitForSave(page, b => b.items.find(i => i.id === 'fa')?.data?.notes === 'Welcome the team', 'notes saved');

  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Presentation' });
  await expect(panel.locator('li.hidden-slide')).toContainText('Middle');
  await expect(panel.getByRole('button', { name: 'Present from Middle' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Present from the start' }).click();

  const bar = page.locator('.present-bar');
  await expect(bar).toContainText('Intro · 1 / 2');
  await page.keyboard.press('n');
  const notes = page.getByRole('complementary', { name: 'Presenter notes' });
  await expect(notes).toContainText('Welcome the team');
  await page.keyboard.press('ArrowRight');
  await expect(bar).toContainText('Outro · 2 / 2');
  await expect(notes).toContainText('No notes for this frame.');

  await bar.getByRole('button', { name: 'Slide overview' }).click();
  const grid = page.getByRole('dialog', { name: 'Slide overview' });
  await expect(grid.getByRole('button', { name: /^Go to slide/ })).toHaveCount(2);
  await grid.getByRole('button', { name: 'Go to slide 1: Intro' }).click();
  await expect(grid).toHaveCount(0);
  await expect(bar).toContainText('Intro · 1 / 2');

  await bar.getByRole('button', { name: 'Dark surround' }).click();
  await expect(page.locator('.present-hole')).toHaveCount(1);

  const popupPromise = context.waitForEvent('page');
  await notes.getByRole('button', { name: 'Pop out notes' }).click();
  const popup = await popupPromise;
  await expect(popup.locator('body')).toContainText('Welcome the team');
  await page.keyboard.press('ArrowRight');
  await expect(popup.locator('body')).toContainText('Outro');

  await page.keyboard.press('Escape');
  await expect(page.locator('.present-overlay')).toHaveCount(0);
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test('timer takes an exact time and adds a minute while running', async ({ page }) => {
  await seed(page, `return m.newBoard();`);
  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Timer' }).click();
  await page.getByRole('button', { name: /^Set exact time/ }).click();
  const input = page.getByRole('textbox', { name: 'Exact time (mm:ss)' });
  await input.fill('2:30');
  await input.press('Enter');
  await expect(page.locator('.board-timer .clock')).toHaveText('02:30');
  await page.getByRole('button', { name: 'Start timer' }).click();
  await page.getByRole('button', { name: 'Add 1 minute' }).click();
  await expect(page.locator('.board-timer .clock')).toHaveText(/^03:(2\d|30)$/);
});

test('keyword clustering lays notes out in titled columns as one undo step', async ({ page }) => {
  await seed(
    page,
    `const texts = ['Onboarding emails', 'Pricing page', 'Onboarding steps', 'Pricing tiers'];
     return { version: 1, title: 'Cluster', items: texts.map((text, i) => ({ ...m.createItem('note', (i % 2) * 260, Math.floor(i / 2) * 260), id: 'n' + i, text })) };`,
  );
  const before = await savedBoard(page);
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+A');
  await page.locator('.selection-bar').getByRole('button', { name: 'Cluster notes' }).click();
  await page.getByRole('dialog', { name: 'Cluster notes' }).getByRole('button', { name: 'Keyword' }).click();
  await waitForSave(
    page,
    b =>
      b.items.length === 6 &&
      ['Onboarding (2)', 'Pricing (2)'].every(t => b.items.some(i => i.type === 'frame' && i.text === t)),
    'clusters created',
  );
  const after = await savedBoard(page);
  const x = (id: string) => after.items.find(i => i.id === id).x;
  expect(x('n0')).toBe(x('n2'));
  expect(x('n1')).toBe(x('n3'));
  expect(x('n1')).toBeGreaterThan(x('n0'));
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitForSave(page, b => JSON.stringify(b.items) === JSON.stringify(before.items), 'undo restores the notes');
});

test('a comment can be edited, reacted to and pinned', async ({ page }) => {
  await seed(
    page,
    `return { ...m.newBoard(), comments: [{ id: 't1', x: 300, y: 300, messages: [{ id: 'm1', text: 'Original text', at: '2026-01-01T10:00:00.000Z' }] }] };`,
  );
  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Comments' }).click();
  await page
    .getByRole('complementary', { name: 'Comments' })
    .getByRole('button', { name: /Original text/ })
    .click();
  const thread = page.locator('.comment-popover');
  await thread.getByRole('button', { name: 'Edit comment' }).click();
  await thread.getByRole('textbox', { name: 'Edit comment' }).fill('Edited text');
  await thread.getByRole('button', { name: 'Save', exact: true }).click();
  await waitForSave(
    page,
    b => b.comments?.[0]?.messages[0].text === 'Edited text' && !!b.comments[0].messages[0].editedAt,
    'edit saved',
  );
  await expect(thread).toContainText('edited');
  await thread.getByRole('button', { name: 'Add reaction' }).click();
  await thread.getByRole('button', { name: 'React 👍' }).click();
  await thread.getByRole('button', { name: 'Pin thread' }).click();
  await waitForSave(
    page,
    b => b.comments?.[0]?.pinned === true && b.comments[0].messages[0].reactions?.[0] === '👍',
    'reaction and pin saved',
  );
});
