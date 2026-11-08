---
paths:
  - "**/*{TagInput,tagInput,tag-input,TagsInput,tagsInput,tags-input,ChipInput,chipInput,chip-input}*.{tsx,jsx,ts,js,vue,svelte,css,scss,html}"
---
<!-- managed by __CommonShared/rules/elements/el-tag-input.md; sha256:a84a5f8cab411c28; edit it there, put project rules in project-*.md -->
# Tag input rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Look
- The wrapper is styled as a text field and wraps to new rows; ring on `:focus-within`. (docs/17 §8, docs/20 Tag input)
- Tags as chips: `--accent-soft` or `--hover` fill, 11px text, each with a remove icon button. (docs/19 §5, docs/20 Tag input)
- The inner input takes the remaining width; the wrapper grows in height, never width. (docs/19 §6)

## Behaviour
- Enter or comma adds the trimmed text; Backspace in an empty input removes the last tag. (docs/20 Tag input)
- Refuse duplicates with a short reason; invalid text stays in the input with the error below. (docs/20 Tag input, docs/19 §4)
- Paste splits on commas and new lines. (docs/20 Tag input)
- Remove buttons are named "Remove <tag>". (docs/20 Tag input)
- Announce adds and removals in a polite live region; tags render as a list. (docs/02 §5, docs/20 Tag input)
- Tags keep their place in every state. (docs/17 §4)

## Uses
- Chip — the tag look. (docs/20 Tag input)
- Search box — optional suggestions under the input. (docs/20 Search box)
