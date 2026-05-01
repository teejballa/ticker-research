---
phase: 17-institutional-insider-intelligence
reviewed: 2026-05-01T18:55:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - prisma/migrations/20260430_add_smart_money_columns/migration.sql
  - prisma/schema.prisma
  - scripts/backfill-smart-money.ts
  - scripts/validate-finnhub-coverage.ts
  - src/app/api/cron/learn/route.ts
  - src/app/api/cron/sentiment-scan/route.ts
  - src/app/api/insights/insider-library/route.ts
  - src/app/api/insights/institutional-library/route.ts
  - src/components/EngineCalibrationPanel.tsx
  - src/components/InsightsDashboard.tsx
  - src/components/ResearchReport.tsx
  - src/lib/__tests__/engine-context.test.ts
  - src/lib/__tests__/gemini-analysis.test.ts
  - src/lib/data/edgar.ts
  - src/lib/data/insider-classifier.ts
  - src/lib/data/insider.ts
  - src/lib/data/institutional-classifier.ts
  - src/lib/data/institutional.ts
  - src/lib/data/merge.ts
  - src/lib/engine-context.ts
  - src/lib/gemini-analysis.test.ts
  - src/lib/gemini-analysis.ts
  - src/lib/types.ts
  - tests/e2e/engine-calibration-quad.spec.ts
  - tests/e2e/insights-insider.spec.ts
  - tests/e2e/insights-institutional.spec.ts
  - tests/e2e/smart-money-asymmetric.spec.ts
  - tests/fixtures/mock-aapl-omitted-fields-report.json
  - tests/fixtures/mock-aapl-quad-class-report.json
  - tests/integration/backfill-smart-money-active-rate.test.ts
  - tests/integration/horizon-brier-smart-money.test.ts
  - tests/integration/learn-quad-class.test.ts
  - tests/integration/schema-phase-17.test.ts
  - tests/integration/sentiment-scan-smart-money.test.ts
  - tests/integration/smart-money-affects-reports.test.ts
  - tests/lib/data/edgar.test.ts
  - tests/lib/data/insider-classifier.test.ts
  - tests/lib/data/insider.test.ts
  - tests/lib/data/institutional-classifier.test.ts
  - tests/lib/data/institutional.test.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-05-01T18:55:00Z
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

Phase 17 introduces institutional ownership (13F) and insider transaction (Form 4) signal classes into the Cipher diffusion learning engine. The scope is large: new DB columns, four new fetchers, two deterministic classifiers, updated cron pipelines (sentiment-scan and learn), new engine-context fields, UI panels (QuadClassPanel, SmartMoneyIntelligence), two new insights API routes, and a backfill script. The architecture is clean and the trust boundary between engine-computed numerics and LLM-authored prose is well-enforced.

No critical issues were found. Six warnings require attention before the phase can be considered production-safe. The most significant are a logic error in the institutional merge helper that silently drops valid zero values in the dual-source fallback path, and an erroneous `insider_cluster_buy`/`cluster_buying` nomenclature mismatch between the test AC5 regex and the actual bucket vocabulary — the regex would pass even with zero real matches in the system prompt.

---

## Warnings

### WR-01: `mergeInstitutionalData` uses `||` on numeric fields, silently dropping legitimate zero values

**File:** `src/lib/data/merge.ts:212-219`

**Issue:** The dual-source merge for institutional data uses `||` (falsy-OR) for several numeric fields that are legitimately zero in real data (`total_institutional_share`, `total_institutional_share_prev`, `fund_count_current`, `fund_count_prev`, `top10_concentration_pct`, `top10_concentration_pct_prev`). When Finnhub returns `0` for any of these (e.g., a new position just opened this quarter or a fund had zero holdings in the prior period), the merge silently falls through to the EDGAR value. This can produce an incorrect merged snapshot, and for the contrarian-inflow/outflow classifier paths the `top10_concentration_pct` value matters for bucket assignment.

