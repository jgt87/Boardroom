import React, { useId, useState } from 'react';
import { useApp } from './board-app';
import { centeredCamera, screenToWorld } from './camera';

export function CameraControls() {
  const { camera, size, setCamera, zoom } = useApp();
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
            if (![x, y, z].every(Number.isFinite) || Math.abs(x) > 1e7 || Math.abs(y) > 1e7 || z < 0.1 || z > 4) {
              setError('Enter valid coordinates and a zoom from 10 to 400%.');
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
              max="400"
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
      </section>
    </>
  );
}
