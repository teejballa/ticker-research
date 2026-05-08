# Phase 19 Resume Checkpoint

**Created:** 2026-05-07 (post-crash recovery)
**Last completed plan:** 19-A-04 (DSR + PBO + CPCV primitives)
**Last commit on `main`:** `b342f6b` (docs(19-a-04): finalize SUMMARY + roadmap tick)

## Crash Context

The previous execution session crashed mid-way after committing the 19-A-04 GREEN code (`df0efcf`) and audit scripts (`bf691d5`), but before committing the SUMMARY.md and the ROADMAP.md `[x]` tick for 19-A-04. Both were recovered and committed in `b342f6b`.

No code is in an inconsistent state. The vitest suite passes (496 / 51 files green) and the working tree is clean as of `b342f6b`.

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

## Remaining (22 plans)

### Wave A — 3 plans
- 19-A-05 — Rolling 20d rank-IC monitor + alpha-decay-watch cron
- 19-A-06 — Calibration validation harness (reliability diagram + Hosmer-Lemeshow)
- 19-A-07 — Hierarchical Bayesian pooling (absorbed P19)

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
