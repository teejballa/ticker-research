# Phase 1: Data Pipeline - Research

**Researched:** 2026-03-11
**Domain:** Financial data collection, ticker search UI, structured source packaging
**Confidence:** MEDIUM-HIGH (core stack HIGH; unofficial API reliability MEDIUM)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Ticker search experience**
- User can search by company name OR ticker symbol (e.g., "Apple" resolves to AAPL)
- Live autocomplete dropdown appears as user types — no submit required to see results
- Each result in the dropdown shows: ticker + company name + current price (e.g., AAPL — Apple Inc. — $189.42)
- Invalid/unknown ticker: shake animation on the input field + inline error message below it

**Chart confirmation view**
- Simple line chart, 1-month time range
- Shown alongside the chart before confirming: company name + ticker, current price + % change today, market cap, exchange + sector
- Two action buttons: Confirm (proceed to research) and Search again (return to ticker input)

**Data sources**
- **yahoo-finance2** (npm, free, no API key required) — covers: market_data, fundamentals
- **Anthropic web search** (uses ANTHROPIC_API_KEY) — covers: news headlines, SEC filing summaries, analyst ratings/commentary, social/media sentiment
- No Finnhub, no SEC EDGAR direct integration, no Reddit/Stocktwits API keys required

**API key configuration**
- Single `.env` file — only `ANTHROPIC_API_KEY` required
- yahoo-finance2 needs no key — free unofficial npm package
- Agents must document required env vars clearly in setup instructions

**Source package format**
- Output is a **single JSON object** — all sections in one payload
- Written to a **temp file** during the session, automatically deleted when done — never committed to the repo
- Six sections in the JSON:
  - `market_data` — price, volume, 52-week high/low, market cap (yahoo-finance2)
  - `fundamentals` — P/E ratio, revenue, EPS, debt ratios (yahoo-finance2)
  - `news` — recent headlines + URLs, past 7-30 days (Anthropic web search)
  - `analyst_sentiment` — Buy/Hold/Sell breakdown, price targets, analyst commentary (Anthropic web search)
  - `sec_filing_summary` — key points from most recent 10-K and 10-Q (Anthropic web search)
  - `social_sentiment` — Reddit/Stocktwits discussion tone and signals (Anthropic web search)
- Each section includes a `collected_at` timestamp (DATA-07)

**Frontend/UI approach**
- All frontend, UI, and design work must use the `/frontend-design` skill — this is a locked project rule (per CLAUDE.md memory)

### Claude's Discretion
- Exact loading state / skeleton UI during data collection
- Debounce timing for the autocomplete dropdown
- Temp file naming convention and cleanup mechanism
- Error handling for individual failed data sources (e.g., Anthropic web search rate limit)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TICK-01 | User can enter a ticker symbol (e.g., AAPL, TSLA) to initiate research | yahoo-finance2 `search()` method handles both ticker and company name input |
| TICK-02 | System displays a chart preview for the entered ticker so user can confirm the correct stock | yahoo-finance2 `chart()` method + lightweight-charts v5.1 for rendering |
| TICK-03 | User must confirm the correct stock before research pipeline begins | Two-step UI flow: autocomplete → chart confirmation → confirm button triggers pipeline |
| DATA-01 | System retrieves current market data: price, volume, 52-week high/low, market cap | yahoo-finance2 `quote()` and `quoteSummary(['price'])` modules |
| DATA-02 | System retrieves company fundamentals: P/E ratio, revenue, earnings, EPS, debt ratios | yahoo-finance2 `quoteSummary(['financialData', 'defaultKeyStatistics', 'incomeStatementHistory'])` |
| DATA-03 | System retrieves recent news headlines from the past 7-30 days via Anthropic web search | Anthropic Messages API with `web_search_20250305` tool, targeted query per ticker |
| DATA-04 | System retrieves SEC filing summaries (recent 10-K and 10-Q content) via Anthropic web search | Anthropic Messages API with `web_search_20250305` tool, SEC-focused query |
| DATA-05 | System retrieves analyst ratings and consensus via Anthropic web search | Anthropic Messages API with `web_search_20250305` tool, analyst consensus query |
| DATA-06 | System retrieves media and social sentiment signals via Anthropic web search | Anthropic Messages API with `web_search_20250305` tool, sentiment-focused query |
| DATA-07 | All retrieved sources carry a collection timestamp | `collected_at: new Date().toISOString()` added to each section at collection time |
| DATA-08 | Claude Code SDK orchestrates all data collection and structures inputs as a source package | Pipeline: yahoo-finance2 calls + Anthropic API calls → JSON source package → temp file |
</phase_requirements>

