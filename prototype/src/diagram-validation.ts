// Validation report for diagrams (item 100). Pure: lists likely mistakes in shapes and connectors.
import type { Board, Item } from './model.ts';
import { isShapeKind } from './shapes.ts';

export type DiagramIssue = {
  id: string;
  kind: 'dangling' | 'unlabelled' | 'isolated' | 'overlap';
  message: string;
};
export const issueLabels: Record<DiagramIssue['kind'], string> = {
  dangling: 'Loose connector',
  unlabelled: 'No label',
  isolated: 'Not connected',
  overlap: 'Overlapping shapes',
};

const name = (i: Item) => (i.text?.trim() ? `"${i.text.trim().slice(0, 40)}"` : `Untitled ${i.type}`);
const overlapRatio = (a: Item, b: Item) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
};

/**
 * Check shapes and connectors: connectors with an end not attached to an object, shapes without a
 * label, shapes no connector touches (only when the board has connectors), and shapes that cover
 * at least 30% of each other. Hidden objects are skipped.
 */
export function validateDiagram(board: Board): DiagramIssue[] {
  const visible = board.items.filter(i => !i.hidden),
    ids = new Set(visible.map(i => i.id)),
    shapes = visible.filter(i => isShapeKind(i.type)),
    arrows = visible.filter(i => i.type === 'arrow'),
    issues: DiagramIssue[] = [];
  for (const a of arrows) {
    const loose = [a.from, a.to].filter(end => !end || !ids.has(end)).length;
    if (loose)
      issues.push({
        id: a.id,
        kind: 'dangling',
        message: loose === 2 ? 'Connector is not attached at either end.' : 'Connector has one end not attached.',
      });
  }
  const linked = new Set(arrows.flatMap(a => [a.from, a.to]).filter(Boolean) as string[]);
  for (const s of shapes) {
    if (!s.text?.trim()) issues.push({ id: s.id, kind: 'unlabelled', message: `${name(s)} has no label.` });
    if (arrows.length && !linked.has(s.id))
      issues.push({ id: s.id, kind: 'isolated', message: `${name(s)} is not connected to anything.` });
  }
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++)
      if (overlapRatio(shapes[i]!, shapes[j]!) >= 0.3)
        issues.push({
          id: shapes[j]!.id,
          kind: 'overlap',
          message: `${name(shapes[j]!)} overlaps ${name(shapes[i]!)}.`,
        });
  return issues;
}
