---
phase: 21
plan: 21-2-04
subsystem: cron
tags: [backfill, idempotent, sector-relative, vercel-cron, bearer-auth]
requires: [21-1-02, 21-1-03]
provides:
  - /api/cron/relabel — Bearer-auth idempotent backfill of sector_etf + forward_return_raw + forward_return_sector_rel on PriceOutcome rows where sector_etf IS NULL
  - fetchSectorETFReturn helper — cached ETF price-history lookup with 7-day nearest-close tolerance
  - vercel.json cron registration at 06:15 UTC daily (post-price-followup, pre-learn)
  - 5 passing vitest cases against the route (R1-R5)
affects: [src/app/api/cron/relabel/route.ts, src/lib/data/sector-prices.ts, src/lib/data/cache/cache-keys.ts, vercel.json, src/app/api/cron/relabel/__tests__/route.test.ts]
tech-stack:
  added: []
  patterns: [idempotent-cron-via-null-filter, nearest-close-with-tolerance, take-bounded-backfill, vi-hoisted-prisma-mock]
key-files:
  created:
    - src/app/api/cron/relabel/route.ts
    - src/lib/data/sector-prices.ts
  modified:
    - src/lib/data/cache/cache-keys.ts
    - vercel.json
    - src/app/api/cron/relabel/__tests__/route.test.ts
key-decisions:
  - "Schedule: 06:15 UTC daily (between price-followup at 06:00 UTC and learn at 07:30 UTC). Sits 15 min after price-followup to catch any forward-path writes that miss sector_etf; sits 75 min before learn so the labeled rows are visible to classifyHit when learn fires."
  - "Bounded take: 5_000 rows per invocation. Large historical tables drain over multiple daily fires; each individual cron run stays under the 300s maxDuration ceiling configured globally in vercel.json."
  - "Future-dated guard (T-21-2-04-07): explicit `if (row.recorded_at.getTime() > Date.now()) continue` with counter. Defends against clock-skew, test-seeded rows, and any accidental as-of-future-time leakage where fetchSectorETFReturn could pull a 'today' price into a label marked for a future window. skipped_future_dated counter surfaces in JSON response for operator monitoring (should be 0 in steady state)."
  - "Counter shape exceeds 21-0-01's red-phase shape: { ok, scanned, labeled, skipped, fallback_to_spy, skipped_future_dated } vs the red-phase test's basic { ok, scanned, labeled, skipped }. The test uses toMatchObject (partial match) so extra fields don't break it — the operator gets richer observability."
  - "Test file rewrite (deviation): the 21-0-01 red-phase test scaffolding lacked prisma + yahoo mocks, so R3/R4/R5 timed out at 5s when hitting real Neon + Yahoo. Rewrote with vi.hoisted mocks for @/lib/db.prisma, @/lib/data/sector-mapping.getSectorETF, and @/lib/data/sector-prices.fetchSectorETFReturn. 5/5 tests pass in 15ms."
  - "fetchSectorETFReturn uses a 7-day nearest-close window (±7 days) to tolerate weekends/holidays. Wider gaps return null and trigger the SPY fallback in the relabel route."
  - "fetchSectorETFReturn caches per (ETF, YYYY-MM) at 30d TTL. Full year of cold-start fetches = 12 ETFs × 12 months = 144 yf.chart calls; subsequent runs are 100% cache hits."
requirements-completed: []
duration: 6 min
completed: 2026-05-20
---

# Phase 21 Plan 21-2-04: Idempotent Sector-Relabel Backfill Cron Summary

Shipped `/api/cron/relabel` — the Bearer-authenticated idempotent walker that populates the three Phase 21 columns on existing `PriceOutcome` rows. Snapshot-at-prediction discipline preserved via `getSectorETF({ ticker, asOfDate: report.analyzed_at })`. SPY fallback ensures no row ever stays un-graded. Future-dated guard prevents as-of-future-time leakage. Cron scheduled at 06:15 UTC daily — 15 min after price-followup, 75 min before learn.

## Execution

