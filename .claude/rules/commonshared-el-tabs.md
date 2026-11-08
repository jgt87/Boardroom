---
paths:
  - "**/*{Tabs,TabList,TabBar,tabs,tab-list,tab-bar}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-tabs.md; sha256:7f233cb47d6ac6bb; edit it there, put project rules in project-*.md -->
# Tabs rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Tabs switch peer views of one surface; steps use a stepper, value choices a segmented control, routes nav links. (docs/22 Tabs)
- Underline variant by default: label `--muted`, selected `--ink` with a 2px `--accent` indicator. (docs/22 Tabs)
- Tab height `--control-h` (28px dense); coarse pointers reach 44px by padding, not a taller tab. (docs/22 Tabs, docs/17 §2)
- Labels 13–14px, sentence case, never wrap; brand register 15px. (docs/19 §5, §10)
- Hover fill `--hover`, inset and rounded, only under hover media, never over the selected tab. (docs/19 §6, §7)
- Bold selected labels reserve their width so neighbours do not shift. (docs/22 Tabs, docs/17 §4)
- Icon + label tab groups take the widest group's width so the icons form one column. (docs/17 §1)

## Behaviour
- Roving tabindex: Tab enters on the selected tab, arrows move, Home/End jump, Tab again enters the panel. (docs/22 Tabs)
- Activate on arrow when panels are cheap; on Enter/Space when a panel loads data. (docs/22 Tabs)
- The indicator moves by `transform`, is placed at duration 0 first, then slides 150ms. (docs/17 §4, docs/19 §7)
- Tabbed panels in a dialog share one fixed height and scroll inside. (docs/17 §2)
- When tabs overflow, the list scrolls sideways and the selected tab scrolls into view; never two rows. (docs/17 §9)
- `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`; hidden panels use `hidden`. (docs/22 Tabs, docs/17 §7)

## Uses
- Badge — counts and error counts inside a tab, 6px clear of the label. (docs/22 Tabs)
- Icon, Scrollbar — the optional leading icon and the sideways strip on overflow. (docs/22 Tabs)
