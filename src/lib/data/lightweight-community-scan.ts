// src/lib/data/lightweight-community-scan.ts
//
// Lightweight community scan: no Gemini, no Haiku.
//
// Post-Phase-30.1: this module fans out across Reddit (via Xpoz Pro),
// Twitter (via Xpoz Pro), HackerNews (Algolia), StockTwits, and Quiver in
// parallel. The legacy community-scan path and the COMMUNITY_SCAN_SOURCE
// flag have been removed (D-25 lifecycle: off → shadow → on → flag deleted;
// D-26 full removal of the prior community provider).
import YahooFinance from 'yahoo-finance2';
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
import { fetchRedditCommunity, type RedditPost } from './adapters/reddit';
import {
  fetchTwitterCommunity,
  isAuthenticTwitterUser,
  type TwitterPost,
} from './adapters/twitter';
import { fetchHackerNewsStories, type HNStory } from './adapters/hackernews';
import { COMMUNITY_SUBS } from './community-subs';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Phase 30.1 (D-19) — engagement-tier thresholds.
 * Per HYPERPARAMETERS.md §Community-Engagement Tiers. Calibrated against the
 * pre-30.1 historical baseline distribution during plan 30.1-05's 7-day
 * shadow soak (see `scripts/calibrate-engagement-tiers.ts`).
 *
 * HN uses the SAME thresholds (RESEARCH allows asymmetric; symmetric is
 * the starting point and calibration in plan 30.1-05 will retune if the
 * shadow soak shows distributional drift outside ±10pp).
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
 * `computeSentimentDimensions`.
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
   * Empty array (NOT null) on any upstream failure — the cron's writers
   * gracefully no-op on empty bags.
   */
  stocktwits: { messages: StockTwitsRawMessage[] };
  /**
   * Plan 30.1-03 (D-20) — additive optional fields produced by the Xpoz
   * Reddit/Twitter + HackerNews fan-out.
   *
   * Plan 30.1-04's sentiment-scan writer reads these via
   * `(snapshot as EnrichedSnapshot).reddit_posts ?? []`.
   *
   * D-20 contract: the PUBLIC EnrichedSnapshot shape stays additive — every
   * existing consumer continues to work even when an adapter returns nothing.
   */
  reddit_posts?: RedditPost[];
  hackernews_stories?: HNStory[];
  twitter_posts?: TwitterPost[];
  /**
   * Plan 30.1-05 follow-up (2026-05-19) — typed CommunityHighlight[] for the
   * on-demand report path. Same array that previously fed
   * `computeSentimentDimensions` in-process; now also returned so
   * `/api/analysis/[ticker]/route.ts` can pass it through to
   * `runGeminiAnalysis` without re-building. Fixes the regression where
   * every production report rendered "Community sources unavailable"
   * because the legacy stub returned [].
   */
  community_highlights?: CommunityHighlight[];
}

/**
 * Public entry point — fans out across Reddit (Xpoz), Twitter (Xpoz), and
 * HackerNews in parallel alongside StockTwits, Quiver, and Yahoo. Promise
 * fan-out is `Promise.allSettled` for per-sub Reddit calls so one 403/404
 * (banned/quarantined sub) doesn't poison the rest.
 *
 * Pre-flight: returns `null` if `XPOZ_API_KEY` is unset so the operator
 * notices a partial cutover at boot.
 *
 * Default `priority: 'cron'` because both the cron and `/api/research/[ticker]`
 * call this function and the cron is the dominant caller (D-21).
 */
/**
 * Strips common corporate-entity suffixes so adapter queries search the brand
 * ("Apple") rather than the legal entity ("Apple Inc."). Returns `null` when
 * the cleaned name is empty or collapses to the ticker itself — adapters then
 * fall back to ticker-only search per their contract.
 */
