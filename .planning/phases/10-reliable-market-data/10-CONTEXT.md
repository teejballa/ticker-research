---
phase: 10-reliable-market-data
type: context
status: ready-for-planning
---

# Phase 10 Context: Reliable Market Data — Multi-Source Aggregation

## Problem Being Solved

Yahoo-finance2 silently returns null for many fields (P/E, EPS, revenue, market cap) even for large-cap tickers like AAPL. The current pipeline passes those nulls through to NotebookLM, which produces N/A fields in the report.

## Core Approach (DECIDED)

**Multi-source aggregation, not a fallback chain.**

Collect market data from all available sources in parallel, format each as a labeled text block, and add all to NotebookLM via `add_text()`. Gemini synthesizes across sources — no field-level merging in application code.

## Sources (DECIDED)

| Source | Limit | Key | Status | Fields |
|--------|-------|-----|--------|--------|
| **Yahoo Finance** | Unlimited | None | Existing | Price, OHLCV, some fundamentals |
| **Finnhub** | 60/min, no daily cap | `FINNHUB_API_KEY` | Confirmed working | All financial ratios — see field map below |
| **Polygon.io** | Unlimited (free = delayed) | `POLYGON_API_KEY` | Confirmed working | Ticker details, financial statements from SEC |
| **yfinance (Python)** | Unlimited | None | No key needed | Same fields as Yahoo but different parser — fills gaps |

**Rejected sources:** Alpha Vantage (25/day cap), FMP (250/day cap), Anthropic web search (too many tokens).

## Confirmed Finnhub API Field Names

Verified by live API call against AAPL (`/api/v1/stock/metric?symbol=AAPL&metric=all`):

**Profile endpoint** (`/api/v1/stock/profile2`):
- `name`, `ticker`, `exchange`, `country`, `marketCapitalization` (in millions — divide by 1000 for billions), `shareOutstanding`, `ipo`, `finnhubIndustry`

**Metric endpoint** (`/api/v1/stock/metric?metric=all`) — exact key names:
- `peAnnual`, `peTTM`, `forwardPE`
- `epsAnnual`, `epsTTM`
- `revenuePerShareAnnual`, `revenuePerShareTTM`
- `52WeekHigh`, `52WeekLow`
- `beta`
- `netProfitMarginAnnual`, `netProfitMarginTTM`
- `totalDebt/totalEquityAnnual`, `totalDebt/totalEquityQuarterly` (slash is part of key name)
- `longTermDebt/equityAnnual`
- `roaTTM`, `roeTTM`
- `pb`, `ps`
- `currentRatioAnnual`
- `dividendYieldIndicatedAnnual`
- `marketCapitalization` (also in metric, in millions)

**Quote endpoint** (`/api/v1/quote`):
- `c` (current price), `d` (change), `dp` (% change), `h` (high), `l` (low), `o` (open), `pc` (previous close)

## Polygon.io Endpoints (pending key verification)

**Ticker details** (`/v3/reference/tickers/{ticker}?apiKey={key}`):
- `results.name`, `results.market_cap`, `results.description`, `results.primary_exchange`, `results.sic_description`, `results.total_employees`, `results.share_class_shares_outstanding`

**Financial statements** (`/vX/reference/financials?ticker={ticker}&apiKey={key}`):
- Income statement: revenues, net_income_loss, basic_earnings_per_share
- Balance sheet: assets, liabilities, equity

## yfinance (Python) Integration

In `scripts/notebooklm_research.py`, after the primary market data text block, add:

