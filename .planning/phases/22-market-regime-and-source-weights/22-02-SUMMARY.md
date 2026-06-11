---
phase: 22-market-regime-and-source-weights
plan: 02
subsystem: cron + regime-backfill
tags: [regime, backfill, cron, vix, spy, classifier-reuse, p27-pattern, one-shot, checkpoint, knowable-at, wave-2]
dependency_graph:
  requires:
    - "Phase 22 Wave 0 (22-00): additive Prisma columns (regime, regime_vix_level, regime_vix_pctile, regime_ma_diff on SentimentSnapshot; regime on PerSourceIC) + Wave 0 RED stub backfill-regime.test.ts"
    - "Phase 22 Wave 1 (22-01): src/lib/regime/classify.ts — SINGLE source of truth for 4-bucket regime label, Yahoo-primary + Polygon-fallback per D-12"
    - "Phase 27 backfill cron pattern: BACKFILL_*_DISABLED + BACKFILL_*_CHECKPOINT env-var lifecycle (cited in plan as P27 precedent)"
    - "/api/cron/relabel: Bearer CRON_SECRET guard pattern reused verbatim (T-22-02-01)"
  provides:
    - "src/app/api/cron/backfill-regime/route.ts — one-shot historical regime backfill; sweeps SentimentSnapshot + PerSourceIC rows WHERE regime='ALL'"
    - "src/lib/regime/checkpoint.ts — Zod-validated checkpoint + auto-disable module backing BACKFILL_REGIME_CHECKPOINT and BACKFILL_REGIME_DISABLED env vars"
    - "vercel.json: new cron entry `/api/cron/backfill-regime` at `0 10 * * *` (daily 10:00 UTC) + maxDuration 800s"
    - "D-12 dual-provider-null skip-and-log path that leaves the row at regime='ALL' for re-try on a later pass"
  affects:
    - "Wave 3 (22-03) — source-tier-recompute reads PerSourceIC slices per regime (operator-confirmed backfill is the gating signal)"
    - "Wave 4 (22-04) — learn cron reads regime-labeled SentimentSnapshot history; D-05 transition-exclusion happens in /api/cron/learn (NOT here)"
    - "Wave 5 (22-05) — done-gate Brier-lift-per-regime needs regime labels everywhere"
tech_stack:
  added: []
  patterns:
    - "P27-style one-shot cron with env-var checkpoint (BACKFILL_REGIME_CHECKPOINT) + auto-disable sentinel (BACKFILL_REGIME_DISABLED); operator clears the sentinel for a delta re-pass"
    - "Per-tick batch budget (500 SentimentSnapshot + 500 PerSourceIC rows) bounding T-22-02-03 DoS surface; WHERE regime='ALL' filter IS the durable cursor (env-var cursor is process-local on Vercel)"
    - "Classifier delegation — backfill route calls classifyRegimeAt VERBATIM with per-row asOf (row.scanned_at / row.computed_at); no parallel/forked regime logic per CLAUDE.md rule #6 (train/serve skew defense)"
    - "Bearer CRON_SECRET guard (T-22-02-01) — copied verbatim from /api/cron/relabel:38 to mitigate spoofing"
    - "D-12 dual-provider-null discipline: when classifier returns regime='ALL' AND vix_level==null, row is logged with row_id + reason='dual_provider_null' + LEFT at regime='ALL' so the next pass naturally retries once data is available"
    - "GET handler aliased to POST so Vercel Cron (issues GET by default) and operator manual curl -X POST hit the same Bearer-guarded code path"
key_files:
  created:
    - "src/app/api/cron/backfill-regime/route.ts (249 LOC) — POST/GET handler, Bearer guard, per-tick batch, dual-provider-null skip-and-log, auto-disable on complete pass"
    - "src/lib/regime/checkpoint.ts (100 LOC) — readRegimeBackfillCheckpoint, writeRegimeBackfillCheckpoint, isRegimeBackfillDisabled, setRegimeBackfillDisabled; Zod CheckpointSchema fails fast on malformed env"
  modified:
    - "src/app/api/cron/__tests__/backfill-regime.test.ts — Wave 0 RED stub fleshed out from `it.todo` placeholders to 16 real GREEN assertions across Bearer guard, SentimentSnapshot sweep, PerSourceIC sweep, 4-column CORE-ML-08 payload, D-12 dual-provider-null skip, auto-disable, PIT correctness, maxDuration export, and checkpoint round-trip"
    - "vercel.json — appended `{ path: /api/cron/backfill-regime, schedule: 0 10 * * * }` to crons[] (29 total, well under Pro 40-cron cap); functions[] entry sets maxDuration:800 on the new route"
