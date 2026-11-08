// Command palette matching (item 105). Pure.
export type Command = { id: string; label: string; group: string; keywords?: string; shortcut?: string };

/**
 * Commands whose label, group or keywords contain every word of the query (case-insensitive).
 * Labels that start with the query rank first, then labels containing it, then keyword matches.
 */
export function matchCommands<T extends Command>(commands: T[], query: string, limit = 50): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands.slice(0, limit);
  const q = words.join(' ');
  return commands
    .map(c => {
      const label = c.label.toLowerCase(),
        hay = `${label} ${c.group.toLowerCase()} ${(c.keywords ?? '').toLowerCase()}`;
      if (!words.every(w => hay.includes(w))) return null;
      return { c, score: label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2 };
    })
    .filter((x): x is { c: T; score: number } => !!x)
    .sort((a, b) => a.score - b.score || a.c.label.localeCompare(b.c.label))
    .slice(0, limit)
    .map(x => x.c);
}

/** The board details the palette needs (a subset of `BoardMeta` in board-library.ts). */
export type PaletteBoard = { id: string; title: string; updatedAt: string; space?: string; deletedAt?: string };
/**
 * "Open board" commands for the most recently edited live boards, except the open one (decision R1-Q3,
 * 2026-11-08). They match on the title, the space and the words "board", "open", "recent" and "switch".
 */
export function recentBoardCommands(boards: PaletteBoard[], activeId: string, limit = 20): Command[] {
  return boards
    .filter(b => b.id !== activeId && !b.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(b => ({
      id: `board:${b.id}`,
      label: `Open board: ${b.title || 'Untitled board'}`,
      group: 'Boards',
      keywords: `recent switch ${b.space ?? ''}`.trim(),
    }));
}
