---
phase: 21
plan: 21-5-08
subsystem: tooling
tags: [done-gate, composite-verification, cli, phase-21-status]
requires: [21-4-07]
provides:
  - scripts/phase-21-status.ts — 9-gate composite done-gate CLI
  - npm run phase-21-status alias
affects:
  - scripts/phase-21-status.ts
  - package.json
tech-stack:
  added: []
  patterns: [composite-done-gate, per-gate-pass-fail-report, env-gated-playwright]
key-files:
  created:
    - scripts/phase-21-status.ts
  modified:
    - package.json
key-decisions:
  - "Gate 5 uses LearnedPattern.sample_size, not `n` (the plan's pseudocode used `n`, which doesn't exist on the model and would throw at runtime). Same column-name fix applied in the relearn script."
  - "Gate 8 (BLOCKER-1): missing 21-3-06-SUMMARY.md returns FAIL (not SKIP); strict regex /spread:\\s*[0-9.]+\\s*→\\s*[0-9.]+/ only — no lenient prose path. Verified 21-3-06-SUMMARY.md matches both required lines → Gate 8 PASS."
  - "Gate 7 runs the full `npm test`; it currently FAILs on 2 PRE-EXISTING unrelated failures (source-package live-network timeout + a playwright spec vitest mis-collects) — confirmed failing at 588a5a4 before Phase 21. Not gamed/special-cased: the operator should triage these separately. Left as an honest FAIL."
  - "The script correctly reports PHASE 21 — NOT READY in the current state because the phase is not yet DEPLOYED: production runs pre-Phase-21 code, so the scheduled price-followup keeps creating PriceOutcome rows without sector columns (Gates 2/3 FAIL). This is the intended behavior of a done-gate — it gates on the live shipped state, not just the code."
requirements-completed: []
duration: 1h
completed: 2026-05-23
---

# Phase 21 Plan 21-5-08: Composite phase-21-status Done-Gate Summary

`npm run phase-21-status` — a single-command operator verifier across 9 gates covering all 12 Phase 21 ROADMAP success criteria (1–11 + non-goals deferred = #12). Mirrors the Phase 19 `model-card-status` / Phase 20 `phase-20-status` patterns. Exit 0 only when every gate PASSes/SKIPs.

## Tasks

### Task 1: scripts/phase-21-status.ts — commit `211b89a`
9 gates: schema · backfill coverage · forward-path freshness · classifyHit signature · relearn freshness · UI copy+props · test gates (tsc/vitest/check-prompts/playwright) · compression+non-inversion sanity (BLOCKER-1 FAIL-on-missing) · non-goals absent. Per-gate PASS/FAIL/SKIP with underlying numbers, then a composite verdict line. `PLAYWRIGHT_SKIP=1` skips the e2e sub-gate. `prisma.$disconnect()` on exit. tsc clean.

### Task 2: package.json alias — commit `211b89a`
`"phase-21-status": "npx tsx scripts/phase-21-status.ts"` added after `phase-20-status`. JSON valid; `npm run phase-21-status` invocable.

## First-run verdict (2026-05-23, PLAYWRIGHT_SKIP=1)

```
✅ [PASS] Gate 1: Schema additive columns — sample row sector_etf=XLK
❌ [FAIL] Gate 2: Backfill coverage — 55/610 rows unlabeled (9.02%); threshold ≤ 1%
❌ [FAIL] Gate 3: Forward path freshness — most-recent row: sector_etf=null raw=null sector_rel=null
✅ [PASS] Gate 4: classifyHit signature widened — sector_relative_pct param present
✅ [PASS] Gate 5: Relearn freshness — 121/121 cells last_updated within 14d (100.0%)
✅ [PASS] Gate 6: UI copy + props — 5/5 UI invariants ok
❌ [FAIL] Gate 7: Test gates — failing: vitest
✅ [PASS] Gate 8: Compression + non-inversion sanity — 21-3-06-SUMMARY.md matched
✅ [PASS] Gate 9: Non-goals absent from codebase — 0/4 non-goals found

❌ PHASE 21 — NOT READY
```

### Why the 3 FAILs are NOT code defects

- **Gates 2 + 3 — deploy dependency.** Production `ciphersearch.app` still runs **pre-Phase-21 code**. Over the 2 days since the relearn, the scheduled `price-followup` cron created ~54 new `PriceOutcome` rows **without** sector columns (the deployed price-followup doesn't know about Phase 21). Total grew 556→610; unlabeled 1→55. **Resolves on deploy** (new price-followup writes all 4 columns) **+ one `relabel` cron drain** of the new unlabeled rows.
- **Gate 7 — pre-existing test noise.** `vitest` fails on 2 files unrelated to Phase 21: `src/lib/data/source-package.test.ts` (live-network timeout) and `tests/playwright/research-manipulation-banner.spec.ts` (a Playwright spec vitest mis-collects). Both confirmed failing at `588a5a4` BEFORE any Phase 21 Wave-4/5 work. Operator should triage separately (or scope `npm test`).

Gates 1/4/5/6/8/9 PASS — the engine logic, relearn (100% freshness), UI swap, and sanity invariants all hold.

## Verifications

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| 9 gate functions present | PASS |
| BLOCKER-1: gate8 FAIL-not-SKIP + strict spread regex | PASS |
| non-goal grep targets (rankIC/tripleBarrier/sectorPooling/loMamaysky) | present |
| `npm run phase-21-status` invocable | PASS |
| Composite run | 6 PASS / 3 FAIL (all 3 explained above) |

## Deviations from Plan

**[Rule 1 — Bug] `n` → `sample_size`** — the plan's Gate 5 pseudocode queried `learnedPattern.count({ where: { n: ... } })`; the model column is `sample_size`. Fixed (would have thrown `Unknown argument n` at runtime).

**Total: 1 deviation (Rule 1).**

## Authentication Gates
None for the code. Gates 2/3/5 query Neon via the app's `DATABASE_URL`.

## Issues Encountered
- The done-gate honestly reports NOT READY pending deploy + drain + Gate-7 test-noise triage. This is correct done-gate behavior.

## Phase 21 Timeline (for Phase 22 discuss)
- Planned: 2026-05-19 (8 plans, plan-checker pass `7b06dfd`).
- Built: 2026-05-20 → 2026-05-23 (Waves 1–5; relearn run 2026-05-21).
- Ship-pending: deploy + relabel drain + Gate-7 triage + Playwright visual sign-off.

## Phase Completion Status

**All 8 plans CODE-COMPLETE (8/8 SUMMARYs).** The phase is **not yet SHIPPED** — the done-gate gates on the live deployed state. Remaining ship steps (operator):
1. **Deploy** Phase 21 to `ciphersearch.app` (Vercel) — makes the new price-followup write sector columns forward.
2. **Drain** the relabel cron (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/relabel`) until Gate 2 ≤ 1% — clears the ~55 rows the old prod cron created.
3. **Triage Gate 7** — fix or scope the 2 pre-existing vitest failures (source-package live-network, the mis-collected playwright spec).
4. **Playwright visual** (21-4-07 Task 3) — run `sector-relative-labels.spec.ts` against the deployed app + screenshot review.
5. **Re-run** `npm run phase-21-status` → expect `PHASE 21 — READY TO SHIP`, then flip the ROADMAP checkbox + mark STATE complete.
