/**
 * Phase 21 — Sector-Relative Outcome Labels backfill cron.
 * Phase 21.1 — extended to write σ-aware labels via shared computeLabelsFor.
 *
 * One-shot idempotent walker. Visits every PriceOutcome row where
 * sector_etf IS NULL OR is_sigma_hit_k1 IS NULL (so reruns pick up
 * older rows that already have sector_etf but were written before Phase 21.1
 * added the sigma label columns). Resolves the ticker's sector at prediction
 * time, computes the sector-ETF forward return, then calls computeLabelsFor()
 * to write all four new columns atomically.
 *
 * Phase 21.1 D-17: ALL THREE labels (is_directional_hit, is_sigma_hit_k1,
 * is_hit_flat1) + sector_sigma_60d are written by ONE shared helper in
 * src/lib/labels/compute.ts — no parallel/forked label logic in this file.
 *
 * Idempotency: rows with both sector_etf non-null AND is_sigma_hit_k1
 * non-null are permanently skipped. The cron stays scheduled in vercel.json
 * as a self-healing safety net — it does ~0 work per invocation once
 * the backfill drains.
 *
 * Fallback: rows whose sector ETF prices cannot be retrieved still get
 * labeled with sector_etf='SPY' so the engine never has a permanently
 * un-graded outcome. The fallback_to_spy counter surfaces how often this fires.
 *
 * Auth: Bearer CRON_SECRET, same pattern as /api/cron/learn.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSectorETF } from '@/lib/data/sector-mapping';
import { fetchSectorETFReturn } from '@/lib/data/sector-prices';
import { computeLabelsFor } from '@/lib/labels/compute';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const counters = {
    scanned: 0,
    labeled: 0,
    labels_populated: 0,
    skipped: 0,
    fallback_to_spy: 0,
    skipped_future_dated: 0,
  };

  // Pull rows that still need labeling (idempotency).
  // Phase 21.1: OR clause picks up rows that already have sector_etf (from the
  // original Phase 21 backfill) but are missing the new sigma-label columns.
  const rows = await prisma.priceOutcome.findMany({
    where: {
      OR: [
        { sector_etf: null },
        { is_sigma_hit_k1: null },
      ],
    },
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

    // Phase 21.1 D-17: compute all three labels via the ONE shared helper.
    // spy_return_pct not stored on PriceOutcome rows; pass null — classifyHit
    // uses sector_relative_pct as primary path when non-null (which it is here).
    const labels = await computeLabelsFor({
      sector_etf: finalSectorEtf,
      asOf: row.recorded_at,
      ticker_return_pct: forwardReturnRaw,
      spy_return_pct: null,
      sector_relative_pct: forwardReturnSectorRel,
    });

    await prisma.priceOutcome.update({
      where: { id: row.id },
      data: {
        sector_etf: finalSectorEtf,
        forward_return_raw: forwardReturnRaw,
        forward_return_sector_rel: forwardReturnSectorRel,
        is_directional_hit: labels.is_directional_hit,
        is_sigma_hit_k1: labels.is_sigma_hit_k1,
        is_hit_flat1: labels.is_hit_flat1,
        sector_sigma_60d: labels.sector_sigma_60d,
      },
    });
    counters.labeled++;
    if (labels.is_sigma_hit_k1 !== null) counters.labels_populated++;
  }

  return NextResponse.json({ ok: true, ...counters });
}
