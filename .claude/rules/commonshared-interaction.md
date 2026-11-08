---
paths:
  - "**/*.{tsx,jsx,ts,js,vue,svelte}"
---
<!-- managed by __CommonShared/rules/interaction.md; sha256:250ade2b0c7cc032; edit it there, put project rules in project-*.md -->
# Interaction rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Cursors
- Set a cursor only when it says what will happen; no custom cursor images; spinner on the control instead of `wait`. (docs/02 §1)
- Web: `pointer` on clickable controls, rows and cards (native desktop apps keep the arrow); `not-allowed` on disabled. (docs/02 §1, docs/19 §7)
- `grab` → `grabbing` for pannable or draggable things, `move` for a selected movable object, `crosshair` for drawing tools. (docs/02 §1)
- Resize cursors match the axis: `ew/ns-resize` on axes and 1-D handles, `col/row-resize` on splitters, `nwse/nesw` on corners. (docs/02 §1)
- Transient canvas cursors go inline on the container and reset to `''` so the tool class sets the base; pair enter with leave. (docs/02 §1)

## Pointer events and drags
- Use Pointer Events for anything draggable; mouse events only for simple hover. (docs/02 §2)
- `setPointerCapture(e.pointerId)` on down, or window move/up listeners removed on end, cancel, blur and unmount. (docs/02 §2, L-UI)
- Treat `pointercancel` and `lostpointercapture` exactly like an aborted drag. (docs/02 §2)
- A drag starts after 4px of movement (3–4px); below that it is a click. (docs/02 §2)
- Long-press on touch: 500ms with 8px slop. (docs/02 §2)
- Hit slop: lines 6px, grips 8px; small visible handles get a ~22px hit target. (docs/02 §2)
- Only the primary button draws or drags; canvas libraries also need a window-level `mouseup`. (L-UI)
- Esc during a gesture cancels and restores the start state; Esc unwinds drag → creation → selection → tool. (docs/02 §2)
- Every drag action also has a keyboard or button path. (docs/02 §2, docs/03 §3)
- Canvas hover read-outs pick the nearest point on `pointermove` and clear on `pointerleave`. (docs/02 §2)
- Board focus rings and selection chrome show only for keyboard use or while the editor has focus, never mid-drag. (docs/17 §8)

## Snapping and modifiers
- Snap within 6–12 screen px (not world units), so the feel does not change with zoom. (docs/02 §2)
- Shift = constrain axis / keep aspect / extend selection; Ctrl/Cmd = additive select; Alt = no snap; Alt-drag = duplicate. (docs/02 §2)
- Handles keep a fixed screen distance (14px) and counter-scale zoom with a maximum on-screen size. (docs/17 §10)

## Wheel, zoom and pan
- Ctrl/Cmd + wheel and trackpad pinch always zoom, anchored at the cursor. (docs/02 §3)
- Plain wheel zooms with a mouse and pans with a trackpad: auto-detect or make it a setting; Shift + wheel pans sideways. (docs/02 §3)
- Space + drag and middle-button drag pan; release on keyup, blur and `visibilitychange`. (docs/02 §3)
- Normalise `deltaMode` first (line ×16, page ×400); zoom factor `exp(-deltaY * k)` with k 0.0015–0.008. (docs/02 §3)
- Clamp zoom: 0.1–2 diagrams, 0.2–5 charts, 0.1–20 whiteboards; `+`/`-` step ×1.2, Ctrl+0 fits. (docs/02 §3)
- Attach wheel listeners as `{ passive: false }` by hand when calling `preventDefault` (framework wheel props, e.g. React `onWheel`, are passive). (docs/02 §3)
- Stop wheel propagation in panes and modals only when they can scroll (`scrollHeight > clientHeight`). (docs/17 §6, L-UI)
- Close context menus and popovers on wheel. (docs/02 §3)

## Clicks and context menus
- Double-click edits in place or creates; turn off the library's zoom-on-double-click when it creates. (docs/02 §4)
- Double-click on an axis resets that axis. (docs/02 §3)
- Right-click cancels an in-progress placement, otherwise opens the app's own menu. (docs/02 §4)
- A context menu is never the only path: mirror it in a visible `⋯` menu or toolbar; Shift+F10 / ContextMenu key open it. (docs/02 §4)
- Suppress the browser context menu only on surfaces that supply their own. (docs/01 §6)

## Keyboard
- Ctrl/Cmd+K palette, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo/redo, Ctrl+D duplicate, Ctrl+A select all, `?` shortcut help. (docs/02 §5)
- Arrows nudge 1px, Shift+arrows 10px; F2 renames; Enter/Space activate a focused card. (docs/02 §5)
- Single-letter tool keys only when focus is outside text fields; match Shift chords on `event.code`. (docs/02 §5)
- Enter sends and Shift+Enter adds a line in composers; ignore Enter during IME composition. (docs/02 §5)
- Shortcuts complement visible controls and appear in their tooltips as `kbd`. (docs/02 §5)
- In React: keep dialog callbacks in a ref (`useLatest`) so focus effects don't rerun and steal focus each render. (docs/17 §6, L-UI)
- Global listeners in hidden but mounted views are gated on an `isActive` flag and removed in cleanup. (L-UI)

## Touch and hover
- `touch-action: none` (or `pan-y`) only on surfaces you drive yourself, `manipulation` on buttons. (docs/02 §6, docs/17 §9)
- `user-select: none` on the canvas or app area only; inputs opt back in. (docs/17 §9)
- No information or action reachable only on hover: touch gets a tap or `:active` path. (docs/02 §7, docs/17 §7)
- Busy actions disable the control, show an inline spinner and label, and lock against double submission. (docs/02 §7)

## Undo and destructive actions
- Delete/Backspace and every destructive action route through the app's command layer with undo, not the library default. (docs/02 §5)
- A destructive action that cannot be undone needs a recovery path; solid red only on its final confirm button. (docs/03 §3, docs/01 §5)
