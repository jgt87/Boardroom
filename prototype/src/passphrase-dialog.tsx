// A small awaitable passphrase prompt (gap B18). `askPassphrase` resolves with the text, or null on cancel.
// <PassphraseHost /> is mounted once in board-chrome.tsx.
import { useEffect, useState } from 'react';

type Request = { confirm: boolean; title: string; resolve: (value: string | null) => void };
let open: ((r: Request) => void) | null = null;

export function askPassphrase(title: string, confirm = false): Promise<string | null> {
  return new Promise(resolve => {
    if (!open) return resolve(null);
    open({ confirm, title, resolve });
  });
}

export function PassphraseHost() {
  const [req, setReq] = useState<Request | null>(null),
    [a, setA] = useState(''),
    [b, setB] = useState('');
  useEffect(() => {
    open = r => {
      setA('');
      setB('');
      setReq(r);
    };
    return () => {
      open = null;
    };
  }, []);
  if (!req) return null;
  const finish = (value: string | null) => {
    req.resolve(value);
    setReq(null);
  };
  const error = req.confirm
    ? a.length > 0 && a.length < 8
      ? 'Use at least 8 characters.'
      : b && a !== b
        ? 'The passphrases do not match.'
        : ''
    : '';
  const ready = a.length >= (req.confirm ? 8 : 1) && (!req.confirm || a === b);
  return (
    <div className="format-overlay" onKeyDown={e => e.stopPropagation()}>
      <form
        className="format-dialog floating passphrase-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={req.title}
        onSubmit={e => {
          e.preventDefault();
          if (ready) finish(a);
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') finish(null);
        }}
      >
        <h2>{req.title}</h2>
        <p>
          {req.confirm
            ? 'The backup can only be opened with this passphrase. It cannot be recovered if you forget it.'
            : 'Enter the passphrase this backup was saved with.'}
        </p>
        <label>
          Passphrase
          <input type="password" autoFocus autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} />
        </label>
        {req.confirm && (
          <label>
            Repeat passphrase
            <input type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} />
          </label>
        )}
        {error && (
          <p className="format-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={() => finish(null)}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!ready}>
            {req.confirm ? 'Save encrypted backup' : 'Open backup'}
          </button>
        </footer>
      </form>
    </div>
  );
}