**Fix:**
```ts
// Replace falsy-OR with explicit null/undefined guards
total_institutional_share: f.total_institutional_share ?? e.total_institutional_share,
total_institutional_share_prev: f.total_institutional_share_prev ?? e.total_institutional_share_prev,
fund_count_current: f.fund_count_current ?? e.fund_count_current,
fund_count_prev: f.fund_count_prev ?? e.fund_count_prev,
top10_concentration_pct: f.top10_concentration_pct ?? e.top10_concentration_pct,
top10_concentration_pct_prev: f.top10_concentration_pct_prev ?? e.top10_concentration_pct_prev,
```

Note: `net_share_change` and `net_share_change_pct` are already correctly handled with direct field assignment from `f`.

---

### WR-02: `backfill-smart-money.ts` Prisma null filter `{ equals: undefined }` is unreliable

**File:** `scripts/backfill-smart-money.ts:55,103`

**Issue:** The Prisma queries use `{ equals: undefined }` to filter for null JSON columns:
```ts
where: { institutional_data: { equals: undefined } },
where: { insider_data: { equals: undefined } },
```
The behaviour of `equals: undefined` varies across Prisma adapter versions and may not reliably match `NULL` in Postgres. The secondary filter on lines 60 and 108 catches this for the backfill result set, but the initial query may return far fewer rows than expected (or all rows, depending on adapter). If the query silently returns 0 rows, the backfill completes with no writes and no error. The comment acknowledges this as "defensive" but does not treat it as the bug it is.

**Fix:**
```ts
// Use the correct Prisma null literal for JSON null comparison
where: { institutional_data: null },
// or if the adapter needs it explicitly:
where: { institutional_data: { equals: Prisma.JsonNull } },
```
Remove the secondary `.filter((s) => s.institutional_data == null)` once the query is correct, or keep it only as a belt-and-suspenders sanity assertion.

---

### WR-03: `smart-money-affects-reports.test.ts` — AC5 test regex matches wrong bucket vocabulary

**File:** `tests/integration/smart-money-affects-reports.test.ts:291-298`

**Issue:** The AC5 test at line 296 checks that the system prompt contains an `InsiderPattern` label:
```ts
expect(prompt.toLowerCase()).toMatch(
  /smart_money_concentration|insider_cluster_buy|insider_cluster_sell|c_suite_buy|10b5_1_plan|.../,
);
```
`smart_money_concentration` is an **InstitutionalBucket**, not an InsiderBucket. More importantly, `insider_cluster_buy`, `c_suite_buy`, and `10b5_1_plan` are **not actual InsiderBucket values** — the real InsiderBucket union is `cluster_buying`, `lone_buy`, `ceo_buy`, `cfo_buy`, `director_buy`, `cluster_selling`, `planned_sell_10b5_1`, `lone_sell` (from `src/lib/types.ts:428-436`). The regex will match on the `insider_cluster_buy` pattern only if that string appears, which it won't from the real classifiers. The test may produce a false-positive by matching `smart_money_concentration` from the institutional block instead of proving an insider label is present.

**Fix:**
```ts
// Use the actual InsiderBucket literal names from types.ts
expect(prompt.toLowerCase()).toMatch(
  /cluster_buying|lone_buy|ceo_buy|cfo_buy|director_buy|cluster_selling|planned_sell_10b5_1|lone_sell/,
);
```

---

### WR-04: `backfill-smart-money-active-rate.test.ts` uses stale/wrong bucket labels for institutional class

**File:** `tests/integration/backfill-smart-money-active-rate.test.ts:24-45`

