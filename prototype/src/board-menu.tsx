// Main menu beside the board name (items 103–109), structured like the reference: Board, Edit, View,
// Preferences, Accessibility and Assign status, each opening a submenu. Keyboard: arrows move, Right/Enter
// opens a submenu, Left closes it, Escape or a click outside closes the menu.
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, EllipsisVertical } from 'lucide-react';
import { useApp } from './board-app';
import { screenToWorld } from './camera';
import { boardBackgrounds, boardStatuses, DEFAULT_BACKGROUND, withSetting } from './board-settings';
import { CatchUpPanel, DetailsPanel, HistoryPanel } from './board-history';
import { spacesOf } from './board-library';
import { undo, redo, newBoard } from './model';
import { TemplatePicker } from './template-picker';
import { BrandKitPanel } from './brand-kit-panel';
import { boardFromTemplate } from './user-templates';

export function BoardStatusChip() {
  const { board } = useApp();
  const status = boardStatuses.find(s => s.id === board.status);
  if (!status) return null;
  return (
    <span className="board-status" style={{ background: status.color }} title="Board status">
      {status.label}
    </span>
  );
}

type Entry =
  | {
      kind: 'item';
      label: string;
      run: () => void;
      checked?: boolean;
      hint?: string;
      danger?: boolean;
      swatch?: string;
    }
  | { kind: 'sub'; label: string; entries: Entry[] }
  | { kind: 'sep' }
  | { kind: 'field'; node: React.ReactNode };

/** Close a popup on Escape anywhere or a pointer press outside `ref`. */
export function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, ref]);
}

function MenuList({
  entries,
  label,
  onDone,
  onBack,
}: {
  entries: Entry[];
  label: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const [sub, setSub] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, []);
  const move = (e: React.KeyboardEvent) => {
    const items = [
      ...(list.current?.querySelectorAll<HTMLElement>(
        ':scope > [role^="menuitem"], :scope > .main-menu-sub > [role="menuitem"]',
      ) ?? []),
    ];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'ArrowLeft' && onBack) {
      e.preventDefault();
      e.stopPropagation();
      onBack();
    }
  };
  return (
    <div className="main-menu-list floating" role="menu" aria-label={label} ref={list} onKeyDown={move}>
      {entries.map((e, i) =>
        e.kind === 'sep' ? (
          <hr key={i} />
        ) : e.kind === 'field' ? (
          <div key={i} className="main-menu-field">
            {e.node}
          </div>
        ) : e.kind === 'sub' ? (
          <div key={i} className="main-menu-sub">
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={sub === i}
              className={sub === i ? 'open' : ''}
              onPointerEnter={() => setSub(i)}
              onClick={() => setSub(sub === i ? null : i)}
              onKeyDown={k => {
                if (k.key === 'ArrowRight' || k.key === 'Enter' || k.key === ' ') {
                  k.preventDefault();
                  k.stopPropagation();
                  setSub(i);
                }
              }}
            >
              <span>{e.label}</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
            {sub === i && (
              <MenuList
                entries={e.entries}
                label={e.label}
                onDone={onDone}
                onBack={() => {
                  setSub(null);
                  const subs = list.current?.querySelectorAll<HTMLElement>(
                    ':scope > .main-menu-sub > [role="menuitem"]',
                  );
                  subs?.[entries.slice(0, i + 1).filter(x => x.kind === 'sub').length - 1]?.focus();
                }}
              />
            )}
          </div>
        ) : (
          <button
            key={i}
            role={e.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={e.checked}
            className={e.danger ? 'danger' : ''}
            onPointerEnter={() => setSub(null)}
            onClick={() => {
              e.run();
              if (e.checked === undefined) onDone();
            }}
          >
            {e.swatch ? <i className="main-menu-swatch" style={{ background: e.swatch }} aria-hidden="true" /> : null}
            <span>{e.label}</span>
            {e.checked ? <Check size={15} aria-hidden="true" /> : e.hint ? <kbd>{e.hint}</kbd> : null}
          </button>
        ),
      )}
    </div>
  );
}

