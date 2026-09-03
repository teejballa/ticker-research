// src/app/api/cron/magnitude-calibration/route.ts
// Phase 29 (D-04, DEMO-10). Weekly cron — Monday 0 8 * * 1 UTC.
// Buckets closed PriceOutcome rows by expected_pct, applies N>=20 ESS gate,
// writes one MagnitudeCalibrationBucket row per surviving bucket. Append-only
// — the insights endpoint reads the latest computed_at group.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { BUCKETS, computeBucketMean } from '@/lib/magnitude-calibration';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ESS_THRESHOLD = 20; // D-04

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Single timestamp for the whole batch — deterministic latest-run grouping.
  const computedAt = new Date();
  let bucketsWritten = 0;
  let bucketsSkippedEss = 0;

  for (const b of BUCKETS) {
    const expectedPctFilter: { gte?: number; lt?: number; not: null } = { not: null };
    if (b.minPct != null) expectedPctFilter.gte = b.minPct;
    if (b.maxPct != null) expectedPctFilter.lt = b.maxPct;

    const outcomes = await prisma.priceOutcome.findMany({
      where: {
        expected_pct: expectedPctFilter,
        forward_return_raw: { not: null },
      },
      select: { forward_return_raw: true },
    });

    if (outcomes.length < ESS_THRESHOLD) {
      bucketsSkippedEss++;
      continue;
    }

    // forward_return_raw is Float? in schema, but filter above guarantees non-null.
    const values = outcomes.map(o => o.forward_return_raw as number);
    const meanActualPct = computeBucketMean(values);

    await prisma.magnitudeCalibrationBucket.create({
      data: {
        bucket_label: b.label,
        expected_midpoint: b.expectedMidpoint,
        mean_actual_pct: meanActualPct,
        n: outcomes.length,
        computed_at: computedAt,
      },
    });
    bucketsWritten++;
  }

  return NextResponse.json({
    ok: true,
    computed_at: computedAt.toISOString(),
    buckets_written: bucketsWritten,
    buckets_skipped_ess: bucketsSkippedEss,
  });
}
