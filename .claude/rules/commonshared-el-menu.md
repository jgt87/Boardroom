---
paths:
  - "**/*{Menu,menu,Dropdown,dropdown}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-menu.md; sha256:e51c1c6cd096fb60; edit it there, put project rules in project-*.md -->
# Menu rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- One shared menu component: `--raised`, 1px `--border`, `--shadow-menu`, radius 6–12px, layer `--z-dropdown`. (docs/01 §6, docs/21 §4)
- Min width ~240px; rows 32–36px, 13–14px text, icon column ~36px; coarse pointer rows reach 44px. (docs/01 §4, §6, docs/19 §5)
- Hover and focus fills `--hover`, inset and rounded; group labels 11–12px `--muted`, sentence case. (docs/19 §6, docs/21 §4)
- Shortcuts right-aligned in `--muted` with `tabular-nums`; destructive rows last, after a separator, `--danger` text. (docs/01 §6, docs/21 §4)
- Disabled rows opacity .4–.5 and skipped by arrows; only the open submenu's parent row shows as active. (docs/17 §6, docs/19 §7)
## Behaviour
- Enter, Space or ArrowDown on the trigger opens and focuses the first row; ArrowUp focuses the last. (docs/21 §4)
- Up/Down wrap, Home/End jump, Right opens a submenu, Left or Esc closes it, Enter/Space activate. (docs/21 §4)
- Close on activation, outside pointerdown, Esc (focus to trigger), Tab, scroll, resize and wheel. (docs/01 §6, docs/02 §3)
- Clamp with 4px margin and flip; submenus right of the row, else left; test at 200% zoom near all four edges. (docs/17 §5)
- Max height = measured distance to the visible bottom, with a floor; scroll inside with `overscroll-behavior: contain`. (docs/17 §6)
- Keyboard-opened menus appear without animation; pointer-opened ones fade ≤ 150ms from the trigger. (docs/19 §7)
- Pointer cursor on rows on the web; native desktop apps keep the arrow. (docs/19 §7, docs/21 §15)
- Context menus open on right click, 500ms long press and Shift+F10 or the ContextMenu key. (docs/02 §2, §4)
- A context menu is never the only path: mirror it in a visible `⋯` menu or toolbar. (docs/02 §4, docs/03 §3)
- Suppress the browser context menu only on surfaces that supply their own. (docs/01 §6)
## Accessibility
- Trigger `aria-haspopup="menu"` + `aria-expanded`; panel `role="menu"`; rows `menuitem`, `menuitemcheckbox` or `menuitemradio`. (docs/21 §4)
- Roving tabindex or `aria-activedescendant`; generated rows carry names with row context. (docs/01 §6, docs/21 §4)
## Uses
- Kbd, Icon, Separator — row parts. (docs/21 §4)
- Confirm — for a destructive row that cannot be undone. (docs/21 §6)
- Overlay contract — layers, placement, dismissal. (docs/21 §1)
