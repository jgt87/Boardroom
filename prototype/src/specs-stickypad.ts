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

/** Scale of the pad's content: it keeps its proportions inside the card. */
export const padScale = (pad: { w: number; h: number }) => Math.min(pad.w / PAD_SIZE[0], pad.h / PAD_SIZE[1]);

/** The top sheet in world coordinates. */
export function padSheet(pad: { x: number; y: number; w: number; h: number }): { x: number; y: number; s: number } {
  const k = padScale(pad);
  return { x: pad.x + k * PAD_INSET, y: pad.y + k * PAD_TITLE, s: k * PAD_NOTE };
}

/** The note a drag peels off the pad: the pad's colour, at the top sheet's position. */
export function peelNote(pad: Item, make: (x: number, y: number, fill: string) => Item): Item {
  const sheet = padSheet(pad);
  return { ...make(sheet.x, sheet.y, pad.fill), w: PAD_NOTE, h: PAD_NOTE, text: '' };
}

/**
 * Outlines of the top sheet's curled corner, in pad units (before the pad's scale). `amount` runs from 0 (a
 * flat sheet) to 1 (the resting curl), so a new top sheet can curl up after each peel.
 */
export function curlShapes(amount: number): {
  sheet: string;
  shadow: string;
  edge: string;
  /** Gradient line for `shadow`: darkest along the curled edge (x1, y1), clear at the bottom-right corner. */
  shade: { x1: number; y1: number; x2: number; y2: number };
} {
  const x = PAD_INSET,
    y = PAD_TITLE,
    s = PAD_NOTE,
    a = Math.max(0, amount),
    // The lifted corner sticks out past the sheet into the white card margin, but stays inside the card.
    curl = 34 * a,
    out = (PAD_INSET - 5) * a,
    tip = { x: x + s + out, y: y + s - curl + 6 * a },
    sag = 2 * a;
  return {
    sheet: `M${x},${y} H${x + s} V${y + s - curl - 12 * a} Q${x + s + a},${y + s - curl + 2 * a} ${tip.x},${tip.y} Q${x + s * 0.58},${y + s + sag} ${x},${y + s} Z`,
    // The next sheet, uncovered by the lifted corner: the area between the curled edge and the sheet's bottom
    // and right edges (cut to the paper stack where it is drawn). Shaded darkest under the edge.
    shadow: `M${x},${y + s} Q${x + s * 0.58},${y + s + sag} ${tip.x},${tip.y} L${tip.x},${y + s} Z`,
    edge: `M${tip.x},${tip.y} Q${x + s * 0.58},${y + s + sag} ${x},${y + s}`,
    shade: { x1: x + s * 0.62, y1: y + s - curl * 0.5, x2: x + s, y2: y + s },
  };
}

/** A lighter tint of the pad colour: the back of the curled corner catching the light. Stays visible on white. */
export function tintOf(fill: string): string {
  const n = parseInt(fill.slice(1), 16),
    f = (v: number) => Math.round(v + (255 - v) * 0.4);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
}

/** A darker shade of the pad colour (`factor` of each channel) for the stacked sheets under the top one. */
export function undersideOf(fill: string, factor = 0.82): string {
  const n = parseInt(fill.slice(1), 16),
    f = (v: number) => Math.round(v * factor);
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
}

/** The paper stack (top sheet plus the sheets' edge below it), in pad units: the curl's shadow is cut off here. */
export const STACK_CLIP = { x: PAD_INSET, y: PAD_TITLE, w: PAD_NOTE, h: PAD_NOTE + PAD_UNDERSIDE };
