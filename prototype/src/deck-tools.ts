// Slides from frames and deck PDF export (gap G13).
// framesToDeck is pure; deckPdf runs in the browser (jsPDF, real text, one landscape page per slide).
import type { Board, Item } from './model.ts';
import { createItem } from './model.ts';
import {
  newSlide,
  scaleSummary,
  wordCloudLayout,
  DECK_MAX,
  SLIDE_BODY_MAX,
  SLIDE_TITLE_MAX,
} from './specs-activities.ts';
import type { DeckData, Slide } from './specs-activities.ts';
import { readingOrder } from './navigation.ts';
import { pdfSafe } from './doc-pdf.ts';

const inside = (f: Item, i: Item) =>
  i.id !== f.id && i.x >= f.x && i.y >= f.y && i.x + i.w <= f.x + f.w && i.y + i.h <= f.y + f.h;

/** One content slide per frame (in the given order): frame title, then the text inside it as bullet points. */
export function framesToDeck(board: Board, frameIds: string[]): DeckData {
  const frames = frameIds
    .map(id => board.items.find(i => i.id === id))
    .filter((f): f is Item => f?.type === 'frame')
    .slice(0, DECK_MAX);
  const order = new Map(readingOrder(board).map((id, k) => [id, k]));
  const slides: Slide[] = frames.map((f, k) => {
    const lines = board.items
      .filter(i => inside(f, i) && i.type !== 'frame' && i.text.trim() && i.type !== 'arrow')
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map(i => `- ${i.text.trim().replace(/\s*\n\s*/g, ' ')}`);
    return newSlide('content', {
      title: (f.text.trim() || `Slide ${k + 1}`).slice(0, SLIDE_TITLE_MAX),
      body: lines.join('\n').slice(0, SLIDE_BODY_MAX),
    });
  });
  return { slides: slides.length ? slides : [newSlide('title', { title: 'Untitled' })], current: 0 };
}

/** A Slides object to the right of the frames, holding the deck. */
export function deckItemFor(board: Board, frameIds: string[]): Item | null {
  const frames = board.items.filter(i => frameIds.includes(i.id) && i.type === 'frame');
  if (!frames.length) return null;
  const item = createItem('slides', Math.max(...frames.map(f => f.x + f.w)) + 80, Math.min(...frames.map(f => f.y)));
  item.text = 'Slides from frames';
  item.data = framesToDeck(
    board,
    frames.map(f => f.id),
  );
  return item;
}

/** PDF of a deck: one landscape A4 page per slide with its title and text (browser only). */
export async function deckPdf(title: string, deck: DeckData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' }),
    W = pdf.internal.pageSize.getWidth(),
    M = 56;
  pdf.setProperties({ title: pdfSafe(title) });
  deck.slides.forEach((s, k) => {
    if (k) pdf.addPage();
    if (/^#[0-9a-f]{6}$/i.test(s.background) && s.background.toLowerCase() !== '#ffffff') {
      pdf.setFillColor(s.background);
      pdf.rect(0, 0, W, pdf.internal.pageSize.getHeight(), 'F');
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(s.layout === 'title' || s.layout === 'section' ? 34 : 26);
    let y = M + 30;
    for (const line of pdf.splitTextToSize(pdfSafe(s.title || ' '), W - M * 2) as string[]) {
      pdf.text(line, M, y);
      y += 34;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(15);
    y += 8;
    const responses = responseLines(s),
      body = [s.body, s.body2].filter(Boolean).join('\n\n') + (responses.length ? '\n' + responses.join('\n') : '');
    for (const line of pdf.splitTextToSize(pdfSafe(body), W - M * 2) as string[]) {
      pdf.text(line, M, y);
      y += 21;
    }
    pdf.setFontSize(9);
    pdf.setTextColor(140);
    pdf.text(`${k + 1} / ${deck.slides.length}`, W - M, pdf.internal.pageSize.getHeight() - 24, { align: 'right' });
    pdf.setTextColor(0);
  });
  return pdf.output('blob');
}

/** Text lines for a slide's local responses (PDF export and image fallbacks). */
export function responseLines(s: Slide): string[] {
  if (s.layout === 'scale' && s.scale) {
    const { total, average } = scaleSummary(s.scale);
    return [
      `Scale 1–${s.scale.max}: ${total} ${total === 1 ? 'rating' : 'ratings'}${total ? `, average ${average}` : ''}`,
      ...s.scale.votes.map((v, k) => `${k + 1}: ${v}`),
    ];
  }
  if (s.layout === 'wordcloud') return (s.words ?? []).map(w => `- ${w.text} (${w.count})`);
  if (s.layout === 'answers') return (s.answers ?? []).map(a => `- ${a.text}`);
  return (s.options ?? []).map(o => (s.layout === 'activity' ? `- ${o.label} (${o.votes})` : `- ${o.label}`));
}

// ---- Slide images (track D): one PNG per slide, drawn from an SVG ---------------------------------------
export const SLIDE_PNG_W = 1920;
export const SLIDE_PNG_H = 1080;
const xml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 140;
};
/** Greedy word wrap with an average Arial glyph width; long words are cut. */
export function wrapText(text: string, size: number, width: number, maxLines = 99): string[] {
  const perLine = Math.max(1, Math.floor(width / (size * 0.54))),
    out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > perLine) {
        if (line) out.push(line);
        out.push(word.slice(0, perLine));
        line = '';
        word = word.slice(perLine);
      }
      if (!line) line = word;
      else if ((line + ' ' + word).length <= perLine) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  if (out.length > maxLines) {
    out.length = maxLines;
    out[maxLines - 1] = out[maxLines - 1].replace(/.?$/, '…');
  }
  return out;
}
const textBlock = (
  lines: string[],
  x: number,
  y: number,
  size: number,
  attrs: string,
  lineHeight = 1.3,
  anchor: 'start' | 'middle' | 'end' = 'start',
) =>
  lines
    .map(
      (l, k) =>
        `<text x="${x}" y="${Math.round(y + k * size * lineHeight)}" font-size="${size}" text-anchor="${anchor}" ${attrs}>${xml(l)}</text>`,
    )
    .join('');

