// src/app/api/insights/composite-calibration/route.ts
// Phase 24 (REASON-04). Read-latest CompositeCalibrationSnapshot for a
// (classifier_version × regime × cap_class) cell. Unauthenticated per /insights/*
// convention (read-only, no PII). Zod-validated query params.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  regime: z
    .enum(['ALL', 'bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol'])
    .default('ALL'),
  cap_class: z.enum(['large_cap', 'mid_cap', 'small_cap']).default('large_cap'),
  classifier_version: z.string().default('cipher-composite-v1'),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    regime: url.searchParams.get('regime') ?? undefined,
    cap_class: url.searchParams.get('cap_class') ?? undefined,
    classifier_version: url.searchParams.get('classifier_version') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid query', details: parsed.error.issues },
      { status: 400 },
    );
  }
  const { regime, cap_class, classifier_version } = parsed.data;

  const snapshot = await prisma.compositeCalibrationSnapshot.findFirst({
    where: { classifier_version, regime, cap_class },
    orderBy: { computed_at: 'desc' },
  });

  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: 'no snapshot found', regime, cap_class, classifier_version },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    classifier_version: snapshot.classifier_version,
    regime: snapshot.regime,
    cap_class: snapshot.cap_class,
    computed_at: snapshot.computed_at.toISOString(),
    composite_brier: snapshot.composite_brier,
    ci_low: snapshot.ci_low,
    ci_high: snapshot.ci_high,
    ece: snapshot.ece,
    n_holdout: snapshot.n_holdout,
    n_fit_samples: snapshot.n_fit_samples,
    reliability_bins: snapshot.reliability_bins,
    status: snapshot.status,
    baseline_brier_naive_mean: snapshot.baseline_brier_naive_mean,
    baseline_brier_logistic_36: snapshot.baseline_brier_logistic_36,
  });
}
