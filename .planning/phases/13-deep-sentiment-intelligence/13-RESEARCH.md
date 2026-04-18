# Phase 13: Deep Sentiment Intelligence - Research

**Researched:** 2026-04-18
**Domain:** Sentiment data APIs, Firecrawl scrape, Anthropic Haiku URL discovery, yahoo-finance2 options, AnalysisResult schema extension, React report UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Community Scraping Architecture (Phase 12 rework)**
- D-01: Replace `scrapeCommunitySentiment()` entirely — Phase 12 `fc.search()` replaced with: Anthropic Haiku discovers community discussion URLs → Firecrawl scrapes full content from each URL
- D-02: URL discovery is dynamic per-ticker, not a fixed site list
- D-03: Haiku finds 10 candidate URLs; Firecrawl scrapes the top 5 most relevant
- D-04: Target sources: Reddit (r/wallstreetbets, r/stocks, r/investing, r/SecurityAnalysis), StockTwits discussion threads, SeekingAlpha article comments, niche finance forums (Investors Hub, Elite Trader, value investing communities). Dynamic discovery, not hardcoded.

**StockTwits API**
- D-05: Call BOTH StockTwits API AND Firecrawl-scrape StockTwits threads (different data types)
- D-06: New file `src/lib/data/stocktwits.ts` — wraps `GET https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json`
- D-07: Compute from API: `bull_pct`, `bear_pct`, `message_count`, `is_trending`
- D-08: StockTwits API result stored in new `SentimentIntelligenceSection` on SourcePackage

**Options Put/Call Ratio**
- D-09: New file `src/lib/data/options-sentiment.ts` — calls `yahoo-finance2.options(ticker)`
- D-10: Compute from options chains: total call OI vs total put OI → put_call_ratio
- D-11: Thresholds: >1.0 = bearish, <0.5 = bullish, 0.5–1.0 = neutral
- D-12: Fields: `put_call_ratio: number | null`, `put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null`
- D-13: Graceful null returns on missing/error — not a blocking failure

**New SourcePackage Section**
- D-14: Add `sentiment_intelligence` section to SourcePackage with the interface defined in CONTEXT.md

**AnalysisResult Schema Extension**
- D-15: Add `future_projection: string` to AnalysisResult
- D-16: Gemini prompt must instruct synthesis of all signals into forward-looking narrative
- D-17: Add `sentiment_intelligence` summary to AnalysisResult for report display

**Report UI**
- D-18: New Sentiment Intelligence compact stats card after Market Sentiment section
- D-19: New Forward Outlook section at end of report
- D-20: Use existing report component patterns (same shadcn/ui Card, same dark-mode palette — no new design system)

### Claude's Discretion
- How to rank the 10 candidate URLs from Haiku discovery to pick the top 5 for Firecrawl
- Exact Haiku prompt design for URL discovery
- Whether to run StockTwits API + options + Haiku URL discovery in parallel or sequentially (suggest parallel)
- Error handling granularity for each new data source
- How to pass StockTwits structured data to Gemini (community section header vs separate prompt section)

### Deferred Ideas (OUT OF SCOPE)
- Live/streaming StockTwits feed (real-time monitoring)
- Options chain visualization in report (call/put distribution chart)
- YouTube sentiment analysis as a source
- X/Twitter community sentiment
</user_constraints>

---

## Summary

Phase 13 upgrades the sentiment intelligence pipeline with three additive capabilities. The most significant is replacing Phase 12's `fc.search()` community scraping with a two-step Haiku URL discovery + Firecrawl scrape approach. This is additive: the new `scrapeCommunitySentiment()` replacement produces the same interface (a markdown string) consumed by `buildUserPrompt()`, so the Gemini call chain stays intact.

The StockTwits API is free, no-auth, and returns live. Live testing confirms `entities.sentiment` is the correct field per message (not a top-level bull/bear count — the percentages must be computed by counting labeled messages). The `is_trending` flag does not exist in the API response; the symbol object exposes `sentiment_change` instead (a delta float). The plan must account for this API reality.

yahoo-finance2 `options(ticker)` works and returns exactly one nearest-expiration chain by default. Total put and call open interest across all chains in that response gives the put/call ratio. Live test on AAPL returned a ratio of 0.454 (bullish by D-11 thresholds).

