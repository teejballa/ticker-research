/**
 * Post-Phase-19 P0 — Polygon news as 3rd-tier news fallback.
 *
 * Slots into the new ladder as: exa → anthropic-search → polygon-news.
 * Long-tail insurance for small-cap tickers Exa neural-search and Anthropic
 * search both miss. Free on Polygon's $29/mo tier (already provisioned for
 * the existing fundamentals fallback).
 *
 * Returns NewsSection | null with the same swap-compatible shape as
 * fetchExaNews / fetchNews (anthropic-search). Returns null on missing key,
 * 4xx (no retry per D-25), retry-exhausted 5xx, or empty envelope.
 *
 * Wrapped in cached() (30min) + withRetry() per the same pattern as Wave-B
 * adapters.
 */

import { cached } from '@/lib/data/cache/upstash';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
import { withRetry } from '@/lib/data/retry';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import type { NewsSection, NewsItem } from '@/lib/types';

const POLYGON_BASE = 'https://api.polygon.io';

interface PolygonArticle {
  id?: string;
  publisher?: { name?: string };
  title?: string;
  article_url?: string;
  tickers?: string[];
  published_utc?: string;
  description?: string;
}

interface PolygonNewsEnvelope {
  results?: PolygonArticle[];
  status?: string;
}

function statusError(status: number): Error & { status: number } {
  const err = new Error(`polygon news ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

function isoDateOnly(d: string | undefined): string {
  if (!d) return '';
  const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : '';
}

async function doFetchPolygonNews(ticker: string): Promise<NewsSection | null> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null;

  const url = `${POLYGON_BASE}/v2/reference/news?ticker=${encodeURIComponent(ticker.toUpperCase())}&limit=10&apiKey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw statusError(res.status);
  }

  const env = (await res.json()) as PolygonNewsEnvelope;
  const results = Array.isArray(env.results) ? env.results : [];
  if (results.length === 0) return null;

  const items: NewsItem[] = results
    .filter((a): a is PolygonArticle & { article_url: string; title: string } =>
      typeof a.article_url === 'string' && a.article_url.length > 0 && typeof a.title === 'string',
    )
    .map((a) => ({
      headline: a.title,
      url: a.article_url,
      published_date: isoDateOnly(a.published_utc),
      source: a.publisher?.name ?? '',
    }));

  if (items.length === 0) return null;

  return {
    collected_at: new Date().toISOString(),
    items,
  };
}

/**
 * Fetch news articles for `ticker` from Polygon's `/v2/reference/news`.
 *
 * Returns null on:
 *   - Missing POLYGON_API_KEY (graceful degrade)
 *   - HTTP 4xx (no retry per D-25)
 *   - Persistent 5xx / network failure after withRetry exhausts attempts
 *   - Empty results envelope
 *
 * Cached 30min via `news:TICKER:polygon` namespace per TTL_SECONDS.news.
 */
export async function fetchPolygonNews(
  ticker: string,
): Promise<NewsSection | null> {
  if (!process.env.POLYGON_API_KEY) return null;

  try {
    return await cached<NewsSection | null>(
      `${CACHE_KEYS.news(ticker)}:polygon`,
      () =>
        withTelemetry(
          'polygon',
          () =>
            withRetry(() => doFetchPolygonNews(ticker), {
              maxAttempts: 3,
              baseDelayMs: 100,
            }),
          { ticker },
        ),
      { ttlSeconds: TTL_SECONDS.news },
    );
  } catch (err) {
    console.warn(
      `[polygon-news] ${ticker} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
