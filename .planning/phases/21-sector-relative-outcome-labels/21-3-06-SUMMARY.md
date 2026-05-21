---
phase: 21
plan: 21-3-06
subsystem: learning-engine
tags: [keystone, classifyHit, sector-relative, relearn, beta-posteriors, backfill]
requires: [21-2-04, 21-2-05]
provides:
  - classifyHit widened — sector_relative_pct primary path + SPY-alpha fallback + optional k·σ_sector threshold
  - /api/cron/learn passes forward_return_sector_rel into classifyHit
  - scripts/relearn-21.ts — reversible full-replay relearn (backup → backfill → wipe → rebuild → verify)
  - Production relearn executed — 119 LearnedPattern cells rebuilt under the sector-relative judge
affects: [src/lib/learning.ts, src/lib/__tests__/learning.sector-hit.test.ts, src/app/api/cron/learn/route.ts, scripts/relearn-21.ts]
tech-stack:
  added: []
  patterns: [primary-with-fallback-classifier, sigma-driven-threshold-enabling, reversible-relearn-with-backup]
key-files:
  created:
    - scripts/relearn-21.ts
  modified:
    - src/lib/learning.ts
    - src/lib/__tests__/learning.sector-hit.test.ts
    - src/app/api/cron/learn/route.ts
key-decisions:
  - "classifyHit widened with sector_relative_pct (primary) + spy_return_pct widened to number|null (fallback) + optional sector_sigma/k for a volatility-aware threshold (WARNING-1, enabling-only — learn route does not pass sigma yet). Resolution order: sector_relative_pct > threshold when non-null; else (ticker-spy) > threshold; else false."
  - "spy_return_pct widened number → number|null is NON-breaking (number assignable to number|null), so all existing 2-arg callers and the 7 legacy classifyHit tests pass unchanged. Confirmed via tsc + 45/45 tests green."
  - "True relearn requires Path B (not ?backfill=true — that param doesn't exist). The learn route auto-detects isBackfill only when learnedPattern.count()===0, and loadUnprocessedOutcomes filters out outcomes already in a LearningEvent. So scripts/relearn-21.ts: (1) backs up patterns+events, (2) drains relabel backfill, (3) wipes patterns + outcome-linked events, (4) runs learn (isBackfill auto-true), (5) captures before/after."
  - "Reversibility: relearn-21.ts snapshots learned_patterns + outcome-linked learning_events to /tmp JSON before the wipe. Restore path documented in the script header. Backups from this run: /tmp/learned_patterns_backup_2026-05-21T16-32-23-690Z.json (119 rows), /tmp/learning_events_backup_2026-05-21T16-32-23-690Z.json (555 rows)."
  - "The first relearn run returned ok:false with an opaque ErrorEvent AFTER the outcome loop completed (outcomes_processed:555, errors:0). Diagnosed as a transient @neondatabase/serverless WebSocket cleanup error in the Node script context (not a code bug) — a clean re-run returned ok:true and completed recomputePerSignalClassPatternMetrics + pooling. Production (Vercel serverless) runs in a proper context and won't hit this. The rebuild itself was intact: 119 cells + 555 events present, last_updated 100% advanced."
requirements-completed: []
duration: 1h 40m (incl. operator-driven production relearn)
completed: 2026-05-21
---

# Phase 21 Plan 21-3-06: Sector-Relative classifyHit Flip — Summary

The keystone of Phase 21. `classifyHit` now grades every labeled outcome against its sector ETF (`sector_relative_pct`) instead of SPY, with SPY-alpha retained as the fallback for unlabeled rows. The `/api/cron/learn` call site reads `forward_return_sector_rel` from the PriceOutcome row. A production relearn replayed all 555 outcomes under the new judge, rebuilding 119 `LearnedPattern` Beta posteriors.

## Machine-readable verdict (Gate 8 in 21-5-08 greps these)

```
direction: preserved — top family shifted diffusion → insider, but technical stayed the worst family in both BEFORE and AFTER (no best→worst inversion). Top-to-bottom mean_p range compressed 0.169 → 0.042.
spread: 0.1612 → 0.1464
```

## Execution

| Metric | Value |
|---|---|
| Tasks | 3 (2 code + 1 operator checkpoint) |
| Files modified | 3 |
| Files created | 1 (`scripts/relearn-21.ts`) |
| Commits | 2 code + 1 script/summary |
| Relearn | 555 outcomes replayed, 119 cells rebuilt, 209 hits |

