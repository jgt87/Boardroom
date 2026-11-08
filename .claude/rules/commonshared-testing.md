---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/test_*.py"
  - "**/*.Tests.ps1"
  - "test/**"
  - "tests/**"
  - "e2e/**"
  - ".github/workflows/**"
---
<!-- managed by __CommonShared/rules/testing.md; sha256:862f4a113be86d04; edit it there, put project rules in project-*.md -->
# Testing rules

Shared defaults from CommonShared. The project's own `.claude/rules/project-*.md`, AGENTS.md,
DESIGN.md and PRODUCT.md win on conflict.

## Runner and layout
- Use the platform's standard runner (`node:test`, pytest, Pester); a project with a bundler-native runner (Vitest under Vite) uses that. (docs/04 §1)
- Tests over compiled output rebuild first: the test script runs the build. (docs/04 §1, L-BUILD)
- Vite apps co-locate `src/**/<name>.test.ts(x)`; Node, Python and PowerShell use a flat `tests/` or `test/`. (docs/04 §2)
- Name tests by area: `<area>.test.mjs`, `<area>.integration.test.mjs`, `test_<area>.py`, `<Module>.Tests.ps1`. (docs/04 §2)
- Browser specs live in `e2e/`; committed fixtures in `tests/fixtures/`, helpers in `tests/helpers/`. (docs/04 §2)
- Test the real module, never a hand-copied twin of it. (L-TEST)

## Offline and deterministic
- Unit tests run offline: inject `fetch`, `sleep`, clocks and CLIs; point app home at a temp dir. (docs/04 §3)
- Put network tests behind a marker that the default run skips (`-m "not network"`). (docs/04 §3)
- Fixtures are recorded or synthetic and fictional; never real user data, brands or people. (docs/04 §6, L-SEC)
- Pin randomness, time zone and locale (`hourCycle`); never fix a flake with a longer timer. (L-TEST)
- Each test sets up its own state and passes when run alone. (L-TEST)
- On Windows: resolve temp paths with `realpath`; CI runners hand out 8.3 short paths. (L-WIN)
- Before changing code for a failing gate, run that test file alone twice; if it passes, report it flaky. (L-TEST)

## Smoke and contracts
- Ship a smoke entrypoint that checks end to end without UI: `scripts/smoke.*`, `doctor`, `--selftest` or `--dry-run`. (docs/04 §3, §6)
- A protocol server's smoke parses all of stdout as the protocol (e.g. JSON-RPC), so one stray line fails it. (docs/04 §3)
- Add contract tests where docs and code must agree: version carriers equal, README tool list equals code. (docs/04 §3, L-GIT)
- Pin refactors with golden outputs that are identical before and after. (L-TEST)
- Parity tests on real captures use thresholds that only ratchet up. (docs/04 §3, L-TEST)

## Rule-enforcement tests
- Enforce design, code and repo rules with tests that read the source files, using the platform runner. (docs/04 §3, docs/10 §6)
- Strip comments before matching but keep line numbers, so a failure names `file:line`. (docs/10 §6, docs/08 §9)
- Read each source file once and share it across rules. (docs/08 §9)
- Mutation-check every new rule once: add a violation to a copy, see it fail, restore from your own backup. (docs/10 §6)
- Never restore a mutated file with `git checkout --`; it discards the file's uncommitted work. (docs/10 §6)
- Counted rules are ratchets: a committed budget that is lowered when literals go, never raised. (docs/10 §2)
- With CSS custom properties: every `var(--x)` read without a fallback must be defined in CSS or set from code. (docs/10 §6)
- Name each enforced rule the same in the test, DESIGN.md and AGENTS.md. (docs/10 §6)

## Browser, a11y and e2e
- E2E runs against the built app on a dedicated test port, never the user's running instance. (docs/04 §4, L-TEST)
- If the project uses Playwright: `workers: 1`, `trace: 'retain-on-failure'`. (docs/04 §1)
- Run an automated WCAG A/AA check (e.g. axe) with reduced motion, and assert zero console errors in the same run. (docs/04 §3)
- Check 200 % zoom and narrow-width no-overflow; screenshot light and dark at 1440/768/390. (docs/04 §3)
- Prove each e2e step changed something before asserting; a vacuous pass is a failure. (L-TEST)
- Wait for a selector, never `networkidle`, when a realtime socket is open. (L-TEST)
- Headless media uses pre-generated fixtures and the Chrome or Edge channel (Chromium lacks H.264). (L-TEST)

## Coverage and CI
- Done means typecheck + lint + tests (+ build) via the project's own scripts, each exit code read. (docs/04 §4, L-TEST)
- Coverage gates where set: statements 80, branches 75, functions 60, lines 80; per-file ratchets allowed. (docs/04 §4)
- CI order: private-material grep → typecheck → lint → test:coverage → build (size budget) → e2e. (docs/04 §5, docs/10 §7)
- CI on push and pull_request, skipping markdown-only changes, with `concurrency: cancel-in-progress`. (docs/04 §5)
- Use a supported runtime LTS and current action majors; check the run reports a non-zero test count (a glob can match nothing). (L-TEST)
- Pin actions by SHA looked up with `gh api`, never from memory; keep the tag in a trailing comment. (docs/10 §7)
- Run CI on the OS whose fonts the layout and screenshot tests assume. (docs/10 §7)
- Upload the browser report only `if: failure()` with short retention; packages use `if-no-files-found: error`. (docs/10 §7, docs/04 §5)
