// Rich text in mind-map topics (decision R5-Q4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItem, parseBoard } from '../src/model.ts';
import type { MindNode } from '../src/model.ts';
import { retextTopic, toggleTopicStyle, topicLabelRuns, topicStyleKey } from '../src/mind-rich.ts';
import { activeSpans } from '../src/rich-text.ts';

const topic = (text: string): MindNode => ({ id: 't', parent: null, text });

test('toggling a style over a selection, and back off', () => {
  const bold = toggleTopicStyle(topic('Plan the launch'), 5, 8, 'bold');
  assert.deepEqual(activeSpans(bold), [{ start: 5, end: 8, bold: true }]);
  assert.equal(toggleTopicStyle(bold, 5, 8, 'bold').spans, undefined);
  // An empty selection changes nothing.
  const t = topic('x');
  assert.equal(toggleTopicStyle(t, 0, 0, 'italic'), t);
});

test('typing keeps styles on their words and continues the style it is typed into', () => {
  const bold = toggleTopicStyle(topic('Plan the launch'), 5, 8, 'bold');
  // Text inserted before the bold word shifts it.
  const before = retextTopic(bold, 'Now plan the launch');
  assert.deepEqual(activeSpans(before), [{ start: 9, end: 12, bold: true }]);
  // Text typed at the end of the bold word is bold too.
  const inside = retextTopic(bold, 'Plan theme launch');
  assert.deepEqual(activeSpans(inside), [{ start: 5, end: 10, bold: true }]);
  // Deleting the bold word drops its span.
  assert.equal(retextTopic(bold, 'Plan  launch').spans, undefined);
  // Without spans, a text change is just the text.
  assert.deepEqual(retextTopic(topic('a'), 'ab'), topic('ab'));
});

test('labels: styled runs per line, cut to 22 characters with an ellipsis', () => {
  const t = toggleTopicStyle(topic('Short\nA much longer second line of text'), 0, 5, 'italic');
  const lines = topicLabelRuns(t);
  assert.deepEqual(lines[0], [{ text: 'Short', style: { italic: true } }]);
  assert.equal(lines[1].map(r => r.text).join(''), 'A much longer second …');
  assert.deepEqual(topicLabelRuns(topic('')), [[{ text: 'Untitled topic', style: {} }]]);
  // A stale style (text changed elsewhere without the spans) is ignored.
  assert.deepEqual(topicLabelRuns({ ...t, text: 'Other' }), [[{ text: 'Other', style: {} }]]);
});

test('formatting keys, and styled topics load and validate', () => {
  const k = (key: string, extra = {}) =>
    topicStyleKey({ key, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, ...extra });
  assert.deepEqual(
    [k('b'), k('i'), k('U'), k('x', { shiftKey: true }), k('x'), k('b', { altKey: true })],
    ['bold', 'italic', 'underline', 'strike', null, null],
  );
  const map = createItem('mindmap', 0, 0);
  map.nodes = [toggleTopicStyle(topic('Goal'), 0, 4, 'bold')];
  assert.doesNotThrow(() => parseBoard({ version: 1, title: 't', items: [map] }));
  map.nodes = [{ ...topic('Goal'), spans: [{ start: 0, end: 4, bold: true }], spansFor: 'nothex' }];
  assert.throws(() => parseBoard({ version: 1, title: 't', items: [map] }), /text styling/);
});
