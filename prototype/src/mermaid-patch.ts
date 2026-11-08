// Line patches for writing Mermaid code back from shapes (item 132, decision R6c-Q2). The writers in
// mermaid-writeback.ts change only the lines whose diagram objects changed: every other line (comments, styling,
// directives, syntax the shapes cannot show) stays where it is, and unchanged shapes give the same code back.
import type { Item } from './model.ts';

/** A line to add: full text with its indentation, and an optional tag to find its output line afterwards. */
export type NewLine = { text: string; tag?: string };

/**
 * Edits on the lines of one code text. Replaced lines keep their indentation and a trailing `%%` comment; inserted
 * lines go before or after an original line (in call order) or at the end. `build` returns the code and the output
 * line of each original line (tag `@<index>`) and of each tagged inserted line.
 */
export class LinePatch {
  readonly lines: string[];
  private readonly replaced = new Map<number, string[] | null>();
  private readonly before = new Map<number, NewLine[]>();
  private readonly after = new Map<number, NewLine[]>();
  private readonly tail: NewLine[] = [];
  constructor(code: string) {
    this.lines = code.split(/\r?\n/);
  }
  indent(at: number): string {
    return /^\s*/.exec(this.lines[at] ?? '')![0];
  }
  /** Indentation for a line inside the block that `at` opens or closes. */
  inner(at: number): string {
    return this.indent(at) + '  ';
  }
  /** Replace a line (or with several lines, which then follow its indentation). */
  replace(at: number, ...texts: string[]) {
    this.replaced.set(at, texts);
  }
  remove(at: number | undefined) {
    if (at !== undefined) this.replaced.set(at, null);
  }
  removed(at: number): boolean {
    return this.replaced.get(at) === null;
  }
  insertBefore(at: number, ...lines: NewLine[]) {
    this.before.set(at, [...(this.before.get(at) ?? []), ...lines]);
  }
  insertAfter(at: number, ...lines: NewLine[]) {
    this.after.set(at, [...(this.after.get(at) ?? []), ...lines]);
  }
  append(...lines: NewLine[]) {
    this.tail.push(...lines);
  }
  build(): { code: string; lineOf: Map<string, number> } {
    const out: string[] = [],
      lineOf = new Map<string, number>();
    const add = (lines: NewLine[] = []) => {
      for (const l of lines) {
        if (l.tag) lineOf.set(l.tag, out.length);
        out.push(l.text);
      }
    };
    this.lines.forEach((raw, at) => {
      add(this.before.get(at));
      const change = this.replaced.get(at);
      if (change === undefined) {
        lineOf.set(`@${at}`, out.length);
        out.push(raw);
      } else if (change) {
        const indent = this.indent(at),
          comment = /\s%%.*$/.exec(raw)?.[0] ?? '';
        lineOf.set(`@${at}`, out.length);
        change.forEach((text, k) => out.push(indent + text + (k === change.length - 1 ? comment : '')));
      }
      add(this.after.get(at));
    });
    // New lines go before trailing blank lines.
    let end = out.length;
    while (end > 0 && !out[end - 1].trim()) end--;
    const trailing = out.splice(end);
    add(this.tail);
    out.push(...trailing);
    return { code: out.join('\n'), lineOf };
  }
}

/** One step of aligning an old list to a new one: kept (equal), replaced, removed (old only) or added (new only). */
export type Step = { old?: number; next?: number; same?: boolean };
/**
 * Align two lists by their longest common subsequence; unmatched runs pair up as replacements, so changing one
 * entry gives one replaced line and inserting one gives one added line.
 */
export function align<T>(old: T[], next: T[], eq: (a: T, b: T) => boolean): Step[] {
  const n = old.length,
    m = next.length,
    dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = eq(old[i], next[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const steps: Step[] = [];
  let i = 0,
    j = 0,
    olds: number[] = [],
    nexts: number[] = [];
  const flush = () => {
    const pairs = Math.min(olds.length, nexts.length);
    for (let k = 0; k < pairs; k++) steps.push({ old: olds[k], next: nexts[k] });
    for (const o of olds.slice(pairs)) steps.push({ old: o });
    for (const x of nexts.slice(pairs)) steps.push({ next: x });
    olds = [];
    nexts = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && eq(old[i], next[j])) {
      flush();
      steps.push({ old: i++, next: j++, same: true });
    } else if (j >= m || (i < n && dp[i + 1][j] >= dp[i][j + 1])) olds.push(i++);
    else nexts.push(j++);
  }
  flush();
  return steps;
}

/**
 * Apply an aligned list (class members, entity rows) to the code: replaced entries rewrite their line, removed
 * ones drop it, and added ones go after the previous entry's line (or before the first one). `render` gets the
 * new index and the old entry whose line it takes or follows. Returns the added texts when the list had no lines.
 */
export function patchList(
  patch: LinePatch,
  oldAt: number[],
  steps: Step[],
  render: (next: number, like: number) => string,
): number[] {
  if (!oldAt.length) return steps.filter(s => s.next !== undefined).map(s => s.next!);
  let anchor = -1;
  for (const s of steps) {
    if (s.old !== undefined) {
      if (s.next === undefined) patch.remove(oldAt[s.old]);
      else if (!s.same) patch.replace(oldAt[s.old], render(s.next, s.old));
      anchor = s.old;
    } else if (s.next !== undefined) {
      const like = Math.max(0, anchor),
        line = { text: patch.indent(oldAt[like]) + render(s.next, like) };
      if (anchor < 0) patch.insertBefore(oldAt[0], line);
      else patch.insertAfter(oldAt[anchor], line);
    }
  }
  return [];
}

/** A new code id: the object's text when it is a usable id that is still free, otherwise prefix + number. */
export function freshId(text: string, taken: Set<string>, prefix: string, pattern: RegExp, reserved: string[] = []) {
  const t = text.trim();
  if (pattern.test(t) && !taken.has(t) && !reserved.includes(t.toLowerCase())) return t;
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Text for one Mermaid line: new lines become `<br/>` (cleanLabel reads them back), surrounding spaces go. */
export const oneLine = (text: string) => text.trim().replace(/\r?\n/g, '<br/>');
/** Is the connector drawn dashed or dotted? */
export const isDashed = (i: Item) => i.connector?.dash === 'dashed' || i.connector?.dash === 'dotted';
