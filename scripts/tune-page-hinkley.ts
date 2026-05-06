#!/usr/bin/env tsx
// scripts/tune-page-hinkley.ts
//
// Phase 18 / D-07: per-class (δ, λ_PH) grid search via Purged K-Fold + Embargo
// CV with synthetic injected drift in held-out folds. Score: drift-detection F1.
// Grid: δ ∈ {0.001, 0.005, 0.01}, λ_PH ∈ {30, 50, 100}.
//
// D-16 invariant: uses purgedKFold from src/lib/cv.ts (never random K-fold,
// never simple time-split). Defaults purge=embargo=90 days.
//
// Usage:
//   npx tsx scripts/tune-page-hinkley.ts
//
// Output: per-class table of (δ, λ_PH) → F1 and a JSON snippet for
// HYPERPARAMETERS that the operator pastes into src/lib/learning.ts.

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

// Note: we instantiate PrismaClient locally (matching the convention used by
// scripts/check-active-cell-coverage.ts and scripts/compare-horizon-brier.ts)
// rather than importing the src/lib/db singleton — the singleton evaluates
// process.env.DATABASE_URL at module-load time, BEFORE dotenv can populate it.
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

import { purgedKFold, type Observation } from '../src/lib/cv';
import { pageHinkleyStatistic } from '../src/lib/learning';

const DELTA_GRID = [0.001, 0.005, 0.01];
const LAMBDA_PH_GRID = [30, 50, 100];
const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;
const K = 5;
const PURGE_DAYS = 90;
const EMBARGO_DAYS = 90;
const INJECTED_SHIFT_MAGNITUDE = 0.3; // 30 percentage-point shift = clear drift

interface DeltaPayload {
  hit?: boolean;
  diffusion_hit?: boolean;
  tech_hit?: boolean;
  insider_hit?: boolean;
  institutional_hit?: boolean;
}

function extractHit(cls: string, d: DeltaPayload | null): boolean {
  if (!d) return false;
  if (cls === 'diffusion') return (d.diffusion_hit ?? d.hit ?? false) === true;
  if (cls === 'technical') return (d.tech_hit ?? d.hit ?? false) === true;
  if (cls === 'insider') return (d.insider_hit ?? false) === true;
  return (d.institutional_hit ?? false) === true;
}

function f1(scores: { tp: number; fp: number; fn: number }): number {
  const precision = scores.tp / Math.max(1, scores.tp + scores.fp);
  const recall = scores.tp / Math.max(1, scores.tp + scores.fn);
  return precision + recall === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[tune-page-hinkley] DATABASE_URL not set — abort.');
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log(
    '\n=== Page-Hinkley Tuning (Purged K-Fold + Embargo, K=5, purge=embargo=90d) ===\n',
  );

  const summary: Array<{
    signal_class: string;
    delta: number;
    lambda_ph: number;
    f1: number;
    n_observations: number;
  }> = [];

  for (const cls of SIGNAL_CLASSES) {
    const events = await prisma.learningEvent.findMany({
      where: {
        event_type: 'posterior_update',
        signal_class: cls,
        pattern_key: { not: null },
      },
      orderBy: { occurred_at: 'asc' },
    });

    const obs: Observation[] = events.map((ev) => {
      const d = ev.delta as DeltaPayload | null;
      const hit = extractHit(cls, d);
      return {
        recorded_at: ev.occurred_at,
        horizon_days: ev.horizon_days ?? 30,
        hit,
        cell_key: `${ev.signal_class}|${ev.pattern_key}`,
      };
    });

    if (obs.length < K * 4) {
      console.warn(
        `[tune-ph] ${cls}: only ${obs.length} obs, skipping (need ≥${K * 4})`,
      );
      continue;
    }

    const folds = purgedKFold(obs, K, PURGE_DAYS, EMBARGO_DAYS);
    const sorted = [...obs].sort(
      (a, b) => a.recorded_at.getTime() - b.recorded_at.getTime(),
    );

    const results: Array<{ delta: number; lambda_ph: number; f1: number }> = [];
    for (const delta of DELTA_GRID) {
      for (const lambda_ph of LAMBDA_PH_GRID) {
        let tp = 0;
        let fp = 0;
        let fn = 0;
        for (let foldIdx = 0; foldIdx < folds.length; foldIdx++) {
          const fold = folds[foldIdx];
          if (fold.testIdx.length < 10) continue;

          const trainMean =
            fold.trainIdx.length > 0
              ? fold.trainIdx.reduce(
                  (s, i) => s + (sorted[i].hit ? 1 : 0),
                  0,
                ) / fold.trainIdx.length
              : 0.5;

          // Test fold WITHOUT drift injection — should NOT fire (false-positive check).
          {
            const testObs = fold.testIdx.map((i) => sorted[i]);
            const deltas = testObs.map((o) => (o.hit ? 1 : 0) - trainMean);
            const stat = pageHinkleyStatistic(deltas, delta, lambda_ph);
            if (stat > 0) fp += 1;
          }
          // Test fold WITH injected drift — should fire (true-positive check).
          {
            const testObs = fold.testIdx.map((i) => sorted[i]);
            const deltas = testObs.map(
              (o) => (o.hit ? 1 : 0) - trainMean + INJECTED_SHIFT_MAGNITUDE,
            );
            const stat = pageHinkleyStatistic(deltas, delta, lambda_ph);
            if (stat > 0) tp += 1;
            else fn += 1;
          }
        }
        results.push({ delta, lambda_ph, f1: f1({ tp, fp, fn }) });
      }
    }

    results.sort((a, b) => b.f1 - a.f1);
    console.log(`\n${cls} (n=${obs.length}):`);
    console.table(results);
    const best = results[0];
    if (best) {
      console.log(
        `  → BEST δ=${best.delta}, λ_PH=${best.lambda_ph} (F1=${best.f1.toFixed(4)})`,
      );
      summary.push({
        signal_class: cls,
        delta: best.delta,
        lambda_ph: best.lambda_ph,
        f1: best.f1,
        n_observations: obs.length,
      });
    }
  }

  // Emit a HYPERPARAMETERS snippet (PH portion) for operator to paste.
  const tunedAt = new Date().toISOString();
  console.log(
    '\n=== HYPERPARAMETERS Page-Hinkley snippet (merge with tune-lambda.ts output) ===\n',
  );
  console.log('// AUTO-GENERATED by scripts/tune-page-hinkley.ts on ' + tunedAt);
  for (const s of summary) {
    console.log(
      `  ${s.signal_class.padEnd(13)}: { lambda_days: <FROM tune-lambda.ts>, ph_delta: ${s.delta}, ph_lambda: ${s.lambda_ph}, tuned_at: '${tunedAt}', cv_brier_oos: <FROM tune-lambda.ts> },`,
    );
  }

  if (summary.length === 0) {
    console.warn(
      '\n[tune-page-hinkley] WARNING: no signal class met the n ≥ K*4 threshold. Keep HYPERPARAMETERS placeholders and re-run after backfill (Plan 25 / P21).',
    );
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
