// src/lib/data/stocktwits.ts
// StockTwits public API wrapper — bull/bear sentiment from recent messages.
// API: GET https://api.stocktwits.com/api/2/streams/symbol/{TICKER}.json
// No auth required (public endpoint). Rate limits unspecified — treat as best-effort.
// VERIFIED: live API test against GME (2026-04-18) — entities.sentiment per-message,
//           no is_trending flag, symbol.sentiment_change used as proxy.
//
// Plan 19-C-03 (D-35) — additive reputation-weighted aggregation behind the
// FEATURE_REPUTATION_WEIGHTED_STOCKTWITS three-mode flag. The naive count path
// is preserved verbatim when the flag is `off`; it remains the fall-back the
// shadow A/B compares against until the cutover PR per D-05.

import { FEATURES } from '@/lib/features';
import { runWithShadow } from '@/lib/shadow/shadow-runner';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import {
  getBaselineForTicker,
  mentionZScore,
  getZThresh,
} from '@/lib/sentiment/baseline';

// ── Plan 20-A-02 — shadow-gated is_trending replacement ─────────────────────
//
// Legacy heuristic (off-path, preserved verbatim):
//   stocktwits_is_trending = Math.abs(symbol.sentiment_change) > 0.5
//
// New path (shadow/on): per-ticker rolling-90d median + MAD baseline →
// z-score → cap_class-stratified threshold lookup. Cap-class is left as
// 'unknown' here (StockTwits fetcher has no market-cap context) — the
// cutover plan will wire upstream cap_class resolution before mode='on'.
async function computeIsTrendingShadowed(
  ticker: string,
  sentiment_change: number,
  message_count: number,
): Promise<boolean> {
  const legacy = (): Promise<boolean> => Promise.resolve(Math.abs(sentiment_change) > 0.5);
  const baselineGated = async (): Promise<boolean> => {
    const baseline = await getBaselineForTicker(ticker, 'community', new Date());
    if (!baseline) return Math.abs(sentiment_change) > 0.5; // sparse-data fallback
    const z = mentionZScore(message_count, baseline);
    return z > getZThresh('unknown');
  };
  return runWithShadow<boolean>(
    'stocktwits.is_trending',
    legacy,
    baselineGated,
    FEATURES.mention_z_trending_mode,
    { ticker },
  );
}

// ── Public API types (existing) ──────────────────────────────────────────────
interface StockTwitsMessage {
  id: number;
  body: string;
  created_at: string;
  user?: { id: number; followers?: number; ideas?: number };
  entities?: {
    sentiment: { basic: 'Bullish' | 'Bearish' } | null;
  };
}

interface StockTwitsResponse {
  response: { status: number };
  symbol?: {
    symbol: string;
    sentiment_change?: number; // float delta — proxy for trending intensity (no is_trending flag)
  };
  messages?: StockTwitsMessage[];
}

export interface StockTwitsResult {
  collected_at: string;
  stocktwits_bull_pct: number | null;
  stocktwits_bear_pct: number | null;
  stocktwits_message_count: number | null;
  stocktwits_is_trending: boolean | null;
  /**
   * Plan 19-C-03 — populated only when FEATURE_REPUTATION_WEIGHTED_STOCKTWITS
   * runs the new path (mode='on' OR the shadow background pass). Range:
   * [-1, 1] — `+1` all reputation-weighted bullish, `-1` all bearish, `0`
   * balanced. `null` when the new path didn't run or when there were no
   * labeled messages.
   */
  stocktwits_reputation_weighted_score?: number | null;
  /** ASVS-friendly diagnostic: total reputation across all labeled messages. */
  stocktwits_reputation_total?: number | null;
  error?: string;
}

// ── Plan 19-C-03 — reputation primitives + cache (additive) ─────────────────

export interface StocktwitsUserSnapshot {
  id: number;
  /** Follower count from /api/2/users/show.json — null/undefined treated as 0. */
  followers: number | null | undefined;
  /** Number of posts/ideas authored — proxy for post_history. */
  post_count: number | null | undefined;
}

export interface StocktwitsScoredMessage {
  /** -1 bearish, +1 bullish (already mapped from API sentiment.basic). */
  sentiment: -1 | 1;
  /**
   * Per-message reputation weight. `null` when the user-info endpoint failed
   * or the user has no public profile — falls through to naive count when
   * EVERY message in the batch has null reputation (test 4).
   */
  reputation: number | null;
}

