/**
 * Plan 20-A-05 — Monthly cron: calibrate cross-platform agreement threshold.
 *
 * Schedule: '0 6 1 * *' (1st of each month, 06:00 UTC — outside US market hours,
 * same family as the existing tune-decay cron).
 * Auth: CRON_SECRET Bearer header (project convention — matches all other
 * /api/cron/* routes).
 *
 * Invokes scripts/calibrate-agreement-threshold.ts:runAgreementCalibration,
 * which:
 *   - Loads SentimentObservation rows from the trailing 90d window with ≥2
 *     distinct contributing sources per (ticker, hour-bucket).
 *   - Computes agreement_score per bucket via the canonical formula
 *     1 - std(bull_pct)/50.
 *   - Enriches with forward 7d realized volatility (annualized, bps) from
 *     yahoo-finance2 historical bars.
 *   - Grid-searches threshold ∈ [0.3, 0.7] step 0.05; picks the threshold
 *     maximizing vol-uplift with bootstrap CI > 0.
 *   - Null-result branch: persists threshold = 0.5 (literature default per
 *     Cookson & Engelberg) with null_result = true.
 *   - Persists exactly one AgreementCalibration row.
 */
// TODO(20-Z-03): wrap with withTelemetry('cron-agreement-calibration')

import { NextResponse } from 'next/server';
import { runAgreementCalibration } from '@/../scripts/calibrate-agreement-threshold';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const result = await runAgreementCalibration({ training_window_days: 90 });
  return NextResponse.json({ ok: true, ...result });
}
