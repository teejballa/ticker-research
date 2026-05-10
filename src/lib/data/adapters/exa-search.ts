/**
 * Plan 19-B-05 — Exa 2.0 adapter (D-28).
 *
 * Semantic news + analyst search via the official `exa-js` v2.12.1 SDK.
 * Replaces the ~$200/mo Anthropic-search hot path with a ~$5/mo Exa neural
 * search call. Per D-32 + RESEARCH Pitfall 7, anthropic-search.ts STAYS in
 * tree as a fallback for niche tickers — the merge-ladder cutover wired by
 * Plan 19-B-06 falls back to anthropic-search whenever this adapter
 * returns null.
 *
 * Returns NewsSection / AnalystSentimentSection (the canonical shapes from
 * src/lib/types.ts that fetchNews / fetchAnalystSentiment in
 * src/lib/data/anthropic-search.ts already return) so callers swap
 * transparently. Per the Wave-B contract, every non-recoverable failure
 * surfaces as null, never a throw:
 *
 *   - missing EXA_API_KEY        (graceful degrade per D-32 / fail-closed)
 *   - 4xx response (incl. 401)   (per D-25, NOT retried)
 *   - network or 5xx exhausted   (withRetry exhausts to null)
 *
 * Threat model:
 *   - T-19-B-05-01 (key in logs): API key handed to the Exa SDK constructor
 *     once; the SDK attaches it as an Authorization header internally. This
 *     wrapper never interpolates the key into any log line, error message,
 *     or cache key. The unit test (`API key NEVER appears in any logged
 *     string`) asserts the contract by stubbing console.{warn,log,error}
 *     and grepping for the sentinel.
 *   - T-19-B-05-02 (Exa weaker on niche tickers): mitigated downstream —
 *     19-B-06 wires `fetchExaNews(ticker) ?? fetchNews(ticker)` so the
 *     anthropic-search fallback fires whenever this returns null.
 *
 * SDK note (deviation from PLAN.md):
 *   The plan calls `client.searchAndContents(...)` but exa-js v2.12.1 marks
 *   that method `@deprecated` — the canonical replacement is `client.search()`,
 *   which now returns text contents by default. Same response shape; same
 *   options (numResults, useAutoprompt, type, startPublishedDate). The
 *   migration is one-line per the SDK's deprecation guidance:
 *     `searchAndContents(q, opts)` → `search(q, opts)`.
 */

import { Exa } from 'exa-js';
import { cached } from '@/lib/data/cache/upstash';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';
import { withRetry } from '@/lib/data/retry';
// Reuse canonical types so callers can swap with anthropic-search.ts output.
import type {
  NewsSection,
  AnalystSentimentSection,
  NewsItem,
  AnalystChange,
  SecFilingSummarySection,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Lazy SDK client — env read deferred to first call so tests can mutate
// process.env between cases. __resetExaClientForTests drops the cached
// instance so the next call rebuilds against the current env.
// ---------------------------------------------------------------------------

let exaClient: Exa | null = null;

function getClient(): Exa | null {
  if (exaClient) return exaClient;
  const key = process.env.EXA_API_KEY;
  if (!key || key.length === 0) return null;
  try {
    // SDK reads the key once on construction and attaches it as the
    // Authorization header internally — wrapper never sees it again.
    exaClient = new Exa(key);
  } catch {
    // Defensive: if the SDK ever changes to validate the key shape at
    // construction, fail closed rather than throwing to the caller.
    exaClient = null;
  }
  return exaClient;
}

/**
 * @internal — test-only hook. Drops the cached Exa client so the next
 * call rebuilds against the current process.env. Used by the unit tests
 * to exercise the missing-key + sentinel-key branches deterministically.
 */
export function __resetExaClientForTests(): void {
  exaClient = null;
}

// ---------------------------------------------------------------------------
// Custom retry classifier — accepts both withRetry's default e.status shape
// AND ExaError's e.statusCode shape. Network errors (cause.code) handled by
// the default classifier are mirrored here so behavior is identical.
//
// Rationale: ExaError extends Error with a `statusCode: number` field
// (per node_modules/exa-js/dist/index.d.ts:3230). The default isRetryableError
// in src/lib/data/retry.ts probes `e.status` only, so ExaError-503 would
// fall through as "non-retryable" without this shim.
// ---------------------------------------------------------------------------

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
]);

function isExaRetryable(err: unknown): boolean {
  if (err == null) return false;
  const e = err as {
    status?: number;
    statusCode?: number;
    code?: string;
    cause?: { code?: string };
  };

  // Network sentinel — direct or undici-style nested.
  const code = e.code ?? e.cause?.code;
  if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true;

  // 5xx via either field.
  const httpStatus =
    typeof e.status === 'number'
      ? e.status
      : typeof e.statusCode === 'number'
        ? e.statusCode
        : undefined;
  if (httpStatus !== undefined && httpStatus >= 500 && httpStatus < 600) {
    return true;
  }

  // 4xx (incl. 401 / 403 / 404 / 408 / 429) explicitly not retried per D-25.
  return false;
}

