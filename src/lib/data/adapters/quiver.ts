/**
 * Plan 19-C-06 — Quiver adapter (D-38).
 *
 * Hobbyist tier (~$30/mo) — insider trades + congressional trades. Per D-38
 * this adapter is OPT-IN: it only activates when `QUIVER_API_KEY` is set.
 * Both fetchers return null silently when the env is missing — no fetch is
 * issued, no warning is logged. This is the configuration mitigation
 * (T-19-C-06-02): the adapter cannot accidentally fire during local dev or
 * preview deploys where the key is absent.
 *
 * Returns canonical JSON shapes (QuiverInsiderData / QuiverCongressionalData)
 * suitable for storage in `SentimentSnapshot.community_aggregated` (the
 * additive JSONB column added in 19-Z-02). The adapter is a sibling of the
 * Wave B adapters (Tiingo, Twelve Data) and reuses the same cached() +
 * withRetry() helpers.
 *
 * Endpoints (per https://api.quiverquant.com/docs/):
 *   - Insider:        /beta/historical/insiders/{ticker}
 *   - Congressional:  /beta/historical/congresstrading/{ticker}
 *
 * Auth: `Authorization: Bearer ${QUIVER_API_KEY}` header — never URL-
 * interpolated (T-19-C-06-01 mitigation: key never logged).
 *
 * Cache TTL: 24h. Both insider filings and congressional disclosures are
 * slow-moving — a single day's freshness is more than fine for the diffusion
 * engine's signal aggregation.
 */

import { cached } from '@/lib/data/cache/upstash';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
import { withRetry } from '@/lib/data/retry';

const QUIVER_BASE = 'https://api.quiverquant.com';

function getApiKey(): string | null {
  const k = process.env.QUIVER_API_KEY;
  return k && k.length > 0 ? k : null;
}

// ---------------------------------------------------------------------------
// Public canonical shapes — narrow projections of the upstream Quiver
// payloads. We deliberately do NOT pass raw upstream rows through; this keeps
// our DB column shape stable across upstream API drift.
// ---------------------------------------------------------------------------

export interface QuiverInsiderTrade {
  date: string;
  name: string;
  shares: number | null;
  price_per_share: number | null;
  shares_owned_following: number | null;
  /** 'A' = acquired, 'D' = disposed */
  acquired_disposed_code: string | null;
}

export interface QuiverInsiderData {
  source: 'quiver';
  ticker: string;
  collected_at: string;
  trades: QuiverInsiderTrade[];
}

export interface QuiverCongressionalTrade {
  report_date: string;
  transaction_date: string | null;
  representative: string;
  transaction: string;
  range: string | null;
  house: string | null;
  party: string | null;
}

export interface QuiverCongressionalData {
  source: 'quiver';
  ticker: string;
  collected_at: string;
  trades: QuiverCongressionalTrade[];
}

// ---------------------------------------------------------------------------
// Upstream wire shapes — only the fields we actually project.
// ---------------------------------------------------------------------------

interface QuiverInsiderRow {
  Date?: string;
  Ticker?: string;
  Name?: string;
  Shares?: number | null;
  PricePerShare?: number | null;
  SharesOwnedFollowing?: number | null;
  AcquiredDisposedCode?: string | null;
}

interface QuiverCongressionalRow {
  ReportDate?: string;
  TransactionDate?: string | null;
  Ticker?: string;
  Representative?: string;
  Transaction?: string;
  Range?: string | null;
  House?: string | null;
  Party?: string | null;
}

/**
 * Throws an `Error` whose `status` property is set so isRetryableError() in
 * src/lib/data/retry.ts can classify it. Importantly, the message contains
 * only the HTTP status — never the API key or Authorization header.
 */
