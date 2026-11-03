// Full emoji picker (item 6): categories, search, skin tones, recent emojis and a keyboard-navigable grid.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Clock } from 'lucide-react';
import {
  loadEmojiGroups,
  searchEmojis,
  applySkinTone,
  pushRecent,
  readStored,
  writeStored,
  isRecentList,
  isToneId,
  skinTones,
  RECENT_KEY,
  TONE_KEY,
} from './emoji-data';
import type { EmojiEntry, EmojiGroup } from './emoji-data';
import './emoji-picker.css';

const groupIcons: Record<string, string> = {
  smileys_emotion: '😀',
  people_body: '👋',
  animals_nature: '🐻',
  food_drink: '🍔',
  travel_places: '✈️',
  activities: '⚽',
  objects: '💡',
  symbols: '❤️',
  flags: '🏁',
};

export type EmojiPickerProps = {
  current?: string;
  onChoose: (emoji: string | undefined) => void;
  onClose: () => void;
  /** Heading; defaults to the sticky-note marker wording. */
  title?: string;
  /** Hide the "Remove marker" action (for example when choosing a stamp). */
  allowRemove?: boolean;
  /** Footnote; defaults to the note about local markers. */
  note?: string | null;
  /** Extra choices shown above the search (for example built-in stickers). */
  extra?: React.ReactNode;
};

