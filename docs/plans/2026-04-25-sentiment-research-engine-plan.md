# Behavioral Sentiment Research Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Cipher into a self-improving behavioral finance research engine with multi-tier community sentiment analysis, autonomous background scanning, and a live research insights page — while keeping reports exactly as they are.

**Architecture:** Two parallel systems share a DB: (1) user-triggered reports that store full 4-axis sentiment dimensions alongside the existing analysis, and (2) an autonomous background scanner that runs every 3 days on ~30 curated tickers with no Gemini calls. A daily price follow-up cron closes the prediction loop by checking outcomes at 3, 7, and 14 days. The `/insights` page queries the DB and surfaces correlation patterns across both data streams.

**Tech Stack:** Next.js App Router, Prisma 7 + Neon, Vercel crons, `@mendable/firecrawl-js` (v4), `yahoo-finance2` (v3), AI SDK + Gemini via Vercel AI Gateway, Anthropic Haiku for extraction, Playwright for E2E tests.

**Community Tiers (critical — enforce everywhere):**
- **mainstream**: r/WallStreetBets, Yahoo Finance message boards, StockTwits
- **middle**: r/investing, r/stocks, SeekingAlpha, r/SecurityAnalysis
- **niche**: Haiku-discovered sector-specific communities (ValueInvestorsClub, EliteTrader, ticker-specific subreddits like r/NVDA, industry blogs, Bogleheads)

---

## Task 1: DB Schema — Add SentimentSnapshot, PriceOutcome, Extend Report

**Files:**
- Modify: `prisma/schema.prisma`
- Run: `npx prisma migrate dev`

**Step 1: Update schema**

```prisma
// prisma/schema.prisma
// Add to existing Report model:
model Report {
  id               String   @id @default(uuid())
  user_id          String
  ticker           String
  company_name     String
  analyzed_at      DateTime @db.Timestamptz
  market_sentiment String
  confidence_level String
  analysis         Json
  price_at_report  Float?
  community_data   Json?    // SentimentDimensions shape stored here

  outcomes         PriceOutcome[]

  @@index([user_id, analyzed_at(sort: Desc)])
  @@map("reports")
}

// New models — add after Report:
model SentimentSnapshot {
  id            String   @id @default(uuid())
  ticker        String
  scanned_at    DateTime @db.Timestamptz
  price_at_scan Float
  community_data Json    // SentimentDimensions shape

  outcomes      PriceOutcome[]

  @@index([ticker, scanned_at(sort: Desc)])
  @@map("sentiment_snapshots")
}

model PriceOutcome {
  id          String   @id @default(uuid())
  report_id   String?
  snapshot_id String?
  days_after  Int
  price       Float
  pct_change  Float
  recorded_at DateTime @db.Timestamptz

  report      Report?            @relation(fields: [report_id], references: [id])
  snapshot    SentimentSnapshot? @relation(fields: [snapshot_id], references: [id])

  @@map("price_outcomes")
}
```

**Step 2: Run migration**

```bash
cd /Users/tj/Desktop/Cipher
npx prisma migrate dev --name add-sentiment-engine
```

Expected: migration created and applied, `prisma generate` runs automatically via postinstall.

**Step 3: Verify**

```bash
npx prisma studio
```

Confirm `sentiment_snapshots` and `price_outcomes` tables exist alongside updated `reports`.

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add SentimentSnapshot, PriceOutcome, extend Report with sentiment dims"
```

---

## Task 2: Update CommunityHighlight Type to 3 Tiers

**Files:**
- Modify: `src/lib/types.ts:27-30`

**Step 1: Update community_type union**

In `src/lib/types.ts`, find the `CommunityHighlight` interface and change `community_type`:

```typescript
export interface CommunityHighlight {
  community_name: string;
  community_type: 'mainstream' | 'middle' | 'niche'; // was: 'mainstream' | 'niche'
  audience: string;
  standout_quote: string;
  theme: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  engagement_signal: 'high' | 'medium' | 'low';
  quotes?: string[];
  recurring_themes?: string[];
  unique_to_community?: string[];
  analysis_paragraph?: string;
}
```

**Step 2: Update Zod schema in gemini-analysis.ts**

Find `CommunityHighlightSchema` in `src/lib/gemini-analysis.ts` and update the enum:

```typescript
const CommunityHighlightSchema = z.object({
  // ...existing fields...
  community_type: z.enum(['mainstream', 'middle', 'niche']), // was: ['mainstream', 'niche']
  // ...
});
```

**Step 3: Build check**

```bash
npx tsc --noEmit
```

Expected: no type errors.

**Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/gemini-analysis.ts
git commit -m "feat(types): add 'middle' community tier to CommunityHighlight"
```

---

## Task 3: Update Community Tier Classification in Scraper

**Files:**
- Modify: `src/lib/gemini-analysis.ts` (PINNED_URLS, extractCommunityHighlights prompt)

**Step 1: Update PINNED_URLS to include mainstream and middle tiers**

Find `const PINNED_URLS` (~line 236) and replace:

```typescript
// Mainstream tier — high volume, hype-heavy, where ideas arrive after spreading
const MAINSTREAM_URLS = [
  'https://finance.yahoo.com/quote/{TICKER}/community/',
  'https://www.reddit.com/r/wallstreetbets/search/?q={TICKER}&sort=new',
];

// Middle tier — mixed quality, general investor audience
const MIDDLE_URLS = [
  'https://www.reddit.com/search/?q={TICKER}+stock&sort=new',
  'https://seekingalpha.com/symbol/{TICKER}',
];

function buildTieredUrls(ticker: string): { mainstream: string[]; middle: string[] } {
  return {
    mainstream: MAINSTREAM_URLS.map(u => u.replace('{TICKER}', encodeURIComponent(ticker))),
    middle: MIDDLE_URLS.map(u => u.replace('{TICKER}', encodeURIComponent(ticker))),
  };
}
```

