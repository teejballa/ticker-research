// src/lib/data/lightweight-community-scan.ts
// Lightweight community scan: no Gemini, no Haiku.
//
// Plan 19-C-05 absorbs D-44 — subreddit expansion via Firecrawl. Coverage now
// spans four mainstream + analytical subs:
//   r/wallstreetbets   — retail momentum (mainstream)
//   r/stocks           — general retail (mainstream, replaces r/investing)
//   r/SecurityAnalysis — value / fundamentals niche (middle)
//   r/algotrading      — quant / systematic niche (middle)
// plus the per-ticker niche sub r/<TICKER>. All five via Firecrawl — no new
// adapter needed (D-44 spec).
//
// Cost: ~5 Firecrawl credits + 1 StockTwits call per ticker (was 3 + 1 pre-D-44).
import Firecrawl from '@mendable/firecrawl-js';
import YahooFinance from 'yahoo-finance2';
import { fetchStockTwitsSentiment } from './stocktwits';
import { computeSentimentDimensions, type SentimentDimensions } from '@/lib/sentiment-dimensions';
import { classifyCapClass, type CapClass } from '@/lib/diffusion-trace';
import type { CommunityHighlight } from '@/lib/types';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function scrapeOne(fc: Firecrawl, url: string): Promise<string> {
  try {
    const doc = await fc.scrape(url, { formats: ['markdown'], onlyMainContent: true } as Parameters<typeof fc.scrape>[1]);
    const content = (doc as { markdown?: string }).markdown ?? '';
    // Lowered from 150 → 30: previous gate punished partial scrapes and starved
    // the diffusion engine of tier signal. A short scrape still resolves to "low"
    // engagement (weight 1) which is correct — better than zeroed out entirely.
    return content.length >= 30 ? content : '';
  } catch {
    return '';
  }
}

function rawEngagementCount(markdown: string): number {
  const matches = markdown.match(/\d+\s*(comments?|points?|upvotes?)/gi) ?? [];
  return Math.min(matches.length, 20);
}

function toEngagement(count: number): 'high' | 'medium' | 'low' {
  return count > 10 ? 'high' : count > 4 ? 'medium' : 'low';
}

export interface EnrichedSnapshot extends SentimentDimensions {
  highlights: Array<{
    community_name: string;
    community_type: 'mainstream' | 'middle' | 'niche';
    engagement: 'high' | 'medium' | 'low';
    engagement_count: number;
  }>;
  market_cap: number | null;
  cap_class: CapClass;
}

export async function lightweightCommunityScan(ticker: string): Promise<EnrichedSnapshot | null> {
  if (!process.env.FIRECRAWL_API_KEY) return null;

  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const upper = ticker.toUpperCase();

  // D-44 absorbed: 4-subreddit Firecrawl expansion (mainstream + analytical)
  // plus the per-ticker niche sub. All five via Firecrawl — no new adapter.
  const [wsbMd, stocksMd, secanalysisMd, algoMd, nicheMd, stocktwitsResult, marketCap] = await Promise.all([
    scrapeOne(fc, `https://www.reddit.com/r/wallstreetbets/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/stocks/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/SecurityAnalysis/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/algotrading/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/${upper}/new/`),
    fetchStockTwitsSentiment(upper),
    yf.quote(upper).then(q => q.marketCap ?? null).catch(() => null),
  ]);

  const highlights: CommunityHighlight[] = [];
  const enrichedHighlights: EnrichedSnapshot['highlights'] = [];

  if (wsbMd) {
    const count = rawEngagementCount(wsbMd);
    const engagement = toEngagement(count);
    highlights.push({
      community_name: 'r/wallstreetbets', community_type: 'mainstream',
      audience: 'retail momentum traders', standout_quote: '', theme: 'general discussion',
      sentiment: 'neutral', engagement_signal: engagement,
    });
    enrichedHighlights.push({ community_name: 'r/wallstreetbets', community_type: 'mainstream', engagement, engagement_count: count });
  }

  if (stocksMd) {
    const count = rawEngagementCount(stocksMd);
    const engagement = toEngagement(count);
    highlights.push({
      community_name: 'r/stocks', community_type: 'mainstream',
      audience: 'general retail investors', standout_quote: '', theme: 'general discussion',
      sentiment: 'neutral', engagement_signal: engagement,
    });
    enrichedHighlights.push({ community_name: 'r/stocks', community_type: 'mainstream', engagement, engagement_count: count });
  }

  if (secanalysisMd) {
    const count = rawEngagementCount(secanalysisMd);
    const engagement = toEngagement(count);
    highlights.push({
      community_name: 'r/SecurityAnalysis', community_type: 'middle',
      audience: 'value/fundamentals analysts', standout_quote: '', theme: 'fundamentals + valuation',
      sentiment: 'neutral', engagement_signal: engagement,
    });
    enrichedHighlights.push({ community_name: 'r/SecurityAnalysis', community_type: 'middle', engagement, engagement_count: count });
  }

  if (algoMd) {
    const count = rawEngagementCount(algoMd);
    const engagement = toEngagement(count);
    highlights.push({
      community_name: 'r/algotrading', community_type: 'middle',
      audience: 'quant/systematic traders', standout_quote: '', theme: 'systematic + quant strategies',
      sentiment: 'neutral', engagement_signal: engagement,
    });
    enrichedHighlights.push({ community_name: 'r/algotrading', community_type: 'middle', engagement, engagement_count: count });
  }

  if (nicheMd) {
    const count = rawEngagementCount(nicheMd);
    const engagement = toEngagement(count);
    highlights.push({
      community_name: `r/${upper}`, community_type: 'niche',
      audience: 'dedicated ticker community', standout_quote: '', theme: 'ticker-specific discussion',
      sentiment: 'neutral', engagement_signal: engagement,
    });
    enrichedHighlights.push({ community_name: `r/${upper}`, community_type: 'niche', engagement, engagement_count: count });
  }

  const stInput = stocktwitsResult.stocktwits_bull_pct != null && stocktwitsResult.stocktwits_message_count != null
    ? { bull: stocktwitsResult.stocktwits_bull_pct, bear: stocktwitsResult.stocktwits_bear_pct ?? 0, messageCount: stocktwitsResult.stocktwits_message_count }
    : null;

  const dims = computeSentimentDimensions(highlights, stInput);

  return {
    ...dims,
    highlights: enrichedHighlights,
    market_cap: marketCap,
    cap_class: classifyCapClass(marketCap),
  };
}
