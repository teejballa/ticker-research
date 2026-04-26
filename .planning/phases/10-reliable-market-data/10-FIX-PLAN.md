---
phase: 10-reliable-market-data
plan: FIX
type: execute
status: ready-for-execution
created: 2026-04-26
---

# Phase 10 Fix Plan — Eliminate N/A Fields, Wall Street-Grade Data

## Gap Analysis (verified 2026-04-26)

The phase-10 work *partially* shipped: `fetchFinnhub()` and `fetchPolygon()` exist and run in parallel inside `collectAllData()`. But they land in `supplementary_market_data.sources[]` as **opaque text blocks** — they do NOT fill the canonical `MarketDataSection` and `FundamentalsSection` structured fields that the UI reads. Result: when `yahoo-finance2` returns null for `pe_ratio`, `eps`, `revenue`, `debt_to_equity`, `profit_margin`, `market_cap`, etc., the report renders **N/A** even though Finnhub or Polygon have the value.

**Concrete proof in code:**
- `src/lib/data/yahoo.ts:97-101` — fundamentals nulls flow straight through; no fallback
- `src/lib/data/source-package.ts:119-124` — Finnhub/Polygon only appended as supplementary text
- `src/components/ResearchReport.tsx` — reads `fundamentals.pe_ratio` directly; no source-attribution rendering

**Rejected by 10-CONTEXT.md:** Alpha Vantage (25/day cap), FMP (250/day cap), Anthropic web-search field extraction (token cost). Those rejections still hold.

## Goal

Every report for a tradable US ticker (large-cap, mid-cap, recent IPO, ETF, ADR, SPAC) renders **zero N/A** fields in `MarketData` and `Fundamentals` sections — and shows a tiny attribution badge (`via Finnhub`, `via Polygon`, `via Yahoo`) per field so the user can see where each number came from.

## Architecture

### A. Field-level merge (the core fix)

New module `src/lib/data/merge.ts`:

```ts
type FieldOrigin = 'yahoo' | 'finnhub' | 'polygon' | 'yfinance' | null;
interface AttributedField<T> { value: T | null; source: FieldOrigin }

interface MergedMarketData extends MarketDataSection {
  _field_sources: Record<keyof MarketDataSection, FieldOrigin>;
}

mergeMarketData(yahoo, finnhub, polygon, yfinance): MergedMarketData
mergeFundamentals(yahoo, finnhub, polygon, yfinance): MergedFundamentals
```

Per-field cascade order: `yahoo → finnhub → polygon → yfinance`. First non-null wins. Source recorded in `_field_sources`.

### B. Parsed Finnhub + Polygon outputs

Today `fetchFinnhub` / `fetchPolygon` return a `SupplementarySource` with a flat `text_block` string. Refactor to **also** return structured fields the merge layer can read:

```ts
interface FinnhubResult extends SupplementarySource {
  market: { price, volume, market_cap, fifty_two_week_high, fifty_two_week_low, percent_change_today, exchange };
  fundamentals: { pe_ratio, eps, revenue, debt_to_equity, profit_margin };
}
```

Field-name map (already documented in 10-CONTEXT):
- `pe_ratio` ← `peTTM` (fall back to `peAnnual`)
- `eps` ← `epsTTM` (fall back to `epsAnnual`)
- `revenue` ← `revenuePerShareTTM × shareOutstanding × 1_000_000`
- `debt_to_equity` ← `totalDebt/totalEquityQuarterly`
- `profit_margin` ← `netProfitMarginTTM` (Finnhub returns percent — divide by 100)
- `market_cap` ← `marketCapitalization × 1_000_000` (Finnhub returns millions)

### C. yfinance fallback (Python via existing edge — drop)

Per 10-CONTEXT yfinance was a third source. Phase 12 decommissioned all Python infra. **Decision: drop yfinance**. The yahoo-finance2 npm package wraps the same v1 API yfinance hits. Adding a Python sidecar reintroduces the container we just killed. Stick to yahoo + Finnhub + Polygon. If a field is still null after all three, mark it `unavailable: true` rather than render `N/A`.

### D. UI source attribution

