import { test, expect, seed, fit, axeViolations } from './helpers';
import type { Page } from '@playwright/test';

const widgetKinds = [
  'card',
  'flipcard',
  'grid',
  'divider',
  'stamp',
  'icon',
  'qr',
  'bookmark',
  'embed',
  'doc',
  'orgchart',
  'storymap',
  'screen',
  'autolayout',
  'matrix',
  'poll',
  'spinner',
  'scale',
  'journey',
  'planner',
  'wordcloud',
  'ranking',
  'quiz',
  'chart',
  'swimlane',
];

async function seedEverything(page: Page) {
  await seed(
    page,
    `const kinds = ${JSON.stringify(widgetKinds)};
     const items = kinds.map((k, i) => ({ ...m.createItem(k, (i % 6) * 900, Math.floor(i / 6) * 800), id: 'w-' + k }));
     items.push({ ...m.createItem('note', -600, 0), id: 'note', text: 'A note' });
     items.push({ ...m.createItem('kanban', -1400, 0), id: 'kan', datasetId: 'd1' });
     return { version: 1, title: 'Everything', items, datasets: { d1: [{ id: 'r1', title: 'Task', status: 'Not started', assignee: '', start: '', end: '', points: 2 }] } };`,
  );
  await fit(page);
}
// No rules are excluded; add an id here only with a tracked reason.
const KNOWN = new Set<string>();
function expectClean(violations: { id: string }[], where: string) {
  expect(
    violations.filter(v => !KNOWN.has(v.id)),
    `axe violations: ${where}`,
  ).toEqual([]);
}

test.describe('accessibility (axe)', () => {
  test('canvas with every widget kind, menus and facilitation panels', async ({ page }) => {
    await seedEverything(page);
    expectClean(await axeViolations(page), 'canvas');

    await page.getByRole('button', { name: 'Tools, media and integrations' }).click();
    expectClean(await axeViolations(page), 'tools gallery');
    await page.getByRole('button', { name: 'Close tools' }).click();

    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    expectClean(await axeViolations(page), 'layers');
    await page.getByRole('button', { name: 'Close layers' }).click();

    for (const [entry, close] of [
      ['Dot voting', 'Close dot voting'],
      ['Comments', 'Close comments'],
      ['Templates', 'Close templates'],
      ['Accessibility check', 'Close accessibility check'],
    ]) {
      await page.getByRole('button', { name: 'Collaborate and review' }).click();
      await page.locator('.facilitate-menu button', { hasText: entry }).click();
      expectClean(await axeViolations(page), entry);
      await page.getByRole('button', { name: close }).click();
    }
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    expectClean(await axeViolations(page), 'export menu');
  });

  test('every widget editor', async ({ page }) => {
    test.setTimeout(120_000);
    await seedEverything(page);
    const scanned: string[] = [],
      escapeStuck: string[] = [];
    for (const kind of widgetKinds) {
      await page.getByRole('button', { name: 'Layers', exact: true }).click();
      await page
        .locator('.layer-row')
        .filter({ has: page.locator(`.layer-name small:text-matches("^${kind}", "i")`) })
        .first()
        .locator('.layer-name')
        .click();
      await page.getByRole('button', { name: 'Close layers' }).click();
      // Cards open their panel from the card bar instead of an Edit button (item 115).
      const edit = page
        .locator('.selection-bar .widget-action', { hasText: /^Edit$/ })
        .or(page.locator('.selection-bar').getByRole('button', { name: 'Open card panel' }));
      if (!(await edit.count())) continue;
      await edit.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expectClean(await axeViolations(page), `${kind} editor`);
      scanned.push(kind);
      // Live editors focus a text field first; Esc there reverts the field and blurs it, after which a
      // second Esc no longer reaches the dialog (reported finding). Fall back to the Close button.
      await page.keyboard.press('Escape');
      if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
      if (await page.getByRole('dialog').count()) {
        escapeStuck.push(kind);
        await page
          .getByRole('dialog')
          .getByRole('button', { name: /^(Close|Cancel)/ })
          .first()
          .click();
      }
      await expect(page.getByRole('dialog'), `${kind} editor closes`).toHaveCount(0);
    }
    test.info().annotations.push({ type: 'editors scanned', description: scanned.join(', ') });
    if (escapeStuck.length)
      test
        .info()
        .annotations.push({ type: 'Esc does not close (focus leaves dialog)', description: escapeStuck.join(', ') });
    expect(scanned.length).toBeGreaterThanOrEqual(15);
  });

  test('Kanban column titles keep the heading order valid', async ({ page }) => {
    await seedEverything(page);
    const violations = await axeViolations(page);
    expect(violations.filter((v: { id: string }) => v.id === 'heading-order')).toEqual([]);
  });
});