---

## Summary

Phase 1 builds the full data pipeline for the Ticker Research Assistant. It has two distinct sub-problems: (1) the ticker search and confirmation UI, and (2) the parallel data collection pipeline that produces a structured JSON source package. Both are well-supported by the locked stack decisions.

**yahoo-finance2** (v3.13.2, ~75k weekly downloads as of March 2026, actively maintained) covers all structured financial data needs: ticker search/autocomplete via `search()`, 1-month OHLCV history for the chart via `chart()`, current quote data via `quote()`, and fundamentals via `quoteSummary()`. The library is unofficial and Yahoo can break or rate-limit it at any time — but it has been stable since 2013 and is the correct choice for a prototype. The key mitigation is graceful degradation with clear error messages.

**Anthropic web search** (tool type `web_search_20250305`, $10/1000 searches) replaces the previously considered Finnhub/SEC EDGAR/Reddit APIs. It covers news, SEC summaries, analyst consensus, and social sentiment through targeted prompts rather than raw API calls. This is a cleaner architecture: fewer credentials, fewer failure modes, and the model handles parsing/extraction. Each of the four web-sourced sections becomes a focused Anthropic API call with a distinct search query.

The frontend — ticker autocomplete input and chart confirmation view — is well-understood React/Next.js territory. The locked decision to use the `/frontend-design` skill means UI implementation should defer to that skill's patterns. The debounce + autocomplete pattern is a standard React pattern using `useDebouncedCallback` (from `use-debounce` library) or `useCallback` + lodash debounce.

**Primary recommendation:** Build the pipeline as a Next.js Route Handler (`/api/research/[ticker]`) that runs yahoo-finance2 calls and Anthropic API calls in parallel, assembles the source package JSON, writes it to a temp file using `os.tmpdir()` + `fs.mkdtemp()`, and returns the file path to the frontend. The frontend calls confirm → triggers the API route → polls/streams progress.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15 (App Router) | Full-stack framework — UI + API routes | Handles both local dev (`next dev`) and Vercel deployment; React 19 support; TypeScript-first; API Route Handlers replace need for separate backend |
| React | 19 (bundled with Next.js 15) | UI components | Ships with Next.js; component model fits ticker search + chart confirmation flow |
| TypeScript | 5.x (bundled) | Type safety | Prevents data shape bugs in financial data transformations; yahoo-finance2 ships full TS types |
| yahoo-finance2 | 3.13.2 | All structured financial data | Free, no API key, broad coverage; `search()` + `quote()` + `quoteSummary()` + `chart()` cover all Phase 1 data requirements |
| @anthropic-ai/sdk | Latest | Anthropic Messages API client | Official SDK for calling Claude with web_search tool; needed for news/analyst/SEC/sentiment collection |
| lightweight-charts | 5.1.0 | Chart rendering for ticker confirmation | TradingView's Apache 2.0 library; purpose-built for financial OHLCV charts; line + area series support |
| dotenv | Latest | Environment variable management | ANTHROPIC_API_KEY loaded from `.env`; never committed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| use-debounce | Latest | Debounced autocomplete input | Wrap search input to debounce calls to yahoo-finance2 `search()` — standard pattern |
| tmp or @types/node fs.mkdtemp | Built-in / npm | Temp file creation and cleanup | OS-native temp directory with auto-cleanup on process exit |
| zod | Latest | Source package schema validation | Validate the assembled JSON source package shape before writing to temp file |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| yahoo-finance2 | Polygon.io Starter ($29/mo) | Polygon is more reliable with official SLA; use it when yahoo-finance2 rate limits become a problem in production |
| Anthropic web search | Finnhub + SEC EDGAR + Reddit APIs | 3 separate credentials and API clients vs. 1 Anthropic call; web search is simpler but costs $0.01/search |
| lightweight-charts | Recharts / Chart.js | General-purpose charts; lightweight-charts is purpose-built for OHLCV financial data with correct axis scaling |
| use-debounce | lodash.debounce + useCallback | Both work; `use-debounce` is lighter and purpose-built for React |

