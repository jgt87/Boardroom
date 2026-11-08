---
paths:
  - "**/*{Segmented,segmented,ButtonGroup,buttonGroup,button-group}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-segmented.md; sha256:153c6ee5902241d8; edit it there, put project rules in project-*.md -->
# Segmented control rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- For 2–4 short exclusive options; 5+ or long labels use a select. (docs/01 §6)
- Track `--hover` or `--surface` with 1px `--border`, 2px inner padding, height `--control-h`. (docs/20 Segmented control)
- Segment radius = track radius − padding; labels 13–14px, never wrap. (docs/19 §5, §6)
- Selected: `--raised` or `--accent-soft` fill plus heavier weight, never colour alone. (docs/01 §1)
- Icon-only segments are square with `aria-label`; coarse pointer hit areas 44px. (docs/17 §2, §8)

## Behaviour
- The indicator moves by `transform` at 150ms; its first placement does not animate. (docs/17 §4, docs/19 §7)
- Hover tints unselected segments only. (docs/01 §7)
- Keyboard: one tab stop, arrows move and select, Home/End to the ends. (docs/20 Segmented control)
- `role="radiogroup"` with a name, segments `role="radio"` + `aria-checked`, roving tabindex. (docs/20 Segmented control)
- In a toolbar, buttons with `aria-pressed` are acceptable instead. (docs/01 §5)

## Uses
- Button — each segment shares its states. (docs/20 Button)
- Select — the replacement when options outgrow four. (docs/01 §6)
