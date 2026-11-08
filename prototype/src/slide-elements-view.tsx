// Positioned elements on a Slides slide (R4-Q2): text boxes, pictures and videos. Pictures come from the asset
// store; videos play the stored file with the board video's player (trim, cuts and speed apply when the video
// is still on the board). Keys while a video plays: J/L skip, K play/pause, Esc stops it.
import React, { useState } from 'react';
import { Play, X } from 'lucide-react';
import type { Board, ImageAsset, Item } from './model';
import type { Slide } from './specs-activities';
import type { SlideElement } from './slide-elements';
import { SLIDE_ELEMENT_TEXT_MAX } from './slide-elements';
import { videoForAsset } from './deck-media';
import { CanvasField } from './canvas-fields';
import { VideoPlayer } from './widgets-media';
import './slides-media.css';

export type SlideMedia = { assets: Record<string, ImageAsset>; board: Board };

const boxStyle = (e: SlideElement): React.CSSProperties => ({
  left: `${e.x * 100}%`,
  top: `${e.y * 100}%`,
  width: `${e.w * 100}%`,
  height: `${e.h * 100}%`,
});

/** A video element: a play button until started, then the player. Esc inside the player stops it. */
function SlideVideo({
  element,
  media,
  playing,
  onPlaying,
}: {
  element: SlideElement;
  media?: SlideMedia;
  playing: boolean;
  onPlaying: (on: boolean) => void;
}) {
  const asset = media && element.assetId ? media.assets[element.assetId] : undefined,
    name = element.alt || 'Video';
  if (!media || !asset) return <div className="slide-el-video-blank">{media ? 'Video unavailable' : name}</div>;
  if (!playing)
    return (
      <div className="slide-el-video-blank">
        <button
          className="slide-el-play"
          aria-label={`Play ${name}`}
          title="Play (K)"
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onPlaying(true)}
        >
          <Play size={20} fill="currentColor" />
        </button>
        <span>{name}</span>
      </div>
    );
  const source = videoForAsset(media.board, element.assetId!),
    item = (source ?? { id: element.id, type: 'video', text: name, alt: name, data: {} }) as Item;
  return (
    <div
      className="slide-el-player"
      onKeyDownCapture={e => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onPlaying(false);
      }}
    >
      <VideoPlayer item={item} src={asset.data} onStop={() => onPlaying(false)} onRate={() => undefined} />
    </div>
  );
}

/**
 * The elements of a slide, over its background. `edit` makes text boxes editable and adds remove buttons;
 * without `media` (thumbnails) pictures and videos show as plain boxes. `playing` and `onPlaying` let a presenter
 * control which video plays; without them the layer keeps that itself.
 */
export function SlideElementsLayer({
  slide,
  media,
  edit,
  playing,
  onPlaying,
  onText,
  onRemove,
  still,
}: {
  slide: Slide;
  media?: SlideMedia;
  edit?: boolean;
  /** Thumbnails: videos show their name only. */
  still?: boolean;
  playing?: string | null;
  onPlaying?: (id: string | null) => void;
  onText?: (id: string, text: string) => void;
  onRemove?: (id: string) => void;
}) {
  const [own, setOwn] = useState<string | null>(null),
    active = onPlaying ? (playing ?? null) : own,
    setActive = onPlaying ?? setOwn;
  if (!slide.elements?.length) return null;
  return (
    <div className="slide-elements">
      {slide.elements.map(e => (
        <div key={e.id} className={`slide-el slide-el-${e.kind}`} style={boxStyle(e)}>
          {e.kind === 'text' &&
            (edit && onText ? (
              <div
                className="slide-el-text"
                style={{
                  fontSize: `${e.size ?? 3}cqw`,
                  textAlign: e.align ?? 'left',
                  fontWeight: e.bold ? 700 : undefined,
                  color: e.color,
                }}
              >
                <CanvasField
                  label="Slide text box"
                  value={e.text ?? ''}
                  multiline
                  maxLength={SLIDE_ELEMENT_TEXT_MAX}
                  onCommit={v => onText(e.id, v)}
                />
              </div>
            ) : (
              <div
                className="slide-el-text"
                style={{
                  fontSize: `${e.size ?? 3}cqw`,
                  textAlign: e.align ?? 'left',
                  fontWeight: e.bold ? 700 : undefined,
                  color: e.color,
                }}
              >
                {e.text}
              </div>
            ))}
          {e.kind === 'image' &&
            (media && e.assetId && media.assets[e.assetId] ? (
              <img src={media.assets[e.assetId].data} alt={e.alt ?? ''} draggable={false} />
            ) : (
              <div className="slide-el-missing" role="img" aria-label={e.alt || 'Picture'}>
                {media ? 'Picture unavailable' : ''}
              </div>
            ))}
          {e.kind === 'video' && (
            <SlideVideo
              element={e}
              media={still ? undefined : media}
              playing={active === e.id}
              onPlaying={on => setActive(on ? e.id : null)}
            />
          )}
          {edit && onRemove && e.kind !== 'text' && (
            <button
              className="slide-el-remove"
              aria-label={`Remove ${e.kind === 'image' ? 'picture' : 'video'} ${e.alt ?? ''} from slide`.trim()}
              onPointerDown={ev => ev.stopPropagation()}
              onClick={() => onRemove(e.id)}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