The AnalysisResult Zod schema extension (`future_projection` + `sentiment_intelligence` summary) and the two new UI sections in `ResearchReport.tsx` are the downstream integration points.

**Primary recommendation:** Build all three new data collectors (`stocktwits.ts`, `options-sentiment.ts`, community URL discoverer) with graceful null fallbacks following the `finnhub.ts` pattern, wire them in parallel into `source-package.ts`, extend the Gemini schema and prompt, then render two new compact UI elements in `ResearchReport.tsx`.

---

## Standard Stack

### Core (All Already Installed — No New Dependencies)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@anthropic-ai/sdk` | ^0.78.0 | Haiku URL discovery (web_search_20250305 tool) | Already used in `anthropic-search.ts` — reuse same pattern |
| `@mendable/firecrawl-js` | 4.18.3 (pinned) | URL scraping via `fc.scrape()` | Already in use — `scrape()` method confirmed present |
| `yahoo-finance2` | ^3.13.2 | Options chains via `.options(ticker)` | Tested live — returns `openInterest` per contract |
| `ai` (AI SDK) | 6.0.168 (pinned) | Gemini call with extended Zod schema | Already in `gemini-analysis.ts` |
| `zod` | (transitive) | Schema extension for new AnalysisResult fields | Already in use |

[VERIFIED: live npm inspection of /Users/tj/Desktop/Cipher/package.json and node_modules]

**No new npm dependencies needed for Phase 13.** All required libraries are already installed.

### StockTwits API

| Property | Value |
|----------|-------|
| Endpoint | `GET https://api.stocktwits.com/api/2/streams/symbol/{TICKER}.json` |
| Auth | None (public, no API key) |
| Rate limits | Unspecified for public tier — treat as best-effort |
| Response | Returns last 30 messages |
| Sentiment field | `message.entities.sentiment` — object `{ basic: 'Bullish' | 'Bearish' }` or `null` |
| Trending field | DOES NOT EXIST at top level. Symbol has `sentiment_change` (float delta) instead |
| Message count | `messages.length` (always 30 for active tickers, fewer for quiet ones) |

[VERIFIED: live API call to `api.stocktwits.com/api/2/streams/symbol/GME.json` — 2026-04-18]

**Critical correction to CONTEXT.md D-07:** The CONTEXT.md says `is_trending` comes from an "API trending flag if available." No such flag exists in the API response. Use `sentiment_change` from the symbol object as a proxy for trending intensity (magnitude > 0.5 suggests movement). For `is_trending`, compute as `Math.abs(symbol.sentiment_change) > 0.5` or simply omit it and return `null`.

### Firecrawl Scrape API (vs fc.search)

| Property | Value |
|----------|-------|
| Method signature | `fc.scrape(url: string, options?: ScrapeOptions): Promise<Document>` |
| Key option | `formats: ['markdown']` |
| Additional option | `onlyMainContent: true` (filters nav/boilerplate) |
| Return field | `document.markdown` — the scraped page content |
| Cost | ~1 credit per URL scraped |
| Error behavior | Throws on failure — must be wrapped in try/catch |

[VERIFIED: node_modules/@mendable/firecrawl-js/dist/index.d.ts line 774]

### yahoo-finance2 Options

| Property | Value |
|----------|-------|
| Method | `yahooFinance.options(ticker)` |
| Returns | `{ options: Array<{ expirationDate, calls, puts }>, expirationDates, ... }` |
| Default behavior | Returns exactly ONE nearest-expiration chain |
| Call/Put fields | `openInterest: number`, `volume: number`, `strike: number`, `impliedVolatility: number` |
| Tested | AAPL: callOI=27885, putOI=12653, ratio=0.454 (bullish by D-11) |
| Error behavior | Throws for unknown ticker — must be caught, return null |

[VERIFIED: live node test with yahoo-finance2 against AAPL — 2026-04-18]

---

## Architecture Patterns

### Recommended File Structure for Phase 13

