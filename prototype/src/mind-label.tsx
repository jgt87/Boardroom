// A mind-map topic label as SVG text with per-word styles (decision R5-Q4). Shared by the board view (formats.tsx)
// and the canvas editor (mindmap-canvas.tsx), so both draw the same thing. Links show underlined in the topic's own
// text colour (the topic link button opens them); highlights are not drawn in SVG labels.
import type { MindNode } from './model';
import type { SpanStyle } from './rich-text';
import { topicLabelRuns } from './mind-rich';

const runProps = (s: SpanStyle) => {
  const lines = [s.underline || s.href ? 'underline' : '', s.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  return {
    fontWeight: s.bold ? 700 : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    textDecoration: lines || undefined,
    fill: s.color,
  };
};

export function TopicLabel({
  node,
  x,
  y,
  fill,
}: {
  node: Pick<MindNode, 'text' | 'spans' | 'spansFor'>;
  /** Left edge and the top of the topic box. */
  x: number;
  y: number;
  fill: string;
}) {
  const lines = topicLabelRuns(node);
  return (
    <text x={x} y={y + 29 - (lines.length - 1) * 8} fill={fill} fontSize={lines.length > 2 ? 11 : 14}>
      {lines.map((runs, k) => (
        <tspan key={k} x={x} dy={k ? 16 : 0}>
          {runs.map((r, j) => (
            <tspan key={j} {...runProps(r.style)}>
              {r.text}
            </tspan>
          ))}
        </tspan>
      ))}
    </text>
  );
}
