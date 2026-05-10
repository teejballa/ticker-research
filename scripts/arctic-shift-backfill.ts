#!/usr/bin/env tsx
/**
 * scripts/arctic-shift-backfill.ts — Plan 19-C-11 (D-43)
 *
 * One-time historical Reddit backfill via Arctic Shift (Pushshift successor).
 * Pulls 5y of chatter for the v1.0 ticker universe and writes one
 * CommunityChatter row per post (source='reddit'). NOT a recurring cron.
 *
 * Endpoint: https://arctic-shift.photon-reddit.com/api/posts/search
 * Query params: subreddit, after, before, q (search term), limit
 * Response: { data: [{ id, title, selftext, url, created_utc, permalink, author }] }
 *
 * Rate limit: Per RESEARCH Assumption A6, assumed ≥60 req/min. If slower,
 * the script gracefully extends runtime (max 8h cap not enforced — operator
 * monitors and Ctrl-C if needed; idempotency guarantees safe re-run).
 *
 * Privacy (T-19-C-11-02 / V8 ASVS): we do NOT persist `author`. The
 * CommunityChatter schema has no author/user_id column.
 *
 * Sanitization (T-19-C-11-01): raw_text is stripped of HTML tags, whitespace
 * normalized, truncated at 5000 chars before persist. Downstream consumers
 * (CoVe, FinSentLLM) treat as untrusted text.
 *
 * Idempotency: CommunityChatter has UNIQUE(ticker, source, url, scraped_at)
 * from Plan 19-Z-02. Duplicate inserts surface as Prisma P2002 and are
 * silently skipped — re-running the script is a no-op for already-ingested
 * windows.
 *
 * Usage:
 *   npm run arctic-shift-backfill -- --years 5 --tickers AAPL,GOOGL,MSFT
 *   npm run arctic-shift-backfill -- --years 5 --tickers-from .planning/v1-ticker-universe.txt
 *
 * Optional env: ARCTIC_SHIFT_KEY (forwarded as `Authorization: Bearer <key>`
 * if Arctic Shift starts requiring auth — currently optional).
 */

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

export const ARCTIC_SHIFT_BASE =
  'https://arctic-shift.photon-reddit.com/api/posts/search';
export const DEFAULT_SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'SecurityAnalysis',
  'algotrading',
];

export interface ArcticPost {
  id: string;
  title: string;
  selftext?: string;
  url: string;
  permalink: string;
  created_utc: number;
  /**
   * NOT persisted (T-19-C-11-02). Field exists on the wire response but is
   * dropped before the Prisma create call — schema has no author column.
   */
  author?: string;
}

/**
 * sanitize() — T-19-C-11-01 mitigation.
 * - Strip HTML tags (incl. <script>) so injected markup never reaches the
 *   downstream LLM verbatim
 * - Collapse whitespace to single spaces
 * - Truncate at 5000 chars
 */
export function sanitize(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // strip HTML tags
    .replace(/\s+/g, ' ') // normalize whitespace
    .trim()
    .slice(0, 5000);
}

interface WithRetryOpts {
  maxAttempts: number;
  baseDelayMs: number;
}

/**
 * Local withRetry — exponential backoff for transient failures (5xx + 429
 * + network errors). 4xx (except 429) is treated as non-transient and
 * re-thrown immediately.
 *
 * NOTE: This is intentionally inlined rather than imported from
 * `src/lib/data/retry.ts` — that module ships in Plan 19-B-02 (downstream).
 * When B-02 lands, swap the inline helper for `import { withRetry } from
 * '../src/lib/data/retry'`.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOpts,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const transient =
        status === undefined || status === 429 || (status >= 500 && status < 600);
      if (!transient || attempt === opts.maxAttempts) throw err;
      const delay = opts.baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

interface FetchOpts {
  ticker: string;
  subreddit: string;
  after: number;
  before: number;
}

async function fetchPostsForTickerSubreddit(
  opts: FetchOpts,
): Promise<ArcticPost[]> {
  const url =
    `${ARCTIC_SHIFT_BASE}?subreddit=${opts.subreddit}` +
    `&q=${encodeURIComponent(opts.ticker)}` +
    `&after=${opts.after}&before=${opts.before}&limit=100`;
  const headers: Record<string, string> = {};
  if (process.env.ARCTIC_SHIFT_KEY) {
    headers.Authorization = `Bearer ${process.env.ARCTIC_SHIFT_KEY}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = new Error(`arctic-shift ${res.status}`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as { data: ArcticPost[] };
  return json.data ?? [];
}

// Lazy Prisma — created on first call so importing the module for tests
// (which `vi.stubGlobal` fetch) doesn't open a DB connection at import time
// when DATABASE_URL is unset.
let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (_prisma) return _prisma;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set — required for backfill');
  }
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  _prisma = new PrismaClient({ adapter });
  return _prisma;
}

export interface BackfillOpts {
  /** Sleep between API requests in ms (default 1100 ≈ 55 req/min margin under the assumed 60/min limit) */
  sleepMs?: number;
  /** Retry base delay (default 500ms) */
  retryBaseDelayMs?: number;
  /** Max retry attempts per request (default 3) */
  retryMaxAttempts?: number;
  /** Subreddits to scan (default DEFAULT_SUBREDDITS) */
  subreddits?: string[];
  /** Optional injected Prisma client (used by tests to share a connection) */
  prisma?: PrismaClient;
}

