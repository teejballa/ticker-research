// src/app/api/cron/composite-calibration/route.ts
// Phase 24 (D-01..D-07, REASON-02, REASON-04, REASON-05). Daily cron 0 3 * * * UTC.
// Fits per-class isotonic curves (Mondays) OR reuses previous curves (Tue-Sun);
// computes composite Brier + BCa CI + CORP reliability + ECE + non-LLM baselines
// (naive-mean + logistic-36 per CLAUDE.md #8); INSERTS one
// CompositeCalibrationSnapshot per (regime × cap_class) cell.
//
// APPEND-ONLY — never UPDATE. Latest snapshot per cell is what /insights/composite-calibration
// and engine-context.ts read.
//
// NOTE ON MISSING PER-CLASS CURVES (Warning #5 in 24-REVISION-TODO.md):
// When a class fails MIN_N_FIT_PER_CLASS, its curve is null. NEVER substitute an
// identity curve — that pretends the class was calibrated when it wasn't. Instead,
// the class input's status is flipped to 'NO_DATA' at compose time so composeSignal
// excludes it from the ACTIVE set (K decreases accordingly).
//
// NOTE ON ECE (Warning #6): the CorpReliabilityResult type is pinned in
// src/lib/composite/types.ts. On malformed output (missing bin_counts /
// calibrated_probs) the cron THROWS — never silently defaults ECE=0.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  loadFitDataset,
  loadHoldoutDataset,
  fitPerClassCurves,
  computeCompositeCi,
  brier,
  type CompositeRow,
} from '@/lib/composite/isotonic-fit';
import {
  composeSignal,
  deserialize,
  type SignalClass,
  type IsotonicCurveJSON,
  type IsotonicPredictor,
} from '@/lib/composite';
import { corpReliabilityDiagram } from '@/lib/stats/isotonic';
import type { CorpReliabilityResult } from '@/lib/composite/types';
import { logistic36Brier, type LogisticRow } from '@/lib/composite/logistic-baseline';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CLASSIFIER_VERSION = 'cipher-composite-v1';
const MIN_N_FIT_PER_CLASS = 50;
const MIN_N_HOLDOUT = 100;
const BOOTSTRAP_N_RESAMPLES = 1000;
const HORIZON_DAYS = 30;
const HOLDOUT_WINDOW_DAYS = 30;

const REGIMES = ['ALL', 'bull-low-vol', 'bull-high-vol', 'bear-low-vol', 'bear-high-vol'] as const;
const CAP_CLASSES = ['large_cap', 'mid_cap', 'small_cap'] as const;
const CLASSES: SignalClass[] = ['diffusion', 'technical', 'institutional', 'insider'];

function naiveMeanBrier(rows: CompositeRow[]): number {
  const preds = rows
    .map((r) => {
      const active = CLASSES.filter((c) => r.raw_posteriors[c] != null && r.status[c] === 'ACTIVE');
      if (active.length < 2) return null;
      const mean = active.reduce((s, c) => s + (r.raw_posteriors[c] as number), 0) / active.length;
      return { p: mean, y: r.outcome as number };
    })
    .filter((x): x is { p: number; y: number } => x != null);
  return brier(preds);
}

// Blocker #2 in 24-REVISION-TODO.md: real logistic-36 baseline module lives at
// @/lib/composite/logistic-baseline (Plan 02 Task 24-02-03). CompositeRow does
// NOT carry the 36-feature vector today (loadHoldoutDataset returns per-class
// raw posteriors + ESS only). Until loadHoldoutDataset is extended to project
// the P21.1 CORE-ML-23 36-feature vector, this returns null with a warn — the
// Wave 4 ship-gate script's Gate 5 will treat missing baselines as "skip" for
// now. Follow-up gap-closure item filed on 2026-09-23.
function computeLogisticBaselineBrier(rows: CompositeRow[]): number | null {
  const logisticRows: LogisticRow[] = [];
  for (const r of rows) {
    const maybeFeatures = (r as unknown as { features?: number[] }).features;
    if (!Array.isArray(maybeFeatures) || maybeFeatures.length !== 36) {
      console.warn(
        '[composite-calibration] logistic-36 baseline unavailable: CompositeRow missing 36-feature vector (Blocker #2 partial — extend loadHoldoutDataset in follow-up).',
      );
      return null;
    }
    logisticRows.push({
      features: maybeFeatures,
      outcome: r.outcome,
      predicted_at: r.predicted_at,
    });
  }
  if (logisticRows.length < 100) return null;
  // Forward-chaining split (CLAUDE.md #1): 70% fit, 30% eval, ordered by predicted_at.
  logisticRows.sort((a, b) => (a.predicted_at?.getTime() ?? 0) - (b.predicted_at?.getTime() ?? 0));
  const cutoff = Math.floor(logisticRows.length * 0.7);
  return logistic36Brier(
    logisticRows,
    { fit_start: 0, fit_end: cutoff },
    { eval_start: cutoff, eval_end: logisticRows.length },
  );
}

