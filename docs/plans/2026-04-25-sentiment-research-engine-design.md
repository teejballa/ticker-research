# Design: Behavioral Sentiment Research Engine
**Date:** 2026-04-25  
**Status:** Approved

---

## Research Thesis

*Which dimension of public sentiment — direction, volume, quality, or community diffusion — best predicts short-term stock price movement?*

Specifically: niche, analytical communities discuss stocks before mainstream communities do. The gap between niche and mainstream discussion intensity — and how quickly it closes — is a leading indicator of price movement.

---

## What the App Is

A behavioral finance research tool with two equal halves:

1. **User Reports** — run a ticker, get a full research report with deep community sentiment analysis
2. **Autonomous Research Engine** — background scanner that continuously collects sentiment + price data across a curated ticker list, tests the thesis, and auto-improves the insights page

The `/insights` page is the living output of the research engine — it updates automatically whether or not any user ever touches the app.

---

## Two Parallel Systems

### System 1 — User Reports (existing + enhanced)
- User searches ticker → full report
- Community sentiment collected at full depth: 8–10 sources via Firecrawl + StockTwits
- Gemini quality scoring on message text
- Price snapshotted at report time
- Price outcomes checked at 3, 7, 14 days via daily cron
- All data feeds the insights page

### System 2 — Autonomous Background Scanner (new)
- Runs every 3 days via Vercel cron
- Curated list of ~30 tickers
- Lightweight collection: StockTwits + 3 Firecrawl sources (one analytical, one mainstream, one niche)
- No Gemini, no full report — just sentiment snapshot + price
- Price outcomes checked at 3 and 7 days
- Feeds the same insights page as user reports
- Runs forever, accumulates evidence continuously

---

## The 4 Sentiment Axes

| Axis | What It Measures | Source |
|------|-----------------|--------|
| **Direction** | Bull % vs Bear % among labeled messages | StockTwits + community sentiment labels |
| **Quantity** | Message volume vs ticker's historical baseline | Post counts from all sources + DB history |
| **Quality** | Analytical reasoning vs hype language (0–10 score) | Gemini classifier on message text |
| **Diffusion Gap** | Niche community volume ÷ Mainstream community volume | Computed from tier post counts |

The Diffusion Gap is the novel metric: high gap (niche active, mainstream quiet) = early signal stage. Low/inverted gap = idea has fully diffused, likely near peak hype.

---

## Community Tiers

| Tier | Sources | Signal Role |
|------|---------|-------------|
| **Analytical/Early** | r/SecurityAnalysis, r/ValueInvesting, ticker-specific subreddits, SeekingAlpha comments | Where informed discussion originates |
| **Middle** | r/investing, r/stocks, InvestorsHub | Bridging layer |
| **Mainstream/Late** | r/WallStreetBets, StockTwits, Yahoo Finance boards | Where ideas arrive after spreading |

Full reports scrape all tiers (8–10 sources). Background scanner uses 3 sources (one per tier).

---

## DB Schema

```prisma
model Report {
  // existing fields unchanged +
  price_at_report  Float?
  community_data   Json?        // full tier breakdown, 4 axes, diffusion gap
  outcomes         PriceOutcome[]
}

model SentimentSnapshot {
  id              String   @id @default(uuid())
  ticker          String
  scanned_at      DateTime @db.Timestamptz
  price_at_scan   Float
  community_data  Json     // lightweight: 3 sources, 4 axes
  outcomes        PriceOutcome[]
  @@index([ticker, scanned_at(sort: Desc)])
  @@map("sentiment_snapshots")
}

model PriceOutcome {
  id           String   @id @default(uuid())
  report_id    String?
  snapshot_id  String?
  days_after   Int      // 3, 7, or 14
  price        Float
  pct_change   Float
  recorded_at  DateTime @db.Timestamptz
  @@map("price_outcomes")
}
```

---

## Cron Jobs

```json
{ "path": "/api/cron/sentiment-scan",  "schedule": "0 8 */3 * *" }
{ "path": "/api/cron/price-followup",  "schedule": "0 6 * * *"   }
```

**sentiment-scan:** Every 3 days. Runs background scanner across ~30 curated tickers.  
**price-followup:** Daily. Finds all Reports and SentimentSnapshots aged exactly 3, 7, or 14 days. Fetches current price via yahoo-finance2. Stores PriceOutcome.

---

## New Files

| File | Purpose |
|------|---------|
| `src/lib/data/communities.ts` | Firecrawl scraper for all community tiers — returns post count, sample text, tier label |
| `src/lib/data/sentiment-scorer.ts` | Gemini quality classifier — scores message text analytical vs hype (0–10) |
| `src/lib/data/ticker-watchlist.ts` | Curated ~30 ticker list for background scanner |
| `src/app/api/cron/sentiment-scan/route.ts` | Background scanner cron handler |
| `src/app/api/cron/price-followup/route.ts` | Price outcome collector cron handler |
| `src/app/api/insights/route.ts` | Aggregated insights query endpoint |
| `src/app/insights/page.tsx` | Research dashboard — primary feature page |
| `src/components/InsightsDashboard.tsx` | Live thesis, diffusion tracker, outcome log, signal breakdown |

---

## Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add SentimentSnapshot, PriceOutcome, extend Report |
| `src/app/api/research/[ticker]/route.ts` | Add community scraping + price snapshot |
| `src/lib/gemini-analysis.ts` | Add quality scoring step |
| `src/components/ResearchReport.tsx` | Add Community Sentiment section (equal visual weight to other sections) |
| `vercel.json` | Add two cron job entries |

---

## `/insights` Page — Four Sections

1. **Live Thesis** — auto-updating statement: "In N data points, high diffusion gap preceded a >5% price move X% of the time within 7 days"
2. **Diffusion Tracker** — tickers currently showing elevated niche activity before mainstream catches up
3. **Outcome Log** — every tracked sentiment signal + what actually happened to price
4. **Signal Quality Breakdown** — which axis (direction/quantity/quality/diffusion gap) has the strongest correlation so far

---

## Cost Profile

| Component | Frequency | Cost |
|-----------|-----------|------|
| Background Firecrawl | 3 sources × 30 tickers × every 3 days | ~$0.50–1/month |
| Price follow-up cron | yahoo-finance2, free | $0 |
| Background scanner | No Gemini, intentionally lean | $0 |
| User report Firecrawl | 8–10 sources, user-triggered only | ~$0.02–0.05/report |
| User report Gemini | Existing cost + quality scoring | Minimal increment |

Total estimated: **under $2/month** at personal-project scale.

---

## Priorities
1. No errors — robust error handling on all Firecrawl scrapes, cron jobs, and DB writes
2. Low cost — background scanner never calls Gemini; Firecrawl rate limited
3. Research quality — diffusion gap and quality score are real, meaningful signals
4. Impressiveness — the app improves itself; the thesis page reflects real accumulated evidence
