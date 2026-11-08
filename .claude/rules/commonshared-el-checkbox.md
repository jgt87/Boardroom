---
paths:
  - "**/*{Checkbox,checkbox,CheckBox}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-checkbox.md; sha256:0991105fbbdbf7e2; edit it there, put project rules in project-*.md -->
# Checkbox rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Native checkbox with `accent-color: var(--accent)`, 14–16px. (docs/01 §6)
- Label right, 8px gap, centred on the box, never `items-end`. (docs/17 §1)
- Label 13–14px app, 16px brand. (docs/19 §5)
- Groups in `<fieldset>` with a `<legend>`; list rows give the box its own grid track. (docs/19 §6, docs/20 Checkbox)

## Behaviour
- The whole row is clickable and is the 44px target on coarse pointers. (docs/01 §6, docs/17 §2)
- For values submitted with a form; a setting that applies at once is a switch. (docs/01 §6)
- Indeterminate for a partial "select all"; custom ones use `aria-checked="mixed"`. (docs/20 Checkbox)
- Group errors sit under the fieldset, linked by `aria-describedby`. (docs/19 §7)
- Row selection in tables shows an "N selected" bulk bar. (docs/20 Checkbox)

## Uses
- Label — the clickable name. (docs/19 §7)
- Multi-select — the popover version for long lists. (docs/20 Multi-select)
