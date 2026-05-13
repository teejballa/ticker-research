/**
 * Plan 20-B-03 — Monthly temperature-scaling calibration cron.
 *
 * Auto-refit-on-version-change (T-20-B-03-04): on every invocation, checks the
 * CURRENT classifier_version vs the LATEST TemperatureCalibration row's
 * classifier_version for each classifier. If they differ (or no prior row
 * exists), force an immediate refit regardless of monthly cadence.
 *
 * Schedule: monthly via vercel.json — '0 7 2 * *' (2nd of month, 07:00 UTC —
 * staggered after 20-A-03 tune-decay at '0 6 1 * *').
 * Auth: CRON_SECRET Bearer header (project convention).
 */
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

import {
  runCalibration,
  persistCalibrationRow,
  defaultVersionResolver,
  type ClassifierKind,
} from '../../../../../scripts/calibrate-temperature-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const REFIT_INTERVAL_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'DATABASE_URL not set' },
      { status: 500 },
    );
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const resolver = defaultVersionResolver();
  const classifiers: ClassifierKind[] = ['finbert', 'gemini-per-doc'];
  const results: Array<Record<string, unknown>> = [];

  try {
    for (const c of classifiers) {
      const currentVersion = resolver[c]();
      // Latest persisted row for this classifier.
      // Note: prisma client typegen needs the schema pushed to live DB; in
      // pre-push environments this will error. Caught below and surfaced
      // as a row-level diagnostic.
      let latest: { classifier_version: string; computed_at: Date } | null = null;
      let refitReason = 'monthly-cadence';
      try {
        latest = (await prisma.temperatureCalibration.findFirst({
          where: { classifier_version: currentVersion },
          orderBy: { computed_at: 'desc' },
          select: { classifier_version: true, computed_at: true },
        })) as { classifier_version: string; computed_at: Date } | null;
      } catch (err) {
        results.push({
          classifier: c,
          status: 'error',
          error: 'TemperatureCalibration table not available — run prisma db push',
          message: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      if (!latest) {
        refitReason = 'no-prior-row';
      } else if (latest.classifier_version !== currentVersion) {
        refitReason = 'classifier-version-change';
      } else {
        const ageMs = Date.now() - latest.computed_at.getTime();
        if (ageMs < REFIT_INTERVAL_DAYS * MS_PER_DAY) {
          results.push({
            classifier: c,
            classifier_version: currentVersion,
            skipped: true,
            reason: `latest row younger than ${REFIT_INTERVAL_DAYS}d (age=${(ageMs / MS_PER_DAY).toFixed(1)}d)`,
          });
          continue;
        }
        refitReason = 'monthly-cadence';
      }

      const out = await runCalibration(c, { mockProductionLabels: 0 });
      for (const r of out) {
        r.notes = (r.notes ? r.notes + ' | ' : '') + `refit_reason=${refitReason}`;
        await persistCalibrationRow(prisma, r);
        results.push({
          classifier: r.classifier,
          classifier_version: r.classifier_version,
          status: r.status,
          T: r.temperature,
          ece_post: r.ece_post_scaling,
          brier_post: r.brier_post_scaling,
          n_validation_samples: r.n_validation_samples,
          refit_reason: refitReason,
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  return NextResponse.json({
    ok: true,
    results,
    note: 'Cron persists TemperatureCalibration rows; SENTIMENT_TEMP_SCALING_MODE cutover is operator-gated per Task 12 ship-gate.',
  });
}
