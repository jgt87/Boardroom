---
paths:
  - "**/*{Drawer,drawer,Sheet,bottom-sheet,SidePanel,sidePanel,side-panel}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-drawer.md; sha256:90856db9f321b3b2; edit it there, put project rules in project-*.md -->
# Drawer rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Side drawers 285–360px wide, capped at `calc(100vw - 24px)`; bottom sheets full width, max ~85dvh. (docs/01 §4, docs/17 §9)
- `--raised` panel (or `--surface` when docked), 1px `--border` on the inner edge; `--shadow-dialog` only when it floats. (docs/21 §7)
- Title 14–16px/600 in a header whose close button keeps its place in every state. (docs/17 §4, docs/19 §5)
- One scroll area with `scrollbar-gutter: stable`; sheets show a small `--border-strong` grab handle. (docs/17 §4, docs/21 §7)
## Behaviour
- Docked (non-modal, page reflows) is the desktop default for inspectors; overlay (modal) is the phone default. (docs/21 §7)
- Enter ≤ 300ms with `--ease-out`, translated from its own edge; exit faster; reduced motion fades only. (docs/19 §7, §10)
- Never animate `width`; transform from the edge or reserve the space. (docs/19 §7, §10)
- Overlay variant: Esc closes, Tab trapped, focus returns; docked variant: Esc closes only when focus is inside. (docs/17 §6, docs/21 §7)
- Sheets dismiss on velocity (~0.11px/ms) or distance, resist past the open position, ignore extra touches mid-drag. (docs/19 §7)
- Every swipe has a close button too. (docs/02 §2)
- Height from its container's top and bottom offsets, never `100dvh` minus a guessed header. (docs/17 §5)
- On phones the controls stay in place and only the opened panel changes. (docs/17 §9)
## Accessibility
- Overlay variant: `role="dialog"` + `aria-modal="true"` + a label; docked: `role="complementary"` or a labelled region. (docs/21 §7)
- The toggle has `aria-expanded` and `aria-controls`. (docs/21 §7)
## Uses
- Dialog — behaviour of the overlay variant. (docs/21 §5)
- IconButton — the close control. (docs/21 §7)
- Overlay contract — layers, motion, dismissal. (docs/21 §1)
