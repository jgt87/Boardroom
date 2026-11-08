---
paths:
  - "**/*.{ts,mts,mjs,js}"
  - "package.json"
  - "tsconfig*.json"
---
<!-- managed by __CommonShared/rules/stack/node.md; sha256:8ca509b6f314cd08; edit it there, put project rules in project-*.md -->
# Node and TypeScript rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Package and build
- Validate input at every boundary (CLI args, tool calls, files, HTTP) with a schema validator. (docs/05 §1)
- Scripts: `build`, `typecheck` (`tsc --noEmit`), `test` (build then `node --test`), `smoke`; keep `lint` separate. (docs/04 §1, §4)
- Commit the lockfile and install in CI with `npm ci`; pin dependency versions in tools. (docs/04 §5, docs/05 §1)
- npm workspace dependencies are `*`; an exact pin drifts and npm queries the public registry. (L-BUILD)
- `package.json` carries the version; every other carrier (`server.json`, manifest) has a test that it matches. (docs/05 §6, L-GIT)
- Give `tsconfig.json` an `include`; without one a scratch `.ts` fails everyone's typecheck. (docs/07 §4)
- Write throwaway scripts as `.mjs` in gitignored `temp/` inside the repo, so imports resolve. (docs/07 §4)
- Anchor `/dist/` and ignore `*.tsbuildinfo`, `coverage/`; list nested outputs (`packages/*/dist/`). (docs/11 §2, §3)
- Generate copied docs (packaged README, CHANGELOG) at build time and gitignore them. (L-BUILD)
- ESM deployed to serverless hosts needs `.js` on relative imports. (L-BUILD)

## CLIs and MCP servers
- stdout carries only the result or protocol; every log goes to stderr with a `[name]` prefix. (docs/05 §5, L-MCP)
- No slow I/O (PATH probes, network shares) before `initialize`. (L-MCP)
- A call that may pass about 60 s becomes a background job with disk-backed state and a status tool. (L-MCP)
- A doctor or init tool reports the build path and tool count; a documented tool missing means a stale build. (L-MCP)
- Tool descriptions lead with the job; no funnel phrases like "run this first". (L-UI)
- Write tools return a dry run; `confirm: true` on the second call acts; honour a `<APP>_READ_ONLY` switch. (docs/05 §5)
- Contract tests: guides name only registered tools, every write tool documents `confirm`, README list equals code. (docs/04 §3)
- Retry only idempotent calls on transport/408/429/5xx with jitter and a capped `Retry-After`; never a write. (docs/05 §5, L-DEPLOY)
- Wrapped CLIs can print "failed" and exit 0: check output with per-command failure patterns. (L-MCP)
- Run git plumbing with `-z`; re-read config on mtime change and never cache a missing file. (L-MCP)

## Processes on Windows
- Never `shell: true` for `.cmd` shims: pass a built line to `cmd /d /s /c` verbatim, or resolve the real binary. (L-WIN)
- Listen for `error` on every spawned child; an unhandled ENOENT kills the server. (L-WIN)
- Run TS servers as one process (`node --import tsx`), not through an `npx tsx` wrapper. (L-WIN)
- Exit code 3221226505 after the work finished is a Node exit crash: rerun before calling it a fault. (docs/07 §4)

## Web apps and dev servers
- In a Vite + TypeScript app, `build` typechecks first (`tsc -b && vite build`). (docs/05 §1)
- If the project uses Tailwind v4: put external `@import` lines before `@import "tailwindcss"`, or PostCSS drops them. (L-BUILD)
- `npm run dev` under tsx loads no `.env`; document how env vars are set. (L-BUILD)
- Exclude `dist/` and `release/` from file watchers. (L-BUILD)