/**
 * Pure formula pinned by tests/lib/data/stocktwits.reputation.test.ts:
 *   r = log10(followers + 1) + log10(post_count + 1)
 *
 * When `group` is provided, the raw weight is winsorized at the percentile-95
 * of the group's raw weights (T-19-C-03-01 mitigation). Without `group`, the
 * raw weight is returned — callers must opt-in to capping by passing the
 * full message group. We use linear interpolation between the floor/ceil ranks
 * to handle small sample sizes deterministically.
 */
export function reputationWeight(
  user: StocktwitsUserSnapshot,
  group?: StocktwitsUserSnapshot[],
): number {
  const followers = user.followers ?? 0;
  const post_count = user.post_count ?? 0;
  const raw = Math.log10(Math.max(0, followers) + 1) + Math.log10(Math.max(0, post_count) + 1);
  if (!group || group.length === 0) return raw;

  const sorted = group
    .map((u) => Math.log10(Math.max(0, u.followers ?? 0) + 1) + Math.log10(Math.max(0, u.post_count ?? 0) + 1))
    .sort((a, b) => a - b);
  // p95 via linear interpolation: index = 0.95 * (n - 1).
  const idx = 0.95 * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const cap = sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
  return Math.min(raw, cap);
}

/**
 * Σ(s_i × r_i) / Σ(r_i) over messages with non-null reputation. When EVERY
 * message has null reputation the function falls back to the naive arithmetic
 * mean of sentiments (test 4). When the message list is empty, returns 0.
 */
export function reputationWeightedSentiment(messages: StocktwitsScoredMessage[]): number {
  if (messages.length === 0) return 0;
  const labeled = messages.filter((m) => m.reputation != null && m.reputation > 0);
  if (labeled.length === 0) {
    // Naive fallback: arithmetic mean of sentiments.
    return messages.reduce((acc, m) => acc + m.sentiment, 0) / messages.length;
  }
  let num = 0;
  let den = 0;
  for (const m of labeled) {
    num += m.sentiment * (m.reputation as number);
    den += m.reputation as number;
  }
  return den === 0 ? 0 : num / den;
}

// ── 24h per-user reputation cache (T-19-C-03-02) ────────────────────────────
//
// Implementation note: 19-B-01 (Upstash cache wrapper) is the long-term home
// for this cache; until it lands, the cache is an in-process Map with
// epoch-based TTL eviction. The public surface — `getUserReputation(userId,
// fetcher)` — matches the `cached(key, fetcher, opts)` shape one-to-one so the
// Upstash migration is a one-liner inside this helper.

const REPUTATION_TTL_MS = 86_400 * 1_000;
type CachedEntry = { value: StocktwitsUserSnapshot; expires: number };
const reputationCache = new Map<number, CachedEntry>();

/** Test seam — only used by tests/lib/data/stocktwits.reputation.test.ts. */
export function __resetReputationCacheForTests(): void {
  reputationCache.clear();
}

export type ReputationFetcher = (userId: number) => Promise<StocktwitsUserSnapshot>;

/**
 * Cached wrapper around the StockTwits /api/2/users/show.json endpoint.
 * `fetcher` is injectable so unit tests can mock the network — production
 * callers omit it and the default StockTwits HTTP fetcher is used.
 *
 * Cache lifecycle:
 *   - first call for `userId` → fetcher runs, value cached for 24h.
 *   - subsequent calls within 24h → cache hit, fetcher skipped.
 *   - calls after 24h → cache expired, fetcher runs again.
 *
 * On fetcher rejection the rejection propagates; the caller wraps each user
 * fetch in a `Promise.allSettled` so a single 4xx for one user never blocks
 * the rest of the batch.
 */
export async function getUserReputation(
  userId: number,
  fetcher: ReputationFetcher = defaultFetchUserSnapshot,
): Promise<StocktwitsUserSnapshot> {
  const now = Date.now();
  const hit = reputationCache.get(userId);
  if (hit && hit.expires > now) return hit.value;
  const value = await fetcher(userId);
  reputationCache.set(userId, { value, expires: now + REPUTATION_TTL_MS });
  return value;
}

