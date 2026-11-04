// Track R4 in the browser: presentation bar extras and click-to-zoom, Slides presenter notes, record colours,
// hidden Kanban columns, Timeline jumps, number formats, Doc shortcuts and emoji completion, deep links,
// frame copies, voting results on the board and comment extras.
import { test, expect, seed, fit, item, waitForSave, savedBoard, selectViaLayers, axeViolations } from './helpers';

test('present bar: timer, reactions, slide voting, click-to-zoom and go to canvas', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Talk', items: [
       { ...m.createItem('frame', 0, 0), id: 'f1', w: 800, h: 450, text: 'Intro' },
       { ...m.createItem('note', 80, 80), id: 'n1', text: 'Idea one' },
       { ...m.createItem('note', 420, 80), id: 'n2', text: 'Idea two' },
     ] };`,
  );
  await page.getByRole('button', { name: 'Presentation', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Presentation' })
    .getByRole('button', { name: 'Present from the start' })
    .click();
  const bar = page.locator('.present-bar');
  await expect(bar).toContainText('Intro · 1 / 1');

  await bar.getByRole('button', { name: 'Timer' }).click();
  await expect(page.getByRole('group', { name: 'Board timer' }).or(page.locator('.board-timer'))).toBeVisible();
  await bar.getByRole('button', { name: 'Reactions' }).click();
  await bar.getByRole('group', { name: 'Send a reaction' }).getByRole('button', { name: 'Thumbs up' }).click();
  await expect(page.locator('.reaction-float').first()).toBeAttached();

  await bar.getByRole('button', { name: 'Vote on this slide' }).click();
  const votes = page.locator('.present-vote');
  await expect(votes).toHaveCount(2);
  await votes.first().getByRole('button', { name: 'Add vote' }).click();
  await waitForSave(
    page,
    b => Object.values(b.voting?.votes ?? {}).reduce((s: number, v) => s + (v as number), 0) === 1,
  );
  expect(await axeViolations(page)).toEqual([]);
  await bar.getByRole('button', { name: 'End voting' }).click();
  await waitForSave(page, b => !b.voting && b.votingResults?.length === 1, 'voting ended from the bar');

  // Click-to-zoom on a slide object, then back.
  const note = await item(page, 'n2').boundingBox();
  await page.mouse.click(note!.x + note!.width / 2, note!.y + note!.height / 2);
  await expect(page.locator('.present-overlay.zoomed')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.present-overlay.zoomed')).toHaveCount(0);
  await expect(page.locator('.present-overlay')).toHaveCount(1);

  await bar.getByRole('button', { name: 'Go to canvas' }).click();
  await expect(page.locator('.present-overlay')).toHaveCount(0);
  await expect(page.locator('.selection-bar')).toBeVisible();
});

test('Slides keep presenter notes that show while presenting the deck', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Deck', items: [{ ...m.createItem('slides', 0, 0), id: 'd', w: 900, h: 640 }] };`,
  );
  await fit(page);
  const deck = item(page, 'd');
  await deck.getByRole('textbox', { name: 'Presenter notes for this slide' }).fill('Open with the customer story');
  await deck.getByRole('textbox', { name: 'Presenter notes for this slide' }).blur();
  await waitForSave(page, b => b.items[0].data.slides[0].notes === 'Open with the customer story', 'slide notes saved');
  await deck.getByRole('button', { name: 'Present deck' }).click();
  const presenter = page.getByRole('dialog', { name: /^Presenting/ });
  await page.keyboard.press('n');
  await expect(presenter.getByRole('complementary', { name: 'Presenter notes' })).toContainText(
    'Open with the customer story',
  );
  await page.keyboard.press('Escape');
});

const records = (kind: string) => `return {version:1,title:'R4 records',
items:[{...m.createItem('${kind}',0,0),id:'w',w:1250,h:700,datasetId:'d',
  recordView: ${kind === 'timeline' ? "{timeline:{start:'2026-01-01',end:'2026-01-31',fit:false}}" : '{}'}}],
recordSchemas:{d:{statuses:['Not started','In progress','Complete'],fields:[
{id:'pct',name:'Done',type:'number',format:'percent',rules:[{op:'gte',value:80,color:'#2b8a3e'}]},
{id:'cost',name:'Cost',type:'formula',formula:'{Points} * 100',format:'currency',currency:'EUR'}]}},
datasets:{d:[
{id:'a',title:'Alpha',status:'Not started',assignee:'Ann',start:'2026-01-05',end:'2026-01-09',points:2,values:{pct:90}},
{id:'b',title:'Beta',status:'In progress',assignee:'Bo',start:'2026-06-01',end:'2026-06-04',points:1,values:{pct:10}}]}};`;

