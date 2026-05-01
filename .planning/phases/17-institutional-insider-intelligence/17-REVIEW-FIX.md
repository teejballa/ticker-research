---
phase: 17-institutional-insider-intelligence
fixed_at: 2026-05-01T20:05:00Z
review_path: .planning/phases/17-institutional-insider-intelligence/17-REVIEW.md
fix_scope: all
findings_in_scope: 11
fixed: 11
skipped: 0
iteration: 2
status: all_fixed
---

# Phase 17: Code Review Fix Report

**Fix scope:** Critical + Warning + Info (full sweep)
**Findings in scope:** 11 (0 critical, 6 warning, 5 info)
**Fixed:** 11
**Skipped:** 0
**Status:** all_fixed
**Iteration:** 2

## Summary

All 11 findings from `17-REVIEW.md` are resolved across two fix iterations.

- **Iteration 1** (commit hashes from prior run) addressed all six Warning-severity findings (WR-01..WR-06).
- **Iteration 2** (this run) addressed the five Info-severity findings (IN-01..IN-05) under `fix_scope: all`.

No findings were skipped. Each fix is atomic, scoped to the file(s) named in REVIEW.md, and verified via Tier 1 re-read plus Tier 2 `tsc --noEmit` (no new errors in modified files).

---

## Fixes Applied — Iteration 1 (Warning)

### WR-01: `mergeInstitutionalData` `||` drops legitimate zero values
**Commit:** `0154732`
**File:** `src/lib/data/merge.ts`
**Fix:** Replaced `||` with `??` (nullish coalescing) on six numeric fields in the dual-source merge: `total_institutional_share`, `total_institutional_share_prev`, `fund_count_current`, `fund_count_prev`, `top10_concentration_pct`, `top10_concentration_pct_prev`. Zero values from Finnhub now correctly survive the merge.

### WR-02: `backfill-smart-money` JSON null filter unreliable
**Commit:** `645203f`
**File:** `scripts/backfill-smart-money.ts`
**Fix:** Switched the four `null`-equality filters on JSON columns to `Prisma.JsonNull` so Postgres-side null detection on the `Json` columns works reliably for institutional and insider snapshots.

### WR-03: AC5 system-prompt regex uses non-existent bucket
**Commit:** `6f83022`
**File:** `tests/integration/smart-money-affects-reports.test.ts`
**Fix:** Updated the AC5 regex to match the real `InsiderBucket` vocabulary (`cluster_buying`, etc.). The previous regex pattern would have passed even if zero real bucket names appeared in the prompt.

### WR-04: `backfill-smart-money-active-rate.test.ts` uses fictitious bucket labels
**Commit:** `ad05df6`
**File:** `tests/integration/backfill-smart-money-active-rate.test.ts`
**Fix:** Aligned all test bucket labels with the canonical `InstitutionalBucket` and `InsiderBucket` string unions defined in `src/lib/types.ts`. Tests now exercise the real signal vocabulary instead of placeholder strings.

### WR-05: `gemini-analysis.test.ts` asserts misspelled `cluster_buys`
**Commit:** `c6d7ae0` (pre-existing — landed before this fix run)
**File:** `src/lib/__tests__/gemini-analysis.test.ts:130`
**Fix:** `expect(block).toContain('cluster_buying')`. Verified during iteration 1; no additional change required.

### WR-06: `engine-context.ts` cold-start writes `price_at_scan: 0`
**Commit:** `b34b51a`
**File:** `src/app/api/cron/price-followup/route.ts`
**Fix:** Added an early-skip guard so the price-followup cron does not learn from snapshots whose `price_at_scan === 0`. This is the lower-blast-radius fix recommended in the review (vs. plumbing a live-price hint into `getEngineContextForTicker`). Cold-start snapshots remain in the table but no longer pollute the learning loop.

---

## Fixes Applied — Iteration 2 (Info)

