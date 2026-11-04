// Links to objects (track R1): "Copy link to object" writes `#board=<id>&item=<id>` (or `frame=`) to the
// clipboard, and opening the app with such a hash opens that board, selects the object and reveals it.
import { useEffect, useRef, useState } from 'react';
import type { Item } from './model';
import type { BoardCore } from './board-app';
import { deepLinkHash, deepLinkTarget, parseDeepLink, type DeepLink } from './access-tools';
import { describeItem } from './navigation';
import { announce } from './announce';
import { useLatest } from './use-latest';

/**
 * Copy text to the clipboard. The async clipboard API exists only in secure contexts; plain HTTP on the
 * LAN falls back to a hidden textarea and `execCommand('copy')`. Resolves to whether the copy worked.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or document not focused: try the fallback below.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  const focused = document.activeElement as HTMLElement | null;
  document.body.appendChild(area);
  area.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  focused?.focus?.();
  return ok;
}

/** Full URL of a link to an object on the open board. */
export const objectLink = (item: Item, boardId: string) =>
  `${location.origin}${location.pathname}${location.search}${deepLinkHash(item, boardId)}`;

export function useDeepLinks(core: BoardCore) {
  const { board, library, boardActions, setSelected, fit, display } = core;
  const pending = useRef<DeepLink | null>(null),
    [tick, setTick] = useState(0),
    latest = useLatest({ library, boardActions });
  useEffect(() => {
    const read = () => {
      const link = parseDeepLink(location.hash);
      if (!link) return;
      pending.current = link;
      const lib = latest.current.library;
      if (link.board && link.board !== lib.activeId && lib.boards.some(b => b.id === link.board && !b.deletedAt))
        latest.current.boardActions.open(link.board);
      setTick(t => t + 1);
    };
    read();
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, [latest]);
  useEffect(() => {
    const link = pending.current;
    if (!link) return;
    // Wait until the linked board is open.
    if (link.board && link.board !== library.activeId && library.boards.some(b => b.id === link.board && !b.deletedAt))
      return;
    pending.current = null;
    history.replaceState(null, '', location.pathname + location.search);
    const target = deepLinkTarget(board, link);
    if (!target) {
      display('The linked object is not on this board.');
      return;
    }
    setSelected([target.id]);
    if (!target.hidden) fit([target]);
    announce(describeItem(target));
    // Only the arrival of a link (tick) or a board switch should apply it, not every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, library.activeId]);
}
