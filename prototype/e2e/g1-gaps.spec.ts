// Gaps D14 (code block text size and line numbers), I3 (status chips on record views), R6a-Q1 (clear
// formatting) and F8/Q2 (reduce motion pauses animated GIFs).
import { readFileSync } from 'node:fs';
import { test, expect, seed, waitForSave, savedBoard, item, fit } from './helpers';
import type { Locator, Page } from '@playwright/test';

async function selectText(root: Locator, text: string) {
  await root.evaluate((el, t) => {
    // The text may run across several nodes (styled runs): map offsets in the joined text back to nodes.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT),
      nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    const all = nodes.map(n => n.data).join(''),
      at = all.indexOf(t);
    if (at < 0) throw new Error(`Text not found: ${t}`);
    const point = (offset: number, end: boolean): [Text, number] => {
      let base = 0;
      for (const n of nodes) {
        if (offset < base + n.length || (end && offset === base + n.length)) return [n, offset - base];
        base += n.length;
      }
      const last = nodes[nodes.length - 1];
      return [last, last.length];
    };
    const range = document.createRange();
    range.setStart(...point(at, false));
    range.setEnd(...point(at + t.length, true));
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }, text);
}
async function exportSvg(page: Page) {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.dropdown button', { hasText: 'Export as SVG' }).click(),
  ]);
  return readFileSync((await download.path())!, 'utf8');
}
const action = (page: Page, label: string) => page.locator('.selection-bar .widget-action', { hasText: label });

test('code block: line numbers stay level with wrapped lines, are not copied, and size and numbers persist', async ({
  page,
}) => {
  await seed(
    page,
    `const c = { ...m.createItem('code', 100, 100), id: 'c', w: 360, h: 300, language: 'javascript',
       text: 'const a = 1;\\n// ' + 'long comment '.repeat(8) + '\\nconst b = 2;' };
     return { ...m.newBoard(), title: 'Code', items: [c] };`,
  );
  await fit(page);
  const code = item(page, 'c');
  const lines = code.locator('.code-line');
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(2)).toHaveAttribute('data-line', '3');
  // The wrapped second line is taller than one line, and the third line's number sits level with it.
  const metrics = await lines.evaluateAll(els =>
    els.map(el => ({
      height: el.getBoundingClientRect().height,
      top: el.getBoundingClientRect().top,
      number: getComputedStyle(el, '::before').content,
      numberSelect: getComputedStyle(el, '::before').userSelect,
    })),
  );
  expect(metrics[1].height).toBeGreaterThan(metrics[0].height * 1.5);
  expect(metrics[2].top).toBeCloseTo(metrics[1].top + metrics[1].height, 0);
  expect(metrics.map(m => m.number)).toEqual(['"1"', '"2"', '"3"']);
  expect(metrics[0].numberSelect).toBe('none');
  // The numbers are not text: the rendered text (what a copy takes) holds only the code.
  const copied = await code.locator('.code-body').evaluate(el => (el as HTMLElement).innerText);
  expect(copied.startsWith('const a = 1;')).toBe(true);
  expect(copied).not.toMatch(/^\d/m);

  await code.click();
  await expect(action(page, 'Line numbers')).toHaveAttribute('aria-pressed', 'true');
  await action(page, 'Larger code text').click();
  await action(page, 'Larger code text').click();
  await waitForSave(page, b => b.items[0].data?.fontSize === 16, 'larger code text saved');
  await expect(code.locator('.code-body')).toHaveCSS('font-size', '16px');
  await action(page, 'Line numbers').click();
  await waitForSave(page, b => b.items[0].data?.lineNumbers === false, 'line numbers off saved');
  await expect(code.locator('.code-line[data-line]')).toHaveCount(0);
  await expect(code.locator('.code-body')).not.toHaveClass(/with-line-numbers/);
  // One undo step per change.
  await page.keyboard.press('Control+Z');
  await expect(code.locator('.code-line[data-line]')).toHaveCount(3);

  // The editor dialog offers both options too. Enter on a focused toolbar button presses that button, so move
  // focus to the board first; Enter there opens the selected object's editor.
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Edit code block' });
  await dialog.getByLabel('Code text size').selectOption('20');
  await dialog.getByLabel('Line numbers').uncheck();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await waitForSave(page, b => b.items[0].data?.fontSize === 20 && b.items[0].data?.lineNumbers === false, 'dialog');
  await page.keyboard.press('Control+Z');
  await waitForSave(page, b => b.items[0].data?.fontSize === 16 && b.items[0].data?.lineNumbers === undefined, 'undo');

  // Exports carry the size and the numbers (drawn from the embedded stylesheet).
  await page.keyboard.press('Escape');
  const svg = await exportSvg(page);
  expect(svg).toContain('data-line="2"');
  expect(svg).toContain('with-line-numbers');
  expect(svg).toMatch(/font-size: 16px/);
  expect(svg).toContain('.code-body.with-line-numbers .code-line::before');
});