/** Anchored emoji picker. Arrow keys, Home/End and Page Up/Down move; Enter or Space chooses; Esc closes. */
export function EmojiPicker({
  current,
  onChoose,
  onClose,
  title = 'Marker',
  allowRemove = true,
  note,
  extra,
}: EmojiPickerProps) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null),
    [error, setError] = useState(''),
    [recent, setRecent] = useState<string[]>(() => readStored(RECENT_KEY, [], isRecentList)),
    [tab, setTab] = useState<string>(() =>
      readStored(RECENT_KEY, [], isRecentList).length ? 'recent' : 'smileys_emotion',
    ),
    [query, setQuery] = useState(''),
    [tone, setTone] = useState<string>(() => readStored(TONE_KEY, 'default', isToneId)),
    [focus, setFocus] = useState(0),
    grid = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  const modifier = skinTones.find(t => t.id === tone)?.modifier ?? '';

  useEffect(() => {
    let live = true;
    loadEmojiGroups()
      .then(g => live && setGroups(g))
      .catch(() => live && setError('The emoji list could not be loaded.'));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    search.current?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);

  const byEmoji = useMemo(() => {
    const map = new Map<string, EmojiEntry>();
    for (const g of groups ?? []) for (const e of g.emojis) map.set(e.emoji, e);
    return map;
  }, [groups]);
  const items: { emoji: string; name: string }[] = useMemo(() => {
    const decorate = (e: EmojiEntry) => ({ emoji: e.skin ? applySkinTone(e.emoji, modifier) : e.emoji, name: e.name });
    if (!groups) return [];
    if (query.trim()) return searchEmojis(groups, query).map(decorate);
    if (tab === 'recent') return recent.map(r => ({ emoji: r, name: byEmoji.get(r)?.name ?? 'recently used emoji' }));
    return (groups.find(g => g.slug === tab)?.emojis ?? []).map(decorate);
  }, [groups, query, tab, recent, byEmoji, modifier]);

  useEffect(() => setFocus(0), [tab, query]);
  const choose = (emoji: string) => {
    const next = pushRecent(recent, emoji);
    setRecent(next);
    writeStored(RECENT_KEY, next);
    onChoose(emoji);
  };
  const columns = () => {
    const el = grid.current;
    if (!el) return 8;
    const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
    return cols || 8;
  };
  const moveFocus = (index: number) => {
    const i = Math.max(0, Math.min(items.length - 1, index));
    setFocus(i);
    grid.current?.querySelector<HTMLButtonElement>(`[data-index="${i}"]`)?.focus();
  };
  const gridKeys = (e: React.KeyboardEvent) => {
    const cols = columns(),
      page = cols * 5,
      steps: Record<string, number> = {
        ArrowRight: 1,
        ArrowLeft: -1,
        ArrowDown: cols,
        ArrowUp: -cols,
        PageDown: page,
        PageUp: -page,
      };
    if (e.key in steps) {
      e.preventDefault();
      if (e.key === 'ArrowUp' && focus < cols) search.current?.focus();
      else moveFocus(focus + steps[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveFocus(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      moveFocus(items.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = items[focus];
      if (item) choose(item.emoji);
    }
  };
  const tabs = [
    { slug: 'recent', name: 'Recently used', icon: '' },
    ...(groups ?? []).map(g => ({ slug: g.slug, name: g.name, icon: groupIcons[g.slug] ?? g.emojis[0]?.emoji ?? '' })),
  ];

  return (
    <aside
      className="emoji-picker-full floating"
      aria-label={title === 'Marker' ? 'Note marker' : title}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="panel-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label={title === 'Marker' ? 'Close marker picker' : `Close ${title.toLowerCase()} picker`}
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      {extra}
      <div className="ep-toolbar">
        <label className="ep-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={search}
            aria-label="Search emoji"
            placeholder="Search emoji"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown' && items.length) {
                e.preventDefault();
                moveFocus(0);
              } else if (e.key === 'Enter' && items[0]) {
                e.preventDefault();
                choose(items[0].emoji);
              }
            }}
          />
        </label>
        <select
          className="ep-tone"
          aria-label="Skin tone"
          value={tone}
          onChange={e => {
            setTone(e.target.value);
            writeStored(TONE_KEY, e.target.value);
          }}
        >
          {skinTones.map(t => (
            <option key={t.id} value={t.id}>
              {applySkinTone('\u{1F44B}', t.modifier)} {t.label}
            </option>
          ))}
        </select>
      </div>
      {!query.trim() && (
        <div className="ep-tabs" role="tablist" aria-label="Emoji categories">
          {tabs.map(t => (
            <button
              key={t.slug}
              role="tab"
              aria-selected={tab === t.slug}
              aria-label={t.name}
              title={t.name}
              className={tab === t.slug ? 'active' : ''}
              onClick={() => setTab(t.slug)}
            >
              {t.slug === 'recent' ? <Clock size={16} aria-hidden="true" /> : <span aria-hidden="true">{t.icon}</span>}
            </button>
          ))}
        </div>
      )}
      <h3 className="ep-heading">
        {query.trim() ? `Results for “${query.trim()}”` : (tabs.find(t => t.slug === tab)?.name ?? '')}
      </h3>
      {error ? (
        <p className="ep-empty" role="alert">
          {error}
        </p>
      ) : !groups ? (
        <p className="ep-empty" role="status">
          Loading emoji…
        </p>
      ) : items.length ? (
        <div ref={grid} className="ep-grid" role="listbox" aria-label="Emoji" onKeyDown={gridKeys}>
          {items.map((item, i) => (
            <button
              key={`${item.emoji}${i}`}
              data-index={i}
              role="option"
              tabIndex={i === focus ? 0 : -1}
              aria-label={`Use ${item.emoji}, ${item.name}`}
              title={item.name}
              aria-selected={current === item.emoji}
              className={current === item.emoji ? 'active' : ''}
              onFocus={() => setFocus(i)}
              onClick={() => choose(item.emoji)}
            >
              {item.emoji}
            </button>
          ))}
        </div>
      ) : (
        <p className="ep-empty">{query.trim() ? 'No emoji match that search.' : 'Emoji you use will appear here.'}</p>
      )}
      {allowRemove && (
        <div className="note-details-actions">
          <button disabled={!current} onClick={() => onChoose(undefined)}>
            Remove marker
          </button>
        </div>
      )}
      {note !== null && (
        <p className="ep-note">
          {note ?? 'Markers are saved with this note on this board. They are not shared reactions.'}
        </p>
      )}
    </aside>
  );
}