// ---------------------------------------------------------------------------
// SDK response → NewsSection / AnalystSentimentSection mappers
// ---------------------------------------------------------------------------

interface ExaResultLike {
  id?: string;
  title?: string | null;
  url?: string;
  publishedDate?: string;
  text?: string | null;
  author?: string;
  score?: number;
}

interface ExaSearchResponseLike {
  results?: ExaResultLike[];
}

/**
 * Parse a host name out of a URL for the NewsItem.source field. Falls back
 * to the raw URL on parse failure so source is never empty when the SDK
 * returned a result.
 */
function hostnameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Truncate to a YYYY-MM-DD prefix (matches the published_date convention used
 * by anthropic-search.ts NewsItem.published_date). Returns '' when undefined
 * so the field is always present per the NewsItem contract.
 */
function isoDateOnly(d: string | undefined): string {
  if (!d) return '';
  // Exa returns full ISO timestamps; slice to date-only.
  const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function mapNewsResults(
  resp: ExaSearchResponseLike | null | undefined,
): NewsItem[] {
  const results = resp?.results ?? [];
  return results
    .filter((r) => typeof r.url === 'string' && r.url.length > 0)
    .map<NewsItem>((r) => ({
      headline: (r.title ?? '').toString(),
      url: r.url as string,
      published_date: isoDateOnly(r.publishedDate),
      source: hostnameOf(r.url),
    }));
}

function mapAnalystResults(
  resp: ExaSearchResponseLike | null | undefined,
): AnalystChange[] {
  const results = resp?.results ?? [];
  return results
    .filter((r) => typeof r.url === 'string' && r.url.length > 0)
    .map<AnalystChange>((r) => ({
      // Exa neural search surfaces analyst-style content but does not parse
      // out structured analyst/firm/action fields — those would require an
      // LLM extraction pass (which is intentionally NOT in this adapter's
      // scope per the plan's RESEARCH note: "primitive only — wired into
      // hot path by 19-B-06"). We surface the host as the firm and the
      // title as the action so the merge-ladder consumer has populated
      // shape-compatible rows; downstream reasoning passes can re-extract.
      analyst: 'Exa',
      firm: hostnameOf(r.url),
      action: (r.title ?? '').toString(),
      date: isoDateOnly(r.publishedDate),
    }));
}

// ---------------------------------------------------------------------------
// SDK-call fetchers (uncached, unretried — wrapped below)
// ---------------------------------------------------------------------------

const NEWS_LOOKBACK_MS = 30 * 86_400_000; // 30 days, matches anthropic-search.ts prompt

async function doFetchExaNews(ticker: string): Promise<NewsSection | null> {
  const client = getClient();
  if (!client) return null;
  const sinceIso = new Date(Date.now() - NEWS_LOOKBACK_MS).toISOString();
  // Canonical news pattern per docs.exa.ai/reference/search-api-guide-for-coding-agents:
  //   type=auto, category="news", contents.highlights=true. useAutoprompt is
  //   deprecated; type='neural' is replaced by 'auto'. Highlights keep token
  //   usage predictable for the downstream Gemini prompt.
  const resp = (await client.search(`${ticker} stock news earnings analyst`, {
    type: 'auto',
    numResults: 10,
    category: 'news',
    startPublishedDate: sinceIso,
    contents: { highlights: true },
  })) as ExaSearchResponseLike;

  return {
    collected_at: new Date().toISOString(),
    items: mapNewsResults(resp),
  };
}

async function doFetchExaAnalyst(
  ticker: string,
): Promise<AnalystSentimentSection | null> {
  const client = getClient();
  if (!client) return null;
  const resp = (await client.search(
    `${ticker} analyst recommendation price target rating`,
    {
      type: 'auto',
      numResults: 10,
      contents: { highlights: true },
    },
  )) as ExaSearchResponseLike;

  return {
    collected_at: new Date().toISOString(),
    consensus: null,
    avg_price_target: null,
    analyst_count: null,
    recent_changes: mapAnalystResults(resp),
  };
}

// ---------------------------------------------------------------------------
// Public exported API — cached + retry-wrapped, never throws
// ---------------------------------------------------------------------------

/**
 * Fetch the latest Exa neural-search news for `ticker`. Cached 30min, retried
 * 3x on 5xx + network errors. Returns null on auth failure, 4xx, retry
 * exhaustion, or missing API key — callers in 19-B-06 fall back to
 * anthropic-search.fetchNews(ticker) per RESEARCH Pitfall 7.
 */
export async function fetchExaNews(ticker: string): Promise<NewsSection | null> {
  try {
    return await cached<NewsSection | null>(
      `${CACHE_KEYS.news(ticker)}:exa`,
      () =>
        withRetry(() => doFetchExaNews(ticker), {
          maxAttempts: 3,
          baseDelayMs: 100,
          isRetryable: isExaRetryable,
        }),
      { ttlSeconds: TTL_SECONDS.news },
    );
  } catch (err) {
    // SECURITY: the SDK-thrown ExaError surfaces the upstream message and
    // statusCode only — no API key. Stringify to .message to keep stack out.
    console.warn(
      `[exa] news(${ticker}) failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Post-Phase-19 P0 — `category: 'financial report'` SEC filing fallback
// ---------------------------------------------------------------------------

const FILINGS_LOOKBACK_MS = 365 * 86_400_000; // 12 months

async function doFetchExaFinancialReports(
  ticker: string,
): Promise<SecFilingSummarySection | null> {
  const client = getClient();
  if (!client) return null;
  const sinceIso = new Date(Date.now() - FILINGS_LOOKBACK_MS).toISOString();
  const resp = (await client.search(`${ticker} 10-K 10-Q SEC filing`, {
    type: 'auto',
    numResults: 8,
    category: 'financial report',
    startPublishedDate: sinceIso,
    contents: { highlights: true },
  })) as ExaSearchResponseLike;

  // Pick the freshest 10-K and 10-Q hits we can identify by filename / title.
  // Highlights are short paragraph excerpts the SDK returns when contents.highlights=true;
  // we surface them as the summary string. Returns null if neither form is found —
  // caller falls back to anthropic-search.fetchSecFilingSummary.
  const items = resp?.results ?? [];
  if (items.length === 0) return null;

  function summary(item: ExaResultLike): string {
    const title = (item.title ?? '').toString();
    const text = (item.text ?? '').toString();
    return text.length > 0 ? text : title;
  }

  const tenK = items.find((i) => /10-?k/i.test(`${i.title ?? ''} ${i.url ?? ''}`));
  const tenQ = items.find((i) => /10-?q/i.test(`${i.title ?? ''} ${i.url ?? ''}`));
  if (!tenK && !tenQ) return null;

  return {
    collected_at: new Date().toISOString(),
    most_recent_10k: tenK ? summary(tenK) : null,
    most_recent_10q: tenQ ? summary(tenQ) : null,
    filing_dates: {
      '10k': tenK ? isoDateOnly(tenK.publishedDate) || null : null,
      '10q': tenQ ? isoDateOnly(tenQ.publishedDate) || null : null,
    },
  };
}

/**
 * Fetch SEC filings (10-K + 10-Q) via Exa's `category: 'financial report'`
 * neural search. Returns SecFilingSummarySection-shaped output so callers can
 * swap with anthropic-search.fetchSecFilingSummary transparently.
 *
 * Same null-on-error semantics + cached/withRetry envelope as fetchExaNews.
 * Returns null on missing key, 4xx, retry-exhausted 5xx/network, or when
 * neither a 10-K nor a 10-Q can be identified in the result set — callers
 * should fall back to anthropic-search.fetchSecFilingSummary.
 */
export async function fetchExaFinancialReports(
  ticker: string,
): Promise<SecFilingSummarySection | null> {
  try {
    return await cached<SecFilingSummarySection | null>(
      `${CACHE_KEYS.news(ticker)}:exa-fin`,
      () =>
        withRetry(() => doFetchExaFinancialReports(ticker), {
          maxAttempts: 3,
          baseDelayMs: 100,
          isRetryable: isExaRetryable,
        }),
      // SEC filings are slow-moving — cache for the same 24h as fundamentals
      // rather than 30min news. The form-discovery cost is a full Exa call.
      { ttlSeconds: 86_400 },
    );
  } catch (err) {
    console.warn(
      `[exa] financial-report(${ticker}) failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Fetch Exa neural-search analyst commentary for `ticker`. Same caching +
 * retry envelope and same null-on-error semantics as fetchExaNews.
 */
export async function fetchExaAnalystSentiment(
  ticker: string,
): Promise<AnalystSentimentSection | null> {
  try {
    return await cached<AnalystSentimentSection | null>(
      `${CACHE_KEYS.news(ticker)}:exa-analyst`,
      () =>
        withRetry(() => doFetchExaAnalyst(ticker), {
          maxAttempts: 3,
          baseDelayMs: 100,
          isRetryable: isExaRetryable,
        }),
      { ttlSeconds: TTL_SECONDS.news },
    );
  } catch (err) {
    console.warn(
      `[exa] analyst(${ticker}) failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