test('record views: Table, Kanban and Timeline show a status chip set from the selection bar', async ({ page }) => {
  await seed(
    page,
    `const t = { ...m.createItem('table', 0, 0), id: 't', datasetId: 'd' };
     const k = { ...m.createItem('kanban', 0, 900), id: 'k', datasetId: 'd' };
     const l = { ...m.createItem('timeline', 0, 1800), id: 'l', datasetId: 'd' };
     return { ...m.newBoard(), title: 'Records', items: [t, k, l], datasets: { d: [
       { id: 'r1', title: 'Task', status: 'Not started', assignee: '', start: '2026-11-03', end: '2026-11-06' } ] } };`,
  );
  await fit(page);
  for (const [id, index] of [
    ['t', 0],
    ['k', 1],
    ['l', 2],
  ] as const) {
    const view = item(page, id);
    await expect(view.locator('.item-status-chip')).toHaveCount(0);
    await view.locator('.canvas-widget-header > span').first().click();
    await action(page, 'Status: None').click();
    await waitForSave(page, b => b.items[index].data?.status === 'draft', `${id} status saved`);
    await expect(view.locator('.canvas-widget-header .item-status-chip')).toHaveText('Draft');
    await action(page, 'Status: Draft').click();
    await expect(view.locator('.item-status-chip')).toHaveText('In progress');
    await waitForSave(page, b => b.items[index].data?.status === 'in-progress', `${id} second status saved`);
    await page.keyboard.press('Escape');
  }
  await page.reload();
  await expect(item(page, 'l').locator('.item-status-chip')).toHaveText('In progress');
  expect((await savedBoard(page)).items.map(i => i.data?.status)).toEqual([
    'in-progress',
    'in-progress',
    'in-progress',
  ]);
});

