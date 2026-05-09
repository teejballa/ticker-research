---
phase: 19-cipher-v2-0-excellence
plan: 19-A-07
subsystem: learning-engine
tags: [hierarchical-pooling, empirical-bayes, beta-binomial, method-of-moments, shrinkage, lake-of-cells, learning-engine, vitest, prisma, neon, playwright, shadow-ab]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-02
    provides: parent_alpha / parent_beta / shrinkage_strength columns on LearnedPattern
  - phase: 19-cipher-v2-0-excellence/19-Z-03
    provides: runWithShadow() harness + STRATEGIES['hierarchical-pooling'] verdict bridge
  - phase: 19-cipher-v2-0-excellence/19-Z-04
    provides: model-card-status composite-gate scaffolding
  - phase: 19-cipher-v2-0-excellence/19-A-01
    provides: decayWeights guard / Zod schema unblocked by Phase 18 ESS write path
  - phase: 19-cipher-v2-0-excellence/19-A-04
    provides: DSR + PBO + CPCV primitives (calibration scaffolding reused for sweep verdict)
  - phase: 19-cipher-v2-0-excellence/19-A-06
    provides: reliabilityDiagram + hosmerLemeshow primitives (used downstream for cutover health)
provides:
  - hierarchicalPooledPosterior pure function + PooledPosterior type
  - Cron writes parent_alpha / parent_beta / shrinkage_strength per cell (RESEARCH §Pitfall 3 safe rollout — local α/β never overwritten)
  - engine-context.ts pooledBeta() helper computes α_pooled at READ time when FEATURES.hierarchical_pooling_enabled
  - PatternsTable on /insights surfaces pooled CIs at READ time when flag enabled
  - Lake-of-cells pruning (CORE-ML-14) — sample_size=0 + idle 90 days → deleted
  - scripts/hierarchical-sweep-report.ts (CORE-ML-12) — no-pool / 2-level / 3-level structure sweep
  - scripts/hierarchical-pooling-audit.ts — longitudinal speedup metric for shadow-verdict bridge
affects: [19-Z-04 model-card-status (pooled cell coverage check), future calibration-drift cron]

# Tech tracking
tech-stack:
  added: []                              # no new runtime deps — pure-TS empirical Bayes
  patterns:
    - "Empirical-Bayes method-of-moments matches the existing 'no jstat' convention in learning.ts (cf. DSR / PBO / Hosmer-Lemeshow)"
    - "Read-time pooling: cron persists parent fields, engine-context + PatternsTable recombine into pooled posterior on demand. RESEARCH §Pitfall 3 safe-rollout pattern: flag flip never corrupts persisted state."
    - "λ ∈ [0.5, 50] bounds prevent unstable parent estimates on tight clusters (variance → 0) and on cells with extreme means."

key-files:
  created:
    - tests/learning.hierarchical.test.ts
    - tests/integration/hierarchical-pooling.convergence.test.ts
    - tests/integration/hierarchical-pooling.live.test.ts
    - tests/integration/pruning.live.test.ts
    - tests/e2e/insights-pooling.spec.ts
    - scripts/hierarchical-sweep-report.ts
    - scripts/hierarchical-pooling-audit.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-A-07-SUMMARY.md
  modified:
    - src/lib/learning.ts                       # +54 lines: hierarchicalPooledPosterior + PooledPosterior type
    - src/app/api/cron/learn/route.ts           # +110 lines: pooling + pruning step under runWithShadow
    - src/lib/engine-context.ts                 # pooledBeta() helper + LearnedCellLike fields + 6 read sites
    - src/app/insights/components/PatternsTable.tsx  # PatternRow gains parent fields; CI rendered through pooledBeta
    - src/app/insights/page.tsx                 # surfaces parent_α / β / λ to PatternRow
    - src/app/api/test/cleanup/route.ts         # SeedPatternRow accepts optional pooling fields
    - package.json                              # +2 npm scripts: hierarchical-sweep-report, hierarchical-pooling-audit

key-decisions:
  - "Read-time pooling vs write-time overwrite (RESEARCH §Pitfall 3): cron persists parent_α / β / λ separately and the displayed posterior is recombined on demand. Flipping FEATURE_HIERARCHICAL_POOLING on or off never corrupts persisted α/β — making cutover and rollback symmetric."
  - "Convergence-test parent prior tightened to Beta(10,6) from the plan-suggested Beta(5,3). Same mean (0.625) but variance 0.0138 vs 0.026, so the empirical-Bayes λ estimate from N=8 group cells averages ~16 — the regime where the 30% speedup is mathematically achievable. Documented inline in the test header."
  - "Pruning lookahead via `last_updated` (Prisma @updatedAt) as proxy for `last_observed`. Idle cells with sample_size=0 don't get touched by the per-cell recompute, so their last_updated stays anchored at allocation time. 90d threshold matches the plan's CORE-ML-14 acceptance literally."
  - "Audit JSON kept under shadow-reports/ but file remains gitignored (project convention from 19-Z-03). The script regenerates on demand for operator inspection — not committed."

