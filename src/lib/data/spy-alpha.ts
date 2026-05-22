/**
 * Phase 21 — Sector-Relative Outcome Labels (Plan 21-4-07, BLOCKER-3)
 *
 * SPY-alpha is the LEGACY "vs market" benchmark. Phase 21 makes sector-relative
 * the headline judge, but keeps SPY-alpha visible as a smaller diagnostic so the
 * two framings co-exist during the migration window.
 *
 * CRITICAL (BLOCKER-3): SPY-alpha is DERIVED ON THE FLY here — it is NEVER read
 * from a stored column. `PriceOutcome.pct_change` / `forward_return_raw` are
 * ABSOLUTE ticker returns; we subtract the contemporaneous SPY return over the
 * SAME window to get the alpha, mirroring the `(ticker - spy)` fallback path in
 * `classifyHit` (src/lib/learning.ts) and the SPY fetch in
 * /api/cron/price-followup. There is intentionally no SPY-relative DB column.
 */

import { prisma } from '@/lib/db';
import { fetchSectorETFReturn } from '@/lib/data/sector-prices';

/**
 * Percent return (e.g. 2.5 for +2.5%) of SPY between `fromDate` and `toDate`.
 * Thin wrapper over fetchSectorETFReturn('SPY', …) — 'SPY' is a valid SectorETF,
 * so this rides the exact same cached chart path the sector-relative judge uses.
 * Returns null when SPY closes on either side of the window cannot be retrieved.
 */
export async function getSpyReturnPct(fromDate: Date, toDate: Date): Promise<number | null> {
  return fetchSectorETFReturn('SPY', fromDate, toDate);
}

/**
 * SPY-alpha hit rate for `ticker`: the fraction of recent resolved PriceOutcome
 * rows whose absolute return beat the contemporaneous SPY return by > +1pp over
 * the SAME forward window. Returns a number in [0, 1], or null when there are no
 * resolvable rows (cold start, or SPY prices unavailable for every window).
 *
 * Window reconstruction per row: a PriceOutcome's `recorded_at` is the END of
 * the forward window and `days_after` is its length, so the window opened at
 * `recorded_at - days_after`. We fetch SPY's return over that window and compare
 * to the row's absolute `forward_return_raw` (falling back to the back-compat
 * `pct_change` column when the Phase-21 raw column is null on legacy rows).
 *
 * This is the read-time derivation mandated by BLOCKER-3 — no stored SPY column.
 */
export async function computeSpyAlphaHitRate(
  ticker: string,
  opts: { sampleSize?: number; thresholdPct?: number } = {},
): Promise<number | null> {
  const { sampleSize = 50, thresholdPct = 1 } = opts;
  const upper = ticker.toUpperCase();

  const rows = await prisma.priceOutcome.findMany({
    where: { report: { ticker: upper } },
    orderBy: { recorded_at: 'desc' },
    take: sampleSize,
    select: {
      recorded_at: true,
      days_after: true,
      pct_change: true,
      forward_return_raw: true,
    },
  });
  if (rows.length === 0) return null;

  let resolved = 0;
  let hits = 0;
  for (const row of rows) {
    const absoluteReturn = row.forward_return_raw ?? row.pct_change;
    if (absoluteReturn == null || !Number.isFinite(absoluteReturn)) continue;
    if (!row.days_after || row.days_after <= 0) continue;

    const toDate = row.recorded_at;
    const fromDate = new Date(toDate.getTime() - row.days_after * 86_400_000);
    const spyReturn = await getSpyReturnPct(fromDate, toDate);
    if (spyReturn == null || !Number.isFinite(spyReturn)) continue;

    resolved += 1;
    if (absoluteReturn - spyReturn > thresholdPct) hits += 1;
  }

  if (resolved === 0) return null;
  return hits / resolved;
}
