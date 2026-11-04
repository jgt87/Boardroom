// Board-level overlays: the boards dashboard (item 56), the context menu (item 57) and the
// properties inspector (item 59).
import React from 'react';
import { createItem, newBoard } from './model';
import { boardFromTemplate } from './user-templates';
import { useLibraryFiles } from './use-library-files';
import { expandGroups, canGroup, isGrouped, reorderZ } from './arrange';
import {
  allOfType,
  copyStyle,
  frameAround,
  kindLabel,
  onlyType,
  pasteStyle,
  styleClipboard,
  typesIn,
} from './switch-type';
import { useApp } from './board-app';
import { BoardsDashboard } from './dashboard';
import { ContextMenu } from './context-menu';
import { deckItemFor } from './deck-tools';
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
    display,
  } = app;
  const libraryFiles = useLibraryFiles();
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
    const types = typesIn(board, ids);
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
      {
        label: 'Bring to front',
        shortcut: 'PgUp',
        disabled: selectionLocked,
        run: () => run(b => reorderZ(b, selected, 'front')),
      },
      {
        label: 'Bring forward',
        shortcut: 'Shift PgUp',
        disabled: selectionLocked,
        run: () => run(b => reorderZ(b, selected, 'forward')),
      },
      {
        label: 'Send backward',
        shortcut: 'Shift PgDn',
        disabled: selectionLocked,
        run: () => run(b => reorderZ(b, selected, 'backward')),
      },
      {
        label: 'Send to back',
        shortcut: 'PgDn',
        disabled: selectionLocked,
        run: () => run(b => reorderZ(b, selected, 'back')),
      },
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
      ...(types.some(t => t.type === 'frame')
        ? [
            {
              label: 'Turn frames into slides',
              run: () => {
                const deck = deckItemFor(boardRef.current, selected);
                if (!deck) return;
                update({ ...boardRef.current, items: [...boardRef.current.items, deck] });
                setSelected([deck.id]);
                display(`Created a deck with ${(deck.data as { slides: unknown[] }).slides.length} slides.`);
              },
            } as MenuEntry,
          ]
        : []),
      ...(types.some(t => t.type !== 'frame')
        ? [
            {
              label: 'Create frame around',
              run: () => {
                const made = frameAround(boardRef.current, selected);
                if (!made) return;
                update(made.board);
                setSelected([made.frame.id]);
              },
            } as MenuEntry,
          ]
        : []),
      'separator',
      ...(single
        ? [
            {
              label: 'Copy style',
              shortcut: 'Ctrl Alt C',
              run: () => {
                styleClipboard.current = copyStyle(single);
                display('Style copied. Select objects and choose Paste style.');
              },
            } as MenuEntry,
          ]
        : []),
      ...(styleClipboard.current
        ? [
            {
              label: 'Paste style',
              shortcut: 'Ctrl Alt V',
              disabled: selectionLocked,
              run: () => {
                const r = pasteStyle(boardRef.current, selected, styleClipboard.current!);
                if (r.styled) update(r.board);
                else display('The copied style does not apply to the selection.');
              },
            } as MenuEntry,
          ]
        : []),
      ...(types.length > 1
        ? types.slice(0, 4).map(
            t =>
              ({
                label: `Select only ${kindLabel(t.type).toLowerCase()} (${t.count})`,
                run: () => setSelected(onlyType(board, ids, t.type)),
              }) as MenuEntry,
          )
        : types.length === 1
          ? [
              {
                label: `Select all: ${kindLabel(types[0].type).toLowerCase()}`,
                run: () => setSelected(allOfType(board, types[0].type)),
              } as MenuEntry,
            ]
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
          onCreateFromTemplate={(t, space) => {
            const made = boardFromTemplate(t, newBoard());
            if (made) boardActions.createFrom(made, space);
            else display('This template can no longer be read.');
          }}
          onRestore={boardActions.restore}
          onPurge={boardActions.purge}
          onSpace={boardActions.space}
          onImport={libraryFiles.importFile}
          onBackupAll={libraryFiles.backupAll}
          onRename={boardActions.rename}
          onDuplicate={boardActions.duplicate}
          onDelete={boardActions.remove}
          onMeta={boardActions.setMeta}
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