```
src/lib/data/
├── stocktwits.ts          # NEW — StockTwits API wrapper (D-06)
├── options-sentiment.ts   # NEW — yahoo-finance2 options + put/call ratio (D-09)
├── finnhub.ts             # EXISTING — follow this as the pattern template
├── yahoo.ts               # EXISTING — add options() call here OR in new file (D-09)
└── anthropic-search.ts    # EXISTING — adapt fetchSocialSentiment pattern for Haiku URL discovery

src/lib/
├── gemini-analysis.ts     # MODIFY — replace scrapeCommunitySentiment(), extend Zod schema, update prompt
├── types.ts               # MODIFY — add SentimentIntelligenceSection, extend SourcePackage + AnalysisResult
└── data/source-package.ts # MODIFY — add parallel fetch of sentiment_intelligence

src/components/
└── ResearchReport.tsx     # MODIFY — add Sentiment Intelligence card + Forward Outlook section
```

### Pattern 1: New Data Source File (Finnhub Pattern)

All new data source files follow this structure:

```typescript
// src/lib/data/stocktwits.ts
// Source: verified against finnhub.ts pattern in this codebase

import type { SentimentIntelligenceSection } from '@/lib/types';

export async function fetchStockTwitsSentiment(ticker: string): Promise<SentimentIntelligenceSection> {
  const collected_at = new Date().toISOString();
  const empty = (error?: string): SentimentIntelligenceSection => ({
    collected_at,
    stocktwits_bull_pct: null,
    stocktwits_bear_pct: null,
    stocktwits_message_count: null,
    stocktwits_is_trending: null,
    reddit_tone: null,
    put_call_ratio: null,
    put_call_interpretation: null,
    ...(error ? { error } : {}),
  });

  try {
    const res = await fetch(
      `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return empty('StockTwits API error');
    const data = await res.json() as StockTwitsResponse;
    // ... compute bull_pct, bear_pct from entities.sentiment
    return { collected_at, ... };
  } catch {
    return empty('StockTwits fetch failed');
  }
}
```

Key rules from finnhub.ts pattern [VERIFIED]:
- Optional API key check → if missing, return `{ available: false }` immediately (StockTwits has no key — skip this gate)
- `AbortSignal.timeout(5000)` on all fetch calls
- Never throw — return empty section with error string
- `collected_at` is always set even in empty returns

### Pattern 2: Haiku URL Discovery (anthropic-search.ts Pattern)

The `fetchSocialSentiment()` function in `anthropic-search.ts` shows the exact pattern for Anthropic Haiku + web_search_20250305 tool [VERIFIED from reading file]:

```typescript
// Adapt from fetchSocialSentiment() in anthropic-search.ts
// Source: src/lib/data/anthropic-search.ts (read in this session)

const response = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',  // same model already in use
  max_tokens: 2048,
  tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
  messages: [{
    role: 'user',
    content: `Find 10 URLs where ${ticker} stock is being actively discussed right now.
Return a JSON array of URL strings. Include Reddit posts/threads, StockTwits discussion
threads, SeekingAlpha articles, and niche finance forums (Investors Hub, Elite Trader).
Prefer recent posts (past 7 days). Return exactly 10 URLs as a JSON array.
Example: ["https://reddit.com/r/wallstreetbets/...", ...]`,
  }],
});
```

The `extractTextContent()` and `parseJsonFromResponse()` helpers already exist in `anthropic-search.ts` and should be imported or duplicated as needed.

### Pattern 3: Parallel Collection in source-package.ts

Current `collectAllData()` runs 8 sources in parallel via `Promise.allSettled()`. Phase 13 adds the `SentimentIntelligenceSection` as a 9th parallel fetch:

```typescript
// EXISTING pattern in source-package.ts (lines 52-70)
const [
  marketDataResult,
  // ... existing 7 ...
  sentimentIntelligenceResult,  // NEW — 9th parallel fetch
] = await Promise.allSettled([
  fetchMarketData(ticker),
  // ... existing 7 ...
  fetchSentimentIntelligence(ticker),  // combines StockTwits + options + (options from separate module)
]);
```

The `settlement_intelligence` aggregator can call StockTwits and options in its own parallel block, since both are independent.

### Pattern 4: Firecrawl Scrape (replacing fc.search)

```typescript
// Replace scrapeCommunitySentiment() in gemini-analysis.ts
// fc.scrape() signature: scrape(url, { formats: ['markdown'], onlyMainContent: true })
// Source: verified from node_modules/@mendable/firecrawl-js/dist/index.d.ts