**Installation:**
```bash
npm install yahoo-finance2 @anthropic-ai/sdk lightweight-charts use-debounce zod dotenv
npm install -D typescript @types/node
# Note: Next.js, React, TypeScript already installed via create-next-app
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── page.tsx                   # Ticker search entry point
│   ├── research/
│   │   └── [ticker]/
│   │       └── page.tsx           # Chart confirmation + pipeline trigger
│   └── api/
│       ├── ticker/
│       │   └── search/route.ts    # GET /api/ticker/search?q= (autocomplete)
│       │   └── chart/route.ts     # GET /api/ticker/chart?symbol= (1mo OHLCV)
│       └── research/
│           └── [ticker]/route.ts  # POST /api/research/[ticker] (full pipeline)
├── lib/
│   ├── data/
│   │   ├── yahoo.ts               # yahoo-finance2 wrappers (search, quote, chart, fundamentals)
│   │   ├── anthropic-search.ts    # Anthropic web search helpers (news, analyst, SEC, social)
│   │   └── source-package.ts      # Assembles + validates source package JSON
│   ├── temp-file.ts               # Temp file write/cleanup helpers
│   └── types.ts                   # SourcePackage, MarketData, Fundamentals types
└── components/
    ├── TickerSearch.tsx            # Autocomplete input (uses /frontend-design skill)
    ├── ChartConfirmation.tsx       # Chart + metadata + Confirm/Search Again buttons
    └── SourceChart.tsx             # lightweight-charts wrapper (useEffect + createChart)
```

### Pattern 1: Parallel Data Collection with Promise.allSettled
**What:** Run yahoo-finance2 and all four Anthropic web search calls concurrently. Collect results with `Promise.allSettled` so a single failure does not abort the entire pipeline.
**When to use:** Always — sequential calls at 1-3s each would make the pipeline unacceptably slow.
**Example:**
```typescript
// lib/data/source-package.ts
async function collectAllData(ticker: string): Promise<SourcePackage> {
  const [marketData, fundamentals, news, analystSentiment, secFiling, socialSentiment] =
    await Promise.allSettled([
      fetchMarketData(ticker),        // yahoo-finance2
      fetchFundamentals(ticker),      // yahoo-finance2
      fetchNews(ticker),              // Anthropic web search
      fetchAnalystSentiment(ticker),  // Anthropic web search
      fetchSecFilingSummary(ticker),  // Anthropic web search
      fetchSocialSentiment(ticker),   // Anthropic web search
    ]);

  return {
    ticker,
    collected_at: new Date().toISOString(),
    market_data: marketData.status === 'fulfilled' ? marketData.value : null,
    fundamentals: fundamentals.status === 'fulfilled' ? fundamentals.value : null,
    news: news.status === 'fulfilled' ? news.value : null,
    analyst_sentiment: analystSentiment.status === 'fulfilled' ? analystSentiment.value : null,
    sec_filing_summary: secFiling.status === 'fulfilled' ? secFiling.value : null,
    social_sentiment: socialSentiment.status === 'fulfilled' ? socialSentiment.value : null,
    collection_errors: [marketData, fundamentals, news, analystSentiment, secFiling, socialSentiment]
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason?.message),
  };
}
```