test('Kanban hides columns, colours records and formats numbers', async ({ page }) => {
  await seed(page, records('kanban'));
  await fit(page);
  const w = item(page, 'w');
  await w.getByRole('button', { name: 'Hide column: Complete' }).click();
  await expect(w.locator('[data-record-status="Complete"]')).toHaveCount(0);
  await waitForSave(page, b => b.items[0].recordView?.hiddenColumns?.includes('Complete'), 'column hidden');
  await w.getByText(/Shown columns/).click();
  await w.getByRole('checkbox', { name: 'Show column: Complete' }).check();
  await expect(w.locator('[data-record-status="Complete"]')).toHaveCount(1);

  await w.getByRole('combobox', { name: 'Record colour: Alpha' }).selectOption({ label: 'Green' });
  await waitForSave(page, b => b.datasets.d[0].color === '#c3fae8', 'record colour saved');
  await expect(w.locator('[data-card="a"]')).toHaveAttribute('data-record-color', '#c3fae8');
  await expect(w.locator('[data-card="a"] .record-number-value').first()).toHaveText('90%');
  await expect(w.locator('[data-card="a"] [data-rule-color="#2b8a3e"]')).toHaveCount(1);
  await expect(w.locator('[data-card="a"] .record-formula-value')).toContainText('€200.00');
  expect(await axeViolations(page)).toEqual([]);
});

test('Timeline bars use record colours and out-of-view bars can be jumped to', async ({ page }) => {
  await seed(page, records('timeline'));
  await fit(page);
  const w = item(page, 'w');
  const jump = w.getByRole('button', { name: /^Jump to Beta/ });
  await expect(jump).toBeVisible();
  await jump.click();
  await waitForSave(page, b => (b.items[0].recordView?.timeline?.start ?? '') > '2026-05-01', 'range moved');
  await expect(w.getByRole('button', { name: /^Jump to Beta/ })).toHaveCount(0);
  await expect(w.getByRole('button', { name: /^Jump to Alpha/ })).toBeVisible();
});

test('number display settings: currency code, progress colour and colour rules', async ({ page }) => {
  await seed(page, records('table'));
  await fit(page);
  const w = item(page, 'w');
  await w.getByText('Fields', { exact: true }).click();
  await w.getByRole('checkbox', { name: 'Show as progress bar: Done' }).check();
  await waitForSave(page, b => b.recordSchemas.d.fields[0].display === 'progress', 'progress on');
  await w.getByRole('checkbox', { name: 'Hide number: Done' }).check();
  await waitForSave(page, b => b.recordSchemas.d.fields[0].hideLabel === true, 'label hidden');
  await w.getByRole('button', { name: 'Remove rule 1: Done' }).click();
  await waitForSave(page, b => !b.recordSchemas.d.fields[0].rules, 'rule removed');
  await w.getByRole('combobox', { name: 'Number format: Cost' }).selectOption('percent');
  await waitForSave(
    page,
    b => b.recordSchemas.d.fields[1].format === 'percent' && !b.recordSchemas.d.fields[1].currency,
    'currency cleared with the format',
  );
});

test('Doc toolbar underline and strikethrough, list shortcuts and :emoji completion', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Docs',items:[{...m.createItem('doc',100,100),id:'doc',w:600,h:520,data:{markdown:'# Plan\\n\\nIntro'}}]};`,
  );
  await fit(page);
  const doc = item(page, 'doc');
  await expect(doc.getByRole('button', { name: 'Underline document text' })).toBeVisible();
  await expect(doc.getByRole('button', { name: 'Strikethrough document text' })).toBeVisible();
  const editor = doc.getByRole('textbox', { name: /^Document content/ });
  await editor.getByText('Intro', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Great :thumbs');
  const menu = page.getByRole('listbox', { name: 'Insert emoji' });
  await expect(menu.getByRole('option').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(editor).toContainText('Great 👍');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Alt+5');
  await page.keyboard.type('First step');
  await page.keyboard.press('Control+Enter');
  await waitForSave(
    page,
    b => b.items[0].data.markdown.includes('👍') && b.items[0].data.markdown.includes('1. First step'),
    'emoji and numbered list saved',
  );
});

