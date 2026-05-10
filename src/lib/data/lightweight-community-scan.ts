// src/lib/data/lightweight-community-scan.ts
// Lightweight 3-source community scan: no Gemini, no Haiku.
// Cost: ~3 Firecrawl credits + 1 StockTwits call per ticker.
import Firecrawl from '@mendable/firecrawl-js';
import YahooFinance from 'yahoo-finance2';
import { fetchStockTwitsSentiment } from './stocktwits';
import {
  fetchQuiverInsider,
  fetchQuiverCongressional,
  type QuiverInsiderData,
  type QuiverCongressionalData,
} from './adapters/quiver';
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
  /**
   * Plan 19-C-06 (D-38) — Quiver Hobbyist insider trades.
   * `null` when QUIVER_API_KEY is unset (opt-in default) or upstream fails.
   * Populated additively into SentimentSnapshot.community_aggregated JSONB.
   */
  quiver_insider: QuiverInsiderData | null;
  /**
   * Plan 19-C-06 (D-38) — Quiver Hobbyist congressional trades.
   * Same null semantics as quiver_insider.
   */
  quiver_congressional: QuiverCongressionalData | null;
}

export async function lightweightCommunityScan(ticker: string): Promise<EnrichedSnapshot | null> {
  if (!process.env.FIRECRAWL_API_KEY) return null;

  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const upper = ticker.toUpperCase();

  // Plan 19-C-06 (D-38): Quiver insider/congressional are additive supplemental
  // sources. They no-op (return null) when QUIVER_API_KEY is unset, so wiring
  // them into the parallel fan-out is safe by default — no flag, no shadow.
  // Promise.allSettled isolates them: an upstream Quiver failure cannot crash
  // the primary Firecrawl/StockTwits path.
  const [
    mainstreamMd,
    middleMd,
    nicheMd,
    stocktwitsResult,
    marketCap,
    quiverInsiderRes,
    quiverCongressRes,
  ] = await Promise.all([
    scrapeOne(fc, `https://www.reddit.com/r/wallstreetbets/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/investing/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/${upper}/new/`),
    fetchStockTwitsSentiment(upper),
    yf.quote(upper).then(q => q.marketCap ?? null).catch(() => null),
    // Both Quiver fetchers already return null on any failure; wrap defensively
    // so any unexpected throw still degrades to null without breaking the scan.
    fetchQuiverInsider(upper).catch(() => null),
    fetchQuiverCongressional(upper).catch(() => null),
  ]);
  const quiver_insider = quiverInsiderRes;
  const quiver_congressional = quiverCongressRes;

  const highlights: CommunityHighlight[] = [];
  const enrichedHighlights: EnrichedSnapshot['highlights'] = [];

  if (mainstreamMd) {
    const count = rawEngagementCount(mainstreamMd);
    const engagement = toEngagement(count);
    highlights.push({
      community_name: 'r/wallstreetbets', community_type: 'mainstream',
      audience: 'retail momentum traders', standout_quote: '', theme: 'general discussion',
      sentiment: 'neutral', engagement_signal: engagement,
    });
    enrichedHighlights.push({ community_name: 'r/wallstreetbets', community_type: 'mainstream', engagement, engagement_count: count });
  }

  if (middleMd) {
    const count = rawEngagementCount(middleMd);
    const engagement = toEngagement(count);
    highlights.push({
      community_name: 'r/investing', community_type: 'middle',
      audience: 'general retail investors', standout_quote: '', theme: 'general discussion',
      sentiment: 'neutral', engagement_signal: engagement,
    });
    enrichedHighlights.push({ community_name: 'r/investing', community_type: 'middle', engagement, engagement_count: count });
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
    quiver_insider,
    quiver_congressional,
  };
}