### IN-01: `LearnedPattern.signal_class` comment in schema is outdated after Phase 17
**Commit:** `a899b7e`
**File:** `prisma/schema.prisma:96`
**Applied fix:** Updated the inline comment from `// 'diffusion' | 'technical'` to `// 'diffusion' | 'technical' | 'insider' | 'institutional'` to reflect the four signal classes Phase 17 introduced. Documentation-only change — no schema migration required (`signal_class` remains `TEXT`).

### IN-02: `InsightsDashboard.tsx` hero copy hardcodes "26 tickers" and "Watchlist 26"
**Commit:** `870cb29`
**Files modified:** `src/app/api/insights/route.ts`, `src/components/InsightsDashboard.tsx`
**Applied fix:**
- Added `watchlist_size: getCurrentWatchlist().length` to the `/api/insights` JSON response (driven from the canonical rotating watchlist source).
- Added optional `watchlist_size?: number` to the `InsightsData` interface.
- Replaced the hardcoded `"Watchlist 26"` strapline with `Watchlist {data.watchlist_size ?? '—'}` (em-dash fallback for older deployments without the field).
- Replaced the hero-copy hardcoded `26 tickers` with `{data.watchlist_size ?? data.total_data_points} tickers`.

### IN-03: `detect10b5_1` always returns `false` — bucket will never fire
**Commit:** `4053708`
**File:** `scripts/backfill-smart-money.ts`
**Applied fix:** After the InsiderPattern histogram prints, emit an explicit `⚠ data_quality:` warning when zero `planned_sell_10b5_1` buckets land across the backfill run. The warning surfaces the stub-status of `detect10b5_1` (Finnhub free tier doesn't expose the indicator), advises the bucket be excluded from §3.3 ACTIVE-threshold tuning until a real source provides the flag, and points operators at the EDGAR Form 4 XML parse path as the eventual remedy. This makes a silent data-quality gap visible.

### IN-04: `fetch30dReturn` re-fetches live SPY quote per ticker
**Commit:** `60ffc8e`
**File:** `src/lib/data/institutional.ts`
**Applied fix:** Added a module-level `Map`-based cache for `fetch30dReturn` results keyed by `${ticker}|${YYYY-MM-DD}` with a 60s TTL. All exit paths (success, no quotes, no best bar, no live quote, throw) write into the cache, so repeat calls for SPY (or any ticker) within a single cron sweep reuse the cached value. Cache key includes UTC day to prevent stale 30d windows leaking across cron triggers that span a day boundary. For a 200-ticker watchlist scan, this collapses 200 redundant SPY fetches into 1.

### IN-05: `EngineCalibrationPanel` columns 3 and 4 brier cards mislabel diffusion values
**Commit:** `faa4541`
**File:** `src/components/EngineCalibrationPanel.tsx:535-540, 566-571`
**Applied fix:** Applied the short-term fix from REVIEW.md. Renamed both card labels from `Inst. Null` / `Insider Null` to `Diffusion Null`, and updated their tooltips to make explicit that the value shown is the diffusion class Brier score (institutional/insider class Brier is not yet surfaced in this view). Pre-existing design gap (the `EngineCalibration` type does not carry per-class Brier) is documented but not addressed here — that remains for a follow-up that extends the type contract.

---

## Skipped Findings

None. All 11 findings (6 warnings + 5 info) are resolved.

---

## Verification

- `git log --oneline` confirms 11 atomic `fix(17): {id} ...` commits across two iterations:
  - Iteration 1 Warnings: `0154732`, `645203f`, `6f83022`, `ad05df6`, `c6d7ae0` (pre-existing for WR-05), `b34b51a`
  - Iteration 2 Infos: `a899b7e` (IN-01), `870cb29` (IN-02), `4053708` (IN-03), `60ffc8e` (IN-04), `faa4541` (IN-05)
- Each fix is atomic and limited to the file(s) named in the corresponding REVIEW finding.
- Each iteration-2 fix verified via `npx tsc --noEmit`; no new TypeScript errors were introduced in the modified files.

## Next Steps

```
cat .planning/phases/17-institutional-insider-intelligence/17-REVIEW-FIX.md   # this report
/gsd-code-review 17                                                           # re-review (optional)
/gsd-verify-work                                                              # advance phase verification
```