### Pattern 2: Anthropic Web Search Tool Call
**What:** Use the Anthropic Messages API with `web_search_20250305` tool to collect a specific category of information about a ticker.
**When to use:** For all four Anthropic-sourced sections: news, analyst sentiment, SEC filings, social sentiment.
**Example:**
```typescript
// lib/data/anthropic-search.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from environment

async function fetchNews(ticker: string): Promise<NewsSection> {
  const response = await client.messages.create({
    model: 'claude-opus-4-6', // or claude-3-5-sonnet — use model that supports web_search
    max_tokens: 2048,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: [{
      role: 'user',
      content: `Search for recent news headlines about ${ticker} stock from the past 30 days.
                Return a JSON array of objects with: headline, url, published_date, source.
                Focus on: earnings, analyst upgrades/downgrades, product news, regulatory events.
                Only include articles with clear publication dates within the last 30 days.`,
    }],
  });

  return {
    collected_at: new Date().toISOString(),
    items: extractJsonFromResponse(response),
  };
}
```

### Pattern 3: yahoo-finance2 Structured Data Fetching
**What:** Use specific yahoo-finance2 methods to retrieve each category of structured financial data.
**When to use:** For market_data and fundamentals sections.
**Example:**
```typescript
// lib/data/yahoo.ts
import yahooFinance from 'yahoo-finance2';

async function fetchMarketData(ticker: string) {
  const quote = await yahooFinance.quote(ticker);
  return {
    collected_at: new Date().toISOString(),
    price: quote.regularMarketPrice,
    volume: quote.regularMarketVolume,
    market_cap: quote.marketCap,
    fifty_two_week_high: quote.fiftyTwoWeekHigh,
    fifty_two_week_low: quote.fiftyTwoWeekLow,
    percent_change_today: quote.regularMarketChangePercent,
    exchange: quote.fullExchangeName,
  };
}

async function fetchFundamentals(ticker: string) {
  const summary = await yahooFinance.quoteSummary(ticker, {
    modules: ['financialData', 'defaultKeyStatistics', 'incomeStatementHistory'],
  });
  return {
    collected_at: new Date().toISOString(),
    pe_ratio: summary.defaultKeyStatistics?.trailingPE,
    eps: summary.defaultKeyStatistics?.trailingEps,
    revenue: summary.financialData?.totalRevenue,
    debt_to_equity: summary.financialData?.debtToEquity,
    profit_margin: summary.financialData?.profitMargins,
  };
}

async function fetchChartData(ticker: string) {
  // 1-month daily OHLCV for chart confirmation view
  const result = await yahooFinance.chart(ticker, {
    period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    period2: new Date(),
    interval: '1d',
  });
  return result.quotes; // Array of {date, open, high, low, close, volume}
}

async function searchTickers(query: string) {
  // Returns results for autocomplete dropdown
  const results = await yahooFinance.search(query);
  return results.quotes?.filter(q => q.isYahooFinance).slice(0, 8) ?? [];
}
```

### Pattern 4: Temp File Lifecycle
**What:** Write the source package to a temp file, pass the path to the frontend, and clean up on session end.
**When to use:** Every research request.
**Example:**
```typescript
// lib/temp-file.ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

export async function writeSourcePackage(pkg: SourcePackage): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ticker-research-'));
  const filePath = path.join(tmpDir, `${pkg.ticker}-${Date.now()}.json`);
  await fs.writeFile(filePath, JSON.stringify(pkg, null, 2), 'utf8');
  return filePath;
}

export async function cleanupSourcePackage(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    await fs.rmdir(path.dirname(filePath));
  } catch {
    // Best-effort cleanup — temp directory will be cleared by OS eventually
  }
}
```

