// Notice timing and roles (item 148, CommonShared el-toast). Pure.
// Errors are announced as alerts and stay long enough to read and act on; a notice with buttons stays long enough
// to reach them; anything else is a short polite status.

export type NoticeKind = 'info' | 'error';
/** A one-click follow-up shown in a notice, e.g. "One sticky per cell" after a grid paste. */
export type NoticeAction = { label: string; run: () => void };
/** The app's notice function, as passed to widgets and panels. */
export type Display = (message: string, action?: NoticeAction | NoticeAction[], kind?: NoticeKind) => void;

/** How long a notice stays, in milliseconds. */
export function noticeDuration(kind: NoticeKind, hasActions: boolean): number {
  if (kind === 'error') return 10_000;
  return hasActions ? 8_000 : 5_000;
}