test('clear formatting: canvas text editor and Doc, by button and Ctrl+\\', async ({ page }) => {
  await seed(
    page,
    `const t = { ...m.createItem('text', 100, 100), id: 't', w: 520, h: 120, text: 'Hello brave world @Ada' };
     t.spans = [
       { start: 0, end: 5, bold: true, color: '#d92d20' },
       { start: 6, end: 11, italic: true, underline: true },
       { start: 12, end: 17, href: 'https://example.com/', strike: true },
       { start: 18, end: 22, mention: 'Ada', bold: true },
     ];
     t.spansFor = (await import('/src/rich-text.ts')).textHash(t.text);
     const d = { ...m.createItem('doc', 800, 100), id: 'doc', w: 640, h: 480, data: { markdown:
       'Plain **bold words** and *italic* and [a link](https://example.com/) and ==marked== @[Ada]' } };
     return { ...m.newBoard(), title: 'Clear', items: [t, d] };`,
  );
  await fit(page);
  await item(page, 't').dblclick();
  const editor = page.getByRole('textbox', { name: 'Edit object text' });
  await expect(editor).toBeFocused();
  // Selection: "brave world" loses its styles, but the link stays a link.
  await selectText(editor, 'brave world');
  await page
    .getByRole('toolbar', { name: 'Selected text formatting' })
    .getByRole('button', { name: 'Clear formatting' })
    .click();
  await expect(editor.locator('a[href="https://example.com/"]')).toHaveText('world');
  await expect(editor.locator('a[href="https://example.com/"]')).not.toHaveCSS('text-decoration-line', /line-through/);
  await expect(editor.locator('[data-rt]', { hasText: 'Hello' })).toHaveCSS('font-weight', '700');
  // No selection: Ctrl+\ clears the whole text; the mention stays a chip.
  await editor.evaluate(el => {
    const r = document.createRange();
    r.setStart(el.firstChild!, 0);
    r.collapse(true);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.keyboard.press('Control+Backslash');
  await editor.evaluate(el => (el as HTMLElement).blur());
  await waitForSave(page, b => !b.items[0].spans?.some((s: any) => s.bold || s.italic), 'canvas text cleared');
  expect((await savedBoard(page)).items[0].spans).toEqual([
    { start: 12, end: 17, href: 'https://example.com/' },
    { start: 18, end: 22, mention: 'Ada' },
  ]);

  // Doc: marks go from the selection only; links and mentions stay.
  const doc = item(page, 'doc');
  const content = doc.getByRole('textbox', { name: /^Document content/ });
  await content.focus();
  await selectText(content, 'words');
  await page.keyboard.press('Control+Backslash');
  await expect(content.locator('strong')).toHaveText('bold ');
  await selectText(content, 'Plain');
  await content.evaluate(el => {
    // Extend the selection to the end of the document.
    const sel = getSelection()!;
    sel.setBaseAndExtent(sel.anchorNode!, sel.anchorOffset, el, el.childNodes.length);
  });
  await doc.getByRole('button', { name: 'Clear formatting' }).click();
  await expect(content.locator('strong, em, mark')).toHaveCount(0);
  await expect(content.locator('a[href="https://example.com/"]')).toHaveText('a link');
  await expect(content.locator('.doc-mention')).toHaveText('@Ada');
  await content.evaluate(el => (el as HTMLElement).blur());
  await waitForSave(
    page,
    b =>
      b.items[1].data.markdown === 'Plain bold words and italic and [a link](https://example.com/) and marked @[Ada]',
    'doc cleared',
  );
});

/** An animated GIF: 2 frames of 1×1 on a 120×80 screen. */
function animatedGif(): Buffer {
  const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 120, 0, 80, 0, 0x81, 0, 0];
  const palette = [255, 0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0];
  const loop = [0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0];
  // Graphic control extension (100 ms delay), then the image descriptor: position, size, no local palette.
  const control = [0x21, 0xf9, 4, 0, 10, 0, 0, 0],
    descriptor = [0x2c, 0, 0, 0, 0, 120, 0, 80, 0, 0];
  const frame = (color: number) => [...control, ...descriptor, ...lzwSolid(120 * 80, color)];
  return Buffer.from([...header, ...palette, ...loop, ...frame(0), ...frame(1), 0x3b]);
}
/** LZW data for `count` pixels of one colour index, with a clear code before every pixel (min code size 2). */
function lzwSolid(count: number, color: number): number[] {
  const codes: number[] = [];
  for (let k = 0; k < count; k++) codes.push(4, color);
  codes.push(5);
  // Codes stay 3 bits wide because the table is cleared before it grows.
  const bytes: number[] = [];
  let acc = 0,
    bits = 0;
  for (const c of codes) {
    acc |= c << bits;
    bits += 3;
    while (bits >= 8) {
      bytes.push(acc & 0xff);
      acc >>= 8;
      bits -= 8;
    }
  }
  if (bits) bytes.push(acc & 0xff);
  const out = [2];
  for (let k = 0; k < bytes.length; k += 255) {
    const chunk = bytes.slice(k, k + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

test('reduce motion: an animated GIF shows a still frame with a play/pause button', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, `return { ...m.newBoard(), title: 'GIF', items: [] };`);
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'spin.gif', { type: 'image/gif' }));
    document
      .querySelector('svg.canvas')!
      .dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, clientX: 700, clientY: 400, dataTransfer: dt }),
      );
  }, animatedGif().toString('base64'));
  await waitForSave(page, b => b.items.some((i: any) => i.type === 'image'), 'gif added');
  const id = (await savedBoard(page)).items[0].id as string;
  const picture = item(page, id).locator('svg image');
  // The still frame is a PNG data URL drawn once from the GIF.
  await expect(picture).toHaveAttribute('href', /^data:image\/png;base64,/);
  const play = item(page, id).getByRole('button', { name: 'Play animation' });
  await expect(play).toBeVisible();
  // Exports use what is on screen: the still frame, without the button.
  const svg = await exportSvg(page);
  expect(svg).toContain('data:image/png;base64,');
  expect(svg).not.toContain('class="gif-toggle"');
  expect(svg).not.toContain('data:image/gif');

  await play.click();
  await expect(picture).toHaveAttribute('href', /^data:image\/gif;base64,/);
  const pause = item(page, id).getByRole('button', { name: 'Pause animation' });
  await expect(pause).toHaveAttribute('aria-pressed', 'true');
  await pause.click();
  await expect(picture).toHaveAttribute('href', /^data:image\/png;base64,/);

  // With reduce motion off, the GIF plays and there is no button.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.documentElement.classList.remove('reduce-motion'));
  await expect(picture).toHaveAttribute('href', /^data:image\/gif;base64,/);
  await expect(item(page, id).locator('.gif-toggle')).toHaveCount(0);
});
