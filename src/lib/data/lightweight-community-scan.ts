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
// Plan 30.1-03 — `after()` from next/server is the Vercel-honored primitive
// that extends the lambda lifetime past the response so background work
// completes. `setImmediate` is unsafe on Vercel — the function may complete
// before the immediate callback fires. https://nextjs.org/docs/app/api-reference/functions/after
import { after } from 'next/server';
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
import { FEATURES, COMMUNITY_SCAN_SOURCE } from '@/lib/features';
import { computeSentimentDimensions, type SentimentDimensions } from '@/lib/sentiment-dimensions';
import { classifyCapClass, type CapClass } from '@/lib/diffusion-trace';
import type { CommunityHighlight } from '@/lib/types';
// Plan 30.1-03 — Reddit + HackerNews adapters wired in behind the
// COMMUNITY_SCAN_SOURCE flag. The legacy Firecrawl branch is preserved
// byte-equivalent in runFirecrawlPath; the new path lives in runXpozPath.
//
// Plan 30.1-pivot (D-35, D-36, D-39) — Xpoz Pro replaces Reddit OAuth and
// adds Twitter; flag values become 'firecrawl' | 'xpoz' | 'shadow'.
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
  /**
   * Plan 30.1-03 (D-20) — additive optional fields. Populated by the Xpoz
   * branch; undefined on the Firecrawl branch. Plan 30.1-04's sentiment-scan
   * writer reads these via `(snapshot as EnrichedSnapshot).reddit_posts ?? []`.
   *
   * D-20 contract: the PUBLIC EnrichedSnapshot shape is unchanged for
   * downstream consumers (source-package.ts, research-brief.ts, the SSE
   * progress beats, the report renderer, the sentiment-scan cron). These
   * optional fields are additive — every existing consumer continues to work.
   *
   * Plan 30.1-pivot (D-35, D-38) — `twitter_posts` added for the new Xpoz
   * Twitter ingest. Same additive contract.
   */
  reddit_posts?: RedditPost[];
  hackernews_stories?: HNStory[];
  twitter_posts?: TwitterPost[];
}

/**
 * Plan 30.1-03 — legacy Firecrawl community scan (pre-plan body, verbatim
 * extraction so the runtime contract on the firecrawl branch is byte-equivalent
 * to pre-plan-30.1-03 behavior). Promoted to a top-level entry point
 * `lightweightCommunityScan` flips between this and `runRedditPath` based on
 * `COMMUNITY_SCAN_SOURCE` (D-25).
 */
async function runFirecrawlPath(ticker: string): Promise<EnrichedSnapshot | null> {
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

/**
 * Plan 30.1-pivot — Xpoz community path. Fan-out is `Promise.allSettled` over
 * per-subreddit Reddit calls + Twitter + HN + StockTwits + Quiver + Yahoo
 * (D-21 — no new failure modes vs the legacy Firecrawl path: each adapter
 * already null/empty-degrades, and the wrapping `.catch()` here is belt &
 * braces in case any adapter regresses into throwing).
 *
 * Pre-flight: if XPOZ_API_KEY is unset, returns null + console.warn so the
 * operator notices a partial cutover at boot. Mirrors the legacy
 * `if (!process.env.FIRECRAWL_API_KEY) return null;` short-circuit.
 *
 * Reddit fan-out: each subreddit gets its own `fetchRedditCommunity` call (one
 * Xpoz query each). 10 subs from COMMUNITY_SUBS + r/{TICKER} niche = 11 calls.
 * Wrapped in Promise.allSettled so a 403 on a private sub doesn't poison the
 * rest; results are flattened.
 *
 * Twitter (D-35): one Xpoz Twitter search per ticker per run. Authenticity
 * filter (D-39) gates the top-3 highest-engagement posts via
 * `isAuthenticTwitterUser`.
 *
 * Highlight assembly (D-19, D-24, D-38): one highlight per subreddit that
 * produced ≥1 post + one HN highlight if HN returned ≥1 story + one Twitter
 * highlight if Twitter returned ≥1 (post-authenticity) post. Each highlight
 * gets `standout_quote` + `standout_url`.
 */
async function runXpozPath(
  ticker: string,
  _priority: 'report' | 'cron',
): Promise<EnrichedSnapshot | null> {
  if (!process.env.XPOZ_API_KEY) {
    console.warn(
      '[community-scan] Xpoz path selected but XPOZ_API_KEY unset — returning null',
    );
    return null;
  }

  const upper = ticker.toUpperCase();
  const subs = [...COMMUNITY_SUBS.map(s => s.name), upper];

  // Per-sub fan-out via Promise.allSettled so one 403/404 doesn't drop the rest.
  const subResults = await Promise.allSettled(
    subs.map((sub) => fetchRedditCommunity(upper, sub)),
  );
  const reddit_posts: RedditPost[] = subResults.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : [],
  );

  // Remaining fetchers — same parallel shape as the legacy path.
  const [
    twitterRes,
    hnRes,
    stocktwitsResult,
    stocktwitsRawMessages,
    marketCap,
    quiverInsiderRes,
    quiverCongressRes,
  ] = await Promise.all([
    fetchTwitterCommunity(upper).catch((err: unknown) => {
      console.warn(
        '[community-scan twitter] failed:',
        err instanceof Error ? err.message : String(err),
      );
      return [] as TwitterPost[];
    }),
    fetchHackerNewsStories(upper),
    fetchStockTwitsSentiment(upper),
    fetchStockTwitsRaw(upper),
    yf
      .quote(upper)
      .then(q => q.marketCap ?? null)
      .catch(() => null),
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
    // for unknown tickers (legacy Firecrawl path does the same via empty
    // highlights + empty enrichedHighlights → caller's `if (!snapshot) ...`
    // branch). Here we return null directly when the entire fan-out is empty.
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
  };
}

/**
 * Public entry point — flag-gated branch between Firecrawl (legacy) and
 * the Xpoz (Reddit + Twitter + HN) path (D-25, D-36). Shadow mode runs the
 * new path in the background via `after()` (Vercel-honored lambda-lifetime
 * extender) so the Xpoz telemetry rows still land in ProviderCallLog while
 * the returned shape stays Firecrawl-driven.
 *
 * Default `priority: 'cron'` because both the cron and `/api/research/[ticker]`
 * call this function and the cron is the dominant caller (D-04, D-21).
 */
export async function lightweightCommunityScan(
  ticker: string,
  priority: 'report' | 'cron' = 'cron',
): Promise<EnrichedSnapshot | null> {
  const source = COMMUNITY_SCAN_SOURCE;
  if (source === 'firecrawl') {
    return runFirecrawlPath(ticker);
  }
  if (source === 'shadow') {
    // Fire-and-forget the new path for telemetry observation. Return the
    // canonical Firecrawl result. `after()` from next/server extends the
    // lambda lifetime past the response so Vercel actually runs the
    // background work (setImmediate is unsafe on Vercel — the function
    // may complete before the immediate callback fires).
    // https://nextjs.org/docs/app/api-reference/functions/after
    after(async () => {
      try {
        await runXpozPath(ticker, priority);
      } catch (err) {
        console.warn(
          '[community-scan shadow] xpoz path failed:',
          err instanceof Error ? err.message : String(err),
        );
      }
    });
    return runFirecrawlPath(ticker);
  }
  // source === 'xpoz'
  return runXpozPath(ticker, priority);
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