async function scrapeUrl(fc: Firecrawl, url: string): Promise<string> {
  try {
    const doc = await fc.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    } as ScrapeOptions);
    return doc.markdown ?? '';
  } catch {
    return '';  // per-URL failure is non-fatal
  }
}
```

### URL Ranking Strategy (Claude's Discretion)

For picking top 5 from 10 Haiku-discovered URLs, use a simple source-tier ranking:

| Tier | Sources | Priority |
|------|---------|----------|
| 1 | reddit.com, stocktwits.com | Highest retail sentiment signal |
| 2 | seekingalpha.com | Analytical community |
| 3 | investorshub.com, elitetrader.com | Niche forums |
| 4 | Everything else | Lower priority |

Implementation: filter Haiku-returned URLs by domain, sort by tier, take first 5. Simple string matching on URL hostname. No external libraries needed.

### StockTwits Sentiment Computation

```typescript
// From live API inspection — entities.sentiment is per-message, not aggregate
// Compute from the messages array:

const messages = data.messages ?? [];
const labeled = messages.filter(m => m.entities?.sentiment != null);
const bullish = labeled.filter(m => m.entities.sentiment.basic === 'Bullish').length;
const bearish = labeled.filter(m => m.entities.sentiment.basic === 'Bearish').length;
const total = labeled.length;

const bull_pct = total > 0 ? Math.round((bullish / total) * 100) : null;
const bear_pct = total > 0 ? Math.round((bearish / total) * 100) : null;
const message_count = messages.length;  // typically 30

