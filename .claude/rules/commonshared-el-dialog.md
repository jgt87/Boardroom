---
paths:
  - "**/*{Dialog,dialog,Modal,modal}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-dialog.md; sha256:8657ea3f570f2c24; edit it there, put project rules in project-*.md -->
# Dialog rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Panel `--raised`, 1px `--border`, `--shadow-dialog`, radius `--radius-lg`, layer `--z-modal`; one shared `--backdrop`. (docs/01 §6, docs/17 §10a)
- Width `min(680px, 100vw - 32px)`; centred horizontally, top-anchored at ~12vh, `max-height: 72vh`. (docs/01 §6, docs/21 §15)
- Title 18–20px/600 in a fixed header with the close button; body 13–14px, 16px padding; footer actions right, primary last. (docs/19 §5, docs/21 §5)
- One scroll area: the body; the header and footer stay put; height stays the same across tabs. (docs/17 §6)
## Behaviour
- Native `<dialog>` with `showModal()`; on Electron an overlay modal instead. (docs/17 §6)
- Esc closes (a nested popover or menu first), Tab is trapped, focus returns to the opener. (docs/17 §6)
- Initial focus on the first field; a read-only dialog focuses its close button or primary action. (docs/21 §5)
- A backdrop click closes only a dialog with nothing to lose; never one with unsaved input. (docs/21 §5)
- Never stack two dialogs that ask the same question; queue the second. (docs/17 §6)
- Stop wheel propagation only when the body can scroll. (docs/17 §6)
- Enter ≤ 200ms with opacity + `scale(0.95)` from its centre, never from the trigger; exit faster; stay mounted until it ends. (docs/19 §7)
- Busy submit: the button shows a spinner and keeps its width; Esc waits until it settles. (docs/19 §7, docs/21 §5)
- React: keep `onClose` and other callbacks in a ref so the focus effect doesn't rerun and steal focus. (docs/17 §6)
## Accessibility
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` the title, `aria-describedby` a short description. (docs/17 §6)
- The page behind is inert; the close button has `aria-label="Close"`. (docs/21 §5)
## Uses
- Button, IconButton, form fields, Tabs — the body and footer. (docs/21 §5)
- Spinner and error banner — busy and failed submits inside the dialog. (docs/21 §10, §13)
- Overlay contract — layers, motion, dismissal. (docs/21 §1)
