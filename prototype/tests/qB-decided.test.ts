// Decided open questions: placed dots on paste and duplicate (P1-Q5), read-only board settings in comment-only
// mode (P2-Q11), the sensitivity label on the HTML export (P2-Q12) and the original file kept beside an Office
// conversion (P2-Q8).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createItem, newBoard, parseBoard } from '../src/model.ts';
import type { Board, Item } from '../src/model.ts';
import { copyPlacedDots, dotsLeft, dotsPlaced } from '../src/chip-rules.ts';
import { copySelection, pastePayload } from '../src/clipboard.ts';
import { duplicateItems } from '../src/arrange.ts';
import { duplicateLayer } from '../src/layers.ts';
import { modeRefusal, settingsLocked, settingsLockedNote, withBoardMode } from '../src/board-modes.ts';
import { withSetting } from '../src/board-settings.ts';
import { standaloneHtml } from '../src/html-export.ts';
import { besideConversion, keepsOriginalFile, ORIGINAL_FILE_GAP } from '../src/specs-file.ts';

const make = (type: Parameters<typeof createItem>[0], id: string, extra: Partial<Item> = {}): Item => ({
  ...createItem(type, 0, 0),
  id,
  ...extra,
});
const board = (items: Item[], extra: Partial<Board> = {}): Board => ({ ...newBoard(), items, ...extra });
const pile = (id: string, total = 5) => make('dotpile', id, { data: { title: 'Votes', total, color: '#e8445a' } });
/** A note holding 2 dots from pile `a` and 1 from pile `b`. */
const voted = () =>
  make('note', 'n', {
    x: 300,
    dots: [
      { pile: 'a', color: '#e8445a', n: 2 },
      { pile: 'b', color: '#2d9bf0', n: 1 },
    ],
  });

// ---- P1-Q5: placed dots on copies ----------------------------------------------------------------
test('P1-Q5 copyPlacedDots drops dots unless their pile is copied, which it remaps', () => {
  const n = voted();
  assert.equal(copyPlacedDots(n, new Map([['n', 'n2']])).dots, undefined);
  assert.deepEqual(
    copyPlacedDots(
      n,
      new Map([
        ['n', 'n2'],
        ['b', 'b2'],
      ]),
    ).dots,
    [{ pile: 'b2', color: '#2d9bf0', n: 1 }],
  );
  const plain = make('note', 'p');
  assert.equal(copyPlacedDots(plain, new Map()), plain, 'objects without dots are returned as they are');
  assert.equal(n.dots!.length, 2, 'the original is not changed');
});

test('P1-Q5 paste drops placed dots; a pasted pile keeps its own and counts stay right', () => {
  const b = board([pile('a'), pile('b'), voted()]);
  // Only the voted object: its dots stay behind, the piles keep their counts.
  let payload = copySelection(b, ['n'])!;
  let r = pastePayload(b, payload, { x: 0, y: 1000 });
  let copy = r.board.items.find(i => i.id === r.ids[0])!;
  assert.equal(copy.dots, undefined);
  assert.equal(
    dotsLeft(
      r.board,
      r.board.items.find(i => i.id === 'a')!,
    ),
    3,
  );
  assert.doesNotThrow(() => parseBoard(r.board));
  // The object and pile a: the copy holds dots from the copied pile only.
  payload = copySelection(b, ['n', 'a'])!;
  r = pastePayload(b, payload, { x: 0, y: 1000 });
  const pasted = r.ids.map(id => r.board.items.find(i => i.id === id)!);
  const newPile = pasted.find(i => i.type === 'dotpile')!;
  copy = pasted.find(i => i.type === 'note')!;
  assert.deepEqual(copy.dots, [{ pile: newPile.id, color: '#e8445a', n: 2 }]);
  assert.equal(dotsLeft(r.board, newPile), 3, 'the pasted pile counts the dots on the pasted object');
  assert.equal(dotsPlaced(r.board, 'a'), 2, 'the original pile is unchanged');
  assert.equal(dotsPlaced(r.board, 'b'), 1);
  assert.doesNotThrow(() => parseBoard(r.board));
});

