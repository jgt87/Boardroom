// Formula fields: a small arithmetic language evaluated without eval or Function.
// Grammar: expr = term (('+' | '-') term)*; term = unary (('*' | '/' | '%') unary)*;
// unary = '-' unary | primary; primary = number | {Field name} | name '(' args ')' | '(' expr ')'.
// Functions: round(x[, digits]), min(...), max(...), abs(x).

export type FormulaNode =
  | { k: 'num'; v: number }
  | { k: 'ref'; name: string }
  | { k: 'neg'; a: FormulaNode }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '%'; a: FormulaNode; b: FormulaNode }
  | { k: 'call'; fn: 'round' | 'min' | 'max' | 'abs'; args: FormulaNode[] };

export const FORMULA_MAX_LENGTH = 500;
const MAX_DEPTH = 40,
  MAX_NODES = 200;
const functions = ['round', 'min', 'max', 'abs'] as const;

/** Parse a formula, throwing a readable error. Bounded in length, depth and size. */
export function parseFormula(text: string): FormulaNode {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Enter a formula.');
  if (text.length > FORMULA_MAX_LENGTH) throw new Error('Use a formula up to 500 characters.');
  let at = 0,
    nodes = 0;
  const node = <T extends FormulaNode>(n: T): T => {
    if (++nodes > MAX_NODES) throw new Error('The formula is too long.');
    return n;
  };
  const space = () => {
    while (at < text.length && /\s/.test(text[at])) at++;
  };
  const peek = () => {
    space();
    return text[at];
  };
  const expect = (char: string) => {
    if (peek() !== char) throw new Error(`Expected "${char}" at position ${at + 1}.`);
    at++;
  };
  const expr = (depth: number): FormulaNode => {
    if (depth > MAX_DEPTH) throw new Error('The formula is nested too deeply.');
    let left = term(depth);
    while (peek() === '+' || peek() === '-') {
      const op = text[at++] as '+' | '-';
      left = node({ k: 'bin', op, a: left, b: term(depth) });
    }
    return left;
  };
  const term = (depth: number): FormulaNode => {
    let left = unary(depth);
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = text[at++] as '*' | '/' | '%';
      left = node({ k: 'bin', op, a: left, b: unary(depth) });
    }
    return left;
  };
  const unary = (depth: number): FormulaNode => {
    if (depth > MAX_DEPTH) throw new Error('The formula is nested too deeply.');
    if (peek() === '-') {
      at++;
      return node({ k: 'neg', a: unary(depth + 1) });
    }
    if (peek() === '+') {
      at++;
      return unary(depth + 1);
    }
    return primary(depth);
  };
  const primary = (depth: number): FormulaNode => {
    const c = peek();
    if (c === undefined) throw new Error('The formula ends unexpectedly.');
    if (c === '(') {
      at++;
      const inner = expr(depth + 1);
      expect(')');
      return inner;
    }
    if (c === '{') {
      const end = text.indexOf('}', at);
      if (end < 0) throw new Error('Close the field reference with "}".');
      const name = text.slice(at + 1, end).trim();
      if (!name || name.length > 80 || name.includes('{')) throw new Error('Name a field inside { }.');
      at = end + 1;
      return node({ k: 'ref', name });
    }
    const number = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(at));
    if (number) {
      at += number[0].length;
      const v = Number(number[0]);
      if (!Number.isFinite(v)) throw new Error('Use a finite number.');
      return node({ k: 'num', v });
    }
    const word = /^[a-z]+/i.exec(text.slice(at));
    if (word) {
      const fn = word[0].toLowerCase() as (typeof functions)[number];
      if (!functions.includes(fn)) throw new Error(`Unknown function "${word[0]}". Use round, min, max or abs.`);
      at += word[0].length;
      expect('(');
      const args: FormulaNode[] = [];
      if (peek() !== ')') {
        args.push(expr(depth + 1));
        while (peek() === ',') {
          at++;
          if (args.length >= 20) throw new Error('Use up to 20 function arguments.');
          args.push(expr(depth + 1));
        }
      }
      expect(')');
      if (
        (fn === 'abs' && args.length !== 1) ||
        (fn === 'round' && (args.length < 1 || args.length > 2)) ||
        !args.length
      )
        throw new Error(`Wrong number of arguments for ${fn}.`);
      return node({ k: 'call', fn, args });
    }
    throw new Error(`Unexpected "${c}" at position ${at + 1}.`);
  };
  const tree = expr(0);
  if (peek() !== undefined) throw new Error(`Unexpected "${text[at]}" at position ${at + 1}.`);
  return tree;
}