### Anti-Patterns to Avoid
- **Sequential data collection:** Fetching market data, then news, then fundamentals one by one adds 5-15 seconds of unnecessary latency. Always use `Promise.allSettled`.
- **Hard failures on partial data:** If analyst sentiment fails (web search rate limit), the entire research pipeline should not abort. Use `Promise.allSettled`, not `Promise.all`, and surface partial data with a `collection_errors` field.
- **Storing the source package in the repo:** Source package temp files must go to `os.tmpdir()`, never to any project directory. Never commit them.
- **Calling data APIs from the client (browser):** ANTHROPIC_API_KEY and all API calls must stay server-side in Next.js Route Handlers. Never expose API keys to the browser.
- **Mixing UI rendering with data collection:** The source package assembly is pure data logic in `lib/data/`. The API route in `app/api/` calls it. The React component calls the API route. Three distinct layers.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ticker search / symbol lookup | Custom Yahoo Finance HTTP client | `yahoo-finance2` `search()` | Already handles auth, response parsing, TypeScript types, search ranking |
| Financial chart rendering | Custom SVG/Canvas chart | `lightweight-charts` | Correct financial axis scaling, crosshair, time formatting, resizing — dozens of edge cases |
| Debounced input | Custom setTimeout/clearTimeout in component | `use-debounce` `useDebouncedCallback` | Handles cleanup on unmount, memoization, React concurrent mode compatibility |
| JSON schema validation | Manual type guards | `zod` | Source package has 6 sections with nested objects — type guards become unmaintainable; Zod gives parse errors with field-level detail |
| Temp file management | Custom temp path construction | `os.tmpdir()` + `fs.mkdtemp()` | Platform-correct temp directory, unique naming, OS-level cleanup if process crashes |
| Web scraping for news/SEC | Custom Puppeteer/Playwright scrapers | Anthropic web search tool | Web search handles fetching, parsing, summarization in one API call; no scraping infrastructure needed |

**Key insight:** The data collection layer's job is to retrieve and normalize data, not to solve infrastructure problems. Every custom-built component in this layer adds a new failure mode without adding business value.

---

## Common Pitfalls

### Pitfall 1: yahoo-finance2 Rate Limiting / Breakage
**What goes wrong:** Yahoo can rate-limit or break the unofficial API at any time. Heavy usage (many concurrent users) triggers "Too Many Requests" errors. This is documented in the GitHub issues.
**Why it happens:** yahoo-finance2 uses undocumented Yahoo Finance endpoints. Yahoo does not provide an SLA and actively rate-limits scrapers.
**How to avoid:** (1) Treat it as best-effort — handle errors gracefully with user-friendly messages. (2) Do not call it more than needed per request: 2-3 calls per research session (search, quote/chart, quoteSummary). (3) For production scaling, plan to migrate to Polygon.io Starter.
**Warning signs:** HTTP 429 responses or `YFRateLimitError` in logs.

### Pitfall 2: ANTHROPIC_API_KEY Exposed to Browser
**What goes wrong:** API key is imported in a component file or Next.js client code, bundled into the browser, visible in DevTools Network tab.
**Why it happens:** Developers new to Next.js don't distinguish server vs. client code. Any file that runs in the browser (components, `use client` files) must not import server-only secrets.
**How to avoid:** All Anthropic API calls go in `app/api/` Route Handlers or `lib/` server-only files. Never import `process.env.ANTHROPIC_API_KEY` from a component. Use `server-only` package to enforce this.
**Warning signs:** `ANTHROPIC_API_KEY` appearing in build output warnings; network requests from the browser directly to api.anthropic.com.

### Pitfall 3: Ticker Ambiguity — Wrong Instrument
**What goes wrong:** User types "META" and the system resolves to a different company on a different exchange, or to an ETF. Research runs on the wrong instrument. The user doesn't notice until they see wrong data.
**Why it happens:** Many ticker symbols are reused across exchanges. yahoo-finance2 `search()` returns ranked results, but rank 1 may not be what the user expects.
**How to avoid:** The chart confirmation step (TICK-02/03) is the mitigation. Display company name, exchange, and sector alongside the chart. User must click "Confirm" before pipeline runs. Never skip or auto-confirm the confirmation step.
**Warning signs:** Any code path that calls the full research pipeline without first completing a confirmation step.

### Pitfall 4: Missing `collected_at` Timestamps
**What goes wrong:** Source package JSON is assembled without timestamps per section. Phase 2 reasoning layer receives data with no provenance information. DATA-07 is not satisfied.
**Why it happens:** Timestamps are easy to forget when assembling a multi-section object.
**How to avoid:** Each collection function returns an object with `collected_at: new Date().toISOString()` as a top-level field. The Zod schema for SourcePackage requires `collected_at` on every section.
**Warning signs:** Any section in the source package type definition without a `collected_at` field.

