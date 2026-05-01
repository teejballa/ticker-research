---
phase: 17-institutional-insider-intelligence
plan: "01"
subsystem: data-pipeline
tags: [insider-intelligence, institutional-intelligence, fetchers, classifiers, types, merge]
dependency_graph:
  requires: []
  provides:
    - InsiderBucket type union (8 locked literals)
    - InstitutionalBucket type union (8 locked literals)
    - InsiderSnapshot interface
    - InstitutionalSnapshot interface
    - FieldOrigin extended with 'edgar'
    - fetchInsiderData(ticker, asOf?) — Finnhub primary, EDGAR fallback
    - fetchInstitutionalData(ticker, asOf?) — Finnhub primary, EDGAR fallback
    - classifyInsider(snapshot) — pure deterministic
    - classifyInstitutional(snapshot) — pure deterministic
    - fetchEdgarForm4 + fetchEdgar13F + lookupCik (stubs returning null)
    - mergeInsiderData + mergeInstitutionalData
  affects:
    - plan 17-02: schema migration imports these types for new DB columns
    - plan 17-03: sentiment-scan cron calls fetchInsiderData + fetchInstitutionalData
    - plan 17-04: engine-context lookup queries InsiderSnapshot/InstitutionalSnapshot shape
    - plan 17-05: backfill + EDGAR co-equal decision (D-09)
tech_stack:
  added: []
  patterns:
    - Finnhub primary / EDGAR fallback pattern (mirrors yahoo→finnhub→polygon cascade)
    - Pure deterministic classifiers (no I/O, no async, no LLM)
    - vi.stubGlobal('fetch') + vi.mock('yahoo-finance2') for fetcher unit tests
key_files:
  created:
    - src/lib/data/insider-classifier.ts
    - src/lib/data/institutional-classifier.ts
    - src/lib/data/edgar.ts
    - src/lib/data/insider.ts
    - src/lib/data/institutional.ts
    - scripts/validate-finnhub-coverage.ts
    - tests/lib/data/insider-classifier.test.ts
    - tests/lib/data/institutional-classifier.test.ts
    - tests/lib/data/edgar.test.ts
    - tests/lib/data/insider.test.ts
    - tests/lib/data/institutional.test.ts
  modified:
    - src/lib/types.ts (FieldOrigin + 4 new types/interfaces)
    - src/lib/data/merge.ts (2 new merge functions)
    - src/components/ResearchReport.tsx (sourceLabel accepts 'edgar')
decisions:
  - "D-09 thin-guard mode: EDGAR stays a stub; real implementation gated by live coverage measurement via scripts/validate-finnhub-coverage.ts"
  - "10b5-1 detection always returns false (Pitfall 7): Finnhub free tier doesn't expose the flag reliably; plan 17-05 audits histogram"
  - "TIMEOUT_MS = 5000 constant instead of literal — same semantic as AbortSignal.timeout(5000)"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-01T04:52:26Z"
  tasks_completed: 5
  tasks_total: 5
  files_created: 11
  files_modified: 3
---

# Phase 17 Plan 01: Fetchers, Classifiers, Types + EDGAR Stub Summary

Wave-1 plumbing for the Smart Money signal classes: types, two pure classifiers, two Finnhub fetchers, EDGAR stub, merge functions, and a D-09 coverage validator script.

## Final Type Shapes

### InsiderSnapshot (matches 17-RESEARCH §4 verbatim — no deviations)

```ts
export interface InsiderSnapshot {
  insider_bucket: InsiderBucket | null;
  distinct_buyers: number;
  distinct_sellers: number;
  net_buy_share_count: number;
  net_sell_share_count: number;
  buy_value_usd: number | null;
  sell_value_usd: number | null;
  has_ceo_buy: boolean;
  has_cfo_buy: boolean;
  has_director_buy: boolean;
  is_planned_10b5_1: boolean;
  filings_count: number;
  earliest_filing_date: string | null;
  latest_filing_date: string | null;
  data_age_days: number | null;
  computed_at: string;
  data_source: 'finnhub' | 'edgar';
  insider_sentiment_mspr: number | null;
}
```

