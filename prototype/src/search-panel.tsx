import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import type { Board } from './model';
import { searchBoard } from './navigation';
import type { SearchResult } from './navigation';

const fieldLabel: Record<SearchResult['field'], string> = {
  text: 'Text',
  label: 'Connector label',
  tag: 'Tag',
  topic: 'Mind map topic',
};
/** Board search. Results update with every board change; nothing is modified by searching. */
export function SearchPanel({
  board,
  exclude,
  onReveal,
  onMatches,
  onClose,
}: {
  board: Board;
  exclude?: Set<string>;
  onReveal: (id: string) => void;
  onMatches: (ids: string[], current: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    [index, setIndex] = useState(0),
    input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLOListElement>(null);
  const results = useMemo(() => searchBoard(board, query, 500, exclude), [board, query, exclude]),
    current = results[Math.min(index, results.length - 1)];
  useEffect(() => {
    input.current?.focus();
    return () => onMatches([], null);
  }, []);
  useEffect(() => {
    onMatches(
      results.map(r => r.id),
      current?.id ?? null,
    );
  }, [results, current?.id]);
  useEffect(() => {
    if (index >= results.length && results.length) setIndex(results.length - 1);
  }, [results.length]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  const go = (next: number) => {
    if (!results.length) return;
    const i = (next + results.length) % results.length;
    setIndex(i);
    onReveal(results[i].id);
  };
  return (
    <aside
      className="search-panel floating"
      aria-label="Search board"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="search-field">
        <Search size={17} />
        <input
          ref={input}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="search-results"
          aria-activedescendant={current ? `result-${current.id}` : undefined}
          aria-label="Search text, labels and tags"
          placeholder="Search text, labels and tags"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              go(index + 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              go(index - 1);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (current) go(e.shiftKey ? index - 1 : index);
            }
          }}
        />
        <span className="search-count" aria-live="polite">
          {query.trim()
            ? results.length
              ? `${Math.min(index, results.length - 1) + 1} of ${results.length}${results.length >= 500 ? '+' : ''}`
              : 'No results'
            : ''}
        </span>
        <button
          className="icon-button"
          aria-label="Previous result"
          disabled={!results.length}
          onClick={() => go(index - 1)}
        >
          <ChevronUp size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Next result"
          disabled={!results.length}
          onClick={() => go(index + 1)}
        >
          <ChevronDown size={16} />
        </button>
        <button className="icon-button" aria-label="Close search" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {query.trim() !== '' &&
        (results.length ? (
          <ol ref={list} id="search-results" role="listbox" aria-label="Search results" className="search-results">
            {results.slice(0, 200).map((r, i) => (
              <li
                key={r.id}
                id={`result-${r.id}`}
                role="option"
                aria-selected={r === current}
                className={r === current ? 'current' : ''}
                onClick={() => go(i)}
              >
                <span>{r.snippet || 'Untitled'}</span>
                <small>
                  {fieldLabel[r.field]} · {r.type}
                </small>
              </li>
            ))}
            {results.length > 200 && (
              <li className="search-more">Showing the first 200 results. Refine the search to narrow them down.</li>
            )}
          </ol>
        ) : (
          <p className="search-empty">Nothing on this board matches “{query.trim()}”.</p>
        ))}
    </aside>
  );
}
