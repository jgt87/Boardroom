import React, { useEffect, useId, useState } from 'react';
import { useApp } from './board-app';
import { centeredCamera, screenToWorld, MIN_ZOOM, MAX_ZOOM, zoomPresets } from './camera';

export function CameraControls() {
  const { camera, size, setCamera, zoom, fit, viewPrefs, setViewPrefs, minimap, setMinimap } = useApp();
  // Full screen is optional: some browsers and embedded views do not allow it.
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleFullscreen = () => {
    const done = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    done?.catch(() => setError('Full screen is not available here.'));
  };
  const id = useId();
  const [error, setError] = useState('');
  const center = screenToWorld(camera, { x: size.w / 2, y: size.h / 2 });
  return (
    <>
      <button
        className="zoom-label"
        popoverTarget={id}
        title="Zoom and navigation"
        aria-label={`Zoom and navigation: ${Math.round(camera.z * 100)}%`}
      >
        {Math.round(camera.z * 100)}%
      </button>
      <section id={id} popover="auto" className="camera-controls floating" aria-label="View controls">
        <h2>View controls</h2>
        <form
          key={`${camera.x},${camera.y},${camera.z}`}
          onSubmit={e => {
            e.preventDefault();
            const data = new FormData(e.currentTarget),
              x = Number(data.get('x')),
              y = Number(data.get('y')),
              z = Number(data.get('zoom')) / 100;
            if (
              ![x, y, z].every(Number.isFinite) ||
              Math.abs(x) > 1e7 ||
              Math.abs(y) > 1e7 ||
              z < MIN_ZOOM ||
              z > MAX_ZOOM
            ) {
              setError(`Enter valid coordinates and a zoom from ${MIN_ZOOM * 100} to ${MAX_ZOOM * 100}%.`);
              return;
            }
            setError('');
            setCamera(centeredCamera({ x, y }, z, size));
          }}
        >
          <label>
            Zoom (%)
            <input
              name="zoom"
              type="number"
              min="10"
              max={MAX_ZOOM * 100}
              step="any"
              required
              defaultValue={Math.round(camera.z * 10000) / 100}
            />
          </label>
          <label>
            Center X
            <input
              name="x"
              type="number"
              min="-10000000"
              max="10000000"
              step="any"
              required
              defaultValue={Math.round(center.x * 100) / 100}
            />
          </label>
          <label>
            Center Y
            <input
              name="y"
              type="number"
              min="-10000000"
              max="10000000"
              step="any"
              required
              defaultValue={Math.round(center.y * 100) / 100}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit">Apply view</button>
        </form>
        <div className="camera-actions">
          <button onClick={() => zoom(1 / camera.z)}>100%</button>
          <button onClick={() => setCamera(centeredCamera({ x: 0, y: 0 }, 1, size))}>Reset view</button>
        </div>
        <div className="zoom-presets" role="group" aria-label="Zoom presets">
          {zoomPresets.map(z => (
            <button key={z} aria-pressed={Math.abs(camera.z - z) < 0.005} onClick={() => zoom(z / camera.z)}>
              {Math.round(z * 100)}%
            </button>
          ))}
          <button onClick={() => fit()}>Fit to screen</button>
        </div>
        <div className="view-toggles" role="group" aria-label="View options">
          <label>
            <input type="checkbox" checked={viewPrefs.grid} onChange={e => setViewPrefs({ grid: e.target.checked })} />
            Grid
          </label>
          <label>
            <input
              type="checkbox"
              checked={viewPrefs.dimensions}
              onChange={e => setViewPrefs({ dimensions: e.target.checked })}
            />
            Object dimensions
          </label>
          <label>
            <input
              type="checkbox"
              checked={viewPrefs.spellcheck}
              onChange={e => setViewPrefs({ spellcheck: e.target.checked })}
            />
            Spell check
          </label>
          <label>
            <input
              type="checkbox"
              checked={viewPrefs.comments}
              onChange={e => setViewPrefs({ comments: e.target.checked })}
            />
            Comments on board
          </label>
          <label>
            <input
              type="checkbox"
              checked={viewPrefs.undoControls}
              onChange={e => setViewPrefs({ undoControls: e.target.checked })}
            />
            Undo/Redo controls
          </label>
          <label>
            <input type="checkbox" checked={minimap} onChange={e => setMinimap(e.target.checked)} />
            Minimap
          </label>
        </div>
        <div className="view-toggles" role="group" aria-label="Preferences">
          <label className="select-line">
            Navigate with
            <select
              aria-label="Navigate with"
              value={viewPrefs.navigation}
              onChange={e => setViewPrefs({ navigation: e.target.value as 'trackpad' | 'mouse' | 'auto' })}
            >
              <option value="auto">Auto-detect</option>
              <option value="trackpad">Trackpad (scroll pans)</option>
              <option value="mouse">Mouse (scroll zooms)</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={viewPrefs.singleKeys}
              onChange={e => setViewPrefs({ singleKeys: e.target.checked })}
            />
            Single-character shortcuts
          </label>
          <label>
            <input
              type="checkbox"
              checked={viewPrefs.reduceMotion}
              onChange={e => setViewPrefs({ reduceMotion: e.target.checked })}
            />
            Reduce motion
          </label>
          <label>
            <input type="checkbox" checked={viewPrefs.dnd} onChange={e => setViewPrefs({ dnd: e.target.checked })} />
            Do Not Disturb
          </label>
          {canFullscreen && (
            <button onClick={toggleFullscreen}>{fullscreen ? 'Exit full screen' : 'Enter full screen'}</button>
          )}
        </div>
      </section>
    </>
  );
}
