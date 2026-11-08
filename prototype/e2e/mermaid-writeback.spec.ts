// Converted sequence and state diagrams write canvas edits back into their Mermaid code (decision R6c-Q2): a
// renamed participant or state updates its declaration, and dragging a message line below another reorders them.
import { test, expect, seed, waitForSave, savedBoard, item, fit, center, mouseDrag, type BoardJson } from './helpers';

const node = (b: BoardJson, key: string) => b.items.find(i => i.mermaidNode?.id === key);
const linkFrame = (b: BoardJson) => b.items.find(i => i.type === 'frame' && i.data?.mermaid);
const codeOf = (b: BoardJson) => linkFrame(b).data.mermaid.code as string;
const seedLinked = (code: string) =>
  `const ml = await import('/src/mermaid-link.ts');
   const r = ml.convertToLinked(${JSON.stringify(code)}, { x: 0, y: 0 });
   return { version: 1, title: 'Linked', items: r.items };`;

test('a converted sequence diagram rewrites its code when participants are renamed and messages move', async ({
  page,
}) => {
  await seed(page, seedLinked('sequenceDiagram\n  Alice->>Bob: Hi\n  Bob-->>Alice: Hello\n  Alice->>Bob: Bye'));
  await fit(page);
  const before = await savedBoard(page),
    frame = linkFrame(before);
  const badge = page.locator(`[data-item="${frame.id}"] [data-mermaid-badge]`);
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'synced');

  // Rename a participant on the canvas: a declaration with the new name appears.
  await item(page, node(before, 'p:Alice').id).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Alicia');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => codeOf(b).includes('participant Alice as Alicia'), 'participant renamed in code');
  expect(codeOf(await savedBoard(page))).toBe(
    'sequenceDiagram\n  participant Alice as Alicia\n  participant Bob\n  Alice->>Bob: Hi\n  Bob-->>Alice: Hello\n  Alice->>Bob: Bye',
  );
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'synced');

  // Drag the first message below the last one: the code lists it last.
  await page.keyboard.press('Escape');
  const hi = await center(item(page, node(before, 's:0').id)),
    hello = await center(item(page, node(before, 's:1').id)),
    bye = await center(item(page, node(before, 's:2').id));
  expect(hello.y).toBeGreaterThan(hi.y);
  await mouseDrag(page, hi, { x: hi.x, y: bye.y + (hello.y - hi.y) * 0.6 });
  await waitForSave(page, b => /Alice->>Bob: Bye\n {2}Alice->>Bob: Hi$/.test(codeOf(b)), 'messages reordered');
  const after = await savedBoard(page);
  expect(node(after, 's:2').id).toBe(node(before, 's:0').id);
  await expect(badge).toHaveAttribute('data-mermaid-badge', 'synced');

  // The edit panel says the sync is two-way and shows the new code.
  await page.keyboard.press('Escape');
  await badge.click();
  const panel = page.getByRole('complementary', { name: 'Linked Mermaid code' });
  await expect(panel.getByRole('textbox', { name: 'Mermaid code' })).toHaveValue(/Bye\n {2}Alice->>Bob: Hi$/);
  await expect(panel.getByText(/^Two-way: renaming participants/)).toBeVisible();
});

test('a converted state diagram rewrites its code when a state is renamed', async ({ page }) => {
  const code = 'stateDiagram-v2\n  %% keep me\n  [*] --> Idle\n  Idle --> Busy : start\n  Busy --> [*]';
  await seed(page, seedLinked(code));
  await fit(page);
  const before = await savedBoard(page);
  await item(page, node(before, 'Busy').id).dblclick();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Working hard');
  await page.keyboard.press('Escape');
  await waitForSave(page, b => codeOf(b).endsWith('\n  Busy : Working hard'), 'state renamed in code');
  expect(codeOf(await savedBoard(page))).toBe(code + '\n  Busy : Working hard');
  await expect(page.locator(`[data-item="${linkFrame(before).id}"] [data-mermaid-badge]`)).toHaveAttribute(
    'data-mermaid-badge',
    'synced',
  );
});
