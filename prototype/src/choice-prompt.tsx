// A small awaitable in-app choice (P2-Q4), used instead of browser confirm dialogs. `askChoice` resolves with the
// chosen option's id, or null on cancel. <ChoicePromptHost /> is mounted once in board-chrome.tsx.
import { useEffect, useRef, useState } from 'react';
import { trapTab } from './focus-view';
import type { ReactNode } from 'react';

export type ChoiceOption = { id: string; label: string; detail?: string; icon?: ReactNode };
type Request = {
  id: number;
  title: string;
  message: string;
  options: ChoiceOption[];
  resolve: (choice: string | null) => void;
};
let nextId = 0;
let open: ((r: Request) => void) | null = null;

/** Ask the person to pick one of `options`. Without a mounted host the first option is taken. */
export function askChoice(title: string, message: string, options: ChoiceOption[]): Promise<string | null> {
  return new Promise(resolve => {
    if (!open) return resolve(options[0]?.id ?? null);
    open({ id: ++nextId, title, message, options, resolve });
  });
}

export function ChoicePromptHost() {
  // A queue, so several questions are asked one after the other.
  const [queue, setQueue] = useState<Request[]>([]);
  useEffect(() => {
    open = r => setQueue(q => [...q, r]);
    return () => {
      open = null;
    };
  }, []);
  const req = queue[0];
  // Item 146: remember what had focus when the question opened and give it back when it closes.
  const prior = useRef<HTMLElement | null>(null),
    box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!req) return;
    // A queued follow-up question keeps the first opener, so focus goes back there at the end.
    prior.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [req]);
  useEffect(() => {
    if (req || !prior.current) return;
    if (prior.current.isConnected) prior.current.focus();
    prior.current = null;
  }, [req]);
  if (!req) return null;
  const finish = (choice: string | null) => {
    req.resolve(choice);
    setQueue(q => q.slice(1));
  };
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        trapTab(e, box.current);
        if (e.key === 'Escape') finish(null);
      }}
      onPointerDown={e => {
        if (e.target === e.currentTarget) finish(null);
      }}
    >
      <section
        key={req.id}
        ref={box}
        className="format-editor sheet-picker choice-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="choice-prompt-title"
        aria-describedby="choice-prompt-message"
      >
        <header>
          <div>
            <h2 id="choice-prompt-title">{req.title}</h2>
            <p id="choice-prompt-message">{req.message}</p>
          </div>
        </header>
        <ul className="sheet-picker-list">
          {req.options.map((o, k) => (
            <li key={o.id}>
              <button type="button" autoFocus={k === 0} onClick={() => finish(o.id)}>
                {o.icon}
                <span className="choice-prompt-text">
                  <strong>{o.label}</strong>
                  {o.detail && <small>{o.detail}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <footer>
          <span />
          <button type="button" onClick={() => finish(null)}>
            Cancel
          </button>
        </footer>
      </section>
    </div>
  );
}
