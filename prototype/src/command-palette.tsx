// Command palette (item 105): Ctrl+K or Ctrl+/ lists every tool and board action; type to filter.
import { useMemo, useState } from 'react';
import { useApp } from './board-app';
import { catalog, formatTools } from './tool-catalog';
import { matchCommands, type Command } from './commands';
import { undo, redo } from './model';
import { connectItems, pendingConnection } from './switch-type';

type Runnable = Command & { run: () => void };

export function CommandPalette() {
  const app = useApp();
  const {
    chooseFormat,
    setCommandsOpen,
    fit,
    zoom,
    camera,
    setPresentPanel,
    setSearchOpen,
    setTimerOn,
    setMinimap,
    setHistory,
    setHelp,
    setOutline,
    setInspector,
    viewPrefs,
    setViewPrefs,
    selected,
    boardRef,
    update,
    setSelected,
    display,
  } = app;
  const [query, setQuery] = useState(''),
    [active, setActive] = useState(0);
  const commands = useMemo<Runnable[]>(() => {
    const tools: Runnable[] = [...formatTools, ...Object.values(catalog).flat()]
      .filter(e => !e.unavailable && !e.kind.startsWith('submenu:'))
      .map(e => ({
        id: `tool:${e.kind}:${e.label}`,
        label: e.label,
        group: 'Tools',
        keywords: e.description,
        run: () => chooseFormat(e.kind),
      }));
    const unique = [...new Map(tools.map(t => [t.label, t])).values()];
    const actions: Runnable[] = [
      { id: 'undo', label: 'Undo', group: 'Edit', shortcut: 'Ctrl Z', run: () => setHistory(undo) },
      { id: 'redo', label: 'Redo', group: 'Edit', shortcut: 'Ctrl Shift Z', run: () => setHistory(redo) },
      {
        id: 'find',
        label: 'Find on board',
        group: 'Edit',
        keywords: 'search',
        shortcut: 'Ctrl F',
        run: () => setSearchOpen(true),
      },
      { id: 'fit', label: 'Fit to screen', group: 'View', shortcut: 'Alt 1', run: () => fit() },
      { id: 'zoom100', label: 'Zoom to 100%', group: 'View', shortcut: 'Ctrl 0', run: () => zoom(1 / camera.z) },
      { id: 'zoomin', label: 'Zoom in', group: 'View', run: () => zoom(1.2) },
      { id: 'zoomout', label: 'Zoom out', group: 'View', run: () => zoom(1 / 1.2) },
      {
        id: 'grid',
        label: viewPrefs.grid ? 'Hide grid' : 'Show grid',
        group: 'View',
        run: () => setViewPrefs({ grid: !viewPrefs.grid }),
      },
      {
        id: 'dims',
        label: viewPrefs.dimensions ? 'Hide object dimensions' : 'Show object dimensions',
        group: 'View',
        run: () => setViewPrefs({ dimensions: !viewPrefs.dimensions }),
      },
      { id: 'minimap', label: 'Toggle minimap', group: 'View', run: () => setMinimap(m => !m) },
      {
        id: 'frames',
        label: 'Frames and presentation',
        group: 'View',
        keywords: 'slides present',
        run: () => setPresentPanel(true),
      },
      { id: 'layers', label: 'Layers', group: 'View', keywords: 'outline objects', run: () => setOutline(true) },
      { id: 'props', label: 'Properties', group: 'View', keywords: 'inspector', run: () => setInspector(true) },
      { id: 'timer', label: 'Timer', group: 'Facilitation', run: () => setTimerOn(true) },
      { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Help', shortcut: '?', run: () => setHelp(true) },
      // Keyboard connect (gap F9): choose a start object, Tab to another and connect.
      {
        id: 'connect-start',
        label: 'Start connection here',
        group: 'Connect',
        keywords: 'connector line arrow from',
        run: () => {
          if (selected.length !== 1) return display('Select one object to connect from.');
          pendingConnection.from = selected[0];
          display('Connection started. Select another object and choose "Connect to this object".');
        },
      },
      {
        id: 'connect-end',
        label: 'Connect to this object',
        group: 'Connect',
        keywords: 'connector line arrow to finish',
        run: () => {
          const from = pendingConnection.from;
          if (!from || !boardRef.current.items.some(i => i.id === from))
            return display('Choose "Start connection here" on another object first.');
          if (selected.length !== 1) return display('Select one object to connect to.');
          const r = connectItems(boardRef.current, [from, selected[0]]);
          pendingConnection.from = null;
          if (!r.connectors.length) return display('Those objects are already connected.');
          update(r.board);
          setSelected(r.connectors.map(c => c.id));
        },
      },
      {
        id: 'connect-chain',
        label: 'Connect selected objects in order',
        group: 'Connect',
        keywords: 'connector chain flow',
        run: () => {
          const r = connectItems(boardRef.current, selected);
          if (!r.connectors.length) return display('Select two or more objects to connect.');
          update(r.board);
          display(`Added ${r.connectors.length} connector${r.connectors.length === 1 ? '' : 's'}.`);
        },
      },
    ];
    return [...actions, ...unique];
  }, [
    chooseFormat,
    setHistory,
    setSearchOpen,
    fit,
    zoom,
    camera.z,
    viewPrefs,
    setViewPrefs,
    setMinimap,
    setPresentPanel,
    setOutline,
    setInspector,
    setTimerOn,
    setHelp,
    selected,
    boardRef,
    update,
    setSelected,
    display,
  ]);
  const results = matchCommands(commands, query, 40);
  const choose = (c: Runnable | undefined) => {
    if (!c) return;
    setCommandsOpen(false);
    c.run();
  };
  return (
    <div className="format-overlay command-overlay" onPointerDown={() => setCommandsOpen(false)}>
      <div
        className="command-palette floating"
        role="dialog"
        aria-modal="true"
        aria-label="Commands"
        onPointerDown={e => e.stopPropagation()}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Escape') setCommandsOpen(false);
          else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(a => Math.min(results.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(a => Math.max(0, a - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      >
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          aria-activedescendant={results[active] ? `cmd-${active}` : undefined}
          aria-label="Search commands"
          placeholder="Type a command or tool…"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
        <ul id="command-results" role="listbox" aria-label="Commands">
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(c)}
            >
              <span>{c.label}</span>
              <small>{c.shortcut ?? c.group}</small>
            </li>
          ))}
          {!results.length && <li className="empty">No matching commands</li>}
        </ul>
      </div>
    </div>
  );
}