`ResearchReport.tsx` market-data + fundamentals tables render a tiny chip next to each value:
- Yahoo (no chip — it's the default)
- Finnhub → small grey `FH` chip
- Polygon → small grey `PG` chip
- Genuinely unavailable → render `Data unavailable` greyed (no `N/A` ever)

### E. Explicit unavailability

`SourceSection` gains optional `unavailable_fields: string[]`. UI distinguishes "we tried 3 sources, none had it" (legitimate) from "we never tried" (a bug).

## Plans

### 10-FIX-01 — merge layer + structured supplementary outputs

Files:
- `src/lib/data/merge.ts` (new) — `mergeMarketData()`, `mergeFundamentals()`, `AttributedField<T>` type
- `src/lib/data/finnhub.ts` — extend return type with parsed `market` + `fundamentals` blocks (keep `text_block` for Gemini)
- `src/lib/data/polygon.ts` — same
- `src/lib/data/source-package.ts` — replace direct `settle(marketDataResult, …)` with merge call across all three sources
- `src/lib/types.ts` — add `_field_sources` to `MarketDataSection` + `FundamentalsSection`; add `unavailable_fields?: string[]`
- `src/lib/data/__tests__/merge.test.ts` (new) — unit tests covering: yahoo-wins, yahoo-null-finnhub-wins, yahoo-and-finnhub-null-polygon-wins, all-null-marked-unavailable

Acceptance:
- `npm run typecheck` passes
- New vitest unit suite passes (≥10 cases)
- AAPL run: zero nulls in market_data + fundamentals (asserted in test)

### 10-FIX-02 — UI source-attribution badges

Files:
- `src/components/ResearchReport.tsx` — render `FH`/`PG` chips beside each market_data + fundamentals field; render `Data unavailable` for genuinely-missing
- `tests/e2e/source-attribution.spec.ts` (new) — Playwright: navigate to a deterministic-fixture report, screenshot the data tables, assert chips visible

Acceptance:
- Visual checkpoint screenshot shows chips
- No `N/A` text anywhere in DOM for AAPL fixture report

### 10-FIX-03 — production smoke test (replaces 10-04)

Files:
- `scripts/smoke-phase-10.mjs` (new) — Node script that runs `collectAllData()` against 13 tickers (AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META, NFLX, JPM, V, UNH, PG, JNJ + one ETF: SPY) and prints a table of which fields filled from which source
- `.env.local.example` — confirm `FINNHUB_API_KEY` and `POLYGON_API_KEY` documented as required for full coverage

Acceptance:
- All 14 tickers produce zero nulls in market_data + fundamentals when both keys present
- Script exit code 1 if any null found
- Add to `npm run smoke` so future regressions are caught

### 10-FIX-04 — small-cap and pre-earnings edge cases

Files:
- `src/lib/data/finnhub.ts` — handle Finnhub's `0` returns (some metrics return `0` for missing) by treating `0` as missing for `pe_ratio` / `eps` (a real PE of 0 is an edge case but a `0` from Finnhub usually means "no data")
- `src/lib/data/polygon.ts` — guard against `vX/reference/financials` returning empty `results[]` for tickers without recent filings
- Test fixtures for: BRK.B (class shares with dot — URL-encode), GME (meme), ETHM (SPAC), SPY (ETF)

Acceptance:
- All 4 fixture tickers produce populated market_data
- ETF (SPY) shows `Data unavailable` for `pe_ratio` (legitimately N/A for ETFs) — not a test failure, but rendered explicitly

## Out of scope (intentionally)

- Alpha Vantage / FMP / Anthropic-search field extraction — rejected in 10-CONTEXT, still rejected
- Python yfinance fallback — would resurrect decommissioned container layer
- News / SEC / analyst / social sentiment field-level merging — those sections are narrative text, not structured fields
- Caching layer — different concern, may revisit in a later phase

## Success criteria (what must be TRUE when this phase closes)

1. AAPL, TSLA, NVDA, MSFT, GOOGL, AMZN, META, NFLX, JPM, V, UNH, PG, JNJ, SPY all produce zero nulls in `market_data` + `fundamentals` (assertion in `scripts/smoke-phase-10.mjs`)
2. ResearchReport renders source-attribution chips for any field sourced from Finnhub or Polygon
3. Genuinely-unavailable fields render `Data unavailable` — no `N/A` text anywhere
4. Full vitest suite still green
5. Playwright e2e source-attribution spec green
6. README documents `FINNHUB_API_KEY` and `POLYGON_API_KEY` as required for Wall Street-grade coverage
