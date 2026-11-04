import { selectionBounds } from './interactions';
import { useEffect } from 'react';
import { undo, redo, createItem } from './model';
import { translate } from './interactions';
import { clearContent, duplicateItems, expandGroups, moveIds, reorderZ } from './arrange';
import { gridOwner } from './grid-canvas';
import { copyStyle, pasteStyle, styleClipboard } from './switch-type';
import {
  boardSummary,
  describeItem,
  firstInFrame,
  frameAroundItem,
  nearestInDirection,
  stepInOrder,
} from './navigation';
import { announce } from './announce';
import type { BoardCore } from './board-app';
import { tools } from './board-app';
import { isShapeKind } from './shapes';

/** Global keyboard shortcuts (tools, undo/redo, clipboard-style commands, arrows, Escape). */
export function useKeyboardShortcuts(core: BoardCore, gestures: { cancelGesture: () => void }) {
  const {
    setContextMenu,
    viewPrefs,
    setCommandsOpen,
    camera,
    svg,
    toWorld,
    boardRef,
    codeId,
    cropId,
    deleteSelection,
    display,
    duplicate,
    fit,
    formatId,
    gesture,
    groupNow,
    mindEditId,
    openEditor,
    presenting,
    previewStart,
    selected,
    selectedItem,
    setBulk,
    setCamera,
    setEditing,
    setEraser,
    setGallery,
    setHelp,
    setHistory,
    setMenu,
    setMindEditId,
    setSearchOpen,
    setSelected,
    setShapes,
    setTool,
    space,
    toggleLock,
    ungroupNow,
    update,
    widgetEditId,
    editSeed,
    tool,
    setPendingPlacement,
    zoom,
    size,
    setPanel,
    setViewPrefs,
    setMinimap,
  } = core;
  const { cancelGesture } = gestures;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        !formatId &&
        !widgetEditId &&
        !mindEditId &&
        !presenting &&
        !previewStart &&
        e.key === 'F2' &&
        selected.length === 1 &&
        selectedItem?.type === 'mindmap' &&
        !selectedItem.locked
      ) {
        e.preventDefault();
        setMindEditId(selectedItem.id);
        return;
      }
      if (
        formatId ||
        cropId ||
        codeId ||
        widgetEditId ||
        mindEditId ||
        presenting ||
        previewStart ||
        (e.target as HTMLElement).closest?.(
          'input,textarea,select,[contenteditable=true],.minimap,.kanban-preview,video,iframe,.widget-interactive',
        )
      )
        return;
      const key = e.key.toLowerCase(),
        mod = e.ctrlKey || e.metaKey;
      // Command palette (item 105).
      if (mod && !e.altKey && (key === 'k' || key === '/')) {
        e.preventDefault();
        setCommandsOpen(o => !o);
        return;
      }
      if (gesture.current) {
        if (key === 'escape') {
          e.preventDefault();
          cancelGesture();
        }
        return;
      }
      if (
        !mod &&
        !e.altKey &&
        e.key.length === 1 &&
        e.key !== ' ' &&
        tool === 'select' &&
        selected.length === 1 &&
        selectedItem &&
        !selectedItem.locked &&
        !gridOwner(boardRef.current, selectedItem.id)?.locked &&
        (['note', 'text'].includes(selectedItem.type) || isShapeKind(selectedItem.type))
      ) {
        e.preventDefault();
        editSeed.current = { id: selectedItem.id, text: e.key };
        setEditing(selectedItem.id);
        return;
      }
      if (
        key === 'tab' &&
        !e.shiftKey &&
        !mod &&
        !e.altKey &&
        selected.length === 1 &&
        selectedItem?.type === 'card' &&
        !selectedItem.locked
      ) {
        e.preventDefault();
        const card = createItem('card', selectedItem.x + selectedItem.w + 24, selectedItem.y, selectedItem.fill);
        card.text = '';
        update({ ...boardRef.current, items: [...boardRef.current.items, card] });
        setSelected([card.id]);
        setTimeout(() => document.querySelector<HTMLInputElement>(`[data-item="${card.id}"] input`)?.focus(), 0);
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        space.current = true;
      }
      if (mod && e.altKey && (key === 'c' || key === 'v') && selected.length) {
        // Copy and paste style (gap D7).
        e.preventDefault();
        if (key === 'c') {
          if (selectedItem && selected.length === 1) {
            styleClipboard.current = copyStyle(selectedItem);
            display('Style copied.');
          }
        } else if (styleClipboard.current) {
          const r = pasteStyle(boardRef.current, selected, styleClipboard.current);
          if (r.styled) update(r.board);
        }
        return;
      }
      // Keyboard object navigation (gap F1, F2): Tab / Shift+Tab in reading order while the board has focus,
      // Ctrl+Arrow to the nearest object in that direction, Alt+S for a board summary.
      const reveal = (id: string) => {
        const it = boardRef.current.items.find(i => i.id === id);
        if (!it) return;
        setSelected([id]);
        const sx = (it.x + it.w / 2) * camera.z + camera.x,
          sy = (it.y + it.h / 2) * camera.z + camera.y;
        if (sx < 60 || sy < 60 || sx > size.w - 60 || sy > size.h - 60)
          setCamera(c => ({ ...c, x: size.w / 2 - (it.x + it.w / 2) * c.z, y: size.h / 2 - (it.y + it.h / 2) * c.z }));
        announce(describeItem(it));
      };
      const active = document.activeElement;
      const onBoard = !active || active === document.body || !!svg.current?.contains(active);
      if (key === 'tab' && !mod && !e.altKey && onBoard && boardRef.current.items.length) {
        e.preventDefault();
        const next = stepInOrder(boardRef.current, selected.length === 1 ? selected[0] : undefined, e.shiftKey);
        if (next) reveal(next);
        return;
      }
      if (mod && e.shiftKey && !e.altKey && (key === 'arrowdown' || key === 'arrowup') && selected.length === 1) {
        e.preventDefault();
        const next =
          key === 'arrowdown'
            ? firstInFrame(boardRef.current, selected[0])
            : frameAroundItem(boardRef.current, selected[0]);
        if (next) reveal(next);
        else announce(key === 'arrowdown' ? 'Nothing inside to enter.' : 'Not inside a frame.');
        return;
      }
      if (mod && !e.shiftKey && !e.altKey && key.startsWith('arrow') && selected.length === 1) {
        e.preventDefault();
        const next = nearestInDirection(
          boardRef.current,
          selected[0],
          key.slice(5) as 'left' | 'right' | 'up' | 'down',
        );
        if (next) reveal(next);
        else announce('No object in that direction.');
        return;
      }
      if (e.altKey && !mod && key === 's') {
        e.preventDefault();
        announce(boardSummary(boardRef.current));
        display(boardSummary(boardRef.current));
        return;
      }
      if (mod && e.altKey && key === 'k' && selected.length === 1) {
        // Add or edit a link on the selected object (gap F6).
        e.preventDefault();
        setPanel('link');
        return;
      }
      if (mod && key === 'z') {
        e.preventDefault();
        setEditing(null);
        setHistory(h => (e.shiftKey ? redo(h) : undo(h)));
      } else if (mod && key === 'y') {
        e.preventDefault();
        setHistory(redo);
      } else if (mod && key === 'a') {
        e.preventDefault();
        setSelected(boardRef.current.items.map(i => i.id));
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (mod && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupNow();
        else groupNow();
      } else if (mod && e.shiftKey && key === 'l') {
        e.preventDefault();
        toggleLock();
      } else if ((key === 'pageup' || key === 'pagedown') && selected.length) {
        // PgUp front, Shift+PgUp forward, PgDn back, Shift+PgDn backward (gap F6).
        e.preventDefault();
        const how = key === 'pageup' ? (e.shiftKey ? 'forward' : 'front') : e.shiftKey ? 'backward' : 'back';
        update(reorderZ(boardRef.current, selected, how));
      } else if (mod && (key === '=' || key === '+' || key === '-' || key === '_')) {
        // Ctrl+plus / Ctrl+minus zoom the board instead of the page (gap F5).
        e.preventDefault();
        zoom(key === '-' || key === '_' ? 1 / 1.2 : 1.2);
      } else if (mod && (key === 'backspace' || key === 'delete') && selected.length) {
        // Clear object contents (gap D6).
        e.preventDefault();
        const r = clearContent(boardRef.current, selected);
        if (r.cleared) update(r.board);
        else display('Nothing to clear in the selection.');
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (key === 'contextmenu' || (e.shiftKey && key === 'f10')) {
        e.preventDefault();
        const b = selectionBounds(boardRef.current.items, selected),
          r = svg.current!.getBoundingClientRect(),
          sx = b ? (b.x + b.w / 2) * camera.z + camera.x + r.left : r.left + r.width / 2,
          sy = b ? (b.y + b.h / 2) * camera.z + camera.y + r.top : r.top + r.height / 2;
        setContextMenu({ x: sx, y: sy, world: toWorld(sx, sy), onItem: selected.length > 0 });
      } else if (key === 'escape') {
        setPendingPlacement(null);
        setSelected([]);
        setEditing(null);
        setTool('select');
        setHelp(false);
        setMenu(false);
        setGallery(null);
        setShapes(false);
        setBulk(false);
      } else if (key === 'enter' && mod && e.shiftKey && selected.length === 1 && selectedItem?.type === 'card') {
        // Card panel (item 115).
        e.preventDefault();
        openEditor(selectedItem.id);
      } else if (key === 'enter' && selected.length === 1 && selectedItem && selectedItem.type !== 'pen') {
        e.preventDefault();
        openEditor(selectedItem.id);
      } else if (key.startsWith('arrow') && e.altKey && !mod && selected.length) {
        // Alt+arrow duplicates the selection next to itself (gap F6).
        e.preventDefault();
        const ids = expandGroups(boardRef.current, selected),
          b = selectionBounds(boardRef.current.items, ids);
        if (!b) return;
        const gap = 24,
          offset = {
            x: key === 'arrowright' ? b.w + gap : key === 'arrowleft' ? -(b.w + gap) : 0,
            y: key === 'arrowdown' ? b.h + gap : key === 'arrowup' ? -(b.h + gap) : 0,
          };
        const next = duplicateItems(boardRef.current, ids, offset);
        update(next.board);
        setSelected(next.ids);
      } else if (key.startsWith('arrow') && !selected.length && !mod) {
        // Arrow keys pan the board when nothing is selected (gap F5).
        e.preventDefault();
        const d = e.shiftKey ? 240 : 60;
        setCamera(c => ({
          ...c,
          x: c.x + (key === 'arrowleft' ? d : key === 'arrowright' ? -d : 0),
          y: c.y + (key === 'arrowup' ? d : key === 'arrowdown' ? -d : 0),
        }));
      } else if (key.startsWith('arrow') && selected.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1,
          ids = moveIds(boardRef.current, selected);
        if (!ids.length) {
          display('Locked objects cannot be moved.');
          return;
        }
        update(
          translate(boardRef.current, ids, {
            x: key === 'arrowright' ? d : key === 'arrowleft' ? -d : 0,
            y: key === 'arrowdown' ? d : key === 'arrowup' ? -d : 0,
          }),
        );
      } else if (!mod && !e.altKey && !viewPrefs.singleKeys && key.length === 1 && key !== '?') {
        // Single-character shortcuts are off (item 104): plain letters do nothing.
      } else if (!mod && !e.altKey && e.shiftKey && key === 'c') {
        // Show or hide comments on the board (gap F6).
        setViewPrefs({ comments: !viewPrefs.comments });
      } else if (!mod && !e.altKey && key === 'e') {
        // Eraser (gap F6).
        setTool('pen');
        setEraser(true);
      } else if (!mod && !e.altKey && key === 's') {
        // Shapes and lines (gap F6).
        setShapes(s => !s);
      } else if (!mod && !e.altKey && key === 'g') {
        setViewPrefs({ grid: !viewPrefs.grid });
      } else if (!mod && !e.altKey && key === 'm') {
        setMinimap(v => !v);
      } else if (!mod && !e.altKey && key === 'c') {
        setTool('comment');
        setEditing(null);
      } else if (!mod && !e.altKey) {
        const t = tools.find(t => t.key.toLowerCase() === key);
        if (t) {
          setTool(t.id);
          setEditing(null);
          setEraser(false);
        }
        if (key === '?') setHelp(h => !h);
      }
      if (mod && key === '0') {
        e.preventDefault();
        setCamera(c => ({ ...c, z: 1 }));
      }
      if (e.altKey && key === '1') {
        e.preventDefault();
        fit();
      }
      if (e.altKey && key === '2' && selected.length) {
        // Zoom to the selection (gap F6).
        e.preventDefault();
        fit(boardRef.current.items.filter(i => selected.includes(i.id)));
      }
      if (key === 'f1') {
        e.preventDefault();
        setHelp(h => !h);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false;
    };
    const blur = () => {
      space.current = false;
      cancelGesture();
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', blur);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('blur', blur);
    };
  });
}
