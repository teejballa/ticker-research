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
import { withBreaker } from '@/lib/data/circuit-breaker';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { fetchStockTwitsSentiment, fetchStockTwitsRaw, type StockTwitsRawMessage } from './stocktwits';
import {
  fetchQuiverInsider,
  fetchQuiverCongressional,
  type QuiverInsiderData,
  type QuiverCongressionalData,
} from './adapters/quiver';
import { fetchSwaggyStocks } from './adapters/swaggystocks';
import { fetchApeWisdom } from './adapters/apewisdom';
import type { CommunitySignal } from './adapters/apewisdom';
import { runWithShadow } from '@/lib/shadow/shadow-runner';
import { FEATURES } from '@/lib/features';
import { computeSentimentDimensions, type SentimentDimensions } from '@/lib/sentiment-dimensions';
import { classifyCapClass, type CapClass } from '@/lib/diffusion-trace';
import type { CommunityHighlight } from '@/lib/types';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Phase 30.1 (D-19) — engagement-tier thresholds.
 * Per HYPERPARAMETERS.md §Community-Engagement Tiers. Thresholds are
 * preliminary and calibrated against the historical Firecrawl-era tier
 * distribution during plan 30.1-05's 7-day shadow soak.
 *
 * HN uses the SAME thresholds (RESEARCH allows asymmetric; symmetric is
 * the starting point and calibration in plan 30.1-05 will retune if the
 * shadow soak shows distributional drift outside ±10pp.).
 */
export const ENGAGEMENT_TIER_THRESHOLDS = {
  high_score: 100,
  high_comments: 50,
  medium_score: 20,
  medium_comments: 10,
} as const;

/**
 * Maps Reddit (score, num_comments) OR HN (points, num_comments — same
 * threshold constants) to a three-tier engagement label consumed by
 * `computeSentimentDimensions`. Replaces the regex-extracted approximation
 * `rawEngagementCount` + `toEngagement` used by the Firecrawl-era path.
 */
export function toEngagementFromFields(input: {
  score: number;
  num_comments: number;
}): 'high' | 'medium' | 'low' {
  const t = ENGAGEMENT_TIER_THRESHOLDS;
  if (input.score >= t.high_score || input.num_comments >= t.high_comments) return 'high';
  if (input.score >= t.medium_score || input.num_comments >= t.medium_comments) return 'medium';
  return 'low';
}

