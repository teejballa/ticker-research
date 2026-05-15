/**
 * Phase 30.1 — Reddit OAuth community scan (D-01..D-06, D-14, D-18).
 *
 * Auth: app-only OAuth (client_credentials), single shared bearer in Upstash
 * with SETNX-guarded refresh. Rate limited via atomic INCR token bucket on a
 * minute-precision Upstash key. Wrapped with the canonical composition order
 * from Phase 30 D-04:
 *
 *   withTelemetry('reddit', () =>
 *     withBreaker('reddit', () =>
 *       withRetry(() => searchOneSubreddit(...))))
 *
 * Composition order is LOAD-BEARING:
 *   - withTelemetry (outer) records every attempt — including BREAKER_OPEN rows.
 *   - withBreaker   (middle) short-circuits before the retry budget is touched.
 *   - withRetry     (inner) retries 5xx + network only — never 4xx (incl. 429).
 *     Reddit 429s feed the breaker, not the retry budget.
 */

import { getRedis } from '@/lib/data/cache/upstash';
import { withRetry } from '@/lib/data/retry';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { withBreaker } from '@/lib/data/circuit-breaker';

// MANDATORY per D-06 + Reddit TOS.
// https://github.com/reddit-archive/reddit/wiki/API — "Many default User-Agents
// (like 'Python/urllib' or 'Java') are drastically limited to encourage unique
// and descriptive user-agent strings." Missing/generic UA is the #1 cause of
// 429s + bans on Reddit OAuth — non-negotiable.
export const USER_AGENT = 'Cipher/1.0 (by /u/cipher-research)';

export const TOKEN_ENDPOINT = 'https://www.reddit.com/api/v1/access_token';
export const OAUTH_BASE = 'https://oauth.reddit.com';

/** D-14 — structured Reddit post. 10 fields; supersedes the regex-extracted
 *  rawEngagementCount() approximations from the Firecrawl-era community scan. */
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
  created_utc: number;      // Unix epoch SECONDS — PIT join key (D-15)
  domain: string;
}

interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  scope: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────

/**
 * Build an Error subtype carrying an HTTP `status` field so withRetry's
 * `isRetryableError` classifier correctly distinguishes 4xx (surface fast)
 * from 5xx (retry). Error message NEVER carries response body or credentials
 * (T-30.1-02-01).
 */
