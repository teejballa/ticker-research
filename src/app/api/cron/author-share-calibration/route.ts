/**
 * Plan 20-A-04 — Weekly cron: per-ticker author-share Q1 calibration.
 *
 * Schedule: '0 8 * * 1' (Mondays 08:00 UTC — outside US market hours).
 * Auth: CRON_SECRET Bearer header (project convention; same pattern as
 *       calibrate-crowded-consensus, mention-baselines, tune-decay).
 *
 * Invokes scripts/calibrate-author-share-thresholds.ts which:
 *   - Joins SentimentObservation on fetched_at (PIT-safe — S2 discipline,
 *     enforced by 20-Z-07).
 *   - Computes Q1 of trailing-90d author-share distribution per ticker.
 *   - INSERTS a new AuthorShareCalibration row (never UPDATE/DELETE per
 *     T-20-A-04-03).
 */
// TODO(20-Z-03): wrap with withTelemetry('cron-author-share-calibration')

import { NextResponse } from 'next/server';
import { calibrateAuthorShareThresholds } from '@/../scripts/calibrate-author-share-thresholds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const result = await calibrateAuthorShareThresholds();
    return NextResponse.json({
      ...result,
      ms_elapsed: Date.now() - t0,
      status: 'ok',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: 'error',
        error: msg,
        ms_elapsed: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
