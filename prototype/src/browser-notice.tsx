// Supported browsers notice (track R2-K): a dismissible banner when the browser lacks an API the board relies
// on. It never blocks the board, and dismissing it is remembered (best effort) for that set of features.
import { useState } from 'react';
import { X } from 'lucide-react';
import { detectFeatures, noticeSignature, noticeText, NOTICE_KEY, shouldShowNotice } from './browser-support';
import type { BrowserEnv } from './browser-support';
import './r2-platform.css';

const readDismissed = () => {
  try {
    return localStorage.getItem(NOTICE_KEY);
  } catch {
    return null;
  }
};

export function BrowserNotice() {
  const [report] = useState(() => detectFeatures(globalThis as unknown as BrowserEnv));
  const [open, setOpen] = useState(() => shouldShowNotice(report, readDismissed()));
  if (!open) return null;
  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(NOTICE_KEY, noticeSignature(report));
    } catch {
      /* Storage unavailable: the notice shows again next time. */
    }
  };
  return (
    <div className="browser-notice floating" role="status" aria-label="Browser support">
      <p>{noticeText(report)}</p>
      <button className="icon-button" aria-label="Dismiss browser notice" title="Dismiss" onClick={dismiss}>
        <X size={16} />
      </button>
    </div>
  );
}