```python
import yfinance as yf

def fetch_yfinance_supplement(ticker: str) -> str | None:
    try:
        t = yf.Ticker(ticker)
        info = t.info
        if not info or info.get('regularMarketPrice') is None:
            return None
        lines = [
            "=== MARKET DATA: YFINANCE (SUPPLEMENTARY) ===",
            f"Ticker: {info.get('symbol', ticker)}",
            f"Company: {info.get('longName', 'N/A')}",
            f"P/E (Trailing): {info.get('trailingPE', 'N/A')}",
            f"P/E (Forward): {info.get('forwardPE', 'N/A')}",
            f"EPS (Trailing): {info.get('trailingEps', 'N/A')}",
            f"Revenue: {info.get('totalRevenue', 'N/A')}",
            f"Market Cap: {info.get('marketCap', 'N/A')}",
            f"Profit Margin: {info.get('profitMargins', 'N/A')}",
            f"Debt/Equity: {info.get('debtToEquity', 'N/A')}",
            f"52-Week High: {info.get('fiftyTwoWeekHigh', 'N/A')}",
            f"52-Week Low: {info.get('fiftyTwoWeekLow', 'N/A')}",
            f"Beta: {info.get('beta', 'N/A')}",
            f"ROE: {info.get('returnOnEquity', 'N/A')}",
            f"ROA: {info.get('returnOnAssets', 'N/A')}",
        ]
        return "\n".join(lines)
    except Exception:
        return None
```

`yfinance` is already available in the Python environment (add to requirements.txt if not present).

## API Keys (DECIDED)

```
FINNHUB_API_KEY=d6k57lpr01qko8c3ep90d6k57lpr01qko8c3ep9g   # confirmed working
POLYGON_API_KEY=rkrrla6spqmMp04k58I0l_IaZ_y_T7IX           # confirmed working (Massive/Polygon)
```

Both are Vercel env vars (production + development). Polygon is optional — skipped gracefully if key returns 401/unknown.

## Trigger Behavior (DECIDED)

**Eager**: All supplementary sources run on every request in parallel. Not gated on Yahoo returning null.

## How Data Reaches NotebookLM (DECIDED)

Each source formatted as labeled text block, added via `add_text(notebook_id, title, text_block, wait=True)`:

```
=== MARKET DATA: FINNHUB ===
Ticker: AAPL
P/E (Annual): 34.18
EPS (Annual): 7.47
...
```

## Type System (DECIDED)

**No breaking changes to SourcePackage.**

New additive field: `supplementary_market_data: SupplementaryMarketData`

```typescript
export interface SupplementarySource {
  name: string;        // "Finnhub" | "Polygon" | "yfinance"
  fetched_at: string;
  text_block: string;
  available: boolean;
}

export interface SupplementaryMarketData {
  sources: SupplementarySource[];
}
```

yfinance runs inside the Python script and does NOT go through the TypeScript SourcePackage — it calls `add_text()` directly.

## Report UI (DECIDED)

**No UI changes.** Stats grid unchanged. Improvement shows in analysis text sections.

## What Files Change

**New files:**
- `src/lib/data/finnhub.ts` — profile2 + metric endpoints
- `src/lib/data/polygon.ts` — ticker details + financials (optional, graceful skip if key invalid)

**Modified files:**
- `src/lib/types.ts` — add `SupplementarySource`, `SupplementaryMarketData`, `supplementary_market_data` on `SourcePackage`
- `src/lib/data/source-package.ts` — parallel fetch of Finnhub + Polygon, populate `supplementary_market_data`
- `scripts/notebooklm_research.py` — add yfinance supplement fetch + `add_text()` calls for each available supplementary source
- `scripts/requirements.txt` — add `yfinance` if not present
- `.env.local.example` — `FINNHUB_API_KEY`, `POLYGON_API_KEY`

**Not changed:** `ResearchReport.tsx`, `anthropic-search.ts`, `security-type.ts`

## Success Criteria

1. AAPL research with `FINNHUB_API_KEY` set produces no N/A for P/E, EPS, revenue, market cap, profit margin, debt/equity
2. Pipeline completes normally with no API keys set (yahoo-only path unchanged)
3. Supplementary fetches complete within 5 seconds (parallel, no added sequential latency)
4. Python script calls `add_text()` for each available source including yfinance
5. `.env.local.example` documents both new keys with sign-up links