**Issue:** The test seeds `INSTITUTIONAL_BUCKETS` as:
```ts
['cluster_buying', 'distribution_phase', 'accumulation_phase', 'institutional_outflow',
 'fund_rotation', 'consensus_buy', 'consensus_sell', 'smart_money_concentration']
```
The actual `InstitutionalBucket` type (from `src/lib/types.ts:465-473`) is:
```
net_accumulation | net_distribution | new_initiation | complete_exit |
smart_money_concentration | smart_money_dispersion | contrarian_inflow | contrarian_outflow
```
Six of the eight test bucket labels (`cluster_buying`, `distribution_phase`, `accumulation_phase`, `institutional_outflow`, `fund_rotation`, `consensus_buy`, `consensus_sell`) are not valid `InstitutionalBucket` values and will never be written by the real classifier. The test creates rows with these fake keys and measures ACTIVE rate against them — it proves nothing about the real cell space. A similar but lesser issue exists in `INSIDER_BUCKETS` (lines 35-45) which uses `insider_cluster_buy`, `c_suite_buy`, `10b5_1_plan`, `opportunistic_buy`, `opportunistic_sell`, `silent_period` — none of these match the real `InsiderBucket` union.

**Fix:** Replace both `INSTITUTIONAL_BUCKETS` and `INSIDER_BUCKETS` arrays with the actual bucket names from `src/lib/types.ts`.

```ts
const INSTITUTIONAL_BUCKETS = [
  'net_accumulation', 'net_distribution', 'new_initiation', 'complete_exit',
  'smart_money_concentration', 'smart_money_dispersion', 'contrarian_inflow', 'contrarian_outflow',
];
const INSIDER_BUCKETS = [
  'cluster_buying', 'lone_buy', 'ceo_buy', 'cfo_buy',
  'director_buy', 'cluster_selling', 'planned_sell_10b5_1', 'lone_sell',
];
```

---

### WR-05: `gemini-analysis.test.ts` test at line 131 asserts `cluster_buys` — wrong bucket name causes false-pass

**File:** `src/lib/__tests__/gemini-analysis.test.ts:131`

**Issue:** The test for `buildSmartMoneyContextBlock` checks:
```ts
expect(block).toContain('cluster_buys');
```
But the actual InsiderBucket value (and what `buildSmartMoneyContextBlock` emits) is `cluster_buying` (without the trailing `s`). The test will always fail unless the context block misspells the bucket name. This is a trivial typo but it means the test is either currently failing (CI blocked) or the `buildSmartMoneyContextBlock` function has a typo that differs from the `InsiderBucket` type.

**Fix:**
```ts
expect(block).toContain('cluster_buying');
```

---

### WR-06: `engine-context.ts` cold-start path creates snapshot with `price_at_scan: 0` — persists a misleading data point

**File:** `src/lib/engine-context.ts:479`

**Issue:** During cold-start (no prior snapshots exist), `getEngineContextForTicker` creates a `SentimentSnapshot` with:
```ts
price_at_scan: 0,
```
This zero price is stored in Postgres and will be used by `price-followup` cron when it computes `pct_change`. A `price_at_scan` of `0` will produce an infinite or divide-by-zero `pct_change` for any future `PriceOutcome` row linked to this snapshot. The `price-followup` logic presumably uses `pct_change = (outcome_price - price_at_scan) / price_at_scan * 100` — dividing by zero corrupts the outcome. The `quote` fetch is available during the same cold-start pass (the caller already fetches from Yahoo in the cron scan path), but `getEngineContextForTicker` itself does not have access to the live price.

**Fix:** Fetch a live price before creating the cold-start snapshot, or mark cold-start snapshots as non-learnable by setting a sentinel field. The safest minimal fix is to guard `price-followup` against a zero `price_at_scan`:
```ts
// In price-followup cron, skip outcomes whose originating snapshot has price_at_scan = 0
if (snap.price_at_scan === 0) continue;
```
Alternatively, have `getEngineContextForTicker` accept an optional `livePriceHint` parameter passed from the scan context.

---

## Info

### IN-01: `LearnedPattern.signal_class` comment in schema is outdated after Phase 17

**File:** `prisma/schema.prisma:97`

**Issue:** The inline comment reads `// 'diffusion' | 'technical'`. After Phase 17, the accepted values are `'diffusion' | 'technical' | 'insider' | 'institutional'`. This is documentation drift — the column is untyped in Postgres (plain `TEXT`) so no runtime impact, but the comment misleads future maintainers.

