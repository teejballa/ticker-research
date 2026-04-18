# Phase 13: Deep Sentiment Intelligence - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade the sentiment intelligence pipeline with three additive capabilities:
1. **Rework community scraping** — replace Phase 12's `fc.search()` approach with a two-step: Anthropic Haiku discovers community URLs, Firecrawl scrapes each URL for full content
2. **StockTwits structured data** — add the free StockTwits public API for bull/bear counts alongside Firecrawl community scraping
3. **Options put/call ratio** — add options open interest signal from yahoo-finance2

Also extends the report with:
- Compact **Sentiment Intelligence** stats card (StockTwits + put/call)
- New Gemini-generated **future_projection** field synthesizing all signals into a forward-looking narrative

**Not in scope:** Technical analysis (Phase 14), institutional/insider data (Phase 15), multi-source market data fallback (Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Community Scraping Architecture (Phase 12 rework)
- **D-01:** Replace `scrapeCommunitySentiment()` entirely — the Phase 12 `fc.search()` approach (limit: 3) is replaced with: Anthropic Haiku (cheap, fast) discovers community discussion URLs → Firecrawl scrapes full content from each URL
- **D-02:** URL discovery is **dynamic per-ticker**, not a fixed site list. Haiku searches broadly for where THIS specific stock is being discussed — this changes by ticker (GME → different forums than AAPL)
- **D-03:** Haiku finds 10 candidate URLs; Firecrawl scrapes the top 5 most relevant. Good balance of coverage vs latency and Firecrawl credit usage
- **D-04:** Target sources include (but are not limited to, since discovery is dynamic): Reddit (r/wallstreetbets, r/stocks, r/investing, r/SecurityAnalysis), StockTwits discussion threads, SeekingAlpha article comments, niche finance forums (Investors Hub, Elite Trader, value investing communities). The goal is "signal saturation" — cover so many sources that no single wrong signal can tip the sentiment verdict

### StockTwits API
- **D-05:** Call BOTH the StockTwits API AND Firecrawl-scrape StockTwits threads — they provide different data types:
  - API → structured bull/bear counts: `bull_pct`, `bear_pct`, `message_count`, `is_trending`
  - Firecrawl → full discussion text that Gemini can read qualitatively
- **D-06:** New file: `src/lib/data/stocktwits.ts` — wraps `GET https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json` (free, no auth)
- **D-07:** Compute from API response: bull_pct (% of labeled messages that are bullish), bear_pct, total message_count in stream, is_trending (from API trending flag if available)
- **D-08:** StockTwits API result is stored in a new `SentimentIntelligenceSection` field on SourcePackage (separate from community text content which flows into Gemini prompt)

### Options Put/Call Ratio
- **D-09:** New file: `src/lib/data/options-sentiment.ts` — calls `yahoo-finance2.options(ticker)` to get options chains
- **D-10:** Compute from options chains: total call open interest vs total put open interest → put_call_ratio
- **D-11:** Interpretation thresholds: >1.0 = bearish, <0.5 = bullish, 0.5–1.0 = neutral. Standard Wall Street thresholds.
- **D-12:** Fields: `put_call_ratio: number | null`, `put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null`
- **D-13:** If options data is unavailable or errors (common for smaller tickers), gracefully return nulls — not a blocking failure

### New SourcePackage Section
- **D-14:** Add `sentiment_intelligence` section to SourcePackage:
  ```typescript
  export interface SentimentIntelligenceSection extends SourceSection {
    stocktwits_bull_pct: number | null;
    stocktwits_bear_pct: number | null;
    stocktwits_message_count: number | null;
    stocktwits_is_trending: boolean | null;
    reddit_tone: 'bullish' | 'bearish' | 'neutral' | null;  // derived by Gemini from community content
    put_call_ratio: number | null;
    put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
  }
  ```

### AnalysisResult Schema Extension
- **D-15:** Add `future_projection: string` to AnalysisResult — Gemini generates a 2-3 sentence forward-looking outlook synthesizing ALL signals (technicals, sentiment, fundamentals, catalysts). This is the capstone output of the report.
- **D-16:** The Gemini prompt must instruct: synthesize StockTwits bull/bear data + put/call ratio + community tone + all existing signals into the future_projection — it should reference specific data points from the new sentiment signals
- **D-17:** Add `sentiment_intelligence` summary to AnalysisResult for report display (structured fields, not just the community text blob that already exists)

### Report UI
- **D-18:** New **Sentiment Intelligence** compact stats card in the report — appears after Market Sentiment section. Shows: StockTwits bull% / bear%, put/call ratio + label (BULLISH/BEARISH/NEUTRAL), number of community sources scraped. Compact/scannable — not a full section.
- **D-19:** New **Forward Outlook** section at the end of the report — renders `future_projection` from Gemini. This is the final section, synthesizing everything into a forward-looking narrative.
- **D-20:** Both new UI elements use existing report component patterns (same shadcn/ui Card, same dark-mode palette). No new design system changes.

### Claude's Discretion
- How to rank the 10 candidate URLs from Haiku discovery to pick the top 5 for Firecrawl (relevance scoring, source tier weighting, etc.)
- Exact Haiku prompt design for URL discovery — how to phrase the search to find niche communities
- Whether to run StockTwits API + options + Haiku URL discovery in parallel or sequentially (suggest parallel)
- Error handling granularity for each new data source
- How to pass StockTwits structured data to Gemini — as part of the community section header or as a separate prompt section

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current community scraping (being replaced)
- `src/lib/gemini-analysis.ts` — `scrapeCommunitySentiment()` function (lines ~121-160): the function being replaced. Understand its current `fc.search()` approach and how its return value (markdown string) feeds into `buildUserPrompt()`
- `src/app/api/analysis/[ticker]/route.ts` — Where `scrapeCommunitySentiment()` is called (line ~95); community content flows into `runGeminiAnalysis()`

### Types to extend
- `src/lib/types.ts` — `SourcePackage`, `AnalysisResult`, existing `SocialSentimentSection` — understand all before modifying. `AnalysisResult` already has `community_sentiment_available: boolean` (D-11 from Phase 12)
- `src/lib/data/source-package.ts` — Where SourcePackage is assembled; new `sentiment_intelligence` section added here

### Existing data patterns to follow
- `src/lib/data/finnhub.ts` — Pattern for wrapping an external API with graceful null returns on failure
- `src/lib/data/yahoo.ts` — Pattern for yahoo-finance2 calls; `options()` method used here for put/call
- `src/lib/data/anthropic-search.ts` — `fetchSocialSentiment()` shows how Anthropic web search is used for URL discovery; adapt this pattern for Haiku-powered community URL discovery

### Report UI patterns
- `src/app/research/[ticker]/` — Existing report renderer; new Sentiment Intelligence card and Forward Outlook section added here
- Phase 12 report additions for reference: executive_summary, investment_thesis, catalyst_watch rendering patterns

### Project constraints
- `CLAUDE.md` — Architecture principles, separation of data collection vs reasoning layers
- `.planning/phases/12-intelligence-pipeline-rebuild-replace-notebooklm-with-polygo/12-CONTEXT.md` — Phase 12 decisions; D-06 through D-08 explain Firecrawl's role; D-11 explains AnalysisResult schema backward compatibility requirement

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scrapeCommunitySentiment(ticker)` in `gemini-analysis.ts` — being replaced, but its return signature (string → community markdown) and how it's consumed in `buildUserPrompt()` are the integration contract
- `fetchSocialSentiment()` in `anthropic-search.ts` — shows pattern for using Anthropic web search with specific site targeting; adapt for Haiku URL discovery
- Firecrawl client setup in `gemini-analysis.ts` — `new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY })` pattern already established; reuse
- `src/lib/data/finnhub.ts` / `polygon.ts` — optional API key pattern (`if (!process.env.X_API_KEY) return null`) to follow for new data sources

### Established Patterns
- All new data source files go in `src/lib/data/` — one file per external source
- Graceful null return on API failure — never throw from data collection functions
- StockTwits and options-sentiment are additive — existing tests and behavior unaffected

### Integration Points
- `src/lib/data/source-package.ts` `assembleSourcePackage()` — add `sentiment_intelligence` fetching (parallel with other data sources)
- `src/lib/gemini-analysis.ts` `buildUserPrompt()` — receives the new structured StockTwits data and injects it as a labeled section
- `src/lib/types.ts` — `SourcePackage` and `AnalysisResult` both need new fields
- `AnalysisResultSchema` (Zod) in `gemini-analysis.ts` — add `future_projection: z.string()` and `sentiment_intelligence` summary fields

</code_context>

<specifics>
## Specific Ideas

- The "signal saturation" goal: discover so many community sources per ticker that no single source can tip the sentiment verdict incorrectly. Haiku's search should be broad and dynamic — not hardcoded to 4 sites.
- StockTwits API endpoint: `https://api.stocktwits.com/api/2/streams/symbol/{TICKER}.json` — no auth, public, returns last 30 messages with `sentiment: { basic: 'Bullish' | 'Bearish' }` labels on each message (not all messages are labeled)
- For `future_projection`, the Gemini prompt should explicitly say: "Synthesize StockTwits bull/bear sentiment, options put/call ratio, community tone, price target, catalyst_watch events, and fundamental signals into a 2-3 sentence forward-looking outlook for this stock. Be specific, cite signals."
- Compact Sentiment Intelligence card: three stat chips (bull% | bear% | P/C ratio) + a small "N community sources" label. Similar style to confidence level display.

</specifics>

<deferred>
## Deferred Ideas

- Live/streaming StockTwits feed (real-time monitoring) — too complex, batch per-run is correct
- Options chain visualization in report (showing call/put distribution chart) — Phase 14+ UI work
- YouTube sentiment analysis as a source — can be added to Haiku URL discovery targets in the future
- X/Twitter community sentiment — API access issues; defer

</deferred>

---

*Phase: 13-deep-sentiment-intelligence*
*Context gathered: 2026-04-18*