async function defaultFetchUserSnapshot(userId: number): Promise<StocktwitsUserSnapshot> {
  // GET https://api.stocktwits.com/api/2/users/show/{user_id}.json
  // Response shape (verified against public docs):
  //   { user: { id, followers, ideas, ... } }
  // We treat absent fields as 0 (the reputation formula clamps to ≥0).
  const url = `https://api.stocktwits.com/api/2/users/show/${userId}.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    return { id: userId, followers: 0, post_count: 0 };
  }
  const data = (await res.json()) as { user?: { id?: number; followers?: number; ideas?: number } };
  return {
    id: data.user?.id ?? userId,
    followers: data.user?.followers ?? 0,
    post_count: data.user?.ideas ?? 0,
  };
}

// ── Existing public API + reputation-weighted dual path (additive) ──────────

export async function fetchStockTwitsSentiment(ticker: string): Promise<StockTwitsResult> {
  // Plan 19-C-03 — branch on FEATURES.reputation_weighted_stocktwits_mode.
  // Off (default): existing naive count path, byte-identical to pre-Phase-19
  //   behavior.
  // Shadow:        old returns first, new runs in setImmediate via
  //   runWithShadow → ShadowComparison row persisted for verdict scoring.
  // On:            reputation-weighted path is canonical (post-cutover).
  return runWithShadow(
    'stocktwits-reputation-weighted',
    () => fetchStockTwitsSentimentNaive(ticker),
    () => fetchStockTwitsSentimentReputationWeighted(ticker),
    FEATURES.reputation_weighted_stocktwits_mode,
    { ticker },
  );
}

/**
 * The historical naive count path — preserved verbatim until the shadow
 * verdict PASSes per D-05. Exported for the cutover PR's deletion target so
 * `git rm` is the entire body of this function.
 */
export async function fetchStockTwitsSentimentNaive(ticker: string): Promise<StockTwitsResult> {
  const collected_at = new Date().toISOString();
  const empty = (error?: string): StockTwitsResult => ({
    collected_at,
    stocktwits_bull_pct: null,
    stocktwits_bear_pct: null,
    stocktwits_message_count: null,
    stocktwits_is_trending: null,
    ...(error ? { error } : {}),
  });

  try {
    const res = await withTelemetry(
      'stocktwits',
      () =>
        fetch(
          `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`,
          { signal: AbortSignal.timeout(5000) },
        ),
      { ticker },
    );
    if (!res.ok) return empty(`StockTwits API error: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as StockTwitsResponse;
    const messages = data.messages ?? [];

    const labeled = messages.filter((m) => m.entities?.sentiment != null);
    const bullish = labeled.filter((m) => m.entities!.sentiment!.basic === 'Bullish').length;
    const total = labeled.length;

    const bull_pct = total > 0 ? Math.round((bullish / total) * 100) : null;
    const bear_pct = total > 0 ? 100 - bull_pct! : null;

    const sentiment_change = data.symbol?.sentiment_change ?? 0;
    const is_trending = await computeIsTrendingShadowed(
      ticker,
      sentiment_change,
      messages.length,
    );

    return {
      collected_at,
      stocktwits_bull_pct: bull_pct,
      stocktwits_bear_pct: bear_pct,
      stocktwits_message_count: messages.length,
      stocktwits_is_trending: is_trending,
    };
  } catch {
    return empty('StockTwits fetch failed');
  }
}

/**
 * Plan 19-C-03 — reputation-weighted path. Same outer shape as the naive
 * path, but populates `stocktwits_reputation_weighted_score` and adjusts
 * `stocktwits_bull_pct` / `stocktwits_bear_pct` based on the weighted score:
 *
 *   score ∈ [-1, 1] → bull_pct = round(50 + 50 * score), bear_pct = 100 - bull_pct
 *
 * Per-user reputation is fetched in parallel via Promise.allSettled and
 * cached per-user for 24h via getUserReputation. Failed user fetches degrade
 * gracefully — those messages contribute null reputation, which the
 * reputationWeightedSentiment fallback handles when the entire batch is null.
 */
