# Phase 13: Deep Sentiment Intelligence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 13-deep-sentiment-intelligence
**Areas discussed:** Phase 12 Overlap, StockTwits API Scope, Options Put/Call Ratio, Report Rendering

---

## Phase 12 Overlap

| Option | Description | Selected |
|--------|-------------|----------|
| Replace scrapeCommunitySentiment() | Rework to use Anthropic Haiku URL discovery → Firecrawl scrape. One function, better quality, more URLs. | ✓ |
| Add alongside | Keep Phase 12 fc.search() as fast fallback, add new URL-discovery path as primary | |

**User's choice:** Replace it

**Notes:** User explicitly articulated the intended architecture — Anthropic Haiku (cheap) finds community URLs, Firecrawl scrapes full content. Firecrawl's own search is less good at finding niche discussion threads. Goal is "signal saturation" — cover so many sources that a single wrong signal can't tip the verdict.

---

## Phase 12 Overlap — URL Counts

| Option | Description | Selected |
|--------|-------------|----------|
| Find 10, scrape top 5 | Good balance of coverage vs latency (~5s added) | ✓ |
| Find 15, scrape top 8 | More coverage, ~8-10s added latency, more credits | |
| Find 5, scrape all 5 | Minimal overhead, fastest | |

**User's choice:** Find 10, scrape top 5

---

## Phase 12 Overlap — Community Sources

| Option | Description | Selected |
|--------|-------------|----------|
| Reddit | r/wallstreetbets, r/stocks, r/investing, r/SecurityAnalysis | ✓ |
| StockTwits threads | Individual discussion pages | ✓ |
| SeekingAlpha comments | Article comment sections | ✓ |
| Niche finance forums | Investors Hub, Elite Trader, value investing forums | ✓ |

**User's choice:** All four — plus "anything possible"

**Notes:** User wants dynamic per-ticker URL discovery — not a hardcoded site list. Haiku should search broadly for where THIS specific stock is being discussed, which varies by ticker. User acknowledged this makes the process longer but prioritizes coverage. Source diversity should be researched further during planning phase.

---

## StockTwits API Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Both (API + Firecrawl) | API gives structured bull/bear counts, Firecrawl gives discussion text — different data, complementary | ✓ |
| API only | Skip Firecrawl for StockTwits | |
| Firecrawl only | Don't add StockTwits API | |

**User's choice:** Both

**Notes:** API provides quantitative signal (bull_pct, bear_pct, message_count). Firecrawl provides qualitative discussion text for Gemini to interpret. Recognized as different data types.

---

## StockTwits API — Computed Fields

| Option | Description | Selected |
|--------|-------------|----------|
| Bull %, Bear %, message count + trending | bull_pct, bear_pct, message_count, is_trending | ✓ |
| Just bull/bear % and count | Three fields only | |

**User's choice:** Bull %, Bear %, message count + trending (all four fields)

---

## Options Put/Call Ratio

| Option | Description | Selected |
|--------|-------------|----------|
| Standard thresholds as planned | >1.0 bearish, <0.5 bullish, 0.5-1.0 neutral | ✓ |
| Expose raw ratio only | Let Gemini interpret | |

**User's choice:** Standard thresholds, exactly as planned

---

## Report Rendering — Section Placement

| Option | Description | Selected |
|--------|-------------|----------|
| New Sentiment Intelligence section | Dedicated section after Market Sentiment | ✓ |
| Inject into existing Market Sentiment | Enrich inline, no new section | |
| You decide | Claude picks | |

**User's choice:** New Sentiment Intelligence section + also a new "Future Projection" final section synthesizing everything

**Notes:** User added a requirement for a final section that takes all signals into account and projects forward. This led to the `future_projection` Gemini-generated field.

---

## Report Rendering — Future Projection

| Option | Description | Selected |
|--------|-------------|----------|
| Gemini-generated synthesis | Add future_projection field — Gemini writes 2-3 sentence forward-looking outlook | ✓ |
| Display aggregation only | Assemble existing fields into visual card, no new Gemini field | |
| Both — new Gemini field + visual section | Gemini generates + gets its own display section | |

**User's choice:** Gemini-generated synthesis (new AnalysisResult field)

---

## Report Rendering — Section Prominence

| Option | Description | Selected |
|--------|-------------|----------|
| Compact stats card | Small card with 3 data points: StockTwits bull/bear %, put/call ratio, # community sources | ✓ |
| Full section with details | Full section with sub-rows, expandable community source list | |
| You decide | Claude picks | |

**User's choice:** Compact stats card

---

## Claude's Discretion

- URL ranking logic for selecting top 5 from 10 Haiku-discovered URLs
- Exact Haiku prompt design for per-ticker community URL discovery
- Whether new data sources run in parallel or sequentially (suggest parallel)
- Error handling granularity per new data source
- How StockTwits structured data is injected into the Gemini prompt

## Deferred Ideas

- Live/streaming StockTwits feed (real-time monitoring)
- Options chain visualization chart in report
- YouTube as a community source
- X/Twitter community sentiment (API access issues)
