// Action Shortcut widget (item 99): a button on the board that runs one action. Pure spec.
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';

// Actions are grouped for the picker (track R1-E); each one runs an action the board already offers elsewhere.
export const shortcutActions = [
  { id: 'link', label: 'Open a link', group: 'Navigate' },
  { id: 'frame', label: 'Go to a frame', group: 'Navigate' },
  { id: 'fit', label: 'Fit the board to the screen', group: 'Navigate' },
  { id: 'search', label: 'Find on the board', group: 'Navigate' },
  { id: 'present', label: 'Start presenting', group: 'Present' },
  { id: 'frames', label: 'Open frames and presentation', group: 'Present' },
  { id: 'timer', label: 'Open the timer', group: 'Facilitate' },
  { id: 'voting', label: 'Open dot voting', group: 'Facilitate' },
  { id: 'comments', label: 'Open comments', group: 'Facilitate' },
  { id: 'private', label: 'Turn private mode on or off', group: 'Facilitate' },
  { id: 'layers', label: 'Open layers', group: 'Panels' },
  { id: 'outline', label: 'Open the board outline', group: 'Panels' },
  { id: 'minimap', label: 'Show or hide the minimap', group: 'Panels' },
  { id: 'commands', label: 'Open commands', group: 'Panels' },
  { id: 'grid', label: 'Show or hide the grid', group: 'View' },
  { id: 'viewonly', label: 'Turn view only on or off', group: 'View' },
  { id: 'tool-note', label: 'Add a sticky note', group: 'Create' },
  { id: 'tool-text', label: 'Add text', group: 'Create' },
  { id: 'tool-pen', label: 'Draw with the pen', group: 'Create' },
  { id: 'tool-comment', label: 'Add a comment', group: 'Create' },
  { id: 'export-png', label: 'Export the board as PNG', group: 'Export' },
  { id: 'export-pdf', label: 'Export as PDF', group: 'Export' },
] as const;
export type ShortcutAction = (typeof shortcutActions)[number]['id'];
/** Actions in picker order, grouped by their `group`. */
export function shortcutGroups(): { group: string; actions: (typeof shortcutActions)[number][] }[] {
  const out: { group: string; actions: (typeof shortcutActions)[number][] }[] = [];
  for (const a of shortcutActions) {
    const g = out.find(x => x.group === a.group);
    if (g) g.actions.push(a);
    else out.push({ group: a.group, actions: [a] });
  }
  return out;
}
/** Actions that use `target` (a web address or a frame id); the others store an empty target. */
export const shortcutUsesTarget = (action: ShortcutAction) => action === 'link' || action === 'frame';
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
  description: 'A button that runs a board action: open a link or panel, go to a frame, present, vote or export',
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
