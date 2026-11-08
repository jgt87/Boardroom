---
paths:
  - "**/*.{css,scss,html,tsx,jsx,vue,svelte,astro}"
---
<!-- managed by __CommonShared/rules/elements.md; sha256:9ef15b92e523a909; edit it there, put project rules in project-*.md -->
# UI element index

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Before using an element
- Using one of these (even inside another file)? Read its `.claude/rules/commonshared-el-<slug>.md` first. (docs/19 §3)
- Build from the project's component for it, never a lookalike; elements listed under Uses come along. (docs/19 §3)

## Elements
- App shell: `el-app-shell`; uses Tabs, Tree, List, Button, Menu, Tooltip. (docs/22)
- Avatar: `el-avatar`; uses Icon, Tooltip, Menu. (docs/22)
- Badge: `el-badge`; uses Icon, IconButton, Tooltip. (docs/21)
- Board: `el-board`; uses Card, Badge, Menu, Toast, Tabs. (docs/22)
- Button: `el-button`; uses Spinner, Tooltip, Icon. (docs/20)
- Calendar: `el-calendar`; uses Button, Popover, Badge, Tooltip, List. (docs/22)
- Card: `el-card`; uses Badge, Button, Menu, Avatar, Icon, Chart. (docs/22)
- Chart: `el-chart`; uses Tooltip, Table, Button, Skeleton, Empty state. (docs/22)
- Checkbox: `el-checkbox`; uses Label, Multi-select. (docs/20)
- Command palette: `el-command-palette`; uses Dialog, Input, Kbd, Icon, Empty state, Spinner. (docs/21)
- Confirm: `el-confirm`; uses Dialog, Button, Spinner. (docs/21)
- Date range: `el-date-range`; uses Popover, Text field, Segmented control. (docs/20)
- Dialog: `el-dialog`; uses Button, IconButton, form fields, Tabs, Spinner, error banner. (docs/21)
- Drawer: `el-drawer`; uses Dialog, IconButton, Overlay contract. (docs/21)
- Drop zone: `el-drop-zone`; uses Button, Icon button, Toast. (docs/20)
- Empty state: `el-empty-state`; uses Icon, Button, Command palette, Menu. (docs/21)
- Error state: `el-error-state`; uses Icon, Button, Spinner, Toast. (docs/21)
- Hold button: `el-hold-button`; uses Button, Spinner. (docs/20)
- Icon button: `el-icon-button`; uses Tooltip, Icon, Spinner. (docs/20)
- Icon: `el-icon`; uses `currentColor`, `--icon`, Tooltip. (docs/22)
- List: `el-list`; uses Avatar, Icon, Badge, Checkbox, Menu, Skeleton. (docs/22)
- Menu: `el-menu`; uses Kbd, Icon, Separator, Confirm, Overlay contract. (docs/21)
- Multi-select: `el-multi-select`; uses Checkbox, Search box, Popover. (docs/20)
- Popover: `el-popover`; uses Button, IconButton, Spinner, Overlay contract. (docs/21)
- Print: `el-print`; uses Table, Chart, Card. (docs/22)
- Progress: `el-progress`; uses Button, Error state, Toast. (docs/21)
- Radio: `el-radio`; uses Label, Segmented control. (docs/20)
- Scrollbar: `el-scrollbar`; uses `--scroll-thumb`, `--scroll-thumb-hover`, `--radius-pill`. (docs/22)
- Search box: `el-search-box`; uses Text field, Popover, Icon button. (docs/20)
- Segmented control: `el-segmented`; uses Button, Select. (docs/20)
- Select: `el-select`; uses Popover, Text field. (docs/20)
- Slider: `el-slider`; uses Icon button, Text field. (docs/20)
- Spinner and skeleton: `el-spinner`; uses Icon, `.motion-alt`, Empty state, error state. (docs/21)
- Switch: `el-switch`; uses Spinner, Toast. (docs/20)
- Table: `el-table`; uses Checkbox, Button, Menu, Pagination, Skeleton, Empty state. (docs/22)
- Tabs: `el-tabs`; uses Badge, Icon, Scrollbar. (docs/22)
- Tag input: `el-tag-input`; uses Chip, Search box. (docs/20)
- Text field: `el-text-field`; uses Icon button, Spinner. (docs/20)
- Theme toggle: `el-theme-toggle`; uses Button, Segmented control. (docs/22)
- Toast: `el-toast`; uses Icon, Button, IconButton, Error state. (docs/21)
- Tooltip: `el-tooltip`; uses Kbd, Overlay contract. (docs/21)
- Tree: `el-tree`; uses Icon, Spinner, Context menu with a visible `⋯` mirror, Tooltip. (docs/22)
