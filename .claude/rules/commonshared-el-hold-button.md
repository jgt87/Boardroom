---
paths:
  - "**/*{HoldButton,holdButton,hold-button,HoldToConfirm,holdToConfirm}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-hold-button.md; sha256:b22f097447cc84b1; edit it there, put project rules in project-*.md -->
# Hold button rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- A button (danger or secondary) whose label names the gesture ("Hold to delete"). (docs/20 Hold button)
- Progress fill under the label grows with `transform: scaleX()` from the start edge, never width. (docs/19 §7)
- Fill uses `--danger-soft` or `--accent-soft`; one CSS duration variable drives CSS and script. (docs/20 Hold button)

## Behaviour
- Start on primary-button `pointerdown` and on Space/Enter `keydown`, ignoring key repeat. (docs/20 Hold button, docs/02 §2)
- Abort on `pointerup`, `pointerleave`, `pointercancel`, `blur` and `keyup` before the end. (docs/02 §2, docs/20 Hold button)
- Completion fires once; the label confirms with the same verb ("Deleted"). (docs/19 §4)
- Use a transition so an abort retargets from where it is; release empties faster than it filled. (docs/19 §7)
- Duration about a second, set by the project, judged by eye. (docs/20 Hold button)
- Reduced motion keeps the progress fill (it carries meaning) and drops other movement. (docs/19 §7)
- Not for undoable actions: do it and offer Undo. (docs/02 §5)
- Describe the hold with `aria-describedby`; announce completion politely; offer an alternative path. (docs/20 Hold button)

## Uses
- Button — base look, sizes and states. (docs/20 Button)
- Spinner — when the confirmed action is async. (docs/01 §5)
