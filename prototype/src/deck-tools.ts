// Slides from frames and deck PDF export (gap G13).
// framesToDeck is pure; deckPdf runs in the browser (jsPDF, real text, one landscape page per slide).
import type { Board, Item } from './model.ts';
import { createItem } from './model.ts';
import { newSlide, DECK_MAX, SLIDE_BODY_MAX, SLIDE_TITLE_MAX } from './specs-activities.ts';
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
    const body =
      [s.body, s.body2].filter(Boolean).join('\n\n') +
      (s.options?.length ? '\n' + s.options.map(o => `- ${o.label}`).join('\n') : '');
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