/** Field names a formula refers to. */
export function formulaRefs(node: FormulaNode, into = new Set<string>()): Set<string> {
  if (node.k === 'ref') into.add(node.name);
  else if (node.k === 'neg') formulaRefs(node.a, into);
  else if (node.k === 'bin') {
    formulaRefs(node.a, into);
    formulaRefs(node.b, into);
  } else if (node.k === 'call') node.args.forEach(a => formulaRefs(a, into));
  return into;
}

/** Evaluate; a missing value or invalid arithmetic (such as division by zero) gives null. */
export function evaluateFormula(node: FormulaNode, resolve: (name: string) => number | null): number | null {
  const run = (n: FormulaNode): number | null => {
    switch (n.k) {
      case 'num':
        return n.v;
      case 'ref':
        return resolve(n.name);
      case 'neg': {
        const a = run(n.a);
        return a === null ? null : -a;
      }
      case 'bin': {
        const a = run(n.a),
          b = run(n.b);
        if (a === null || b === null) return null;
        if ((n.op === '/' || n.op === '%') && b === 0) return null;
        const v = n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : a % b;
        return Number.isFinite(v) ? v : null;
      }
      case 'call': {
        const args = n.args.map(run);
        if (args.some(a => a === null)) return null;
        const values = args as number[];
        if (n.fn === 'abs') return Math.abs(values[0]);
        if (n.fn === 'min') return Math.min(...values);
        if (n.fn === 'max') return Math.max(...values);
        const digits = Math.max(0, Math.min(10, Math.round(values[1] ?? 0))),
          scale = 10 ** digits;
        return Math.round(values[0] * scale) / scale;
      }
    }
  };
  return run(node);
}

const cache = new Map<string, FormulaNode | null>();
function cachedParse(text: string): FormulaNode | null {
  if (!cache.has(text)) {
    if (cache.size > 500) cache.clear();
    try {
      cache.set(text, parseFormula(text));
    } catch {
      cache.set(text, null);
    }
  }
  return cache.get(text)!;
}

type FieldLike = { id: string; name: string; type: string; formula?: string };
type RowLike = { points?: number; values?: Record<string, string | number | boolean> };
/**
 * Numeric value of a number or formula field for a record. {Points} refers to the estimate.
 * Unknown references, empty inputs and invalid arithmetic give null.
 */
export function numericFieldValue(row: RowLike, field: FieldLike, fields: FieldLike[], depth = 0): number | null {
  if (field.type === 'number') {
    const v = row.values?.[field.id];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  if (field.type !== 'formula' || !field.formula || depth > 30) return null;
  const tree = cachedParse(field.formula);
  if (!tree) return null;
  return evaluateFormula(tree, name => {
    const ref = fields.find(f => f.name === name);
    if (!ref) return name === 'Points' ? (row.points ?? null) : null;
    return ref.id !== field.id ? numericFieldValue(row, ref, fields, depth + 1) : null;
  });
}

/** Replace a field name inside {…} references, for field renames. */
export function renameFormulaRef(text: string, from: string, to: string): string {
  return text.replace(/\{([^{}]*)\}/g, (whole, name: string) => (name.trim() === from ? `{${to}}` : whole));
}