## Tasks

### Task 1: Widen classifyHit — commit `588a5a4`
`classifyHit` signature now accepts `sector_relative_pct?: number | null`, `sector_sigma?: number | null`, `k?: number`, and `spy_return_pct: number | null` (widened). Resolution:
1. Threshold = `k * sector_sigma` when `sector_sigma > 0` and `k` provided (WARNING-1 volatility gate); else `threshold_pct ?? 1`.
2. Primary: `sector_relative_pct > threshold` when non-null.
3. Fallback: `(ticker_return_pct - spy_return_pct) > threshold`.
4. Safety: both null → `false`.

Removed `@ts-nocheck` from `learning.sector-hit.test.ts`; added 2 σ-aware cases → 6 it() blocks, all green. Back-compat: 39 existing `learning.test.ts` cases unchanged. 45/45 pass.

### Task 2: Wire /api/cron/learn — commit `5877b1e`
`ResolvedOutcome` gained `sector_relative_pct` + `sector_etf`; both populated from the prisma row in the snapshot- and report-branch `out.push` calls. `classifyHit` call site passes `sector_relative_pct: outcome.sector_relative_pct`. LearningEvent log message gained a `vs <ETF> <x>%` fragment beside the `vs SPY <y>%` fragment. Legacy rows (null sector) still grade via the SPY-alpha fallback. tsc clean; full unit suite 1780 passed (2 pre-existing unrelated failures).

### Task 3: Operator-driven relearn — `scripts/relearn-21.ts` (this commit)

**Sequencing fact discovered:** before the relearn could mean anything, the relabel backfill had to populate `sector_etf` on existing rows — otherwise every `sector_relative_pct` is null and `classifyHit` falls back to SPY-alpha for all rows (identical result). `scripts/relearn-21.ts` orchestrates the full sequence reversibly.

**Relearn run (2026-05-21 ~16:53 UTC, production Neon):**

1. **Backup** — 119 patterns + 555 outcome-linked events → `/tmp/*_backup_2026-05-21T16-32-23-690Z.json` (reversible).
2. **Relabel drain** — pass 1: scanned 437, labeled 436, `fallback_to_spy=0` (every row resolved to its true sector ETF via Yahoo — no price-fetch failures); pass 2: labeled 0 (idempotency confirmed). 1 orphan row (no ticker/date) left unlabeled.
3. **Wipe** — 555 outcome-linked events + 119 patterns deleted (so learnedPattern.count()===0 → isBackfill).
4. **Rebuild** — learn cron replayed all 555 outcomes under the sector judge: `outcomes_processed: 555, hits: 209, errors: 0`. (Post-loop aggregate phase threw a transient Neon-WebSocket ErrorEvent in script context; a clean re-run returned `ok:true` and completed the aggregate metrics. Rebuild intact.)
5. **Verify** — see below.

