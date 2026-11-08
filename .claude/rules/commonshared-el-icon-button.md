---
paths:
  - "**/*{IconButton,iconButton,icon-button,IconBtn}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-icon-button.md; sha256:138792a583f2bc11; edit it there, put project rules in project-*.md -->
# Icon button rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Square, width = height, ghost by default; one size per bar (28, 32 or 36). (docs/17 §2, docs/20 Icon button)
- Clickable box ≥ 28px; draw a smaller visible shape with `::before{inset:4px;z-index:-1}`. (docs/17 §2)
- Icon 16px in controls, 20px in rails, `currentColor`, `aria-hidden`, from the one project set. (docs/01 §10, docs/19 §4)
- Toggle state: `aria-pressed="true"` with `--accent-soft` fill. (docs/01 §5)
- Coarse pointer: 44px through an invisible hit area, visible size unchanged. (docs/10 §4, docs/17 §2)

## Behaviour
- `aria-label` names the action (with row context when generated); `title` is not a name. (docs/17 §8, docs/01 §6)
- Tooltip shows the name and shortcut: 500–800ms first hover, 0 on focus, instant on neighbours. (docs/19 §7)
- Loading swaps the icon for a same-size spinner; the box does not change. (docs/20 Icon button)
- Disabled may add `pointer-events:none` only when nothing must be explained; else `aria-disabled`. (docs/01 §5, docs/19 §7)
- A short help note sits behind an info button, its sentence in `aria-label` and tooltip. (docs/17 §4)

## Uses
- Tooltip — the visible name of an icon-only control. (docs/01 §6)
- Icon — SVG from the set, never emoji or glyph arrows. (docs/17 §1)
- Spinner — loading in place of the icon. (docs/20 Icon button)