// MJ-01 fix: include baseline-lift check so `status='ship-eligible'` in the DB
// matches what `scripts/check-composite-ship-gate.ts` (Gates 4 + 5) actually
// approves. Previously status ignored baseline lift, so an operator querying
// ship-eligible cells got a superset of what the CLI would approve.
//
// A `null` baseline_logistic is NOT passing (per BL-02 pragmatic path): the
// gate script still labels the SKIP visibly, but the DB status cannot claim
// ship-eligible without a real logistic lift number.
function deriveStatus(
  brier_pt: number,
  ece: number,
  n_holdout: number,
  baseline_naive: number | null,
  baseline_logistic: number | null,
): string {
  if (n_holdout < MIN_N_HOLDOUT) return 'insufficient_data';
  const brierOk = brier_pt <= 0.24;
  const eceOk = ece <= 0.05;
  const naiveLiftOk =
    baseline_naive == null || baseline_naive - brier_pt >= 0.005;
  const logisticLiftOk =
    baseline_logistic == null
      ? false // per BL-02 — null is not passing at DB status level
      : baseline_logistic - brier_pt >= 0.005;
  if (brierOk && eceOk && naiveLiftOk && logisticLiftOk) return 'ship-eligible';
  if ((brierOk || eceOk) && naiveLiftOk) return 'shadow';
  return 'degraded';
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const computedAt = new Date();
  const isMonday = computedAt.getUTCDay() === 1;
  let snapshotsWritten = 0;
  let snapshotsInsufficient = 0;

  for (const regime of REGIMES) {
    for (const cap_class of CAP_CLASSES) {
      try {
        // Train/holdout separation (BL-01): purge fit rows that would leak into
        // the holdout window (CLAUDE.md #1, ISL Ch. 5 forward-chaining split).
        const fitRows = await loadFitDataset({
          asOf: computedAt,
          regime,
          cap_class,
          horizonDays: HORIZON_DAYS,
          holdoutEndDate: new Date(computedAt.getTime() - HORIZON_DAYS * 86_400_000),
          holdoutWindowDays: HOLDOUT_WINDOW_DAYS,
        });
        const holdRows = await loadHoldoutDataset({
          asOf: computedAt,
          windowDays: HOLDOUT_WINDOW_DAYS,
          regime,
          cap_class,
          horizonDays: HORIZON_DAYS,
        });

        if (fitRows.length < MIN_N_FIT_PER_CLASS || holdRows.length < MIN_N_HOLDOUT) {
          await prisma.compositeCalibrationSnapshot.create({
            data: {
              classifier_version: CLASSIFIER_VERSION,
              computed_at: computedAt,
              regime,
              cap_class,
              isotonic_curves: {} as Prisma.InputJsonValue,
              n_fit_samples: fitRows.length,
              min_classes_active: 2,
              composite_brier: 0,
              ci_low: 0,
              ci_high: 0,
              bootstrap_method: 'bca',
              bootstrap_n_resamples: 0,
              reliability_bins: {} as Prisma.InputJsonValue,
              ece: 0,
              n_holdout: holdRows.length,
              baseline_brier_naive_mean: null,
              baseline_brier_logistic_36: null,
              status: 'insufficient_data',
              notes: `n_fit=${fitRows.length} n_holdout=${holdRows.length}`,
            },
          });
          snapshotsInsufficient++;
          continue;
        }

        // Refit curves on Mondays OR when no prior snapshot exists for cell.
        let curvesJson: Record<SignalClass, IsotonicCurveJSON | null>;
        if (isMonday) {
          curvesJson = fitPerClassCurves(fitRows, {
            minN: MIN_N_FIT_PER_CLASS,
            horizonDays: HORIZON_DAYS,
          });
        } else {
          const prior = await prisma.compositeCalibrationSnapshot.findFirst({
            where: {
              classifier_version: CLASSIFIER_VERSION,
              regime,
              cap_class,
              status: { not: 'insufficient_data' },
            },
            orderBy: { computed_at: 'desc' },
          });
          curvesJson = prior
            ? (prior.isotonic_curves as unknown as Record<SignalClass, IsotonicCurveJSON | null>)
            : fitPerClassCurves(fitRows, {
                minN: MIN_N_FIT_PER_CLASS,
                horizonDays: HORIZON_DAYS,
              });
        }

        // Warning #5: NEVER substitute identityCurve for missing per-class curves.
        // Pass null into composeSignal AND flip the class status to 'NO_DATA' so
        // composeSignal excludes the class from the ESS-weighted mean.
        const curves: Record<SignalClass, IsotonicPredictor | null> = {
          diffusion:     curvesJson.diffusion     ? deserialize(curvesJson.diffusion)     : null,
          technical:     curvesJson.technical     ? deserialize(curvesJson.technical)     : null,
          institutional: curvesJson.institutional ? deserialize(curvesJson.institutional) : null,
          insider:       curvesJson.insider       ? deserialize(curvesJson.insider)       : null,
        };

        // Holdout composite predictions. For each class where curves[c] is null,
        // override the input.status to 'NO_DATA' so composeSignal excludes it.
        const preds = holdRows
          .map((r) => {
            const inputs = {
              diffusion:     { raw_posterior: r.raw_posteriors.diffusion,     ess: r.ess.diffusion,     status: curvesJson.diffusion     ? r.status.diffusion     : ('NO_DATA' as const) },
              technical:     { raw_posterior: r.raw_posteriors.technical,     ess: r.ess.technical,     status: curvesJson.technical     ? r.status.technical     : ('NO_DATA' as const) },
              institutional: { raw_posterior: r.raw_posteriors.institutional, ess: r.ess.institutional, status: curvesJson.institutional ? r.status.institutional : ('NO_DATA' as const) },
              insider:       { raw_posterior: r.raw_posteriors.insider,       ess: r.ess.insider,       status: curvesJson.insider       ? r.status.insider       : ('NO_DATA' as const) },
            };
            const result = composeSignal(inputs, curves, { minClassesActive: 2 });
            return result.composite_prob != null
              ? { p: result.composite_prob, y: r.outcome as number }
              : null;
          })
          .filter((x): x is { p: number; y: number } => x != null);

        const composite_brier = brier(preds);

        // computeCompositeCi expects Record<SignalClass, IsotonicPredictor> (non-null).
        // Null-curve classes are already suppressed via status='NO_DATA' on the
        // holdout rows above, so composeSignal never invokes the null curve.
        const curvesForCi = curves as unknown as Record<SignalClass, IsotonicPredictor>;
        const ci = computeCompositeCi(holdRows, curvesForCi, {
          nResamples: BOOTSTRAP_N_RESAMPLES,
          seed: 42,
        });

        const reliability = corpReliabilityDiagram(
          preds.map((p) => p.p),
          preds.map((p) => p.y),
        );

        // Warning #6: real CorpReliabilityResult; throw on malformed output.
        const typedRel: CorpReliabilityResult = reliability;
        if (
          !Array.isArray(typedRel.bin_counts) ||
          typedRel.bin_counts.length === 0 ||
          !Array.isArray(typedRel.calibrated_probs) ||
          typedRel.calibrated_probs.length !== preds.length
        ) {
          throw new Error(
            `[composite-calibration] corpReliabilityDiagram returned malformed result for cell (${regime}, ${cap_class}): bin_counts.length=${typedRel.bin_counts?.length ?? 'undefined'}, calibrated_probs.length=${typedRel.calibrated_probs?.length ?? 'undefined'} vs preds.length=${preds.length}. Do NOT silently default ECE to 0 (Warning #6).`,
          );
        }

        // ECE via 20 equal-width buckets on [0, 1] over prediction space
        // (CS229 "Evaluation Metrics" — sample-weighted mean absolute deviation
        // between mean prediction and empirical outcome frequency per bucket).
        const N_BUCKETS = 20;
        const bucketSumP = new Array<number>(N_BUCKETS).fill(0);
        const bucketSumY = new Array<number>(N_BUCKETS).fill(0);
        const bucketCount = new Array<number>(N_BUCKETS).fill(0);
        for (const { p, y } of preds) {
          let k = Math.floor(p * N_BUCKETS);
          if (k >= N_BUCKETS) k = N_BUCKETS - 1;
          if (k < 0) k = 0;
          bucketSumP[k] += p;
          bucketSumY[k] += y;
          bucketCount[k] += 1;
        }
        const totalN = preds.length;
        let ece = 0;
        for (let k = 0; k < N_BUCKETS; k++) {
          if (bucketCount[k] === 0) continue;
          const meanP = bucketSumP[k] / bucketCount[k];
          const meanY = bucketSumY[k] / bucketCount[k];
          ece += (bucketCount[k] / totalN) * Math.abs(meanP - meanY);
        }

        const baseline_brier_naive_mean = naiveMeanBrier(holdRows);
        const baseline_brier_logistic_36 = computeLogisticBaselineBrier(holdRows);

        const status = deriveStatus(
          composite_brier,
          ece,
          holdRows.length,
          baseline_brier_naive_mean,
          baseline_brier_logistic_36,
        );

        await prisma.compositeCalibrationSnapshot.create({
          data: {
            classifier_version: CLASSIFIER_VERSION,
            computed_at: computedAt,
            regime,
            cap_class,
            isotonic_curves: curvesJson as unknown as Prisma.InputJsonValue,
            n_fit_samples: fitRows.length,
            min_classes_active: 2,
            composite_brier,
            ci_low: ci.low,
            ci_high: ci.high,
            bootstrap_method: (ci as unknown as { method?: string }).method ?? 'bca',
            bootstrap_n_resamples: BOOTSTRAP_N_RESAMPLES,
            reliability_bins: reliability as unknown as Prisma.InputJsonValue,
            ece,
            n_holdout: holdRows.length,
            baseline_brier_naive_mean,
            baseline_brier_logistic_36,
            status,
            notes: null,
          },
        });
        snapshotsWritten++;
      } catch (e) {
        console.error(`[composite-calibration] cell (${regime}, ${cap_class}) failed:`, e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    computed_at: computedAt.toISOString(),
    classifier_version: CLASSIFIER_VERSION,
    snapshots_written: snapshotsWritten,
    snapshots_insufficient_data: snapshotsInsufficient,
    refit_mode: isMonday ? 'fresh' : 'reuse',
  });
}
