/** Per-browser view preferences (not part of the board document). */
export type ViewPrefs = {
  grid: boolean;
  dimensions: boolean;
  spellcheck: boolean;
  /** Item 104. 'trackpad': wheel pans, Ctrl+wheel or pinch zooms. 'mouse': wheel zooms, Shift+wheel pans. */
  navigation: 'trackpad' | 'mouse' | 'auto';
  singleKeys: boolean;
  reduceMotion: boolean;
  comments: boolean;
  undoControls: boolean;
  /** Do Not Disturb (item 108): mute the timer sound and reaction animations. */
  dnd: boolean;
  /** Snap moved objects to the 40 px grid (gap D2). */
  snapGrid: boolean;
  /** Grid drawn as lines or dots (gap D2). */
  gridStyle: 'lines' | 'dots';
  /** Extra tools pinned to the creation toolbar (gap F12): object kinds, in order. */
  pinned: string[];
};
export const VIEW_PREFS_KEY = 'boardroom.view.v1';
export const defaultViewPrefs: ViewPrefs = {
  grid: true,
  dimensions: false,
  spellcheck: true,
  navigation: 'trackpad',
  singleKeys: true,
  reduceMotion: false,
  comments: true,
  undoControls: true,
  dnd: false,
  snapGrid: false,
  gridStyle: 'lines',
  pinned: [],
};

/** Parse stored preferences, falling back to defaults for anything missing or invalid. */
export function parseViewPrefs(raw: string | null | undefined, systemReducedMotion = false): ViewPrefs {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return {
      grid: typeof v?.grid === 'boolean' ? v.grid : defaultViewPrefs.grid,
      dimensions: typeof v?.dimensions === 'boolean' ? v.dimensions : defaultViewPrefs.dimensions,
      spellcheck: typeof v?.spellcheck === 'boolean' ? v.spellcheck : defaultViewPrefs.spellcheck,
      navigation: v?.navigation === 'mouse' || v?.navigation === 'auto' ? v.navigation : 'trackpad',
      singleKeys: typeof v?.singleKeys === 'boolean' ? v.singleKeys : defaultViewPrefs.singleKeys,
      // Until the person chooses, follow the operating system's reduced-motion setting (gap F8).
      reduceMotion: typeof v?.reduceMotion === 'boolean' ? v.reduceMotion : systemReducedMotion,
      comments: typeof v?.comments === 'boolean' ? v.comments : defaultViewPrefs.comments,
      undoControls: typeof v?.undoControls === 'boolean' ? v.undoControls : defaultViewPrefs.undoControls,
      dnd: typeof v?.dnd === 'boolean' ? v.dnd : defaultViewPrefs.dnd,
      snapGrid: typeof v?.snapGrid === 'boolean' ? v.snapGrid : defaultViewPrefs.snapGrid,
      gridStyle: v?.gridStyle === 'dots' ? 'dots' : 'lines',
      pinned: Array.isArray(v?.pinned)
        ? [
            ...new Set((v.pinned as unknown[]).filter((k): k is string => typeof k === 'string' && k.length <= 40)),
          ].slice(0, 12)
        : [],
    };
  } catch {
    return { ...defaultViewPrefs, reduceMotion: systemReducedMotion };
  }
}

const systemReduce = () => {
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
export function loadViewPrefs(): ViewPrefs {
  try {
    return parseViewPrefs(localStorage.getItem(VIEW_PREFS_KEY), systemReduce());
  } catch {
    return { ...defaultViewPrefs };
  }
}

export function saveViewPrefs(prefs: ViewPrefs) {
  try {
    localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* Preferences still apply for this session when storage is unavailable. */
  }
}

/** Width × height label for a selection, rounded to whole pixels. */
export const dimensionLabel = (b: { w: number; h: number }) => `${Math.round(b.w)} × ${Math.round(b.h)}`;

/** Auto-detect (item 107): line-based or large whole-number vertical steps come from a mouse wheel. */
export const wheelLooksLikeMouse = (e: { deltaMode: number; deltaX: number; deltaY: number }) =>
  e.deltaMode === 1 || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);

/** True while Do Not Disturb is on (set on <html> by the app, so effects and sounds can check it). */
export const doNotDisturb = () => typeof document !== 'undefined' && document.documentElement.dataset.dnd === 'on';
