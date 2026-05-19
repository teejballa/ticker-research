/**
 * Phase 30.1 (pivot 2026-05-16) — Xpoz Reddit community-scan adapter (D-31..D-37).
 *
 * Supersedes the Reddit OAuth implementation. Reddit closed self-service API
 * access via the Responsible Builder Policy in 2025; Xpoz is the unified
 * replacement (Pro plan: \$16/mo + overage; ~2 credits per Reddit query).
 *
 * Composition order is LOAD-BEARING (Phase 30 D-04):
 *
 *   withTelemetry('reddit-xpoz', () =>
 *     withBreaker('reddit-xpoz', () =>
 *       withRetry(() => searchOneSubreddit(...))))
 *
 * - withTelemetry (outer) records every attempt (incl. BREAKER_OPEN rows).
 * - withBreaker   (middle) short-circuits before the retry budget is touched.
 * - withRetry     (inner) retries 5xx + network only — never 4xx.
 *
 * Field-shape contract (D-37): exported `RedditPost` matches the legacy
 * shape the existing writers in src/lib/sentiment/community-observation-writers.ts
 * expect. Conversion from Xpoz's `RedditPost` (camelCase + ISO date):
 *   created_utc = Math.floor(new Date(p.createdAtDate).getTime() / 1000)
 *   author      = p.authorUsername
 *   subreddit   = p.subredditName
 *   num_comments = p.commentsCount
 *   upvote_ratio = parseFloat(p.upvoteRatio ?? '0')  (defensive — SDK types as number|null but live API has returned strings)
 */
import {
  XpozClient,
  ResponseType,
  type RedditPost as XpozRedditPost,
} from '@xpoz/xpoz';
import { withRetry, withTimeout } from '@/lib/data/retry';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { withBreaker } from '@/lib/data/circuit-breaker';

/** D-37 — structured Reddit post matching the pre-pivot writer contract. */
export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  author: string;
  permalink: string;        // path fragment; prefix with https://www.reddit.com for citation
  created_utc: number;      // Unix epoch SECONDS — PIT join key
  domain: string;
}

// ── Xpoz client (singleton, lazy) ─────────────────────────────────────────

let _client: XpozClient | null = null;
let _connecting: Promise<XpozClient> | null = null;

/**
 * Returns the lazily-connected XpozClient. Concurrent callers share the same
 * connect() promise so the API key is never validated twice during cold start.
 * Reused across cron + report-gen because the SDK is multi-tenant safe.
 */
async function getClient(): Promise<XpozClient> {
  if (_client) return _client;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    const apiKey = process.env.XPOZ_API_KEY ?? '';
    const client = new XpozClient({ apiKey });
    await client.connect();
    _client = client;
    return client;
  })();
  return _connecting;
}

/**
 * Test-only — reset the singleton between tests so per-test mocks (vi.mock of
 * @xpoz/xpoz) take effect. Never called in production code.
 */
export function _resetXpozClientForTests(): void {
  _client = null;
  _connecting = null;
}

// ── Field normalization ───────────────────────────────────────────────────

/**
 * Convert one Xpoz RedditPost (camelCase + ISO date) into the legacy snake_case
 * shape the writers + downstream consumers expect. Defensive type coercion
 * matches the apewisdom adapter precedent — out-of-band shapes degrade to
 * sensible defaults rather than throwing.
 */
function normalizeRedditPost(p: XpozRedditPost): RedditPost {
  const createdMs = p.createdAtDate
    ? new Date(p.createdAtDate).getTime()
    : (typeof p.createdAtTimestamp === 'number' ? p.createdAtTimestamp * 1000 : Date.now());
  const upvoteRatioRaw = p.upvoteRatio;
  const upvoteRatio = typeof upvoteRatioRaw === 'string'
    ? parseFloat(upvoteRatioRaw)
    : typeof upvoteRatioRaw === 'number'
      ? upvoteRatioRaw
      : 0;
  return {
    id: typeof p.id === 'string' ? p.id : '',
    subreddit: typeof p.subredditName === 'string' ? p.subredditName : '',
    title: typeof p.title === 'string' ? p.title : '',
    selftext: typeof p.selftext === 'string' ? p.selftext : '',
    score: typeof p.score === 'number' ? p.score : 0,
    num_comments: typeof p.commentsCount === 'number' ? p.commentsCount : 0,
    upvote_ratio: Number.isFinite(upvoteRatio) ? upvoteRatio : 0,
    author: typeof p.authorUsername === 'string' && p.authorUsername.length > 0
      ? p.authorUsername
      : '[deleted]',
    permalink: typeof p.permalink === 'string' ? p.permalink : '',
    created_utc: Math.floor(createdMs / 1000),
    domain: typeof p.domain === 'string' ? p.domain : '',
  };
}

// ── Search ────────────────────────────────────────────────────────────────

/**
 * Fetch Reddit posts mentioning {ticker} from one subreddit via Xpoz Pro.
 * Cost: 2 credits per call (Pro plan).
 *
 * Query is Lucene-style — `"$TICKER" OR "TICKER stock" OR "TICKER shares"`
 * matches the most common cashtag forms while avoiding `from:`/`since:`-style
 * Twitter operators that don't apply on the Reddit endpoint.
 *
 * Soft-fails to [] on adapter / SDK errors — the surrounding cron must never
 * 500 (Phase 30 D-23). The breaker + telemetry composition picks up the error
 * class for the provider-health dashboard.
 */
export async function fetchRedditCommunity(
  ticker: string,
  subreddit: string,
  opts: { limit?: number; companyName?: string | null } = {},
): Promise<RedditPost[]> {
  if (!ticker || !subreddit) return [];
  try {
    return await withTelemetry('reddit-xpoz', () =>
      withBreaker('reddit-xpoz', () =>
        // 12s hard cap — the Xpoz SDK has no native timeout, and one hung
        // sub search must not stall the whole community-scan fan-out.
        withTimeout(() => withRetry(async () => {
          const client = await getClient();
          const upper = ticker.toUpperCase();
          const name = opts.companyName ? opts.companyName.trim() : '';
          // Expand the query to include company-name forms (e.g. "Apple stock")
          // so a ticker like AAPL also surfaces posts that only mention "Apple".
          // OR'd into the same Xpoz call — no extra request cost.
          const tickerTerms = `"$${upper}" OR "${upper} stock" OR "${upper} shares"`;
          const nameTerms = name ? ` OR "${name} stock" OR "${name} shares"` : '';
          const q = tickerTerms + nameTerms;
          const result = await client.reddit.searchPosts(q, {
            subreddit,
            sort: 'new',
            time: 'week',
            limit: opts.limit ?? 25,
            responseType: ResponseType.Fast,
            fields: [
              'id',
              'title',
              'selftext',
              'authorUsername',
              'subredditName',
              'score',
              'upvotes',
              'commentsCount',
              'upvoteRatio',
              'permalink',
              'createdAtDate',
              'createdAtTimestamp',
              'domain',
              'url',
            ],
          });
          const data = result?.data ?? [];
          return data
            .map((p) => normalizeRedditPost(p))
            .filter((p) => p.id !== '' && p.created_utc > 0);
        }), 12000, `reddit-xpoz:${subreddit}`),
      ),
    );
  } catch {
    // Crons never 500 (Phase 30 D-12). Telemetry + breaker have already
    // recorded the error; the surrounding orchestrator sees [] and continues.
    return [];
  }
}
