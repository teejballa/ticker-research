'use cache';

// Plan 19-B-07 (D-30) — Vercel Runtime Cache wrapper for SourcePackage.
//
// 10-minute idempotency: multiple callers asking for the same ticker within
// a 10-minute window share a single cached SourcePackage. This is the
// upstream-fanout reducer for the entire Wave-B data ladder — caching the
// fully-merged SourcePackage avoids paying for the parallel yahoo / finnhub /
// polygon / tiingo / twelvedata / exa / anthropic-search / stocktwits /
// firecrawl fan-out on the second-and-subsequent calls of a hot ticker.
//
// Plumbing notes:
//
// - The `'use cache'` directive at the top is what tells the Next compiler
//   to wrap this function with cache lookup logic. In Next 15.5.x this is
//   the supported form (`useCache: true` enabled in next.config.ts). Next
//   16 introduces a `'use cache: remote'` variant which is functionally a
//   superset for our use case (forces the entry into the remote cache
//   handler — Vercel Runtime Cache in production). When we upgrade to
//   16.x via Plan 19-B-08, swap the directive string and nothing else
//   needs to change here.
//
// - `unstable_cacheLife({ revalidate: 600, expire: 600 })` is the public
//   API surface in Next 15.5 (the un-prefixed `cacheLife` ships in 16+).
//   Both fields at 600s implements the D-30 10min idempotency: after 10min
//   the entry is both stale-served-while-revalidating AND eligible for
//   eviction — matching the plan acceptance grep.
//
// - Cache key: in Next cache components the key is compiler-derived from
//   the function arguments (per Next.js docs and plan's threat model
//   T-19-B-07-01 mitigation: "compiler-derived keys prevent manual hashing
//   bugs"). We do NOT hand-roll a key — the framework handles it.
//
// - Threat T-19-B-07-02 (cross-tenant leak): the cache key includes only
//   the ticker; SourcePackage carries no per-user data; per-user filtering
//   happens AFTER SourcePackage in /api/analysis. No information disclosure
//   surface.
//
// - The wrapper is a thin delegate to `collectAllData` (the post-19-B-06
//   shadow-gated entry point). This is intentional: the cache layer is
//   composed OUTSIDE the shadow harness so that BOTH the old and new
//   ladders benefit from cache hits during the shadow window.

import { unstable_cacheLife as cacheLife } from 'next/cache';
import { collectAllData } from '@/lib/data/source-package';
import type { SourcePackage, SecurityType } from '@/lib/types';

/**
 * Vercel Runtime Cache wrapper around `collectAllData`.
 *
 * @param ticker         Uppercase ticker symbol (cache key component).
 * @param companyName    Optional human-readable company name (defaults to ticker).
 * @param exchange       Optional exchange display name.
 * @param securityType   Detected security type (defaults to 'equity').
 *
 * Idempotency: 10 minutes per (ticker, companyName, exchange, securityType).
 *
 * In production (Vercel deployment), this is backed by the Vercel Runtime
 * Cache. In dev / local, it falls back to Next's in-memory default cache
 * handler. Both honor cacheLife.
 */
export async function getCachedSourcePackage(
  ticker: string,
  companyName: string = ticker,
  exchange: string | null = null,
  securityType: SecurityType = 'equity',
): Promise<SourcePackage> {
  cacheLife({ revalidate: 600, expire: 600 }); // D-30 10min idempotency
  return collectAllData(ticker, companyName, exchange, securityType);
}