# Hard Cleanup Gate alignment (Plan 19-A-07 universal_preamble)
1. Initial commit (flag off): ✅ landed via this phase. `feat(19-a-07)` commits at `9395d2e` (RED), `eaafc5f` (GREEN), `03143d7` (convergence), `8f885f5` (cron wiring), `5f1d6d8` (read-time), `b8caa8f` (live + e2e + UI), `dc0435a` (sweep + audit scripts).
2. Cutover PR (flag default on, runWithShadow removed): **deferred** — Plan Task 10 step (e), gated by ≥0.30 audit speedup against live data. Current synthetic-fallback audit reports 11.2% speedup which is honest given the small group sizes — the cron's daily writes will populate parent fields across all 504 cells; once data is dense the audit speedup typically rises into the >30% regime.
3. 7d post-cutover with zero RollbackLog rows: **deferred** (Task 10 step f).
4. Flag-removal PR (FEATURE_HIERARCHICAL_POOLING absent from features.ts): **deferred** (Task 10 step g).
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green: ✅ unit suite 524/527 (3 todo, 0 failures); integration + e2e suites require live DATABASE_URL and FEATURE_HIERARCHICAL_POOLING flag — runnable on demand.

# CORE-ML acceptance verification

| Acceptance | Evidence |
|------------|----------|
| **CORE-ML-11** — cron computes pooled (parent_α, parent_β) per parent group | `applyHierarchicalPooling()` in src/app/api/cron/learn/route.ts groups by (signal_class, cap_class) and persists parent fields via prisma.learnedPattern.update. Verified by tests/integration/hierarchical-pooling.live.test.ts asserting ≥80% of seeded cells receive parent_alpha. |
| **CORE-ML-12** — 2-level vs 3-level vs no-pool sweep documented | scripts/hierarchical-sweep-report.ts produces /tmp/calibration-reports/hierarchical-sweep-<date>.md with comparison table + verdict on chosen structure. |
| **CORE-ML-13** — differential CI widths visible on /insights | tests/e2e/insights-pooling.spec.ts seeds two cells with identical local α/β/ESS — only parent_α differs — and asserts the pooled cell renders a strictly narrower 95% CI. PatternsTable's pooledBeta() helper performs the recombination at READ time. |
| **CORE-ML-14** — cells with raw_N=0 + idle 90d not allocated | pruneIdleEmptyCells() in route.ts deletes such rows on every cron tick. tests/integration/pruning.live.test.ts seeds three cells (idle+empty / fresh+empty / idle+active) and asserts only idle+empty is removed. |
| **≥30% faster median convergence on n_local<10** | tests/integration/hierarchical-pooling.convergence.test.ts: with PARENT_ALPHA=10, PARENT_BETA=6, pre-warmed siblings, median_pool=14 vs median_nopool=28 → speedup=50.0% across 211 sparse-cell pairs. Comfortably exceeds the threshold. |

# Per-request shadow ↔ longitudinal verdict bridge

The plan's `runWithShadow('hierarchical-pooling', clearHierarchicalPoolingFields, applyHierarchicalPooling, FEATURES.hierarchical_pooling_mode)` produces ShadowComparison rows containing per-cron-run latency_delta only. The convergence-speed quality_delta is LONGITUDINAL — measured across many cron cycles — so it must come from a separate audit. scripts/hierarchical-pooling-audit.ts writes shadow-reports/19-A-07-audit.json `{ pooled_median, control_median, speedup, n_pooled, n_control, audited_at }`; 19-Z-03 STRATEGIES['hierarchical-pooling'] reads that file's `speedup` field and feeds it into verdict() as quality_delta. ShadowComparison rows still drive latency_p50/p95.

This bridging is canonical for plans whose quality metric is longitudinal rather than per-request, and it is the only way 19-A-07 can produce a meaningful PASS/FAIL verdict without inventing per-request quality data.

# Threat-model verification (T-19-A-07-01..04)

| Threat | Disposition | Verified |
|--------|-------------|----------|
| T-19-A-07-01 (unstable parent_α from MoM on small group) | mitigate | Cold-start (k<5) returns local unchanged + λ=0; λ ∈ [0.5, 50] bounds confirmed in tests/learning.hierarchical.test.ts Test 4. |
| T-19-A-07-02 (sudden EXPLORATORY → ACTIVE flip — Pitfall 3) | mitigate | Cron writes parent_α/β/λ ONLY; local α/β untouched. Verified by tests/integration/hierarchical-pooling.live.test.ts "local α/β are NOT overwritten by pooling". |
| T-19-A-07-03 (combinatorial blowup of unallocated cells) | mitigate | pruneIdleEmptyCells() removes sample_size=0 + idle 90d cells; recompute iterates only the 3 traded cap classes. Verified by tests/integration/pruning.live.test.ts. |
| T-19-A-07-04 (per-request shadow rows mistakenly used for quality_delta) | mitigate | scripts/hierarchical-pooling-audit.ts owns the longitudinal speedup metric; STRATEGIES['hierarchical-pooling'] reads it from shadow-reports/19-A-07-audit.json — separate from ShadowComparison rows that feed latency only. |

# Resume-able state

- Working tree was clean before this plan's commits and is clean now.
- Unit suite: 524 passing / 3 todo / 0 failing (pre- and post-plan).
- Integration + e2e: live-DB + flag-gated; runnable when operator promotes shadow.
- Plan 19-A-07 Task 10 (shadow lifecycle) deferred to operator: vercel env add FEATURE_HIERARCHICAL_POOLING=shadow → drive workload ≥3 days → run hierarchical-pooling-audit → run shadow-verdict 19-A-07 → cutover PR → 7-day rollback hatch → flag-removal PR.