### InstitutionalSnapshot (matches 17-RESEARCH §4 verbatim — no deviations)

```ts
export interface InstitutionalSnapshot {
  institutional_bucket: InstitutionalBucket | null;
  total_institutional_share: number;
  total_institutional_share_prev: number;
  net_share_change: number;
  net_share_change_pct: number;
  fund_count_current: number;
  fund_count_prev: number;
  fund_count_delta: number;
  top10_concentration_pct: number;
  top10_concentration_pct_prev: number;
  ticker_30d_return_pct: number | null;
  spy_30d_return_pct: number | null;
  report_date: string;
  filing_date: string;
  data_age_days: number;
  computed_at: string;
  data_source: 'finnhub' | 'edgar';
}
```

## Classifier Threshold Values (LOCKED — match 17-RESEARCH §3.3 verbatim)

### InsiderBucket classifier (priority order: sells before buys)

1. `filings_count === 0` → `null`
2. `is_planned_10b5_1` → `'planned_sell_10b5_1'`
3. `distinct_sellers >= 3 && net_sell_share_count > 0` → `'cluster_selling'`
4. `distinct_sellers === 1 && net_sell_share_count > 0 && distinct_buyers === 0` → `'lone_sell'`
5. `distinct_buyers >= 3 && net_buy_share_count > 0` → `'cluster_buying'`
6. `has_ceo_buy` → `'ceo_buy'`
7. `has_cfo_buy` → `'cfo_buy'`
8. `has_director_buy` → `'director_buy'`
9. `distinct_buyers === 1 && net_buy_share_count > 0` → `'lone_buy'`
10. default → `null`

**No deviations from locked thresholds.**

### InstitutionalBucket classifier

1. `fund_count_current === 0 && fund_count_prev === 0` → `null`
2. `fund_count_prev === 0 && fund_count_current > 0` → `'new_initiation'`
3. `fund_count_current === 0 && fund_count_prev > 0` → `'complete_exit'`
4. `top10_concentration_pct > 0.40 && delta > 0.05` → `'smart_money_concentration'`
5. `top10_concentration_pct < 0.20 && prev - current > 0.05` → `'smart_money_dispersion'`
6. `net_share_change_pct > 0.05 && tickerVsSpy < -2` → `'contrarian_inflow'`
7. `net_share_change_pct < -0.05 && tickerVsSpy > 2` → `'contrarian_outflow'`
8. `net_share_change_pct > 0.02` → `'net_accumulation'`
9. `net_share_change_pct < -0.02` → `'net_distribution'`
10. default (±0.02 deadband) → `null`

**No deviations from locked thresholds.**

## D-09 Coverage Measurement

The live coverage validator (`scripts/validate-finnhub-coverage.ts`) was NOT run during this plan execution — it requires a live `FINNHUB_API_KEY` and takes ~25 minutes to walk all tickers at 1.1s/tick. The script compiles cleanly (`npx tsc --noEmit` via full project passes).

**To record the D-09 decision for plan 17-05:** run `npx tsx scripts/validate-finnhub-coverage.ts` manually after deployment. The output will show:

```
D-09 decision: insider≥95% YES/NO, 13F≥95% YES/NO
→ EDGAR stays a thin null-guard.  (or)
→ EDGAR must become co-equal. Plan 17-05 closeout installs fast-xml-parser@4.5.1...
```

The D-09 decision must be recorded in `17-05-SUMMARY.md` before that plan closes.

## 10b5-1 Detection Audit (Pitfall 7)

`detect10b5_1()` in `insider.ts` always returns `false` per Pitfall 7: Finnhub free tier does not reliably expose the 10b5-1 flag. The `planned_sell_10b5_1` bucket exists and the classifier branch is correct — but no transactions will hit it until either:
- Finnhub free tier surfaces the flag (unlikely), OR
- EDGAR XML parsing is enabled in plan 17-05 (if D-09 says co-equal)

