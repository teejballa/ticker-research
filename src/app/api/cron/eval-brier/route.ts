// src/app/api/cron/eval-brier/route.ts
//
// Phase 20-C-02: Weekly cron — recomputes Brier + Murphy decomposition +
// CORP reliability diagram per classifier_version over the trailing 90
// days of SentimentObservation rows (joined PIT-INVARIANT on fetched_at).
//
// Schedule: '0 8 * * 1' UTC (Mondays 08:00 UTC) — staggered after the
// daily 20-Z-03 retention crons.
//
// In Vercel Functions the filesystem is read-only except /tmp, so this
// route writes the JSON artifact to /tmp/reports first and (optionally)
// uploads a copy to Vercel Blob when BLOB_READ_WRITE_TOKEN is set. In
// local dev (process.env.NODE_ENV !== 'production'), the writes go
// directly to the repo's reports/ directory.

import { runEvalBrier } from '../../../../../scripts/eval-brier';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const outDir =
    process.env.NODE_ENV === 'production'
      ? '/tmp/reports'
      : undefined; // defaults to <cwd>/reports

  const { results, jsonPath, mdPath } = await runEvalBrier({ outDir });

  // Structured warning visible in `vercel logs --follow` for any failed
  // classifier_version — the operator can drill into reports/brier-*.md
  // for the REMEDIATION_RECOMMENDATION.
  for (const r of results) {
    if (r.status === 'ship_gate_failed') {
      console.warn(
        '[eval-brier] SHIP_GATE_FAILED',
        JSON.stringify({
          classifier_version: r.classifier_version,
          n: r.n,
          brier: r.brier,
          base_rate: r.base_rate,
          dominant_failure_mode: r.ship_gate.dominant_failure_mode,
          remediation_recommendation:
            r.ship_gate.remediation_recommendation,
        }),
      );
    }
  }

  return Response.json({
    ok: true,
    results,
    artifacts: { json: jsonPath, md: mdPath },
  });
}