function statusError(prefix: string, status: number): Error & { status: number } {
  const err = new Error(`${prefix} ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

async function doFetchInsider(ticker: string): Promise<QuiverInsiderData | null> {
  const key = getApiKey();
  if (!key) return null;

  const url = `${QUIVER_BASE}/beta/historical/insiders/${encodeURIComponent(ticker)}`;
  // SECURITY: key carried only in the Authorization header — never in the URL,
  // never in error messages. Quiver expects "Bearer <token>" per their docs.
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw statusError('quiver insider', res.status);
  }

  const json = (await res.json()) as QuiverInsiderRow[] | QuiverInsiderRow;
  const rows: QuiverInsiderRow[] = Array.isArray(json) ? json : json ? [json] : [];

  const trades: QuiverInsiderTrade[] = rows.map((r) => ({
    date: r.Date ?? '',
    name: r.Name ?? '',
    shares: r.Shares ?? null,
    price_per_share: r.PricePerShare ?? null,
    shares_owned_following: r.SharesOwnedFollowing ?? null,
    acquired_disposed_code: r.AcquiredDisposedCode ?? null,
  }));

  return {
    source: 'quiver',
    ticker: ticker.toUpperCase(),
    collected_at: new Date().toISOString(),
    trades,
  };
}

async function doFetchCongressional(
  ticker: string,
): Promise<QuiverCongressionalData | null> {
  const key = getApiKey();
  if (!key) return null;

  const url = `${QUIVER_BASE}/beta/historical/congresstrading/${encodeURIComponent(ticker)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw statusError('quiver congressional', res.status);
  }

  const json = (await res.json()) as
    | QuiverCongressionalRow[]
    | QuiverCongressionalRow;
  const rows: QuiverCongressionalRow[] = Array.isArray(json)
    ? json
    : json
    ? [json]
    : [];

  const trades: QuiverCongressionalTrade[] = rows.map((r) => ({
    report_date: r.ReportDate ?? '',
    transaction_date: r.TransactionDate ?? null,
    representative: r.Representative ?? '',
    transaction: r.Transaction ?? '',
    range: r.Range ?? null,
    house: r.House ?? null,
    party: r.Party ?? null,
  }));

  return {
    source: 'quiver',
    ticker: ticker.toUpperCase(),
    collected_at: new Date().toISOString(),
    trades,
  };
}

/**
 * Fetch Quiver historical insider trades for `ticker`. Returns null when
 * QUIVER_API_KEY is unset (D-38 opt-in), on any 4xx (incl. 401/404), on
 * exhausted 5xx retries, or on network failure.
 *
 * Cache: 24h (insider filings are slow-moving). Retry: 3x on 5xx + network.
 */
export async function fetchQuiverInsider(
  ticker: string,
): Promise<QuiverInsiderData | null> {
  // Short-circuit BEFORE the cache key is computed so an unconfigured deploy
  // never even touches Redis. Belt-and-suspender for T-19-C-06-02.
  if (!getApiKey()) return null;

  try {
    return await cached(
      `${CACHE_KEYS.community(ticker)}:quiver:insider`,
      () =>
        withRetry(() => doFetchInsider(ticker), {
          maxAttempts: 3,
          baseDelayMs: 100,
        }),
      { ttlSeconds: TTL_SECONDS.fundamentals }, // 24h — slow-moving data
    );
  } catch (err) {
    // SECURITY: err.message is `quiver insider <status>` — no key. Stack
    // contains code paths only; never headers. We stringify message-only.
    console.warn(
      `[quiver] insider(${ticker}) failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Fetch Quiver historical congressional trades for `ticker`. Same null
 * semantics as fetchQuiverInsider.
 *
 * Cache: 24h (disclosures are filed weekly+). Retry: 3x on 5xx + network.
 */
export async function fetchQuiverCongressional(
  ticker: string,
): Promise<QuiverCongressionalData | null> {
  if (!getApiKey()) return null;

  try {
    return await cached(
      `${CACHE_KEYS.community(ticker)}:quiver:congressional`,
      () =>
        withRetry(() => doFetchCongressional(ticker), {
          maxAttempts: 3,
          baseDelayMs: 100,
        }),
      { ttlSeconds: TTL_SECONDS.fundamentals },
    );
  } catch (err) {
    console.warn(
      `[quiver] congressional(${ticker}) failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
