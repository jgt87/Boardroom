// Videos while presenting frames (R4-Q2): the presentation covers the canvas, so each video object and Talktrack
// recording on the current frame gets a play button over it; playing shows the board's video player in the
// video's place (trim, cuts and speed apply). K plays the first video or stops the one playing; Esc stops it.
import React from 'react';
import { Play, Square } from 'lucide-react';
import type { ImageAsset, Item } from './model';
import type { Camera } from './navigation';
import { VideoPlayer } from './widgets-media';
import './slides-media.css';

export function PresentMedia({
  videos,
  assets,
  cam,
  origin,
  playing,
  onPlaying,
}: {
  videos: Item[];
  assets: Record<string, ImageAsset>;
  cam: Camera;
  origin: { x: number; y: number };
  playing: string | null;
  onPlaying: (id: string | null) => void;
}) {
  return (
    <>
      {videos.map(v => {
        const asset = v.assetId ? assets[v.assetId] : undefined,
          name = v.text || v.alt || 'Video',
          style: React.CSSProperties = {
            left: origin.x + v.x * cam.z + cam.x,
            top: origin.y + v.y * cam.z + cam.y,
            width: Math.max(200, v.w * cam.z),
            height: Math.max(140, v.h * cam.z),
          };
        if (!asset) return null;
        if (playing === v.id)
          return (
            <div key={v.id} className="present-media-player" style={style} role="group" aria-label={`Playing ${name}`}>
              <button className="present-media-close" aria-label={`Stop ${name}`} onClick={() => onPlaying(null)}>
                <Square size={12} /> Stop
              </button>
              <VideoPlayer item={v} src={asset.data} onStop={() => onPlaying(null)} onRate={() => undefined} />
            </div>
          );
        return (
          <div key={v.id} className="present-media" style={style}>
            <button
              className="present-media-play"
              aria-label={`Play ${name}`}
              title="Play (K)"
              onClick={() => onPlaying(v.id)}
            >
              <Play size={20} fill="currentColor" />
            </button>
          </div>
        );
      })}
    </>
  );
}
