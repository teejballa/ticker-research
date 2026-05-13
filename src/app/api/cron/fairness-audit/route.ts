// src/app/api/cron/fairness-audit/route.ts
//
// Phase 20-C-06 — Monthly cron + auto-trigger on classifier retrain.
//
// Schedule: '0 8 3 * *' UTC (3rd of month, 08:00 UTC) — staggered after
// 20-A-03 tune-decay ('0 6 1 * *') and 20-B-03 calibrate-temperature
// ('0 7 2 * *').
//
// Auto-trigger on retrain (T-20-C-06-04 — CONTEXT.md "Re-run on every model
// retrain"): on every invocation, queries the latest TemperatureCalibration
// row vs the latest FairnessAuditReport. If a fresh calibration row exists
// since the last audit (for any classifier_version), forces a run regardless
// of monthly cadence, logging triggered_by='classifier-retrain'.
//
// Auth: Bearer ${CRON_SECRET} header required; non-matching → 401.
//
// In production, writes go to /tmp/reports (Vercel functions filesystem is
// read-only except /tmp). For local dev, writes go to repo's reports/.

import { runFairnessAudit } from '../../../../../scripts/audit-fairness';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function checkRetrainTrigger(): Promise<{ shouldForceRun: boolean; reason: string }> {
  if (!process.env.DATABASE_URL) {
    return { shouldForceRun: false, reason: 'no-database-url' };
  }
  try {
    const { prisma } = await import('@/lib/db');
    const [latestCalibration, latestAudit] = await Promise.all([
      prisma.temperatureCalibration.findFirst({
        orderBy: { computed_at: 'desc' },
      }),
      // Use a dynamic-prisma access since the FairnessAuditReport model name
      // is post-prisma-generate-pending in deploys; guard against missing.
      (async () => {
        try {
          return await prisma.fairnessAuditReport.findFirst({
            orderBy: { computed_at: 'desc' },
          });
        } catch {
          return null;
        }
      })(),
    ]);
    if (!latestCalibration) {
      return { shouldForceRun: false, reason: 'no-calibration-history' };
    }
    if (!latestAudit) {
      return { shouldForceRun: true, reason: 'no-prior-audit' };
    }
    if (
      latestCalibration.computed_at.getTime() > latestAudit.computed_at.getTime()
    ) {
      return { shouldForceRun: true, reason: 'classifier-retrain' };
    }
    return { shouldForceRun: false, reason: 'no-retrain' };
  } catch (e) {
    console.warn('[fairness-audit-cron] retrain check failed', { error: String(e) });
    return { shouldForceRun: false, reason: 'check-failed' };
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { shouldForceRun, reason } = await checkRetrainTrigger();
  const triggered_by = shouldForceRun ? 'classifier-retrain' : 'monthly-cron';

  // In Vercel functions, only /tmp is writable. Run the audit; the script
  // resolves reports/ relative to cwd. For prod, the markdown report ends
  // up under /tmp/reports, which is fine — the DB row preserves the
  // permanent record. Local/dev writes to repo's reports/.
  try {
    const result = await runFairnessAudit({
      windowDays: 90,
      bootstrapIfSparse: false,
      triggeredBy: triggered_by,
    });

    console.log(
      '[fairness-audit-cron] complete',
      JSON.stringify({
        audit_id: result.audit_id,
        triggered_by,
        retrain_reason: reason,
        n_classifiers: result.classifier_versions.length,
        n_limitations: result.reports.reduce(
          (acc, r) => acc + r.n_limitations_flagged,
          0,
        ),
        db_rows_inserted: result.dbRowsInserted,
      }),
    );

    return Response.json({
      ok: true,
      audit_id: result.audit_id,
      audit_date: result.audit_date,
      n_predictions_total: result.reports.reduce(
        (acc, r) => acc + r.n_predictions_total,
        0,
      ),
      n_limitations_flagged: result.reports.reduce(
        (acc, r) => acc + r.n_limitations_flagged,
        0,
      ),
      triggered_by,
      retrain_reason: reason,
      classifier_versions: result.classifier_versions,
    });
  } catch (e) {
    console.error('[fairness-audit-cron] FAILED', e);
    return Response.json(
      { ok: false, error: String(e), triggered_by },
      { status: 500 },
    );
  }
}