function statusError(prefix: string, status: number): Error & { status: number } {
  const err = new Error(`${prefix} ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

/**
 * POST to the Reddit OAuth token endpoint with Basic Auth + UA. Bounded by an
 * independent 2s AbortController timeout per RESEARCH Pitfall 2 — a stuck
 * token endpoint must NEVER stall every downstream Reddit call.
 *
 * Throws fail-fast when REDDIT_CLIENT_ID/SECRET are missing (so the cron logs
 * a clear deploy-config error rather than silently returning empty posts).
 *
 * On `!res.ok`, throws an Error with `.status` set so withRetry classifies
 * 5xx as retryable and 4xx (incl. 401) as surface-fast.
 */
async function mintFreshToken(): Promise<TokenResponse> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) throw new Error('reddit: REDDIT_CLIENT_ID/SECRET unset');

  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: 'grant_type=client_credentials',
      signal: ctrl.signal,
    });
    if (!res.ok) throw statusError('reddit token', res.status);
    return (await res.json()) as TokenResponse;
  } finally {
    clearTimeout(timer);
  }
}

// ── OAuth ─────────────────────────────────────────────────────────────────

/**
 * Returns a cached bearer token (24h - 60s TTL) or mints a fresh one. Uses a
 * SETNX lock on `reddit:oauth_token:refresh_lock` (5s TTL) to prevent the
 * concurrent-cold-start mint dogpile. Graceful-degrades to direct mint when
 * Upstash is unavailable.
 *
 * Wrapped externally with withRetry so 5xx during token mint backs off
 * exponentially across the 3-attempt budget; 4xx (incl. 401 from rotated
 * credentials) surfaces immediately for clear deploy-config feedback.
 */
export async function getRedditToken(): Promise<string> {
  const r = getRedis();
  if (!r) {
    const fresh = await withRetry(mintFreshToken);
    return fresh.access_token;
  }

  // Read path — fast path when cache is warm.
  try {
    const cached = await r.get<string>('reddit:oauth_token');
    if (cached) return cached;
  } catch {
    // Upstash transient read failure — fall through to lock + mint
  }

  // SETNX guard against concurrent mint dogpile (D-03 / T-30.1-02-03).
  let lockHeld = false;
  try {
    const lock = await r.set('reddit:oauth_token:refresh_lock', '1', { ex: 5, nx: true });
    lockHeld = lock === 'OK';
  } catch {
    lockHeld = false;
  }

  if (!lockHeld) {
    // Another invocation is minting — wait briefly and re-read. On second miss
    // we fall through to mint anyway so an orphaned lock cannot deadlock the path.
    await new Promise((res) => setTimeout(res, 200));
    try {
      const retry = await r.get<string>('reddit:oauth_token');
      if (retry) return retry;
    } catch {
      // Fall through to mint
    }
  }

  try {
    const tok = await withRetry(mintFreshToken);
    try {
      // ex = expires_in - 60s safety margin. Floor at 60s so a degenerate
      // upstream expires_in cannot produce a non-positive TTL.
      await r.set('reddit:oauth_token', tok.access_token, {
        ex: Math.max(60, tok.expires_in - 60),
      });
    } catch {
      // Cache-write failure is benign — token still usable for this call.
    }
    return tok.access_token;
  } finally {
    if (lockHeld) {
      try { await r.del('reddit:oauth_token:refresh_lock'); } catch { /* swallow */ }
    }
  }
}

// ── Rate bucket ───────────────────────────────────────────────────────────

/**
 * Env-driven QPM ceilings per RESEARCH Open Question 1 (RESOLVED 2026-05-15).
 *
 * Defaults: 60 report / 40 cron — safer ship matching the archived Reddit
 * wiki guidance. Operator may bump to 100/70 via env after 7d clean operation.
 * Read fresh per call (no module-level memoization) so live env edits during
 * production load take effect on next invocation.
 *
 * Cron always sits below report so synchronous user-facing report-gen wins
 * under contention (D-04 priority).
 */
function rateCeilingReport(): number {
  return Number(process.env.REDDIT_QPM_CEILING_REPORT ?? 60);
}
function rateCeilingCron(): number {
  return Number(process.env.REDDIT_QPM_CEILING_CRON ?? 40);
}

/**
 * Atomic minute-precision rate bucket via Upstash INCR + EXPIRE.
 *
 * Returns 'ok' when the post-INCR count is ≤ the priority-specific ceiling,
 * 'throttle' otherwise. Graceful-degrades to 'ok' when Upstash is unavailable
 * (the upstream Reddit 429 + breaker would catch a real overload).
 *
 * Known minute-boundary race (RESEARCH Pitfall 6 / T-30.1-02-08): fixed-window
 * counter can briefly double-throughput at minute roll-over. Accepted because
 * the 60 QPM default leaves enough headroom and a real production 429 surge
 * would trip the breaker independently.
 */
export async function consumeRateToken(
  priority: 'report' | 'cron',
): Promise<'ok' | 'throttle'> {
  const r = getRedis();
  if (!r) return 'ok';

  const nowSec = Math.floor(Date.now() / 1000);
  const minuteKey = `reddit:rate_bucket:${Math.floor(nowSec / 60)}`;

  let count: number;
  try {
    count = await r.incr(minuteKey);
    if (count === 1) {
      try { await r.expire(minuteKey, 65); } catch { /* benign — best-effort */ }
    }
  } catch {
    // Upstash transient failure — degrade to 'ok'; real overload would surface
    // via Reddit 429 → breaker independently.
    return 'ok';
  }

  const ceiling = priority === 'report' ? rateCeilingReport() : rateCeilingCron();
  return count <= ceiling ? 'ok' : 'throttle';
}

// ── Search ────────────────────────────────────────────────────────────────

interface RedditListing {
  kind: 'Listing';
  data: { children: Array<{ kind: 't3'; data: Record<string, unknown> }> };
}

/**
 * Internal — GET /r/{sub}/search.json with Bearer auth + UA. Maps the Listing
 * response into RedditPost[] with defensive type coercion. Filters out rows
 * with empty id or created_utc=0 (malformed / deleted posts).
 *
 * On !res.ok throws with err.status set — caller's withRetry classifies, and
 * 4xx (403 banned sub / 404 missing) surfaces fast as a per-sub failure that
 * Promise.allSettled in fetchRedditCommunity absorbs.
 */
async function searchOneSubreddit(
  ticker: string,
  sub: string,
  token: string,
): Promise<RedditPost[]> {
  const url =
    `${OAUTH_BASE}/r/${sub}/search.json?q=${encodeURIComponent(ticker.toUpperCase())}` +
    `&restrict_sr=on&sort=new&t=week&limit=25`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw statusError(`reddit search ${sub}`, res.status);
  const body = (await res.json()) as RedditListing;
  const children = body?.data?.children ?? [];
  return children
    .map((c) => c.data as Record<string, unknown>)
    .map((d): RedditPost => ({
      id: typeof d.id === 'string' ? d.id : '',
      subreddit: typeof d.subreddit === 'string' ? d.subreddit : sub,
      title: typeof d.title === 'string' ? d.title : '',
      selftext: typeof d.selftext === 'string' ? d.selftext : '',
      score: typeof d.score === 'number' ? d.score : 0,
      num_comments: typeof d.num_comments === 'number' ? d.num_comments : 0,
      upvote_ratio: typeof d.upvote_ratio === 'number' ? d.upvote_ratio : 1.0,
      author: typeof d.author === 'string' ? d.author : '[deleted]',
      permalink: typeof d.permalink === 'string' ? d.permalink : '',
      created_utc: typeof d.created_utc === 'number' ? d.created_utc : 0,
      domain: typeof d.domain === 'string' ? d.domain : '',
    }))
    .filter((p) => p.id !== '' && p.created_utc > 0);
}

/**
 * Fan out per-subreddit search via Promise.allSettled (D-18). Sequence:
 *
 *   1. consumeRateToken(priority) — on 'throttle' return [] (no token, no fetch)
 *   2. getRedditToken() — one mint amortized across all subs
 *   3. Promise.allSettled over subs.map(sub => withTelemetry → withBreaker → withRetry)
 *   4. Flatten fulfilled, drop rejected (per-sub 403 / 404 / breaker-trip = soft-skip)
 *
 * Token mint failure (e.g., REDDIT_CLIENT_ID/SECRET unset in prod) soft-fails
 * to empty array so the surrounding cron's "crons never 500" invariant holds.
 */
export async function fetchRedditCommunity(
  ticker: string,
  subs: string[],
  priority: 'report' | 'cron' = 'cron',
): Promise<RedditPost[]> {
  if (!subs || subs.length === 0) return [];

  const throttle = await consumeRateToken(priority);
  if (throttle === 'throttle') return [];

  let token: string;
  try {
    token = await getRedditToken();
  } catch {
    // Token mint failed (e.g., unset creds, 401 from rotated app, persistent 5xx).
    // No Reddit calls possible — soft-fail to [] so caller's Promise.allSettled
    // siblings can still populate the SourcePackage.
    return [];
  }

  const results = await Promise.allSettled(
    subs.map((sub) =>
      withTelemetry(
        'reddit',
        () =>
          withBreaker('reddit', () =>
            withRetry(() => searchOneSubreddit(ticker, sub, token)),
          ),
        { ticker },
      ),
    ),
  );

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
