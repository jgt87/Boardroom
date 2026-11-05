// Estimate palette and dot pile widgets (track F). Their chips are dragged onto cards, sticky notes and other
// objects; see chip-rules.ts and chips.ts. Pure specs.
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import { dotColors, validateDotPile, validateEstimatePalette } from './chip-rules.ts';
import type { DotPileData, EstimatePaletteData } from './chip-rules.ts';

export const chipSpecs: WidgetSpec[] = [
  {
    kind: 'estimates',
    label: 'Estimate chips',
    description: 'Story point or T-shirt size chips to drag onto cards and sticky notes',
    category: 'Planning',
    size: [456, 104],
    init: (i: Item) => ({ ...i, fill: '#ffffff', data: { scale: 'points' } satisfies EstimatePaletteData }),
    validate: validateEstimatePalette,
  },
  {
    kind: 'dotpile',
    label: 'Dot pile',
    description: 'Voting dots to drag onto any object',
    category: 'Collaboration',
    size: [280, 136],
    init: (i: Item) => ({
      ...i,
      fill: '#ffffff',
      data: { title: 'Votes', total: 5, color: dotColors[0]! } satisfies DotPileData,
    }),
    validate: validateDotPile,
    searchText: (i: Item) => (i.data as DotPileData | undefined)?.title ?? '',
  },
];
