// Click-through prototype preview (item 38). Evidence: PrototypingScreenWidget PROTOTYPING_SCREEN_PREVIEW.
//
// Wiring contract for main.tsx:
//  1. Listen for `PREVIEW_EVENT` on window (detail { screenId }), dispatched by the screen "Preview prototype" action.
//  2. `const preview = usePreviewState(board, startScreenId)` (startScreenId null when not previewing).
//  3. Pass `preview` as ctx.preview to widget renders (or provide it via <PreviewContext.Provider>), and block
//     canvas editing gestures while preview is set; interactive wireframes stop pointerdown themselves.
//  4. Render <PrototypePreview board state={preview} size onCamera onExit/> while preview is set.
import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import type { Board } from './model';
import type { PreviewState } from './widget-types';
import { fitFrame } from './navigation';
import type { Camera } from './navigation';

export const PREVIEW_EVENT = 'boardroom:prototype-preview';
export const PreviewContext = createContext<PreviewState | undefined>(undefined);

export type PreviewController = PreviewState & { history: string[]; back: () => void };
/** Owns preview navigation and input values. Values reset every time a preview starts. */
export function usePreviewState(board: Board, startScreenId: string | null): PreviewController | undefined {
  const [screenId, setScreenId] = useState<string | null>(startScreenId),
    [values, setValues] = useState<Record<string, string | number | boolean>>({}),
    [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    setScreenId(startScreenId);
    setValues({});
    setHistory([]);
  }, [startScreenId]);
  const exists = (id: string) => board.items.some(i => i.id === id && i.type === 'screen');
  return useMemo(() => {
    if (!startScreenId || !screenId) return undefined;
    return {
      screenId,
      values,
      history,
      setValue: (id, v) => setValues(prev => ({ ...prev, [id]: v })),
      go: id => {
        if (!exists(id) || id === screenId) return;
        setHistory(h => [...h, screenId]);
        setScreenId(id);
      },
      back: () =>
        setHistory(h => {
          const prev = [...h].reverse().find(exists);
          if (prev) setScreenId(prev);
          return prev ? h.slice(0, h.lastIndexOf(prev)) : [];
        }),
    };
  }, [startScreenId, screenId, values, history, board]);
}

/** Preview chrome: fits the camera to the current screen, shows navigation, Esc exits. */
export function PrototypePreview({
  board,
  state,
  size,
  onCamera,
  onExit,
}: {
  board: Board;
  state: PreviewController;
  size: { w: number; h: number };
  onCamera: (c: Camera) => void;
  onExit: () => void;
}) {
  const screens = board.items.filter(i => i.type === 'screen'),
    screen = screens.find(s => s.id === state.screenId),
    exit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!screen) onExit();
  }, [screen]);
  useEffect(() => {
    if (screen) onCamera(fitFrame(screen, size, 40));
  }, [screen?.id, screen?.x, screen?.y, screen?.w, screen?.h, size.w, size.h]);
  useEffect(() => {
    exit.current?.focus();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input,textarea,select');
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onExit();
        return;
      }
      if (!typing && e.key === 'Backspace' && state.history.length) {
        e.preventDefault();
        state.back();
      }
      // Keep whiteboard shortcuts (delete, tools, undo) from editing the board during preview.
      if (!typing) e.stopImmediatePropagation();
    };
    addEventListener('keydown', key, true);
    return () => removeEventListener('keydown', key, true);
  }, [state.history.length]);
  if (!screen) return null;
  return (
    <div className="proto-preview" aria-label="Prototype preview">
      <div className="proto-bar floating" role="toolbar" aria-label="Prototype preview controls">
        <button
          className="icon-button"
          aria-label="Back to previous screen"
          disabled={!state.history.length}
          onClick={state.back}
        >
          <ChevronLeft size={18} />
        </button>
        <span aria-live="polite">
          {screen.text || 'Untitled screen'} · {screens.indexOf(screen) + 1} / {screens.length}
        </span>
        <span className="divider" />
        <button ref={exit} onClick={onExit}>
          <X size={16} />
          Exit preview
        </button>
      </div>
    </div>
  );
}
