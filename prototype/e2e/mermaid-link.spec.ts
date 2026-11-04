// Diagrams converted from Mermaid stay linked to their code: edit the code and the shapes follow (moved shapes
// stay put), rename a shape and the code follows, undo, reload and unlink.
import { test, expect, seed, waitForSave, savedBoard, item, fit, center, mouseDrag, type BoardJson } from './helpers';

const node = (b: BoardJson, key: string) => b.items.find(i => i.mermaidNode?.id === key);
const linkFrame = (b: BoardJson) => b.items.find(i => i.type === 'frame' && i.data?.mermaid);

test('a converted flowchart stays linked to its code in both directions', async ({ page }) => {
  await seed(
    page,
    `const d = { ...m.createItem('mermaid', 0, 0), id: 'mm', text: 'flowchart LR\\n  A[Start] --> B[Review]\\n  B --> C[Ship]' };
     return { version: 1, title: 'Linked', items: [d] };`,
  );
  await fit(page);
  await expect(item(page, 'mm').locator('.mermaid-preview svg')).toBeVisible({ timeout: 20_000 });
  await item(page, 'mm').dblclick();
  await page.getByRole('button', { name: /Convert to shapes/ }).click();
  await waitForSave(page, b => !!linkFrame(b) && !!node(b, 'C'), 'converted and linked');
  const converted = await savedBoard(page),
    frame = linkFrame(converted);
  expect(frame.data.mermaid.code).toContain('B --> C[Ship]');
  const badge = page.locator(`[data-item="${frame.id}"] [data-mermaid-badge]`);
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'synced');
  await expect(badge).toContainText('Mermaid · linked');

  // Move one shape a little (it stays inside the frame).
  const a = node(converted, 'A');
  await page.keyboard.press('Escape');
  const p = await center(item(page, a.id));
  await mouseDrag(page, p, { x: p.x - 22, y: p.y + 16 });
  await waitForSave(page, b => node(b, 'A').x !== a.x, 'moved');
  const moved = node(await savedBoard(page), 'A');
  expect(moved.mermaidNode.frame).toBe(frame.id);

  // Edit the code in the side panel: a new node appears, the moved one keeps its place.
  await badge.click();
  const panel = page.getByRole('complementary', { name: 'Linked Mermaid code' });
  await expect(panel).toBeVisible();
  const code = panel.getByRole('textbox', { name: 'Mermaid code' });
  await code.fill('flowchart LR\n  A[Start] --> B[Review]\n  B --> C[Ship]\n  C --> D[Celebrate]');
  await expect(panel.getByText('Code changed', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Apply to shapes' }).click();
  await waitForSave(page, b => !!node(b, 'D'), 'new node from code');
  let b = await savedBoard(page);
  expect([node(b, 'A').id, node(b, 'A').x, node(b, 'A').y]).toEqual([moved.id, moved.x, moved.y]);
  expect(node(b, 'D').text).toBe('Celebrate');
  expect(b.items.filter(i => i.type === 'arrow').length).toBe(3);
  await expect(panel.getByText('Code and shapes are in sync.')).toBeVisible();

  // Rename a shape on the canvas while the panel is open: the code follows.
  await item(page, node(b, 'B').id).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Peer review');
  await page.keyboard.press('Escape');
  await waitForSave(page, x => linkFrame(x).data.mermaid.code.includes('B[Peer review]'), 'code from shapes');
  await expect(code).toHaveValue(/B\[Peer review\]/);
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'synced');

  // Undo restores the label and the code together.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await waitForSave(
    page,
    x => node(x, 'B').text === 'Review' && linkFrame(x).data.mermaid.code.includes('B[Review]'),
    'undo',
  );

  // The link survives a reload.
  await page.reload();
  await expect(page.locator('svg.canvas')).toBeVisible();
  await fit(page);
  b = await savedBoard(page);
  expect(linkFrame(b).data.mermaid.code).toContain('D[Celebrate]');
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'synced');

  // Unlink keeps the shapes and drops the code.
  await badge.click();
  await panel.getByRole('button', { name: 'Unlink' }).click();
  await waitForSave(page, x => !linkFrame(x) && x.items.every(i => !i.mermaidNode), 'unlinked');
  expect((await savedBoard(page)).items.length).toBe(b.items.length);
  await expect(badge).toHaveCount(0);
});

test('when both sides changed, the panel asks which one to keep', async ({ page }) => {
  await seed(
    page,
    `const d = { ...m.createItem('mermaid', 0, 0), id: 'mm', text: 'flowchart TB\\n  A[One] --> B[Two]' };
     return { version: 1, title: 'Both', items: [d] };`,
  );
  await fit(page);
  await expect(item(page, 'mm').locator('.mermaid-preview svg')).toBeVisible({ timeout: 20_000 });
  await item(page, 'mm').dblclick();
  await page.getByRole('button', { name: /Convert to shapes/ }).click();
  await waitForSave(page, b => !!linkFrame(b), 'converted');
  const b = await savedBoard(page),
    frame = linkFrame(b);
  // Enter on the selected frame opens edit mode.
  await page.locator('svg.canvas').focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: 'Linked Mermaid code' });
  const code = panel.getByRole('textbox', { name: 'Mermaid code' });
  await code.fill('flowchart TB\n  A[One] --> B[Two]\n  B --> C[Three]');
  // Close with unapplied code: the frame shows it.
  await panel.getByRole('button', { name: 'Close code panel' }).click();
  const badge = page.locator(`[data-item="${frame.id}"] [data-mermaid-badge]`);
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'code');
  // Now edit a shape too.
  await item(page, node(b, 'A').id).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Uno');
  await page.keyboard.press('Escape');
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'both');
  await badge.click();
  await expect(panel.getByText(/Both sides changed/)).toBeVisible();
  await panel.getByRole('button', { name: 'Rebuild shapes from code' }).click();
  await waitForSave(page, x => !!node(x, 'C') && node(x, 'A').text === 'One', 'code wins');
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'synced');
});
