---
paths:
  - "**/*{Card,-card,_card}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
  - "**/card*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-card.md; sha256:96e9d0a35e309150; edit it there, put project rules in project-*.md -->
# Card rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- One container level: no card inside a card. (docs/19 §4)
- Border or shadow, never both; flat with a 1px `--border` by default, shadow only when it floats. (docs/19 §4, docs/01 §1)
- `--surface` on `--bg`, radius `--radius-lg`, equal padding of 16px (12px compact). (docs/01 §4, docs/19 §6)
- Nested shapes: outer radius = inner radius + padding. (docs/19 §6)
- Full-bleed media pads the text rows and clips with `overflow:hidden` for the radius. (docs/17 §3)
- Title 14–16px / 600, body 13–14px, meta 12px `--muted`; brand body ≥ 16px. (docs/19 §5)
- A missing fact shows a dashed placeholder, never an invented value; no stat-card grids by reflex. (docs/19 §4)
- A status badge only when it needs attention. (docs/19 §4)

## Behaviour
- Interactive hover is a `--hover` tint or a `--border-strong` edge; never lift or scale. (docs/19 §4)
- A whole-card link stretches the title link with `::after`; inner buttons stay separate. (docs/22 Card)
- Never wrap a card that holds buttons in one `<a>`. (docs/22 Card)
- Grids use `auto-fill` + `minmax` and container queries; breakpoints follow the container. (docs/17 §2)
- Cards in a row share height and align their actions to the bottom. (docs/22 Card)
- Loading shows a skeleton at the final size; errors show inline with Retry. (docs/22 Card)
- `article` or `li` with a heading; the link name is the title. (docs/22 Card)

## Uses
- Badge, Button, Menu — status and actions, one primary at most. (docs/22 Card)
- Avatar, Icon, Chart — identity, glyphs and dashboard content. (docs/22 Card)
- Skeleton — loading at the final size. (docs/22 Card)
