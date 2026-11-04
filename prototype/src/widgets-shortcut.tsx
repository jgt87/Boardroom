// Action Shortcut view and editor (item 99). Clicking the button runs its action; the board
// handles frame, presentation and timer actions through a window event (see board-app).
import './widgets-people.css';
import { useState } from 'react';
import { Zap } from 'lucide-react';
import type { Item } from './model';
import type { WidgetCtx, WidgetView } from './widget-types';
import { Dialog, data, setData, stop } from './widget-kit';
import { BrandSwatches } from './brand-kit-panel';
import { isSafeLink, shortcutActions, SHORTCUT_EVENT } from './specs-shortcut';
import type { ShortcutAction, ShortcutData } from './specs-shortcut';
import { readableTextOn } from './board-tools';

export function runShortcut(d: ShortcutData) {
  if (d.action === 'link') {
    if (isSafeLink(d.target)) window.open(d.target, '_blank', 'noopener,noreferrer');
    return;
  }
  window.dispatchEvent(new CustomEvent(SHORTCUT_EVENT, { detail: d }));
}

function ShortcutRender({ item }: { item: Item }) {
  const d = data<ShortcutData>(item);
  return (
    <div className="w-shortcut">
      <button
        style={{ background: item.fill, color: readableTextOn(item.fill) }}
        onPointerDown={stop}
        onClick={() => runShortcut(d)}
        title={shortcutActions.find(a => a.id === d.action)?.label}
      >
        <Zap size={16} />
        <span>{item.text}</span>
      </button>
    </div>
  );
}

function ShortcutEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const d = data<ShortcutData>(item);
  const [label, setLabel] = useState(item.text),
    [action, setAction] = useState<ShortcutAction>(d.action),
    [target, setTarget] = useState(d.target),
    [fill, setFill] = useState(item.fill);
  const frames = ctx.board.items.filter(i => i.type === 'frame');
  const error = !label.trim()
    ? 'Enter a label.'
    : action === 'link' && !isSafeLink(target)
      ? 'Enter a web address starting with https://'
      : action === 'frame' && !frames.some(f => f.id === target)
        ? 'Choose a frame.'
        : '';
  return (
    <Dialog
      title="Action Shortcut"
      hint="Click the button on the board to run its action."
      error={error}
      applyDisabled={!!error}
      onClose={onClose}
      onApply={() => {
        if (error) return;
        setData(
          ctx,
          item.id,
          { action, target: action === 'link' || action === 'frame' ? target : '' },
          { text: label.trim().slice(0, 80), fill },
        );
        onClose();
      }}
    >
      <div className="w-form">
        <label>
          Label
          <input aria-label="Shortcut label" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} />
        </label>
        <label>
          Colour
          <input type="color" aria-label="Shortcut colour" value={fill} onChange={e => setFill(e.target.value)} />
        </label>
        <BrandSwatches label="Brand colours for shortcut" value={fill} onPick={setFill} />
        <label className="span2">
          Action
          <select
            aria-label="Shortcut action"
            value={action}
            onChange={e => setAction(e.target.value as ShortcutAction)}
          >
            {shortcutActions.map(a => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        {action === 'link' && (
          <label className="span2">
            Link
            <input
              aria-label="Shortcut link"
              type="url"
              placeholder="https://example.com"
              value={target}
              onChange={e => setTarget(e.target.value)}
            />
          </label>
        )}
        {action === 'frame' && (
          <label className="span2">
            Frame
            <select aria-label="Shortcut frame" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">Choose a frame</option>
              {frames.map(f => (
                <option key={f.id} value={f.id}>
                  {f.text || 'Untitled frame'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Dialog>
  );
}

export const shortcutView: WidgetView = {
  kind: 'shortcut',
  mode: 'html',
  interactive: true,
  Render: ShortcutRender,
  Editor: ShortcutEditor,
};
