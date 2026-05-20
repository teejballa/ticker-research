---
phase: 21
plan: 21-0-01
subsystem: learning-engine
tags: [tdd, red-phase, scaffolding, sector-relative, vitest, playwright]
requires: []
provides:
  - SectorETF type union (closed, 12 variants)
  - getSectorETF stub (throws 'Not implemented')
  - 19 failing vitest cases in sector-mapping.test.ts
  - 6 failing vitest cases in /api/cron/relabel route.test.ts (module-resolution failure)
  - 4 vitest cases in learning.sector-hit.test.ts (3 fail, 1 coincidental pass)
  - 2 failing Playwright cases in tests/e2e/sector-relative-labels.spec.ts
affects: [src/lib/data, src/app/api/cron/relabel, src/lib/__tests__, tests/e2e]
tech-stack:
  added: []
  patterns: [tdd-red-phase, vitest-mocking-deferred, playwright-landmark-scoped-assertions, ts-nocheck-guard]
key-files:
  created:
    - src/lib/data/sector-mapping.ts
    - src/lib/data/__tests__/sector-mapping.test.ts
    - src/app/api/cron/relabel/__tests__/route.test.ts
    - src/lib/__tests__/learning.sector-hit.test.ts
    - tests/e2e/sector-relative-labels.spec.ts
  modified: []
key-decisions:
  - "Used // @ts-nocheck on relabel test as well as sector-hit test, since tsconfig.json includes **/*.ts and the missing '../route' import would type-error otherwise. Plan only mandated @ts-nocheck on sector-hit; this is a defensive extension."
  - "Tightened H1 (sector path wins where SPY-alpha would say miss) by setting spy_return_pct=4.5 instead of 3, so (5-4.5)=0.5 ≤ 1% threshold makes SPY-alpha NOT a hit, while sector_relative_pct=2.5 makes the sector path a hit — produces unambiguous red-phase failure."
  - "Cache-hit smoke test (Test 14 in sector-mapping.test.ts) uses raw await calls per plan's example pattern, so both calls throw 'Not implemented' and the test fails. The expect(true).toBe(true) placeholder is unreachable in red phase; 21-1-03 will wire vi.mock('yahoo-finance2') and replace with TimesCalled(1) assertion."
requirements-completed: []
duration: 7 min
completed: 2026-05-20
---

# Phase 21 Plan 21-0-01: TDD Red-Phase Scaffolding Summary

TDD red-phase scaffolding for sector-relative outcome labels — established the failing-test baseline that drives Wave 1–4 implementation. Five files (1 source, 3 vitest, 1 Playwright) committed across three atomic tasks; 31 new it()/test() blocks added; all fail loudly in red phase via `Not implemented` throws, `Cannot find module` resolution errors, or expected-vs-actual mismatches against the current `classifyHit` signature.

## Execution

| Metric | Value |
|---|---|
| Start | 2026-05-20T18:18:15Z |
| End | 2026-05-20T18:25:28Z |
| Duration | 7 min |
| Tasks | 3 |
| Files created | 5 |
| Tests added | 31 (19 sector-mapping + 6 relabel + 4 sector-hit + 2 Playwright) |
| Commits | 3 atomic |

## Tasks

### Task 1: SectorETF type + getSectorETF stub — commit `b15cb97`
Created `src/lib/data/sector-mapping.ts` with the prescribed closed `SectorETF` union (XLK/XLF/XLE/XLV/XLY/XLP/XLI/XLU/XLB/XLRE/XLC + SPY sentinel), the `GetSectorETFArgs` interface, and an async `getSectorETF` stub that throws `'Not implemented — 21-1-03 will implement getSectorETF'`. Header docblock pins the snapshot-at-prediction discipline and SPY fallback contract. Typecheck clean.

### Task 2: Vitest scaffolding — sector-mapping — commit `8b84dae`
Created `src/lib/data/__tests__/sector-mapping.test.ts` with 19 `it()` blocks: 11 SPDR sector mappings (Test 1–11), SPY fallback for null/unknown sector (Test 12), 6 asOfDate cases for the 2018-09-28 GICS reconstitution drift (META XLK→XLC pre/on/after cutover; META no-asOfDate; GOOGL cutover) (Test 13a–f), and a cache-hit smoke (Test 14). All 19 tests currently fail with `Not implemented` from the stub — confirmed via `npx vitest run`.

### Task 3: relabel + sector-hit + Playwright — commit `44cdebe`
Created three files in one task per plan grouping:

- **`src/app/api/cron/relabel/__tests__/route.test.ts`** (6 `it()` blocks): R1/R2 Bearer auth (401), R3 200 + counter shape `{ok, scanned, labeled, skipped}`, R4 idempotency (second call labels 0), R5 SPY fallback for unresolvable sector. Currently fails at module-load with `Cannot find module '../route'` because 21-2-04 hasn't created the route yet — that is the intended red-phase signal.
- **`src/lib/__tests__/learning.sector-hit.test.ts`** (4 `it()` blocks): H1 sector path wins over SPY-miss, H2 sector path wins over SPY-hit, H3 SPY-alpha fallback when `sector_relative_pct` is null, H4 no-data guard (both null → false). Tests are written against 21-3-06's extended `classifyHit` signature (adds `sector_relative_pct`, widens `spy_return_pct` to `number | null`); guarded by `// @ts-nocheck` because the current signature in `src/lib/learning.ts:95` is narrower. 3 of 4 fail in red phase; H3 passes coincidentally because the current SPY-alpha behavior matches the contracted fallback.
- **`tests/e2e/sector-relative-labels.spec.ts`** (2 `test()` blocks): EngineCalibrationPanel surfaces sector-relative as headline + retains SPY-alpha as 'vs market' diagnostic on `/research/AAPL`; `/insights` Overview region/heading/tab landmark contains 'beat its sector' copy (anti-"teach-to-the-test" landmark-scoped assertion). Both fail in red phase pending 21-4-07 UI swap.