**Step 2: Update scrapeCommunitySentiment to track tier counts**

Update the return type and tracking in `scrapeCommunitySentiment`:

```typescript
export async function scrapeCommunitySentiment(
  ticker: string,
  companyName: string,
): Promise<{
  pinnedContent: string;
  nicheContent: string;
  nicheUrls: string[];
  pageCount: number;
  mainstreamPageCount: number;
  middlePageCount: number;
  nichePageCount: number;
}> {
  const empty = {
    pinnedContent: '', nicheContent: '', nicheUrls: [],
    pageCount: 0, mainstreamPageCount: 0, middlePageCount: 0, nichePageCount: 0,
  };
  if (!process.env.FIRECRAWL_API_KEY) return empty;

  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const { mainstream, middle } = buildTieredUrls(ticker);

  // Scrape mainstream and middle in parallel
  const [mainstreamScraped, middleScraped] = await Promise.all([
    Promise.all(mainstream.map(u => scrapeUrlWithFirecrawl(fc, u))),
    Promise.all(middle.map(u => scrapeUrlWithFirecrawl(fc, u))),
  ]);

  const mainstreamPages = mainstreamScraped.filter(Boolean);
  const middlePages = middleScraped.filter(Boolean);

  // Reddit thread extraction from middle search
  const redditSearchMarkdown = middleScraped[0] ?? '';
  const redditThreadUrls = extractRedditThreadUrls(redditSearchMarkdown);
  const redditThreadPages = redditThreadUrls.length > 0
    ? (await Promise.all(redditThreadUrls.map(u => scrapeUrlWithFirecrawl(fc, u)))).filter(Boolean)
    : [];

  // Pool B: Niche discovery via Haiku (unchanged logic)
  // ... existing Haiku discovery code unchanged ...

  const allMiddlePages = [...middlePages, ...redditThreadPages];
  const pageCount = mainstreamPages.length + allMiddlePages.length + nichePages.length;

  return {
    pinnedContent: [...mainstreamPages, ...allMiddlePages].join('\n\n---\n\n'),
    nicheContent: nichePages.join('\n\n---\n\n'),
    nicheUrls: uniqueNiche,
    pageCount,
    mainstreamPageCount: mainstreamPages.length,
    middlePageCount: allMiddlePages.length,
    nichePageCount: nichePages.length,
  };
}
```

**Step 3: Update extractCommunityHighlights prompt for 3 tiers**

Find the `community_type` instruction in the extraction prompt and replace:

```
- community_type: "mainstream" for r/WallStreetBets and Yahoo Finance boards; "middle" for r/investing, r/stocks, SeekingAlpha, r/SecurityAnalysis; "niche" for all sector-specific, ticker-specific, or specialized communities (ValueInvestorsClub, EliteTrader, r/NVDA, industry blogs, Bogleheads).
```

**Step 4: Build check + test**

```bash
npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/lib/gemini-analysis.ts
git commit -m "feat(scraper): 3-tier community classification (mainstream/middle/niche)"
```

---

## Task 4: Sentiment Dimensions Utility

**Files:**
- Create: `src/lib/sentiment-dimensions.ts`
- Create: `src/lib/sentiment-dimensions.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/sentiment-dimensions.test.ts
import { computeSentimentDimensions } from './sentiment-dimensions';
import type { CommunityHighlight } from './types';

const makeHighlight = (
  type: 'mainstream' | 'middle' | 'niche',
  sentiment: 'bullish' | 'bearish' | 'neutral',
  engagement: 'high' | 'medium' | 'low',
): CommunityHighlight => ({
  community_name: 'test',
  community_type: type,
  audience: 'test',
  standout_quote: 'test',
  theme: 'test',
  sentiment,
  engagement_signal: engagement,
});

describe('computeSentimentDimensions', () => {
  it('computes direction from bull/bear pcts', () => {
    const result = computeSentimentDimensions([], { bull: 70, bear: 30, messageCount: 100 });
    expect(result.direction).toBeCloseTo(0.7);
  });

  it('computes diffusion gap as niche / mainstream engagement', () => {
    const highlights = [
      makeHighlight('niche', 'bullish', 'high'),
      makeHighlight('niche', 'bullish', 'high'),
      makeHighlight('mainstream', 'bullish', 'low'),
    ];
    const result = computeSentimentDimensions(highlights, null);
    // 2 niche (high=2 each) vs 1 mainstream (low=1) → gap = 4/1 = 4
    expect(result.diffusion_gap).toBe(4);
  });

  it('returns diffusion_gap of 1 when no highlights', () => {
    const result = computeSentimentDimensions([], null);
    expect(result.diffusion_gap).toBe(1);
  });

  it('computes quality from ratio of niche to total highlights', () => {
    const highlights = [
      makeHighlight('niche', 'bullish', 'high'),
      makeHighlight('mainstream', 'bullish', 'low'),
    ];
    const result = computeSentimentDimensions(highlights, null);
    expect(result.quality).toBeCloseTo(0.5);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx jest src/lib/sentiment-dimensions.test.ts --no-coverage
```

Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// src/lib/sentiment-dimensions.ts
import type { CommunityHighlight } from './types';

export interface SentimentDimensions {
  direction: number;       // 0–1: fraction bullish across all sources (0.5 = neutral)
  quantity: number;        // total engagement score across all communities
  quality: number;         // 0–1: fraction of engagement from niche/middle vs mainstream
  diffusion_gap: number;   // niche engagement / mainstream engagement (>1 = early signal)
  tier_breakdown: {
    mainstream: number;    // engagement score for mainstream tier
    middle: number;
    niche: number;
  };
  computed_at: string;     // ISO timestamp
}

// Engagement weight by signal strength
const ENGAGEMENT_WEIGHTS: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Sentiment score contribution
const SENTIMENT_SCORES: Record<string, number> = {
  bullish: 1,
  neutral: 0.5,
  bearish: 0,
};

