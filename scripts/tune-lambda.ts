#!/usr/bin/env tsx
// scripts/tune-lambda.ts
//
// Phase 18 / D-01: per-class λ grid search via Purged K-Fold + Embargo CV.
// Grid: {14, 30, 60, 90, 180, 365} days. Score: out-of-sample Brier on
// held-out test folds. One winning λ per signal class.
//
// D-16 invariant: uses purgedKFold from src/lib/cv.ts (never random K-fold,
// never simple time-split). Defaults purge=embargo=90 days.
//
// Usage:
//   npx tsx scripts/tune-lambda.ts
//
// Output: prints a per-class table of (λ → OOS Brier) and a JSON snippet for
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
import {
  decayWeights,
  updatePosteriorWeighted,
  brierScore,
  posteriorMean,
  type WeightedObservation,
} from '../src/lib/learning';

const LAMBDA_GRID = [14, 30, 60, 90, 180, 365];
const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;
const K = 5;
const PURGE_DAYS = 90;
const EMBARGO_DAYS = 90;

interface ClassResult {
  signal_class: string;
  best_lambda: number;
  best_brier: number;
  per_lambda: Array<{ lambda: number; brier_oos: number }>;
  n_observations: number;
}

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

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[tune-lambda] DATABASE_URL not set — abort.');
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const results: ClassResult[] = [];

  for (const cls of SIGNAL_CLASSES) {
    // Pull all posterior_update events for this signal class — each one
    // corresponds to one (cell × outcome) hit/miss observation.
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
        cell_key: `${ev.signal_class}|${ev.pattern_key}|${ev.cap_class}|${ev.horizon_days}`,
      };
    });

    if (obs.length < K) {
      console.warn(
        `[tune-lambda] ${cls}: only ${obs.length} obs, skipping (need ≥${K} for K-fold)`,
      );
      continue;
    }

    // D-16: Purged K-Fold + Embargo, never random.
    const folds = purgedKFold(obs, K, PURGE_DAYS, EMBARGO_DAYS);
    const sorted = [...obs].sort(
      (a, b) => a.recorded_at.getTime() - b.recorded_at.getTime(),
    );

    const perLambda: Array<{ lambda: number; brier_oos: number }> = [];
    for (const lambda of LAMBDA_GRID) {
      const allOosPredictions: number[] = [];
      const allOosOutcomes: boolean[] = [];

      for (const fold of folds) {
        if (fold.trainIdx.length === 0 || fold.testIdx.length === 0) continue;
        const trainObs: WeightedObservation[] = fold.trainIdx.map((i) => ({
          hit: sorted[i].hit,
          recorded_at: sorted[i].recorded_at,
        }));
        // Anchor "now" at the first test observation so weights reflect
        // train-time recency relative to the prediction point.
        const anchorNow = sorted[fold.testIdx[0]].recorded_at;
        const trainWeights = decayWeights(trainObs, lambda, anchorNow);
        const trainedPosterior = updatePosteriorWeighted(
          { alpha: 1, beta: 1 },
          trainObs,
          trainWeights,
        );
        const meanPred = posteriorMean(trainedPosterior);

        for (const ti of fold.testIdx) {
          allOosPredictions.push(meanPred);
          allOosOutcomes.push(sorted[ti].hit);
        }
      }
      const brier_oos =
        allOosPredictions.length > 0
          ? brierScore(allOosPredictions, allOosOutcomes)
          : NaN;
      perLambda.push({ lambda, brier_oos });
    }

    // Best = lowest Brier (NaN sorted last).
    const ranked = [...perLambda].sort((a, b) => {
      if (Number.isNaN(a.brier_oos)) return 1;
      if (Number.isNaN(b.brier_oos)) return -1;
      return a.brier_oos - b.brier_oos;
    });
    const best = ranked[0];
    results.push({
      signal_class: cls,
      best_lambda: best.lambda,
      best_brier: best.brier_oos,
      per_lambda: perLambda,
      n_observations: obs.length,
    });
  }

  // Print per-class results.
  console.log(
    '\n=== λ Tuning Results (Purged K-Fold + Embargo, K=5, purge=embargo=90d) ===\n',
  );
  for (const r of results) {
    console.log(`\n${r.signal_class} (n=${r.n_observations}):`);
    console.table(r.per_lambda);
    console.log(
      `  → BEST λ=${r.best_lambda} days (OOS Brier=${Number.isNaN(r.best_brier) ? 'NaN' : r.best_brier.toFixed(4)})`,
    );
  }

  // Emit a HYPERPARAMETERS JSON snippet for operator to paste.
  const tunedAt = new Date().toISOString();
  console.log(
    '\n=== HYPERPARAMETERS snippet (paste into src/lib/learning.ts) ===\n',
  );
  console.log('// AUTO-GENERATED by scripts/tune-lambda.ts on ' + tunedAt);
  for (const r of results) {
    const brier =
      Number.isNaN(r.best_brier) ? 'NaN' : r.best_brier.toFixed(4);
    console.log(
      `  ${r.signal_class.padEnd(13)}: { lambda_days: ${r.best_lambda}, ph_delta: <FROM tune-page-hinkley.ts>, ph_lambda: <FROM tune-page-hinkley.ts>, tuned_at: '${tunedAt}', cv_brier_oos: ${brier} },`,
    );
  }

  if (results.length === 0) {
    console.warn(
      '\n[tune-lambda] WARNING: no signal class produced enough observations to tune. Keep HYPERPARAMETERS placeholders and re-run after backfill (Plan 25 / P21).',
    );
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