decisions:
  - "Reused classifyRegimeAt VERBATIM from Wave 1; no parallel regime logic in this route (CLAUDE.md rule #6 — train/serve skew defense). The route is a thin sweep + delegate."
  - "Per-tick batch budget = 500 SentimentSnapshot + 500 PerSourceIC rows (overridable via BACKFILL_REGIME_BATCH_SIZE env, clamped 1..5000). Bounded so a single invocation finishes well within maxDuration=800s even with Yahoo round-trip latency."
  - "WHERE regime='ALL' filter IS the durable cursor: re-runs naturally skip already-labeled rows. The env-var BACKFILL_REGIME_CHECKPOINT is process-local on Vercel (aids local dev + integration tests only) — explicitly documented in checkpoint.ts JSDoc."
  - "GET aliased to POST: Vercel Cron emits GET; operator emits curl -X POST. Both hit the same Bearer-guarded handler."
  - "D-12 dual-provider-null: classifier-returned regime='ALL' AND vix_level==null → row LEFT at regime='ALL', logged with row_id + reason='dual_provider_null'. NOT marked done. Re-tryable by the next pass after data resolves."
  - "Auto-disable sentinel writes ONLY when both sweeps return 0 rows in the same invocation (a true complete pass). Operator clears BACKFILL_REGIME_DISABLED to force a delta re-pass after future SentimentSnapshot writes accumulate (e.g., a stale-data fix in Wave 3)."
  - "Schedule = `0 10 * * *` (daily 10:00 UTC): well clear of /api/cron/sentiment-scan (06:00) and /api/cron/learn (07:30). Daily frequency is intentional — the cron auto-disables after one complete pass, so a low frequency is sufficient."
  - "Bearer 401 returns JSON body (not plain text) for consistency with content-type:application/json header; mirrors Cipher's other cron 401s."
  - "D-05 transition-exclusion is NOT in this wave — backfill cron writes regime labels per row; the sample-relative exclusion semantics live in /api/cron/learn (Wave 4 Task 2)."
metrics:
  duration_minutes: "~3"
  completed_date: "2026-06-11"
  tasks_completed: "2 of 3 (Task 3 awaits operator)"
  files_created: 2
  files_modified: 2
  loc_added: "~349 source + 428 test"
  tests_added: 16
requirements-completed: [CORE-ML-08, CORE-ML-10]
---

# Phase 22 Plan 02: Wave 2 — Historical Regime Backfill Cron Summary

**One-liner:** P27-style one-shot historical regime backfill cron (`/api/cron/backfill-regime`) that sweeps every legacy `SentimentSnapshot` and `PerSourceIC` row WHERE `regime='ALL'` and labels it via `classifyRegimeAt({ asOf: row.<PIT_date> })`, with Bearer CRON_SECRET guard, per-tick batch budget, D-12 dual-provider-null skip-and-log, and auto-disable sentinel — all without forking any regime logic away from Wave 1's single source of truth.

---

## Performance

- **Duration:** ~3 minutes (this executor; Wave 2 code was authored ~2026-06-10 in a parallel worktree; reset HEAD here)
- **Started:** 2026-06-10T05:07:13Z (first Wave 2 commit `5603ab0`)
- **Completed:** 2026-06-11T01:21:39Z (SUMMARY written this session)
- **Tasks:** 2 of 3 committed (Task 3 is a `checkpoint:human-action` — operator-owned)
- **Files modified:** 2 created (route.ts, checkpoint.ts), 2 modified (test file, vercel.json)

## What Shipped

### 1. `/api/cron/backfill-regime` route (Task 1)

