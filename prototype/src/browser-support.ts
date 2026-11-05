// Supported browsers (track R2-K). Pure: feature detection for the APIs Boardroom relies on, and whether the
// "this browser is missing features" notice should show. The notice never blocks the board.

/** Features the app needs, with the plain-language consequence shown when one is missing. */
export const requiredFeatures = [
  { id: 'indexedDB', label: 'IndexedDB', effect: 'images, videos and PDFs cannot be stored' },
  { id: 'resizeObserver', label: 'ResizeObserver', effect: 'text and panels may not resize correctly' },
  { id: 'cssHas', label: 'CSS :has()', effect: 'some menus and highlights may look wrong' },
  { id: 'structuredClone', label: 'structuredClone', effect: 'copying and undo may fail' },
  { id: 'pointerEvents', label: 'Pointer events', effect: 'drawing, dragging and touch input will not work' },
  { id: 'localStorage', label: 'Local storage', effect: 'boards cannot be saved on this device' },
] as const;
export type FeatureId = (typeof requiredFeatures)[number]['id'];
export type FeatureReport = Record<FeatureId, boolean>;

/** What the detection reads; `globalThis` in the browser, a stub in tests. */
export type BrowserEnv = {
  indexedDB?: unknown;
  ResizeObserver?: unknown;
  structuredClone?: unknown;
  PointerEvent?: unknown;
  CSS?: { supports?: (condition: string) => boolean };
  localStorage?: { getItem(key: string): string | null };
};

/** Detect each required feature. Any probe that throws counts as missing. */
export function detectFeatures(env: BrowserEnv): FeatureReport {
  const probe = (fn: () => boolean) => {
    try {
      return !!fn();
    } catch {
      return false;
    }
  };
  return {
    indexedDB: probe(() => typeof env.indexedDB === 'object' && env.indexedDB !== null),
    resizeObserver: probe(() => typeof env.ResizeObserver === 'function'),
    cssHas: probe(() => typeof env.CSS?.supports === 'function' && env.CSS.supports('selector(:has(*))')),
    structuredClone: probe(() => typeof env.structuredClone === 'function'),
    pointerEvents: probe(() => typeof env.PointerEvent === 'function'),
    localStorage: probe(() => {
      const ls = env.localStorage;
      if (!ls) return false;
      ls.getItem('boardroom.probe');
      return true;
    }),
  };
}
/** The features a report marks as missing, in display order. */
export const missingFeatures = (report: FeatureReport) => requiredFeatures.filter(f => !report[f.id]);

/** localStorage key remembering which missing-feature set the user dismissed. */
export const NOTICE_KEY = 'boardroom.browserNotice.v1';
/** A stable key for a set of missing features, so a newly missing feature shows the notice again. */
export const noticeSignature = (report: FeatureReport) =>
  missingFeatures(report)
    .map(f => f.id)
    .join(',');
/** Show the notice when something is missing and that exact set was not dismissed before. */
export const shouldShowNotice = (report: FeatureReport, dismissed: string | null) => {
  const sig = noticeSignature(report);
  return sig !== '' && sig !== dismissed;
};
/** Notice text listing the missing features and what they affect. */
export function noticeText(report: FeatureReport): string {
  const missing = missingFeatures(report);
  if (!missing.length) return '';
  return `This browser is missing ${missing.map(f => f.label).join(', ')}, so ${missing
    .map(f => f.effect)
    .join('; ')}. Update this browser or use another current browser for the full board.`;
}