export function computeSentimentDimensions(
  highlights: CommunityHighlight[],
  stocktwits: { bull: number; bear: number; messageCount: number } | null,
): SentimentDimensions {
  // Per-tier engagement totals
  const tierEngagement = { mainstream: 0, middle: 0, niche: 0 };
  let weightedSentimentSum = 0;
  let totalWeight = 0;

  for (const h of highlights) {
    const weight = ENGAGEMENT_WEIGHTS[h.engagement_signal] ?? 1;
    const tier = h.community_type as keyof typeof tierEngagement;
    if (tier in tierEngagement) tierEngagement[tier] += weight;
    weightedSentimentSum += SENTIMENT_SCORES[h.sentiment] * weight;
    totalWeight += weight;
  }

  // Direction: weighted average from communities + StockTwits
  let direction = 0.5;
  if (stocktwits && stocktwits.messageCount > 0) {
    const stBull = stocktwits.bull / 100;
    const stWeight = Math.min(stocktwits.messageCount / 50, 3); // cap StockTwits influence
    if (totalWeight > 0) {
      direction = (weightedSentimentSum + stBull * stWeight) / (totalWeight + stWeight);
    } else {
      direction = stBull;
    }
  } else if (totalWeight > 0) {
    direction = weightedSentimentSum / totalWeight;
  }

  // Quantity: total cross-community engagement score
  const quantity = tierEngagement.mainstream + tierEngagement.middle + tierEngagement.niche +
    (stocktwits ? Math.min(stocktwits.messageCount / 10, 20) : 0);

  // Quality: fraction of engagement from niche + middle sources (vs mainstream hype)
  const analyticalEngagement = tierEngagement.niche + tierEngagement.middle;
  const quality = quantity > 0 ? analyticalEngagement / quantity : 0.5;

  // Diffusion gap: niche / mainstream ratio (>1 = niche more active = early signal)
  const diffusion_gap = tierEngagement.mainstream > 0
    ? tierEngagement.niche / tierEngagement.mainstream
    : tierEngagement.niche > 0 ? 4 : 1; // if no mainstream but niche active = strong early signal

  return {
    direction: Math.max(0, Math.min(1, direction)),
    quantity,
    quality: Math.max(0, Math.min(1, quality)),
    diffusion_gap,
    tier_breakdown: { ...tierEngagement },
    computed_at: new Date().toISOString(),
  };
}
```

**Step 4: Run tests to verify passing**

```bash
npx jest src/lib/sentiment-dimensions.test.ts --no-coverage
```

Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add src/lib/sentiment-dimensions.ts src/lib/sentiment-dimensions.test.ts
git commit -m "feat(sentiment): 4-axis sentiment dimension calculator with tier breakdown"
```

---

## Task 5: Store Sentiment Dimensions + Price on Report Run

**Files:**
- Modify: `src/lib/reports-db.ts`
- Modify: `src/app/api/analysis/[ticker]/route.ts`

**Step 1: Update writeReportToDb to accept sentiment dimensions + price**

In `src/lib/reports-db.ts`, update `writeReportToDb`:

```typescript
import type { SentimentDimensions } from './sentiment-dimensions';

export async function writeReportToDb(
  result: AnalysisResult,
  userId: string,
  opts?: { price_at_report?: number; community_data?: SentimentDimensions },
): Promise<string> {
  const report = await prisma.report.create({
    data: {
      user_id: userId,
      ticker: result.ticker,
      company_name: result.company_name,
      analyzed_at: new Date(result.analyzed_at),
      market_sentiment: result.market_sentiment,
      confidence_level: result.confidence_level,
      analysis: result as object,
      price_at_report: opts?.price_at_report ?? null,
      community_data: opts?.community_data ? (opts.community_data as object) : undefined,
    },
  });
  return report.id;
}
```

**Step 2: Fetch price + compute dimensions in analysis route**

In `src/app/api/analysis/[ticker]/route.ts`, add after the `runGeminiAnalysis` call (around line 115):

```typescript
import { computeSentimentDimensions } from '@/lib/sentiment-dimensions';
import YahooFinance from 'yahoo-finance2';

// After: const result = await runGeminiAnalysis(...)

// Snapshot price and compute sentiment dimensions (non-fatal)
let priceAtReport: number | undefined;
let communityData: import('@/lib/sentiment-dimensions').SentimentDimensions | undefined;
try {
  const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  const quote = await yf.quote(ticker);
  priceAtReport = typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : undefined;

  const stocktwitsData = result.sentiment_intelligence_summary;
  communityData = computeSentimentDimensions(
    result.community_highlights ?? [],
    stocktwitsData?.stocktwits_bull_pct != null && stocktwitsData?.stocktwits_message_count != null
      ? {
          bull: stocktwitsData.stocktwits_bull_pct,
          bear: stocktwitsData.stocktwits_bear_pct ?? 0,
          messageCount: stocktwitsData.stocktwits_message_count,
        }
      : null,
  );
} catch {
  // Non-fatal — report saves without sentiment dims if price fetch fails
}
```

Then update the DB write call to pass opts:

```typescript
await writeReportToDb(result, sess.user.email, {
  price_at_report: priceAtReport,
  community_data: communityData,
});
```

**Step 3: Build check**

```bash
npx tsc --noEmit
```

Expected: clean.

**Step 4: Commit**

```bash
git add src/lib/reports-db.ts src/app/api/analysis/[ticker]/route.ts
git commit -m "feat(reports): store price snapshot + sentiment dimensions on every report run"
```

---

## Task 6: Ticker Watchlist

**Files:**
- Create: `src/lib/data/ticker-watchlist.ts`

**Step 1: Create watchlist**

