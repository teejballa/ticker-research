# Phase 19 Resume Checkpoint

**Created:** 2026-05-07 (post-crash recovery)
**Last updated:** 2026-05-09 (after 19-A-07 inline execution, all 9 in-scope tasks committed)
**Last completed plan:** 19-A-07 (Hierarchical Bayesian pooling — empirical Bayes, CORE-ML-11..14)
**Last commit on `main`:** `dc0435a` (feat(19-a-07): hierarchical-sweep-report + pooling-audit scripts)

## Resume Status (2026-05-09)

Working tree is clean. 19-A-07 closed end-to-end via inline-per-task execution:
seven atomic feat/test commits landed (`9395d2e`→`dc0435a`) + the SUMMARY/ROADMAP
docs commit. Unit suite 524/527 (3 todo) green. Plan Task 10 (operator-driven
shadow lifecycle: vercel env flip → drive workload → audit → verdict → cutover
PR → 7d hatch → flag-removal PR) is deferred — that work happens during the
v2.0 graduation window, not inside the plan execution.

Next on user "go":
1. **19-B-01** (Upstash Redis client + cache-keys + TTL config) — start of
   Wave B (data-layer modernization).
2. After 19-B-01: continue 19-B-02 → 19-C-11 (18 plans remaining after Wave A).

## Crash Context (original 2026-05-07 entry — kept for history)

The previous execution session crashed mid-way after committing the 19-A-04 GREEN code (`df0efcf`) and audit scripts (`bf691d5`), but before committing the SUMMARY.md and the ROADMAP.md `[x]` tick for 19-A-04. Both were recovered and committed in `b342f6b`.

The 2026-05-07 evening resumption then ran 19-A-05 (commit `6ee3557`) and 19-A-06 (commit `c8b953a`) cleanly via sequential subagents. Two attempts at 19-A-07 timed out at the API stream-idle limit before any commit landed — working tree is clean, no partial state to recover.

## Completed (do not re-run)

| Wave | Plan | Status | Last commit |
|------|------|--------|-------------|
| Z | 19-Z-01 features.ts flag wiring | done (SUMMARY exists) | pre-resume |
| Z | 19-Z-02 ShadowComparison schema | done (SUMMARY exists) | pre-resume |
| Z | 19-Z-03 shadow-runner + verdict CLI | done (SUMMARY exists) | pre-resume |
| Z | 19-Z-04 model-card-status | done (SUMMARY exists) | pre-resume |
| A | 19-A-01 decayWeights guard + Zod schema | done (SUMMARY exists) | `5dc247a` |
| A | 19-A-02 Brier OOS + look-ahead embargo | done (SUMMARY exists) | `80a679f` |
| A | 19-A-03 Conformal CI in EngineCalibrationPanel | done (SUMMARY exists) | `4f1ffe6` |
| A | 19-A-04 DSR + PBO + CPCV primitives | done (SUMMARY exists) | `b342f6b` |
| A | 19-A-05 Rolling 20d rank-IC monitor + alpha-decay-watch cron | done (SUMMARY exists) | `6ee3557` |
| A | 19-A-06 Calibration validation harness | done (SUMMARY exists) | `c8b953a` |
| A | 19-A-07 Hierarchical Bayesian pooling (absorbed P19) | done (SUMMARY exists) | `dc0435a` |

## Remaining (19 plans)

### Wave B — 8 plans (data-layer modernization)
- 19-B-01 — Upstash Redis client
- 19-B-02 — Retry with exponential backoff
- 19-B-03 — Tiingo provider
- 19-B-04 — Twelve Data provider
- 19-B-05 — Exa primary search
- 19-B-06 — Merge precedence rules
- 19-B-07 — Vercel Runtime Cache
- 19-B-08 — Rollout (cutover + retention)

### Wave C — 11 plans (sentiment + reasoning)
- 19-C-01 — FinSentLLM clients
- 19-C-02 — FinSentLLM ensemble
- 19-C-03 — Reputation-weighted StockTwits
- 19-C-04 — Options term-structure
- 19-C-05 — Swaggystocks + ApeWisdom
- 19-C-06 — Quiver
- 19-C-07 — Structured citations
- 19-C-08 — Chain-of-Verification (CoVe)
- 19-C-09 — Model cascade router
- 19-C-10 — Contradiction detector
- 19-C-11 — Arctic Shift backfill

## Execution Strategy

Plans declare `depends_on` in their frontmatter. Inside a wave, plans without cross-dependencies can be parallelized; across waves, Z is upstream of A/B/C, and most A/B/C plans are independent of each other.

For this resume, run plans **in numeric order** (19-A-05 → 19-C-11) so the recovery is auditable, with Wave A first (it gates the v2.0 Composite Done Gate's `model-card-status` script) before Wave B / Wave C.

If another crash occurs, the next session should:
1. Read this file
2. Read git log for `feat(19-...)` commits since `b342f6b` to identify the most recent completed plan
3. Continue from the next-numbered plan in the list above

## Hard Cleanup Gate (whole phase)

The composite done gate is `npm run model-card-status` exits zero. That script (added by 19-Z-04) reads thresholds from `config/quant-gate-thresholds.json` (written by 19-A-04's audit script) and validates that hot-path metrics live in `learning.ts` exports. Each plan's individual gate is in its frontmatter under `must_haves`.