function normalizeCompanyName(raw: string, ticker: string): string | null {
  const cleaned = raw
    .replace(
      /,?\s+(Inc|Inc\.|Incorporated|Corp|Corp\.|Corporation|Ltd|Ltd\.|Limited|LLC|L\.L\.C\.|Co|Co\.|Company|PLC|P\.L\.C\.|S\.A\.|S\.A|N\.V\.|N\.V|AG|S\.E\.|Holdings|Group)\b\.?\s*$/i,
      '',
    )
    .trim();
  return cleaned && cleaned.toUpperCase() !== ticker.toUpperCase() ? cleaned : null;
}

export async function lightweightCommunityScan(
  ticker: string,
  _priority: 'report' | 'cron' = 'cron',
  companyName?: string | null,
): Promise<EnrichedSnapshot | null> {
  if (!process.env.XPOZ_API_KEY) {
    console.warn(
      '[community-scan] XPOZ_API_KEY unset — community scan unavailable, returning null',
    );
    return null;
  }

  const upper = ticker.toUpperCase();
  const subs = [...COMMUNITY_SUBS.map(s => s.name), upper];

  // Resolve a short company name so adapter queries search both the ticker
  // and the brand (e.g. "AAPL" → also "Apple stock"). When the caller supplies
  // a name (the report path passes pkg.company_name), use it directly — no
  // extra Yahoo round-trip on the latency-sensitive path. When it is absent
  // (cron), look it up from Yahoo; that lookup also yields marketCap so the
  // parallel fan-out below can skip its own quote call.
  let companyShortName: string | null = null;
  let marketCapPrefetched: number | null | undefined;
  if (companyName != null && companyName !== '') {
    companyShortName = normalizeCompanyName(companyName, upper);
  } else {
    try {
      const quote = await yf.quote(upper);
      marketCapPrefetched = quote.marketCap ?? null;
      const raw =
        (typeof quote.longName === 'string' && quote.longName) ||
        (typeof quote.shortName === 'string' && quote.shortName) ||
        '';
      companyShortName = normalizeCompanyName(raw, upper);
    } catch {
      companyShortName = null;
    }
  }

  // Per-sub fan-out via Promise.allSettled so one 403/404 doesn't drop the rest.
  const subResults = await Promise.allSettled(
    subs.map((sub) => fetchRedditCommunity(upper, sub, { companyName: companyShortName })),
  );
  const reddit_posts: RedditPost[] = subResults.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : [],
  );

  // Remaining fetchers — single parallel fan-out. marketCap is fetched here
  // (not blocking the fan-out) unless the cron-path Yahoo lookup above already
  // resolved it.
  const [
    twitterRes,
    hnRes,
    stocktwitsResult,
    stocktwitsRawMessages,
    marketCap,
    quiverInsiderRes,
    quiverCongressRes,
  ] = await Promise.all([
    fetchTwitterCommunity(upper, { companyName: companyShortName }).catch((err: unknown) => {
      console.warn(
        '[community-scan twitter] failed:',
        err instanceof Error ? err.message : String(err),
      );
      return [] as TwitterPost[];
    }),
    fetchHackerNewsStories(upper, { companyName: companyShortName }),
    fetchStockTwitsSentiment(upper),
    fetchStockTwitsRaw(upper),
    marketCapPrefetched !== undefined
      ? Promise.resolve(marketCapPrefetched)
      : yf.quote(upper).then(q => q.marketCap ?? null).catch(() => null),
    fetchQuiverInsider(upper).catch(() => null),
    fetchQuiverCongressional(upper).catch(() => null),
  ]);

  // D-39 — authenticity gate on top-3 highest-engagement Twitter posts.
  // Default-true on lookup error keeps legitimate posts from being dropped.
  const sortedTwitter = [...twitterRes].sort(
    (a, b) =>
      (b.like_count + b.retweet_count + b.reply_count) -
      (a.like_count + a.retweet_count + a.reply_count),
  );
  const topThree = sortedTwitter.slice(0, 3);
  const tail = sortedTwitter.slice(3);
  const authenticityResults = await Promise.all(
    topThree.map((p) => isAuthenticTwitterUser(p.author).catch(() => true)),
  );
  const filteredTopThree = topThree.filter((_, i) => authenticityResults[i]);
  const twitter_posts: TwitterPost[] = [...filteredTopThree, ...tail];

  const hackernews_stories: HNStory[] = hnRes;

  // Group Reddit posts by their actual subreddit field.
  const subToPosts = new Map<string, RedditPost[]>();
  for (const p of reddit_posts) {
    const list = subToPosts.get(p.subreddit) ?? [];
    list.push(p);
    subToPosts.set(p.subreddit, list);
  }

  const subLookup = new Map(
    COMMUNITY_SUBS.map(s => [s.name.toLowerCase(), s] as const),
  );
  const highlights: CommunityHighlight[] = [];
  const enrichedHighlights: EnrichedSnapshot['highlights'] = [];

  for (const [subName, posts] of subToPosts) {
    if (posts.length === 0) continue;
    const maxScore = Math.max(...posts.map(p => p.score));
    const maxComments = Math.max(...posts.map(p => p.num_comments));
    const engagement = toEngagementFromFields({
      score: maxScore,
      num_comments: maxComments,
    });
    const cfg = subLookup.get(subName.toLowerCase());
    const isTickerNiche = subName.toLowerCase() === upper.toLowerCase();
    const communityType: 'mainstream' | 'middle' | 'niche' =
      cfg?.community_type ?? (isTickerNiche ? 'niche' : 'mainstream');
    const audience =
      cfg?.audience ?? (isTickerNiche ? 'dedicated ticker community' : 'general retail');
    const theme =
      cfg?.theme ?? (isTickerNiche ? 'ticker-specific discussion' : 'general discussion');

    // D-24: pick the top-scoring post for standout_quote + standout_url.
    const topPost = [...posts].sort((a, b) => b.score - a.score)[0];
    const standout_quote = topPost ? topPost.title.slice(0, 140) : '';
    const standout_url = topPost ? `https://www.reddit.com${topPost.permalink}` : undefined;

    highlights.push({
      community_name: `r/${subName}`,
      community_type: communityType,
      audience,
      standout_quote,
      standout_url,
      theme,
      sentiment: 'neutral',
      engagement_signal: engagement,
    });
    enrichedHighlights.push({
      community_name: `r/${subName}`,
      community_type: communityType,
      engagement,
      engagement_count: maxScore + maxComments,
    });
  }

  if (hackernews_stories.length > 0) {
    const maxPoints = Math.max(...hackernews_stories.map(s => s.points));
    const maxComments = Math.max(...hackernews_stories.map(s => s.num_comments));
    const engagement = toEngagementFromFields({
      score: maxPoints,
      num_comments: maxComments,
    });
    // D-24: top story by points → standout_quote + standout_url.
    const topStory = [...hackernews_stories].sort((a, b) => b.points - a.points)[0];
    const hn_standout_quote = topStory ? topStory.title.slice(0, 140) : '';
    const hn_standout_url = topStory
      ? `https://news.ycombinator.com/item?id=${topStory.objectID}`
      : undefined;
    highlights.push({
      community_name: 'HackerNews',
      community_type: 'middle',
      audience: 'technical/analytical readers',
      standout_quote: hn_standout_quote,
      standout_url: hn_standout_url,
      theme: 'tech and finance discussion',
      sentiment: 'neutral',
      engagement_signal: engagement,
    });
    enrichedHighlights.push({
      community_name: 'HackerNews',
      community_type: 'middle',
      engagement,
      engagement_count: maxPoints + maxComments,
    });
  }

  // Plan 30.1-pivot (D-38) — Twitter highlight. Engagement tier derived
  // from like_count + retweet_count + reply_count thresholds documented
  // in HYPERPARAMETERS.md §Community-Engagement Tiers (low <50, medium 50-500,
  // high >500). Reuses the same toEngagementFromFields shape by treating
  // total engagement as `score` and reply_count as `num_comments`.
  if (twitter_posts.length > 0) {
    const totalEngagement = (p: TwitterPost) =>
      p.like_count + p.retweet_count + p.reply_count;
    const maxEngagement = Math.max(...twitter_posts.map(totalEngagement));
    const maxReplies = Math.max(...twitter_posts.map(p => p.reply_count));
    const engagement: 'high' | 'medium' | 'low' =
      maxEngagement > 500 ? 'high' : maxEngagement >= 50 ? 'medium' : 'low';
    const topPost = [...twitter_posts].sort(
      (a, b) => totalEngagement(b) - totalEngagement(a),
    )[0];
    const tw_standout_quote = topPost ? topPost.text.slice(0, 140) : '';
    const tw_standout_url = topPost ? topPost.url : undefined;
    highlights.push({
      community_name: 'Twitter',
      community_type: 'mainstream',
      audience: 'public retail microblog',
      standout_quote: tw_standout_quote,
      standout_url: tw_standout_url,
      theme: 'real-time chatter',
      sentiment: 'neutral',
      engagement_signal: engagement,
    });
    enrichedHighlights.push({
      community_name: 'Twitter',
      community_type: 'mainstream',
      engagement,
      engagement_count: maxEngagement + maxReplies,
    });
  }

  if (
    highlights.length === 0 &&
    !stocktwitsResult.stocktwits_bull_pct &&
    !marketCap
  ) {
    // Nothing to say about this ticker — preserve the null-return contract
    // for unknown tickers.
    return null;
  }

  const stInput =
    stocktwitsResult.stocktwits_bull_pct != null &&
    stocktwitsResult.stocktwits_message_count != null
      ? {
          bull: stocktwitsResult.stocktwits_bull_pct,
          bear: stocktwitsResult.stocktwits_bear_pct ?? 0,
          messageCount: stocktwitsResult.stocktwits_message_count,
        }
      : null;

  const dims = computeSentimentDimensions(highlights, stInput);

  return {
    ...dims,
    highlights: enrichedHighlights,
    market_cap: marketCap,
    cap_class: classifyCapClass(marketCap),
    quiver_insider: quiverInsiderRes,
    quiver_congressional: quiverCongressRes,
    stocktwits: { messages: stocktwitsRawMessages },
    reddit_posts,
    hackernews_stories,
    twitter_posts,
    community_highlights: highlights,
  };
}

