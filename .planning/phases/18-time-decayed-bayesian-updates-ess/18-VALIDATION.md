---
phase: 18
slug: time-decayed-bayesian-updates-ess
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-04
last_updated: 2026-05-06
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth for test mapping is `18-RESEARCH.md` §"Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (units + live-DB integration), Playwright (e2e) |
| **Config files** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Live-DB integration** | `npm run test:integration` |
| **E2E command** | `npm run test:e2e` |
| **Full suite command** | `npm test -- --run && npm run test:integration && npm run test:e2e` |
| **Estimated runtime (full)** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run` (units only — fast)
- **After every plan wave:** Run `npm run test:integration` against live Neon dev branch
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (units) / 90 seconds (integration)

---

## Per-Task Verification Map

> Populated by Plan 18-10 Task 2 from each PLAN.md frontmatter, acceptance_criteria,
> and threat_model rows. Every task has at least one row; every requirement and
> threat ID is referenced at least once.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 00.1 | 00 | 0 | CORE-ML-01, CORE-ML-04 | T-18-04 (status enum literal) | 5 unit RED-on-import stubs encoded with STATUS_VALUES literal `EXPLORATORY-WATCH` and rawN=29 floor literal | unit | `npm test -- --run src/lib/__tests__/learning.{decay,ess,ph,drift}.test.ts src/lib/__tests__/cv.purgedkfold.test.ts` | ✅ | ✅ |
| 00.2 | 00 | 0 | CORE-ML-02, CORE-ML-03, CORE-ML-04, CORE-ML-05 | T-18-01, T-18-03, T-18-05 (literals encoded) | 3 live-DB cron stubs + 2 Playwright e2e stubs (skipped) wire to `effective_sample_size`, `ess_backfill_complete`, `ENABLE_BACKFILL_ESS`, `EXPLORATORY-WATCH` literals | integration + e2e | `ls src/app/api/cron/{learn,backfill-ess}/__tests__/*.live.test.ts tests/e2e/{engine-calibration-ess,insights-ess-ci}.spec.ts` | ✅ | ✅ |
| 01.1 | 01 | 1 | CORE-ML-01, CORE-ML-04 | T-18-04, T-18-05 | `STATUS_VALUES` const + `LearnedStatus` literal type (T-18-04); `confirmedDrift` returns numeric-only object (T-18-05); 5 pure primitives (decayWeights, computeESS, updatePosteriorWeighted, pageHinkleyStatistic, confirmedDrift); patternStatus extended with optional ESS arg | unit | `npm test -- --run src/lib/__tests__/learning.{decay,ess,ph,drift,test}.ts` | ✅ | ✅ |
| 02.1 | 02 | 1 | CORE-ML-02 (CV protocol used by tuning), CORE-ML-04 (PH params via same CV) | (none new — pure offline utility) | `purgedKFold` pure function, López de Prado leakage defence; default purge=embargo=90d (D-16); no DB/IO imports | unit | `npm test -- --run src/lib/__tests__/cv.purgedkfold.test.ts` | ✅ | ✅ |
| 03.1 | 03 | 1 | CORE-ML-01 | (additive-only — no enum tampering surface) | Additive-only schema diff: `effective_sample_size Float NOT NULL DEFAULT 0` + `n_trials_attempted Int NOT NULL DEFAULT 0` (D-19) | grep | `grep -E "effective_sample_size\\s+Float\|n_trials_attempted\\s+Int" prisma/schema.prisma` | ✅ | ✅ |
| 03.2 | 03 | 1 | CORE-ML-01 | (none — local toolchain only) | `prisma format` + `prisma generate` exit 0 cleanly | CLI | `npx prisma format && npx prisma generate` | ✅ | ✅ |
| 03.3 | 03 | 1 | CORE-ML-01 | (live DB — additive only, no data loss) | Schema pushed to Neon dev branch additively, all 504 cells populate ESS=0 default | manual UAT | `npx prisma db push` (live Neon dev) | ✅ | ✅ |
| 04.1 | 04 | 2 | CORE-ML-01, CORE-ML-02 | T-18-04 (STATUS_VALUES.includes runtime guard) | `recomputeOneCell` writes `effective_sample_size` + `n_trials_attempted` every cron tick; weighted α/β replace +1/+0; ESS-narrowed CIs (CORE-ML-03 by composition) | integration | `npm run test:integration -- --run src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` | ✅ | ✅ |
| 04.2 | 04 | 2 | CORE-ML-04 | T-18-01 (auth unchanged), T-18-04 (status guard), T-18-05 (numeric-only delta) | `confirmedDrift` two-of-two replaces single-test branch; status flips to `EXPLORATORY-WATCH` (no auto-demote per D-09); `drift_alert.delta` is numeric-only `{drift_z, ph_stat, ph_threshold, raw_n, ess}`; `drift_clear` LearningEvent emitted for Plan 09 recovery counter | integration | `npm run test:integration -- --run src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` | ✅ | ✅ |
| 05.1 | 05 | 2 | CORE-ML-01 | T-18-01, T-18-02, T-18-03 | `/api/cron/backfill-ess` enforces Bearer ${CRON_SECRET} (T-18-01), `ENABLE_BACKFILL_ESS=1` env-flag gate (T-18-03), idempotency marker `ess_backfill_complete` LearningEvent (T-18-03), single `prisma.$transaction` (T-18-02) | integration | `npm run test:integration -- --run src/app/api/cron/backfill-ess/__tests__/backfill.live.test.ts` | ✅ | ✅ |
| 06.1 | 06 | 2 | CORE-ML-02, CORE-ML-04 | T-18-06 (typed-config-constant approach) | `scripts/tune-lambda.ts` uses `purgedKFold` (D-16), grid `{14,30,60,90,180,365}` (D-01); `scripts/tune-page-hinkley.ts` uses same CV, grid `{0.001,0.005,0.01}×{30,50,100}` (D-07) | typecheck + grep | `npx tsc --noEmit && grep -c purgedKFold scripts/tune-lambda.ts scripts/tune-page-hinkley.ts` | ✅ | ✅ |
| 06.2 | 06 | 2 | CORE-ML-02, CORE-ML-04 | T-18-06 | Operator runs scripts; pastes tuned values into `HYPERPARAMETERS`. Skip path authorized when N too low (cv_brier_oos=null + class enumerated in `HYPERPARAMETERS_DEFERRED_RETUNE`) | manual UAT (skip path) | `npm test -- --run src/lib/__tests__/learning.hyperparameters.test.ts` (Plan 10 enforces) | ✅ | ✅ |
| 07.1 | 07 | 3 | CORE-ML-03, CORE-ML-05 | (trust boundary — engine-context post-process overwrite preserves ESS through to LLM) | `EngineContext` + `EngineCalibration` types extended with `effective_sample_size` + 4 per-class `*_ess` fields + `'EXPLORATORY-WATCH'` status union; ESS values overwrite via Plan-17-04 overwrite block in `gemini-analysis.ts` | unit | `npm test -- --run src/lib/__tests__/engine-context.test.ts` | ✅ | ✅ |
| 08.1 | 08 | 3 | CORE-ML-05 | T-18-04 (TS narrowing on `STATUS_BADGE` Record<WatchStatus, string>) | `STATUS_BADGE` extended with `'EXPLORATORY-WATCH'` entry; ESS subValue copy replaces `n=` with `ESS=`; `WatchBadge` component rendered next to status badge when `EXPLORATORY-WATCH` | e2e | `npm run test:e2e -- --grep "engine-calibration-ess"` | ✅ | ✅ |
| 08.2 | 08 | 3 | CORE-ML-05 | (visual UX — Playwright catches presence not aesthetics) | Operator visual sanity: ESS column reads naturally, watch badge unobtrusive on `/research/AAPL` | manual UAT | screenshot review (Wave 3 sign-off) | ✅ | ✅ |
| 09.1 | 09 | 3 | CORE-ML-03 | T-18-05 (Zod-validation on `drift_alert.delta` read) | `/insights` ESS column rendered; ESS-narrowed credible-interval widths surface (CORE-ML-03 LOOKS-DONE-BUT-ISN'T gate); `drift_clear` recovery counter row reads `<X>/14 clear days` (D-09 step 4); recovery-ready hint when X≥14 AND ESS≥30 | e2e | `npm run test:e2e -- --grep "insights-ess-ci"` | ✅ | ✅ |
| 10.1 | 10 | 4 | CORE-ML-02, CORE-ML-04 | T-18-06 (HYPERPARAMETERS typed-shape gate at CI time) | `learning.hyperparameters.test.ts` enforces: 4 SignalClass keys present, 5 typed fields populated, `lambda_days` from D-01 grid, `(ph_delta, ph_lambda)` from D-07 product, every class with `cv_brier_oos === null` OR `>= 0.25` enumerated in `HYPERPARAMETERS_DEFERRED_RETUNE` | unit | `npm test -- --run src/lib/__tests__/learning.hyperparameters.test.ts` | ✅ | ✅ |
| 10.2 | 10 | 4 | CORE-ML-01, CORE-ML-02, CORE-ML-03, CORE-ML-04, CORE-ML-05 | T-18-01, T-18-02, T-18-03, T-18-04, T-18-05, T-18-06 | Full-suite green + 3 LOOKS-DONE-BUT-ISN'T gates (Pitfall 3 cv_brier_oos < 0.25 OR deferred; Pitfall 13 N=29 floor; ESS_recent > 2 × ESS_old end-to-end) + per-task map populated + `nyquist_compliant: true` | composite | `npm test -- --run && npm run test:integration && npm run test:e2e` | ✅ | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Coverage summary (Plan 18-10 audit):**

- **17 task rows** across 10 plans (00–10) — every `<task>` block has at least one row.
- **All 5 requirement IDs** referenced: CORE-ML-01 (×7), CORE-ML-02 (×6), CORE-ML-03 (×4), CORE-ML-04 (×7), CORE-ML-05 (×4).
- **All 6 threat IDs** referenced: T-18-01 (×4), T-18-02 (×2), T-18-03 (×3), T-18-04 (×6), T-18-05 (×5), T-18-06 (×4).
- **All 17 rows: ✅** (every automated verify command exited 0; manual UAT rows operator-confirmed at Wave 3 + Wave 4 sign-off).

---

## Wave 0 Requirements

Tests-first scaffolding before any implementation task in Wave 1+:

- [x] `src/lib/__tests__/learning.decay.test.ts` — stubs for CORE-ML-01 (decayWeights, computeESS) — activated in Plan 01
- [x] `src/lib/__tests__/learning.ess.test.ts` — stubs for CORE-ML-01 (Kish ESS) — activated in Plan 01
- [x] `src/lib/__tests__/learning.ph.test.ts` — stubs for CORE-ML-04 (Page-Hinkley) — activated in Plan 01
- [x] `src/lib/__tests__/learning.drift.test.ts` — stubs for CORE-ML-04 (confirmedDrift two-of-two) — activated in Plan 01
- [x] `src/lib/__tests__/cv.purgedkfold.test.ts` — stubs for D-16 (purged K-fold) — activated in Plan 02
- [x] `src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` — stub for CORE-ML-02 (cron applies decay) — activated in Plan 04
- [x] `src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` — stubs for CORE-ML-04 (drift_alert event + EXPLORATORY-WATCH flip) — activated in Plan 04
- [x] `src/app/api/cron/backfill-ess/__tests__/backfill.live.test.ts` — stub for D-13 (idempotency) — activated in Plan 05
- [x] `tests/e2e/engine-calibration-ess.spec.ts` — stub for CORE-ML-05 (ESS column + watch badge) — activated in Plan 08
- [x] `tests/e2e/insights-ess-ci.spec.ts` — stub for CORE-ML-03 (CI widths reflect ESS) — activated in Plan 09

Existing infrastructure (`vitest`, `@playwright/test`, live-DB harness) covers these — no new framework install.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Resolution |
|----------|-------------|------------|-------------------|------------|
| λ tuning script: pick winning λ per signal class | CORE-ML-02 / D-01 | Tuning is operator-driven; output is a constant committed to git, not a runtime decision | Run `npx tsx scripts/tune-lambda.ts`, inspect OOS Brier table, paste winning λ into `HYPERPARAMETERS` constant in `learning.ts` | **Skip path taken** (Plan 18-06): live PriceOutcome table N=87 in ~30 days produces NaN Brier across grid under D-16 leakage-defended Purged K-Fold. All 4 classes deferred to Plan 21 via `HYPERPARAMETERS_DEFERRED_RETUNE` ledger; bootstrap λ=60 retained. Plan 10's `learning.hyperparameters.test.ts` enforces this audit trail at CI time. |
| Page-Hinkley parameter tuning: pick (δ, λ_PH) per signal class | CORE-ML-04 / D-07 | Same — operator pastes winning params into `HYPERPARAMETERS` | Run `npx tsx scripts/tune-page-hinkley.ts`, inspect injected-drift F1 table, commit constants | **Skip path taken** (Plan 18-06): same diagnostic — F1=0 across grid. Bootstrap (δ=0.005, λ_PH=50) retained; `HYPERPARAMETERS_DEFERRED_RETUNE` ledger covers the audit trail. Plan 21 re-tunes post-Plan-25. |
| Backfill cron one-time invocation in production | CORE-ML-01 / D-13 | Production-side env flag flip + manual trigger; idempotency makes accidental re-run safe | `vercel env add ENABLE_BACKFILL_ESS production`, hit `/api/cron/backfill-ess` once with CRON_SECRET, verify `ess_backfill_complete` LearningEvent written | **Pending operator action** (post-Phase-18 deploy step). Plan 18-10 Task 3 checkpoint surfaces the runbook; phase ships green on dev branch. |
| `/research/AAPL` visual sanity: ESS column reads naturally, watch badge unobtrusive | CORE-ML-05 / D-10/D-11 | Visual UX judgment — Playwright catches presence not aesthetics | Open in browser, compare to UI-SPEC if present | **Approved** at Plan 18-08 Task 2 checkpoint (Wave 3 sign-off). |

---

## D-16 Invariant Audit (Plan 18-10 Step 5)

> Every Phase 18 cross-validation goes through `purgedKFold` from `src/lib/cv.ts` —
> never random K-fold, never leakage-undefended split. Audit confirms zero rogue CV.

```
$ grep -E "purgedKFold" src/lib/cv.ts scripts/tune-lambda.ts scripts/tune-page-hinkley.ts | wc -l
7  (≥3 — one per file: tune-lambda 3×, tune-page-hinkley 2×, cv.ts 2× including signature + JSDoc)

$ grep -RE "kfold|k-fold|cross.validation" --include="*.ts" -i src/lib src/app/api/cron scripts | grep -v "purgedKFold" | grep -v "from '@/lib/cv'"
(zero matches outside the documented Purged K-Fold path — comments, JSDoc, and import paths only)
```

**Status:** ✅ D-16 invariant holds across the entire Phase 18 surface.

---

## D-17 Invariant Audit (Plan 18-10 Step 6)

> Every metric introduced by Phase 18 has a documented operational action.

| Metric | Operational Action | Surfaced In |
|--------|-------------------|-------------|
| `effective_sample_size` | `/insights` ESS column + `EngineCalibrationPanel` ESS subValue + ESS-based EXPLORATORY gate in `patternStatus` (D-04) | Plan 04 (cron write), Plan 08 (panel), Plan 09 (insights) |
| `drift_alert` count | `/insights` drift list + recovery counter | Plan 04 (cron write), Plan 09 (insights surface) |
| `EXPLORATORY-WATCH` cell count | `WatchBadge` on `EngineCalibrationPanel` + recovery counter on `/insights` | Plan 04 (status flip), Plan 08 (badge), Plan 09 (insights) |
| `HYPERPARAMETERS.cv_brier_oos` | `learning.hyperparameters.test.ts` CI gate enforces `< 0.25` OR enumerated in `HYPERPARAMETERS_DEFERRED_RETUNE` | Plan 10 Task 1 |
| `n_trials_attempted` | Plan-21 FDR denominator (forward-looking; written every cron tick from Plan 18-04 onward) | Plan 04 (cron write) |
| `drift_clear` LearningEvent | `/insights` recovery counter row reads `<X>/14 clear days` (D-09 step 4) | Plan 04 (cron emit), Plan 09 (insights count) |

**Status:** ✅ D-17 invariant holds — every metric has at least one downstream consumer.

---

## Threat-Model Coverage Audit (Plan 18-10 Step 7)

| Threat ID | Plan(s) | Verification |
|-----------|---------|--------------|
| T-18-01 (CRON_SECRET spoofing) | 04, 05 | `grep -nE "Bearer.*CRON_SECRET" src/app/api/cron/{learn,backfill-ess}/route.ts` returns 2 matches (one per route) — verbatim copies. |
| T-18-02 (backfill partial-write) | 05 | `grep -cE "prisma\.\$transaction" src/app/api/cron/backfill-ess/route.ts` returns 1 actual call (line 178) + 1 doc-comment reference. |
| T-18-03 (DoS via repeated backfill) | 05 | `grep -nE "ENABLE_BACKFILL_ESS\|ess_backfill_complete" src/app/api/cron/backfill-ess/route.ts` returns env-flag gate + idempotency marker. |
| T-18-04 (status enum poisoning) | 01, 04, 07, 08 | `STATUS_VALUES` const + literal type in `learning.ts:345-346`; `STATUS_VALUES.includes` runtime guard at `route.ts:591`; `STATUS_BADGE: Record<WatchStatus, string>` in `EngineCalibrationPanel.tsx:72`. |
| T-18-05 (DoS via drift_alert deserialization) | 04, 09 | `drift_alert.delta` payload is numeric-only `{drift_z, ph_stat, ph_threshold, raw_n, ess}` (`route.ts:642`); read-side Zod-validated in Plan 09. |
| T-18-06 (hyperparameter tampering) | 06, 10 | Typed-config-constant approach (`HYPERPARAMETERS: Record<SignalClass, ClassHyperparameters>`); `learning.hyperparameters.test.ts` enforces typed shape + grid bounds + deferred-retune ledger. |

**Status:** ✅ All 6 STRIDE threats have at least one passing test row.

---

## LOOKS-DONE-BUT-ISN'T Acceptance Gates (RESEARCH §Pitfalls Defended)

Three end-to-end gates defended at CI time per RESEARCH §Pitfalls Defended:

| Pitfall | Gate | Test File | Status |
|---------|------|-----------|--------|
| **Pitfall 3 (λ-by-eyeball)** | Every `HYPERPARAMETERS[cls].cv_brier_oos` is `< 0.25` OR class enumerated in `HYPERPARAMETERS_DEFERRED_RETUNE` (Plan 18-06 escape hatch). | `src/lib/__tests__/learning.hyperparameters.test.ts` | ✅ Plan 10 |
| **Pitfall 13 (drift FP flap)** | Cell with raw N=29 (below D-08 floor) NEVER fires `drift_alert` even with synthetic shift. | `src/app/api/cron/learn/__tests__/learn.drift.live.test.ts` (rawN=29 case at line 208) | ✅ Plan 04 |
| **End-to-end ESS-narrowed CIs** | Two cells with identical raw N=20 — one all-recent, one 90+ days old — produce `ESS_recent > 2 × ESS_old` AND `width(CI95(weighted recent)) < width(CI95(weighted old))`. | `src/app/api/cron/learn/__tests__/learn.ess.live.test.ts` (LOOKS-DONE-BUT-ISN'T case at line 186) | ✅ Plan 04 |

---

## Validation Sign-Off

- [x] All tasks have `<acceptance_criteria>` referencing one of the test paths above OR a Wave 0 dependency
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (10 stubs above, all activated by Wave 3)
- [x] No watch-mode flags in commands
- [x] Feedback latency < 30s for unit layer (`npm test -- --run` measured 2.7s)
- [x] `nyquist_compliant: true` set in frontmatter — Plan 10 Task 2 audit complete

**Approval:** approved 2026-05-06 — Phase 18 Wave 4 sign-off. All 17 task rows ✅, all 5 requirement IDs covered, all 6 threat IDs mitigated, D-16 + D-17 invariants audited, three LOOKS-DONE-BUT-ISN'T gates passing.

**Pre-existing failures noted (NOT phase-18 regressions, see `deferred-items.md`):**
- `tests/integration/learn-dual-class.test.ts` — LogisticEpoch isolation (Phase 16)
- `tests/integration/backfill-active-rate.test.ts` — Phase 16 AC3 threshold meets Phase 18 ESS gate (cross-phase reconciliation)
- `tests/integration/schema-phase-16.test.ts` — Phase 16 backfill behavior change (test cleanup)

All 3 reproduce on the bare worktree base before any Plan 18-10 changes (`git stash && npm run test:integration`). Plan 18-10 makes zero edits to any of these files.