```typescript
// src/lib/data/ticker-watchlist.ts
// Curated ~30 tickers for autonomous background sentiment scanning.
// Mix of: mega-cap (always discussed), volatile (high community signal), sector leaders.
// Rebalance quarterly — add tickers that are generating community discussion.

export const WATCHLIST_TICKERS: string[] = [
  // Mega-cap — always active across all tiers
  'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA',
  // High community signal — frequently discussed in niche communities
  'AMD', 'PLTR', 'SOFI', 'HOOD', 'COIN', 'RBLX', 'SNAP',
  // Sector leaders — analytical community coverage
  'JPM', 'BAC', 'XOM', 'CVX', 'LLY', 'UNH',
  // High volatility / speculative — strong niche/mainstream divergence signal
  'GME', 'AMC', 'BBBY', 'MSTR', 'SMCI',
  // Index proxies — macro sentiment baseline
  'SPY', 'QQQ', 'IWM',
];
```

**Step 2: Commit**

```bash
git add src/lib/data/ticker-watchlist.ts
git commit -m "feat(scanner): add curated 30-ticker watchlist for background scanner"
```

---

## Task 7: Lightweight Background Community Scraper

**Files:**
- Create: `src/lib/data/lightweight-community-scan.ts`

**Step 1: Implement**

This scraper skips Haiku niche discovery (expensive) and instead uses ticker-specific subreddits as the niche proxy — fast, cheap, effective.

```typescript
// src/lib/data/lightweight-community-scan.ts
// Lightweight 3-source community scan for background scanner.
// No Gemini, no Haiku niche discovery — uses static niche proxy (ticker subreddit).
// Cost: ~3 Firecrawl credits + 1 free StockTwits call per ticker.

import Firecrawl from '@mendable/firecrawl-js';
import { fetchStockTwitsSentiment } from './stocktwits';
import { computeSentimentDimensions, type SentimentDimensions } from '@/lib/sentiment-dimensions';
import type { CommunityHighlight } from '@/lib/types';

async function scrapeOne(fc: Firecrawl, url: string): Promise<string> {
  try {
    const doc = await fc.scrape(url, {
      formats: ['markdown'],
      onlyMainContent: true,
    } as Parameters<typeof fc.scrape>[1]);
    const content = (doc as { markdown?: string }).markdown ?? '';
    return content.length >= 150 ? content : '';
  } catch {
    return '';
  }
}

function extractPostCount(markdown: string): number {
  // Rough proxy: count occurrence of "comment" or "upvote" patterns as engagement signal
  const matches = markdown.match(/\d+\s*(comments?|points?|upvotes?)/gi) ?? [];
  return Math.min(matches.length, 20); // cap at 20
}

export async function lightweightCommunityScan(
  ticker: string,
): Promise<SentimentDimensions | null> {
  if (!process.env.FIRECRAWL_API_KEY) return null;

  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const upperTicker = ticker.toUpperCase();

  // Scrape 3 sources in parallel — one per tier
  const [mainstreamMd, middleMd, nicheMd, stocktwitsResult] = await Promise.all([
    // Mainstream: r/WallStreetBets search
    scrapeOne(fc, `https://www.reddit.com/r/wallstreetbets/search/?q=${upperTicker}&sort=new&t=week`),
    // Middle: r/investing search
    scrapeOne(fc, `https://www.reddit.com/r/investing/search/?q=${upperTicker}&sort=new&t=week`),
    // Niche proxy: ticker-specific subreddit (e.g. r/NVDA) — most targeted discussion
    scrapeOne(fc, `https://www.reddit.com/r/${upperTicker}/new/`),
    // StockTwits: free API
    fetchStockTwitsSentiment(upperTicker),
  ]);

  // Build synthetic highlights from scrape data for dimension computation
  const highlights: CommunityHighlight[] = [];

  if (mainstreamMd) {
    const postCount = extractPostCount(mainstreamMd);
    highlights.push({
      community_name: 'r/wallstreetbets',
      community_type: 'mainstream',
      audience: 'retail momentum traders',
      standout_quote: '',
      theme: 'general discussion',
      sentiment: 'neutral', // lightweight scan — no Gemini sentiment scoring
      engagement_signal: postCount > 10 ? 'high' : postCount > 4 ? 'medium' : 'low',
    });
  }

  if (middleMd) {
    const postCount = extractPostCount(middleMd);
    highlights.push({
      community_name: 'r/investing',
      community_type: 'middle',
      audience: 'general retail investors',
      standout_quote: '',
      theme: 'general discussion',
      sentiment: 'neutral',
      engagement_signal: postCount > 10 ? 'high' : postCount > 4 ? 'medium' : 'low',
    });
  }

  if (nicheMd) {
    const postCount = extractPostCount(nicheMd);
    highlights.push({
      community_name: `r/${upperTicker}`,
      community_type: 'niche',
      audience: 'dedicated ticker community',
      standout_quote: '',
      theme: 'ticker-specific discussion',
      sentiment: 'neutral',
      engagement_signal: postCount > 10 ? 'high' : postCount > 4 ? 'medium' : 'low',
    });
  }

  const stocktwitsInput =
    stocktwitsResult.stocktwits_bull_pct != null && stocktwitsResult.stocktwits_message_count != null
      ? {
          bull: stocktwitsResult.stocktwits_bull_pct,
          bear: stocktwitsResult.stocktwits_bear_pct ?? 0,
          messageCount: stocktwitsResult.stocktwits_message_count,
        }
      : null;

  return computeSentimentDimensions(highlights, stocktwitsInput);
}
```

**Step 2: Build check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/lib/data/lightweight-community-scan.ts
git commit -m "feat(scanner): lightweight 3-source community scraper for background scanner"
```

---

## Task 8: Background Scanner Cron

**Files:**
- Create: `src/app/api/cron/sentiment-scan/route.ts`

**Step 1: Implement**