### Pitfall 5: Anthropic Web Search Cost Overrun
**What goes wrong:** Each research request triggers multiple Anthropic web search calls. At $10/1000 searches, 4 searches per request = $0.04/request + token costs. With many users, this adds up quickly.
**Why it happens:** No request budget is set, and `max_uses` is not configured per search call.
**How to avoid:** Set `max_uses: 3` on each web search tool call (capping at 3 searches per Anthropic call). Document expected cost per research request in setup instructions.
**Warning signs:** Anthropic usage dashboard showing unexpected search volume.

### Pitfall 6: Blocking the UI During Data Collection
**What goes wrong:** User clicks "Confirm" and the UI freezes for 5-10 seconds with no feedback while all API calls run.
**Why it happens:** The data collection route handler takes time, and the frontend has no loading state.
**How to avoid:** Show a loading/skeleton state immediately on confirmation. The exact design is Claude's discretion (per CONTEXT.md), but something must be present. Options: streaming response from the route handler, polling a status endpoint, or a simple spinner with progress steps.
**Warning signs:** No loading state in ChartConfirmation component after "Confirm" click.

---

## Code Examples

Verified patterns from official sources:

### yahoo-finance2: Search (Autocomplete)
```typescript
// Source: github.com/gadicc/yahoo-finance2 - search module
import yahooFinance from 'yahoo-finance2';

const results = await yahooFinance.search('Apple');
// results.quotes is an array of { symbol, shortname, longname, exchDisp, typeDisp, isYahooFinance }
// Filter to isYahooFinance === true and typeDisp === 'Equity' for stock-only results
```

### yahoo-finance2: Historical Chart Data (1 Month)
```typescript
// Source: github.com/gadicc/yahoo-finance2 - chart module
import yahooFinance from 'yahoo-finance2';

const chart = await yahooFinance.chart('AAPL', {
  period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
  period2: new Date(),
  interval: '1d',
});
// chart.quotes: Array<{ date, open, high, low, close, volume }>
// Use date + close for a simple line chart
```

### yahoo-finance2: quoteSummary for Fundamentals
```typescript
// Source: github.com/gadicc/yahoo-finance2 - quoteSummary module
import yahooFinance from 'yahoo-finance2';

const summary = await yahooFinance.quoteSummary('AAPL', {
  modules: ['financialData', 'defaultKeyStatistics', 'price'],
});
// summary.price: { regularMarketPrice, marketCap, regularMarketChangePercent, ... }
// summary.financialData: { totalRevenue, debtToEquity, profitMargins, ... }
// summary.defaultKeyStatistics: { trailingPE, trailingEps, ... }
```

### Anthropic Web Search Tool
```typescript
// Source: docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // ANTHROPIC_API_KEY from environment

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  tools: [{
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: 3,  // Limit searches to control cost
  }],
  messages: [{
    role: 'user',
    content: `Search for analyst ratings and price targets for AAPL stock as of today.
              Return JSON: { consensus: "Buy"|"Hold"|"Sell", avg_price_target: number,
              analyst_count: number, recent_changes: [{analyst, firm, action, date}] }`,
  }],
});
// response.content contains tool_use blocks (search calls) and text blocks (final answer)
// Extract the final text block and parse JSON from it
```

### lightweight-charts: Line Chart React Component
```typescript
// Source: tradingview.github.io/lightweight-charts/tutorials/react/simple
import { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

interface ChartData { time: string; value: number; }

export function PriceLineChart({ data }: { data: ChartData[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'white' } },
      width: chartContainerRef.current.clientWidth,
      height: 200,
    });

    const lineSeries = chart.addLineSeries();
    lineSeries.setData(data);
    chart.timeScale().fitContent();

    return () => chart.remove(); // Cleanup on unmount
  }, [data]);

  return <div ref={chartContainerRef} />;
}
```

