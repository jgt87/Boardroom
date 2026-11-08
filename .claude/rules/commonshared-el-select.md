---
paths:
  - "**/*{Select,select,Dropdown,dropdown,Listbox,listbox,ListBox}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-select.md; sha256:d33dc4ea2b468492; edit it there, put project rules in project-*.md -->
# Select rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Native `<select>` by default, styled like a text field: same height, edge, radius, padding. (docs/01 §6)
- Chevron via `appearance:none` + an SVG from the icon set, `--muted`. (docs/01 §6)
- Each theme sets `color-scheme` and styles `option` so the native list follows dark mode. (docs/17 §7)
- Width hugs the options but `max-width:100%; min-width:0`. (docs/17 §3)
- Custom list: `--raised`, 1px `--border`, `--shadow-menu`, rows 32–36px, a check on the selected row. (docs/01 §6, docs/20 Select)
- Value 13–14px app, 16px on coarse pointers and in brand register. (docs/19 §5)

## Behaviour
- A custom listbox only when native cannot do it (rich rows); typing to filter is a combobox. (docs/20 Select)
- Custom: Enter/Space/Alt+Down open; arrows, Home/End, type-ahead; Enter picks; Esc closes to the trigger. (docs/20 Select)
- Close on outside pointerdown, Tab, scroll and wheel. (docs/01 §6, docs/02 §3)
- Clamp to the viewport with 4px margin, flip, max height = measured space with a floor. (docs/17 §5, §6)
- Inside scroll containers portal to `body` with fixed coordinates. (docs/17 §5)
- Custom ARIA: trigger `aria-haspopup="listbox"` + `aria-expanded`; options `role="option"` + `aria-selected`. (docs/20 Select)
- For 2–3 options use a segmented control or radios instead. (docs/01 §6)

## Uses
- Popover — the shared floating surface and its dismissal rules. (docs/17 §6)
- Text field — the closed look and error handling. (docs/20 Text field)
