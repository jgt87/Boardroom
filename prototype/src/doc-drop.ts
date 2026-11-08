// Board objects dragged onto an open Doc (R4-Q4): find the Doc under the pointer and the block boundary nearest
// to it. DOM only (no React); the board change itself is `dropIntoDoc` in doc-rich.ts.
import type { DocDrop } from './doc-rich.ts';

/**
 * The Doc under the pointer (from `document.elementsFromPoint`) and where a drop would insert: before the first
 * top-level block whose middle is below the pointer. `lineY` is the screen y of that boundary, for the drop line.
 */
export function docDropAt(elements: Element[], clientY: number): (DocDrop & { lineY: number }) | null {
  for (const el of elements) {
    const body = el.closest<HTMLElement>('[data-doc-drop]');
    if (!body?.dataset.docDrop) continue;
    const editor = body.querySelector<HTMLElement>('.canvas-doc');
    if (!editor) return null;
    const blocks = Array.from(editor.children).map(b => b.getBoundingClientRect());
    let index = blocks.findIndex(r => r.top + r.height / 2 > clientY);
    if (index < 0) index = blocks.length;
    const box = editor.getBoundingClientRect(),
      lineY = blocks.length
        ? index < blocks.length
          ? blocks[index].top - 2
          : blocks[blocks.length - 1].bottom + 2
        : box.top + 8;
    return { targetId: body.dataset.docDrop, index, lineY: Math.max(box.top, Math.min(box.bottom, lineY)) };
  }
  return null;
}
