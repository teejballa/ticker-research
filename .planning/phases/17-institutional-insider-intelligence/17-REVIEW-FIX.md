---
phase: 17-institutional-insider-intelligence
fixed_at: 2026-05-01T19:14:00Z
fix_scope: critical_warning
findings_in_scope: 6
fixed: 6
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 17: Code Review Fix Report

**Fix scope:** Critical + Warning (Info findings deferred)
**Findings in scope:** 6 (0 critical, 6 warning)
**Fixed:** 6
**Skipped:** 0
**Status:** all_fixed

## Summary

All six Warning-severity findings from `17-REVIEW.md` are resolved. Five were fixed in this run with atomic `fix(17): WR-NN ...` commits. WR-05 (`cluster_buys` test typo) was already corrected pre-review in commit `c6d7ae0` — verified that `src/lib/__tests__/gemini-analysis.test.ts:130` now asserts `'cluster_buying'`.

The five Info findings (IN-01 through IN-05) remain unaddressed per the default `critical_warning` scope. Re-run with `--all` to fix them, or address them in a follow-up commit.

---

## Fixes Applied

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
**Fix:** `expect(block).toContain('cluster_buying')`. Verified during this run; no additional change required.

### WR-06: `engine-context.ts` cold-start writes `price_at_scan: 0`
**Commit:** `b34b51a`
**File:** `src/app/api/cron/price-followup/route.ts`
**Fix:** Added an early-skip guard so the price-followup cron does not learn from snapshots whose `price_at_scan === 0`. This is the lower-blast-radius fix recommended in the review (vs. plumbing a live-price hint into `getEngineContextForTicker`). Cold-start snapshots remain in the table but no longer pollute the learning loop.

---

## Skipped Findings

None. All six Warning-severity findings are resolved.

The five Info findings (IN-01 schema comment, IN-02 unused imports, IN-03 cron logging verbosity, IN-04 README outdated, IN-05 minor naming) are out of scope for the default `critical_warning` pass and were not modified.

---

## Verification

- `git log --oneline` confirms five `fix(17): WR-NN …` commits plus the pre-existing `fix(17-04)` for WR-05.
- Each fix is atomic and limited to the file(s) named in the corresponding REVIEW finding.
- No source files outside the REVIEW.md `files_reviewed_list` were touched.

## Next Steps

```
cat .planning/phases/17-institutional-insider-intelligence/17-REVIEW-FIX.md   # this report
/gsd-code-review 17                                                           # re-review (optional)
/gsd-verify-work                                                              # advance phase verification
```
