// Sticky stack (item 110): a card holding a pad of sticky notes. Dragging from the pad peels off a new
// note of the pad's colour; the pad stays, so any number of notes can be taken. Dragging the card's title
// area moves the stack. Pure spec.
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';

/** Pad geometry inside the card, in world units. */
export const PAD_NOTE = 200;
export const PAD_INSET = 20;
export const PAD_TITLE = 64;
export const PAD_UNDERSIDE = 16;
export const PAD_SIZE: [number, number] = [PAD_NOTE + 2 * PAD_INSET, PAD_TITLE + PAD_NOTE + PAD_UNDERSIDE + PAD_INSET];

export const stickypadSpec: WidgetSpec = {
  kind: 'stickypad',
  label: 'Sticky stack',
  description: 'A pad of sticky notes: drag from it to take a new note',
  category: 'Essentials',
  size: PAD_SIZE,
  init: (i: Item) => ({ ...i, data: {} }),
  validate: (i: Item) => {
    if (!/^#[0-9a-f]{6}$/i.test(i.fill)) throw new Error('Invalid sticky stack colour.');
  },
};

/** The note a drag peels off the pad: the pad's colour, at the top sheet's position. */
export function peelNote(pad: Item, make: (x: number, y: number, fill: string) => Item): Item {
  return { ...make(pad.x + PAD_INSET, pad.y + PAD_TITLE, pad.fill), w: PAD_NOTE, h: PAD_NOTE, text: '' };
}

/** A darker shade of the pad colour for the pad's underside. */
export function undersideOf(fill: string): string {
  const n = parseInt(fill.slice(1), 16),
    f = (v: number) => Math.round(v * 0.82);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
}