// is_trending: use sentiment_change from symbol object (no dedicated trending flag)
const sentiment_change = data.symbol?.sentiment_change ?? 0;
const is_trending = Math.abs(sentiment_change) > 0.5;
```

[VERIFIED: live API response inspection — GME: 15/30 messages labeled, entities.sentiment.basic field confirmed]

### Anti-Patterns to Avoid

- **Using `fc.search()` for URL discovery:** Phase 12 pattern being replaced. `fc.search()` returns limited results and costs more credits. Haiku + `fc.scrape()` gives targeted, full-content extraction.
- **Treating all 30 StockTwits messages as labeled:** Only ~50% carry `entities.sentiment`. Compute percentage only over labeled messages.
- **Assuming `is_trending` exists in StockTwits API:** It does not. Use `sentiment_change` magnitude or derive it from message activity.
- **Throwing from data collection functions:** All new functions must use try/catch and return null/empty sections — never propagate exceptions (established project pattern).
- **Modifying existing `SocialSentimentSection`:** The new fields go in a new `SentimentIntelligenceSection`, not appended to the existing social section. `SocialSentimentSection` stays backward-compatible.
- **Adding new AnalysisResult fields without optional modifier:** `future_projection` and `sentiment_intelligence` summary should be optional (`?`) for backward compat with stored reports (same pattern as `executive_summary`, `investment_thesis`, etc.).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP fetch with timeout | Custom timeout logic | `AbortSignal.timeout(5000)` | Already in finnhub.ts pattern |
| Bull/bear % computation | Complex sentiment ML | Count `entities.sentiment.basic` values | StockTwits already labels messages |
| Options data | Custom options API | `yahooFinance.options(ticker)` | Free, tested, returns openInterest |
| Community URL scraping | Custom scraper | `fc.scrape(url, { formats: ['markdown'] })` | Firecrawl handles JS-rendered pages, paywalls, and extraction |
| LLM URL discovery | Regex/scraper | Anthropic Haiku + web_search_20250305 | Same pattern as fetchSocialSentiment() already working |
| JSON parsing from LLM | Custom parser | `parseJsonFromResponse<T>()` | Already exists in anthropic-search.ts |

---

## Common Pitfalls

### Pitfall 1: StockTwits `is_trending` Field Does Not Exist

**What goes wrong:** Code accesses `data.symbol.is_trending` or `data.trending` — both return `undefined`. The type assertion passes but the value is `undefined`, stored as `null` via nullish coalescing.
**Why it happens:** CONTEXT.md mentions "API trending flag if available" but live API inspection shows no such flag. The symbol object has `sentiment_change` (float) instead.
**How to avoid:** Use `Math.abs(data.symbol?.sentiment_change ?? 0) > 0.5` for `is_trending`, or always return `null` and update the interface to use `sentiment_change_pct: number | null` instead.
**Warning signs:** `is_trending` always returns `null` for every ticker.

[VERIFIED: live API response — 2026-04-18]

### Pitfall 2: Firecrawl Scrape on Paywalled/Bot-Protected Pages

**What goes wrong:** SeekingAlpha and some Reddit threads return login walls or empty content when scraped. The `markdown` field is present but contains login page boilerplate rather than discussion content.
**Why it happens:** Many finance sites have bot detection or require authentication for article content.
**How to avoid:** Check that scraped `markdown` length > 200 characters before including in community content. Pages returning < 200 chars are likely paywall/bot blocks — skip silently.
**Warning signs:** Community content contains "Please log in", "Subscribe to read", or very short responses.

[ASSUMED — based on known Firecrawl behavior with paywalled sites]

### Pitfall 3: yahoo-finance2 options() Returns Only Nearest Expiration

**What goes wrong:** The put/call ratio uses only one expiration chain, which may not be representative of the market view (near-term options are noisier).
**Why it happens:** `yahooFinance.options(ticker)` without additional params returns exactly one expiration by default (nearest expiring).
**How to avoid:** This is acceptable for Phase 13 scope per D-10. Document the limitation in `options-sentiment.ts` comments. The ratio from a single near-term chain is still a valid sentiment signal.
**Warning signs:** Ratio is unusually extreme (>3.0 or <0.1) — may indicate expiration-week noise.

[VERIFIED: live test — options() returns 1 chain for AAPL — 2026-04-18]

### Pitfall 4: Gemini Schema Zod Validation Breaks on Missing Optional Fields

**What goes wrong:** Adding `future_projection: z.string()` without `.optional()` causes `NoObjectGeneratedError` if Gemini omits the field (which it may on low-data tickers).
**Why it happens:** The existing schema already uses `.optional().default([])` for array fields — same pattern needed for new string fields.
**How to avoid:** Use `future_projection: z.string().optional().default('')` in `AnalysisResultSchema`. Mirror the existing `catalyst_watch: z.array(...).optional().default([])` pattern.
**Warning signs:** Analysis fails with `NoObjectGeneratedError` for previously-working tickers.

[VERIFIED: pattern from existing AnalysisResultSchema in gemini-analysis.ts]

### Pitfall 5: Haiku URL Discovery Returns Non-URL Strings

**What goes wrong:** Haiku returns commentary mixed with URLs, or wraps URLs in markdown formatting, causing URL validation to fail and scraping to return errors.
**Why it happens:** LLMs are creative with output format even when instructed to return JSON.
**How to avoid:** Filter Haiku output through `url.startsWith('http')` check before passing to Firecrawl. The existing `parseJsonFromResponse()` strips markdown fences — reuse it.
**Warning signs:** Firecrawl throws on malformed URLs.

[ASSUMED — based on known Anthropic model output patterns]

### Pitfall 6: Parallel Community Scraping Hits Firecrawl Credit Limit

**What goes wrong:** Scraping 5 URLs per run x multiple test runs exhausts Firecrawl free tier credits rapidly during development.
**Why it happens:** Each `fc.scrape()` call consumes ~1 credit. Phase 12 was limited to 3 credits (limit:3). Phase 13 uses up to 5 credits per run.
**How to avoid:** Test with 2-3 URLs during development. Only enable full 5-URL scraping for production smoke tests. Check `FIRECRAWL_API_KEY` guard (already in existing code) — returns `''` gracefully if key absent.
**Warning signs:** Firecrawl returns 402 Payment Required errors.

[ASSUMED]

---

## Code Examples

### StockTwits Fetch (Verified Pattern)

```typescript
// Source: live API test against api.stocktwits.com/api/2/streams/symbol/GME.json
// Entities.sentiment confirmed per-message, not aggregate

interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  entities?: {
    sentiment: { basic: 'Bullish' | 'Bearish' } | null;
  };
}

