/**
 * Phase 30.1 (pivot 2026-05-16) — Xpoz Twitter community-scan adapter
 * (D-35, D-38, D-39).
 *
 * Twitter joins the community-scan via Xpoz Pro. One Twitter search per
 * ticker per run, English-only, 7-day window, ≤25 results. Optional
 * author-authenticity gate via Xpoz `isInauthentic` / `isInauthenticProbScore`
 * for the top citations (≤3 per ticker per run).
 *
 * Composition order is LOAD-BEARING (Phase 30 D-04):
 *
 *   withTelemetry('twitter-xpoz', () =>
 *     withBreaker('twitter-xpoz', () =>
 *       withRetry(() => searchTwitter(...))))
 *
 * Field-shape contract: exported `TwitterPost` matches the snake_case shape
 * consumed by the new `writeTwitterObservations` writer. Conversion from
 * Xpoz's TwitterPost: `created_utc = floor(Date.parse(createdAtDate)/1000)`,
 * `author = authorUsername`, `like_count = likeCount` (and friends), and the
 * permalink URL is synthesized: `https://twitter.com/{author}/status/{id}`.
 *
 * Adapter NEVER throws — matches the apewisdom/reddit precedent. Empty array
 * (NOT null) on any failure — caller iterates. Author-authenticity gate
 * defaults to TRUE on error so a single Xpoz hiccup doesn't drop the post.
 */
import { XpozClient, ResponseType, type TwitterPost as XpozTwitterPost } from '@xpoz/xpoz';
import { withRetry } from '@/lib/data/retry';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { withBreaker } from '@/lib/data/circuit-breaker';

/** D-38 — structured Twitter post matching the writer contract. */
export interface TwitterPost {
  id: string;
  text: string;
  author: string;            // authorUsername
  like_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  impression_count: number;
  lang: string;
  is_retweet: boolean;
  possibly_sensitive: boolean;
  created_utc: number;       // Unix epoch SECONDS — PIT join key
  url: string;               // https://twitter.com/{author}/status/{id}
}

// ── Xpoz client (singleton, lazy) ─────────────────────────────────────────

let _client: XpozClient | null = null;
let _connecting: Promise<XpozClient> | null = null;

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

/** Test-only — reset the singleton between tests. */
export function _resetXpozClientForTests(): void {
  _client = null;
  _connecting = null;
}

// ── Field normalization ───────────────────────────────────────────────────

function normalizeTwitterPost(p: XpozTwitterPost): TwitterPost {
  const createdMs = p.createdAtDate ? new Date(p.createdAtDate).getTime() : Date.now();
  const author = typeof p.authorUsername === 'string' && p.authorUsername.length > 0
    ? p.authorUsername
    : 'unknown';
  const id = typeof p.id === 'string' ? p.id : '';
  return {
    id,
    text: typeof p.text === 'string' ? p.text : '',
    author,
    like_count: typeof p.likeCount === 'number' ? p.likeCount : 0,
    retweet_count: typeof p.retweetCount === 'number' ? p.retweetCount : 0,
    reply_count: typeof p.replyCount === 'number' ? p.replyCount : 0,
    quote_count: typeof p.quoteCount === 'number' ? p.quoteCount : 0,
    impression_count: typeof p.impressionCount === 'number' ? p.impressionCount : 0,
    lang: typeof p.lang === 'string' ? p.lang : 'en',
    is_retweet: typeof p.isRetweet === 'boolean' ? p.isRetweet : false,
    possibly_sensitive: typeof p.possiblySensitive === 'boolean' ? p.possiblySensitive : false,
    created_utc: Math.floor(createdMs / 1000),
    url: id && author !== 'unknown' ? `https://twitter.com/${author}/status/${id}` : '',
  };
}

// ── Search ────────────────────────────────────────────────────────────────

/**
 * Fetch Twitter posts mentioning {ticker} via Xpoz Pro Twitter search.
 * Cost: 2 credits per call.
 *
 * Defaults:
 *   - English only (`language: 'en'`)
 *   - 7-day window via `startDate` (ISO 8601)
 *   - 25 results cap (ResponseType.Fast)
 *
 * Soft-fails to [] on adapter / SDK errors — the surrounding cron must never
 * 500 (Phase 30 D-23).
 */
export async function fetchTwitterCommunity(
  ticker: string,
  opts: { limit?: number; sinceDays?: number } = {},
): Promise<TwitterPost[]> {
  if (!ticker) return [];
  const sinceDays = opts.sinceDays ?? 7;
  const startDate = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    return await withTelemetry('twitter-xpoz', () =>
      withBreaker('twitter-xpoz', () =>
        withRetry(async () => {
          const client = await getClient();
          const upper = ticker.toUpperCase();
          const q = `"$${upper}" OR "${upper} stock"`;
          const result = await client.twitter.searchPosts(q, {
            startDate,
            language: 'en',
            limit: opts.limit ?? 25,
            responseType: ResponseType.Fast,
            fields: [
              'id',
              'text',
              'authorUsername',
              'likeCount',
              'retweetCount',
              'replyCount',
              'quoteCount',
              'impressionCount',
              'lang',
              'isRetweet',
              'possiblySensitive',
              'createdAtDate',
            ],
          });
          const data = result?.data ?? [];
          return data
            .map((p) => normalizeTwitterPost(p))
            .filter((p) => p.id !== '' && p.created_utc > 0);
        }),
      ),
    );
  } catch {
    return [];
  }
}

// ── Author authenticity gate ──────────────────────────────────────────────

/**
 * D-39 — authenticity check via Xpoz `isInauthentic` / `isInauthenticProbScore`.
 * Cost: 2 credits per call. Called only for top-3 citations per ticker per run
 * (~720 credits/day at current scale).
 *
 * Default-true on error: a single Xpoz hiccup should NOT drop legitimate posts
 * from the report. The breaker + telemetry composition still records the failure.
 */
export async function isAuthenticTwitterUser(username: string): Promise<boolean> {
  if (!username) return true;
  try {
    return await withTelemetry('twitter-xpoz', () =>
      withBreaker('twitter-xpoz', () =>
        withRetry(async () => {
          const client = await getClient();
          const user = await client.twitter.getUser(username, {
            fields: ['username', 'isInauthentic', 'isInauthenticProbScore'],
          });
          // Xpoz's TwitterUser interface uses `[key: string]: unknown` so
          // these fields are loosely-typed at the SDK boundary.
          const u = user as unknown as {
            isInauthentic?: boolean | null;
            isInauthenticProbScore?: number | null;
          };
          if (u.isInauthentic === true) return false;
          const score = typeof u.isInauthenticProbScore === 'number'
            ? u.isInauthenticProbScore
            : 0;
          return score <= 0.7;
        }),
      ),
    );
  } catch {
    return true;
  }
}