async function scrapeOne(fc: Firecrawl, url: string): Promise<string> {
  try {
    // Plan 20-Z-03: wrap the Firecrawl scrape with telemetry. Cost defaults
    // to the flat $0.001/call rate from COST_PER_CALL_USD['firecrawl'].
    //
    // Phase 30 D-23 — BreakerOpenError caught by surrounding try/catch in
    // scrapeOne, scan continues with empty markdown. The cron pipeline must
    // never 500 when Firecrawl is degraded; the breaker short-circuit is
    // observed as a tripped BREAKER_OPEN row in ProviderCallLog so the
    // dashboard can surface it while the user-facing path returns ''.
    const doc = await withTelemetry(
      'firecrawl',
      () =>
        withBreaker('firecrawl', () =>
          fc.scrape(url, { formats: ['markdown'], onlyMainContent: true } as Parameters<typeof fc.scrape>[1]),
        ),
    );
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
  /**
   * Plan 20-Z-04 follow-up (2026-05-13) — raw StockTwits messages for the
   * Phase-20-Z-01 PIT feature store + 20-C-03 bot/coordination detectors.
   * Required by the sentiment-scan cron's per-message writers; without this
   * field the `sentiment_observations`, `bot_filter_flags`, and
   * `coordination_clusters` tables sit empty in prod even on a successful scan.
   *
   * Wrapped under a `stocktwits` sub-object to match the existing route shape
   * the cron has been preemptively reading via optional chaining.
   *
   * Empty array (NOT null) on any upstream failure — the cron's writers
   * gracefully no-op on empty bags.
   */
  stocktwits: { messages: StockTwitsRawMessage[] };
}

export async function lightweightCommunityScan(ticker: string): Promise<EnrichedSnapshot | null> {
  if (!process.env.FIRECRAWL_API_KEY) return null;

  const fc = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
  const upper = ticker.toUpperCase();

  // D-44 absorbed (19-C-05): 4-subreddit Firecrawl expansion (wsb + stocks +
  // secanalysis + algotrading) + per-ticker niche sub. All five via Firecrawl.
  // Plan 19-C-06 (D-38): Quiver insider/congressional are additive supplemental
  // sources. They no-op (return null) when QUIVER_API_KEY is unset, so wiring
  // them into the parallel fan-out is safe by default — no flag, no shadow.
  const [
    wsbMd,
    stocksMd,
    secanalysisMd,
    algoMd,
    nicheMd,
    stocktwitsResult,
    stocktwitsRawMessages,
    marketCap,
    quiverInsiderRes,
    quiverCongressRes,
  ] = await Promise.all([
    scrapeOne(fc, `https://www.reddit.com/r/wallstreetbets/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/stocks/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/SecurityAnalysis/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/algotrading/search/?q=${upper}&sort=new&t=week`),
    scrapeOne(fc, `https://www.reddit.com/r/${upper}/new/`),
    fetchStockTwitsSentiment(upper),
    // Plan 20-Z-04 follow-up (2026-05-13) — raw message bag for PIT feature store.
    // Independent HTTP call; cached by the StockTwits adapter via withTelemetry.
    // Failures degrade to [] (logged via withTelemetry) — never blocks the scan.
    fetchStockTwitsRaw(upper),
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
    quiver_insider,
    quiver_congressional,
    // Plan 20-Z-04 follow-up — wired into Phase-20-Z-01 SentimentObservation
    // writer in src/app/api/cron/sentiment-scan/route.ts via the existing
    // optional-chained `communityData.stocktwits.messages` read path.
    stocktwits: { messages: stocktwitsRawMessages },
  };
}

// ---------------------------------------------------------------------------
// Plan 19-C-05 — Task 4: supplemental community aggregation behind shadow.
// ---------------------------------------------------------------------------
//
// `communityAggregated(ticker)` is the new entry point that gates Swaggystocks
// + ApeWisdom (SUPPLEMENTAL — Firecrawl REMAINS PRIMARY per D-37) behind the
// `community_supplemental` feature flag. Three modes:
//
//   off    → Firecrawl-only output (current canonical behavior)
//   shadow → Firecrawl-only is what the cron writes to community_aggregated;
//            the supplemental candidate runs in setImmediate and persists a
//            ShadowComparison row for offline verdict scoring (D-05, D-14)
//   on     → supplemental candidate populates community_aggregated; Firecrawl
//            still drives the primary `community_data` JSON column
//
// Promise.allSettled (T-19-C-05-01) — a rate limit on either supplemental can
// NEVER crash the canonical Firecrawl path: settled results are mapped to
// `null` if rejected; null sentinel everywhere downstream.

/**
 * Shape returned by communityAggregated — JSON-serializable so it can land
 * directly in `SentimentSnapshot.community_aggregated` (Json column).
 */
export interface CommunityAggregated {
  firecrawl: EnrichedSnapshot | null;
  swaggystocks: CommunitySignal | null;
  apewisdom: CommunitySignal | null;
}

async function communityFirecrawlOnly(ticker: string): Promise<CommunityAggregated> {
  const firecrawl = await lightweightCommunityScan(ticker);
  return { firecrawl, swaggystocks: null, apewisdom: null };
}

async function communityWithSupplemental(ticker: string): Promise<CommunityAggregated> {
  const [firecrawl, swaggy, ape] = await Promise.allSettled([
    lightweightCommunityScan(ticker),
    fetchSwaggyStocks(ticker),
    fetchApeWisdom(ticker),
  ]);
  return {
    firecrawl: firecrawl.status === 'fulfilled' ? firecrawl.value : null,
    swaggystocks: swaggy.status === 'fulfilled' ? swaggy.value : null,
    apewisdom: ape.status === 'fulfilled' ? ape.value : null,
  };
}

/**
 * Aggregated community payload for SentimentSnapshot.community_aggregated.
 * Gated behind `community_supplemental` flag via the standard shadow harness.
 */
export async function communityAggregated(ticker: string): Promise<CommunityAggregated> {
  return runWithShadow(
    'community-supplemental',
    () => communityFirecrawlOnly(ticker),
    () => communityWithSupplemental(ticker),
    FEATURES.community_supplemental_mode,
    { ticker },
  );
}
