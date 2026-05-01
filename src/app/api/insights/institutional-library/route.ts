// src/app/api/insights/institutional-library/route.ts
// Phase 17-05 — GET /api/insights/institutional-library
// Returns LearnedPattern rows for signal_class='institutional', grouped by
// (pattern_key, cap_class, horizon_days) in a { cells: [...] } envelope.
//
// Auth: public — /api/insights/* bypass is in middleware.ts (commit 5efc752).
// No per-user scoping needed; LearnedPattern rows are aggregated public-market
// priors with no PII.
//
// Cache: public, max-age=60, stale-while-revalidate=300 — Vercel edge cache
// absorbs traffic spikes; data changes at most once/day (cron cadence).

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const rows = await prisma.learnedPattern.findMany({
    where: { signal_class: 'institutional' },
    orderBy: [{ pattern_key: 'asc' }, { cap_class: 'asc' }, { horizon_days: 'asc' }],
  });

  const cells = rows.map((r) => ({
    pattern_key: r.pattern_key,
    cap_class: r.cap_class,
    horizon_days: r.horizon_days,
    status: r.status,
    posterior_mean:
      r.alpha != null && r.beta != null && r.alpha + r.beta > 0
        ? r.alpha / (r.alpha + r.beta)
        : null,
    sample_size: r.sample_size,
    brier_in_sample: r.brier_in_sample,
    brier_out_sample: r.brier_out_sample,
  }));

  return NextResponse.json(
    { cells },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
}