Plan 17-05 closeout should audit the histogram of `planned_sell_10b5_1` hits. If the count is zero despite known planned-sale events, the bucket can be deferred to a later phase.

## Test Counts

| Module | Tests | Result |
|--------|-------|--------|
| insider-classifier.test.ts | 10 | All pass |
| institutional-classifier.test.ts | 10 | All pass |
| edgar.test.ts | 3 | All pass |
| insider.test.ts | 7 | All pass |
| institutional.test.ts | 6 | All pass |
| **Total** | **36** | **36 pass** |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed FieldOrigin downstream type error in ResearchReport.tsx**
- **Found during:** Task 1 (typecheck after extending FieldOrigin)
- **Issue:** `sourceLabel` function in `ResearchReport.tsx` had a hardcoded parameter type `'yahoo' | 'finnhub' | 'polygon' | null | undefined` that did not include `'edgar'`, causing 8 TS2345 errors after FieldOrigin was extended.
- **Fix:** Updated the parameter type to include `'edgar'` and added `if (origin === 'edgar') return 'via EDGAR';` branch.
- **Files modified:** `src/components/ResearchReport.tsx`
- **Commit:** 9ec508f

## Handoff Items for Downstream Plans

### Plan 17-02 (Schema Migration)
- New Prisma columns needed: `insider_bucket`, `institutional_bucket` on `SentimentSnapshot` table (8-value enums matching the locked unions)
- `InsiderSnapshot` and `InstitutionalSnapshot` fields to persist: the full snapshot shape or a subset for the learning engine (D-12 says: bucket + classifier inputs for auditability)
- No schema changes were made in this plan — plan 17-02 owns all migrations.

### Plan 17-03 (Cron Writer — sentiment-scan)
- `fetchInsiderData(ticker)` and `fetchInstitutionalData(ticker)` are ready to import from `@/lib/data/insider` and `@/lib/data/institutional`
- Both return the typed snapshot or `null` — cron should skip DB write on `null` (same pattern as technical snapshot)
- Both classifiers are already called inside the fetchers; snapshot returned already has the bucket populated

### Plan 17-04 (Engine-Context + 4-col Panel + Smart Money section)
- `InsiderSnapshot.insider_bucket` and `InstitutionalSnapshot.institutional_bucket` are the lookup keys for the engine-context quadrant
- `EngineCalibration` extension with insider/institutional fields lands in plan 17-04 (explicitly excluded from this plan per Task 1 action notes)

### Plan 17-05 (Backfill + Closeout)
- Must run `npx tsx scripts/validate-finnhub-coverage.ts` and record D-09 decision
- If D-09 shows <95% coverage: install `fast-xml-parser@4.5.1` and flesh out `src/lib/data/edgar.ts` stubs
- Audit `planned_sell_10b5_1` bucket hits in production histogram

## Threat Flags

None — all new modules are fetcher/classifier utilities with no new network endpoints, no new auth paths, and no schema changes. Threat mitigations from the plan's STRIDE register are implemented:
- T-17-01-02: HTTP errors return null without throwing (all fetchers)
- T-17-01-03: `FINNHUB_API_KEY` referenced via env only, never echoed
- T-17-01-04: `encodeURIComponent(ticker)` on all symbol params

## Self-Check: PASSED

All 13 created/modified files exist on disk. All 5 task commits verified in git history:
- 9ec508f: feat(17-01): extend types.ts
- ab11d16: feat(17-01): insider-classifier.ts + institutional-classifier.ts
- c24b1a4: feat(17-01): edgar.ts stub + insider.ts + institutional.ts fetchers
- ca4b888: feat(17-01): extend merge.ts
- 973d838: feat(17-01): scripts/validate-finnhub-coverage.ts
