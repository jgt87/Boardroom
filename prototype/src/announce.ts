// Screen-reader announcements through one polite live region (gap F3). The region is rendered by
// board-chrome.tsx; this module only writes to it, so it can be called from anywhere.
export function announce(text: string) {
  const region = typeof document !== 'undefined' ? document.getElementById('sr-announcer') : null;
  if (!region) return;
  // Clear first so repeating the same text is announced again.
  region.textContent = '';
  setTimeout(() => (region.textContent = text), 30);
}
