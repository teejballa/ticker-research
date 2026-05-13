/**
 * Plan 20-C-05 — Monthly cron: joint-feature ablation runner.
 *
 * Schedule: '0 6 1 * *' (1st of each month, 06:00 UTC — outside US market hours).
 * Auth: CRON_SECRET Bearer header (project convention — matches all other
 * /api/cron/* routes).
 *
 * Invokes `runAblation` from scripts/ablate-joint-features.ts. The 3-consecutive-
 * month promotion gate (T-20-C-05-04) is enforced inside the script via
 * `rollingMonthsAgreeing` — the cron only surfaces the decision; flag mutation
 * (shadow → on) is a Vercel-side ops step.
 */
// TODO(20-Z-03): wrap with withTelemetry('cron-joint-feature-ablation')

import { NextResponse } from 'next/server';
import {
  runAblation,
  DEFAULT_ABLATION_CONFIG,
} from '@/../scripts/ablate-joint-features';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const t0 = Date.now();
  const report = await runAblation({
    asOfDate: new Date(),
    ...DEFAULT_ABLATION_CONFIG,
  });
  const runtimeMs = Date.now() - t0;
  // T-20-C-05-07 — alert if runtimeMs > 200000ms (200s) for two consecutive runs.
  // Downstream alarming is out of scope here; we surface the bool in the response.
  return NextResponse.json({
    ok: true,
    verdict: report.verdict,
    decision: report.decision,
    rollingMonthsAgreeing: report.rollingMonthsAgreeing,
    reportPath: report.reportPath,
    runtimeMs,
    runtimeMsAlert: runtimeMs > 200000,
  });
}