/**
 * backfillTicker — pull `yearsBack` years of historical posts from Arctic
 * Shift and persist sanitized rows to CommunityChatter. Returns inserted count.
 *
 * Iterates by 30-day windows per subreddit; idempotent re-runs are no-ops.
 */
export async function backfillTicker(
  ticker: string,
  yearsBack: number,
  opts: BackfillOpts = {},
): Promise<number> {
  const sleepMs = opts.sleepMs ?? 1100;
  const retryBaseDelayMs = opts.retryBaseDelayMs ?? 500;
  const retryMaxAttempts = opts.retryMaxAttempts ?? 3;
  const subreddits = opts.subreddits ?? DEFAULT_SUBREDDITS;
  const prisma = opts.prisma ?? getPrisma();

  const now = Math.floor(Date.now() / 1000);
  const startUtc = now - Math.floor(yearsBack * 365 * 86_400);
  let inserted = 0;

  for (const subreddit of subreddits) {
    for (let after = startUtc; after < now; after += 30 * 86_400) {
      const before = Math.min(after + 30 * 86_400, now);

      let posts: ArcticPost[];
      try {
        posts = await withRetry(
          () => fetchPostsForTickerSubreddit({ ticker, subreddit, after, before }),
          { maxAttempts: retryMaxAttempts, baseDelayMs: retryBaseDelayMs },
        );
      } catch (err) {
        console.warn(
          `[backfill] ${ticker} r/${subreddit} window ${after}-${before} failed:`,
          err,
        );
        continue;
      }

      for (const post of posts) {
        const url = `https://reddit.com${post.permalink}`;
        const raw = sanitize(`${post.title}\n${post.selftext ?? ''}`);
        try {
          // Note: `author` is intentionally omitted — privacy mitigation
          // T-19-C-11-02. Schema has no author column.
          await prisma.communityChatter.create({
            data: {
              ticker,
              source: 'reddit',
              url,
              raw_text: raw,
              scraped_at: new Date(post.created_utc * 1000),
            },
          });
          inserted++;
        } catch (err) {
          const code = (err as { code?: string })?.code;
          // P2002 = Prisma unique-constraint violation. Idempotent skip.
          if (code !== 'P2002') {
            console.warn(`[backfill] insert failed:`, err);
          }
        }
      }

      if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
    }
  }

  return inserted;
}

interface CliArgs {
  tickers?: string;
  tickersFrom?: string;
  years?: number;
}

function parseCliArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tickers') out.tickers = argv[++i];
    else if (argv[i] === '--tickers-from') out.tickersFrom = argv[++i];
    else if (argv[i] === '--years') out.years = parseInt(argv[++i], 10);
  }
  return out;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const tickers = args.tickers
    ? args.tickers.split(',').map((s) => s.trim()).filter(Boolean)
    : readFileSync(args.tickersFrom ?? '.planning/v1-ticker-universe.txt', 'utf8')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => Boolean(s) && !s.startsWith('#'));
  const years = args.years ?? 5;

  console.log(
    `Backfilling ${tickers.length} tickers × ${years} years across ${DEFAULT_SUBREDDITS.join(', ')}`,
  );
  let total = 0;
  const startedAt = Date.now();
  for (const ticker of tickers) {
    const t0 = Date.now();
    const n = await backfillTicker(ticker, years);
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[${ticker}] inserted ${n} rows in ${seconds}s`);
    total += n;
  }
  const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
  console.log(`Done. Total rows inserted: ${total} (elapsed ${elapsedMin} min)`);

  if (_prisma) await _prisma.$disconnect();
}

// Only auto-run when invoked directly (not when imported by tests).
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  /arctic-shift-backfill\.ts$/.test(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
