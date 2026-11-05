// Touch and pen input rules (track R5). Pure: the canvas gesture hook feeds it pointer events.
// - Palm rejection: while a pen is down, and for a short grace period after it lifts, touches are ignored.
// - Pen draws, finger pans: once a pen has been used on this device, a single finger pans the board while
//   the pen tool is active, so resting or moving a finger never leaves ink. Before any pen is seen, touch
//   keeps drawing (finger-only tablets). Two fingers still pinch-zoom in every tool.

export type PenState = { penDown: number | null; penSeen: boolean; penUpAt: number };
export const newPenState = (): PenState => ({ penDown: null, penSeen: false, penUpAt: -Infinity });
/** Touches this soon after the pen lifts are still treated as the resting palm. */
export const PALM_GRACE_MS = 400;
export type TouchPolicy = 'ignore' | 'pan' | 'default';
type PointerLike = { pointerType: string; pointerId: number };

/** What to do with a pointer-down: ignore it (palm), pan with it (finger in the pen tool), or the usual tool. */
export function pointerPolicy(state: PenState, e: PointerLike, tool: string, now: number): TouchPolicy {
  if (e.pointerType !== 'touch') return 'default';
  if (state.penDown !== null || now - state.penUpAt < PALM_GRACE_MS) return 'ignore';
  return tool === 'pen' && state.penSeen ? 'pan' : 'default';
}
/** Touch moves and lifts are ignored while the pen is down (palm rejection). */
export const ignoreTouch = (state: PenState, e: PointerLike, now: number) =>
  e.pointerType === 'touch' && (state.penDown !== null || now - state.penUpAt < PALM_GRACE_MS);
/** Long press (track C): a still finger held this long opens the context menu; moving further cancels it. */
export const LONG_PRESS_MS = 500;
export const LONG_PRESS_SLOP = 8;
/** A long press only starts from a single finger in the select tool, never from a palm or a panning finger. */
export const longPressApplies = (pointerType: string, policy: TouchPolicy, tool: string, fingers: number) =>
  pointerType === 'touch' && policy === 'default' && tool === 'select' && fingers === 1;
/** True once the finger has strayed more than the slop (screen pixels) from where it went down. */
export const longPressMoved = (start: { x: number; y: number }, now: { x: number; y: number }) =>
  Math.hypot(now.x - start.x, now.y - start.y) > LONG_PRESS_SLOP;
export function penDown(state: PenState, e: PointerLike): PenState {
  return e.pointerType === 'pen' ? { ...state, penDown: e.pointerId, penSeen: true } : state;
}
export function penUp(state: PenState, e: PointerLike, now: number): PenState {
  return e.pointerType === 'pen' && state.penDown === e.pointerId ? { ...state, penDown: null, penUpAt: now } : state;
}
