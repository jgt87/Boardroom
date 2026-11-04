// An awaitable worksheet picker for Excel imports (gap Q16). `askSheet` resolves with the chosen sheet's index,
// or null on cancel. <SheetPickerHost /> is mounted once in board-chrome.tsx.
import { useEffect, useState } from 'react';
import { Sheet } from 'lucide-react';

type Request = { id: number; names: string[]; fileName: string; resolve: (index: number | null) => void };
let nextId = 0;
let open: ((r: Request) => void) | null = null;

/** Ask which worksheet of `fileName` to import. Matches the `SheetChooser` signature in table-file.ts. */
export function askSheet(names: string[], fileName: string): Promise<number | null> {
  return new Promise(resolve => {
    if (!open) return resolve(0);
    open({ id: ++nextId, names, fileName, resolve });
  });
}

export function SheetPickerHost() {
  // A queue, so several workbooks dropped together are asked about one after the other.
  const [queue, setQueue] = useState<Request[]>([]);
  useEffect(() => {
    open = r => setQueue(q => [...q, r]);
    return () => {
      open = null;
    };
  }, []);
  const req = queue[0];
  if (!req) return null;
  const finish = (index: number | null) => {
    req.resolve(index);
    setQueue(q => q.slice(1));
  };
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') finish(null);
      }}
      onPointerDown={e => {
        if (e.target === e.currentTarget) finish(null);
      }}
    >
      <section
        key={req.id}
        className="format-editor sheet-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-picker-title"
      >
        <header>
          <div>
            <h2 id="sheet-picker-title">Choose a worksheet</h2>
            <p>
              {req.fileName} has {req.names.length} worksheets. Pick the one to import.
            </p>
          </div>
        </header>
        <ul className="sheet-picker-list">
          {req.names.map((name, k) => (
            <li key={k}>
              <button type="button" autoFocus={k === 0} onClick={() => finish(k)}>
                <Sheet size={15} aria-hidden="true" />
                <span>{name}</span>
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
