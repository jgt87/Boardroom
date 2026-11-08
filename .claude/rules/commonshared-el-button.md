---
paths:
  - "**/*{Button,button}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-button.md; sha256:3e5b4b67379722d1; edit it there, put project rules in project-*.md -->
# Button rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Native `<button>`; `--surface` fill, 1px `--border-strong` edge, radius `--radius`, padding 0 12px, height `--control-h`. (docs/20 Button, docs/01 §5)
- Label 13–14px app, 16px brand; weight 500, primary 600; sentence case, one verb. (docs/19 §5, docs/20 Button)
- Variants: primary (`--accent` + `--on-accent`), secondary, ghost, danger (`--danger-soft`), link. (docs/01 §5)
- Solid danger fill only on the final confirm of an irreversible action. (docs/01 §5)
- One primary per view, on the forward path; Save stays secondary, disabled until a change. (docs/01 §5, §6)
- Icons 16px from the project set, 8px gap, in their own `inline-flex` box. (docs/01 §5, docs/17 §1)
- Heights 28/32/36 from tokens, one height per bar; coarse pointer 44px via an invisible hit area. (docs/17 §2, docs/10 §4)

## Behaviour
- Hover is a tint of its own token under `(hover: hover)`; never scale, never a grey swap. (docs/19 §4, §7)
- Active `translateY(1px)` or `scale(.98)`; focus is the global 2px `--ring`. (docs/01 §5, docs/17 §8)
- Loading: spinner already turning, label changes inside the button, width kept, `aria-busy`, double press ignored. (docs/19 §7, docs/02 §7)
- Success reuses the verb ("Publish" → "Published"); failure shows near the control or in an error toast. (docs/19 §4)
- `type="button"` unless it submits; `touch-action: manipulation`; pointer cursor on web. (docs/20 Button, docs/02 §6)
- Toggle buttons use `aria-pressed` with `--accent-soft`; links that navigate are `<a href>`. (docs/01 §5, docs/17 §8)
- Disabled: opacity .4–.5, `not-allowed`; focusable `aria-disabled` when it must explain. (docs/19 §7)

## Uses
- Spinner — busy state inside the button. (docs/01 §5)
- Tooltip — shortcut `kbd` and longer hint, never the label. (docs/02 §5)
- Icon — one set, one size per view. (docs/19 §4)
