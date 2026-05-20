---
phase: 21
plan: 21-1-03
subsystem: data-layer
tags: [sector-relative, yahoo-finance2, upstash-cache, tdd-green-phase, reconstitution-override]
requires: [21-0-01]
provides:
  - getSectorETF — ticker → SPDR sector ETF resolver with 24h cache
  - YAHOO_SECTOR_TO_ETF map covering all 11 GICS sectors
  - SECTOR_RECONSTITUTIONS override table for 2018-09-28 Telecom→Comm-Services event
  - CACHE_KEYS.sectorEtf + TTL_SECONDS.sector_etf entries
  - 20/20 green sector-mapping vitest tests (was 19/19 red in 21-0-01)
affects: [src/lib/data/sector-mapping.ts, src/lib/data/cache/cache-keys.ts, src/lib/data/__tests__/sector-mapping.test.ts]
tech-stack:
  added: []
  patterns: [reconstitution-override-table, override-precedes-cache, vi.hoisted-mock, in-memory-cache-mock-via-__mocks__]
key-files:
  created: []
  modified:
    - src/lib/data/cache/cache-keys.ts
    - src/lib/data/sector-mapping.ts
    - src/lib/data/__tests__/sector-mapping.test.ts
key-decisions:
  - "Used vi.hoisted to make mockQuoteSummary available to vi.mock's factory. The plan's example pattern (plain const + vi.mock) doesn't work in practice — vi.mock is hoisted above imports, so the factory sees `undefined` at hoist time. vi.hoisted is the canonical Vitest 1.x+ workaround."
  - "Wired vi.mock('@/lib/data/cache/upstash') to the Phase 30 in-memory __mocks__/upstash.ts so the cache-hit test (Test 14) actually observes the second call hitting the cache. Real upstash.ts no-ops without UPSTASH env vars (graceful degrade per D-24), which would have caused the cache-hit test to fail with mockQuoteSummary called twice. The mock pattern is documented in the __mocks__/upstash.ts header (Phase 30 D-04/D-05/D-06/D-15)."
  - "Adapted cached() call to the actual upstash.ts signature `cached(key, fetcher, { ttlSeconds })`, not the plan's <interfaces> block which claimed `cached(key, ttlSec, fetcher, opts?)`. The plan's interface description was incorrect; followed the live signature. Typecheck enforces correctness."
  - "Reconstitution-override cases (META across 5 dates, GOOGL on cutover) intentionally arm NO Yahoo mock. Each asserts `expect(mockQuoteSummary).not.toHaveBeenCalled()` — proves the override branch short-circuits before any network fetch. This is a structural assertion, not just a value assertion."
  - "Six SectorETF literal references in the source (closed union + Record sentinel + try/catch fallbacks) is more than required (≥2). The closed union forces TypeScript to enforce the contract: PriceOutcome.sector_etf can ONLY ever contain one of 12 known values, blocking any future Yahoo sector string from leaking into persistence."
requirements-completed: []
duration: 6 min
completed: 2026-05-20
---

# Phase 21 Plan 21-1-03: getSectorETF Implementation Summary

Implemented `getSectorETF` (Yahoo → SPDR ETF resolution + Upstash cache + 2018-09-28 reconstitution override). Turned the 19 red-phase sector-mapping tests from 21-0-01 into 20 green (added a `mockRejectedValueOnce` test for the thrown-error → SPY fallback path). Cache infrastructure (`CACHE_KEYS.sectorEtf`, `TTL_SECONDS.sector_etf`) registered in the Phase 19-B-01 centralized namespace.

## Execution

| Metric | Value |
|---|---|
| Duration | ~6 min |
| Tasks | 3 |
| Files modified | 3 (cache-keys.ts, sector-mapping.ts, sector-mapping.test.ts) |
| Files created | 0 |
| Commits | 3 atomic |
| Test delta | 19 red (Not implemented) → 20 green (all sector + override + cache paths) |

## Tasks

### Task 1: CACHE_KEYS.sectorEtf + TTL_SECONDS.sector_etf — commit `0c9b1ef`
Two single-line additions to `src/lib/data/cache/cache-keys.ts`:
```typescript
sectorEtf: (ticker: string) => `sector-etf:${ticker.toUpperCase()}`,
// ...
sector_etf: 86_400,
```
Matches the Phase 19-B-01 namespace style (per-domain prefix; uppercase ticker; 24h TTL because sectors only change on reconstitution events, which are rare and handled by the override table).