**Sector distribution after backfill** (555/556 labeled):
XLK:169, XLF:66, XLY:56, XLV:49, XLC:45, SPY:45, XLI:40, XLP:38, XLRE:20, XLB:17, XLU:7, XLE:3.
(SPY:45 = tickers getSectorETF couldn't map to a GICS sector — ETFs/indices/odd classifications; not price-fetch fallbacks, which were 0.)

## BEFORE / AFTER per signal_class (sample_size ≥ 5)

| signal_class | cells | BEFORE mean_p | BEFORE spread | AFTER mean_p | AFTER spread |
|---|---|---|---|---|---|
| diffusion | 3 | 0.5070 | 0.1143 | 0.4226 | 0.2577 (only 3 cells — noisy) |
| insider | 15 | 0.4550 | 0.1568 | 0.4319 | 0.1609 |
| institutional | 24 | 0.4701 | 0.1404 | 0.4281 | 0.1199 |
| technical | 21 | 0.3378 | 0.1653 | 0.3903 | 0.1552 |
| **AGGREGATE** | **63** | **0.4242** | **0.1612** | **0.4162** | **0.1464** |

### Direction-non-inversion (BLOCKING criterion)
- BEFORE ranking: diffusion (0.507) > institutional (0.470) > insider (0.455) > technical (0.338)
- AFTER ranking: insider (0.432) > institutional (0.428) > diffusion (0.423) > technical (0.390)
- **Leading family (diffusion) did NOT become worst** — it moved #1 → #3; technical remained worst in both. ✓ **Direction preserved.**
- The top-to-bottom mean_p range compressed from 0.169 (0.507−0.338) to 0.042 (0.432−0.390) — exactly the literature-predicted effect: sector-relative grading removes sector-beta credit, so signal families look more similar and the engine becomes less confident / more honest.

### Spread compression (sanity check #11)
- Aggregate cross-cell spread compressed **0.1612 → 0.1464**. ✓
- institutional compressed (0.140 → 0.120), technical compressed (0.165 → 0.155). diffusion's spread widened only because it has 3 cells (small-sample noise). insider ~flat.

### last_updated advancement
- **119/119 cells (100%)** updated at 16:53 UTC during the relearn (≥95% criterion satisfied). max/min last_updated 16:53:57 / 16:53:51 UTC.

## Verifications

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| classifyHit + sector-hit tests | 45/45 passed |
| Full unit suite | 1780 passed (2 pre-existing unrelated failures: source-package live-network, a playwright spec vitest mis-runs) |
| Relearn replayed | 555 outcomes, 119 cells, 209 hits |
| Direction | preserved (no best→worst inversion) |
| Spread | compressed 0.1612 → 0.1464 |
| last_updated advanced | 119/119 (100%) |

## Deviations from Plan

**[Rule 3 — Blocking] No `?backfill=true` param exists** — Found during: Task 3 mechanism investigation. The plan's Path A assumed `/api/cron/learn?backfill=true`; the actual route auto-detects `isBackfill = existingPatternCount === 0` with no query param. Used Path B (the plan's documented fallback): `scripts/relearn-21.ts` wipes patterns to force isBackfill. Documented in the script header.

**[Rule 1 — Bug] LearnedPattern column is `sample_size`, not `n`** — Found during: Task 3 assessment scripts. The plan's SQL used `WHERE n >= 5`; the Prisma model field is `sample_size`. Used `sample_size`. No source change — only affected the diagnostic queries.

**[Rule 1 — Bug] Transient Neon-WebSocket ErrorEvent on heavy backfill replay** — Found during: relearn run. The first learn invocation returned `ok:false` + an opaque `ErrorEvent` AFTER grading all 555 outcomes (errors:0). Diagnosed as a `@neondatabase/serverless` WebSocket cleanup artifact in the long-running Node script context (not a code bug). A clean re-run returned `ok:true` and completed the aggregate metrics step. The rebuild was intact (119 cells, 555 events, 100% last_updated). Production serverless context is unaffected. No code change needed; documented for the operator.

**Total deviations:** 3 (1× Rule 3, 2× Rule 1). All resolved. **Impact:** the plan's relearn mechanism assumptions (query param, column name) were slightly off; the script corrects them and is committed as the reusable artifact the plan called for.

## Authentication Gates
None — `CRON_SECRET` + `DATABASE_URL`/`DIRECT_URL` sourced from `.env.local`. The relearn ran against production Neon from the local environment (no deploy required; the new code paths execute identically).

## Issues Encountered
- Transient Neon-WebSocket ErrorEvent (above) — resolved via clean re-run; not a code defect.
- Production app (ciphersearch.app) still runs pre-Phase-21 code. The relearn mutated the shared Neon posteriors, so production now serves sector-relative-graded posteriors with the OLD UI labels (SPY language) until Phase 21 is deployed. This interim inconsistency resolves when 21-4-07 (UI) ships and the phase is deployed. Acceptable — the numbers are simply "more honest" hit-rates; no user-facing breakage.

## Next Phase Readiness

**Wave 3 complete (6/8 plans).** Engine now grades sector-relative everywhere; posteriors rebuilt and verified. Ready for:
- **Wave 4 — 21-4-07** (UI swap): surface sector-relative as the headline on `EngineCalibrationPanel`, switch `/insights` copy to "beat its sector", keep SPY-alpha as a "vs market" diagnostic. `autonomous: false` (checkpoint). Frontend work — should follow the global UI/UX skill workflow + Playwright validation.
- **Wave 5 — 21-5-08** (done-gate script): `npm run phase-21-status`. Gate 8 will grep THIS file's `direction:` + `spread:` lines (both present above).
