// src/app/api/insights/horizon-brier/route.ts
// Phase 16-05 — Brier-per-horizon-per-TechPattern series for the Horizon Brier
// tab on /insights. Aggregates LearnedPattern rows where signal_class='technical',
// sample-size-weighted across cap_classes, returning one series per TechPattern
// with points indexed by horizon_days ∈ {3, 7, 14, 30, 60, 90}.
//
// Wire shape (locked by plan 16-05):
//   {
//     series: Array<{
//       pattern_key: TechPattern,
//       points: Array<{ horizon_days: number, brier_in_sample: number | null, status: PatternStatus }>
//     }>,
//     brier_null: number   // 0.25 = binary 50/50 baseline reference line
//   }

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

const TECH_PATTERNS = [
  'breakout_uptrend',
  'overbought_uptrend',
  'pullback_in_uptrend',
  'consolidation',
  'breakdown',
  'oversold_downtrend',
  'death_cross',
  'golden_cross',
] as const;

const HORIZONS = [3, 7, 14, 30, 60, 90] as const;

type PatternStatus = 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';

export async function GET() {
  try {
    const cells = await prisma.learnedPattern.findMany({
      where: { signal_class: 'technical' },
      orderBy: [{ pattern_key: 'asc' }, { horizon_days: 'asc' }],
    });

    const series = TECH_PATTERNS.map((pk) => {
      const points = HORIZONS.map((h) => {
        const subset = cells.filter((c) => c.pattern_key === pk && c.horizon_days === h);
        const totalN = subset.reduce((s, c) => s + c.sample_size, 0);
        const weighted =
          totalN === 0
            ? null
            : subset.reduce(
                (s, c) => s + (c.brier_in_sample ?? 0) * c.sample_size,
                0,
              ) / totalN;

        let status: PatternStatus = 'NO_DATA';
        if (subset.some((c) => c.status === 'ACTIVE')) status = 'ACTIVE';
        else if (subset.some((c) => c.status === 'EXPLORATORY')) status = 'EXPLORATORY';
        else if (subset.some((c) => c.status === 'DEPRECATED')) status = 'DEPRECATED';

        return {
          horizon_days: h,
          brier_in_sample: weighted,
          status,
        };
      });
      return { pattern_key: pk, points };
    });

    return NextResponse.json({
      series,
      brier_null: 0.25, // binary 50/50 chance baseline
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'horizon-brier query failed' },
      { status: 500 },
    );
  }
}