export function BoardMenu() {
  const {
    board,
    boardRef,
    camera,
    size,
    update,
    selected,
    display,
    library,
    boardActions,
    setHistory,
    setCommandsOpen,
    setSearchOpen,
    viewPrefs,
    setViewPrefs,
    minimap,
    setMinimap,
    snapping,
    setSnapping,
    setFacil,
    setDashboard,
  } = useApp();
  const [open, setOpen] = useState(false),
    [panel, setPanel] = useState<'history' | 'catchup' | 'details' | 'new' | 'brand' | null>(null),
    [confirmDelete, setConfirmDelete] = useState(false),
    [newSpace, setNewSpace] = useState(''),
    [copyName, setCopyName] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    setConfirmDelete(false);
    setCopyName(null);
  };
  useDismiss(open, root, close);
  const meta = library.boards.find(b => b.id === library.activeId),
    background = board.background ?? DEFAULT_BACKGROUND;
  const toggle = (label: string, checked: boolean, run: () => void): Entry => ({ kind: 'item', label, checked, run });
  const item = (label: string, run: () => void, hint?: string): Entry => ({ kind: 'item', label, run, hint });
  const fullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;
  const entries: Entry[] = [
    {
      kind: 'sub',
      label: 'Board',
      entries: [
        item('Catch up', () => setPanel('catchup')),
        item('New board…', () => setPanel('new')),
        item(board.thumbnailFrame ? 'Reset thumbnail' : 'Use selected frame as thumbnail', () => {
          const next = { ...boardRef.current };
          if (board.thumbnailFrame) delete next.thumbnailFrame;
          else {
            const frame = boardRef.current.items.find(i => selected.includes(i.id) && i.type === 'frame');
            if (!frame) return display('Select a frame to use as the thumbnail.');
            next.thumbnailFrame = frame.id;
          }
          update(next);
          display(
            next.thumbnailFrame ? 'The dashboard now shows this frame.' : 'The dashboard shows the whole board again.',
          );
        }),
        toggle('View only', !!board.viewOnly, () => {
          const next = { ...boardRef.current };
          if (next.viewOnly) delete next.viewOnly;
          else next.viewOnly = true;
          update(next);
          display(next.viewOnly ? 'View only: editing is off for this board.' : 'Editing is on again.');
        }),
        {
          kind: 'sub',
          label: 'Duplicate',
          entries: [
            {
              kind: 'field',
              node: (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    const name = (copyName ?? `${board.title || 'Untitled board'} copy`).trim();
                    if (!name) return;
                    close();
                    setCopyName(null);
                    boardActions.duplicate(library.activeId, name);
                    display(`Board duplicated as "${name.slice(0, 200)}". Find it under All boards.`);
                  }}
                >
                  <input
                    aria-label="Name of the copy"
                    placeholder="Name of the copy"
                    maxLength={200}
                    value={copyName ?? `${board.title || 'Untitled board'} copy`}
                    onKeyDown={e => e.stopPropagation()}
                    onChange={e => setCopyName(e.target.value)}
                  />
                  <button type="submit" disabled={!(copyName ?? 'x').trim()}>
                    Duplicate
                  </button>
                </form>
              ),
            },
          ],
        },
        {
          kind: 'sub',
          label: 'Move to',
          entries: [
            toggle('No space', !meta?.space, () => boardActions.setMeta(library.activeId, { space: null })),
            ...spacesOf(library).map(s =>
              toggle(s, meta?.space === s, () => boardActions.setMeta(library.activeId, { space: s })),
            ),
            { kind: 'sep' },
            {
              kind: 'field',
              node: (
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    if (!newSpace.trim()) return;
                    boardActions.setMeta(library.activeId, { space: newSpace });
                    setNewSpace('');
                  }}
                >
                  <input
                    aria-label="New space name"
                    placeholder="New space"
                    maxLength={60}
                    value={newSpace}
                    onKeyDown={e => e.stopPropagation()}
                    onChange={e => setNewSpace(e.target.value)}
                  />
                  <button type="submit" disabled={!newSpace.trim()}>
                    Move
                  </button>
                </form>
              ),
            },
          ],
        },
        toggle('Star this board', !!meta?.starred, () =>
          boardActions.setMeta(library.activeId, { starred: !meta?.starred }),
        ),
        {
          kind: 'sub',
          label: 'Background color',
          entries: boardBackgrounds.map(b => ({
            kind: 'item' as const,
            label: b.name,
            swatch: b.color,
            checked: background === b.color,
            run: () => update(withSetting(boardRef.current, 'background', b.color)),
          })),
        },
        {
          kind: 'sub',
          label: 'Start view',
          entries: [
            item(board.startView ? 'Update to current view' : 'Use current view', () => {
              const c = screenToWorld(camera, { x: size.w / 2, y: size.h / 2 });
              update(
                withSetting(boardRef.current, 'startView', { x: Math.round(c.x), y: Math.round(c.y), z: camera.z }),
              );
              display('This view is now the board’s start view.');
            }),
            ...(board.startView
              ? [item('Clear start view', () => update(withSetting(boardRef.current, 'startView', null)))]
              : []),
          ],
        },
        item('History', () => setPanel('history')),
        item('Details', () => setPanel('details')),
        item('All boards', () => setDashboard(true), 'Ctrl E'),
        { kind: 'sep' },
        {
          kind: 'item',
          label: confirmDelete ? 'Click again to move this board to trash' : 'Delete board',
          danger: true,
          checked: false,
          run: () => {
            if (!confirmDelete) return setConfirmDelete(true);
            close();
            boardActions.remove(library.activeId);
          },
        },
      ],
    },
    {
      kind: 'sub',
      label: 'Edit',
      entries: [
        item('Undo', () => setHistory(undo), 'Ctrl Z'),
        item('Redo', () => setHistory(redo), 'Ctrl Shift Z'),
        item('Commands', () => setCommandsOpen(true), 'Ctrl K'),
        item('Find', () => setSearchOpen(true), 'Ctrl F'),
      ],
    },
    {
      kind: 'sub',
      label: 'View',
      entries: [
        toggle('Grid', viewPrefs.grid, () => setViewPrefs({ grid: !viewPrefs.grid })),
        toggle('Dot grid', viewPrefs.gridStyle === 'dots', () =>
          setViewPrefs({ gridStyle: viewPrefs.gridStyle === 'dots' ? 'lines' : 'dots' }),
        ),
        toggle('Snap to grid', viewPrefs.snapGrid, () => setViewPrefs({ snapGrid: !viewPrefs.snapGrid })),
        toggle('Comments on board', viewPrefs.comments, () => setViewPrefs({ comments: !viewPrefs.comments })),
        toggle('Object dimensions', viewPrefs.dimensions, () => setViewPrefs({ dimensions: !viewPrefs.dimensions })),
        toggle('Undo/Redo controls', viewPrefs.undoControls, () =>
          setViewPrefs({ undoControls: !viewPrefs.undoControls }),
        ),
        toggle('Minimap', minimap, () => setMinimap(!minimap)),
        ...(typeof document !== 'undefined' && document.fullscreenEnabled
          ? [
              item(fullscreen ? 'Exit full screen' : 'Enter full screen', () => {
                (document.fullscreenElement
                  ? document.exitFullscreen()
                  : document.documentElement.requestFullscreen()
                )?.catch(() => display('Full screen is not available here.'));
              }),
            ]
          : []),
      ],
    },
    {
      kind: 'sub',
      label: 'Preferences',
      entries: [
        {
          kind: 'sub',
          label: 'Mouse or trackpad',
          entries: (
            [
              ['auto', 'Auto-detect'],
              ['mouse', 'Mouse'],
              ['trackpad', 'Trackpad'],
            ] as const
          ).map(([v, label]) => toggle(label, viewPrefs.navigation === v, () => setViewPrefs({ navigation: v }))),
        },
        toggle('Align objects', snapping, () => setSnapping(!snapping)),
        toggle('Do Not Disturb', viewPrefs.dnd, () => setViewPrefs({ dnd: !viewPrefs.dnd })),
        toggle('Spell check', viewPrefs.spellcheck, () => setViewPrefs({ spellcheck: !viewPrefs.spellcheck })),
        item('Profile settings', () => setFacil('authors')),
        item('Brand kit', () => setPanel('brand')),
      ],
    },
    {
      kind: 'sub',
      label: 'Accessibility',
      entries: [
        toggle('Reduce motion', viewPrefs.reduceMotion, () => setViewPrefs({ reduceMotion: !viewPrefs.reduceMotion })),
        toggle('Single-character shortcuts', viewPrefs.singleKeys, () =>
          setViewPrefs({ singleKeys: !viewPrefs.singleKeys }),
        ),
        item('Accessibility Checker', () => setFacil('a11y')),
      ],
    },
    { kind: 'sep' },
    {
      kind: 'sub',
      label: 'Assign status',
      entries: [
        toggle('No status', !board.status, () => update(withSetting(boardRef.current, 'status', null))),
        ...boardStatuses.map(s => ({
          kind: 'item' as const,
          label: s.label,
          swatch: s.color,
          checked: board.status === s.id,
          run: () => update(withSetting(boardRef.current, 'status', s.id)),
        })),
      ],
    },
  ];
  return (
    <div className="menu-anchor main-menu" ref={root}>
      <button
        className="icon-button"
        aria-label="Main menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Main menu"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <EllipsisVertical size={17} />
      </button>
      {open && <MenuList entries={entries} label="Main menu" onDone={close} />}
      {panel === 'history' && <HistoryPanel onClose={() => setPanel(null)} />}
      {panel === 'catchup' && <CatchUpPanel onClose={() => setPanel(null)} />}
      {panel === 'details' && <DetailsPanel onClose={() => setPanel(null)} />}
      {panel === 'brand' && <BrandKitPanel onClose={() => setPanel(null)} />}
      {panel === 'new' && (
        <TemplatePicker
          onBlank={() => {
            setPanel(null);
            boardActions.create(null);
          }}
          onStarter={name => {
            setPanel(null);
            boardActions.create(name);
          }}
          onUser={t => {
            setPanel(null);
            const made = boardFromTemplate(t, newBoard());
            if (made) boardActions.createFrom(made);
            else display('This template can no longer be read.');
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