```typescript
// src/app/api/cron/sentiment-scan/route.ts
// Background sentiment scanner — runs every 3 days via Vercel cron.
// Scans WATCHLIST_TICKERS with lightweight community scraper (no Gemini).
// Stores SentimentSnapshot per ticker. Cost: ~3 Firecrawl credits per ticker.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { WATCHLIST_TICKERS } from '@/lib/data/ticker-watchlist';
import { lightweightCommunityScan } from '@/lib/data/lightweight-community-scan';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function GET(request: NextRequest) {
  // Vercel cron sends Authorization header with CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { scanned: 0, failed: 0, skipped: 0 };

  // Process tickers sequentially to avoid hammering Firecrawl rate limits
  for (const ticker of WATCHLIST_TICKERS) {
    try {
      // Skip if already scanned in the last 2 days (de-duplicate if cron fires early)
      const recent = await prisma.sentimentSnapshot.findFirst({
        where: {
          ticker,
          scanned_at: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
        },
      });
      if (recent) { results.skipped++; continue; }

      // Fetch price
      let price: number | null = null;
      try {
        const quote = await yf.quote(ticker);
        price = typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : null;
      } catch { /* skip price — still scan sentiment */ }

      if (price === null) { results.failed++; continue; }

      // Lightweight community scan
      const communityData = await lightweightCommunityScan(ticker);
      if (!communityData) { results.failed++; continue; }

      await prisma.sentimentSnapshot.create({
        data: {
          ticker,
          scanned_at: new Date(),
          price_at_scan: price,
          community_data: communityData as object,
        },
      });

      results.scanned++;

      // 2-second delay between tickers to respect Firecrawl rate limits
      await new Promise(r => setTimeout(r, 2000));
    } catch {
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
```

**Step 2: Build check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/cron/sentiment-scan/route.ts
git commit -m "feat(cron): background sentiment scanner for watchlist tickers"
```

---

## Task 9: Price Follow-up Cron

**Files:**
- Create: `src/app/api/cron/price-followup/route.ts`

**Step 1: Implement**

```typescript
// src/app/api/cron/price-followup/route.ts
// Daily cron: finds Reports + SentimentSnapshots aged 3, 7, or 14 days.
// Fetches current price via yahoo-finance2, stores PriceOutcome.
// This closes the prediction loop — enables correlation analysis on /insights.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const TARGET_DAYS = [3, 7, 14] as const;

