/**
 * Plan 20-A-01 — Monthly cron: calibrate crowded-consensus thresholds.
 *
 * Schedule: '0 7 1 * *' (1st of each month, 07:00 UTC — outside US market hours).
 * Auth: CRON_SECRET Bearer header (project convention).
 *
 * Invokes scripts/calibrate-crowded-consensus.ts:runCalibration, which:
 *   - Grid-searches H_thresh × V_thresh × D_thresh over the trailing 90d of
 *     SentimentObservation rows (joined by PIT-safe fetched_at).
 *   - Maximizes Brier Skill Score vs climatology base rate.
 *   - Persists the winning tuple to CrowdedConsensusCalibration.
 *   - Returns structured JSON with exit_code (0/4/5).
 */
// TODO(20-Z-03): wrap with withTelemetry('cron-calibrate-crowded-consensus')

import { NextResponse } from 'next/server';
import { runCalibration } from '@/../scripts/calibrate-crowded-consensus';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const result = await runCalibration({});
  return NextResponse.json(result, {
    status: result.exit_code === 0 ? 200 : 202,
  });
}
