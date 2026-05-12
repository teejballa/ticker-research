---
phase: 20-real-sentiment-analysis
plan: 20-Z-07
subsystem: testing
tags: [pit-discipline, lookahead-bias, regression, prisma, query-instrumentation, ci-gate]

requires:
  - phase: 20-Z-01
    provides: SentimentObservation Prisma model + insert-only DAO (the PIT surface this regression test guards)
provides:
  - Runtime regression test that intercepts every Prisma query issued by the sentiment-feature read path and fails the build on any published_at appearing in WHERE / JOIN / ORDER BY clauses against SentimentObservation or SentimentSnapshot
  - Static grep guard (scripts/check-lookahead-static.ts) that fails CI on any non-allowlisted published_at reference in src/, with a // LOOKAHEAD-OK: <reason> escape hatch
  - Synthetic violation fixture (tests/integration/__fixtures__/bad-published-at-query.ts) so the matcher is proven non-vacuous
  - Two npm scripts (`check-lookahead`, `test:lookahead-bias`) wired for CI
  - Closes T-20-Z-01-03 forward reference — 20-Z-01-PLAN.md now cites this plan as its PIT runtime defense
affects: [20-A-01..05, 20-B-*, 20-C-*, any future plan that reads from SentimentObservation]

tech-stack:
  added: []
  patterns:
    - "PrismaClient $extends({ query }) wrapper for runtime query capture (src/lib/db/query-instrumentation.ts)"
    - "// LOOKAHEAD-OK: <non-empty-reason> escape-hatch comment pattern, enforced by static check"

key-files:
  created:
    - src/lib/db/query-instrumentation.ts
    - tests/integration/lookahead-bias.regression.test.ts
    - tests/integration/__fixtures__/bad-published-at-query.ts
    - scripts/check-lookahead-static.ts
    - tests/check-lookahead-static.unit.test.ts
  modified:
    - package.json
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (forward ref closed)

key-decisions:
  - "Two-layer defense: static grep (fast, runs on every push) + runtime query capture (slower, runs in test:integration). Static catches typos; runtime catches dynamic query construction the grep would miss."
  - "Escape hatch is // LOOKAHEAD-OK: <reason> with a non-empty reason. Empty-reason allowlists fail the static check by design — prevents lazy bypass."
  - "Synthetic violation fixture is a meta-test of the matcher itself — proves the regression test is not vacuously green."

patterns-established:
  - "Build-gate test pattern: shadow_required=false because there is no behavior to A/B — test either passes or build is broken."
  - "Forward-reference closure pattern: when an earlier plan defers a defense to a later plan, the later plan's hard-cleanup-gate must include the citation back."

requirements-completed: []

duration: ~24 min
completed: 2026-05-12
---

# Phase 20-Z-07 Summary

**PIT regression defense for SentimentObservation: static grep + runtime query capture + synthetic violation, all green on main.**

## Self-Check: PASSED

- `npx tsc --noEmit` → exit 0
- `npm test` → 941 passed / 2 skipped / 3 todo / 0 failed
- `npm run check-lookahead` → exit 0 (0 violations across 121 files)
- `npx vitest run tests/check-lookahead-static.unit.test.ts` → 4/4 pass (clean tree, non-allowlisted violation caught, valid allowlist accepted, empty-reason allowlist rejected)
- Working tree clean

## Performance

- **Duration:** ~24 min cumulative (two agent sessions; both completed real work, both terminated on stream timeout before writing this SUMMARY — finalization performed inline)
- **Tasks:** 5 atomic commits
- **Files created:** 5
- **Files modified:** 2

## Accomplishments

### Commits (5 atomic)

1. `e39a2bb` feat(20-Z-07): add query-capture utility for lookahead-bias regression — `withQueryCapture<T>()` wrapping Prisma `$extends({ query })`
2. `a83705b` test(20-Z-07): add synthetic violation fixture for matcher-validity check
3. `68b8926` test(20-Z-07): add lookahead-bias regression test with 8 cases
4. `8f5bb93` feat(20-Z-07): add static lookahead-bias check + LOOKAHEAD-OK allowlists
5. `9e9ee1f` test(20-Z-07): unit test for static check + close 20-Z-01 forward reference

### Defense surface

- **Runtime** (`npm run test:lookahead-bias`): runs production sentiment-read paths under `withQueryCapture`, asserts no published_at in WHERE/JOIN/ORDER BY for SentimentObservation or SentimentSnapshot. Asserts synthetic-bad fixture IS caught.
- **Static** (`npm run check-lookahead`): greps src/ for published_at references; non-allowlisted hits fail CI. Allowlist requires `// LOOKAHEAD-OK: <non-empty-reason>` on the preceding line.

### Threat mitigations shipped

- T-20-Z-07-01 (false-negative — new call site added without coverage): runtime test enumerates entry points by grep and asserts count matches what it exercises.
- T-20-Z-07-02 (lazy bypass): empty-reason allowlist comments fail the static check.
- T-20-Z-07-03 (vacuous green): synthetic-bad fixture is checked against the matcher as a meta-test.

### Closes forward reference

- T-20-Z-01-03 in 20-Z-01-PLAN.md now cites this plan as its PIT runtime defense.

## Deviations

None — plan executed as written.