### Source Package TypeScript Type
```typescript
// lib/types.ts — canonical shape of the source package
export interface SourceSection {
  collected_at: string; // ISO 8601 — DATA-07
  error?: string;       // Set if collection failed gracefully
}

export interface SourcePackage {
  ticker: string;
  company_name: string;
  exchange: string;
  assembled_at: string;
  market_data: SourceSection & {
    price: number | null;
    volume: number | null;
    market_cap: number | null;
    fifty_two_week_high: number | null;
    fifty_two_week_low: number | null;
    percent_change_today: number | null;
  };
  fundamentals: SourceSection & {
    pe_ratio: number | null;
    eps: number | null;
    revenue: number | null;
    debt_to_equity: number | null;
    profit_margin: number | null;
  };
  news: SourceSection & {
    items: Array<{ headline: string; url: string; published_date: string; source: string }>;
  };
  analyst_sentiment: SourceSection & {
    consensus: 'Buy' | 'Hold' | 'Sell' | null;
    avg_price_target: number | null;
    analyst_count: number | null;
    recent_changes: Array<{ analyst: string; firm: string; action: string; date: string }>;
  };
  sec_filing_summary: SourceSection & {
    most_recent_10k: string | null;    // Key points as text summary
    most_recent_10q: string | null;
    filing_dates: { '10k': string | null; '10q': string | null };
  };
  social_sentiment: SourceSection & {
    overall_tone: 'bullish' | 'bearish' | 'neutral' | null;
    signals: string[];
    sources_checked: string[];
  };
  collection_errors: string[];
}
```

### Debounced Autocomplete Input
```typescript
// Uses use-debounce library — standard Next.js pattern
// Source: dev.to/c0xxxtv/react-nextjs-search-function-using-usedebounce
import { useDebouncedCallback } from 'use-debounce';

const handleSearch = useDebouncedCallback(async (query: string) => {
  if (query.length < 1) { setResults([]); return; }
  const res = await fetch(`/api/ticker/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  setResults(data);
}, 300); // 300ms debounce — Claude's discretion per CONTEXT.md
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate news/SEC/sentiment APIs (Finnhub, EDGAR, Reddit) | Anthropic web search tool for all web-sourced content | Sept 2025 (Anthropic web search launch) | One API client, one credential, model handles parsing |
| Next.js Pages Router + getServerSideProps | Next.js 15 App Router + Route Handlers | Next.js 13+ (stable in 14/15) | Co-located API + UI; Server Components reduce client JS |
| lightweight-charts v3/v4 | lightweight-charts v5.1.0 | 2024-2025 | New series API; `addLineSeries()` pattern updated |
| yahoo-finance (older npm) | yahoo-finance2 (v3.x) | 2021+ | Full rewrite with TypeScript, Zod validation, better module coverage |

**Deprecated/outdated:**
- `yahoo-finance` (original npm package): Superseded by `yahoo-finance2` which has TypeScript support and is actively maintained.
- Next.js `pages/api/` directory: Still works but App Router `app/api/` route handlers are the current standard pattern.
- `addAreaSeries()` with old color config in lightweight-charts v3: API changed in v4/v5; check current docs before implementing.

---

## Open Questions

1. **Anthropic web search: which Claude model to use for data collection calls**
   - What we know: Web search is available on "Claude 3.7 Sonnet, upgraded Claude 3.5 Sonnet, and Claude 3.5 Haiku" per the announcement.
   - What's unclear: The current model IDs for these in the SDK. The planner should verify the current model list at docs.anthropic.com before specifying model strings in code.
   - Recommendation: Use `claude-3-5-haiku-latest` for the 4 web search calls (cheaper, faster, sufficient for structured data extraction). Reserve more capable models for Phase 2 reasoning.

2. **lightweight-charts v5 React pattern changes**
   - What we know: v5.1.0 is current; official React tutorial exists at tradingview.github.io.
   - What's unclear: Whether `addLineSeries()` API has changed from the v4 pattern shown in examples.
   - Recommendation: Check tradingview.github.io/lightweight-charts/docs before implementing the chart component. The `/frontend-design` skill may have an established pattern.

3. **Source package temp file — session lifetime**
   - What we know: CONTEXT.md says "written to a temp file, automatically deleted when done."
   - What's unclear: "When done" means — end of HTTP request? After Phase 2 reads it? After user views report?
   - Recommendation: Keep the temp file alive for the full research session (from pipeline start through Phase 2 reasoning). Pass the file path in a session cookie or response body. Clean up explicitly after Phase 2 consumes it, with OS temp cleanup as fallback.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (recommended — integrates with Next.js/Vite toolchain) |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TICK-01 | `search('Apple')` returns AAPL result | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ Wave 0 |
