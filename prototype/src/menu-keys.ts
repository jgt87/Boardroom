// Keyboard model shared by every menu and pop-up (item 142; CommonShared el-menu Behaviour). Pure: no React, no
// DOM. Up/Down wrap, Home/End jump; anything else is not a menu key.

/** Index the focus moves to for `key` from row `index` of `count` rows, or null when the key is not handled. */
export function menuKeyTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  const from = index < 0 ? (key === 'ArrowUp' ? count : -1) : index;
  if (key === 'ArrowDown') return (from + 1) % count;
  if (key === 'ArrowUp') return (from - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
