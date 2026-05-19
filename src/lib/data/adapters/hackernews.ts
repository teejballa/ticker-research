/**
 * Phase 30.1 — HackerNews Algolia search adapter (D-07..D-09, D-16, D-18).
 *
 * Endpoint is free + no auth (per https://hn.algolia.com/api). Rate limit is
 * per-IP only; Vercel's shared egress means breaker is the safety net.
 *
 * Composition order (LOAD-BEARING — Phase 30 D-04):
 *
 *   cached(comm:{TICKER}:hackernews, () =>
 *     withTelemetry('hackernews', () =>
 *       withBreaker('hackernews', () =>
 *         withRetry(() => doFetchHN(ticker)))))
 *
 * - cached      (outermost) — 10min TTL via shared community cache namespace.
 * - withTelemetry         — every attempt (incl. BREAKER_OPEN) lands in ProviderCallLog.
 * - withBreaker           — short-circuits before retry budget on sustained errors.
 * - withRetry  (innermost) — 5xx + network only; 4xx (incl. 429) surfaces fast.
 *
 * Adapter NEVER throws — matches the apewisdom precedent (Phase 19-C-05
 * T-19-C-05-01). Empty array (NOT null) on any failure — caller iterates.
 */

import { cached } from '@/lib/data/cache/upstash';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { withBreaker } from '@/lib/data/circuit-breaker';
import { withRetry } from '@/lib/data/retry';

export const HN_SEARCH_ENDPOINT = 'https://hn.algolia.com/api/v1/search';

/** D-16 — structured HackerNews story. 9 fields, mirrors RedditPost PIT shape. */
export interface HNStory {
  objectID: string;
  title: string;
  url: string | null;
  story_text: string | null;
  points: number;
  num_comments: number;
  author: string;
  created_at_i: number;     // Unix epoch SECONDS — PIT join key
  permalink: string;        // computed: https://news.ycombinator.com/item?id={objectID}
}

interface HNHit {
  objectID: string;
  title?: string;
  url?: string | null;
  story_text?: string | null;
  points?: number;
  num_comments?: number;
  author?: string;
  created_at_i?: number;
}

interface HNSearchEnvelope {
  hits?: HNHit[];
}

/**
 * Build an Error subtype carrying an HTTP `status` so withRetry's
 * `isRetryableError` classifier correctly distinguishes 4xx (surface fast)
 * from 5xx (retry). Error message NEVER carries response body (T-30.1-03-01).
 */
function statusError(prefix: string, status: number): Error & { status: number } {
  const err = new Error(`${prefix} ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

/**
 * Single fetch + map. Throws on !res.ok with err.status set so withRetry's
 * classifier handles 5xx (retry) vs 4xx (surface fast / fed to breaker).
 *
 * Defensive coercion on every field (T-30.1-03-01): the Algolia response is
 * untrusted JSON; we filter rows missing the two PIT-critical fields
 * (`objectID` + `created_at_i`) and coerce the rest to safe defaults.
 */
async function doFetchHNQuery(query: string): Promise<HNStory[]> {
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const url =
    `${HN_SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}` +
    `&tags=story&numericFilters=created_at_i>${weekAgo}&hitsPerPage=25`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw statusError('hackernews', res.status);
  const env = (await res.json()) as HNSearchEnvelope;
  const hits = Array.isArray(env.hits) ? env.hits : [];
  return hits
    .filter((h) => typeof h.objectID === 'string' && typeof h.created_at_i === 'number')
    .map((h) => ({
      objectID: h.objectID,
      title: typeof h.title === 'string' ? h.title : '',
      url: typeof h.url === 'string' ? h.url : null,
      story_text: typeof h.story_text === 'string' ? h.story_text : null,
      points: typeof h.points === 'number' ? h.points : 0,
      num_comments: typeof h.num_comments === 'number' ? h.num_comments : 0,
      author: typeof h.author === 'string' ? h.author : '[unknown]',
      created_at_i: h.created_at_i as number,
      permalink: `https://news.ycombinator.com/item?id=${h.objectID}`,
    }));
}

async function doFetchHN(ticker: string, companyName?: string | null): Promise<HNStory[]> {
  // Algolia free-text search treats spaces as AND, so the ticker and the
  // company-name queries must run as separate calls and merge by objectID.
  // Company-name query targets stock-specific noise filtering ("Apple stock")
  // to keep generic product chatter ("new Apple Watch") out of the bag.
  const name = companyName ? companyName.trim() : '';
  if (!name) return doFetchHNQuery(ticker.toUpperCase());
  // Both queries run in parallel — the name query soft-fails to [] so a slow
  // or failing second call never blocks the ticker result.
  const [tickerHits, nameHits] = await Promise.all([
    doFetchHNQuery(ticker.toUpperCase()),
    doFetchHNQuery(`${name} stock`).catch(() => [] as HNStory[]),
  ]);
  const seen = new Set<string>();
  const merged: HNStory[] = [];
  for (const h of [...tickerHits, ...nameHits]) {
    if (seen.has(h.objectID)) continue;
    seen.add(h.objectID);
    merged.push(h);
  }
  return merged;
}

/**
 * Fetch up to 25 HN stories matching `ticker` from the last 7 days.
 *
 * Returns [] (graceful degrade — never throws) on:
 *   - HTTP 4xx (incl. 429 — no retry per D-25)
 *   - Persistent 5xx / network failure after 3-attempt retry budget
 *   - Malformed JSON / unexpected envelope
 *   - Any throw from cache layer (belt-and-suspenders)
 *
 * Cached 10min via `comm:TICKER:hackernews` namespace per TTL_SECONDS.community.
 */
export async function fetchHackerNewsStories(
  ticker: string,
  opts: { companyName?: string | null } = {},
): Promise<HNStory[]> {
  // Cache key includes a stable company-name slug so the ticker-only result
  // (cron) and the ticker+name result (on-demand report) don't collide.
  const nameSlug = opts.companyName
    ? opts.companyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
    : '';
  const cacheKey = nameSlug
    ? `${CACHE_KEYS.community(ticker)}:hackernews:${nameSlug}`
    : `${CACHE_KEYS.community(ticker)}:hackernews`;
  try {
    return await cached(
      cacheKey,
      async () => {
        try {
          return await withTelemetry(
            'hackernews',
            () =>
              withBreaker('hackernews', () =>
                withRetry(() => doFetchHN(ticker, opts.companyName), {
                  maxAttempts: 3,
                  baseDelayMs: 100,
                }),
              ),
            { ticker },
          );
        } catch (err) {
          console.warn(
            `[hackernews] ${ticker} failed:`,
            err instanceof Error ? err.message : String(err),
          );
          return [];
        }
      },
      { ttlSeconds: TTL_SECONDS.community },
    );
  } catch (err) {
    // Belt-and-suspenders — adapter MUST never throw per T-19-C-05-01.
    console.warn(
      `[hackernews] ${ticker} cache-layer failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
