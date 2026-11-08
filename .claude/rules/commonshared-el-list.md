---
paths:
  - "**/*{List,ListRow,ListItem,Row}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
  - "**/{list,list-row,list-item,row}.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-list.md; sha256:1c91ab932e2e7193; edit it there, put project rules in project-*.md -->
# List rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Every row shares one grid template with fixed tracks; optional content leaves its track empty. (docs/19 §6)
- One-line rows 32–36px, two-line 48–56px, ≥ 44px on coarse pointers. (docs/22 List)
- Title 13–14px `--ink`, subtitle 12px `--muted` 4–6px below; text ≥ 12px from the row edge. (docs/19 §5, §6)
- The title keeps its width; the description truncates with the full text in `title`. (docs/17 §3)
- Hover `--hover` and selection `--accent-soft` are inset and rounded; negative margins go on the list. (docs/19 §6)
- Rows sit in one container, not a card each; dividers only mark groups. (docs/19 §4)
- Meta goes in separate tracks, never joined with middle dots. (docs/19 §4)

## Behaviour
- The whole row is one button or link; secondary actions are separate and visible on focus and touch. (docs/22 List, docs/02 §7)
- Selectable lists use arrows, Space/Enter, Home/End and type-ahead; Shift/Ctrl extend and add. (docs/02 §2)
- Reorder by drag keeps the grab offset and opens slots in place, with an Alt+Up/Down path. (docs/19 §7, docs/22 List)
- Long lists scroll inside themselves and virtualise past a few hundred rows. (docs/17 §3)
- Live lists follow new items only while the user is within 80px of the bottom. (docs/17 §10a)
- Every list has empty, loading (skeleton rows) and error states. (docs/01 §6)
- `ul`/`li`, or `listbox`/`option` with `aria-selected`; `aria-current` for navigation. (docs/22 List)

## Uses
- Avatar, Icon — the leading slot. (docs/22 List)
- Badge, Checkbox, Menu — trailing state, selection and row actions. (docs/22 List)
- Skeleton, Empty state, Scrollbar — the states and the inner scroll. (docs/22 List)
