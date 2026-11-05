// Decided questions: Timeline flags shared per dataset (P2-Q6), note templates inserted at the caret (P2-Q13a)
// and Timeline starter templates (P2-Q13b).
import { test, expect, seed, fit, item, savedBoard, waitForSave } from './helpers';

const rows = `[
  {id:'a',title:'Design',status:'Not started',assignee:'',start:'2026-11-03',end:'2026-11-10'},
  {id:'b',title:'Build',status:'Not started',assignee:'',start:'2026-11-12',end:'2026-11-20'}]`;

test('P2-Q6: Timelines of one dataset share flags; old per-object flags are moved on load', async ({ page }) => {
  // An older board: the first Timeline carries its own flag, the second none.
  await seed(
    page,
    `return {...m.newBoard(),title:'Flags',items:[
      {...m.createItem('timeline',0,0),id:'t1',w:1100,h:420,datasetId:'d',
        recordView:{timeline:{flags:[{id:'f1',date:'2026-11-09',label:'Launch',color:'#30a46c'}]}}},
      {...m.createItem('timeline',0,520),id:'t2',w:1100,h:420,datasetId:'d'}],
      datasets:{d:${rows}}};`,
  );
  await fit(page);
  const t1 = item(page, 't1'),
    t2 = item(page, 't2');
  await expect(t1.locator('.timeline-flag')).toHaveText('Launch');
  await expect(t2.locator('.timeline-flag')).toHaveText('Launch');

  // A flag added on the second Timeline appears on the first and is stored once, on the dataset.
  await t2.locator('.timeline-flag-controls > summary').click();
  await t2.getByLabel('Flag date').fill('2026-11-18');
  await t2.getByLabel('Flag label').fill('Review');
  await t2.getByRole('button', { name: 'Add flag' }).click();
  await waitForSave(page, b => (b.recordSchemas as any)?.d?.timelineFlags?.length === 2, 'flags on the dataset');
  const saved = await savedBoard(page);
  expect((saved.recordSchemas as any).d.timelineFlags.map((f: any) => f.label)).toEqual(['Launch', 'Review']);
  expect(saved.items.every((i: any) => !i.recordView?.timeline?.flags)).toBe(true);
  await expect(t1.locator('.timeline-flag')).toHaveCount(2);
  await expect(t1.locator('.timeline-flag-controls > summary')).toHaveText('Flags (2)');

  // Removing it from the first Timeline removes it everywhere; undo brings it back in one step.
  await t1.locator('.timeline-flag-controls > summary').click();
  await t1.getByRole('button', { name: 'Remove flag Review' }).click();
  await expect(t2.locator('.timeline-flag')).toHaveCount(1);
  await waitForSave(page, b => (b.recordSchemas as any)?.d?.timelineFlags?.length === 1, 'flag removed');
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await expect(t2.locator('.timeline-flag')).toHaveCount(2);
});

test('P2-Q13a: a note template is inserted at the caret, or at the end, as one undo step', async ({ page }) => {
  await seed(page, `return {...m.newBoard(),title:'Notes',notes:'# Plan\\n\\nFirst\\n\\nSecond'};`);
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Alt+N');
  const panel = page.getByRole('complementary', { name: 'Board notes' });
  const editor = panel.getByRole('textbox', { name: /^Board notes/ });
  const menu = panel.getByRole('combobox', { name: 'Apply a doc template' });

  // Caret at the end of "First": the template goes in after that paragraph.
  await editor.locator('p', { hasText: 'First' }).click();
  await page.keyboard.press('End');
  await menu.focus();
  await menu.selectOption({ label: 'Retro notes' });
  await waitForSave(
    page,
    b => /^# Plan\n\nFirst\n\n# Retro notes\n[\s\S]*\n\nSecond$/.test(String(b.notes ?? '')),
    'template inserted after the caret paragraph',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Retro notes template inserted' })).toBeVisible();

  // One undo step restores the notes as they were.
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await waitForSave(page, b => b.notes === '# Plan\n\nFirst\n\nSecond', 'undo removes the template');

  // Without a caret in the editor the template is appended.
  await menu.selectOption({ label: '1:1' });
  await waitForSave(page, b => /^# Plan\n\nFirst\n\nSecond\n\n# 1:1\n/.test(String(b.notes ?? '')), 'appended');
});

test('P2-Q13b: a new Timeline offers Timeline starter templates with dates from today', async ({ page }) => {
  await seed(
    page,
    `return {...m.newBoard(),title:'Plan',items:[{...m.createItem('timeline',0,0,'#ffffff'),id:'t',w:1100,h:480,
      text:'Timeline',datasetId:'d'}],
      datasets:{d:[{id:'r1',title:'First task',status:'Not started',assignee:'',start:'',end:''}]}};`,
  );
  await fit(page);
  const picker = item(page, 't').getByRole('combobox', { name: 'Start from a template' });
  await expect(picker.locator('option')).toHaveText([
    'Templates…',
    'Project roadmap',
    'Release plan',
    'Event schedule',
  ]);
  await picker.selectOption({ label: 'Release plan' });
  await waitForSave(
    page,
    b => (b.recordSchemas as any)?.d?.statuses?.join() === 'To do,In progress,Done',
    'release plan applied',
  );
  const board = await savedBoard(page);
  const d = new Date(),
    today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  expect(board.items[0].text).toBe('Release plan');
  expect(board.items[0].recordView.timeline.scale).toBe('weeks');
  expect(board.datasets!.d[0].start).toBe(today);
  expect(board.datasets!.d.some((r: any) => r.dependsOn?.length)).toBe(true);
  await expect(item(page, 't').locator('.timeline-flag')).toHaveText('Go / no-go');
  await expect(item(page, 't').locator('[data-bar-warning]')).toHaveCount(0);
  await expect(picker).toHaveCount(0);
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Control+Z');
  await waitForSave(page, b => !b.recordSchemas, 'undo restores the starter record');
  await expect(item(page, 't').getByRole('combobox', { name: 'Start from a template' })).toBeVisible();
});