test('deep links select an object or open it in focus; dashboard makes a single-format board', async ({ page }) => {
  await seed(
    page,
    `return {version:1,title:'Links',items:[{...m.createItem('note',0,0),id:'n1',text:'Linked'},
      {...m.createItem('kanban',600,0),id:'k1',datasetId:'d'}],
      datasets:{d:[{id:'r',title:'Task',status:'Not started',assignee:'',start:'',end:''}]}};`,
  );
  await page.goto('/#object=n1');
  await expect(page.locator('.selection-bar')).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  await page.evaluate(() => (location.hash = '#object=k1&focus=1'));
  await expect(page.getByRole('dialog', { name: 'Edit kanban' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Copy link from the context menu (the text lands in the status message when the clipboard is unavailable).
  await page.goto('/');
  await expect(page.locator('svg.canvas')).toBeVisible();
  await selectViaLayers(page, 'Linked');
  const box = await item(page, 'n1').boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy link to object' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Link copied|#board=/ })).toBeVisible();

  await page.getByRole('button', { name: 'boardroom: all boards' }).click();
  await page.getByRole('button', { name: 'Kanban board' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit kanban' })).toBeVisible();
});

test('frames: make copies and shuffle the style; voting results go on the board', async ({ page }) => {
  await seed(
    page,
    `return { version: 1, title: 'Frames', items: [
       { ...m.createItem('frame', 0, 0), id: 'f1', w: 500, h: 300, text: 'Round' },
       { ...m.createItem('note', 40, 40), id: 'n1', text: 'Inside' },
     ], votingResults: [{ endedAt: '2026-11-04T10:00:00.000Z', budget: 3, name: 'Ideas',
       totals: [{ id: 'n1', label: 'Inside', votes: 2 }] }] };`,
  );
  await selectViaLayers(page, 'Round');
  const selBar = page.locator('.selection-bar');
  await selBar.getByRole('button', { name: 'Make copies of frame' }).click();
  await page.getByRole('spinbutton', { name: 'Number of copies' }).fill('2');
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Make copies', exact: true }).click();
  await waitForSave(
    page,
    b => b.items.filter(i => i.type === 'frame').length === 3 && b.items.filter(i => i.type === 'note').length === 3,
    'two copies made',
  );
  const frames = (await savedBoard(page)).items.filter(i => i.type === 'frame').map(i => i.text);
  expect(frames).toEqual(['Round', 'Round 2', 'Round 3']);

  await selectViaLayers(page, 'Round 3');
  await selBar.getByRole('button', { name: 'Frame style' }).click();
  await page.getByRole('button', { name: 'Shuffle style' }).click();
  await waitForSave(page, b => !!b.items.find(i => i.text === 'Round 3')?.data?.style?.id, 'style shuffled');

  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Dot voting' }).click();
  await page.getByRole('button', { name: /^Place result Ideas on the board/ }).click();
  await waitForSave(
    page,
    b => b.items.some(i => i.type === 'text' && i.text.startsWith('Ideas\n1. Inside — 2 votes')),
    'results on the board',
  );
});

test('comments: pin colour, unread markers and saved drafts', async ({ page }) => {
  await seed(
    page,
    `return { ...m.newBoard(), comments: [
       { id: 't1', x: 300, y: 300, messages: [{ id: 'm1', text: 'First thread', at: '2026-01-01T10:00:00.000Z' }] },
       { id: 't2', x: 500, y: 300, messages: [{ id: 'm2', text: 'Second thread', at: '2026-01-01T11:00:00.000Z' }] }] };`,
  );
  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Comments' }).click();
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await expect(panel.locator('[data-unread]')).toHaveCount(2);
  await panel.getByRole('button', { name: /First thread/ }).click();
  await expect(panel.locator('[data-unread]')).toHaveCount(1);

  const thread = page.locator('.comment-popover');
  await thread.getByRole('button', { name: 'Comment colour' }).click();
  await thread.getByRole('button', { name: 'Blue pin' }).click();
  await waitForSave(page, b => b.comments[0].color === '#3b5bdb', 'pin colour saved');
  await expect(page.locator('[data-comment="t1"] path')).toHaveAttribute('fill', '#3b5bdb');

  await thread.getByRole('textbox', { name: 'Reply' }).fill('Half-written reply');
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: /First thread/ }).click();
  await expect(page.locator('.comment-popover').getByRole('textbox', { name: 'Reply' })).toHaveValue(
    'Half-written reply',
  );
  expect(await axeViolations(page)).toEqual([]);
});
