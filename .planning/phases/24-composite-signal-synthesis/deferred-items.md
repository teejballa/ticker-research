# Phase 24 — Deferred Items (out of Wave 1 scope)

Discovered during 24-01 execution. Not fixed here per GSD SCOPE BOUNDARY rule.

## Pre-existing TypeScript errors (27 total, unrelated to Wave 1)

`npx tsc --noEmit` reports 27 errors in P22-era test files that reference the pre-regime-axis
unique index name `signal_class_pattern_key_cap_class_horizon_days`. The current Prisma-generated
type is `signal_class_pattern_key_cap_class_horizon_days_regime` (regime axis added in Phase 22).

Files with stale unique-index refs:
- tests/integration/learn-dual-class.test.ts (6 sites)
- tests/integration/smart-money-affects-reports.test.ts (2 sites)
- tests/integration/technical-affects-reports.test.ts (2 sites)
- src/app/api/cron/learn/__tests__/learn.drift.live.test.ts (3 sites)
- src/app/api/cron/learn/__tests__/learn.ess.live.test.ts (7 sites — via .live.test.ts variants)

**Impact on Wave 1:** none — Wave 1 introduces zero new tsc errors. All 27 errors are in files
touched by P22 without accompanying test updates.

**Recommended fix:** rename to `signal_class_pattern_key_cap_class_horizon_days_regime` and add
`regime: 'ALL'` to the where clauses. Belongs in a P22 cleanup plan or its own hotfix.

## Wave-0 scaffold defect: require('@/...') doesn't resolve in vitest

Wave 0 landed 11 RED scaffolds that use `require('@/lib/...')` inside `it()` bodies. Vitest's
`resolve.alias` only applies to ESM `import` statements — Node's native `require()` does not
honor the alias. Once modules exist, the tests fail with `Cannot find module '@/lib/...'`.

Fixed in Wave 1 for the two scaffolds Wave 1 needs GREEN
(ess-weighted-mean.unit.test.ts, fallback-gate.unit.test.ts). Remaining scaffolds that use
this pattern will need the same fix when their corresponding waves land:

- tests/composite/isotonic-fit.unit.test.ts (Wave 1 partial GREEN + Wave 2 look-ahead)
- tests/composite/bootstrap-ci.unit.test.ts (Wave 2)
- tests/composite/logistic-baseline.unit.test.ts (Wave 2)
- tests/composite/engine-context-composite.int.test.ts (Wave 3)
- tests/composite/schema-negative-shape.unit.test.ts (Wave 3)
- tests/composite/reliability-bins.int.test.ts (Wave 3)
- tests/composite/gemini-analysis-composite-overwrite.int.test.ts (Wave 3)
- tests/composite/panel-headline.unit.test.tsx (Wave 4)
- tests/composite/insights-render.int.test.tsx (Wave 4)

**Fix pattern:** replace `const { X } = require('@/lib/foo/bar')` with a top-of-file
`import { X } from '@/lib/foo/bar'`. Vitest's alias resolves for ESM imports.

Wave 1 fixed isotonic-fit.unit.test.ts too (Task 3 needs it GREEN for monotonicity/round-trip;
look-ahead defense still uses require() and stays RED for Wave 2).
