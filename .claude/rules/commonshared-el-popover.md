---
paths:
  - "**/*{Popover,popover,Popup,popup}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-popover.md; sha256:59e4c18ad506f73e; edit it there, put project rules in project-*.md -->
# Popover rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- `--raised` panel, 1px `--border`, `--shadow-menu`, radius 6–12px, layer `--z-popover`. (docs/01 §4, docs/21 §3)
- Padding 12px; text ≥ 12px from the edge; body 13px app, 14px brand; title 14px/600. (docs/19 §5, §6, docs/21 §3)
- Width from content, min ~200px, max `calc(100vw - 24px)`; one popover surface for every dropdown. (docs/17 §6, §9)
## Behaviour
- One popover open at a time; opening another closes the first. (docs/21 §3)
- Focus the first field on open, or the panel itself when it holds no field. (docs/21 §3)
- Close on Esc (focus back to its trigger), outside `pointerdown` with the portal counted as inside, and a second trigger press. (docs/17 §5, docs/21 §3)
- Clamp to the viewport with 4px margin and flip; max height = measured space left, with a floor. (docs/17 §5, §6)
- Inside a scroll container portal to `body` with fixed coordinates, re-anchored on resize and scroll. (docs/17 §5)
- Enter ≤ 200ms from `scale(0.95)` + opacity 0 at the trigger's `transform-origin`; sized before frame one; exit faster. (docs/19 §7)
- Content that loads late gets a spinner in reserved space, so the panel never resizes after it appears. (docs/19 §7, docs/21 §3)
- On phones a form popover may become a bottom sheet while its trigger stays in place. (docs/17 §9, docs/21 §3)
## Accessibility
- Trigger is a `button` with `aria-expanded` and `aria-controls`. (docs/21 §3)
- An interactive panel is a non-modal `role="dialog"` with a label: no `aria-modal`, no focus trap. (docs/21 §3)
## Uses
- Button, IconButton — footer actions and the close control. (docs/21 §3)
- Spinner — late content without a size change. (docs/21 §10)
- Overlay contract — layers, placement, motion, dismissal. (docs/21 §1)