**Fix:**
```prisma
signal_class      String   // 'diffusion' | 'technical' | 'insider' | 'institutional'
```

---

### IN-02: `InsightsDashboard.tsx` hero copy hardcodes "26 tickers" and "Watchlist 26"

**File:** `src/components/InsightsDashboard.tsx:344,363`

**Issue:** The hero section hardcodes `"26 tickers"` and `"Watchlist 26"` as static copy. When the watchlist size changes (new tickers added, some removed), these strings become stale and show incorrect information to users.

**Fix:** Drive the watchlist count from `data.total_data_points` or add a `watchlist_size` field to the `/api/insights` response, then render it dynamically.

---

### IN-03: `detect10b5_1` in `insider.ts` always returns `false` — bucket will never fire

**File:** `src/lib/data/insider.ts:49-55`

**Issue:** The `detect10b5_1` function is a stub that always returns `false`. As a result, the `planned_sell_10b5_1` bucket will never be classified regardless of the actual transaction data. This is documented as a known limitation (the comment notes Finnhub free tier doesn't expose the flag reliably), but the stub is not surfaced to operators — the histogram output from the backfill script will show zero `planned_sell_10b5_1` hits and there is no warning emitted. This will silently skew the learning engine's bucket distribution.

**Fix:** Add a console warning when `detect10b5_1` returns `false` in the backfill script output, or emit a `data_quality` LearningEvent noting that the `planned_sell_10b5_1` bucket is effectively disabled until a data source provides the flag.

---

### IN-04: `institutional.ts` `fetch30dReturn` re-fetches live quote for every call — no caching between ticker + SPY calls

**File:** `src/lib/data/institutional.ts:64`

**Issue:** Within a single `fetchInstitutionalData` call, `fetch30dReturn` is called twice (once for the ticker, once for SPY) via `Promise.all`. Each call independently fetches a live `yf.quote(ticker)` at line 64 — so for a 200-ticker watchlist scan, 400 live-price calls are issued in addition to the 200 Finnhub calls. The `fetch30dReturn` for SPY is called once per ticker (not once per scan cycle), making this 200 redundant SPY quote fetches per scan. There is no cache layer for the SPY price within a cron run.

**Fix:** Pass the live SPY price as an optional argument to `fetchInstitutionalData` from the cron, allowing it to be fetched once per cron cycle and reused across all tickers. Alternatively, cache `yf.quote('SPY')` in a module-level variable with a 60-second TTL.

---

### IN-05: `EngineCalibrationPanel` columns 3 and 4 display diffusion `brier_in_sample` / `brier_null` — not the institutional/insider values

**File:** `src/components/EngineCalibrationPanel.tsx:536-540, 567-570`

**Issue:** The "Inst. Null" and "Insider Null" metric cards in the QuadClassPanel (columns 3 and 4) display `brier_in_sample` and `brier_null` from the top-level `calibration` object — which is the diffusion class Brier score. The institutional and insider classes have their own Brier scores stored in their `LearnedPattern` rows, but these are not surfaced in the `EngineCalibration` type or fetched at report time. As a result, both "null" cards show the same diffusion Brier value regardless of which column they appear in, which is misleading.

This is a pre-existing design gap (the `EngineCalibration` type does not carry per-class Brier), so a full fix requires a type extension. A lower-cost short-term fix is to change the card label and subValue to make it clear these are the diffusion class Brier scores:

**Fix (short-term):**
```tsx
card3={{
  label: 'Diffusion Null',   // clarify this is diffusion, not institutional
  value: formatBrier(brier_in_sample),
  subValue: brier_null != null ? `null ${formatBrier(brier_null)}` : 'n/a',
  tooltip: 'Diffusion class Brier score (institutional class Brier not yet surfaced in this view).',
}}
```

---

_Reviewed: 2026-05-01T18:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
