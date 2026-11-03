// Board-level overlays: the boards dashboard (item 56), the context menu (item 57) and the
// properties inspector (item 59).
import React from 'react';
import { createItem } from './model';
import { expandGroups, canGroup, isGrouped } from './arrange';
import { useApp } from './board-app';
import { BoardsDashboard } from './dashboard';
import { ContextMenu } from './context-menu';
import type { MenuEntry } from './context-menu';
import { PropertiesInspector } from './inspector';
import { DeckPresenter } from './widgets-activities';
import { ReactionLayer } from './collab-extras';

export function BoardOverlays() {
  const app = useApp();
  const {
    library,
    dashboard,
    setDashboard,
    boardActions,
    inspector,
    setInspector,
    contextMenu,
    setContextMenu,
    board,
    selected,
    selectedItem,
    selectionLocked,
    setSelected,
    run,
    update,
    boardRef,
    copyNow,
    pasteFromMenu,
    duplicate,
    deleteSelection,
    groupNow,
    ungroupNow,
    toggleLock,
    openEditor,
    setPanel,
    setThread,
    setEditing,
    fill,
    fit,
    clipRef,
  } = app;
  const entries = (): MenuEntry[] => {
    if (!contextMenu) return [];
    const { world } = contextMenu,
      has = selected.length > 0,
      ids = expandGroups(board, selected),
      single = selected.length === 1 ? selectedItem : undefined;
    if (!has)
      return [
        { label: 'Paste', shortcut: 'Ctrl V', run: () => pasteFromMenu(world) },
        'separator',
        {
          label: 'Add sticky note here',
          shortcut: 'N',
          run: () => {
            const note = createItem('note', world.x, world.y, fill);
            note.x -= note.w / 2;
            note.y -= note.h / 2;
            update({ ...boardRef.current, items: [...boardRef.current.items, note] });
            setSelected([note.id]);
            setEditing(note.id);
          },
        },
        {
          label: 'Select all',
          shortcut: 'Ctrl A',
          disabled: !board.items.length,
          run: () => setSelected(board.items.map(i => i.id)),
        },
        { label: 'Fit to screen', shortcut: 'Alt 1', run: () => fit() },
        { label: 'Board properties', run: () => setInspector(true) },
      ];
    const reorder = (front: boolean) =>
      run(b => ({
        ...b,
        items: front
          ? [...b.items.filter(i => !ids.includes(i.id)), ...b.items.filter(i => ids.includes(i.id))]
          : [...b.items.filter(i => ids.includes(i.id)), ...b.items.filter(i => !ids.includes(i.id))],
      }));
    return [
      { label: 'Cut', shortcut: 'Ctrl X', disabled: selectionLocked, run: () => copyNow(true) },
      { label: 'Copy', shortcut: 'Ctrl C', run: () => copyNow(false) },
      {
        label: 'Paste',
        shortcut: 'Ctrl V',
        disabled: !clipRef.current && !navigator.clipboard?.read,
        run: () => pasteFromMenu(contextMenu.world),
      },
      { label: 'Duplicate', shortcut: 'Ctrl D', run: duplicate },
      'separator',
      ...(single && single.type !== 'pen'
        ? [
            {
              label: single.type === 'image' ? 'Crop…' : 'Edit',
              shortcut: 'Enter',
              disabled: selectionLocked,
              run: () => openEditor(single.id),
            } as MenuEntry,
          ]
        : []),
      { label: 'Bring to front', disabled: selectionLocked, run: () => reorder(true) },
      { label: 'Send to back', disabled: selectionLocked, run: () => reorder(false) },
      canGroup(board, selected)
        ? { label: 'Group', shortcut: 'Ctrl G', disabled: selectionLocked, run: groupNow }
        : {
            label: 'Ungroup',
            shortcut: 'Ctrl Shift G',
            disabled: selectionLocked || !isGrouped(board, selected),
            run: ungroupNow,
          },
      { label: selectionLocked ? 'Unlock' : 'Lock', shortcut: 'Ctrl Shift L', run: toggleLock },
      'separator',
      ...(single && single.type !== 'arrow'
        ? ([
            { label: 'Link to…', run: () => setPanel('link') },
            {
              label: 'Comment',
              shortcut: 'C',
              run: () => setThread({ x: single.x + single.w, y: single.y, itemId: single.id }),
            },
          ] as MenuEntry[])
        : []),
      ...(single?.type === 'note'
        ? [{ label: 'Convert…', disabled: selectionLocked, run: () => setPanel('convert') } as MenuEntry]
        : []),
      { label: 'Properties', run: () => setInspector(true) },
      'separator',
      { label: 'Delete', shortcut: 'Del', danger: true, disabled: selectionLocked, run: deleteSelection },
    ];
  };
  return (
    <>
      {dashboard && (
        <BoardsDashboard
          library={library}
          onOpen={boardActions.open}
          onCreate={boardActions.create}
          onRename={boardActions.rename}
          onDuplicate={boardActions.duplicate}
          onDelete={boardActions.remove}
          onClose={() => setDashboard(false)}
        />
      )}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} entries={entries()} onClose={() => setContextMenu(null)} />
      )}
      {inspector && (
        <PropertiesInspector
          board={board}
          selected={selected}
          onChange={change => run(change)}
          onClose={() => setInspector(false)}
        />
      )}
      <DeckPresenter board={board} update={update} boardRef={boardRef} />
      <ReactionLayer />
    </>
  );
}
