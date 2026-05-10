# Phase 19 Resume Checkpoint

**Created:** 2026-05-07 (post-crash recovery)
**Last updated:** 2026-05-09 (Phase 19 code-side COMPLETE — all 30 plans landed)
**Last completed plan:** 19-B-08 (Wave-B rollout coordinator — driving plan)
**Last commit on `main`:** `eeb058f` (merge(19-b-08): wave-b rollout coordinator from worktree)

## Resume Status (2026-05-09)

**Phase 19 code-side: COMPLETE.** All 30 plans (Z-01..Z-04, A-01..A-07,
B-01..B-08, C-01..C-11) landed across 124 commits. Working tree clean. Final
suite: **696 unit tests passing** (was 524 at Phase 19 start, +172 net).
Typecheck clean.

Wave A (7 plans, ML hygiene + quant + hierarchical pooling), Wave B (8 plans,
data-layer modernization with Tiingo / Twelve Data / Exa adapters + Upstash
Redis + Vercel Runtime Cache + merge-precedence ladder + rollout coordinator),
and Wave C (11 plans, sentiment + reasoning with FinSentLLM ensemble +
reputation-weighted StockTwits + options term-structure + Swaggystocks /
ApeWisdom / Quiver adapters + structured citations + CoVe two-pass + model
cascade router + contradiction detector + Arctic Shift backfill) all merged.

**What's still operator-driven** (multi-day, not in scope for inline execution):
- For each of the 15 feature flags currently in `src/lib/features.ts`:
  1. `vercel env add FEATURE_<NAME> shadow production` → trigger redeploy
  2. Drive workload 3-7 days OR ≥200 ShadowComparison rows
  3. Run `npm run shadow-verdict <plan-id>` → inspect verdict
  4. PASS → cutover PR (flag default `on`)
  5. 7-day rollback hatch (monitor RollbackLog)
  6. Flag-removal PR (delete from features.ts)
- `npm run wave-b-rollout-status` is the operator's one-stop dashboard for
  Wave B gate state at any checkpoint.
- `npm run model-card-status` is the composite Phase-19 done gate; it exits
  zero only after every flag is removed and live-data adoption thresholds
  are reached. Currently PENDING (expected — flags still off).

## Crash Context (original 2026-05-07 entry — kept for history)

The previous execution session crashed mid-way after committing the 19-A-04 GREEN code (`df0efcf`) and audit scripts (`bf691d5`), but before committing the SUMMARY.md and the ROADMAP.md `[x]` tick for 19-A-04. Both were recovered and committed in `b342f6b`.

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
