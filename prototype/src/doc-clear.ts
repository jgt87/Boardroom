// "Clear formatting" for the Doc editor (R6a-Q1). DOM helper, no React: removes inline marks (bold, italic,
// underline, strike, code, highlight, colour) from a selection inside a contentEditable root. Links and
// mention chips are left alone. Marks that reach outside the selection are split first, so text just
// outside it keeps its formatting.

const markTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'STRIKE', 'CODE', 'MARK', 'FONT']);

const isMention = (el: Element) => el instanceof HTMLElement && el.dataset.mention !== undefined;
/** An inline formatting element that clearing removes (code inside a code block is the block itself). */
export function isInlineMark(el: Element): boolean {
  if (el.tagName === 'CODE') return el.parentElement?.tagName !== 'PRE';
  if (markTags.has(el.tagName)) return true;
  return el.tagName === 'SPAN' && !isMention(el) && !el.classList.contains('doc-image-alt');
}
/** Elements a boundary may be split through: marks, and links (a link split in two keeps its address). */
const splittable = (el: Element) => isInlineMark(el) || el.tagName === 'A';

/**
 * Move the boundary (node, offset) up out of every splittable ancestor below `root`, splitting them, and
 * return it as (parent, node after the boundary or null for the end).
 */
function splitUp(root: HTMLElement, node: Node, offset: number, side: 'start' | 'end'): [Node, Node | null] {
  // A boundary inside a mention chip moves outside it; chips are never split.
  const chip = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest('[data-mention]');
  if (chip && root.contains(chip)) {
    node = chip.parentNode!;
    offset = Array.prototype.indexOf.call(node.childNodes, chip) + (side === 'end' ? 1 : 0);
  }
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text,
      parent = text.parentNode!,
      index = Array.prototype.indexOf.call(parent.childNodes, text);
    if (offset <= 0) offset = index;
    else if (offset >= text.length) offset = index + 1;
    else {
      text.splitText(offset);
      offset = index + 1;
    }
    node = parent;
  }
  while (node !== root && node instanceof Element && splittable(node) && node.parentNode) {
    const el = node,
      parent = el.parentNode!,
      index = Array.prototype.indexOf.call(parent.childNodes, el);
    if (offset <= 0) offset = index;
    else if (offset >= el.childNodes.length) offset = index + 1;
    else {
      const right = el.cloneNode(false) as Element;
      right.append(...Array.from(el.childNodes).slice(offset));
      el.after(right);
      offset = index + 1;
    }
    node = parent;
  }
  return [node, node.childNodes[offset] ?? null];
}

/**
 * Remove inline marks from `range` (which must lie inside `root` and not be collapsed). Returns the range
 * covering the cleared text, or null when there was nothing to do.
 */
export function clearInlineFormatting(root: HTMLElement, range: Range): Range | null {
  if (range.collapsed || !root.contains(range.commonAncestorContainer)) return null;
  // End first: splitting there never moves the start point.
  const [endParent, endBefore] = splitUp(root, range.endContainer, range.endOffset, 'end'),
    endMarker = document.createTextNode('');
  endParent.insertBefore(endMarker, endBefore);
  const [startParent, startBefore] = splitUp(root, range.startContainer, range.startOffset, 'start'),
    startMarker = document.createTextNode('');
  startParent.insertBefore(startMarker, startBefore);
  const span = document.createRange();
  span.setStartAfter(startMarker);
  span.setEndBefore(endMarker);
  const marks = Array.from(root.querySelectorAll('*')).filter(
    el => isInlineMark(el) && span.intersectsNode(el) && !el.closest('[data-mention]'),
  );
  for (const el of marks) el.replaceWith(...Array.from(el.childNodes));
  // Drop marks left empty by the splits.
  for (const el of Array.from(root.querySelectorAll('*')))
    if (isInlineMark(el) && !el.textContent && !el.querySelector('br,[data-mention]')) el.remove();
  const out = document.createRange();
  out.setStartAfter(startMarker);
  out.setEndBefore(endMarker);
  return out;
}
