// Track F: drag-and-drop chips. Estimate palette, dot pile and People avatars drop onto cards, sticky notes and
// other objects; each chip also applies to the selection when pressed.
import { test, expect, seed, fit, item, savedBoard, waitForSave } from './helpers';

test.describe('drag-and-drop chips (track F)', () => {
  test('estimate palette chips drop on cards and sticky notes, switch scale and apply to the selection', async ({
    page,
  }) => {
    await seed(
      page,
      `return { version: 1, title: 'Chips', items: [
         { ...m.createItem('estimates', 0, 0), id: 'pal' },
         { ...m.createItem('card', 0, 200), id: 'c', text: 'Card' },
         { ...m.createItem('note', 400, 200), id: 'n', text: 'Note' },
         { ...m.createItem('note', 700, 200), id: 'lk', text: 'Locked', locked: true },
       ] };`,
    );
    await fit(page);
    const palette = item(page, 'pal');
    await palette.getByRole('button', { name: 'Estimate 5', exact: true }).dragTo(item(page, 'n'));
    await waitForSave(page, b => b.items.find(i => i.id === 'n')?.estimate === '5', 'estimate on sticky');
    await expect(item(page, 'n').getByRole('img', { name: 'Estimate 5' })).toBeVisible();

    // Switch to T-shirt sizes and drop XXL on the card.
    await palette.getByRole('radio', { name: 'Sizes' }).click();
    await waitForSave(page, b => b.items[0].data?.scale === 'tshirt', 'scale switched');
    await palette.getByRole('button', { name: 'Estimate XXL' }).dragTo(item(page, 'c'), {
      targetPosition: { x: 16, y: 24 },
    });
    await waitForSave(page, b => b.items.find(i => i.id === 'c')?.data?.size === 'XXL', 'size on card');

    // A locked sticky refuses the chip.
    await palette.getByRole('button', { name: 'Estimate M', exact: true }).dragTo(item(page, 'lk'));
    await expect(page.getByText('That object is locked.')).toBeVisible();
    expect((await savedBoard(page)).items.find(i => i.id === 'lk')?.estimate).toBeUndefined();

    // Keyboard: select the card, then press a chip with Enter.
    await palette.getByRole('radio', { name: 'Points' }).click();
    await item(page, 'c').click({ position: { x: 16, y: 24 } });
    const chip = palette.getByRole('button', { name: 'Estimate 8', exact: true });
    await chip.focus();
    await page.keyboard.press('Enter');
    await waitForSave(page, b => b.items.find(i => i.id === 'c')?.data?.points === 8, 'points by keyboard');

    // The selected sticky shows a × that removes its estimate.
    await item(page, 'n').click({ position: { x: 20, y: 150 } });
    await item(page, 'n').getByRole('button', { name: 'Remove estimate' }).click();
    await waitForSave(page, b => b.items.find(i => i.id === 'n')?.estimate === undefined, 'estimate removed');
  });

  test('dots from a pile drop on any object, the pile counts down, and clicking a placed dot returns it', async ({
    page,
  }) => {
    await seed(
      page,
      `return { version: 1, title: 'Dots', items: [
         { ...m.createItem('dotpile', 0, 0), id: 'pile', data: { title: 'Votes', total: 2, color: '#4262ff' } },
         { ...m.createItem('note', 0, 220), id: 'n', text: 'Idea' },
         { ...m.createItem('rectangle', 360, 220), id: 'r', text: 'Box' },
       ] };`,
    );
    await fit(page);
    const pile = item(page, 'pile');
    await expect(pile.getByText('2 of 2 left')).toBeVisible();
    await pile
      .getByRole('button', { name: /Voting dot/ })
      .first()
      .dragTo(item(page, 'n'));
    await waitForSave(page, b => b.items.find(i => i.id === 'n')?.dots?.[0]?.n === 1, 'dot on note');
    await pile
      .getByRole('button', { name: /Voting dot/ })
      .first()
      .dragTo(item(page, 'r'));
    await waitForSave(page, b => b.items.find(i => i.id === 'r')?.dots?.[0]?.n === 1, 'dot on shape');
    await expect(pile.getByText('0 of 2 left')).toBeVisible();
    await expect(pile.getByRole('button', { name: /Voting dot/ })).toHaveCount(0);

    // Undo takes back one drop.
    await page.locator('svg.canvas').focus();
    await page.keyboard.press('Control+z');
    await waitForSave(page, b => !b.items.find(i => i.id === 'r')?.dots, 'undo one drop');
    await expect(pile.getByText('1 of 2 left')).toBeVisible();

    // Clicking the placed dot on the note returns it to the pile.
    await item(page, 'n')
      .getByRole('button', { name: /1 dot; click to return one/ })
      .click();
    await waitForSave(page, b => !b.items.find(i => i.id === 'n')?.dots, 'dot returned');
    await expect(pile.getByText('2 of 2 left')).toBeVisible();

    // Keyboard: select the shape, press a dot.
    await item(page, 'r').click();
    await pile
      .getByRole('button', { name: /Voting dot/ })
      .first()
      .focus();
    await page.keyboard.press('Enter');
    await waitForSave(page, b => b.items.find(i => i.id === 'r')?.dots?.[0]?.n === 1, 'dot by keyboard');
  });

  test('People avatars drop on cards and sticky notes to assign them', async ({ page }) => {
    await seed(
      page,
      `const people = { ...m.createItem('people', 0, 0), id: 'p' };
       people.data = { title: 'Team', members: [{ id: 'm1', name: 'Grace Hopper', color: '#4262ff' }] };
       return { version: 1, title: 'People', items: [
         people,
         { ...m.createItem('card', 0, 220), id: 'c', text: 'Card' },
         { ...m.createItem('note', 400, 220), id: 'n', text: 'Note' },
       ] };`,
    );
    await fit(page);
    const avatar = item(page, 'p').getByRole('button', { name: 'Assign Grace Hopper' });
    await avatar.dragTo(item(page, 'c'), { targetPosition: { x: 16, y: 24 } });
    await waitForSave(page, b => b.items.find(i => i.id === 'c')?.data?.assignee === 'Grace Hopper', 'card assigned');
    await avatar.dragTo(item(page, 'n'));
    await waitForSave(page, b => b.items.find(i => i.id === 'n')?.assignee === 'Grace Hopper', 'note assigned');
    await expect(item(page, 'n').getByRole('img', { name: 'Assigned to Grace Hopper' })).toBeVisible();

    // The People widget body is still selectable and draggable.
    const before = (await savedBoard(page)).items[0];
    const box = (await item(page, 'p').boundingBox())!;
    await page.mouse.move(box.x + box.width - 12, box.y + 14);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 40, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await waitForSave(page, b => b.items[0].x !== before.x, 'people widget moved');
  });
});
