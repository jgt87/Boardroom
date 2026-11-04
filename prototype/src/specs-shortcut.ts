// Action Shortcut widget (item 99): a button on the board that runs one action. Pure spec.
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';

export const shortcutActions = [
  { id: 'link', label: 'Open a link' },
  { id: 'frame', label: 'Go to a frame' },
  { id: 'present', label: 'Start presenting' },
  { id: 'timer', label: 'Open the timer' },
] as const;
export type ShortcutAction = (typeof shortcutActions)[number]['id'];
export type ShortcutData = { action: ShortcutAction; target: string };
export const SHORTCUT_EVENT = 'boardroom:shortcut';

const fail = (message: string): never => {
  throw new Error(message);
};
/** Only web links may be opened; anything else (javascript:, data:, file:) is refused. */
export const isSafeLink = (url: string) => {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

export const shortcutSpec: WidgetSpec = {
  kind: 'shortcut',
  label: 'Action Shortcut',
  description: 'A button that opens a link, jumps to a frame, starts presenting or opens the timer',
  category: 'Collaboration',
  size: [200, 56],
  init: (i: Item) => ({
    ...i,
    text: 'Start presenting',
    fill: '#4262ff',
    data: { action: 'present', target: '' } satisfies ShortcutData,
  }),
  validate: (i: Item) => {
    const d = (i.data ?? {}) as ShortcutData;
    if (!shortcutActions.some(a => a.id === d.action) || typeof d.target !== 'string' || d.target.length > 2000)
      fail('Invalid action shortcut.');
    if (d.action === 'link' && d.target && !isSafeLink(d.target)) fail('Action shortcut links must be web addresses.');
    if (typeof i.text !== 'string' || !i.text.trim() || i.text.length > 80)
      fail('Action shortcuts need a 1–80 character label.');
  },
};
