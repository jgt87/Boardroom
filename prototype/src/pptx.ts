// PowerPoint import into Slides (item 84). Pure: reads slide titles and text in presentation order.
// Evidence: feature map (PPTX-to-Slides, November 2025). Images, layout, notes and animations are not imported.
// Uses the public fflate package; only small XML parts under ppt/ are decompressed.
import { unzipSync } from 'fflate';
import type { Slide } from './specs-activities.ts';
import { newSlide, DECK_MAX, SLIDE_TITLE_MAX, SLIDE_BODY_MAX } from './specs-activities.ts';

export const PPTX_MAX_BYTES = 50 * 1024 * 1024;
const PART_MAX = 5 * 1024 * 1024;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16))))
    .replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** Text of each paragraph in an XML fragment (runs joined, line breaks kept). */
export function paragraphs(xml: string): string[] {
  return [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
    .map(p =>
      [...p[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)]
        .map(m => (m[0].startsWith('<a:br') ? '\n' : decode(m[1])))
        .join(''),
    )
    .map(t => t.replace(/\s+$/g, ''))
    .filter(t => t.trim());
}

/** Title and body text of one slide part. */
export function slideFromXml(xml: string): Slide {
  let title = '',
    centred = false;
  const body: string[] = [];
  for (const m of xml.matchAll(/<p:(sp|graphicFrame)\b[\s\S]*?<\/p:\1>/g)) {
    const part = m[0],
      ph = part.match(/<p:ph\b[^>]*>/)?.[0],
      type = ph ? attr(ph, 'type') : undefined,
      text = paragraphs(part);
    if (!text.length) continue;
    if (!title && (type === 'title' || type === 'ctrTitle')) {
      title = text.join(' ');
      centred = type === 'ctrTitle';
    } else body.push(...text);
  }
  const layout = centred ? 'title' : !title && !body.length ? 'blank' : 'content';
  return newSlide(layout, {
    title: title.slice(0, SLIDE_TITLE_MAX),
    body: body.join('\n').slice(0, SLIDE_BODY_MAX),
  });
}

/** Slide part paths in presentation order. */
export function slideOrder(presentation: string, rels: string): string[] {
  const targets = new Map<string, string>();
  for (const r of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(r[0], 'Id'),
      target = attr(r[0], 'Target'),
      type = attr(r[0], 'Type') ?? '';
    if (id && target && /\/slide$/.test(type))
      targets.set(id, target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\//, '')}`);
  }
  return [...presentation.matchAll(/<p:sldId\b[^>]*>/g)]
    .map(s => targets.get(attr(s[0], 'r:id') ?? ''))
    .filter((p): p is string => !!p);
}

/** Parse a .pptx file into slides. Throws an Error with a user-readable message. */
export function parsePptx(bytes: Uint8Array): Slide[] {
  if (bytes.length > PPTX_MAX_BYTES) throw new Error('PowerPoint files up to 50 MB can be imported.');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: f =>
        f.originalSize <= PART_MAX &&
        (f.name === 'ppt/presentation.xml' ||
          f.name === 'ppt/_rels/presentation.xml.rels' ||
          /^ppt\/slides\/slide\d+\.xml$/.test(f.name)),
    });
  } catch {
    throw new Error('This file is not a PowerPoint (.pptx) presentation.');
  }
  const text = (name: string) => (files[name] ? new TextDecoder().decode(files[name]) : '');
  const presentation = text('ppt/presentation.xml');
  if (!presentation) throw new Error('This file is not a PowerPoint (.pptx) presentation.');
  let order = slideOrder(presentation, text('ppt/_rels/presentation.xml.rels'));
  if (!order.length)
    order = Object.keys(files)
      .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/g)!.pop()) - Number(b.match(/\d+/g)!.pop()));
  const slides = order
    .filter(n => files[n])
    .slice(0, DECK_MAX)
    .map(n => slideFromXml(text(n)));
  if (!slides.length) throw new Error('No slides were found in this presentation.');
  return slides;
}
