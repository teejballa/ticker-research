// src/lib/data/lightweight-community-scan.ts
// Lightweight 3-source community scan: no Gemini, no Haiku.
// Cost: ~3 Firecrawl credits + 1 StockTwits call per ticker.
import Firecrawl from '@mendable/firecrawl-js';
import { fetchStockTwitsSentiment } from './stocktwits';
import { computeSentimentDimensions, type SentimentDimensions } from '@/lib/sentiment-dimensions';
import type { CommunityHighlight } from '@/lib/types';

async function scrapeOne(fc: Firecrawl, url: string): Promise<string> {
  try {
    const doc = await fc.scrape(url, { formats: ['markdown'], onlyMainContent: true } as Parameters<typeof fc.scrape>[1]);
    const content = (doc as { markdown?: string }).markdown ?? '';
    return content.length >= 150 ? content : '';
  } catch {
    return '';
  }
}

function toEngagement(markdown: string): 'high' | 'medium' | 'low' {
  const matches = markdown.match(/\d+\s*(comments?|points?|upvotes?)/gi) ?? [];
  const count = Math.min(matches.length, 20);
  return count > 10 ? 'high' : count > 4 ? 'medium' : 'low';
}

export async function lightweightCommunityScan(ticker: string): Promise<SentimentDimensions | null> {
  if (!process.env.FIRECRAWL_API_KEY) return null;

  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const upper = ticker.toUpperCase();

  const [mainstreamMd, middleMd, nicheMd, stocktwitsResult] = await Promise.all([
    scrapeOne(fc, `https://www.reddit.com/r/wallstreetbets/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/investing/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/${upper}/new/`),
    fetchStockTwitsSentiment(upper),
  ]);

  const highlights: CommunityHighlight[] = [];

  if (mainstreamMd) highlights.push({
    community_name: 'r/wallstreetbets', community_type: 'mainstream',
    audience: 'retail momentum traders', standout_quote: '', theme: 'general discussion',
    sentiment: 'neutral', engagement_signal: toEngagement(mainstreamMd),
  });

  if (middleMd) highlights.push({
    community_name: 'r/investing', community_type: 'middle',
    audience: 'general retail investors', standout_quote: '', theme: 'general discussion',
    sentiment: 'neutral', engagement_signal: toEngagement(middleMd),
  });

  if (nicheMd) highlights.push({
    community_name: `r/${upper}`, community_type: 'niche',
    audience: 'dedicated ticker community', standout_quote: '', theme: 'ticker-specific discussion',
    sentiment: 'neutral', engagement_signal: toEngagement(nicheMd),
  });

  const stInput = stocktwitsResult.stocktwits_bull_pct != null && stocktwitsResult.stocktwits_message_count != null
    ? { bull: stocktwitsResult.stocktwits_bull_pct, bear: stocktwitsResult.stocktwits_bear_pct ?? 0, messageCount: stocktwitsResult.stocktwits_message_count }
    : null;

  return computeSentimentDimensions(highlights, stInput);
}
