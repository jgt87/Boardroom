// Reactions (item 83) and sticky note authors (item 85). Reactions are transient: never saved or undone.
// Evidence: feature map (Facilitation menu lists six reaction choices); reconstruction backlog (author display).
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AUTHOR_MAX } from './authors';

export const reactionChoices = [
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '🎉', label: 'Celebrate' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '👏', label: 'Applause' },
];
const REACTION_EVENT = 'boardroom:reaction';
const stopKeys = (onClose: () => void) => (e: React.KeyboardEvent) => {
  e.stopPropagation();
  if (e.key === 'Escape') onClose();
};

export function ReactionsPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="facilitate-panel floating reactions-panel" aria-label="Reactions" onKeyDown={stopKeys(onClose)}>
      <div className="panel-heading">
        <h2>Reactions</h2>
        <button className="icon-button" aria-label="Close reactions" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="reaction-choices" role="group" aria-label="Send a reaction">
        {reactionChoices.map(r => (
          <button
            key={r.emoji}
            aria-label={r.label}
            title={r.label}
            onClick={() => window.dispatchEvent(new CustomEvent(REACTION_EVENT, { detail: r.emoji }))}
          >
            {r.emoji}
          </button>
        ))}
      </div>
      <p>Reactions float across this screen for a moment. They are not saved to the board.</p>
    </aside>
  );
}

type Burst = { id: number; emoji: string; x: number; drift: number };
/** Floating reactions. With reduced motion they appear in place and fade without travelling. */
export function ReactionLayer() {
  const [bursts, setBursts] = useState<Burst[]>([]),
    [announce, setAnnounce] = useState(''),
    next = useRef(0);
  useEffect(() => {
    const timers: number[] = [];
    const add = (e: Event) => {
      const emoji = String((e as CustomEvent).detail ?? '');
      if (!reactionChoices.some(r => r.emoji === emoji)) return;
      const burst = Array.from({ length: 5 }, () => ({
        id: next.current++,
        emoji,
        x: 30 + Math.random() * 40,
        drift: Math.round((Math.random() - 0.5) * 120),
      }));
      setBursts(b => [...b.slice(-40), ...burst]);
      setAnnounce(`Reaction sent: ${reactionChoices.find(r => r.emoji === emoji)!.label}`);
      timers.push(window.setTimeout(() => setBursts(b => b.filter(x => !burst.some(y => y.id === x.id))), 2600));
    };
    addEventListener(REACTION_EVENT, add);
    return () => {
      removeEventListener(REACTION_EVENT, add);
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <>
      <div className="reaction-layer" aria-hidden="true">
        {bursts.map((b, k) => (
          <span
            key={b.id}
            className="reaction-float"
            style={
              {
                left: `${b.x}%`,
                animationDelay: `${(k % 5) * 90}ms`,
                '--drift': `${b.drift}px`,
              } as React.CSSProperties
            }
          >
            {b.emoji}
          </span>
        ))}
      </div>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </>
  );
}

export function AuthorsPanel({
  name,
  show,
  onName,
  onShow,
  onClose,
}: {
  name: string;
  show: boolean;
  onName: (name: string) => void;
  onShow: (show: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <aside className="facilitate-panel floating authors-panel" aria-label="Note authors" onKeyDown={stopKeys(onClose)}>
      <div className="panel-heading">
        <h2>Note authors</h2>
        <button className="icon-button" aria-label="Close note authors" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <label className="field">
        Your name on new sticky notes
        <input
          value={draft}
          maxLength={AUTHOR_MAX}
          placeholder="For example, Sam Lee"
          onChange={e => setDraft(e.target.value)}
          onBlur={() => onName(draft)}
          onKeyDown={e => {
            if (e.key === 'Enter') onName(draft);
          }}
        />
      </label>
      <label className="media-check">
        <input type="checkbox" checked={show} onChange={e => onShow(e.target.checked)} />
        Show authors on sticky notes
      </label>
      <p>The name is stored on this device only. Notes keep the name they were created with.</p>
    </aside>
  );
}