/**
 * The slide as a standalone SVG (1920×1080) in the same layouts as the canvas: text, poll bars, scale tallies,
 * the word cloud and open-ended answers. Pure, so it can be tested and drawn to a canvas through a data: URL.
 */
export function slideSvg(s: Slide, page?: { index: number; count: number }): string {
  const W = SLIDE_PNG_W,
    H = SLIDE_PNG_H,
    M = 115,
    bg = /^#[0-9a-f]{6}$/i.test(s.background) ? s.background : '#ffffff',
    ink = isDark(bg) ? '#ffffff' : '#25252c',
    font = `font-family="Arial, Helvetica, sans-serif" fill="${ink}"`,
    parts: string[] = [`<rect width="${W}" height="${H}" fill="${bg}"/>`];
  const heading = (y = M + 84) => {
    const lines = wrapText(s.title, 84, W - M * 2, 2);
    parts.push(textBlock(lines, M, y, 84, `${font} font-weight="700"`, 1.2));
    return y + lines.length * 84 * 1.2 + 20;
  };
  const bullets = (text: string, x: number, y: number, width: number) => {
    const lines = text
      .split('\n')
      .filter(l => l.trim())
      .flatMap(l => wrapText('• ' + l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''), 52, width));
    parts.push(textBlock(lines.slice(0, Math.floor((H - y - M / 2) / 68)), x, y + 52, 52, font, 1.3));
  };
  switch (s.layout) {
    case 'title':
    case 'section': {
      const title = wrapText(s.title, 123, W - M * 2, 3),
        sub = wrapText(s.body, 58, W - M * 2, 2),
        total = title.length * 148 + (sub.length ? 40 + sub.length * 75 : 0);
      let y = (H - total) / 2 + 110;
      parts.push(textBlock(title, W / 2, y, 123, `${font} font-weight="700"`, 1.2, 'middle'));
      y += title.length * 148 + 40;
      parts.push(textBlock(sub, W / 2, y, 58, `${font} opacity="0.75"`, 1.3, 'middle'));
      break;
    }
    case 'content':
      bullets(s.body, M, heading(), W - M * 2);
      break;
    case 'two': {
      const y = heading(),
        col = (W - M * 2 - 77) / 2;
      bullets(s.body, M, y, col);
      bullets(s.body2 ?? '', M + col + 77, y, col);
      break;
    }
    case 'quote': {
      const lines = wrapText(s.title, 88, W - M * 2, 5);
      let y = (H - lines.length * 115) / 2 + 60;
      parts.push(textBlock(lines, M, y, 88, `${font} font-style="italic"`, 1.3));
      y += lines.length * 115 + 30;
      parts.push(textBlock(wrapText(s.body, 48, W - M * 2, 1), M, y, 48, `${font} opacity="0.7"`));
      break;
    }
    case 'blank':
      parts.push(textBlock(wrapText(s.title, 58, W - M * 2, 12), M, M + 58, 58, font));
      break;
    case 'activity': {
      let y = heading();
      const options = s.options ?? [],
        total = options.reduce((n, o) => n + o.votes, 0),
        row = Math.min(110, (H - y - M / 2) / Math.max(1, options.length));
      for (const o of options) {
        const h = row - 20;
        parts.push(
          `<rect x="${M}" y="${y}" width="${W - M * 2}" height="${h}" rx="12" fill="none" stroke="#c9c9d3" stroke-width="2"/>`,
          `<rect x="${M}" y="${y}" width="${Math.round((W - M * 2) * (total ? o.votes / total : 0))}" height="${h}" rx="12" fill="#4262ff" fill-opacity="0.18"/>`,
          textBlock(wrapText(o.label, 46, W - M * 2 - 220, 1), M + 26, y + h / 2 + 16, 46, font),
          textBlock([String(o.votes)], W - M - 26, y + h / 2 + 16, 46, `${font} font-weight="700"`, 1.3, 'end'),
        );
        y += row;
      }
      break;
    }
    case 'scale': {
      const y = heading(),
        scale = s.scale ?? { max: 5, votes: [0, 0, 0, 0, 0] },
        { total, average } = scaleSummary(scale),
        top = Math.max(1, ...scale.votes),
        gap = 24,
        bw = (W - M * 2 - gap * (scale.max - 1)) / scale.max,
        base = H - M - 70,
        room = base - y - 120;
      scale.votes.forEach((v, k) => {
        const x = M + k * (bw + gap),
          h = Math.max(6, (v / top) * room);
        parts.push(
          `<rect x="${Math.round(x)}" y="${Math.round(base - h)}" width="${Math.round(bw)}" height="${Math.round(h)}" rx="8" fill="#4262ff" fill-opacity="${v ? 0.85 : 0.18}"/>`,
          textBlock([String(v)], x + bw / 2, base - h - 18, 40, `${font} font-weight="700"`, 1.2, 'middle'),
          textBlock([String(k + 1)], x + bw / 2, base + 56, 44, font, 1.2, 'middle'),
        );
      });
      parts.push(
        textBlock(
          [`${total} ${total === 1 ? 'rating' : 'ratings'}${total ? ` · average ${average}` : ''}`],
          M,
          y + 40,
          40,
          `${font} opacity="0.7"`,
        ),
      );
      break;
    }
    case 'wordcloud': {
      let y = heading() + 30;
      const words = wordCloudLayout(s.words ?? [], 44, 150);
      let line: { text: string; size: number; w: number }[] = [],
        lineW = 0;
      const flush = () => {
        if (!line.length) return;
        const h = Math.max(...line.map(l => l.size));
        let x = (W - lineW) / 2;
        y += h;
        if (y > H - M / 2) return;
        for (const l of line) {
          parts.push(textBlock([l.text], x, y, Math.round(l.size), `${font} font-weight="700"`, 1));
          x += l.w;
        }
        y += 24;
        line = [];
        lineW = 0;
      };
      for (const w of words) {
        const width = w.text.length * w.size * 0.56 + 48;
        if (lineW + width > W - M * 2) flush();
        line.push({ text: w.text, size: w.size, w: width });
        lineW += width;
      }
      flush();
      if (!words.length)
        parts.push(textBlock(['No words yet'], W / 2, H / 2 + 20, 48, `${font} opacity="0.5"`, 1, 'middle'));
      break;
    }
    case 'answers': {
      const y0 = heading(),
        answers = s.answers ?? [],
        cols = 3,
        gap = 26,
        cw = (W - M * 2 - gap * (cols - 1)) / cols,
        ch = 190;
      answers.slice(0, cols * Math.max(1, Math.floor((H - y0 - M / 2) / (ch + gap)))).forEach((a, k) => {
        const x = M + (k % cols) * (cw + gap),
          y = y0 + Math.floor(k / cols) * (ch + gap);
        parts.push(
          `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(cw)}" height="${ch}" rx="12" fill="#fff49b"/>`,
          textBlock(
            wrapText(a.text, 34, cw - 48, 4),
            x + 24,
            y + 52,
            34,
            'font-family="Arial, Helvetica, sans-serif" fill="#25252c"',
          ),
        );
      });
      if (!answers.length)
        parts.push(textBlock(['No answers yet'], W / 2, H / 2 + 20, 48, `${font} opacity="0.5"`, 1, 'middle'));
      break;
    }
  }
  if (page)
    parts.push(
      textBlock([`${page.index + 1} / ${page.count}`], W - 48, H - 36, 26, `${font} opacity="0.5"`, 1.3, 'end'),
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

/** File name for one slide image: "Deck name - slide 03.png". */
export function slidePngName(title: string, index: number, count: number): string {
  const base =
    [...(title || 'Slides')]
      .map(ch => (ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? ' ' : ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Slides';
  return `${base} - slide ${String(index + 1).padStart(Math.max(2, String(count).length), '0')}.png`;
}

/** Draw a slide to a PNG (browser only). The SVG goes through a data: URL, which keeps the canvas untainted. */
export async function slidePng(s: Slide, page?: { index: number; count: number }): Promise<Blob> {
  const img = new Image();
  img.decoding = 'async';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(slideSvg(s, page));
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_PNG_W;
  canvas.height = SLIDE_PNG_H;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The slide could not be drawn.'))), 'image/png'),
  );
}

/** Every slide as a PNG, packed into one ZIP (browser only). */
export async function deckPngZip(title: string, deck: DeckData): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  for (let k = 0; k < deck.slides.length; k++) {
    const blob = await slidePng(deck.slides[k], { index: k, count: deck.slides.length });
    files[slidePngName(title, k, deck.slides.length)] = new Uint8Array(await blob.arrayBuffer());
  }
  return new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: 'application/zip' });
}
