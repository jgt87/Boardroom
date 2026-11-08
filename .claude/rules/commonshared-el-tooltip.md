---
paths:
  - "**/*{Tooltip,tooltip,Toggletip,toggletip}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-tooltip.md; sha256:80e2f7cd5ce3a412; edit it there, put project rules in project-*.md -->
# Tooltip rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Short one-line label, max ~240px, inverted bubble (`--ink` fill, `--bg` text) or `--raised` + `--border` per DESIGN.md. (docs/01 §6, docs/21 §2)
- Padding 6–8 × 8–10px, radius `--radius-sm`, layer `--z-tooltip`, `pointer-events: none`. (docs/01 §6, docs/21 §2)
- Text 12px app, 13–14px brand; a shortcut shows as a `kbd` badge ≥ 11px. (docs/19 §5, docs/21 §2)
## Behaviour
- First hover waits 500–800ms, keyboard focus 0ms; once one is open, neighbours open instantly with no animation. (docs/19 §7)
- Hover only under `(hover: hover) and (pointer: fine)`; hide on leave, blur, Esc, pointerdown, scroll and wheel. (docs/19 §7, docs/21 §2)
- Above the trigger with a 6–8px gap, flip near the edge, clamp to the viewport; re-measure the anchor on every open. (docs/17 §5, docs/21 §2)
- Fade in ≤ 120ms with opacity only; warm neighbours appear without a fade. (docs/19 §7, docs/21 §2)
- Touch: no hover tooltips; a hint the user needs becomes a toggletip button that opens a popover on tap. (docs/21 §2, §15)
- Never put links, buttons or must-read information in a tooltip; use a popover or inline text. (docs/21 §2)
## Accessibility
- `role="tooltip"` with an id, linked from the trigger by `aria-describedby`. (docs/03 §3, docs/01 §6)
- Never the only name of an icon button: that is `aria-label`; native `title` only for secondary hints. (docs/17 §8)
- A focusable `aria-disabled` trigger keeps its tooltip to say why it is unavailable. (docs/19 §7, docs/21 §2)
## Uses
- Kbd — shows the shortcut that the control also has. (docs/02 §5)
- Overlay contract — layer band, clamp and flip, reduced motion. (docs/21 §1)
