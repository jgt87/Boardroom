---
paths:
  - "**/*{Scrollbar,ScrollArea,ScrollView,scrollbar,scroll-area}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-scrollbar.md; sha256:88bf0c24022c4614; edit it there, put project rules in project-*.md -->
# Scrollbar rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Thin 8px scrollbars, transparent track, pill thumb in `--scroll-thumb`, `--scroll-thumb-hover` on hover. (docs/01 §8)
- Set `color-scheme` per theme so native scrollbars follow when not customised. (docs/17 §7)
- `scrollbar-gutter: stable` on every panel that can start scrolling. (docs/17 §4)
- Hover-only thumbs only on secondary lists; primary content keeps a visible thumb. (docs/01 §8)
- Horizontal strips use scroll-snap and let the next item show partly. (docs/22 Scrollbar)

## Behaviour
- Native scrolling, styled; no JavaScript fake scroller unless the platform leaves no choice. (docs/22 Scrollbar)
- One scroll container per region; in a panel only the main region scrolls. (docs/17 §10a)
- `overscroll-behavior: contain` in menus, dialogs and side panels. (docs/22 Scrollbar)
- Stop wheel propagation only when the pane can scroll. (docs/17 §6)
- Follow live content only within 80px of the bottom; stop when the user scrolls up. (docs/17 §10a)
- Gate script smooth scrolling on `prefers-reduced-motion`. (docs/01 §9)
- Width `100%`, never `100vw`; a dropdown's max height comes from the measured space, with a floor. (docs/17 §9, §6)
- A scroll region with no focusable content gets `tabindex="0"`, `role="region"` and a label. (docs/22 Scrollbar)

## Uses
- `--scroll-thumb`, `--scroll-thumb-hover`, `--radius-pill` — the thumb. (docs/01 §8)
