/**
 * Phase 21 — Sector-Relative Outcome Labels backfill cron.
 *
 * One-shot idempotent walker. Visits every PriceOutcome row where
 * sector_etf IS NULL, resolves the ticker's sector at prediction time
 * (Report.analyzed_at or SentimentSnapshot.scanned_at), computes the
 * sector-ETF forward return over the same window, and writes the three
 * new columns (sector_etf, forward_return_raw, forward_return_sector_rel).
 *
 * Idempotency: the WHERE clause filters on sector_etf IS NULL. Once a row
 * is labeled it is permanently skipped. The cron stays scheduled in
 * vercel.json as a self-healing safety net even after the initial
 * backfill clears — it does ~0 work per invocation thereafter.
 *
 * Fallback: rows whose sector ETF prices cannot be retrieved over the
 * window still get labeled — with sector_etf='SPY' and the SPY return
 * computed against forward_return_raw — so the engine never has a
 * permanently un-graded outcome. The fallback_to_spy counter surfaces
 * how often this fires.
 *
 * Auth: Bearer CRON_SECRET, same pattern as /api/cron/learn.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSectorETF } from '@/lib/data/sector-mapping';
import { fetchSectorETFReturn } from '@/lib/data/sector-prices';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const counters = {
    scanned: 0,
    labeled: 0,
    skipped: 0,
    fallback_to_spy: 0,
    skipped_future_dated: 0,
  };

  // Pull only rows that still need labeling (idempotency).
  const rows = await prisma.priceOutcome.findMany({
    where: { sector_etf: null },
    include: { report: true, snapshot: true },
    orderBy: { recorded_at: 'asc' },
    take: 5_000, // Bounded per invocation; cron re-fires daily to drain backlog.
  });

  for (const row of rows) {
    counters.scanned++;

    // T-21-2-04-07 guard — refuse to label rows whose recorded_at is in the
    // future. Catches clock-skew, test-seeded rows, and any accidental
    // as-of-future-time leakage where fetchSectorETFReturn could pull a
    // "today" price into a label marked for a future window. Bounded
    // counter so the operator can see how often this fires (should be 0 in
    // production; > 0 indicates upstream bug).
    if (row.recorded_at.getTime() > Date.now()) {
      counters.skipped_future_dated++;
      continue;
    }

    // Resolve ticker + window from whichever parent exists.
    const ticker = row.report?.ticker ?? row.snapshot?.ticker;
    const fromDate = row.report?.analyzed_at ?? row.snapshot?.scanned_at;
    const toDate = row.recorded_at;
    if (!ticker || !fromDate) {
      counters.skipped++;
      continue;
    }

    // Snapshot sector at prediction time. asOfDate triggers the
    // SECTOR_RECONSTITUTIONS override table inside getSectorETF for the
    // 2018-09-28 GICS Telecom→Comm-Services event (META/GOOGL/etc.).
    const sectorEtf = await getSectorETF({ ticker, asOfDate: fromDate });

    const sectorReturnPct = await fetchSectorETFReturn(sectorEtf, fromDate, toDate);

    // pct_change in PriceOutcome is the absolute forward return computed by
    // price-followup ((price - price_at_scan) / price_at_scan * 100), NOT
    // SPY-relative. So forward_return_raw == pct_change for legacy rows;
    // 21-2-05 writes pct_change + forward_return_raw equal-by-construction
    // on the forward path.
    const forwardReturnRaw = row.pct_change;

    let finalSectorEtf = sectorEtf;
    let forwardReturnSectorRel: number;
    if (sectorReturnPct == null) {
      // Sector price fetch failed (e.g., XLRE/XLC pre-launch date, or
      // yf.chart hiccup). Fall back to SPY: forward_return_sector_rel
      // becomes ticker_return - spy_return.
      const spyReturn = await fetchSectorETFReturn('SPY', fromDate, toDate);
      if (spyReturn == null) {
        // Both sector AND SPY unavailable → skip; cron will retry tomorrow.
        counters.skipped++;
        continue;
      }
      finalSectorEtf = 'SPY';
      forwardReturnSectorRel = forwardReturnRaw - spyReturn;
      counters.fallback_to_spy++;
    } else {
      forwardReturnSectorRel = forwardReturnRaw - sectorReturnPct;
    }

    await prisma.priceOutcome.update({
      where: { id: row.id },
      data: {
        sector_etf: finalSectorEtf,
        forward_return_raw: forwardReturnRaw,
        forward_return_sector_rel: forwardReturnSectorRel,
      },
    });
    counters.labeled++;
  }

  return NextResponse.json({ ok: true, ...counters });
}
