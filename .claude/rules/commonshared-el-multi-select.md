---
paths:
  - "**/*{MultiSelect,multiSelect,multi-select,Multiselect,multiselect}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-multi-select.md; sha256:f39546dd71a5c464; edit it there, put project rules in project-*.md -->
# Multi-select rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- The trigger shows a summary: "Status: All", "Status: 2 selected", or names when one or two fit. (docs/20 Multi-select)
- The trigger takes `--accent-soft` (active) whenever the selection is not "all". (docs/20 Multi-select)
- Popover on `--raised` with `--shadow-menu`; checkbox rows 32–36px, 13–14px. (docs/01 §6, docs/19 §5)
- Long lists get an inner search plus "Select all" and "Clear". (docs/20 Multi-select)

## Behaviour
- Nothing selected means all, and the label says so. (docs/20 Multi-select)
- Opening focuses the search or first row; Space toggles; Esc closes to the trigger. (docs/20 Multi-select)
- Closes on outside pointerdown; one popover open at a time. (docs/01 §6, docs/20 Multi-select)
- Rows keep their order while open; selected rows never jump. (docs/20 Multi-select)
- Filters apply immediately; expensive queries may use an Apply button. (docs/20 Multi-select)
- ARIA: trigger `aria-haspopup` + `aria-expanded`; list `aria-multiselectable` or a checkbox group. (docs/20 Multi-select)

## Uses
- Checkbox — each row. (docs/20 Checkbox)
- Search box — the inner filter. (docs/20 Search box)
- Popover — floating surface, clamping and dismissal. (docs/17 §5, §6)
