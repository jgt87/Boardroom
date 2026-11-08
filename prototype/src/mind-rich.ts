// Rich text in mind-map topics (decision R5-Q4, 2026-11-08). Pure: no React, no DOM.
// A topic keeps plain `text` plus hash-guarded `spans`, the model text objects use (rich-text.ts). The canvas editor
// stays a textarea: typing re-maps the spans with `retextTopic`, and Ctrl+B/I/U/Shift+X toggle a style over the
// selection with `toggleTopicStyle`. Labels draw as runs per line with `topicLabelRuns`.
import type { MindNode } from './model.ts';
import { activeSpans, lineRuns, normalizeSpans, replaceRange, textHash, toggleStyle } from './rich-text.ts';
import type { Run, TextSpan, ToggleKey } from './rich-text.ts';

/** The topic with new text and spans; spans are dropped when there are none. */
function withSpans(node: MindNode, text: string, spans: readonly TextSpan[]): MindNode {
  const next: MindNode = { ...node, text };
  const clean = normalizeSpans(spans, text.length);
  if (clean.length) {
    next.spans = clean;
    next.spansFor = textHash(text);
  } else {
    delete next.spans;
    delete next.spansFor;
  }
  return next;
}

/**
 * The topic after its text changed to `text` (one textarea change): the changed middle is found from the common
 * start and end, so styles before and after the edit stay on their words and typed text continues the style it
 * was typed into.
 */
export function retextTopic(node: MindNode, text: string): MindNode {
  const old = node.text;
  if (old === text) return node;
  const spans = activeSpans(node);
  if (!spans.length) return withSpans(node, text, []);
  let start = 0;
  while (start < old.length && start < text.length && old[start] === text[start]) start++;
  let tail = 0;
  while (
    tail < old.length - start &&
    tail < text.length - start &&
    old[old.length - 1 - tail] === text[text.length - 1 - tail]
  )
    tail++;
  const insert = text.slice(start, text.length - tail);
  // Typed text takes the style of the character before it (like a word processor).
  const before = spans.find(s => s.start < start && s.end >= start && !s.mention && !s.href);
  const style = before ? Object.fromEntries(Object.entries(before).filter(([k]) => k !== 'start' && k !== 'end')) : {};
  const made = replaceRange(old, spans, start, old.length - tail, insert, style);
  return withSpans(node, made.text, made.spans);
}

/** Toggle bold, italic, underline or strikethrough over [start, end) of the topic text. */
export function toggleTopicStyle(node: MindNode, start: number, end: number, key: ToggleKey): MindNode {
  if (end <= start) return node;
  return withSpans(node, node.text, toggleStyle(node.text, activeSpans(node), start, end, key));
}

/** Keys that format the selection in the topic editor, and the style each toggles. */
export function topicStyleKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): ToggleKey | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (e.shiftKey) return k === 'x' ? 'strike' : null;
  return k === 'b' ? 'bold' : k === 'i' ? 'italic' : k === 'u' ? 'underline' : null;
}

/**
 * The label as styled runs per line, as drawn on a topic: up to three lines of at most 22 characters, the last
 * visible line ending in "…" when text was cut (the same rule as `mindLabelLines`).
 */
export function topicLabelRuns(node: Pick<MindNode, 'text' | 'spans' | 'spansFor'>): Run[][] {
  const text = node.text || 'Untitled topic',
    lines = lineRuns(text, node.text ? activeSpans(node as MindNode) : []),
    total = text.split(/\r?\n/).length;
  return lines.slice(0, 3).map((runs, index) => {
    const length = runs.reduce((n, r) => n + r.text.length, 0);
    const cut = length > 22 || (index === Math.min(3, lines.length) - 1 && total > 3);
    if (!runs.length) return [{ text: ' ', style: {} }];
    if (!cut) return runs;
    const out: Run[] = [];
    let left = 21;
    for (const r of runs) {
      if (left <= 0) break;
      out.push({ text: r.text.slice(0, left), style: r.style });
      left -= r.text.length;
    }
    out.push({ text: '…', style: out.at(-1)?.style ?? {} });
    return out;
  });
}