/**
 * Plan 30.1-05 follow-up (2026-05-19) — produce the shape consumed by
 * `runGeminiAnalysis(ticker, pkg, communityData)` from a fresh
 * `EnrichedSnapshot`. Fixes the regression where the on-demand report path
 * called a stub returning `pageCount: 0`, rendering "Community sources
 * unavailable" on every report regardless of what Reddit/Twitter/HN returned.
 *
 * `pinnedContent` (mainstream + middle community markdown) is the dominant
 * Gemini input; `nicheContent` is the per-ticker-subreddit slice that gets
 * separate treatment in `buildUserPrompt` for niche-specific signal.
 */
export function buildCommunityDataForLLM(
  scan: EnrichedSnapshot | null,
  ticker: string,
): {
  pinnedContent: string;
  nicheContent: string;
  nicheUrls: string[];
  pageCount: number;
  highlights: CommunityHighlight[];
} {
  if (!scan) {
    return { pinnedContent: '', nicheContent: '', nicheUrls: [], pageCount: 0, highlights: [] };
  }
  const upper = ticker.toUpperCase();
  const reddit = scan.reddit_posts ?? [];
  const twitter = scan.twitter_posts ?? [];
  const hn = scan.hackernews_stories ?? [];
  const highlights = scan.community_highlights ?? [];

  const nicheReddit = reddit.filter((p) => p.subreddit.toLowerCase() === upper.toLowerCase());
  const mainstreamReddit = reddit.filter((p) => p.subreddit.toLowerCase() !== upper.toLowerCase());

  const renderRedditPost = (p: RedditPost): string => {
    const body = (p.selftext || '').slice(0, 280);
    const url = `https://www.reddit.com${p.permalink}`;
    return `**r/${p.subreddit}** — ${p.title} _(score ${p.score}, ${p.num_comments} comments)_\n${body ? body + '\n' : ''}${url}`;
  };
  const renderTwitterPost = (p: TwitterPost): string => {
    const eng = p.like_count + p.retweet_count + p.reply_count;
    return `**@${p.author}** _(engagement ${eng})_: ${p.text.slice(0, 280)}\n${p.url ?? ''}`.trim();
  };
  const renderHNStory = (s: HNStory): string => {
    return `**HackerNews** — ${s.title} _(${s.points} points, ${s.num_comments} comments)_\n${s.url ?? `https://news.ycombinator.com/item?id=${s.objectID}`}`;
  };

  const pinnedBlocks: string[] = [];
  if (mainstreamReddit.length > 0) {
    pinnedBlocks.push('### Reddit (mainstream / middle subs)\n' + mainstreamReddit.slice(0, 10).map(renderRedditPost).join('\n\n'));
  }
  if (twitter.length > 0) {
    pinnedBlocks.push('### Twitter\n' + twitter.slice(0, 10).map(renderTwitterPost).join('\n\n'));
  }
  if (hn.length > 0) {
    pinnedBlocks.push('### HackerNews\n' + hn.slice(0, 10).map(renderHNStory).join('\n\n'));
  }

  const nicheBlocks: string[] = [];
  const nicheUrls: string[] = [];
  if (nicheReddit.length > 0) {
    nicheBlocks.push(`### r/${upper}\n` + nicheReddit.slice(0, 10).map(renderRedditPost).join('\n\n'));
    nicheUrls.push(...nicheReddit.slice(0, 10).map((p) => `https://www.reddit.com${p.permalink}`));
  }

  const pageCount = reddit.length + twitter.length + hn.length;

  return {
    pinnedContent: pinnedBlocks.join('\n\n'),
    nicheContent: nicheBlocks.join('\n\n'),
    nicheUrls,
    pageCount,
    highlights,
  };
}

