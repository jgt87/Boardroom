// Named layer controls in the Layers panel (gap D9): add, rename, hide, lock, reorder, delete, choose the
// active layer for new objects, and move the selection to a layer.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import { useApp } from './board-app';
import { BASE_LAYER, addLayer, deleteLayer, layerIdOf, layersOf, moveLayer, moveToLayer, patchLayer } from './layers';

export function NamedLayers() {
  const { board, boardRef, run, selected, activeLayer, setActiveLayer, display } = useApp();
  const [renaming, setRenaming] = useState<string | null>(null);
  const layers = layersOf(board),
    active = layers.some(l => l.id === activeLayer) ? activeLayer : BASE_LAYER;
  const counts = new Map<string, number>();
  for (const i of board.items) counts.set(layerIdOf(i), (counts.get(layerIdOf(i)) ?? 0) + 1);
  return (
    <section className="named-layers" aria-label="Board layers">
      <div className="named-layers-head">
        <h3>Board layers</h3>
        <button
          className="icon-button"
          aria-label="Add layer"
          title="Add layer"
          onClick={() => {
            const id = crypto.randomUUID();
            run(b => addLayer(b, '', id));
            setActiveLayer(id);
          }}
        >
          <Plus size={16} />
        </button>
      </div>
      <ol>
        {[...layers].reverse().map((l, k) => {
          const top = k === 0,
            bottom = k === layers.length - 1;
          return (
            <li key={l.id} className={l.id === active ? 'active' : ''}>
              <input
                type="radio"
                name="active-layer"
                aria-label={`Add new objects to ${l.name}`}
                title="New objects go to this layer"
                checked={l.id === active}
                onChange={() => setActiveLayer(l.id)}
              />
              {renaming === l.id ? (
                <input
                  className="layer-rename"
                  autoFocus
                  aria-label="Layer name"
                  defaultValue={l.name}
                  maxLength={80}
                  onBlur={e => {
                    run(b => patchLayer(b, l.id, { name: e.target.value }));
                    setRenaming(null);
                  }}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button
                  className="named-layer-name"
                  onDoubleClick={() => setRenaming(l.id)}
                  title="Double-click to rename"
                >
                  {l.name} <small>{counts.get(l.id) ?? 0}</small>
                </button>
              )}
              <button
                className="icon-button"
                aria-label={`${l.hidden ? 'Show' : 'Hide'} ${l.name}`}
                aria-pressed={!!l.hidden}
                onClick={() => run(b => patchLayer(b, l.id, { hidden: !l.hidden }))}
              >
                {l.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button
                className="icon-button"
                aria-label={`${l.locked ? 'Unlock' : 'Lock'} ${l.name}`}
                aria-pressed={!!l.locked}
                onClick={() => run(b => patchLayer(b, l.id, { locked: !l.locked }))}
              >
                {l.locked ? <Lock size={15} /> : <LockOpen size={15} />}
              </button>
              <button
                className="icon-button"
                aria-label={`Move ${l.name} up`}
                disabled={top}
                onClick={() => run(b => moveLayer(b, l.id, 1))}
              >
                <ArrowUp size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Move ${l.name} down`}
                disabled={bottom}
                onClick={() => run(b => moveLayer(b, l.id, -1))}
              >
                <ArrowDown size={15} />
              </button>
              {l.id !== BASE_LAYER && (
                <button
                  className="icon-button"
                  aria-label={`Delete ${l.name}`}
                  title="Delete layer (its objects move to the layer below)"
                  onClick={() => {
                    run(b => deleteLayer(b, l.id));
                    if (active === l.id) setActiveLayer(BASE_LAYER);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {selected.length > 0 && layers.length > 1 && (
        <label className="named-layers-move">
          Move selection to
          <select
            aria-label="Move selection to layer"
            value=""
            onChange={e => {
              const to = e.target.value;
              run(b => moveToLayer(b, selected, to));
              const name = layersOf(boardRef.current).find(l => l.id === to)?.name;
              display(`Moved ${selected.length} ${selected.length === 1 ? 'object' : 'objects'} to ${name}.`);
            }}
          >
            <option value="" disabled>
              Choose a layer
            </option>
            {layers.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
