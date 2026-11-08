---
paths:
  - "**/*{Slider,slider,Range,range}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-slider.md; sha256:009d122951818ac5; edit it there, put project rules in project-*.md -->
# Slider rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Native `<input type="range">` with `accent-color: var(--accent)` by default. (docs/01 §6)
- Custom: track 4–6px `--border` with an `--accent` fill; thumb 14–18px with a 2px `--surface` border. (docs/01 §6)
- Value beside it: ~38px mono column, `tabular-nums`, right-aligned, `--muted`, with its unit. (docs/01 §6)
- Offer reset-to-default when the value is tunable. (docs/01 §6)
- Coarse pointer: 44px hit area round the thumb, visible thumb unchanged. (docs/17 §2)

## Behaviour
- Arrows step; Shift+arrow or PageUp/PageDown take large steps; Home/End go to the ends. (docs/20 Slider)
- Live preview on `input`; commit and one undo entry on `change`. (docs/20 Slider, docs/02 §5)
- Dragging follows the pointer with no transition. (docs/19 §7)
- The plain wheel scrolls the page, never changes the value. (docs/02 §3)
- Two-thumb ranges: thumbs cannot cross; each thumb is named ("Minimum price"). (docs/20 Slider)
- `aria-valuetext` with the unit; custom thumbs `role="slider"` with min/max/now. (docs/20 Slider)

## Uses
- Icon button — reset to default. (docs/01 §6)
- Text field — an optional exact typed value. (docs/20 Text field)
