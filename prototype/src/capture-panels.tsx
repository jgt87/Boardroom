// Talktrack (screen + voice recording) and Photobooth (camera snapshot), item 96.
// Everything is recorded on this device with browser media APIs and added to the board as a
// local video or image; nothing is uploaded. These APIs need a secure context (HTTPS or localhost).
import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, Square, X } from 'lucide-react';
import { detectStickies, type FoundNote } from './sticky-detect';

const stopKeys = (onClose: () => void) => (e: React.KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === 'Escape') onClose();
};
const stopAll = (s: MediaStream | null) => s?.getTracks().forEach(t => t.stop());
const insecure = 'Recording needs a secure connection. Open Boardroom at http://localhost or over HTTPS.';
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.');

/** Pick a recording format this browser supports (WebM first; the video widget accepts WebM and MP4). */
export function recorderType(isSupported: (t: string) => boolean): string {
  return (
    ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(isSupported) ?? ''
  );
}
export const formatElapsed = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function TalktrackPanel({ onSave, onClose }: { onSave: (file: File) => void; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'saving'>('idle'),
    [voice, setVoice] = useState(true),
    [error, setError] = useState(''),
    [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null),
    streams = useRef<MediaStream[]>([]),
    started = useRef(0);
  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    typeof MediaRecorder !== 'undefined';
  useEffect(() => {
    if (state !== 'recording') return;
    const t = setInterval(() => setElapsed(Date.now() - started.current), 500);
    return () => clearInterval(t);
  }, [state]);
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      streams.current.forEach(stopAll);
    },
    [],
  );
  const start = async () => {
    setError('');
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streams.current = [screen];
      const tracks = [...screen.getVideoTracks()];
      if (voice) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          streams.current.push(mic);
          tracks.push(...mic.getAudioTracks());
        } catch {
          setError('Microphone unavailable; recording the screen without voice.');
        }
      }
      const type = recorderType(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        streams.current.forEach(stopAll);
        streams.current = [];
        const mime = rec.mimeType || type || 'video/webm';
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        setState('idle');
        if (chunks.length) onSave(new File(chunks, `Talktrack ${stamp()}.${ext}`, { type: mime.split(';')[0] }));
      };
      // Stopping the share from the browser's own bar also ends the recording.
      screen.getVideoTracks()[0]?.addEventListener('ended', () => rec.state === 'recording' && rec.stop());
      rec.start(1000);
      recorder.current = rec;
      started.current = Date.now();
      setElapsed(0);
      setState('recording');
    } catch (e) {
      streams.current.forEach(stopAll);
      streams.current = [];
      setError(
        (e as Error).name === 'NotAllowedError' ? 'Screen sharing was cancelled.' : 'Recording could not start.',
      );
    }
  };
  return (
    <aside className="facilitate-panel floating capture-panel" aria-label="Talktrack" onKeyDown={stopKeys(onClose)}>
      <div className="panel-heading">
        <h2>Talktrack</h2>
        <button className="icon-button" aria-label="Close Talktrack" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <p>
        Record a walkthrough of your screen with your voice. The video is added to the board and stays on this device.
      </p>
      {!supported ? (
        <p role="alert">{insecure}</p>
      ) : state === 'recording' ? (
        <>
          <p className="capture-live" aria-live="polite">
            <Circle size={10} fill="currentColor" /> Recording {formatElapsed(elapsed)}
          </p>
          <button
            className="primary"
            onClick={() => {
              setState('saving');
              recorder.current?.stop();
            }}
          >
            <Square size={14} /> Stop and add to board
          </button>
        </>
      ) : (
        <>
          <label className="check-field">
            <input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} /> Record my voice
          </label>
          <button className="primary" disabled={state === 'saving'} onClick={start}>
            <Circle size={14} /> Start recording
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}

export function PhotoboothPanel({ onSave, onClose }: { onSave: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(s => {
        if (cancelled) return stopAll(s);
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(e =>
        setError((e as Error).name === 'NotAllowedError' ? 'Camera access was blocked.' : 'No camera is available.'),
      );
    return () => {
      cancelled = true;
      stopAll(stream.current);
    };
  }, [supported]);
  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.url);
    },
    [shot],
  );
  const take = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob(b => b && setShot({ blob: b, url: URL.createObjectURL(b) }), 'image/jpeg', 0.9);
  };
  return (
    <aside className="facilitate-panel floating capture-panel" aria-label="Photobooth" onKeyDown={stopKeys(onClose)}>
      <div className="panel-heading">
        <h2>Photobooth</h2>
        <button className="icon-button" aria-label="Close Photobooth" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {!supported ? (
        <p role="alert">{insecure.replace('Recording', 'The camera')}</p>
      ) : (
        <>
          <div className="capture-preview">
            <video ref={video} muted playsInline hidden={!!shot} aria-label="Camera preview" />
            {shot && <img src={shot.url} alt="Captured photo" />}
          </div>
          {shot ? (
            <div className="capture-actions">
              <button onClick={() => setShot(null)}>Retake</button>
              <button
                className="primary"
                onClick={() => onSave(new File([shot.blob], `Photo ${stamp()}.jpg`, { type: 'image/jpeg' }))}
              >
                Add to board
              </button>
            </div>
          ) : (
            <button className="primary" disabled={!ready} onClick={take}>
              <Camera size={15} /> Take photo
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}

/** Stickies capture: pick a photo of paper sticky notes; matching digital notes are created. */
export function StickiesPanel({
  palette,
  onCreate,
  onClose,
}: {
  palette: string[];
  onCreate: (found: FoundNote[], photo: File | null) => void;
  onClose: () => void;
}) {
  const [found, setFound] = useState<FoundNote[] | null>(null),
    [file, setFile] = useState<File | null>(null),
    [keepPhoto, setKeepPhoto] = useState(true),
    [error, setError] = useState('');
  const analyse = async (f: File) => {
    setError('');
    setFound(null);
    setFile(f);
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight)),
        c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0, c.width, c.height);
      setFound(detectStickies(g.getImageData(0, 0, c.width, c.height), palette));
    } catch {
      setError('This image could not be read.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  return (
    <aside
      className="facilitate-panel floating capture-panel"
      aria-label="Stickies capture"
      onKeyDown={stopKeys(onClose)}
    >
      <div className="panel-heading">
        <h2>Stickies capture</h2>
        <button className="icon-button" aria-label="Close Stickies capture" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <p>
        Choose a photo of paper sticky notes. Each note becomes a digital sticky note in the same colour and layout;
        type the text in afterwards.
      </p>
      <label className="field">
        Photo
        <input
          type="file"
          accept="image/*"
          aria-label="Sticky notes photo"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void analyse(f);
          }}
        />
      </label>
      {found && (
        <>
          <p aria-live="polite">
            {found.length
              ? `Found ${found.length} sticky note${found.length === 1 ? '' : 's'}.`
              : 'No sticky notes found. Try a photo with notes on a plain, lighter background.'}
          </p>
          {!!found.length && (
            <>
              <label className="check-field">
                <input type="checkbox" checked={keepPhoto} onChange={e => setKeepPhoto(e.target.checked)} /> Also add
                the photo
              </label>
              <button className="primary" onClick={() => onCreate(found, keepPhoto ? file : null)}>
                Add {found.length} note{found.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