| Metric | Value |
|---|---|
| Duration | ~6 min |
| Tasks | 3 |
| Files created | 2 (`route.ts`, `sector-prices.ts`) |
| Files modified | 3 (`cache-keys.ts`, `vercel.json`, red-phase test file) |
| Commits | 3 atomic |
| Test delta | 6 red (Cannot find module) → 5 green (R1–R5) |

## Tasks

### Task 1: fetchSectorETFReturn helper + cache-key entries — commit `d3d6389`

Created `src/lib/data/sector-prices.ts`:

- `fetchSectorETFReturn(etf, fromDate, toDate)` → percent return or `null`
- Calls `yf.chart(etf, { period1, period2, interval: '1d' })` with 10-day buffer on each side (long weekends, partial-month windows)
- Window can cross month boundaries → iterates union of YYYY-MM keys, aggregates quotes
- `nearestClose()` picks the closest available close within ±7 calendar days (long weekend / holiday tolerance); returns `null` on wider gap
- Cached per `(ETF, YYYY-MM)` at 30d TTL — historical closes don't change, so cold-start cost is one-time

Added to `src/lib/data/cache/cache-keys.ts`:

```typescript
sectorEtfChart: (etf: string, monthKey: string) => `sector-etf-chart:${etf}:${monthKey}`,
// ...
sector_etf_chart: 30 * 86_400,
```

### Task 2: /api/cron/relabel route + revised test infrastructure — commit `c11a125`

Created `src/app/api/cron/relabel/route.ts`:

- Bearer `CRON_SECRET` gate → 401 on miss/mismatch (T-21-2-04-01)
- `prisma.priceOutcome.findMany({ where: { sector_etf: null }, take: 5_000, orderBy: { recorded_at: 'asc' } })` — idempotent + bounded
- Future-dated guard: `if (row.recorded_at.getTime() > Date.now()) { skipped_future_dated++; continue; }` (T-21-2-04-07)
- Ticker + asOfDate resolved from whichever parent attaches (`row.report` or `row.snapshot`)
- `getSectorETF({ ticker, asOfDate: fromDate })` — honors the 2018-09-28 GICS reconstitution override from 21-1-03 (T-21-2-04-08 mitigation)
- `fetchSectorETFReturn(sectorEtf, fromDate, toDate)` — null → SPY fallback path that fetches SPY return over same window and increments `fallback_to_spy` counter
- Single `prisma.priceOutcome.update` per row with all three new columns

Counter shape: `{ ok: true, scanned, labeled, skipped, fallback_to_spy, skipped_future_dated }`.

**Test file rewrite (Rule 2 — Missing Critical):** the 21-0-01 red-phase test file declared `import { GET } from '../route'` with `// @ts-nocheck` but no mocks for prisma or yahoo. After the route landed, R3/R4/R5 timed out at 5s hitting real Neon + Yahoo. Rewrote the test file with `vi.hoisted` mocks for `@/lib/db.prisma`, `@/lib/data/sector-mapping.getSectorETF`, and `@/lib/data/sector-prices.fetchSectorETFReturn`. All 5 cases now pass in 15ms.

### Task 3: vercel.json cron registration — commit `f5196ce`

Inserted exactly one entry between `price-followup` (06:00 UTC) and `learn` (07:30 UTC):

```json
{ "path": "/api/cron/relabel", "schedule": "15 6 * * *" },
```

Schedule rationale: 15 min after price-followup writes new `PriceOutcome` rows; 75 min before learn reads them through `classifyHit`. The walker has 15 min to drain whatever new backlog was produced before any other system reads it.

