/**
 * Phase 21.1 D-11/D-13 — /api/cron/baseline-eval
 *
 * Daily cron at 09:00 UTC (after /api/cron/learn at 07:30 UTC).
 * Trains both logistic baselines on all labeled rows, sweeps ridge precision,
 * evaluates on last Purged K-Fold test fold, and persists results as a
 * LearningEvent of event_type='baseline_eval'.
 *
 * Provides the non-LLM baseline required by CLAUDE.md Rule 8:
 *   "the LLM beats logistic regression on calibrated Brier score by X
 *    with bootstrap CI [Y, Z]" — the IS-paper claim shape.
 *
 * Auth: Bearer ${CRON_SECRET} — same guard as /api/cron/learn:1156.
 * STRIDE T-21.1-03-01: 401 on mismatch (spoofing mitigation).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { purgedKFold } from '@/lib/cv';
import {
  trainBaseline,
  scoreBaseline,
  sweepPriorPrecision,
  type TrainingRow,
} from '@/lib/baselines/logistic';
import { bootstrapBCa } from '@/lib/evaluation';
import type { CanonicalSnapshot } from '@/lib/baselines/canonical-features';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Ridge precision grids per D-13 / RESEARCH §9 Q5
// ---------------------------------------------------------------------------
const ENGINE36_GRID = [1, 2, 4, 8, 16] as const;
const CANONICAL7_GRID = [0.5, 1, 2, 4] as const;

// Purged K-Fold parameters (CORE-ML-16 + López de Prado 2018 §7.4)
// purgeDays=7: the primary sigma_k1 label horizon; embargo=7 to match
const K_FOLDS = 5;
const PURGE_DAYS = 7;
const EMBARGO_DAYS = 7;

// Minimum rows required before we attempt training
const MIN_ROWS = 50;

// BCa bootstrap resamples for CIs on every reported metric
const N_BOOTSTRAP = 10_000;

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // CRON_SECRET Bearer auth — same pattern as /api/cron/learn:1156
  // STRIDE T-21.1-03-01: spoofing mitigation
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  console.log('[cron:baseline-eval] starting');

  // ── Load labeled PriceOutcome rows (is_sigma_hit_k1 must be set)
  // Bounded by take:5000 (STRIDE T-21.1-03-02: DoS mitigation)
  const rawOutcomes = await prisma.priceOutcome.findMany({
    where: { is_sigma_hit_k1: { not: null } },
    include: { snapshot: true },
    take: 5000,
    orderBy: { recorded_at: 'asc' },
  });

  // ── Assemble TrainingRow shape
  // For engine36: we store features36 = null (Wave 4 will wire real 36-d vectors
  // once DiffusionTrace joins are available). For Phase 21.1 v1 we pass an empty
  // features36 → featureVectorFor falls back to zero vector with a console.warn.
  // For canonical7: extract from snapshot JSON columns.
  const trainingRows: TrainingRow[] = [];
  const rowDates: Date[] = []; // parallel array for cv.ts Observation construction

  for (const outcome of rawOutcomes) {
    if (outcome.is_sigma_hit_k1 == null) continue;
    const snap = outcome.snapshot;

    // Attempt to extract canonical features from snapshot JSON columns
    // Each cast may return null — buildCanonicalFeatures substitutes 0 with warn
    const techData = (snap?.technical_data ?? null) as Record<string, unknown> | null;
    const commData = (snap?.community_data ?? null) as Record<string, unknown> | null;

    const canonical: CanonicalSnapshot = {
      // @knowable_at  snapshot.scanned_at (source: TechnicalSnapshot in technical_data)
      rsi_14: typeof techData?.rsi_14 === 'number' ? techData.rsi_14 : null,
      // @knowable_at  snapshot.scanned_at (macd_histogram → macd_hist for canonical name)
      macd_hist:
        typeof techData?.macd_histogram === 'number' ? techData.macd_histogram : null,
      // @knowable_at  snapshot.scanned_at (StockTwits bull% — stocktwits_bull_pct or bull_pct)
      sentiment_pct:
        typeof commData?.stocktwits_bull_pct === 'number'
          ? commData.stocktwits_bull_pct
          : typeof commData?.bull_pct === 'number'
            ? commData.bull_pct
            : null,
      // @knowable_at  snapshot.scanned_at (insider net flow from insider_data JSON)
      insider_net_flow: null, // TODO Wave 4: join insider_data.net_flow_30d
      // @knowable_at  snapshot.scanned_at (13F institutional flow from institutional_data)
      institutional_net_flow: null, // TODO Wave 4: join institutional_data.net_flow_quarter
      // @knowable_at  snapshot.scanned_at (options chain put/call ratio)
      put_call_ratio:
        typeof commData?.put_call_ratio === 'number' ? commData.put_call_ratio : null,
      // @knowable_at  snapshot.scanned_at (sector ETF prior 5d return — not yet in schema)
      sector_return: null, // TODO Wave 4: derive from sector ETF price history
    };

    trainingRows.push({
      features36: undefined, // Wave 4 will build these from DiffusionTrace joins
      canonical,
      hit: outcome.is_sigma_hit_k1 ? 1 : 0,
      forward_return: outcome.forward_return_sector_rel ?? 0,
    });
    rowDates.push(outcome.recorded_at);
  }

  if (trainingRows.length < MIN_ROWS) {
    console.log('[cron:baseline-eval] insufficient rows', { n: trainingRows.length, threshold: MIN_ROWS });
    return NextResponse.json({
      ok: true,
      message: 'insufficient_rows',
      n: trainingRows.length,
      threshold: MIN_ROWS,
    });
  }

  // ── Purged K-Fold + Embargo splits (CORE-ML-16 per D-06)
  // cv.ts purgedKFold requires Observation[] — build a parallel set that mirrors
  // the TrainingRow order (same indices) so fold.trainIdx/testIdx map directly
  // into trainingRows[].
  const observations = trainingRows.map((r, i) => ({
    recorded_at: rowDates[i],
    horizon_days: 7, // primary sigma_k1 label horizon
    hit: r.hit === 1,
    cell_key: 'baseline_eval', // single "cell" for the cross-baseline sweep
  }));

  const cvFolds = purgedKFold(observations, K_FOLDS, PURGE_DAYS, EMBARGO_DAYS);
  console.log('[cron:baseline-eval] cv folds', { k: cvFolds.length, n_train: trainingRows.length });

  // ── Ridge precision sweep per baseline (D-13)
  const sweepE36 = sweepPriorPrecision(
    'engine36',
    trainingRows,
    [...ENGINE36_GRID],
    cvFolds,
  );
  const sweepC7 = sweepPriorPrecision(
    'canonical7',
    trainingRows,
    [...CANONICAL7_GRID],
    cvFolds,
  );

  console.log('[cron:baseline-eval] sweep done', {
    e36_chosen: sweepE36.chosen_prior,
    c7_chosen: sweepC7.chosen_prior,
  });

  // ── Train final models on full set with chosen precision
  const e36State = trainBaseline('engine36', trainingRows, {
    priorPrecision: sweepE36.chosen_prior,
  });
  const c7State = trainBaseline('canonical7', trainingRows, {
    priorPrecision: sweepC7.chosen_prior,
  });

  // ── Evaluate on last fold's test set (out-of-sample for headline metrics)
  const lastFold = cvFolds[cvFolds.length - 1];
  const testRows = lastFold.testIdx.map((i) => trainingRows[i]);

  const e36Score = scoreBaseline(e36State, testRows, 'engine36');
  const c7Score = scoreBaseline(c7State, testRows, 'canonical7');

  // ── Null baseline: predict in-sample base rate every time (D-28 comparator)
  const baseRate =
    trainingRows.reduce((acc, r) => acc + r.hit, 0) / trainingRows.length;
  const nullBrier =
    testRows.length > 0
      ? testRows.reduce((acc, r) => acc + (baseRate - r.hit) ** 2, 0) / testRows.length
      : null;

  // ── BCa 95% CIs on Brier per baseline (CLAUDE.md Rule 3: every number gets a CI)
  // Bootstrap over per-observation squared errors
  let e36BrierCI = { low: NaN, high: NaN };
  let c7BrierCI = { low: NaN, high: NaN };

  if (e36Score.predictions.length >= 2) {
    const e36SquaredErrors = e36Score.predictions.map(
      (p, i) => (p - (testRows[i].hit)) ** 2,
    );
    const result = bootstrapBCa(
      e36SquaredErrors,
      (s) => s.reduce((a, b) => a + b, 0) / s.length,
      { nResamples: N_BOOTSTRAP },
    );
    e36BrierCI = { low: result.low, high: result.high };
  }

  if (c7Score.predictions.length >= 2) {
    const c7SquaredErrors = c7Score.predictions.map(
      (p, i) => (p - (testRows[i].hit)) ** 2,
    );
    const result = bootstrapBCa(
      c7SquaredErrors,
      (s) => s.reduce((a, b) => a + b, 0) / s.length,
      { nResamples: N_BOOTSTRAP },
    );
    c7BrierCI = { low: result.low, high: result.high };
  }

  // ── Build response payload
  const payload = {
    n_train: trainingRows.length,
    n_test: testRows.length,
    cv_folds: cvFolds.length,
    base_rate: baseRate,
    null_brier: nullBrier,
    engine36: {
      chosen_prior: sweepE36.chosen_prior,
      brier: e36Score.brier,
      brier_ci_bca_95: [e36BrierCI.low, e36BrierCI.high] as [number, number],
      ic: e36Score.ic,
      log_loss: e36Score.log_loss,
      n: e36Score.n,
      sweep_table: sweepE36.sweep_table,
    },
    canonical7: {
      chosen_prior: sweepC7.chosen_prior,
      brier: c7Score.brier,
      brier_ci_bca_95: [c7BrierCI.low, c7BrierCI.high] as [number, number],
      ic: c7Score.ic,
      log_loss: c7Score.log_loss,
      n: c7Score.n,
      sweep_table: sweepC7.sweep_table,
    },
  };

  // ── Persist as LearningEvent of type 'baseline_eval' (audit trail per T-21.1-03-05)
  // STRIDE T-21.1-03-03: append-only; no consumer mutates these rows
  await prisma.learningEvent.create({
    data: {
      event_type: 'baseline_eval',
      delta: payload as Parameters<typeof prisma.learningEvent.create>[0]['data']['delta'],
      message: `baseline-eval n=${trainingRows.length} e36_brier=${e36Score.brier?.toFixed(4) ?? 'null'} c7_brier=${c7Score.brier?.toFixed(4) ?? 'null'} at ${new Date().toISOString()}`,
    },
  });

  const ms = Date.now() - startedAt;
  console.log('[cron:baseline-eval] complete', { ms, n_train: trainingRows.length });

  return NextResponse.json({ ok: true, ...payload, generated_at: new Date().toISOString() });
}