interface StockTwitsResponse {
  response: { status: number };
  symbol?: {
    symbol: string;
    sentiment_change?: number;  // float delta — proxy for trending intensity
  };
  messages?: StockTwitsMessage[];
}

// Compute bull/bear pct from labeled messages:
const messages = data.messages ?? [];
const labeled = messages.filter(m => m.entities?.sentiment != null);
const bullish = labeled.filter(m => m.entities!.sentiment!.basic === 'Bullish').length;
const bull_pct = labeled.length > 0 ? Math.round((bullish / labeled.length) * 100) : null;
const bear_pct = labeled.length > 0 ? 100 - bull_pct! : null;
```

### Options Put/Call Ratio (Verified Pattern)

```typescript
// Source: live test against yahoo-finance2 with AAPL (2026-04-18)
// AAPL result: callOI=27885, putOI=12653, ratio=0.454 (bullish)

export async function fetchOptionsSentiment(ticker: string): Promise<OptionsResult> {
  try {
    const result = await yahooFinance.options(ticker);
    let totalCallOI = 0, totalPutOI = 0;
    for (const chain of result.options ?? []) {
      for (const c of chain.calls ?? []) totalCallOI += c.openInterest ?? 0;
      for (const p of chain.puts ?? []) totalPutOI += p.openInterest ?? 0;
    }
    const ratio = totalCallOI > 0 ? totalPutOI / totalCallOI : null;
    const interpretation =
      ratio == null ? null :
      ratio > 1.0 ? 'bearish' :
      ratio < 0.5 ? 'bullish' : 'neutral';
    return { put_call_ratio: ratio, put_call_interpretation: interpretation };
  } catch {
    return { put_call_ratio: null, put_call_interpretation: null };
  }
}
```

### Gemini Prompt Extension for future_projection

```typescript
// Add to SYSTEM_PROMPT in gemini-analysis.ts:
// (After existing sections)

`future_projection: A 2-3 sentence forward-looking outlook synthesizing ALL available signals:
StockTwits bull/bear sentiment (${stocktwits_bull_pct}% bullish, ${stocktwits_bear_pct}% bearish),
options put/call ratio (${put_call_ratio} — ${put_call_interpretation}),
community discussion tone, price target vs current price, catalyst watch events,
and fundamental/technical signals. Be specific — cite data points. This is the capstone
forward-looking statement of the report.`
```

### Firecrawl Scrape Pattern (replacing fc.search)

```typescript
// Source: verified fc.scrape() signature from node_modules/@mendable/firecrawl-js/dist/index.d.ts
// ScrapeOptions.formats accepts 'markdown', ScrapeOptions.onlyMainContent filters boilerplate

const doc = await fc.scrape(url, {
  formats: ['markdown'],
  onlyMainContent: true,
} as ScrapeOptions);

const content = doc.markdown ?? '';
// Paywall/bot guard:
if (content.length < 200) return '';  // skip near-empty pages
return content;
```

---

## Type Changes Required

### src/lib/types.ts

```typescript
// NEW: SentimentIntelligenceSection
export interface SentimentIntelligenceSection extends SourceSection {
  stocktwits_bull_pct: number | null;
  stocktwits_bear_pct: number | null;
  stocktwits_message_count: number | null;
  stocktwits_is_trending: boolean | null;
  reddit_tone: 'bullish' | 'bearish' | 'neutral' | null;
  put_call_ratio: number | null;
  put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
}

// EXTEND: SourcePackage — add new section
export interface SourcePackage {
  // ... existing fields ...
  sentiment_intelligence: SentimentIntelligenceSection;  // NEW
}

