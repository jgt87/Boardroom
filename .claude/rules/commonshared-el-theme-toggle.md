---
paths:
  - "**/*{ThemeToggle,ThemeSwitch,ThemePicker,themeToggle,theme-toggle,theme-switch}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-theme-toggle.md; sha256:22b3e3fa70c41e1f; edit it there, put project rules in project-*.md -->
# Theme toggle rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A square icon button in the header; the icon shows the target theme. (docs/22 Theme toggle)
- `aria-label` and tooltip name the action ("Switch to dark theme"); no `aria-pressed`. (docs/22 Theme toggle)
- Settings offer a System / Light / Dark segmented control as a radio group. (docs/22 Theme toggle)
- Coarse pointers reach 44px by padding. (docs/17 §2)

## Behaviour
- The first value comes from `prefers-color-scheme`; a manual choice persists. (docs/01 §2)
- Apply before first paint with an inline `<head>` script setting `data-theme` on `<html>`. (docs/22 Theme toggle)
- Wrap every storage read and write in `try/catch` and fall back to the OS value. (docs/22 Theme toggle)
- On "System", listen to `prefers-color-scheme` changes. (docs/22 Theme toggle)
- Each theme sets `color-scheme` and styles `option`. (docs/17 §7)
- Dispatch one theme-change event; canvases and charts re-read their tokens on it. (docs/01 §2, docs/17 §7)
- Suppress transitions for the frame of the switch so all surfaces change together. (docs/22 Theme toggle)

## Uses
- Button (icon variant), Icon, Tooltip — the quick toggle. (docs/22 Theme toggle)
- Segmented control — the three-way setting. (docs/22 Theme toggle)
