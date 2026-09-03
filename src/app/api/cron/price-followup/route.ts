import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import YahooFinance from 'yahoo-finance2';
import { getSectorETF } from '@/lib/data/sector-mapping';
import { fetchSectorETFReturn } from '@/lib/data/sector-prices';
import { computeLabelsFor } from '@/lib/labels/compute';
import { computeMagnitudeError } from '@/lib/magnitude-calibration';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
// Phase 16: extend horizons from 3/7/14 to 3/7/14/30/60/90 to support
// multi-horizon learning (Q1/Q2 short-term + medium-term + slow-thesis windows).
const TARGET_DAYS = [3, 7, 14, 30, 60, 90] as const;

function ageInDays(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

async function fetchPrice(ticker: string): Promise<number | null> {
  try {
    const quote = await yf.quote(ticker);
    return typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : null;
  } catch { return null; }
}

/**
 * Phase 21 — Sector-Relative Outcome Labels.
 *
 * UNIT CHOICE (BLOCKER-3 lock): every percent field in this module is in
 * percentage-points (e.g. 2.34 means +2.34%). This matches the existing
 * pct_change formula `((price - price_at_X) / price_at_X) * 100`. So
 * `forward_return_raw === pct_change` for every row written here — the
 * duplicated value is intentional: pct_change stays for back-compat
 * (existing /api/insights and /api/cron/learn consumers read it),
 * forward_return_raw is the semantically-clear column name going forward.
 * SPY-alpha continues to be DERIVED at read time downstream in
 * `classifyHit` — there is NO new stored SPY-relative column.
 *
 * Fallback ladder:
 *   1. getSectorETF returns the SPDR ETF (or 'SPY' sentinel) for the ticker
 *      at prediction time, honoring the 2018-09-28 reconstitution override.
 *   2. fetchSectorETFReturn returns the ETF's pct return over the window.
 *   3. If sector return is null → fetch SPY return as a fallback.
 *   4. If BOTH null → write sector_etf='SPY' + forward_return_sector_rel=null
 *      and let the relabel cron retry on the next sweep.
 */
async function computeSectorLabels(args: {
  ticker: string;
  fromDate: Date;
  toDate: Date;
  absoluteReturnPct: number;
}): Promise<{
  sector_etf: string;
  forward_return_raw: number;
  forward_return_sector_rel: number | null;
  fallback: boolean;
}> {
  const sectorEtf = await getSectorETF({ ticker: args.ticker, asOfDate: args.fromDate });
  const sectorReturn = await fetchSectorETFReturn(sectorEtf, args.fromDate, args.toDate);
  if (sectorReturn != null) {
    return {
      sector_etf: sectorEtf,
      forward_return_raw: args.absoluteReturnPct,
      forward_return_sector_rel: args.absoluteReturnPct - sectorReturn,
      fallback: false,
    };
  }
  // Sector ETF prices unavailable — fall back to SPY.
  const spyReturn = await fetchSectorETFReturn('SPY', args.fromDate, args.toDate);
  if (spyReturn == null) {
    // Neither sector nor SPY available — write SPY sentinel + null relative.
    // /api/cron/relabel will retry on subsequent sweeps via a follow-up
    // WHERE forward_return_sector_rel IS NULL filter (v1.1 enhancement).
    return {
      sector_etf: 'SPY',
      forward_return_raw: args.absoluteReturnPct,
      forward_return_sector_rel: null,
      fallback: true,
    };
  }
  return {
    sector_etf: 'SPY',
    forward_return_raw: args.absoluteReturnPct,
    forward_return_sector_rel: args.absoluteReturnPct - spyReturn,
    fallback: true,
  };
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { outcomes_recorded: 0, skipped: 0, failed: 0, sector_fallback_to_spy: 0 };
  // Phase 16: window widened from 15d to 95d so we still see snapshots/reports
  // that are 90 days old (90d horizon + 0.6d slack + safety).
  const windowMs = 95 * 24 * 60 * 60 * 1000;
  const minAgeMs = 2 * 24 * 60 * 60 * 1000;

  const reports = await prisma.report.findMany({
    where: { price_at_report: { not: null }, analyzed_at: { gte: new Date(Date.now() - windowMs), lte: new Date(Date.now() - minAgeMs) } },
    include: { outcomes: true },
  });

  for (const report of reports) {
    const age = ageInDays(report.analyzed_at);
    for (const day of TARGET_DAYS) {
      if (Math.abs(age - day) > 0.6) continue;
      if (report.outcomes.some(o => o.days_after === day)) { results.skipped++; continue; }
      const price = await fetchPrice(report.ticker);
      if (!price || !report.price_at_report) { results.failed++; continue; }
      // percentage-points unit: 2.34 means +2.34%. pct_change and forward_return_raw share this exact value.
      const absoluteReturnPct = ((price - report.price_at_report) / report.price_at_report) * 100;
      const sectorLabels = await computeSectorLabels({
        ticker: report.ticker,
        fromDate: report.analyzed_at,
        toDate: new Date(),
        absoluteReturnPct,
      });
      if (sectorLabels.fallback) results.sector_fallback_to_spy++;
      // Phase 21.1 D-17: compute all three labels via the ONE shared helper.
      const recordedAt = new Date();
      const labels = await computeLabelsFor({
        sector_etf: sectorLabels.sector_etf,
        asOf: recordedAt,
        ticker_return_pct: absoluteReturnPct,
        spy_return_pct: null,
        sector_relative_pct: sectorLabels.forward_return_sector_rel,
      });
      // Phase 29 (D-02, D-03, DEMO-08, DEMO-09). Read report's numeric price
      // forecast from the persisted AnalysisResult JSON. Source at outcome-
      // resolution time, NOT at report time (avoids dedup-skip pitfall).
      const analysisJson = report.analysis as {
        price_target_pct?: number | null;
        price_target_horizon_days?: number | null;
      } | null;
      const expectedPct = analysisJson?.price_target_pct ?? null;
      const expectedHorizonDays = analysisJson?.price_target_horizon_days ?? null;
      const magnitudeError = computeMagnitudeError({
        forward_return_raw: sectorLabels.forward_return_raw,
        expected_pct: expectedPct,
        expected_horizon_days: expectedHorizonDays,
        days_after: day,
      });
      await prisma.priceOutcome.create({
        data: {
          report_id: report.id,
          days_after: day,
          price,
          pct_change: absoluteReturnPct,
          recorded_at: recordedAt,
          sector_etf: sectorLabels.sector_etf,
          forward_return_raw: sectorLabels.forward_return_raw,
          forward_return_sector_rel: sectorLabels.forward_return_sector_rel,
          is_directional_hit: labels.is_directional_hit,
          is_sigma_hit_k1: labels.is_sigma_hit_k1,
          is_hit_flat1: labels.is_hit_flat1,
          sector_sigma_60d: labels.sector_sigma_60d,
          // Phase 29 (D-02, D-03) — magnitude calibration additions.
          expected_pct: expectedPct,
          expected_horizon_days: expectedHorizonDays,
          magnitude_error: magnitudeError,
        },
      });
      results.outcomes_recorded++;
    }
  }

  const snapshots = await prisma.sentimentSnapshot.findMany({
    where: { scanned_at: { gte: new Date(Date.now() - windowMs), lte: new Date(Date.now() - minAgeMs) } },
    include: { outcomes: true },
  });

  for (const snap of snapshots) {
    // Phase 17 WR-06 guard: cold-start snapshots may have price_at_scan === 0
    // (engine-context.ts:479 doesn't fetch a live price). Skip them so we don't
    // divide by zero and persist Infinity/NaN pct_change values that would
    // corrupt the learning engine outcomes.
    if (!snap.price_at_scan || snap.price_at_scan === 0) { results.skipped++; continue; }
    const age = ageInDays(snap.scanned_at);
    for (const day of TARGET_DAYS) {
      if (Math.abs(age - day) > 0.6) continue;
      if (snap.outcomes.some(o => o.days_after === day)) { results.skipped++; continue; }
      const price = await fetchPrice(snap.ticker);
      if (!price) { results.failed++; continue; }
      // percentage-points unit: 2.34 means +2.34%. pct_change and forward_return_raw share this exact value.
      const absoluteReturnPct = ((price - snap.price_at_scan) / snap.price_at_scan) * 100;
      const sectorLabels = await computeSectorLabels({
        ticker: snap.ticker,
        fromDate: snap.scanned_at,
        toDate: new Date(),
        absoluteReturnPct,
      });
      if (sectorLabels.fallback) results.sector_fallback_to_spy++;
      // Phase 21.1 D-17: compute all three labels via the ONE shared helper.
      const recordedAtSnap = new Date();
      const labelsSnap = await computeLabelsFor({
        sector_etf: sectorLabels.sector_etf,
        asOf: recordedAtSnap,
        ticker_return_pct: absoluteReturnPct,
        spy_return_pct: null,
        sector_relative_pct: sectorLabels.forward_return_sector_rel,
      });
      await prisma.priceOutcome.create({
        data: {
          snapshot_id: snap.id,
          days_after: day,
          price,
          pct_change: absoluteReturnPct,
          recorded_at: recordedAtSnap,
          sector_etf: sectorLabels.sector_etf,
          forward_return_raw: sectorLabels.forward_return_raw,
          forward_return_sector_rel: sectorLabels.forward_return_sector_rel,
          is_directional_hit: labelsSnap.is_directional_hit,
          is_sigma_hit_k1: labelsSnap.is_sigma_hit_k1,
          is_hit_flat1: labelsSnap.is_hit_flat1,
          sector_sigma_60d: labelsSnap.sector_sigma_60d,
          // Phase 29 (D-02) — snapshot-originated outcomes have no report,
          // so no Gemini price forecast. Explicit nulls document intent.
          expected_pct: null,
          expected_horizon_days: null,
          magnitude_error: null,
        },
      });
      results.outcomes_recorded++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