// EXTEND: AnalysisResult — add new optional fields (optional for backward compat)
export interface AnalysisResult {
  // ... existing fields ...
  future_projection?: string;                           // NEW D-15
  sentiment_intelligence?: {                            // NEW D-17
    stocktwits_bull_pct: number | null;
    stocktwits_bear_pct: number | null;
    stocktwits_message_count: number | null;
    stocktwits_is_trending: boolean | null;
    put_call_ratio: number | null;
    put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
  };
}
```

### AnalysisResultSchema (Zod) in gemini-analysis.ts

```typescript
// Add to AnalysisResultSchema:
future_projection: z.string().optional().default(''),
sentiment_intelligence_summary: z.object({
  stocktwits_bull_pct: z.number().nullable().optional(),
  stocktwits_bear_pct: z.number().nullable().optional(),
  put_call_ratio: z.number().nullable().optional(),
  put_call_interpretation: z.enum(['bullish', 'bearish', 'neutral']).nullable().optional(),
}).optional(),
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing — confirmed from package.json patterns) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |
| Playwright (e2e) | Existing — `npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-06 | `fetchStockTwitsSentiment()` returns structured data | unit | `npx vitest run src/lib/data/stocktwits` | ❌ Wave 0 |
| D-09 | `fetchOptionsSentiment()` returns put_call_ratio | unit | `npx vitest run src/lib/data/options-sentiment` | ❌ Wave 0 |
| D-10 | P/C ratio computed correctly from OI | unit | Same file | ❌ Wave 0 |
| D-11 | Thresholds applied correctly | unit | Same file | ❌ Wave 0 |
| D-13 | Graceful null on options failure | unit | Same file | ❌ Wave 0 |
| D-03 | Haiku returns 10 URLs, top 5 scraped | integration/manual | Manual smoke test | ❌ Wave 0 |
| D-15 | `future_projection` present in AnalysisResult | unit | Existing gemini-analysis tests | ❌ extend |
| D-18/D-19 | UI cards render in ResearchReport | e2e | `npx playwright test` | ❌ Wave 0 |

### Wave 0 Gaps

- [ ] `src/lib/data/__tests__/stocktwits.test.ts` — covers D-06, D-07 (mock fetch, verify bull/bear computation)
- [ ] `src/lib/data/__tests__/options-sentiment.test.ts` — covers D-09, D-10, D-11, D-13 (mock yahoo-finance2)
- [ ] Extend existing gemini-analysis tests to verify `future_projection` field present in output

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | ticker passed to StockTwits URL via `encodeURIComponent()` |
| V6 Cryptography | no | StockTwits API is public read-only |

### Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| URL injection via ticker into StockTwits endpoint | Tampering | `encodeURIComponent(ticker)` in URL construction — same pattern as finnhub.ts |
| Scraped community content injected into Gemini prompt | Tampering | Content is passed as user prompt data only, not as system instructions — acceptable pattern |
| Path traversal via filePath (existing) | Tampering | Already mitigated in analysis route.ts via `realpathSync` + canonicalTmpdir check |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| StockTwits API | D-06 | ✓ (public) | — | Null return |
| Firecrawl API key | D-01 community scraping | Conditional (env var) | 4.18.3 | Empty string return (existing guard) |
| yahoo-finance2 options() | D-09 | ✓ | ^3.13.2 | Null return |
| Anthropic API key | Haiku URL discovery | ✓ (required for all functions) | ^0.78.0 | Empty URL list |
| @mendable/firecrawl-js scrape() | D-01 | ✓ | 4.18.3 | — |

**Missing dependencies with no fallback:** None — all required dependencies are installed.

**Missing dependencies with fallback:** FIRECRAWL_API_KEY absent → community content = '' (same as Phase 12 behavior).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SeekingAlpha and some Reddit threads return paywall/bot content < 200 chars when scraped | Pitfall 2 | If wrong, no harm — content just passes through. Low risk. |
| A2 | Haiku sometimes returns malformed URLs or markdown-wrapped URLs | Pitfall 5 | If wrong, no harm — guard is defensive. Low risk. |
| A3 | Firecrawl free tier credit limit causes issues during dev with 5 URLs/run | Pitfall 6 | If wrong, development is smoother. Low risk. |
| A4 | The `is_trending` computation via `sentiment_change > 0.5` is a reasonable proxy | StockTwits section | If wrong, `is_trending` signal is noisy but not blocking. Medium risk. |

**Critical VERIFIED corrections (not assumptions):**
- StockTwits `is_trending` field: DOES NOT EXIST in API. Must use `sentiment_change` or return null. [VERIFIED live 2026-04-18]
- StockTwits sentiment: per-message `entities.sentiment.basic`, not aggregate. Must compute by counting. [VERIFIED live 2026-04-18]
- options() returns 1 chain by default (nearest expiry). [VERIFIED live 2026-04-18]
- fc.scrape() method exists and signature is `scrape(url, opts): Promise<Document>`. [VERIFIED from node_modules]

---

## Open Questions

1. **`is_trending` field in SentimentIntelligenceSection**
   - What we know: The StockTwits API has no `is_trending` flag. Symbol has `sentiment_change` (float).
   - What's unclear: The CONTEXT.md D-07 specifies `is_trending: boolean | null`. The most honest implementation is to always return `null` since there's no API-provided trending flag, or derive it from `sentiment_change > 0.5`.
   - Recommendation: Return `is_trending` as `Math.abs(symbol.sentiment_change ?? 0) > 0.5` — keeps the field contract and provides a reasonable proxy signal. Document this in code comments.

2. **Where to perform Haiku URL discovery: inside `gemini-analysis.ts` or `source-package.ts`?**
   - What we know: CONTEXT.md says replace `scrapeCommunitySentiment()` in `gemini-analysis.ts` (canonical ref). The analysis route calls `scrapeCommunitySentiment(ticker)` at step 3.
   - What's unclear: Whether URL discovery should happen during SourcePackage assembly (parallel) or during Gemini analysis call preparation.
   - Recommendation: Keep it in `gemini-analysis.ts` as a replacement for `scrapeCommunitySentiment()`. The function signature and integration point in `route.ts` stay identical — URL discovery + scraping is an implementation detail of the community content function, not a separate data source.

3. **`reddit_tone` field in SentimentIntelligenceSection**
   - What we know: D-14 specifies `reddit_tone: 'bullish' | 'bearish' | 'neutral' | null` as "derived by Gemini from community content."
   - What's unclear: When and how Gemini derives this — is it a pre-analysis step or part of the main Gemini call?
   - Recommendation: Do not try to extract `reddit_tone` as a structured field from Gemini. Instead, the Gemini prompt already produces `market_sentiment` which incorporates community content. Set `reddit_tone: null` in the `SentimentIntelligenceSection` (which is assembled before Gemini runs), and note that the qualitative tone is represented in the community markdown that flows into the Gemini prompt. If the planner wants a separate `reddit_tone` derivation, that would require an extra Gemini call — suggest deferring.

---

## Sources

### Primary (HIGH confidence)
- Live API test: `api.stocktwits.com/api/2/streams/symbol/GME.json` — verified message structure, entities.sentiment, missing is_trending flag
- Live node test: `yahoo-finance2.options('AAPL')` — verified openInterest field, chain structure, single-expiry return
- `/Users/tj/Desktop/Cipher/node_modules/@mendable/firecrawl-js/dist/index.d.ts` — verified fc.scrape() signature
- `/Users/tj/Desktop/Cipher/package.json` — verified all required dependencies already installed
- `/Users/tj/Desktop/Cipher/src/lib/gemini-analysis.ts` — verified current scrapeCommunitySentiment() and AnalysisResultSchema patterns
- `/Users/tj/Desktop/Cipher/src/lib/data/finnhub.ts` — verified data source file pattern to follow
- `/Users/tj/Desktop/Cipher/src/lib/data/anthropic-search.ts` — verified Haiku web_search pattern
- `/Users/tj/Desktop/Cipher/src/lib/types.ts` — verified existing SourcePackage and AnalysisResult shapes
- `/Users/tj/Desktop/Cipher/src/lib/data/source-package.ts` — verified collectAllData() parallel pattern
- `/Users/tj/Desktop/Cipher/src/components/ResearchReport.tsx` — verified report component patterns and existing sections

### Secondary (MEDIUM confidence)
- None required — all critical decisions verified via direct code/API inspection.

---

## Metadata

**Confidence breakdown:**
- StockTwits API structure: HIGH — live API tested
- Firecrawl scrape() API: HIGH — verified from installed package typings
- yahoo-finance2 options(): HIGH — live tested with real ticker
- Architecture patterns: HIGH — verified from existing codebase patterns
- UI integration: HIGH — ResearchReport.tsx fully read
- `reddit_tone` derivation: LOW — CONTEXT.md implies Gemini derives it but mechanism is unclear

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (StockTwits API structure is stable; yahoo-finance2 options API is stable)
