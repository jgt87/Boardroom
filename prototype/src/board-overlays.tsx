// Board-level overlays: the boards dashboard (item 56), the context menu (item 57) and the
// properties inspector (item 59).
import React from 'react';
import { createItem, newBoard } from './model';
import { singleFormatBoard } from './deep-link';
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
import { nativeToMermaid } from './mermaid-native';
import { mermaidItem } from './smart-paste';
import { selectionBounds } from './interactions';
import { isShapeKind } from './shapes';
import { makeCustomShape, addCustomShape, loadCustomShapes, storeCustomShapes } from './custom-shapes';
import { PropertiesInspector } from './inspector';
import { DeckPresenter } from './widgets-activities';
import { ReactionLayer } from './collab-extras';
import { copyText, objectLink } from './use-deep-links';
import { linkOf, unlinkMermaid } from './mermaid-link';

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
    objectLink: focusLink,
  } = app;
  const libraryFiles = useLibraryFiles();
  /** Copy a link; plain HTTP on the LAN has no async clipboard, so fall back to a hidden text field. */
  const copyLink = (url: string, what: string) => {
    const done = () => display(`${what} copied. It opens this object in this browser, where the board is stored.`);
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => display(url));
      return;
    }
    const field = document.createElement('textarea');
    field.value = url;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    document.body.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    if (ok) done();
    else display(url);
  };
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
              label: single.type === 'frame' ? 'Copy link to frame' : 'Copy link to object',
              run: () => {
                const url = objectLink(single, library.activeId);
                void copyText(url).then(ok => display(ok ? 'Link copied.' : `Copy this link: ${url}`));
              },
            },
            {
              label: 'Copy link to focus view',
              run: () => copyLink(focusLink(single.id, true), 'Focus link'),
            },
            {
              label: 'Comment',
              shortcut: 'Alt C',
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
      ...(single && linkOf(selectedItem)
        ? [
            { label: 'Edit Mermaid code', run: () => openEditor(selectedItem!.id) } as MenuEntry,
            {
              label: 'Copy Mermaid code',
              run: () =>
                copyText(linkOf(selectedItem)!.code).then(ok =>
                  display(ok ? 'Mermaid code copied.' : 'The code could not be copied.'),
                ),
            } as MenuEntry,
            {
              label: 'Unlink from Mermaid code',
              run: () =>
                run(
                  b => unlinkMermaid(b, selectedItem!.id),
                  () => display('Unlinked. The shapes stay; the code is no longer kept. Undo restores the link.'),
                ),
            } as MenuEntry,
          ]
        : []),
      ...(types.some(t => isShapeKind(t.type) || t.type === 'note' || t.type === 'frame')
        ? [
            {
              label: 'Convert to Mermaid code',
              run: () => {
                try {
                  const b = boardRef.current,
                    code = nativeToMermaid(b, selected),
                    bounds = selectionBounds(b.items, selected)!,
                    item = { ...mermaidItem(code, { x: bounds.x + bounds.w + 80, y: bounds.y }) };
                  update({ ...b, items: [...b.items, item] });
                  setSelected([item.id]);
                  display('Created a Mermaid diagram from the selection. The shapes are kept.');
                } catch (err) {
                  display((err as Error).message);
                }
              },
            } as MenuEntry,
          ]
        : []),
      {
        label: 'Save as shape',
        run: () => {
          const made = makeCustomShape(boardRef.current, selected, crypto.randomUUID(), new Date());
          if ('error' in made) return display(made.error);
          display(
            storeCustomShapes(addCustomShape(loadCustomShapes(), made))
              ? `Saved "${made.name}" to My shapes in the Shapes menu.`
              : 'This browser has no room to store the shape.',
          );
        },
      } as MenuEntry,
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
          onCreateFormat={(kind, space) => {
            const made = singleFormatBoard(kind, newBoard(), (k, x, y) => createItem(k, x, y));
            if (!boardActions.createFrom(made.board, space)) return;
            // Open the new board straight into the format's focus view.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                setSelected([made.id]);
                fit(made.board.items);
                openEditor(made.id);
              }),
            );
          }}
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
          onDuplicateMany={boardActions.duplicateMany}
          onSpaceInfo={boardActions.spaceInfo}
          onBlueprint={boardActions.fromBlueprint}
          onFlush={boardActions.flush}
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
          onEditMermaid={openEditor}
        />
      )}
      <DeckPresenter board={board} update={update} boardRef={boardRef} />
      <ReactionLayer />
    </>
  );
}
