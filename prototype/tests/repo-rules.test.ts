// Repository rules from AGENTS.md, checked mechanically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const proto = join(import.meta.dirname, '..');
const repo = join(proto, '..');

const tracked = (() => {
  try {
    return execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return null; // not a git checkout (for example an exported zip): nothing to check
  }
})();

test('private evidence is never tracked', { skip: tracked === null }, () => {
  const leaked = tracked!.filter(f => /\.private\.json$/.test(f) || f.startsWith('evidence-private/'));
  assert.deepEqual(leaked, []);
});

test('UI source names no assistant, AI vendor or the analysed commercial product', () => {
  const banned = /\b(claude|anthropic|chatgpt|openai|copilot|gemini|codex|miro)\b/i;
  const hits: string[] = [];
  const dirs = [join(proto, 'src'), join(proto, 'public')];
  for (const dir of dirs)
    for (const f of readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter(f =>
      /\.(tsx?|css|js|html|json)$/.test(f),
    )) {
      const lines = readFileSync(join(dir, f), 'utf8').split('\n');
      lines.forEach((line, i) => banned.test(line) && hits.push(`${f}:${i + 1}`));
    }
  const index = readFileSync(join(proto, 'index.html'), 'utf8');
  if (banned.test(index)) hits.push('index.html');
  assert.deepEqual(hits, []);
});

test('package.json version matches the newest released CHANGELOG heading', () => {
  const { version } = JSON.parse(readFileSync(join(proto, 'package.json'), 'utf8'));
  const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');
  const released = changelog.match(/^## (\d+\.\d+\.\d+)\b/m)?.[1];
  assert.equal(released, version);
});