function ageInDays(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

async function fetchPrice(ticker: string): Promise<number | null> {
  try {
    const quote = await yf.quote(ticker);
    return typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { outcomes_recorded: 0, skipped: 0, failed: 0 };

  // ── Reports ──────────────────────────────────────────────────────────────
  const reportsWithPrice = await prisma.report.findMany({
    where: {
      price_at_report: { not: null },
      analyzed_at: {
        // Only reports between 2 and 15 days old could need a new outcome
        gte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        lte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    },
    include: { outcomes: true },
  });

  for (const report of reportsWithPrice) {
    const age = ageInDays(report.analyzed_at);
    for (const targetDay of TARGET_DAYS) {
      if (Math.abs(age - targetDay) > 0.6) continue; // not within window
      const alreadyRecorded = report.outcomes.some(o => o.days_after === targetDay);
      if (alreadyRecorded) { results.skipped++; continue; }

      const currentPrice = await fetchPrice(report.ticker);
      if (currentPrice === null || report.price_at_report === null) {
        results.failed++; continue;
      }

      const pctChange = ((currentPrice - report.price_at_report) / report.price_at_report) * 100;
      await prisma.priceOutcome.create({
        data: {
          report_id: report.id,
          days_after: targetDay,
          price: currentPrice,
          pct_change: pctChange,
          recorded_at: new Date(),
        },
      });
      results.outcomes_recorded++;
    }
  }

  // ── SentimentSnapshots ───────────────────────────────────────────────────
  const snapshots = await prisma.sentimentSnapshot.findMany({
    where: {
      scanned_at: {
        gte: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        lte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    },
    include: { outcomes: true },
  });

  for (const snap of snapshots) {
    const age = ageInDays(snap.scanned_at);
    for (const targetDay of [3, 7] as const) { // snapshots only need 3 and 7 day checks
      if (Math.abs(age - targetDay) > 0.6) continue;
      const alreadyRecorded = snap.outcomes.some(o => o.days_after === targetDay);
      if (alreadyRecorded) { results.skipped++; continue; }

      const currentPrice = await fetchPrice(snap.ticker);
      if (currentPrice === null) { results.failed++; continue; }

      const pctChange = ((currentPrice - snap.price_at_scan) / snap.price_at_scan) * 100;
      await prisma.priceOutcome.create({
        data: {
          snapshot_id: snap.id,
          days_after: targetDay,
          price: currentPrice,
          pct_change: pctChange,
          recorded_at: new Date(),
        },
      });
      results.outcomes_recorded++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
```

**Step 2: Build check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/cron/price-followup/route.ts
git commit -m "feat(cron): daily price follow-up cron closes prediction loop at 3/7/14 days"
```

---

## Task 10: Vercel Cron Config + CRON_SECRET Env Var

**Files:**
- Modify: `vercel.json`

**Step 1: Add crons**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "next build",
  "functions": {
    "src/app/api/analysis/**/*": { "maxDuration": 300 },
    "src/app/api/research/**/*": { "maxDuration": 300 },
    "src/app/api/cron/**/*": { "maxDuration": 300 }
  },
  "crons": [
    { "path": "/api/cron/sentiment-scan", "schedule": "0 8 */3 * *" },
    { "path": "/api/cron/price-followup", "schedule": "0 6 * * *" }
  ]
}
```

**Step 2: Add CRON_SECRET to env**

```bash
# Generate a random secret
openssl rand -hex 32
```

Add `CRON_SECRET=<generated-value>` to:
- `.env.local` (local dev)
- Vercel dashboard: Settings → Environment Variables → `CRON_SECRET`

**Step 3: Commit vercel.json**

```bash
git add vercel.json
git commit -m "feat(cron): configure Vercel cron jobs for sentiment scan + price follow-up"
```

---

## Task 11: Insights API

**Files:**
- Create: `src/app/api/insights/route.ts`

**Step 1: Implement**

```typescript
// src/app/api/insights/route.ts
// GET /api/insights
// Aggregates sentiment + outcome data across Reports and SentimentSnapshots.
// Powers the /insights research dashboard page.
// No auth required — insights are aggregated/anonymized, no PII exposed.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { SentimentDimensions } from '@/lib/sentiment-dimensions';

export const dynamic = 'force-dynamic';

interface OutcomeDataPoint {
  ticker: string;
  diffusion_gap: number;
  direction: number;
  quality: number;
  quantity: number;
  price_change_3d: number | null;
  price_change_7d: number | null;
  tier_breakdown: SentimentDimensions['tier_breakdown'];
  source: 'report' | 'snapshot';
  recorded_at: string;
}

export async function GET() {
  try {
    // Fetch reports with outcomes
    const reports = await prisma.report.findMany({
      where: { price_at_report: { not: null }, community_data: { not: undefined } },
      include: { outcomes: true },
      orderBy: { analyzed_at: 'desc' },
      take: 500,
    });

    // Fetch snapshots with outcomes
    const snapshots = await prisma.sentimentSnapshot.findMany({
      include: { outcomes: true },
      orderBy: { scanned_at: 'desc' },
      take: 1000,
    });

    // Build unified outcome data points
    const dataPoints: OutcomeDataPoint[] = [];

    for (const r of reports) {
      if (!r.community_data) continue;
      const dims = r.community_data as unknown as SentimentDimensions;
      const outcome3d = r.outcomes.find(o => o.days_after === 3);
      const outcome7d = r.outcomes.find(o => o.days_after === 7);
      dataPoints.push({
        ticker: r.ticker,
        diffusion_gap: dims.diffusion_gap,
        direction: dims.direction,
        quality: dims.quality,
        quantity: dims.quantity,
        price_change_3d: outcome3d?.pct_change ?? null,
        price_change_7d: outcome7d?.pct_change ?? null,
        tier_breakdown: dims.tier_breakdown,
        source: 'report',
        recorded_at: r.analyzed_at.toISOString(),
      });
    }

    for (const s of snapshots) {
      const dims = s.community_data as unknown as SentimentDimensions;
      const outcome3d = s.outcomes.find(o => o.days_after === 3);
      const outcome7d = s.outcomes.find(o => o.days_after === 7);
      dataPoints.push({
        ticker: s.ticker,
        diffusion_gap: dims.diffusion_gap,
        direction: dims.direction,
        quality: dims.quality,
        quantity: dims.quantity,
        price_change_3d: outcome3d?.pct_change ?? null,
        price_change_7d: outcome7d?.pct_change ?? null,
        tier_breakdown: dims.tier_breakdown,
        source: 'snapshot',
        recorded_at: s.scanned_at.toISOString(),
      });
    }

    // Compute thesis stats from resolved outcomes only
    const resolved = dataPoints.filter(d => d.price_change_7d !== null);
    const highGapResolved = resolved.filter(d => d.diffusion_gap > 2);
    const highGapBullish = highGapResolved.filter(d => d.direction > 0.6 && (d.price_change_7d ?? 0) > 3);
    const thesisPct = highGapResolved.length > 0
      ? Math.round((highGapBullish.length / highGapResolved.length) * 100)
      : null;

    // Diffusion tracker: recent snapshots with high diffusion gap + no mainstream awareness yet
    const diffusionSignals = dataPoints
      .filter(d => d.diffusion_gap > 2.5 && d.price_change_7d === null) // unresolved = recent
      .sort((a, b) => b.diffusion_gap - a.diffusion_gap)
      .slice(0, 10);

    // Signal correlation breakdown
    const signalCorrelation = {
      diffusion_gap: correlationScore(resolved, d => d.diffusion_gap > 2 ? 1 : 0),
      direction: correlationScore(resolved, d => d.direction > 0.6 ? 1 : 0),
      quality: correlationScore(resolved, d => d.quality > 0.5 ? 1 : 0),
      quantity: correlationScore(resolved, d => d.quantity > 10 ? 1 : 0),
    };

    return NextResponse.json({
      total_data_points: dataPoints.length,
      resolved_outcomes: resolved.length,
      thesis: {
        statement: thesisPct !== null
          ? `In ${highGapResolved.length} resolved data points where niche activity exceeded mainstream (diffusion gap > 2x), ${thesisPct}% showed >3% price gain within 7 days.`
          : 'Accumulating data — thesis will appear once outcomes resolve (3–7 days after first scans).',
        high_gap_resolved: highGapResolved.length,
        high_gap_bullish: highGapBullish.length,
        pct: thesisPct,
      },
      diffusion_signals: diffusionSignals,
      outcome_log: resolved.slice(0, 50),
      signal_correlation: signalCorrelation,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Insights query failed' },
      { status: 500 },
    );
  }
}

function correlationScore(
  points: OutcomeDataPoint[],
  signalFn: (d: OutcomeDataPoint) => 0 | 1,
): { signal_positive_pct: number; avg_7d_return: number; sample_size: number } {
  const withSignal = points.filter(d => signalFn(d) === 1 && d.price_change_7d !== null);
  if (withSignal.length === 0) return { signal_positive_pct: 0, avg_7d_return: 0, sample_size: 0 };
  const positive = withSignal.filter(d => (d.price_change_7d ?? 0) > 0);
  const avgReturn = withSignal.reduce((s, d) => s + (d.price_change_7d ?? 0), 0) / withSignal.length;
  return {
    signal_positive_pct: Math.round((positive.length / withSignal.length) * 100),
    avg_7d_return: Math.round(avgReturn * 10) / 10,
    sample_size: withSignal.length,
  };
}
```

**Step 2: Build check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/app/api/insights/route.ts
git commit -m "feat(api): insights endpoint aggregates sentiment dimensions + price outcomes"
```

---

## Task 12: Insights Page UI

**Files:**
- Create: `src/app/insights/page.tsx`
- Create: `src/components/InsightsDashboard.tsx`

**Step 1: Implement InsightsDashboard component**

```typescript
// src/components/InsightsDashboard.tsx
'use client';

import { useEffect, useState } from 'react';

interface InsightsData {
  total_data_points: number;
  resolved_outcomes: number;
  thesis: {
    statement: string;
    high_gap_resolved: number;
    pct: number | null;
  };
  diffusion_signals: Array<{
    ticker: string;
    diffusion_gap: number;
    direction: number;
    tier_breakdown: { mainstream: number; middle: number; niche: number };
    recorded_at: string;
  }>;
  outcome_log: Array<{
    ticker: string;
    diffusion_gap: number;
    direction: number;
    price_change_3d: number | null;
    price_change_7d: number | null;
    recorded_at: string;
  }>;
  signal_correlation: Record<string, {
    signal_positive_pct: number;
    avg_7d_return: number;
    sample_size: number;
  }>;
}

export function InsightsDashboard() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/insights')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load insights'); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-sm text-zinc-500 animate-pulse">Loading research data...</div>
    </div>
  );

  if (error || !data) return (
    <div className="text-sm text-red-500 p-4">{error ?? 'No data available'}</div>
  );

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-4 py-8">
      {/* Header stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Data Points', value: data.total_data_points.toLocaleString() },
          { label: 'Resolved Outcomes', value: data.resolved_outcomes.toLocaleString() },
          { label: 'Thesis Confidence', value: data.thesis.pct !== null ? `${data.thesis.pct}%` : 'Accumulating...' },
        ].map(stat => (
          <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Live Thesis */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">
          Live Research Thesis
        </h2>
        <p className="text-white text-base leading-relaxed">{data.thesis.statement}</p>
      </div>

      {/* Diffusion Tracker */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4">
          Diffusion Tracker — Niche Active Before Mainstream
        </h2>
        {data.diffusion_signals.length === 0 ? (
          <p className="text-zinc-500 text-sm">No early signals detected yet — check back after first scan cycle.</p>
        ) : (
          <div className="space-y-3">
            {data.diffusion_signals.map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-white">{s.ticker}</span>
                  <span className="text-xs text-zinc-500">
                    niche:{s.tier_breakdown.niche} vs mainstream:{s.tier_breakdown.mainstream}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-amber-400">gap: {s.diffusion_gap.toFixed(1)}x</span>
                  <span className={s.direction > 0.6 ? 'text-emerald-400' : s.direction < 0.4 ? 'text-red-400' : 'text-zinc-400'}>
                    {s.direction > 0.6 ? 'bullish' : s.direction < 0.4 ? 'bearish' : 'neutral'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signal Quality Breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4">
          Signal Quality — Which Dimension Predicts Best?
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(data.signal_correlation).map(([key, val]) => (
            <div key={key} className="border border-zinc-800 rounded-lg p-4">
              <div className="text-sm font-medium text-white capitalize mb-2">
                {key.replace(/_/g, ' ')}
              </div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>{val.signal_positive_pct}% positive outcomes</span>
                <span>avg {val.avg_7d_return > 0 ? '+' : ''}{val.avg_7d_return}% 7d</span>
              </div>
              <div className="text-xs text-zinc-600 mt-1">n={val.sample_size}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Outcome Log */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4">
          Outcome Log — Every Prediction Checked
        </h2>
        {data.outcome_log.length === 0 ? (
          <p className="text-zinc-500 text-sm">Outcomes appear 3–7 days after data collection begins.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left pb-2">Ticker</th>
                  <th className="text-left pb-2">Gap</th>
                  <th className="text-left pb-2">Direction</th>
                  <th className="text-left pb-2">3d %</th>
                  <th className="text-left pb-2">7d %</th>
                  <th className="text-left pb-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.outcome_log.map((row, i) => (
                  <tr key={i} className="text-zinc-300">
                    <td className="py-2 font-mono font-semibold text-white">{row.ticker}</td>
                    <td className="py-2 text-amber-400">{row.diffusion_gap.toFixed(1)}x</td>
                    <td className="py-2">{(row.direction * 100).toFixed(0)}% bull</td>
                    <td className={`py-2 ${(row.price_change_3d ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.price_change_3d !== null ? `${row.price_change_3d > 0 ? '+' : ''}${row.price_change_3d.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`py-2 ${(row.price_change_7d ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.price_change_7d !== null ? `${row.price_change_7d > 0 ? '+' : ''}${row.price_change_7d.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-zinc-500">{new Date(row.recorded_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Implement the page**

```typescript
// src/app/insights/page.tsx
import { InsightsDashboard } from '@/components/InsightsDashboard';

export const metadata = {
  title: 'Research Insights — Cipher',
  description: 'Live behavioral finance research: how community sentiment predicts price movement',
};

export default function InsightsPage() {
  return (
    <main>
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-4">
        <h1 className="text-3xl font-bold text-white mb-2">Research Insights</h1>
        <p className="text-zinc-400 text-sm max-w-2xl">
          Cipher continuously monitors community sentiment across niche, middle, and mainstream tiers.
          This page shows what the data has learned — which signals predicted price movements,
          and where the diffusion gap is active right now.
        </p>
      </div>
      <InsightsDashboard />
    </main>
  );
}
```

**Step 3: Add Insights link to nav**

In the main navigation component (find via `grep -r "dashboard" src/components --include="*.tsx" -l`), add:

```tsx
<Link href="/insights" className="...">Insights</Link>
```

**Step 4: Build check**

```bash
npx next build 2>&1 | tail -20
```

Expected: build succeeds, `/insights` page included.

**Step 5: Commit**

```bash
git add src/app/insights/ src/components/InsightsDashboard.tsx
git commit -m "feat(ui): /insights research dashboard — live thesis, diffusion tracker, outcome log"
```

---

## Task 13: Add Community Tier Section to Report UI

**Files:**
- Modify: `src/components/ResearchReport.tsx`

**Step 1: Find community section**

```bash
grep -n "community_highlights\|Community" src/components/ResearchReport.tsx | head -20
```

**Step 2: Add tier breakdown panel after existing community highlights**

In `ResearchReport.tsx`, find where `community_highlights` are rendered and add a sentiment dimensions panel below them. The `analysis.community_data` field is now stored with reports — read from the stored analysis JSON or compute on-the-fly from highlights:

```tsx
{/* Sentiment Dimension Scores — computed from this report's community data */}
{analysis.community_highlights && analysis.community_highlights.length > 0 && (() => {
  const mainstream = analysis.community_highlights.filter(h => h.community_type === 'mainstream');
  const middle = analysis.community_highlights.filter(h => h.community_type === 'middle');
  const niche = analysis.community_highlights.filter(h => h.community_type === 'niche');
  const total = analysis.community_highlights.length;

  return (
    <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
      {[
        { label: 'Mainstream', communities: mainstream, color: 'text-red-400' },
        { label: 'Middle', communities: middle, color: 'text-amber-400' },
        { label: 'Niche', communities: niche, color: 'text-emerald-400' },
      ].map(tier => (
        <div key={tier.label} className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
          <div className={`text-xs font-semibold uppercase tracking-widest mb-2 ${tier.color}`}>
            {tier.label}
          </div>
          <div className="text-lg font-bold text-white">{tier.communities.length}</div>
          <div className="text-xs text-zinc-500">
            {tier.communities.length === 0 ? 'No signal' : tier.communities.map(c => c.community_name).join(', ')}
          </div>
        </div>
      ))}
    </div>
  );
})()}
```

**Step 3: Build check**

```bash
npx next build 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add src/components/ResearchReport.tsx
git commit -m "feat(report): add 3-tier community breakdown panel to report UI"
```

---

## Task 14: E2E Smoke Tests

**Files:**
- Create: `tests/e2e/insights.spec.ts`
- Create: `tests/e2e/cron-smoke.spec.ts`

**Step 1: Insights page smoke test**

```typescript
// tests/e2e/insights.spec.ts
import { test, expect } from '@playwright/test';

test('insights page loads and shows research sections', async ({ page }) => {
  await page.goto('/insights');
  await page.screenshot({ path: 'tests/screenshots/insights-initial.png', fullPage: true });

  // Page title present
  await expect(page.getByText('Research Insights')).toBeVisible();

  // All four sections present
  await expect(page.getByText('Live Research Thesis')).toBeVisible();
  await expect(page.getByText('Diffusion Tracker')).toBeVisible();
  await expect(page.getByText('Signal Quality')).toBeVisible();
  await expect(page.getByText('Outcome Log')).toBeVisible();

  await page.screenshot({ path: 'tests/screenshots/insights-sections.png', fullPage: true });
});
```

**Step 2: Cron endpoint smoke test (auth guard)**

```typescript
// tests/e2e/cron-smoke.spec.ts
import { test, expect } from '@playwright/test';

test('sentiment-scan cron rejects unauthenticated requests', async ({ request }) => {
  const res = await request.get('/api/cron/sentiment-scan');
  expect(res.status()).toBe(401);
});

test('price-followup cron rejects unauthenticated requests', async ({ request }) => {
  const res = await request.get('/api/cron/price-followup');
  expect(res.status()).toBe(401);
});
```

**Step 3: Run tests**

```bash
npx playwright test tests/e2e/insights.spec.ts tests/e2e/cron-smoke.spec.ts --project=chromium
```

Expected: both pass.

**Step 4: Read screenshots**

Read `tests/screenshots/insights-initial.png` and `tests/screenshots/insights-sections.png` to visually confirm the page renders correctly with all four sections visible.

**Step 5: Commit**

```bash
git add tests/e2e/insights.spec.ts tests/e2e/cron-smoke.spec.ts tests/screenshots/
git commit -m "test(e2e): insights page smoke test + cron auth guard tests"
```

---

## Task 15: Deploy to Vercel

**Step 1: Push to main**

```bash
git push origin main
```

**Step 2: Verify deployment**

```bash
vercel --prod
```

**Step 3: Confirm cron jobs registered**

In Vercel dashboard → Project → Cron Jobs: verify `sentiment-scan` (every 3 days) and `price-followup` (daily) are listed.

**Step 4: Trigger first scan manually**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/sentiment-scan
```

Expected: `{"ok":true,"scanned":N,"failed":0,"skipped":0}`

**Step 5: Visit `/insights`**

Navigate to `https://your-app.vercel.app/insights`. Confirm the page loads. Data points will be 0 initially — they populate after the first successful scan cycle + price follow-up 3 days later.

---

## Completion Checklist

- [ ] Task 1: DB schema migrated — SentimentSnapshot, PriceOutcome, Report extended
- [ ] Task 2: CommunityHighlight type updated to 3 tiers
- [ ] Task 3: Scraper reclassified to mainstream/middle/niche with correct URLs
- [ ] Task 4: Sentiment dimensions utility passes all tests
- [ ] Task 5: Reports store price snapshot + sentiment dims on every run
- [ ] Task 6: Watchlist of 30 tickers created
- [ ] Task 7: Lightweight 3-source scanner implemented
- [ ] Task 8: Background scanner cron implemented with rate limiting
- [ ] Task 9: Price follow-up cron handles both Reports and Snapshots
- [ ] Task 10: vercel.json cron config + CRON_SECRET env set
- [ ] Task 11: Insights API returns thesis + signals + correlations
- [ ] Task 12: /insights page with 4 sections renders correctly
- [ ] Task 13: Report UI shows 3-tier community breakdown
- [ ] Task 14: E2E tests pass and screenshots confirm correct rendering
- [ ] Task 15: Deployed, crons registered, first scan triggered