test('P1-Q5 duplicate and layer duplicate follow the same rule', () => {
  const b = board([pile('a'), pile('b'), voted()]);
  let r = duplicateItems(b, ['n']);
  assert.equal(r.board.items.find(i => i.id === r.ids[0])!.dots, undefined);
  assert.equal(dotsPlaced(r.board, 'a'), 2);
  r = duplicateItems(b, ['n', 'b']);
  const copies = r.ids.map(id => r.board.items.find(i => i.id === id)!);
  const pileCopy = copies.find(i => i.type === 'dotpile')!;
  assert.deepEqual(copies.find(i => i.type === 'note')!.dots, [{ pile: pileCopy.id, color: '#2d9bf0', n: 1 }]);
  assert.equal(dotsLeft(r.board, pileCopy), 4);
  // Every object sits on the base layer, so a layer copy takes both piles along.
  let k = 0;
  const layered = duplicateLayer(b, 'base', 'copy', () => `id${k++}`);
  const noteCopy = layered.board.items.find(i => i.type === 'note' && i.id !== 'n')!;
  assert.deepEqual(
    noteCopy.dots!.map(d => d.pile).sort(),
    layered.board.items
      .filter(i => i.type === 'dotpile' && !['a', 'b'].includes(i.id))
      .map(i => i.id)
      .sort(),
  );
});

// ---- P2-Q11: board settings in comment-only mode ----------------------------------------------------
test('P2-Q11 board settings are locked on comment-only and view-only boards', () => {
  const b = board([]);
  assert.equal(settingsLocked(b), false);
  const comment = withBoardMode(b, 'comment');
  assert.equal(settingsLocked(comment), true);
  assert.match(settingsLockedNote(comment), /comment-only/);
  const view = withBoardMode(b, 'view');
  assert.equal(settingsLocked(view), true);
  assert.match(settingsLockedNote(view), /view-only/);
  // The update guard refuses status and sensitivity changes too.
  assert.ok(modeRefusal(comment, withSetting(comment, 'status', 'draft' as never)));
  assert.ok(modeRefusal(comment, withSetting(comment, 'sensitivity', { level: 'confidential' } as never)));
  assert.equal(modeRefusal(comment, withBoardMode(comment, 'edit')), null, 'turning the mode off still works');
});

// ---- P2-Q12: sensitivity on the HTML export -----------------------------------------------------------
test('P2-Q12 the standalone HTML page shows the sensitivity label', () => {
  const svg = '<svg width="10" height="10"></svg>',
    at = new Date('2026-11-05T00:00:00Z');
  const none = standaloneHtml(svg, 'Plan', at, []);
  assert.doesNotMatch(none, /class="sensitivity-badge"|class="sensitivity-page-stamp"/);
  const html = standaloneHtml(svg, 'Plan', at, [], { level: 'custom', label: 'Board <only> & co', color: '#123456' });
  assert.match(
    html,
    /<span class="sensitivity-badge" style="background:#123456;color:#ffffff"[^>]*>Board &lt;only&gt; &amp; co</,
  );
  assert.match(
    html,
    /<div class="sensitivity-page-stamp" style="background:#123456;color:#ffffff" aria-hidden="true">/,
  );
  assert.doesNotMatch(html, /<only>/);
  // Invalid stored values are ignored rather than written into the page.
  const bad = standaloneHtml(svg, 'Plan', at, [], { level: 'custom', label: 'x', color: 'red;}' });
  assert.doesNotMatch(bad, /class="sensitivity-badge"/);
});

// ---- P2-Q8: the original file beside a conversion --------------------------------------------------
test('P2-Q8 Office and OpenDocument conversions keep the original beside them', () => {
  for (const name of ['Plan.docx', 'notes.ODT', 'memo.rtf', 'deck.pptx', 'talk.odp'])
    assert.ok(keepsOriginalFile(name), name);
  for (const name of ['readme.md', 'data.csv', 'sheet.xlsx', 'docx', 'a.docx.zip'])
    assert.equal(keepsOriginalFile(name), false, name);
  const doc = { x: 100, y: 50, w: 480, h: 600 };
  const placed = besideConversion(doc, { id: 'f', x: 0, y: 0, w: 300, h: 84 });
  assert.deepEqual(placed, { id: 'f', x: 100 + 480 + ORIGINAL_FILE_GAP, y: 50, w: 300, h: 84 });
});