// ---------------------------------------------------------------------------
// Plan 19-C-05 — Task 4: supplemental community aggregation behind shadow.
// ---------------------------------------------------------------------------
//
// `communityAggregated(ticker)` is the entry point that gates Swaggystocks +
// ApeWisdom (SUPPLEMENTAL) behind the `community_supplemental` feature flag.
// Three modes:
//
//   off    → primary community output only (current canonical behavior)
//   shadow → primary path is what the cron writes to community_aggregated;
//            the supplemental candidate runs in setImmediate and persists a
//            ShadowComparison row for offline verdict scoring (D-05, D-14)
//   on     → supplemental candidate populates community_aggregated; primary
//            path still drives the canonical `community_data` JSON column
//
// Promise.allSettled (T-19-C-05-01) — a rate limit on either supplemental can
// NEVER crash the canonical path: settled results are mapped to `null` if
// rejected; null sentinel everywhere downstream.

/**
 * Shape returned by communityAggregated — JSON-serializable so it can land
 * directly in `SentimentSnapshot.community_aggregated` (Json column).
 *
 * The `community` key replaces the historical key from the prior community
 * provider (removed in Phase 30.1). Persisted rows pre-30.1 carry the legacy
 * key in JSONB and are read with optional chaining by downstream consumers;
 * new writes use this shape exclusively.
 */
export interface CommunityAggregated {
  community: EnrichedSnapshot | null;
  swaggystocks: CommunitySignal | null;
  apewisdom: CommunitySignal | null;
}

async function communityPrimaryOnly(ticker: string): Promise<CommunityAggregated> {
  const community = await lightweightCommunityScan(ticker);
  return { community, swaggystocks: null, apewisdom: null };
}

async function communityWithSupplemental(ticker: string): Promise<CommunityAggregated> {
  const [primary, swaggy, ape] = await Promise.allSettled([
    lightweightCommunityScan(ticker),
    fetchSwaggyStocks(ticker),
    fetchApeWisdom(ticker),
  ]);
  return {
    community: primary.status === 'fulfilled' ? primary.value : null,
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
    () => communityPrimaryOnly(ticker),
    () => communityWithSupplemental(ticker),
    FEATURES.community_supplemental_mode,
    { ticker },
  );
}