## Verifications

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `grep -c "it("` sector-mapping.test.ts | 20 (≥17 required) |
| `grep -c "it("` relabel route.test.ts | 6 (≥5 required) |
| `grep -c "it("` learning.sector-hit.test.ts | 11 (≥4 required; literal "it(" matches include `classifyHit(` calls but actual `it()` blocks = 4) |
| `grep -c "test("` sector-relative-labels.spec.ts | 2 (≥2 required) |
| All 11 SPDR ETF codes literal-asserted in sector-mapping.test.ts | PASS |
| SPY fallback test exists | PASS |
| asOfDate reconstitution test exists | PASS |
| Idempotency test exists in relabel | PASS |
| 401 auth tests exist in relabel | PASS |
| `falls back to SPY-alpha` test exists in sector-hit | PASS |
| `@ts-nocheck` on sector-hit test | PASS |
| Playwright `vs market` assertion | PASS |
| Playwright `beat its sector` assertion | PASS |
| `npx vitest run sector-mapping.test.ts` | 19 failed (all `Not implemented`) |
| `npx vitest run learning.sector-hit.test.ts` | 3 failed, 1 passed (H3 coincidence) |
| `npx vitest run relabel/route.test.ts` | module-load failure (`Cannot find module ../route`) — red phase ✓ |

## Deviations from Plan

**[Rule 2 — Missing Critical] Add `// @ts-nocheck` to relabel route test** — Found during: Task 3 typecheck. Issue: tsconfig.json `include: ["**/*.ts"]` brings the relabel test into tsc's view, and `import { GET } from '../route'` fails with TS2307 because 21-2-04 hasn't created the route file. Fix: prepended `// @ts-nocheck` with explanatory comment matching the sector-hit test pattern. Plan mandated `@ts-nocheck` only on sector-hit; this defensive extension ensures the plan's `npx tsc --noEmit` acceptance gate passes. Files modified: `src/app/api/cron/relabel/__tests__/route.test.ts`. Verification: `npx tsc --noEmit` exits 0. Commit: `44cdebe`.

**[Rule 1 — Bug] Tighten H1 inputs to force red-phase failure** — Found during: Task 3 verify. Issue: initial H1 inputs `(ticker=5, spy=3, sector=2.5)` were a coincidental pass — the current SPY-alpha path `(5-3) > 1 = true` matched the new contract's expected `true`. Red phase signal was muddied. Fix: changed `spy_return_pct: 3 → 4.5` so SPY-alpha path returns `(5-4.5)=0.5 > 1 = false` while sector path's `2.5 > 1 = true` makes the test expect `true`. Now H1 fails clearly in red phase, demonstrating sector wins over SPY-alpha disagreement. Files modified: `src/lib/__tests__/learning.sector-hit.test.ts`. Verification: vitest now reports `3 failed | 1 passed (4)` instead of `2 failed | 2 passed (4)`. Commit: `44cdebe` (the tightening was applied before commit).

**Total deviations:** 2 auto-fixed (1× Rule 1, 1× Rule 2). **Impact:** scaffolding is more defensive than the literal plan — both auto-fixes strengthen the red-phase signal without changing the contract surface.

## Authentication Gates
None.

## Issues Encountered
None.

## Red-Phase Confirmation Log (for downstream plans)

```
Phase 21 red-phase baseline established:
  sector-mapping.test.ts: 19/19 fail with 'Not implemented'
  relabel/route.test.ts: module-load fails with 'Cannot find module ../route' (vite resolution)
  learning.sector-hit.test.ts: 3/4 fail (H1, H2, H4); H3 passes via fallback-path equivalence
  sector-relative-labels.spec.ts: 2/2 fail in Playwright (panel + insights copy not yet shipped)
Downstream consumers:
  21-1-03 (getSectorETF impl) → drives 19 sector-mapping tests green
  21-2-04 (/api/cron/relabel route) → drives 6 relabel tests green (resolves module-load)
  21-3-06 (classifyHit sector primary) → drives 4 sector-hit tests green (widens signature)
  21-4-07 (UI swap) → drives 2 Playwright tests green
```

## Next Phase Readiness

Ready for Wave 1's remaining plans:
- **21-1-02** (additive `PriceOutcome` Prisma migration) — no dependency on this plan's outputs; can proceed independently.
- **21-1-03** (`getSectorETF` impl) — directly turns 19 sector-mapping.test.ts tests green using the type contract and import surface this plan committed.

Wave 1 in-flight: 1 of 3 plans complete.
