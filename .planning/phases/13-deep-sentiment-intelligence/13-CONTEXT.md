# Phase 13 — Deep Sentiment Intelligence

## Goal
Replace the single Anthropic web search sentiment call with real-time multi-source sentiment
aggregation: StockTwits API, targeted Reddit scraping, and options market sentiment (put/call ratio).

## Motivation
The current `fetchSocialSentiment()` in `src/lib/data/anthropic-search.ts` runs one web search
prompt to infer sentiment from Reddit/StockTwits/financial press. This produces low-signal,
often-stale results. Phase 13 replaces it with direct API/scraping feeds.

## Planned Approach

### StockTwits (no auth, free)
- GET `https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json`
- Returns last 30 messages with bull/bear labels from users
- Compute: message count, bull%, bear%, trending status
- New file: `src/lib/data/stocktwits.ts`

### Reddit targeted scraping (Firecrawl)
- Firecrawl search: `{ticker} site:reddit.com/r/wallstreetbets OR site:reddit.com/r/stocks OR site:reddit.com/r/investing`
- Limit 5 results, extract post titles + upvotes + comment counts
- Compute: overall directional tone, top cited reasons
- New file: `src/lib/data/reddit-sentiment.ts`

### Options sentiment (yahoo-finance2)
- `yahoo-finance2.options(ticker)` returns calls/puts chains
- Compute: total call OI vs total put OI → put/call ratio
- Put/call > 1.0 = bearish, < 0.5 = bullish, 0.5–1.0 = neutral
- New file: `src/lib/data/options-sentiment.ts`

## New SourcePackage section

```typescript
export interface SentimentIntelligenceSection extends SourceSection {
  stocktwits_bull_pct: number | null;
  stocktwits_bear_pct: number | null;
  stocktwits_message_count: number | null;
  reddit_tone: 'bullish' | 'bearish' | 'neutral' | null;
  reddit_top_signals: string[];
  put_call_ratio: number | null;
  put_call_interpretation: 'bullish' | 'bearish' | 'neutral' | null;
}
```

## New AnalysisResult section
Add `sentiment_intelligence` section rendered in report UI alongside existing social sentiment.

## Dependencies
- Firecrawl API key (already available: `FIRECRAWL_API_KEY`)
- No new API keys required (StockTwits is public, yahoo-finance2 already installed)
