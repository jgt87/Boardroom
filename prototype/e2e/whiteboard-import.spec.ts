// Whiteboard JSON (REST export) import: the upload menu, the regular board import and a dropped file each
// open the export as a new library board and report what was skipped.
import { test, expect, seed, savedBoard, openTools, type BoardJson } from './helpers';
import type { Page } from '@playwright/test';

const INDEX_KEY = 'boardroom.boards.v1';
const at = (x: number, y: number, relative = false) => ({
  x,
  y,
  origin: 'center',
  relativeTo: relative ? 'parent_top_left' : 'canvas_center',
});
const EXPORT = {
  format: 'whiteboard-rest-v2',
  board: { id: 'b1', name: 'Imported sprint', description: '' },
  items: [
    { id: 'f', type: 'frame', data: { title: 'Week 1' }, position: at(0, 0), geometry: { width: 800, height: 600 } },
    {
      id: 'n',
      type: 'sticky_note',
      data: { content: '<p>Plan <strong>it</strong></p>' },
      style: { fillColor: 'cyan' },
      position: at(150, 150, true),
      geometry: { width: 200, height: 200 },
      parent: { id: 'f' },
    },
    {
      id: 's',
      type: 'shape',
      data: { content: 'Go?', shape: 'rhombus' },
      style: { fillColor: '#fff9b1' },
      position: at(200, 0),
      geometry: { width: 160, height: 120 },
    },
    { id: 'm1', type: 'mindmap_node', data: {}, position: at(0, 0) },
    { id: 'm2', type: 'mindmap_node', data: {}, position: at(0, 0) },
  ],
  connectors: [{ id: 'c', shape: 'elbowed', startItem: { id: 'n' }, endItem: { id: 's' } }],
  exportedAt: '2026-11-05T10:00:00Z',
};
const file = () => ({
  name: 'sprint.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(EXPORT)),
});

async function expectImported(page: Page) {
  await expect
    .poll(async () => {
      const b = await savedBoard(page);
      return b?.title === 'Imported sprint' ? b.items.map(i => i.type).join(',') : '';
    })
    .toBe('frame,note,diamond,arrow');
  const board: BoardJson = await savedBoard(page);
  const [frame, note, diamond, arrow] = board.items;
  expect(frame.text).toBe('Week 1');
  // Note centre (150, 150) from the frame's top-left (-400, -300).
  expect([note.x, note.y]).toEqual([-350, -250]);
  expect(note.text).toBe('Plan it');
  expect(note.fill).toBe('#8ce3eb');
  expect([arrow.from, arrow.to]).toEqual([note.id, diamond.id]);
  expect(arrow.connector.path).toBe('elbow');
  await expect(page.getByRole('status').filter({ hasText: 'as a new board' })).toContainText(
    'Skipped 2 mind map nodes',
  );
  // The board it was imported from is still in the library.
  const titles = await page.evaluate(
    k => JSON.parse(localStorage.getItem(k)!).boards.map((b: { title: string }) => b.title),
    INDEX_KEY,
  );
  expect(titles).toEqual(expect.arrayContaining(['Imported sprint', 'Before']));
}

test('Whiteboard JSON (REST export) from the upload menu opens a new board', async ({ page }) => {
  await seed(page, `return {version:1,title:'Before',items:[m.createItem('note',0,0)]};`);
  await openTools(page, 'Media');
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Upload/ })
    .click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .locator('.gallery-items')
      .getByRole('button', { name: /^Whiteboard JSON \(REST export\)/ })
      .click(),
  ]);
  await chooser.setFiles(file());
  await expectImported(page);
});

test('the regular board import detects a REST export and opens it as a new board', async ({ page }) => {
  await seed(page, `return {version:1,title:'Before',items:[m.createItem('note',0,0)]};`);
  await page
    .locator('input[type=file][accept=".json,application/json,.boardroom,application/zip"]')
    .first()
    .setInputFiles(file());
  await expectImported(page);
});

test('a dropped REST export opens as a new board; other JSON is kept as a file', async ({ page }) => {
  await seed(page, `return {version:1,title:'Before',items:[m.createItem('note',0,0)]};`);
  await page.locator('svg.canvas').dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle(
      text => {
        const d = new DataTransfer();
        d.items.add(new File([text], 'other.json', { type: 'application/json' }));
        return d;
      },
      JSON.stringify({ hello: 'world' }),
    ),
  });
  await expect.poll(async () => (await savedBoard(page)).items.map(i => i.type).join(',')).toBe('note,file');
  await page.locator('svg.canvas').dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle(text => {
      const d = new DataTransfer();
      d.items.add(new File([text], 'sprint.json', { type: 'application/json' }));
      return d;
    }, JSON.stringify(EXPORT)),
  });
  await expectImported(page);
});

test('a JSON file that is not an export is reported from the upload menu', async ({ page }) => {
  await seed(page, `return {version:1,title:'Before',items:[]};`);
  await openTools(page, 'Media');
  await page
    .locator('.gallery-items')
    .getByRole('button', { name: /^Upload/ })
    .click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page
      .locator('.gallery-items')
      .getByRole('button', { name: /^Whiteboard JSON \(REST export\)/ })
      .click(),
  ]);
  await chooser.setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(page.getByRole('status')).toContainText('not a whiteboard JSON export');
  expect((await savedBoard(page)).title).toBe('Before');
});
