---
paths:
  - "**/*{AppShell,Layout,Sidebar,Toolbar,Header,TopBar,Topbar,StatusBar,NavBar,Navbar,SkipLink}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
  - "**/{app-shell,layout,sidebar,toolbar,header,topbar,navbar,status-bar,skip-link}.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-app-shell.md; sha256:1126e1884ac39c28; edit it there, put project rules in project-*.md -->
# App shell rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- The first focusable element is a "Skip to content" link to `#main`, hidden until focused. (docs/22 App shell)
- Header 34–40px dense or 54–64px app; its height is one `--topbar` variable. (docs/01 §4, docs/17 §5)
- Sidebar 240–280px, rail 40–52px with 20px icons, inspector 285–360px; split by `--border`. (docs/01 §4)
- Toolbar buttons share one height, checked by a test at desktop and phone width. (docs/17 §2)
- Current nav item `--accent-soft` + `--ink` with `aria-current="page"`; nav text 13–14px, never wraps. (docs/22 App shell, docs/19 §5)
- Status bar 24–28px, 13px `--muted`, `role="status"`. (docs/22 App shell)
- Shell `100dvh`, width `100%`; only `main` scrolls. (docs/17 §9, §10a)

## Behaviour
- Below about 768px the sidebar becomes a drawer (≤ 300ms) or a bottom bar; bars wrap. (docs/22 App shell, docs/19 §7)
- Primary controls never hide below a breakpoint. (docs/17 §9)
- On route change focus moves to the view heading or `main`, and the title updates. (docs/22 App shell)
- Toolbars are `role="toolbar"` with one tab stop and arrow keys; overflow goes into "More". (docs/22 App shell)
- Splitters: `col-resize`/`row-resize`, a ≥ 6px bar with a bigger hit area, arrow keys, clamped and persisted. (docs/02 §1, docs/17 §2)
- Floating chrome publishes its measured size as a CSS variable. (docs/17 §5)
- z-index from named bands: sticky, dropdown, popover, modal, toast, tooltip. (docs/17 §5)
- Landmarks `header`, labelled `nav`, `main` with `tabindex="-1"`, `aside`; a `.sr-only` utility. (docs/22 App shell)
- PWAs pad with `env(safe-area-inset-*)`. (docs/17 §9)

## Uses
- Tabs, Tree, List — views and navigation. (docs/22 App shell)
- Button, Menu, Tooltip, Icon — toolbar and rail. (docs/22 App shell)
- Theme toggle, Avatar — header controls. (docs/22 App shell)
- Dialog / Drawer, Toast, Scrollbar — overlays and scroll regions. (docs/22 App shell)
