---
paths:
  - "**/*{Avatar,avatar}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-avatar.md; sha256:a39b6b93242a1f20; edit it there, put project rules in project-*.md -->
# Avatar rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- Circle for people; rounded square for organisations if DESIGN.md makes the distinction. (docs/22 Avatar)
- Sizes 16, 20, 24, 32, 40px (48–64 on profiles) as fixed size classes with `flex-shrink:0`. (docs/22 Avatar, docs/17 §2)
- An image inside a ring = outer − 2×border − 2×padding. (docs/17 §1)
- Images use `object-fit: cover`; fallback initials in `--ink` on `--accent-soft` or `--hover`. (docs/22 Avatar)
- Per-person tints come from the domain token group, never chrome tokens or literals. (docs/01 §2)
- Initials are a glyph; 10px only at 20px avatars, marked `type-scale`. (docs/19 §5)
- Status dots sit inside the content edge with a `--surface` border. (docs/19 §6)
- Stacks overlap by a quarter with a `--surface` ring and end in "+n" after 3–5. (docs/22 Avatar)

## Behaviour
- `width`/`height` set, lazy below the first screen, `srcset` ≤ 2× the shown size. (docs/19 §8)
- A failed image falls back to initials once, with no layout shift. (docs/22 Avatar)
- `alt` = the name when alone, `alt=""` beside the name; presence also in text. (docs/22 Avatar, docs/01 §1)
- An avatar that opens a menu is a button named "Account menu for <name>". (docs/22 Avatar, docs/17 §8)

## Uses
- Icon — the person fallback when there is no name. (docs/22 Avatar)
- Tooltip — names in stacks and behind "+n". (docs/22 Avatar)
- Menu — the account menu. (docs/22 Avatar)