export async function fetchStockTwitsSentimentReputationWeighted(
  ticker: string,
): Promise<StockTwitsResult> {
  const collected_at = new Date().toISOString();
  const empty = (error?: string): StockTwitsResult => ({
    collected_at,
    stocktwits_bull_pct: null,
    stocktwits_bear_pct: null,
    stocktwits_message_count: null,
    stocktwits_is_trending: null,
    stocktwits_reputation_weighted_score: null,
    stocktwits_reputation_total: null,
    ...(error ? { error } : {}),
  });

  try {
    const res = await withTelemetry(
      'stocktwits',
      () =>
        fetch(
          `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`,
          { signal: AbortSignal.timeout(5000) },
        ),
      { ticker },
    );
    if (!res.ok) return empty(`StockTwits API error: ${res.status} ${res.statusText}`);

    const data = (await res.json()) as StockTwitsResponse;
    const messages = data.messages ?? [];

    // Keep only labeled messages with a numeric author id.
    const labeled = messages.filter(
      (m): m is StockTwitsMessage & { user: { id: number }; entities: { sentiment: { basic: 'Bullish' | 'Bearish' } } } =>
        m.entities?.sentiment != null && typeof m.user?.id === 'number',
    );

    if (labeled.length === 0) {
      const sentiment_change = data.symbol?.sentiment_change ?? 0;
      return {
        collected_at,
        stocktwits_bull_pct: null,
        stocktwits_bear_pct: null,
        stocktwits_message_count: messages.length,
        stocktwits_is_trending: await computeIsTrendingShadowed(
          ticker,
          sentiment_change,
          messages.length,
        ),
        stocktwits_reputation_weighted_score: null,
        stocktwits_reputation_total: 0,
      };
    }

    // Resolve per-user reputation in parallel. Each lookup is independent —
    // a 4xx on one user must not block the rest.
    const uniqueUserIds = Array.from(new Set(labeled.map((m) => m.user.id)));
    const settled = await Promise.allSettled(
      uniqueUserIds.map((id) => getUserReputation(id)),
    );
    const snapshotsById = new Map<number, StocktwitsUserSnapshot>();
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') snapshotsById.set(uniqueUserIds[i]!, r.value);
    });

    // Build the group for winsorization, then score each message.
    const group: StocktwitsUserSnapshot[] = Array.from(snapshotsById.values());
    const scored: StocktwitsScoredMessage[] = labeled.map((m) => {
      const snap = snapshotsById.get(m.user.id);
      const sentiment: -1 | 1 = m.entities.sentiment.basic === 'Bullish' ? 1 : -1;
      const reputation = snap == null ? null : reputationWeight(snap, group);
      return { sentiment, reputation };
    });

    const score = reputationWeightedSentiment(scored); // ∈ [-1, 1]
    const reputation_total = scored.reduce(
      (acc, m) => acc + (m.reputation == null ? 0 : m.reputation),
      0,
    );

    // Map [-1, 1] → bull_pct ∈ [0, 100].
    const bull_pct = Math.round(50 + 50 * score);
    const bear_pct = 100 - bull_pct;

    const sentiment_change = data.symbol?.sentiment_change ?? 0;
    const is_trending = await computeIsTrendingShadowed(
      ticker,
      sentiment_change,
      messages.length,
    );

    return {
      collected_at,
      stocktwits_bull_pct: bull_pct,
      stocktwits_bear_pct: bear_pct,
      stocktwits_message_count: messages.length,
      stocktwits_is_trending: is_trending,
      stocktwits_reputation_weighted_score: score,
      stocktwits_reputation_total: reputation_total,
    };
  } catch {
    return empty('StockTwits fetch failed');
  }
}

// ── Plan 20-Z-04 follow-up (2026-05-13) — raw message bag for PIT feature store ──
//
// `fetchStockTwitsRaw(ticker)` returns the raw StockTwits message stream so the
// sentiment-scan cron can write per-message rows to `sentiment_observations`
// (Phase 20-Z-01 PIT feature store) AND `bot_filter_flags` /
// `coordination_clusters` (Phase 20-C-03).
//
// Prior to this function, the sentiment-scan cron silently dropped every
// message because no upstream surfaced `stocktwits.messages`. The PIT feature
// store sat at 0 rows in production despite the table existing, starving
// every downstream calibrator (20-A-03 / 20-B-04 / 20-C-01).
//
// Shape matches what the cron's per-message loop expects:
//   { id, body, created_at, user: { username, followers, ideas, created_at, identity } }
//
// Returns [] (NOT null) on any failure — the cron's downstream writes are
// gated on `messages.length > 0`, so an empty bag is a safe no-op.

export interface StockTwitsRawMessage {
  id: string | number;
  body: string;
  created_at: string;
  user: {
    username?: string;
    followers?: number;
    ideas?: number;
    created_at?: string;
    identity?: string;
  };
}

interface StockTwitsRawApiMessage {
  id?: number | string;
  body?: string;
  created_at?: string;
  user?: {
    username?: string;
    followers?: number;
    ideas?: number;
    created_at?: string;
    identity?: string;
  };
}

export async function fetchStockTwitsRaw(ticker: string): Promise<StockTwitsRawMessage[]> {
  try {
    const res = await withTelemetry(
      'stocktwits',
      () =>
        fetch(
          `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`,
          { signal: AbortSignal.timeout(5000) },
        ),
      { ticker },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: StockTwitsRawApiMessage[] };
    const messages = data.messages ?? [];
    return messages
      .filter((m): m is StockTwitsRawApiMessage & { id: number | string; body: string; created_at: string } =>
        m.id != null && typeof m.body === 'string' && typeof m.created_at === 'string',
      )
      .map((m) => ({
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        user: {
          username: m.user?.username,
          followers: m.user?.followers,
          ideas: m.user?.ideas,
          created_at: m.user?.created_at,
          identity: m.user?.identity,
        },
      }));
  } catch {
    return [];
  }
}
