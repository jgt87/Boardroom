// Mechanical checks for the design rules in DESIGN.md, so drift is caught by `npm test` instead of review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = join(import.meta.dirname, '..', 'src');
const cssFiles = readdirSync(src).filter(f => f.endsWith('.css'));
const css = cssFiles.map(f => ({ file: f, text: readFileSync(join(src, f), 'utf8') }));
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

// Ratchet: chrome colours come from the tokens in style.css :root. Lower this number when you replace literals;
// never raise it. Note colours and object fills (content) are the remaining literals.
const HEX_LITERAL_BUDGET = 493;

test('CSS hex colour literals do not grow (use the tokens in style.css :root)', () => {
  const count = css.reduce((n, { text }) => n + (stripComments(text).match(/#[0-9a-fA-F]{3,8}\b/g)?.length ?? 0), 0);
  assert.ok(count <= HEX_LITERAL_BUDGET, `${count} hex literals in src/*.css, budget ${HEX_LITERAL_BUDGET}`);
});

test('font sizes in px stay on the type scale unless marked as a glyph or display size', () => {
  const scale = new Set([10, 11, 12, 13, 14, 16, 18, 20]);
  const off: string[] = [];
  for (const { file, text } of css)
    for (const m of text.matchAll(/font-size:\s*([\d.]+)px\s*;(\s*\/\*\s*type-scale:)?/g))
      if (!scale.has(Number(m[1])) && !m[2]) off.push(`${file}:${lineOf(text, m.index)} ${m[1]}px`);
  assert.deepEqual(off, [], 'use 10/11/12/13/14/16/18/20, or add /* type-scale: glyph|display */ after the line');
});

test('transitions never animate layout properties (use transform or opacity)', () => {
  const layout = /\b(width|height|max-height|min-height|top|left|right|bottom|margin[\w-]*|padding[\w-]*)\b/;
  const bad: string[] = [];
  for (const { file, text } of css) {
    const clean = stripComments(text);
    for (const m of clean.matchAll(/(?<![\w-])transition(?:-property)?\s*:([^;]+);/g))
      if (layout.test(m[1].replace(/var\([^)]*\)/g, ''))) bad.push(`${file}:${lineOf(clean, m.index)} ${m[1].trim()}`);
  }
  assert.deepEqual(bad, []);
});

test('every CSS custom property that is read without a fallback is defined somewhere', () => {
  const defined = new Set<string>();
  for (const { text } of css) for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  // Properties set at runtime from TSX (style={{ '--x': … }} or setProperty('--x', …)).
  for (const f of readdirSync(src).filter(f => /\.tsx?$/.test(f)))
    for (const m of readFileSync(join(src, f), 'utf8').matchAll(/['"`](--[\w-]+)['"`]/g)) defined.add(m[1]);
  const missing = new Set<string>();
  for (const { file, text } of css)
    for (const m of stripComments(text).matchAll(/var\((--[\w-]+)\s*\)/g))
      if (!defined.has(m[1])) missing.add(`${file} ${m[1]}`);
  assert.deepEqual([...missing], []);
});

test('the global reduced-motion rule and colour-scheme declaration are present', () => {
  const style = stripComments(readFileSync(join(src, 'style.css'), 'utf8'));
  assert.match(style, /prefers-reduced-motion:\s*reduce\)\s*\{\s*\*:not\(\.motion-alt\)/);
  assert.match(style, /:root\s*\{[^}]*color-scheme:\s*light/);
});
