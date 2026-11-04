// Brand kit editor (track R3), opened from Main menu → Preferences → Brand kit. The palette and default font
// are kept in this browser and shown first in colour and font pickers.
import { useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { colorName, fontFamilies, fontStack, type FontFamily } from './model';
import {
  addBrandColor,
  BRAND_COLORS_MAX,
  getBrandKit,
  removeBrandColor,
  setBrandKit,
  subscribeBrandKit,
} from './brand-kit';

/** The brand kit of this browser; re-renders when it changes. */
export const useBrandKit = () => useSyncExternalStore(subscribeBrandKit, getBrandKit, getBrandKit);

/**
 * Brand colour buttons shown next to a colour input (nothing when the kit is empty). One component for every
 * colour picker; `label` names the group when several pickers share a panel. Keep it outside a `<label>`, or
 * the first swatch would become that label's control.
 */
export function BrandSwatches({
  value,
  onPick,
  label = 'Brand colours',
  disabled,
}: {
  value?: string;
  onPick: (color: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const kit = useBrandKit();
  if (!kit.colors.length) return null;
  return (
    <span className="brand-swatches" role="group" aria-label={label}>
      {kit.colors.map(c => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          className={value?.toLowerCase() === c ? 'chosen' : ''}
          aria-label={`Brand colour ${colorName(c)}`}
          aria-pressed={value?.toLowerCase() === c}
          title={`Brand colour ${c}`}
          style={{ background: c }}
          onClick={() => onPick(c)}
        />
      ))}
    </span>
  );
}

export function BrandKitPanel({ onClose }: { onClose: () => void }) {
  const kit = useBrandKit();
  const [draft, setDraft] = useState('#4262ff'),
    [note, setNote] = useState('');
  const save = (next: Parameters<typeof setBrandKit>[0]) =>
    setNote(setBrandKit(next) ? '' : 'The brand kit could not be stored in this browser.');
  return (
    <aside
      className="facilitate-panel floating board-side-panel brand-kit-panel"
      aria-label="Brand kit"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="panel-heading">
        <h2>Brand kit</h2>
        <button className="icon-button" aria-label="Close brand kit" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <p>Your colours and font are shown first in colour and font pickers. They are kept in this browser.</p>
      <h3 className="templates-subhead">Colours</h3>
      {kit.colors.length ? (
        <ul className="brand-kit-colors" aria-label="Brand colours">
          {kit.colors.map(c => (
            <li key={c}>
              <i style={{ background: c }} aria-hidden="true" />
              <span>{c}</span>
              <button
                className="icon-button"
                aria-label={`Remove brand colour ${c}`}
                onClick={() => save(removeBrandColor(kit, c))}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No brand colours yet.</p>
      )}
      <form
        className="brand-kit-add"
        onSubmit={e => {
          e.preventDefault();
          save(addBrandColor(kit, draft));
        }}
      >
        <input type="color" aria-label="New brand colour" value={draft} onChange={e => setDraft(e.target.value)} />
        <button type="submit" disabled={kit.colors.length >= BRAND_COLORS_MAX || kit.colors.includes(draft)}>
          Add colour
        </button>
      </form>
      <label className="field">
        Default font
        <select
          aria-label="Brand font"
          value={kit.font ?? ''}
          onChange={e => save({ ...kit, font: (e.target.value || undefined) as FontFamily | undefined })}
        >
          <option value="">None</option>
          {fontFamilies.map(f => (
            <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>
              {f === 'monospace' ? 'Monospace' : f}
            </option>
          ))}
        </select>
      </label>
      {note && <p role="alert">{note}</p>}
    </aside>
  );
}