| Concern | Implementation |
|---------|----------------|
| Auth | `Authorization: Bearer ${CRON_SECRET}` — exact copy of `/api/cron/relabel:38`. 401 on missing/wrong. T-22-02-01 mitigated. |
| Sweep #1 | `prisma.sentimentSnapshot.findMany({ where: { regime: 'ALL' }, orderBy: { scanned_at: 'asc' }, take: 500 })` |
| Sweep #2 | `prisma.perSourceIC.findMany({ where: { regime: 'ALL' }, orderBy: { computed_at: 'asc' }, take: 500 })` |
| Classifier call | `await classifyRegimeAt({ asOf: row.scanned_at })` (and `row.computed_at` for PerSourceIC). Wave 1's helper owns Yahoo + Polygon fallback + holiday-gap tolerance. |
| Snapshot UPDATE | Writes 4 columns: `regime`, `regime_vix_level`, `regime_vix_pctile`, `regime_ma_diff` per CORE-ML-08. |
| PerSourceIC UPDATE | Writes 1 column: `regime`. |
| D-12 null path | Classifier returns `regime='ALL'` + `vix_level==null` → log skip with `reason='dual_provider_null'` + `row_id`; row stays at `regime='ALL'` for next-pass retry. |
| Auto-disable | After a pass where both `findMany` calls return `[]`, `setRegimeBackfillDisabled(true)` flips `BACKFILL_REGIME_DISABLED=true`. Next invocations short-circuit with `{status:'disabled'}`. |
| GET alias | `export const GET = POST` — Vercel Cron emits GET; operator emits `curl -X POST`. Both Bearer-guarded. |
| `maxDuration` | 800s (Vercel Pro tier per RESEARCH §D / T-22-02-03 DoS mitigation). |

### 2. `src/lib/regime/checkpoint.ts` (Task 1)

| Export | Purpose |
|--------|---------|
| `readRegimeBackfillCheckpoint()` | Returns `{snapshot_id, ic_id}` from `BACKFILL_REGIME_CHECKPOINT` env (JSON). Empty/unset → both null. Zod fail-fast on malformed JSON. |
| `writeRegimeBackfillCheckpoint(state)` | JSON-encodes + assigns to `process.env`. Caller-validated via `CheckpointSchema.parse` first. |
| `isRegimeBackfillDisabled()` | `process.env.BACKFILL_REGIME_DISABLED === 'true'` (case-insensitive). |
| `setRegimeBackfillDisabled(disabled)` | Sets/unsets the sentinel. Operator clears it via Vercel env management to force a delta re-pass. |

Module-load Zod assertion mirrors `src/lib/regime/hyperparameters.ts:46` — mis-typed checkpoint envs fail loud at read time per `<investigation-mode>` skill (silent restarts are worse than a 500).

### 3. `vercel.json` cron registration (Task 2)

```jsonc
// crons[] (appended)
{ "path": "/api/cron/backfill-regime", "schedule": "0 10 * * *" }

// functions[] (per-route maxDuration override)
"src/app/api/cron/backfill-regime/**/*": { "maxDuration": 800 }
```

- Schedule: daily 10:00 UTC — clear of sentiment-scan (06:00) and learn (07:30).
- Total crons: 29 (Pro plan ceiling = 40 per `<cron-jobs>` skill rule 5).
- Per-route function override hoists this one route to 800s; the catch-all `/api/cron/**/*` 300s stays for everyone else.

## Task Commits

1. **Task 1 RED:** `5603ab0` — `test(22-02): RED — flesh out 14 assertions for backfill-regime contract`
2. **Task 1 GREEN:** `8fe38d2` — `feat(22-02): GREEN — /api/cron/backfill-regime + checkpoint module (Wave 2 Task 1)`
3. **Task 2:** `f6af451` — `feat(22-02): register backfill-regime cron + 800s maxDuration (Wave 2 Task 2)`

