import { selectionBounds } from './interactions';
import { useEffect } from 'react';
import { undo, redo, createItem } from './model';
import { translate } from './interactions';
import { moveIds } from './arrange';
import { gridOwner } from './grid-canvas';
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
      } else if (key === 'enter' && selected.length === 1 && selectedItem && selectedItem.type !== 'pen') {
        e.preventDefault();
        openEditor(selectedItem.id);
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
