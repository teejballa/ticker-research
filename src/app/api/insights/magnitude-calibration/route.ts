// src/app/api/insights/magnitude-calibration/route.ts
// Phase 29 (D-05, DEMO-11). Public GET endpoint — returns latest cron run's
// MagnitudeCalibrationBucket rows for the "Price Forecast Calibration" tile.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Deterministic latest-run grouping via exact timestamp match.
  const latest = await prisma.magnitudeCalibrationBucket.findFirst({
    orderBy: { computed_at: 'desc' },
    select: { computed_at: true },
  });
  if (!latest) {
    return NextResponse.json({ buckets: [], computed_at: null });
  }
  const buckets = await prisma.magnitudeCalibrationBucket.findMany({
    where: { computed_at: latest.computed_at },
    orderBy: { expected_midpoint: 'asc' },
  });
  return NextResponse.json({ buckets, computed_at: latest.computed_at.toISOString() });
}