### Task 2: Implement getSectorETF — commit `432039c`
Replaced the 21-0-01 stub body. Resolution order:

1. **Reconstitution override (snapshot-at-prediction discipline)** — when `args.asOfDate` is provided AND the ticker has an entry in `SECTOR_RECONSTITUTIONS`, walks the chronologically-sorted timeline and returns the ETF active at `asOfDate`. Bypasses the cache entirely because `(ticker, asOfDate)` is a pure-functional lookup. Source URL documented inline: <https://www.spglobal.com/spdji/en/documents/index-news-and-announcements/20180920-press-release-gics-changes.pdf>

   Override entries (2018-09-28 GICS Telecom→Comm-Services event):

   | Ticker | Pre-cutover (≤ 2018-09-28) | Post-cutover (≥ 2018-09-29) |
   |---|---|---|
   | META | XLK | XLC |
   | GOOGL | XLK | XLC |
   | GOOG | XLK | XLC |
   | NFLX | XLY | XLC |
   | DIS | XLY | XLC |
   | T (AT&T) | XLK | XLC |
   | VZ | XLK | XLC |

   Future reconstitutions append a new row with a documented source URL.

2. **Cache + Yahoo fallback** — `cached(CACHE_KEYS.sectorEtf(ticker), fetcher, { ttlSeconds: TTL_SECONDS.sector_etf })`. Fetcher:
   - `await yf.quoteSummary(ticker, { modules: ['summaryProfile'] })`
   - Extract `summary?.summaryProfile?.sector`
   - Look up in `YAHOO_SECTOR_TO_ETF` (11 GICS sectors: Technology→XLK ... Communication Services→XLC)
   - Null sector, unrecognized sector, or thrown error → `'SPY'` sentinel

The closed `SectorETF` union ensures Yahoo can never inject a string Cipher doesn't recognize (T-21-1-03-01 mitigation). `catch` swallows 429/5xx/network errors to `'SPY'` so a Yahoo outage cannot crash the diffusion engine (T-21-1-03-03 mitigation).

**Signature deviation:** the plan's `<interfaces>` block specified `cached(key, ttlSec, fetcher, opts?)` but the actual `upstash.ts` signature is `cached<T>(key, fetcher, { ttlSeconds })`. Used the actual signature; typecheck enforces correctness.

### Task 3: Wire vi.mock + drive 20/20 green — commit `1ae95c9`
Replaced the red-phase test bodies with full per-test mock wiring:

- `vi.hoisted(() => ({ mockQuoteSummary: vi.fn() }))` — needed because `vi.mock` is hoisted above all imports; a plain `const mockQuoteSummary = vi.fn()` would resolve to `undefined` when the factory runs.
- `vi.mock('yahoo-finance2', ...)` — installs a class shape `{ default: class { quoteSummary = mockQuoteSummary } }` matching the real `new YahooFinance(...)` constructor pattern used in `sector-mapping.ts`.
- `vi.mock('@/lib/data/cache/upstash', ...)` — swaps in `src/lib/data/cache/__mocks__/upstash.ts` (the Phase 30 in-memory KV store) so the cache-hit test actually observes hits. Without this, real `upstash.ts` no-ops without UPSTASH env vars (graceful degrade per D-24), which would have failed the cache-hit assertion.
- `beforeEach`: `mockQuoteSummary.mockReset()` + `__resetUpstashClientForTests()` — clean slate every case.

Test inventory:
- 11 sector mappings (each arms its own `mockResolvedValueOnce`)
- 2 SPY fallback cases: null `summary.sector` (`mockResolvedValueOnce({ summaryProfile: {} })`) + thrown 404 (`mockRejectedValueOnce`)
- 6 reconstitution-override cases: each asserts `expect(mockQuoteSummary).not.toHaveBeenCalled()` — proves the override branch short-circuits before any network fetch
- 1 cache hit: two `getSectorETF('AAPL_CACHE_PROBE')` calls, mock fired once

Final test result: **20 passed, 0 failed**.

