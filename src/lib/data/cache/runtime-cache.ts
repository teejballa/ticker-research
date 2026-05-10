// Plan 19-B-07 (D-30) — Vercel Runtime Cache wrapper for SourcePackage.
//
// PASSTHROUGH for Next 15.5 stable: the `'use cache'` directive + cacheLife
// API require `experimental.cacheComponents` which is canary-only on Next 15.
// On stable the build rejects the experimental flag, so this wrapper is a
// thin passthrough for now. The 19-B-01 Upstash `cached()` helper handles
// per-call source-package idempotency at the application layer instead.
//
// When 19-B-08 brings the Next 16 upgrade, restore the directive + cacheLife
// call (kept in git history at commit bc96bd3) and re-enable
// experimental.cacheComponents in next.config.ts.

import { collectAllData } from '@/lib/data/source-package';
import type { SourcePackage, SecurityType } from '@/lib/types';

/**
 * SourcePackage wrapper. Returns the merged SourcePackage for a ticker.
 *
 * @param ticker         Uppercase ticker symbol.
 * @param companyName    Optional human-readable company name (defaults to ticker).
 * @param exchange       Optional exchange display name.
 * @param securityType   Detected security type (defaults to 'equity').
 */
export async function getCachedSourcePackage(
  ticker: string,
  companyName: string = ticker,
  exchange: string | null = null,
  securityType: SecurityType = 'equity',
): Promise<SourcePackage> {
  return collectAllData(ticker, companyName, exchange, securityType);
}
