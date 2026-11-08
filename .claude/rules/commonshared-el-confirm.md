---
paths:
  - "**/*{Confirm,confirm,AlertDialog,alertDialog,alert-dialog}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-confirm.md; sha256:d6553584523736d2; edit it there, put project rules in project-*.md -->
# Confirm rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A small dialog, ~420px: the question with its object as title ("Delete 3 layers?"), one or two lines of consequence. (docs/21 §6)
- Title 16–18px/600, body 13–14px, buttons 13–14px. (docs/19 §5, docs/21 §6)
- Cancel is secondary; the confirm button repeats the verb from the title, never "OK" or "Yes". (docs/19 §4, docs/21 §6)
- Solid danger fill only on this final confirm button; the trigger in the page stays a soft danger tint. (docs/01 §5, docs/03 §3)
## Behaviour
- Prefer undo through the command layer, with an Undo toast; confirm only what cannot be undone. (docs/02 §5, docs/03 §3)
- One API returning a promise of true or false; Esc and Cancel resolve false. (docs/21 §6)
- Queue requests: a second confirm waits until the first resolves. (docs/17 §6, docs/21 §6)
- Focus Cancel when the action is irreversible, the confirm button otherwise. (docs/21 §6)
- No backdrop dismissal. (docs/21 §6)
- Busy: the confirm button shows a spinner, both buttons lock; on failure the message shows in the body and the dialog stays. (docs/21 §6)
- Never `window.confirm()`: use the app's own themed, queued alert dialog. (docs/21 §6)
- A hold-to-confirm button is an alternative: pointer and Space/Enter, abort on release, leave, cancel, blur and keyup. (docs/21 §6)
## Accessibility
- `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` the title, `aria-describedby` the body. (docs/21 §6)
- Focus trapped while open and returned to the opener on close. (docs/17 §6)
## Uses
- Dialog — structure, trap, focus return. (docs/21 §5)
- Button and Spinner — the secondary and danger actions and the busy state. (docs/21 §6, §10)