## Verifications

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run src/lib/data/__tests__/sector-mapping.test.ts` | 20/20 passed |
| All 11 SPDR ETF strings in YAHOO_SECTOR_TO_ETF | PASS |
| SECTOR_RECONSTITUTIONS present with 7 tickers (META/GOOGL/GOOG/NFLX/DIS/T/VZ) | PASS |
| resolveReconstitutionOverride called BEFORE cached() in getSectorETF body | PASS |
| SPDR press-release source URL in source comment | PASS |
| `yf.quoteSummary` call present | PASS |
| `cached(...)` wrapper used | PASS |
| `'SPY'` literal ≥ 2 places (closed union sentinel + catch returns) | PASS (6 occurrences) |
| 'Not implemented' stub removed | PASS |
| `git diff package.json` shows zero new deps | PASS |
| `vi.mock('yahoo-finance2'` wired in test | PASS |
| ≥11 `mockResolvedValueOnce` arms | PASS (15) |
| ≥1 `mockRejectedValueOnce` for thrown-error fallback | PASS |
| Vitest output matches `(17-29) passed` regex | PASS |
| Data-layer regression sweep | 3 failures verified unrelated (source-package.test.ts live-network tests fail at HEAD too) |

## Deviations from Plan

**[Rule 1 — Bug] cached() signature was misdocumented in plan's interfaces block** — Found during: Task 2 typecheck. Issue: plan said `cached(key, ttlSec, fetcher, opts?)` (4-arg with positional ttlSec). Actual signature in `src/lib/data/cache/upstash.ts` is `cached<T>(key, fetcher, { ttlSeconds })` (3-arg with TTL inside opts). Initial paste used the plan's signature; tsc rejected with `TS2345: Argument of type 'number' is not assignable to parameter of type '() => Promise<SectorETF>'`. Fix: adapted to live signature. Files modified: `src/lib/data/sector-mapping.ts`. Verification: `npx tsc --noEmit` exits 0. Commit: `432039c`.

**[Rule 1 — Bug] vi.mock hoisting requires vi.hoisted helper** — Found during: Task 3 first run. Issue: plan's example `const mockQuoteSummary = vi.fn(); vi.mock(..., () => ({ default: class { quoteSummary = mockQuoteSummary }}))` fails at module load — `mockQuoteSummary` is `undefined` when vi.mock's factory runs at hoist time. Fix: wrapped declaration in `vi.hoisted()` so it hoists alongside the mock. Files modified: `src/lib/data/__tests__/sector-mapping.test.ts`. Verification: tests load; 19/20 pass (cache-hit pending Task 3 second deviation). Commit: `1ae95c9`.

**[Rule 2 — Missing Critical] Cache-hit test required vi.mock of upstash module** — Found during: Task 3 second run (post-vi.hoisted fix). Issue: cache-hit test was the lone failure (`mockQuoteSummary` called twice across two `getSectorETF` calls for same ticker). Real `upstash.ts` no-ops without UPSTASH env vars per D-24, so there was no cache to hit locally. The plan mentioned `__resetUpstashClientForTests` but didn't mention wiring the manual mock. Fix: added `vi.mock('@/lib/data/cache/upstash', async () => import('@/lib/data/cache/__mocks__/upstash'))` to pull in the Phase 30 in-memory cache mock. Files modified: same as above. Verification: all 20 tests pass; commit: `1ae95c9`.

**Total deviations:** 3 (2× Rule 1, 1× Rule 2). All auto-fixed within the plan's task budget. **Impact:** the plan's literal pseudo-code had two bugs (cached() signature, vi.mock hoisting) and one missing critical piece (cache mock wiring). All three are documented here for downstream plan authors and any future mirror plans.

## Authentication Gates
None.

## Issues Encountered
- Pre-existing `src/lib/data/source-package.test.ts` failures (3 tests) verified unrelated to this plan — they fail at HEAD before any 21-1-03 commits. Live-network tests failing without env configuration. Not blocking; not a regression.

## Next Phase Readiness

Wave 1 complete: 3 of 3 plans shipped. Ready for **Wave 2** parallel pair:
- **21-2-04** (idempotent `/api/cron/relabel` backfill) — can now resolve sectors for historical `PriceOutcome` rows via `getSectorETF({ ticker, asOfDate: report.analyzed_at })`. The reconstitution override table protects backfilled rows from sector-drift mislabeling.
- **21-2-05** (`/api/cron/price-followup` forward-path writer) — can now resolve "today's" sector via `getSectorETF({ ticker })` (no asOfDate; today's classification from cached Yahoo lookup).

Both Wave 2 plans modify different files, so they can execute in parallel — see plan frontmatter `depends_on: [21-1-02, 21-1-03]` for both.