_(TDD-RED came first because Task 1 has `tdd="true"`. The single 8fe38d2 commit consolidated route + checkpoint module to satisfy the test contract in one atomic feat commit. No refactor pass needed — initial GREEN was already idiomatic per the plan's §Interfaces shape.)_

## Decisions Made

- **Classifier reuse over fork.** The route calls `classifyRegimeAt` per row with the row's PIT `asOf`. There is NO parallel VIX-pct or MA-cross math anywhere in this file. Train/serve skew is structurally impossible per CLAUDE.md rule #6.
- **WHERE filter as cursor.** The durable resume signal is `WHERE regime='ALL'` itself — already-labeled rows naturally drop out of the sweep on re-run. The env-var checkpoint is best-effort + process-local, primarily aiding local dev/integration tests.
- **D-12 skip-and-log, not skip-and-mark.** A dual-provider-null row stays at `regime='ALL'` so the next pass picks it up automatically once Yahoo/Polygon recover. We do NOT introduce a third sentinel state (e.g., `regime='UNKNOWN'`) that would complicate downstream Wave 3 queries.
- **Auto-disable only on a true complete pass.** Sentinel writes only when BOTH `findMany` calls return `[]` in the same invocation. A partial pass with all-null skips does NOT auto-disable (those rows will re-classify next pass).
- **Daily schedule, not minute-level.** The cron auto-disables after one complete pass — high frequency would mostly hit the short-circuit. Daily 10:00 UTC is also a quiet window vs. the other 28 crons.
- **D-05 deferred to Wave 4.** Per plan_specific_context: transition-exclusion is sample-relative and lives in `/api/cron/learn`'s posterior path. This wave only writes labels; the exclusion logic is Wave 4 Task 2.

## Deviations from Plan

None — the plan was executed exactly as written. The 3 commits land Tasks 1 + 2 verbatim against the §Interfaces shape and threat model in `22-02-PLAN.md`. No auto-fixes triggered, no architectural decisions deferred to Rule 4.

## Verification

Run from repo root:

| Gate | Command | Result |
|------|---------|--------|
| Wave 2 test suite | `npx vitest run src/app/api/cron/__tests__/backfill-regime.test.ts --reporter=dot` | **16/16 GREEN** (263 ms) |
| Bearer guard present | `grep -E "Bearer.*CRON_SECRET" src/app/api/cron/backfill-regime/route.ts` | 3 matches (JSDoc + comment + impl) |
| Single classifier import | `grep "classifyRegimeAt" src/app/api/cron/backfill-regime/route.ts` | 7 matches (import + JSDoc + 2 call sites) |
| vercel.json crons entry | `node -e "..."` parsing check | `{ path: /api/cron/backfill-regime, schedule: 0 10 * * * }` present; 29 crons total |
| Wave 2 tsc cleanliness | `npx tsc --noEmit` over Wave 2 files only | clean — the 3 remaining tsc errors are all in Wave 0 RED stubs (`learn-transition-exclusion.test.ts`, `learned-pattern-regime.test.ts`, `regime-done-gate.test.ts`) targeting **Waves 4 + 5** and explicitly out-of-scope per success criteria |

### Test-suite coverage map

The 16 GREEN assertions in `backfill-regime.test.ts` cover:

| # | Behavior | Threat / decision |
|---|----------|-------------------|
| 1-3 | 401 on missing/wrong Bearer; 200 on correct | T-22-02-01 |
| 4 | SentimentSnapshot sweep is `regime='ALL'` × `scanned_at ASC` × take=N | D-10 |
| 5 | PerSourceIC sweep is `regime='ALL'` × `computed_at ASC` × take=N | D-10 + Pitfall 4 |
| 6 | 4-column write payload — regime + 3 audit fields | CORE-ML-08 |
| 7 | Yahoo failure → Polygon fallback delegated to classifyRegimeAt (no fork) | D-12 + CLAUDE.md rule #6 |
| 8-9 | Dual-provider null → row left at `'ALL'`, logged with `dual_provider_null` | D-12 |
| 10 | Auto-disable flips `BACKFILL_REGIME_DISABLED` after complete pass; body `{status:'complete'}` | D-10 + R2 |
| 11 | Honors `BACKFILL_REGIME_DISABLED=true` short-circuit | D-10 |
| 12 | Idempotency — re-run with already-labeled rows is a no-op | T-22-02-02 |
| 13 | Per-row PIT classification (no `new Date()` wholesale) | Pitfall 1 / lookahead-bias defense |
| 14 | `maxDuration` exports 800 | T-22-02-03 |
| 15-16 | Checkpoint helper round-trip + unset-env null path | D-10 |

## Hand-off to Waves 3 + 4

> **Once the backfill completes (Task 3 operator-confirmed), `SentimentSnapshot` and `PerSourceIC` are regime-labeled and Waves 3 (source-tier-recompute) and Wave 4 (learn cron hierarchical FDR + D-05 transition exclusion) can safely read per-regime.**

Specifically:

- **Wave 3 (22-03)** — `/api/cron/source-tier-recompute` can read `PerSourceIC` slices per `(source_id, regime)`. Without this backfill, ~100% of rows would carry `regime='ALL'` (cold-start default from Wave 0) and the EB shrinkage would be statistically meaningless (Pitfall 4 in RESEARCH).
- **Wave 4 (22-04)** — `/api/cron/learn` posterior path reads regime-labeled `SentimentSnapshot` history. D-05 transition-exclusion (sample-relative, NOT row-relative) is implemented in Wave 4 Task 2, not here.
- **Wave 5 (22-05)** — Brier-lift-per-regime done-gate needs the full historical corpus labeled to compute meaningful per-regime lift over the 3-decade backtest horizon.

## Issues Encountered

None — Wave 2 commits were already on `worktree-agent-ad2cd8f9a69617723`; this executor reset its branch head to that work, verified all gates green, and authored the SUMMARY. The prior worktree did the implementation atomically against the test contract; no rework or debugging cycle was needed in this executor session.

## Task 3 — Awaiting Operator (checkpoint:human-action)

Task 3 is a `checkpoint:human-action` per the plan. The executor explicitly does NOT trigger the backfill. The operator:

1. Confirms deployment of `f6af451` (or descendant) to Vercel preview or production.
2. Invokes `curl -X POST "$VERCEL_URL/api/cron/backfill-regime" -H "Authorization: Bearer $CRON_SECRET"` (or waits for the 10:00 UTC scheduled invocation).
3. Repeats every ~30 seconds until response carries `{"status":"complete"}` (auto-disable signal).
4. Verifies coverage via Neon SQL:
   ```sql
   SELECT regime, COUNT(*) FROM "sentiment_snapshots" GROUP BY regime;
   SELECT regime, COUNT(*) FROM "per_source_ic"      GROUP BY regime;
   ```
   Expected: distribution across `bull-low-vol`, `bull-high-vol`, `bear-low-vol`, `bear-high-vol`, with a small residual `'ALL'` for dual-provider-null rows (D-12).
5. Inspects logs for `dual_provider_null` frequency: `vercel logs --follow | grep dual_provider_null`. If >5% of rows, file a Wave 2 bug instead of confirming.
6. Confirms sentinel: `vercel env ls | grep BACKFILL_REGIME_DISABLED` shows `true`.

**Resume signal:** Type `backfilled` once the per-regime distribution is plausible AND auto-disable is set.

## User Setup Required

None — the cron uses existing `CRON_SECRET` (already provisioned across all Vercel scopes per `feedback_env_parity`) and existing Yahoo/Polygon paths (no new provider keys).

## Next Phase Readiness

- **Waves 3 + 4 are BLOCKED on Task 3** (operator-confirmed backfill completion). Per R2 acceptance.
- Once unblocked, `Wave 3 (22-03)` ships the source-tier-regime recompute and `Wave 4 (22-04)` ships the learn-cron regime-aware posterior + transition exclusion.
- No infrastructure changes needed before Wave 3.

## Self-Check

Verifying claimed artifacts + commits:

- File `src/app/api/cron/backfill-regime/route.ts` — **FOUND** (249 LOC)
- File `src/lib/regime/checkpoint.ts` — **FOUND** (100 LOC)
- File `src/app/api/cron/__tests__/backfill-regime.test.ts` — **FOUND** (455 LOC, 16 tests GREEN)
- `vercel.json` contains `/api/cron/backfill-regime` entry — **FOUND** (schedule `0 10 * * *`)
- `vercel.json` contains `maxDuration: 800` override for backfill-regime route — **FOUND**
- Commit `5603ab0` (RED test) — **FOUND**
- Commit `8fe38d2` (GREEN route + checkpoint) — **FOUND**
- Commit `f6af451` (vercel.json cron registration) — **FOUND**

## Self-Check: PASSED

---
*Phase: 22-market-regime-and-source-weights*
*Plan: 02*
*Completed: 2026-06-11 (Tasks 1-2 committed; Task 3 awaiting operator)*
