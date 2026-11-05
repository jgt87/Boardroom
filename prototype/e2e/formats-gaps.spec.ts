// Formats and content gaps (B3, B15, I1–I6) in the browser: spreadsheet import into Tables, charts, Doc
// shortcuts, status chips, Doc PDF and Word import, template search and selection templates.
import { strToU8, zipSync } from 'fflate';
import { test, expect, seed, fit, item, savedBoard, waitForSave, axeViolations, selectViaLayers } from './helpers';

const CSV = 'Title,Status,Owner,Due,Points,Team\nDesign,In progress,Ana,2026-02-01,3,Web\nBuild,Blocked,Ben,,5,App\n';

test('Import CSV appends typed records to a Table and a dropped CSV becomes a new Table', async ({ page }) => {
  await seed(
    page,
    `return { ...m.newBoard(), title: 'Import', items: [{ ...m.createItem('table', 0, 0, '#ffffff'), id: 't', text: 'Backlog', datasetId: 'd', w: 900, h: 420 }],
      datasets: { d: [{ id: 'r1', title: 'Existing', status: 'Not started', assignee: '', start: '', end: '' }] } };`,
  );
  await fit(page);
  await item(page, 't')
    .locator('input[aria-label="Choose a CSV or Excel file to import"]')
    .setInputFiles({ name: 'tasks.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  await waitForSave(page, b => b.datasets?.d?.length === 3, 'rows appended');
  await expect(page.getByRole('status').filter({ hasText: 'Imported 2 records.' })).toBeVisible();
  const board = await savedBoard(page),
    schema = (board.recordSchemas as any).d;
  expect(schema.statuses).toContain('Blocked');
  expect(schema.fields.map((f: any) => [f.name, f.type])).toEqual([['Team', 'text']]);
  expect(board.datasets!.d[1]).toMatchObject({ title: 'Design', assignee: 'Ana', end: '2026-02-01', points: 3 });

  // A .csv file dropped on the canvas becomes its own Table.
  await page.locator('svg.canvas').dispatchEvent('drop', {
    clientX: 300,
    clientY: 700,
    dataTransfer: await page.evaluateHandle(text => {
      const d = new DataTransfer();
      d.items.add(new File([text], 'Q3 plan.csv', { type: 'text/csv' }));
      return d;
    }, CSV),
  });
  await waitForSave(page, b => b.items.length === 2, 'table from dropped file');
  const added = (await savedBoard(page)).items[1];
  expect(added).toMatchObject({ type: 'table', text: 'Q3 plan' });
  expect((await savedBoard(page)).datasets![added.datasetId].length).toBe(2);

  // Chart from a Table column.
  await item(page, 't').getByRole('combobox', { name: 'Create a chart from a column' }).selectOption('status');
  await waitForSave(page, b => b.items.some(i => i.type === 'chart'), 'chart from column');
  const chart = (await savedBoard(page)).items.find(i => i.type === 'chart')!;
  expect(chart.data.labels).toEqual(['Not started', 'In progress', 'Complete', 'Blocked']);
  expect(chart.data.series[0].values).toEqual([1, 1, 0, 1]);
});

test('Excel and Word files import from the Upload menu', async ({ page }) => {
  await seed(page, `return { ...m.newBoard(), title: 'Files', items: [] };`);
  const x = (s: string) => strToU8(`<?xml version="1.0"?>${s}`);
  const xlsx = zipSync({
    'xl/workbook.xml': x('<workbook><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': x(
      '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': x(
      '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Score</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Alpha</t></is></c><c r="B2"><v>7</v></c></row></sheetData></worksheet>',
    ),
  });
  await page.locator('input[aria-label="Choose a document to import"]').setInputFiles({
    name: 'scores.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(xlsx),
  });
  await waitForSave(page, b => b.items.length === 1 && b.items[0].type === 'table', 'xlsx table');
  const b1 = await savedBoard(page);
  expect(b1.datasets![b1.items[0].datasetId][0]).toMatchObject({ title: 'Alpha' });
  const docx = zipSync({
    'word/document.xml': x(
      '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Minutes</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Decided</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  await page.locator('input[aria-label="Choose a document to import"]').setInputFiles({
    name: 'minutes.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(docx),
  });
  // The original .docx is kept beside the Doc as a File object (P2-Q8).
  await waitForSave(page, b => b.items.length === 3 && b.items[2].type === 'file', 'docx doc');
  const doc = (await savedBoard(page)).items[1];
  expect(doc).toMatchObject({ type: 'doc', text: 'Minutes' });
  expect(doc.data.markdown).toBe('# Minutes\n\n- **Decided**');
});

test('Chart widget renders, edits through an accessible data grid and switches type', async ({ page }) => {
  await seed(
    page,
    `return { ...m.newBoard(), title: 'Charts', items: [{ ...m.createItem('chart', 0, 0), id: 'ch', text: 'Revenue' }] };`,
  );
  await fit(page);
  await expect(item(page, 'ch').locator('.chart-widget rect')).toHaveCount(1 + 8 + 2);
  await selectViaLayers(page, 'Revenue');
  await page.locator('.selection-bar .widget-action', { hasText: /^Edit$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Chart' });
  await expect(dialog).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await dialog.getByRole('textbox', { name: 'Plan, Q1 value' }).fill('40');
  await dialog.getByRole('button', { name: 'Add category' }).click();
  await dialog.getByRole('textbox', { name: 'Category 5 label' }).fill('Q5');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(
    page,
    b => b.items[0].data.labels.length === 5 && b.items[0].data.series[0].values[0] === 40,
    'edited',
  );
  await page.locator('.selection-bar .widget-action', { hasText: /^Bar chart/ }).click();
  await waitForSave(page, b => b.items[0].data.chart === 'line', 'line chart');
  await expect(item(page, 'ch').locator('polyline')).toHaveCount(2);
});

test('Doc shortcuts, status chip and PDF export', async ({ page }) => {
  await seed(
    page,
    `const d = m.createItem('doc', 0, 0, '#ffffff');
     return { ...m.newBoard(), title: 'Docs', items: [{ ...d, id: 'doc', text: 'Notes', data: { markdown: 'Alpha beta gamma\\n\\nSecond line' } }] };`,
  );
  await fit(page);
  const content = item(page, 'doc').locator('.canvas-doc');
  await content.getByText('Alpha beta gamma').click();
  const selectWord = (word: string) =>
    content.evaluate((el, word) => {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let text = walk.nextNode();
      while (text && !text.textContent!.includes(word)) text = walk.nextNode();
      if (!text) throw new Error(`no text "${word}"`);
      const at = text.textContent!.indexOf(word),
        range = document.createRange();
      range.setStart(text, at);
      range.setEnd(text, at + word.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    }, word);
  await selectWord('beta');
  await page.keyboard.press('Control+Shift+X');
  await expect(content.locator('strike, s, del')).toHaveText('beta');
  await selectWord('gamma');
  await page.keyboard.press('Control+E');
  await expect(content.locator('code')).toHaveText('gamma');
  await content.getByText('Second line').click();
  await page.keyboard.press('Control+Alt+Digit2');
  await content.evaluate(el => (el as HTMLElement).blur());
  await waitForSave(
    page,
    b => /^Alpha ~~beta~~\s`gamma`\n{2,}## Second line$/.test(b.items[0].data.markdown),
    'strikethrough, code and heading saved',
  );

  await selectViaLayers(page, 'Notes');
  await page.locator('.selection-bar .widget-action', { hasText: 'Status: None' }).click();
  await waitForSave(page, b => b.items[0].data.status === 'draft', 'status set');
  await expect(item(page, 'doc').locator('.item-status-chip')).toHaveText('Draft');

  const download = page.waitForEvent('download');
  await page.locator('.selection-bar .widget-action', { hasText: 'Export as PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Notes.pdf');
});

test('Template search, categories and saving a frame as a template', async ({ page }) => {
  await seed(
    page,
    `const f = { ...m.createItem('frame', 0, 0), id: 'f', text: 'Sprint board', w: 600, h: 400 };
     const a = { ...m.createItem('note', 40, 60), id: 'a', text: 'Inside' };
     return { ...m.newBoard(), title: 'Templates', items: [f, a, { ...m.createItem('note', 900, 0), id: 'out', text: 'Outside' }] };`,
  );
  await fit(page);
  await selectViaLayers(page, 'Sprint board');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('button', { name: /^Save selection as template/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved "Sprint board" (2 objects)' })).toBeVisible();

  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Templates' }).click();
  const panel = page.getByRole('complementary', { name: 'Templates' });
  await panel.getByRole('searchbox', { name: 'Search templates' }).fill('canvas');
  await expect(panel.getByRole('list', { name: 'Starter templates' }).getByRole('button')).toHaveCount(2);
  await expect(panel.getByRole('list', { name: 'My templates' })).toHaveCount(0);
  await panel.getByRole('searchbox', { name: 'Search templates' }).fill('');
  await panel.getByRole('button', { name: 'Research', exact: true }).click();
  await expect(panel.getByRole('list', { name: 'Starter templates' }).getByRole('button')).toHaveCount(1);
  expect(await axeViolations(page)).toEqual([]);
  await panel.getByRole('button', { name: /^Customer journey/ }).click();
  await waitForSave(page, b => b.items.some(i => i.type === 'frame' && i.text === 'Discover'), 'journey inserted');

  await page.getByRole('button', { name: 'Collaborate and review' }).click();
  await page.locator('.facilitate-menu button', { hasText: 'Templates' }).click();
  const count = (await savedBoard(page)).items.length;
  await page
    .getByRole('list', { name: 'My templates' })
    .getByRole('button', { name: /^Sprint board/ })
    .click();
  await waitForSave(page, b => b.items.length === count + 2, 'selection template inserted');
});
