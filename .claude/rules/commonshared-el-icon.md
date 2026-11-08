---
paths:
  - "**/*{Icon,Icons,icon,icons}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-icon.md; sha256:5eff6d0bbf85502f; edit it there, put project rules in project-*.md -->
# Icon rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- One icon set per project, chosen in DESIGN.md; one stroke weight; one size per view. (docs/19 §4, §10)
- Inline SVG in `currentColor`, so it takes `--ink`, `--muted` or `--icon` from its parent. (docs/22 Icon, docs/01 §2)
- 14–16px in controls, 20px in rails, 32–48px `--muted` in empty states. (docs/01 §4, §10)
- Sized by one shared class from the viewBox, never `width`/`height` attributes per use. (docs/17 §2)
- A fixed square box, flex-centred, `flex-shrink:0`; centred with text by `inline-flex`. (docs/17 §1)
- Arrows, chevrons and close marks are SVG, never text glyphs. (docs/17 §1)
- No emoji in chrome; no sparkle for AI features. (docs/19 §4)

## Behaviour
- Reference icons by name through one component; warn on unknown names; ship only those used. (docs/22 Icon)
- Directional icons mirror under `dir="rtl"`; disclosure rotates by `transform` in 120–150ms. (docs/22 Icon)
- Hover, focus and disabled are styled on the control, not on the icon. (docs/22 Icon)
- Status icons always come with a word. (docs/01 §1)
- Decorative: `aria-hidden="true"`; standalone: `role="img"` + `aria-label`, or a labelled button. (docs/22 Icon, docs/17 §8)
- Load the icon runtime wherever icons are used. (docs/17 §10a)

## Uses
- `currentColor`, `--icon` — colour from the parent, never a literal. (docs/22 Icon)
- Tooltip — every icon-only control names itself in one. (docs/22 Icon, docs/17 §8)
