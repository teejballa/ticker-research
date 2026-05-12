/**
 * Plan 20-A-03 — Monthly decay-tuning cron.
 *
 * Invokes the same code path as scripts/tune-decay.ts but as a Vercel cron
 * route. Persists DecayCalibration rows; does NOT auto-flip
 * SENTIMENT_DECAY_MODE — that requires operator review of the bootstrap
 * cutover report (T-20-A-03-04).
 *
 * Schedule: monthly via vercel.json crons entry — `'0 6 1 * *'` UTC.
 * Auth: CRON_SECRET Bearer header (project convention; see sentiment-scan/route.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

import { DECAY_HYPERPARAMETERS } from '@/lib/sentiment/decay-hyperparameters';
import { halfLifeDays } from '@/lib/sentiment/decay';
import type { SourceClass } from '@/lib/sentiment/source-class';
import {
  SOURCE_CLASSES,
  MIN_N_OBSERVATIONS,
  ICIR_UPLIFT_GATE,
  DEFAULT_WINDOW_DAYS,
  tuneClass,
} from '../../../../../scripts/tune-decay';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes — grid search may take a while

// Re-export constants for static analysis / tests
export {
  SOURCE_CLASSES,
  MIN_N_OBSERVATIONS,
  ICIR_UPLIFT_GATE,
  DEFAULT_WINDOW_DAYS,
};

export async function GET(request: NextRequest) {
  // Auth — same pattern as sentiment-scan/route.ts
  if (
    request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'DATABASE_URL not set' },
      { status: 500 },
    );
  }

  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  const model_version = `decay-tuned-${new Date()
    .toISOString()
    .slice(0, 10)}-cron`;
  const results: Array<Record<string, unknown>> = [];

  try {
    for (const cls of SOURCE_CLASSES as SourceClass[]) {
      const r = await tuneClass(prisma, cls, DEFAULT_WINDOW_DAYS);

      if ('insufficient_data' in r) {
        results.push({
          source_class: r.source_class,
          status: 'INSUFFICIENT_DATA',
          n: r.n,
          seed_lambda: DECAY_HYPERPARAMETERS[cls].lambda_per_day,
        });
        continue;
      }

      await prisma.decayCalibration.create({
        data: {
          source_class: r.source_class,
          lambda_per_day: r.best_lambda,
          half_life_days: halfLifeDays(r.best_lambda),
          icir_uplift_vs_no_decay: r.icir_uplift,
          training_window_days: r.training_window_days,
          n_observations: r.n_observations,
          model_version,
        },
      });

      results.push({
        source_class: r.source_class,
        status: 'OK',
        best_lambda: r.best_lambda,
        half_life_days: halfLifeDays(r.best_lambda),
        icir_uplift: r.icir_uplift,
        n_observations: r.n_observations,
        cutover_eligible: r.cutover_eligible,
        passes_icir_gate: r.icir_uplift >= ICIR_UPLIFT_GATE,
        passes_n_gate: r.n_observations >= MIN_N_OBSERVATIONS,
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  return NextResponse.json({
    ok: true,
    model_version,
    results,
    note: 'Cron persists DecayCalibration rows but does NOT flip SENTIMENT_DECAY_MODE — operator review required (T-20-A-03-04)',
  });
}
