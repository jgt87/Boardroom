// Pure specs for essential and facilitation widgets (items 21–23, 27–29, 43–44).
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import { validateGrid, newGrid, gridText } from './grid.ts';
import type { GridData } from './grid.ts';
import { QR_MAX } from './qr.ts';
import { cardStatuses, tshirtSizes, isIsoDate } from './facilitation-widgets.ts';
import { isValidEmojiValue } from './emoji-data.ts';
import type { PollData, SpinnerData, ScaleData, MatrixData } from './facilitation-widgets.ts';

export const stampKinds = ['check', 'cross', 'star', 'thumbsup', 'question', 'heart', 'flag', 'warning'] as const;
export type StampKind = (typeof stampKinds)[number];
const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const num = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const fail = (message: string): never => {
  throw new Error(message);
};
const d = (i: Item) => (i.data ?? {}) as Record<string, any>;
const withData = (item: Item, data: Record<string, any>, extra: Partial<Item> = {}): Item => ({
  ...item,
  ...extra,
  data,
});

export const basicSpecs: WidgetSpec[] = [
  {
    kind: 'card',
    label: 'Card',
    description: 'Organize and assign work with status, owner, due date and estimate',
    category: 'Essentials',
    size: [280, 170],
    init: i =>
      withData(
        i,
        { description: '', assignee: '', due: '', status: 'Not started' },
        { text: 'New card', fill: '#4262ff' },
      ),
    validate: i => {
      const x = d(i);
      if (
        !str(x.description, 6000) ||
        !str(x.assignee, 6000) ||
        !str(x.due, 10) ||
        (x.due && !isIsoDate(x.due)) ||
        !str(x.status, 80) ||
        !x.status.trim() ||
        (!i.recordRef && !(cardStatuses as readonly string[]).includes(x.status))
      )
        fail('Invalid card details.');
      if (x.points !== undefined && !num(x.points, 0, 1000)) fail('Story points must be between 0 and 1,000.');
      if (x.size !== undefined && !(tshirtSizes as readonly string[]).includes(x.size)) fail('Invalid T-shirt size.');
    },
    searchText: i => [d(i).description, d(i).assignee].filter(Boolean).join(' '),
  },
  {
    kind: 'flipcard',
    label: 'Flip card',
    description: 'Double-sided card for revealing content',
    category: 'Essentials',
    size: [240, 160],
    init: i => withData(i, { back: '', flipped: false }, { text: 'Front', fill: '#a8cdff' }),
    validate: i => {
      const x = d(i);
      if (!str(x.back, 6000) || typeof x.flipped !== 'boolean') fail('Invalid flip card.');
    },
    searchText: i => d(i).back ?? '',
  },
  {
    kind: 'grid',
    label: 'Grid',
    description: 'Organize information in rows and columns with merged cells',
    category: 'Essentials',
    size: [420, 200],
    init: i => withData(i, newGrid(3, 3), { fill: '#ffffff' }),
    validate: i => validateGrid(i.data),
    searchText: i => gridText(i.data as GridData),
  },
  {
    kind: 'divider',
    label: 'Divider',
    description: 'Separate areas with a horizontal or vertical line',
    category: 'Essentials',
    size: [400, 24],
    init: i => withData(i, { orientation: 'horizontal', style: 'solid', weight: 2 }, { fill: '#25252a' }),
    validate: i => {
      const x = d(i);
      if (
        !['horizontal', 'vertical'].includes(x.orientation) ||
        !['solid', 'dashed', 'dotted'].includes(x.style) ||
        !num(x.weight, 1, 16)
      )
        fail('Invalid divider.');
    },
  },
  {
    kind: 'stamp',
    label: 'Stamp',
    description: 'Mark ideas with a check, star, flag and other badges',
    category: 'Collaboration',
    size: [72, 72],
    init: i => withData(i, { stamp: 'check' }, { fill: '#2c9f5b' }),
    validate: i => {
      const s = d(i);
      if (s.stamp === 'emoji') {
        if (!isValidEmojiValue(s.emoji)) fail('Invalid emoji stamp.');
      } else if (!(stampKinds as readonly string[]).includes(s.stamp)) fail('Unknown stamp.');
    },
  },
  {
    kind: 'icon',
    label: 'Icon',
    description: 'Search and add recolourable icons (Lucide icon set, ISC licence)',
    category: 'Essentials',
    size: [72, 72],
    init: i => withData(i, { name: 'Star' }, { fill: '#25252a' }),
    validate: i => {
      const n = d(i).name;
      if (typeof n !== 'string' || !/^[A-Z][A-Za-z0-9]*$/.test(n) || n.length > 60) fail('Invalid icon name.');
    },
    searchText: i => d(i).name ?? '',
  },
  {
    kind: 'qr',
    label: 'QR code',
    description: 'Generate a scannable QR code from a link or text',
    category: 'Essentials',
    size: [180, 180],
    init: i => withData(i, { color: '#25252a', quiet: 2 }, { text: 'https://example.com', fill: '#ffffff' }),
    validate: i => {
      const x = d(i);
      if (!i.text || i.text.length > QR_MAX)
        fail(`QR content must be 1 to ${QR_MAX.toLocaleString('en-US')} characters.`);
      if (!hex(x.color) || !num(x.quiet, 0, 8) || !Number.isInteger(x.quiet)) fail('Invalid QR style.');
    },
  },
  {
    kind: 'matrix',
    label: '2×2 matrix',
    description: 'Prioritize ideas by placing them on two axes',
    category: 'Planning',
    size: [640, 480],
    init: i =>
      withData(
        i,
        {
          xLabel: 'Effort',
          yLabel: 'Impact',
          quadrants: ['Quick wins', 'Major projects', 'Fill-ins', 'Thankless tasks'],
        } as MatrixData,
        { text: 'Prioritization', fill: '#ffffff' },
      ),
    validate: i => {
      const x = d(i);
      if (
        !str(x.xLabel, 80) ||
        !str(x.yLabel, 80) ||
        !Array.isArray(x.quadrants) ||
        x.quadrants.length !== 4 ||
        x.quadrants.some((q: unknown) => !str(q, 80))
      )
        fail('Invalid matrix labels.');
    },
    searchText: i => [d(i).xLabel, d(i).yLabel, ...(d(i).quadrants ?? [])].join(' '),
  },
  {
    kind: 'poll',
    label: 'Poll',
    description: 'Collect votes on a question (on this device)',
    category: 'Collaboration',
    size: [320, 240],
    init: i =>
      withData(
        i,
        {
          question: 'Which option should we pick?',
          options: ['Option A', 'Option B', 'Option C'].map(label => ({ id: crypto.randomUUID(), label, votes: 0 })),
        } as PollData,
        { fill: '#ffffff' },
      ),
    validate: i => {
      const x = d(i);
      if (!str(x.question, 300) || !Array.isArray(x.options) || x.options.length < 2 || x.options.length > 12)
        fail('A poll needs 2 to 12 options.');
      if (
        x.options.some(
          (o: any) =>
            !o ||
            typeof o.id !== 'string' ||
            !str(o.label, 120) ||
            !Number.isInteger(o.votes) ||
            o.votes < 0 ||
            o.votes > 1e6,
        ) ||
        new Set(x.options.map((o: any) => o.id)).size !== x.options.length
      )
        fail('Invalid poll option.');
    },
    searchText: i => [d(i).question, ...(d(i).options ?? []).map((o: any) => o.label)].join(' '),
  },
  {
    kind: 'spinner',
    label: 'Spinner wheel',
    description: 'Pick an option at random from a spinning wheel',
    category: 'Collaboration',
    size: [280, 320],
    init: i => withData(i, { options: ['Alex', 'Sam', 'Jordan', 'Riley'] } as SpinnerData, { fill: '#ffffff' }),
    validate: i => {
      const x = d(i);
      if (
        !Array.isArray(x.options) ||
        !x.options.length ||
        x.options.length > 24 ||
        x.options.some((o: unknown) => !str(o, 60)) ||
        (x.result !== undefined && !str(x.result, 60))
      )
        fail('A spinner needs 1 to 24 options.');
    },
    searchText: i => (d(i).options ?? []).join(' '),
  },
  {
    kind: 'scale',
    label: 'Alignment scale',
    description: 'Gauge agreement with a marker on a scale',
    category: 'Collaboration',
    size: [380, 140],
    init: i =>
      withData(
        i,
        {
          label: 'How aligned are we?',
          min: 1,
          max: 5,
          value: 3,
          leftLabel: 'Not aligned',
          rightLabel: 'Fully aligned',
        } as ScaleData,
        { fill: '#ffffff' },
      ),
    validate: i => {
      const x = d(i);
      if (
        !str(x.label, 200) ||
        !str(x.leftLabel, 60) ||
        !str(x.rightLabel, 60) ||
        !Number.isInteger(x.min) ||
        !Number.isInteger(x.max) ||
        x.min >= x.max ||
        x.max - x.min > 100 ||
        !Number.isInteger(x.value) ||
        x.value < x.min ||
        x.value > x.max
      )
        fail('Invalid scale.');
    },
    searchText: i => [d(i).label, d(i).leftLabel, d(i).rightLabel].join(' '),
  },
];
