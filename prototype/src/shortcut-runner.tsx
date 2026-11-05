// Runs Action Shortcut buttons (item 99, extended in track R1-E). A shortcut on the board dispatches a window
// event; this component answers it with the board actions the rest of the app already offers.
import { useEffect } from 'react';
import { useApp } from './board-app';
import { useExporters } from './use-exporters';
import { useLatest } from './use-latest';
import { presentationFrames } from './navigation';
import { selectionBounds } from './interactions';
import { setPrivate } from './board-tools';
import { withBoardMode } from './board-modes';
import { SHORTCUT_EVENT, type ShortcutData } from './specs-shortcut';

export function ShortcutRunner() {
  const app = useApp();
  const { exportRaster, exportPdf } = useExporters();
  const runAction = useLatest((d: ShortcutData) => {
    const {
      boardRef,
      display,
      setSelected,
      fit,
      startPresenting,
      setTimerOn,
      setPresentPanel,
      setSearchOpen,
      setFacil,
      setOutline,
      setBoardOutline,
      setMinimap,
      setCommandsOpen,
      viewPrefs,
      setViewPrefs,
      update,
      run,
      setTool,
      setEditing,
      setPendingPlacement,
      presenting,
    } = app;
    const board = boardRef.current;
    const arm = (tool: 'note' | 'text' | 'pen' | 'comment', message: string) => {
      setPendingPlacement(null);
      setEditing(null);
      setSelected([]);
      setTool(tool);
      display(message);
    };
    switch (d.action) {
      case 'link':
        return;
      case 'frame': {
        const frame = board.items.find(i => i.id === d.target && i.type === 'frame');
        if (!frame) return display('The frame for this shortcut no longer exists.');
        setSelected([frame.id]);
        return fit([frame]);
      }
      case 'fit':
        return fit();
      case 'search':
        return setSearchOpen(true);
      case 'present':
        if (presenting) return;
        if (presentationFrames(board).length) return startPresenting(0);
        return display('Add a frame to present.');
      case 'frames':
        return setPresentPanel(true);
      case 'timer':
        return setTimerOn(true);
      case 'voting':
        return setFacil('voting');
      case 'comments':
        return setFacil('comments');
      case 'private': {
        const on = !board.privateMode?.all;
        run(b => setPrivate(b, 'all', on));
        return display(on ? 'Private mode is on: sticky notes are hidden.' : 'Private mode is off.');
      }
      case 'layers':
        return setOutline(true);
      case 'outline':
        return setBoardOutline(true);
      case 'minimap':
        return setMinimap(m => !m);
      case 'commands':
        return setCommandsOpen(true);
      case 'grid':
        return setViewPrefs({ grid: !viewPrefs.grid });
      case 'viewonly': {
        const next = withBoardMode(board, board.viewOnly ? 'edit' : 'view');
        update(next);
        return display(next.viewOnly ? 'View only: editing is off for this board.' : 'Editing is on again.');
      }
      case 'tool-note':
        return arm('note', 'Click the board to add a sticky note.');
      case 'tool-text':
        return arm('text', 'Click the board to add text.');
      case 'tool-pen':
        return arm('pen', 'Draw on the board with the pen.');
      case 'tool-comment':
        return arm('comment', 'Click the board to add a comment.');
      case 'export-png': {
        const b = selectionBounds(
          board.items,
          board.items.map(i => i.id),
        );
        if (!b) return display('The board is empty.');
        return void exportRaster('image/png', 2, { x: b.x - 20, y: b.y - 20, w: b.w + 40, h: b.h + 40 });
      }
      case 'export-pdf':
        return void exportPdf();
    }
  });
  useEffect(() => {
    const handle = (e: Event) => runAction.current((e as CustomEvent<ShortcutData>).detail);
    window.addEventListener(SHORTCUT_EVENT, handle);
    return () => window.removeEventListener(SHORTCUT_EVENT, handle);
  }, [runAction]);
  return null;
}
