// Template picker shown after Board → New board (track R3): a blank board, a gallery template or a saved
// template, each with a preview. Search covers names, categories and descriptions.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { filterTemplates } from './starter-templates';
import type { TemplateName } from './board-tools';
import { loadTemplates, templatePreview, type UserTemplate } from './user-templates';
import { PreviewThumb, StarterThumb } from './board-thumb';

export function TemplatePicker({
  onBlank,
  onStarter,
  onUser,
  onClose,
}: {
  onBlank: () => void;
  onStarter: (name: TemplateName) => void;
  onUser: (t: UserTemplate) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    search = useRef<HTMLInputElement>(null);
  const [mine] = useState(() => loadTemplates());
  const previews = useMemo(() => new Map(mine.map(t => [t.id, templatePreview(t)])), [mine]);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    search.current?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  const q = query.trim().toLowerCase();
  const starters = filterTemplates(query),
    users = mine.filter(t => !q || `${t.name} ${t.description ?? ''}`.toLowerCase().includes(q));
  return (
    <div
      className="format-overlay dashboard-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
      onPointerDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="format-editor dashboard template-picker" role="dialog" aria-modal="true" aria-label="New board">
        <header>
          <div>
            <h2>New board</h2>
            <p>Start blank or from a template.</p>
          </div>
          <button className="icon-button" aria-label="Close new board" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="dashboard-tools">
          <label className="gallery-search">
            <input
              ref={search}
              type="search"
              aria-label="Search templates"
              placeholder="Search templates"
              maxLength={80}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
        </div>
        <ul className="template-gallery" aria-label="Templates for the new board">
          {!q && (
            <li>
              <button className="template-tile" onClick={onBlank}>
                <span className="template-tile-thumb blank">
                  <Plus size={28} aria-hidden="true" />
                </span>
                <strong>Blank board</strong>
              </button>
            </li>
          )}
          {starters.map(t => (
            <li key={t.name}>
              <button className="template-tile" onClick={() => onStarter(t.name as TemplateName)} title={t.about}>
                <span className="template-tile-thumb">
                  <StarterThumb name={t.name as TemplateName} />
                </span>
                <strong>{t.name}</strong>
                <small>{t.category}</small>
              </button>
            </li>
          ))}
          {users.map(t => (
            <li key={t.id}>
              <button className="template-tile" onClick={() => onUser(t)} title={t.description || undefined}>
                <span className="template-tile-thumb">
                  <PreviewThumb preview={previews.get(t.id) ?? []} />
                </span>
                <strong>{t.name}</strong>
                <small>My template</small>
              </button>
            </li>
          ))}
          {q && !starters.length && !users.length && <li className="board-empty">No templates match “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}