| TICK-01 | `search('AAPL')` returns Apple Inc. result | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ Wave 0 |
| TICK-02 | `fetchChartData('AAPL')` returns 30 data points | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ Wave 0 |
| TICK-03 | API route rejects pipeline call without confirmed ticker | integration | `npx vitest run src/app/api/research/route.test.ts` | ❌ Wave 0 |
| DATA-01 | `fetchMarketData()` returns price, volume, market_cap, 52w range | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ Wave 0 |
| DATA-02 | `fetchFundamentals()` returns P/E, EPS, revenue, debt | unit | `npx vitest run src/lib/data/yahoo.test.ts` | ❌ Wave 0 |
| DATA-03-06 | `fetchNews/Analyst/SEC/Social()` return typed objects | unit (mocked) | `npx vitest run src/lib/data/anthropic-search.test.ts` | ❌ Wave 0 |
| DATA-07 | Every section in SourcePackage has `collected_at` | unit | `npx vitest run src/lib/data/source-package.test.ts` | ❌ Wave 0 |
| DATA-08 | `collectAllData()` returns valid SourcePackage with all 6 sections | integration | `npx vitest run src/lib/data/source-package.test.ts` | ❌ Wave 0 |

**Note:** Tests for Anthropic web search (DATA-03 through DATA-06) should mock the Anthropic SDK client to avoid real API calls and costs in the test suite.

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/data/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/data/yahoo.test.ts` — covers TICK-01, TICK-02, DATA-01, DATA-02
- [ ] `src/lib/data/anthropic-search.test.ts` — covers DATA-03, DATA-04, DATA-05, DATA-06 (mocked)
- [ ] `src/lib/data/source-package.test.ts` — covers DATA-07, DATA-08
- [ ] `src/app/api/research/route.test.ts` — covers TICK-03 (pipeline confirmation gate)
- [ ] `vitest.config.ts` — framework config
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react` — if not already present

---

## Sources

### Primary (HIGH confidence)
- [Anthropic web search tool docs](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool) — tool type `web_search_20250305`, `max_uses` param, domain filtering, pricing
- [TradingView Lightweight Charts docs](https://tradingview.github.io/lightweight-charts/) — React integration, createChart API, LineSeries
- [Next.js 15 App Router docs](https://nextjs.org/docs/app) — Route Handlers, Server Components, TypeScript setup

### Secondary (MEDIUM confidence)
- [github.com/gadicc/yahoo-finance2](https://github.com/gadicc/yahoo-finance2) — search/quote/quoteSummary/chart methods; v3.13.2; 75k weekly downloads (WebSearch verified with npm page)
- [Anthropic web search launch announcement](https://www.anthropic.com/news/web-search-api) — $10/1000 searches pricing; Claude 3.5/3.7 support; Brave Search backend
- [use-debounce npm](https://www.npmjs.com/package/use-debounce) — `useDebouncedCallback` for React autocomplete
- WebSearch results confirming lightweight-charts v5.1.0 is current (March 2026)
- WebSearch results confirming yahoo-finance2 rate limiting is a real risk, with YFRateLimitError in GitHub issues

### Tertiary (LOW confidence — flag for validation)
- yahoo-finance2 specific rate limit numbers (undocumented by Yahoo; community-observed only)
- Exact current Claude model IDs supporting web_search tool (verify at docs.anthropic.com before implementation)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All core libraries verified via WebSearch with authoritative sources (npm, official docs, Anthropic announcement)
- Architecture: HIGH — Two-layer separation, parallel collection, temp file pattern are well-established Node.js/Next.js patterns
- yahoo-finance2 reliability: MEDIUM — Unofficial API with documented rate-limiting risk; mitigated by graceful error handling
- Anthropic web search integration: HIGH — Official tool with published docs and pricing; launched September 2025
- Pitfalls: HIGH — Rate limiting, key exposure, ticker ambiguity, timestamp requirements are well-documented and consistent across sources

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (30 days — yahoo-finance2 npm and lightweight-charts versions should be re-verified; Anthropic model IDs may update)