## Verifications

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run relabel/__tests__/route.test.ts` | 5/5 passed in 653ms |
| `node -e "JSON.parse(require('fs').readFileSync('vercel.json'))"` | exit 0 |
| Existing 4 crons (sentiment-scan, price-followup, learn, alpha-decay-watch) preserved | PASS |
| Single relabel entry (no duplicates) | PASS |
| Bearer auth gate (`Bearer ${process.env.CRON_SECRET}`) present | PASS |
| Idempotency WHERE clause (`sector_etf: null`) present | PASS |
| `asOfDate` passed to `getSectorETF` | PASS |
| All five counters present in route | PASS |
| Future-dated guard literal `row.recorded_at.getTime() > Date.now()` present | PASS |
| 7-day nearest-close tolerance in `sector-prices.ts` | PASS |

## Deviations from Plan

**[Rule 2 — Missing Critical] Add prisma + yahoo mocks to 21-0-01 test file** — Found during: Task 2 first test run. Issue: the 21-0-01 scaffolding declared `import { GET } from '../route'` with `// @ts-nocheck` but no module-level mocks; the GET handler runs through real `prisma.priceOutcome.findMany` + real `fetchSectorETFReturn` → real `yf.chart`. R3/R4/R5 all timed out at the default 5s vitest threshold. Fix: rewrote the test file with `vi.hoisted` mocks for `@/lib/db.prisma`, `@/lib/data/sector-mapping`, and `@/lib/data/sector-prices`. Files modified: `src/app/api/cron/relabel/__tests__/route.test.ts`. Verification: 5/5 pass in 15ms. Commit: `c11a125`.

**[Rule 1 — Bug] cached() signature drift (recurrence of 21-1-03 deviation)** — Found during: Task 1 typecheck. Issue: plan's example `cached(KEY, TTL, fetcher)` doesn't match upstash.ts's `cached(KEY, fetcher, { ttlSeconds })`. Fix: adapted call to live signature. Files modified: `src/lib/data/sector-prices.ts`. Verification: tsc clean. Commit: `d3d6389`.

**[Rule 1 — Bug] TS type predicate too narrow for ChartResultArrayQuote** — Found during: Task 1 typecheck. Issue: plan's `.filter((q): q is { date: Date; close: number } => ...)` predicate failed because yahoo-finance2's `ChartResultArrayQuote` type carries additional required properties (high, low, open, volume) that aren't a subtype of the narrow `{ date, close }` predicate. Fix: replaced filter+map chain with a typed accumulator (`const validated: Quote[] = []; for (const q of quotes) if (...) validated.push(...);`). Files modified: same as above. Commit: `d3d6389`.

**Total deviations:** 3 (2× Rule 1, 1× Rule 2). All auto-fixed. **Impact:** the plan's literal pseudo-code had two TypeScript bugs (cached signature, narrow type predicate) and one missing critical piece (test mock infrastructure). All three are documented for future plan authors and any mirror plans.

## Authentication Gates

None — `CRON_SECRET` available in `.env.local`; test file uses its own `TEST_SECRET` override.

## Issues Encountered

None blocking. The 3 auto-fixed deviations are documented above.

## Drain-time Estimate (Operator Guidance)

`take: 5_000` per invocation, 1 invocation per 24h via vercel cron schedule.

| Table row count | Daily backfill | Days to drain |
|---|---|---|
| ≤ 5,000 | 100% | 1 |
| 25,000 | 20% | 5 |
| 100,000 | 5% | 20 |
| 500,000 | 1% | 100 |

For an operator who wants faster initial backfill: trigger the cron manually multiple times via `curl -H "Authorization: Bearer $CRON_SECRET" https://ciphersearch.app/api/cron/relabel`. Each run will drain another 5,000 rows. Re-runs are safe (idempotent).

## v1 Limitation on Reconstitution Drift

`sector_etf` is written ONCE via `UPDATE … WHERE sector_etf IS NULL`. Once persisted, no code path re-resolves it. The 2018-09-28 GICS event is covered by the `SECTOR_RECONSTITUTIONS` override table in `getSectorETF` (21-1-03), so backfilled rows for META/GOOGL/etc. resolve to their **historically correct** sector at `Report.analyzed_at`. Any new reconstitution event after Phase 21 ships requires a code change (append to the override table) — not a re-run of the cron, because already-labeled rows are skipped (T-21-2-04-08).

## Next Phase Readiness

Wave 2 in-progress: 1 of 2 plans complete. Next: **21-2-05** (rewrite `/api/cron/price-followup` to write all four columns — `pct_change`, `sector_etf`, `forward_return_raw`, `forward_return_sector_rel` — on every new `PriceOutcome` row created by the forward path). No file overlap with this plan; can proceed immediately.

After 21-2-05 lands, both the historical backfill (this plan's cron) and the forward-going writes (21-2-05's price-followup rewrite) populate the new columns — closing the loop before Wave 3's `classifyHit` flip in 21-3-06 starts reading them.
