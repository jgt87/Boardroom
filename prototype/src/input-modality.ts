// Which input the person is using right now: `html[data-input="keyboard" | "pointer"]`. Browsers guess
// `:focus-visible` from the last interaction, so after typing in a note a later focus move onto the canvas
// can show its full-board focus ring even though the mouse was used. The canvas ring keys off this instead:
// navigation keys switch to keyboard mode, any pointer press switches back. Pure DOM, no React.
const NAVIGATION = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'F6',
]);

export function trackInputModality(root: HTMLElement = document.documentElement): () => void {
  const set = (mode: 'keyboard' | 'pointer') => {
    if (root.dataset.input !== mode) root.dataset.input = mode;
  };
  const key = (e: KeyboardEvent) => {
    if (NAVIGATION.has(e.key)) set('keyboard');
  };
  const pointer = () => set('pointer');
  set('pointer');
  addEventListener('keydown', key, true);
  addEventListener('pointerdown', pointer, true);
  return () => {
    removeEventListener('keydown', key, true);
    removeEventListener('pointerdown', pointer, true);
  };
}
