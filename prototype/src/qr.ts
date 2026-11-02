// QR code matrices for the QR widget (item 29), using the public qrcode-generator package.
// Evidence: QR-code geometry/image-styling chunk and WidgetCompanionQrApp.
import qrcode from 'qrcode-generator';

export const QR_MAX = 1000;
const cache = new Map<string, boolean[][]>();

function utf8(text: string): string {
  // The generator works on byte strings; encode as UTF-8 so non-ASCII content scans correctly.
  return Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join('');
}
/** Dark/light module matrix (no quiet zone). Throws for empty or over-long content. */
export function qrMatrix(text: string): boolean[][] {
  if (!text) throw new Error('Enter text or a link to encode.');
  if (text.length > QR_MAX) throw new Error(`QR codes hold up to ${QR_MAX.toLocaleString('en-US')} characters here.`);
  const hit = cache.get(text);
  if (hit) return hit;
  const qr = qrcode(0, 'M');
  qr.addData(utf8(text), 'Byte');
  qr.make();
  const n = qr.getModuleCount(),
    m = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  if (cache.size > 100) cache.clear();
  cache.set(text, m);
  return m;
}
/** SVG path for the dark modules, one unit per module, offset by the quiet zone. */
export function qrPath(matrix: boolean[][], quiet: number): string {
  let d = '';
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      d += `M${start + quiet},${r + quiet}h${c - start}v1h${start - c}z`;
    }
  });
  return d;
}
