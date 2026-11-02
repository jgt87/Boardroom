export type Measure = (text: string, size: number) => number;
export function wrappedLineCount(text: string, width: number, size: number, measure: Measure): number {
  let count = 0;
  for (const paragraph of text.split('\n')) {
    let line = '';
    count++;
    for (const token of paragraph.split(/(\s+)/).filter(Boolean)) {
      if (/^\s+$/.test(token)) {
        line += token;
        continue;
      }
      if (measure(line + token, size) <= width) {
        line += token;
        continue;
      }
      if (line.trim()) {
        count++;
        line = '';
      }
      for (const char of token) {
        if (line && measure(line + char, size) > width) {
          count++;
          line = '';
        }
        line += char;
      }
    }
  }
  return Math.max(1, count);
}
export function fitText(
  text: string,
  width: number,
  height: number,
  measure: Measure,
): { size: number; lines: number; height: number } {
  const widest = Math.max(0, ...[...text].filter(c => c !== '\n').map(c => measure(c, 1)));
  let low = 1,
    high = Math.max(1, Math.min(512, height / 1.4));
  for (let i = 0; i < 11; i++) {
    const size = (low + high) / 2,
      lines = wrappedLineCount(text, width, size, measure);
    if (lines * size * 1.4 <= height && widest * size <= width) low = size;
    else high = size;
  }
  const size = Math.floor(low * 10) / 10,
    lines = wrappedLineCount(text, width, size, measure);
  return { size, lines, height: lines * size * 1.4 };
}
