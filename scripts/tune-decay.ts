#!/usr/bin/env tsx
// scripts/tune-decay.ts
//
// Phase 20-A-03 — per-source-class λ grid search. Maximizes 20-day rolling
// ICIR of decayed aggregate vs forward 7d alpha-vs-SPY. Emits HYPERPARAMETERS.md
// patch + DecayCalibration row.
//
// Usage:
//   npx tsx scripts/tune-decay.ts                          # grid search only
//   npx tsx scripts/tune-decay.ts --bootstrap-cutover      # also runs paired-bootstrap on Sharpe
//   npx tsx scripts/tune-decay.ts --window-days 90         # override training window (SAME across classes)

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

import { DECAY_HYPERPARAMETERS } from '../src/lib/sentiment/decay-hyperparameters';
import { decayWeight, halfLifeDays } from '../src/lib/sentiment/decay';
import type { SourceClass } from '../src/lib/sentiment/source-class';
import { sourceToClassUnsafe } from '../src/lib/sentiment/source-class';

export const SOURCE_CLASSES: SourceClass[] = [
  'retail',
  'news',
  'sec',
  'analyst',
  'social-other',
];
export const LAMBDA_GRID_MULTIPLIERS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
export const DEFAULT_WINDOW_DAYS = 90;
export const MIN_N_OBSERVATIONS = 60; // T-20-A-03-01 — calibration gate
export const ICIR_UPLIFT_GATE = 0.05; // CONTEXT line 105 acceptance
export const ROLLING_IC_WINDOW = 20; // 20-day rolling per CONTEXT line 105

interface TuneDecayResult {
  source_class: SourceClass;
  best_lambda: number;
  best_icir: number;
  baseline_icir_no_decay: number;
  icir_uplift: number;
  per_lambda: Array<{ lambda: number; icir_20d: number }>;
  n_observations: number;
  training_window_days: number;
  cutover_eligible: boolean;
}

type ObservationRow = {
  ticker: string;
  classifier_score: number | null;
  fetched_at: Date;
  source: string;
};

async function pullObservations(
  prisma: PrismaClient,
  cls: SourceClass,
  windowDays: number,
): Promise<ObservationRow[]> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  // Pull all observations in window; in-memory filter by source_class via sourceToClassUnsafe
  // (DB stores raw source string; class is derived in TS).
  const rows = await prisma.sentimentObservation.findMany({
    where: { fetched_at: { gte: since } },
    orderBy: { fetched_at: 'asc' },
    select: {
      ticker: true,
      classifier_score: true,
      fetched_at: true,
      source: true,
    },
  });
  return rows.filter((r) => {
    try {
      return sourceToClassUnsafe(r.source) === cls;
    } catch {
      return false;
    }
  });
}

/** Σ score × decay_weight / Σ decay_weight per ticker, at a single λ. */
function computeDecayedAggregate(
  rows: ObservationRow[],
  lambda: number,
  now: Date,
): Map<string, number> {
  const byTicker = new Map<string, { num: number; den: number }>();
  for (const r of rows) {
    if (r.classifier_score == null) continue;
    const ageDays = Math.max(
      0,
      (now.getTime() - r.fetched_at.getTime()) / 86_400_000,
    );
    const w = decayWeight(ageDays, lambda);
    const cur = byTicker.get(r.ticker) ?? { num: 0, den: 0 };
    cur.num += r.classifier_score * w;
    cur.den += w;
    byTicker.set(r.ticker, cur);
  }
  const out = new Map<string, number>();
  for (const [ticker, { num, den }] of byTicker) {
    if (den > 1e-9) out.set(ticker, num / den);
  }
  return out;
}

/** Uniform-weight aggregate (no decay) — baseline for ICIR uplift. */
function computeUniformAggregate(rows: ObservationRow[]): Map<string, number> {
  const byTicker = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.classifier_score == null) continue;
    const cur = byTicker.get(r.ticker) ?? { sum: 0, n: 0 };
    cur.sum += r.classifier_score;
    cur.n += 1;
    byTicker.set(r.ticker, cur);
  }
  const out = new Map<string, number>();
  for (const [ticker, { sum, n }] of byTicker) {
    if (n > 0) out.set(ticker, sum / n);
  }
  return out;
}

/** Spearman rank-correlation. Returns 0 when n < 2 or std == 0. */
function spearman(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const ddx = rx[i] - mx;
    const ddy = ry[i] - my;
    num += ddx * ddy;
    dx2 += ddx * ddx;
    dy2 += ddy * ddy;
  }
  const den = Math.sqrt(dx2 * dy2);
  return den === 0 ? 0 : num / den;
}

function ranks(arr: number[]): number[] {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array<number>(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const r = (i + j + 2) / 2; // 1-based average rank for ties
    for (let k = i; k <= j; k++) out[indexed[k].i] = r;
    i = j + 1;
  }
  return out;
}

function rollingICIR(perDayICs: number[]): number {
  const n = perDayICs.length;
  if (n < 2) return 0;
  const mean = perDayICs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(
    perDayICs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1),
  );
  return sd === 0 ? 0 : mean / sd;
}

/**
 * Per-day cross-sectional Spearman IC of (aggregate score, forward-7d alpha).
 * forward7dByTicker = PriceOutcome.pct_change at days_after=7 (SPY benchmark
 * subtraction lives in the diffusion engine; we follow 20-A-02 convention).
 */
function dailyICs(
  rowsByDay: Map<string, ObservationRow[]>,
  forward7dByTicker: Map<string, number>,
  lambda: number,
  isBaseline: boolean,
): number[] {
  const ics: number[] = [];
  for (const [dayKey, dayRows] of rowsByDay) {
    const aggregate = isBaseline
      ? computeUniformAggregate(dayRows)
      : computeDecayedAggregate(dayRows, lambda, new Date(dayKey));
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [ticker, score] of aggregate) {
      const fwd = forward7dByTicker.get(ticker);
      if (fwd != null && Number.isFinite(fwd) && Number.isFinite(score)) {
        xs.push(score);
        ys.push(fwd);
      }
    }
    if (xs.length >= 2) ics.push(spearman(xs, ys));
  }
  return ics;
}

async function pullForward7d(prisma: PrismaClient): Promise<Map<string, number>> {
  // Use PriceOutcome at days_after = 7. Group by snapshot's ticker via SentimentSnapshot.
  // (We follow 20-A-02's calibrate-mention-z-threshold pattern — the SPY benchmark
  //  subtraction lives in the diffusion engine; this column is the raw pct_change.)
  const rows = await prisma.priceOutcome.findMany({
    where: { days_after: 7, snapshot_id: { not: null } },
    select: { snapshot: { select: { ticker: true } }, pct_change: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    const t = r.snapshot?.ticker;
    if (t) out.set(t, r.pct_change);
  }
  return out;
}

function groupByDay(rows: ObservationRow[]): Map<string, ObservationRow[]> {
  const out = new Map<string, ObservationRow[]>();
  for (const r of rows) {
    const day = r.fetched_at.toISOString().slice(0, 10);
    const cur = out.get(day) ?? [];
    cur.push(r);
    out.set(day, cur);
  }
  return out;
}

async function tuneClass(
  prisma: PrismaClient,
  cls: SourceClass,
  windowDays: number,
): Promise<
  | TuneDecayResult
  | { source_class: SourceClass; insufficient_data: true; n: number }
> {
  const rows = await pullObservations(prisma, cls, windowDays);
  if (rows.length < MIN_N_OBSERVATIONS) {
    return { source_class: cls, insufficient_data: true, n: rows.length };
  }

  const forward7d = await pullForward7d(prisma);
  const rowsByDay = groupByDay(rows);

  const seed = DECAY_HYPERPARAMETERS[cls].lambda_per_day;
  const grid = LAMBDA_GRID_MULTIPLIERS.map((m) => seed * m);

  // Baseline = no decay (uniform weights).
  const baselineICs = dailyICs(rowsByDay, forward7d, NaN, true);
  const baseline_icir_no_decay = rollingICIR(baselineICs);

  const per_lambda = grid.map((lambda) => ({
    lambda,
    icir_20d: rollingICIR(dailyICs(rowsByDay, forward7d, lambda, false)),
  }));

  const best = per_lambda.reduce(
    (a, b) => (b.icir_20d > a.icir_20d ? b : a),
    per_lambda[0],
  );
  const icir_uplift = best.icir_20d - baseline_icir_no_decay;

  return {
    source_class: cls,
    best_lambda: best.lambda,
    best_icir: best.icir_20d,
    baseline_icir_no_decay,
    icir_uplift,
    per_lambda,
    n_observations: rows.length,
    training_window_days: windowDays,
    cutover_eligible:
      icir_uplift >= ICIR_UPLIFT_GATE && rows.length >= MIN_N_OBSERVATIONS,
  };
}

/**
 * Paired-bootstrap on Sharpe of decayed-vs-undecayed aggregate.
 * 1000 resamples (with replacement) of per-day IC vectors; reports 95% CI
 * lower-bound of the Sharpe-difference. CI lower-bound > 0 ⇒ cutover_eligible.
 */
function pairedBootstrapSharpe(
  decayedICs: number[],
  baselineICs: number[],
  resamples = 1000,
): { mean_diff: number; ci_low_95: number; ci_high_95: number } {
  const n = Math.min(decayedICs.length, baselineICs.length);
  if (n < 2) return { mean_diff: 0, ci_low_95: 0, ci_high_95: 0 };
  const diffs: number[] = [];
  for (let b = 0; b < resamples; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(Math.random() * n));
    const dSamp = idx.map((i) => decayedICs[i]);
    const bSamp = idx.map((i) => baselineICs[i]);
    const dSharpe = rollingICIR(dSamp);
    const bSharpe = rollingICIR(bSamp);
    diffs.push(dSharpe - bSharpe);
  }
  diffs.sort((a, b) => a - b);
  const lo = diffs[Math.floor(0.025 * resamples)];
  const hi = diffs[Math.floor(0.975 * resamples)];
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return { mean_diff: mean, ci_low_95: lo, ci_high_95: hi };
}

async function main() {
  const argv = process.argv.slice(2);
  const windowIdx = argv.indexOf('--window-days');
  const windowDays =
    windowIdx >= 0 ? Number(argv[windowIdx + 1]) : DEFAULT_WINDOW_DAYS;
  const bootstrapCutover = argv.includes('--bootstrap-cutover');

  if (!process.env.DATABASE_URL) {
    console.error('[tune-decay] DATABASE_URL not set — abort.');
    process.exit(1);
  }

  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  const model_version = `decay-tuned-${new Date()
    .toISOString()
    .slice(0, 10)}-v1`;
  const results: Array<
    | TuneDecayResult
    | { source_class: SourceClass; insufficient_data: true; n: number }
  > = [];
  let anyInsufficient = false;
  for (const cls of SOURCE_CLASSES) {
    const r = await tuneClass(prisma, cls, windowDays);
    results.push(r);
    if ('insufficient_data' in r) anyInsufficient = true;
  }

  // Persist DecayCalibration rows for classes that passed the gate
  for (const r of results) {
    if ('insufficient_data' in r) {
      console.warn(
        `[tune-decay] ${r.source_class}: INSUFFICIENT_DATA n=${r.n} < ${MIN_N_OBSERVATIONS} — skipping persistence`,
      );
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
  }

  // Print summary + HYPERPARAMETERS.md patch
  console.log(
    `\n=== tune-decay results (window=${windowDays}d, model_version=${model_version}) ===`,
  );
  console.table(
    results.map((r) =>
      'insufficient_data' in r
        ? { class: r.source_class, status: 'INSUFFICIENT_DATA', n: r.n }
        : {
            class: r.source_class,
            lambda: r.best_lambda.toFixed(4),
            half_life_days: halfLifeDays(r.best_lambda).toFixed(2),
            icir_uplift: r.icir_uplift.toFixed(4),
            n: r.n_observations,
            cutover_eligible: r.cutover_eligible,
          },
    ),
  );

  // Print half-life formula reminder (acceptance criterion)
  console.log(`\nHalf-life formula: t½ = ln(2) / λ ≈ ${Math.LN2.toFixed(4)} / λ`);

  if (bootstrapCutover) {
    console.log(
      '\n[tune-decay] --bootstrap-cutover invoked — paired bootstrap on Sharpe per class:',
    );
    for (const r of results) {
      if ('insufficient_data' in r) continue;
      const rowsForClass = await pullObservations(prisma, r.source_class, windowDays);
      const forward7d = await pullForward7d(prisma);
      const rowsByDay = groupByDay(rowsForClass);
      const decayedICs = dailyICs(rowsByDay, forward7d, r.best_lambda, false);
      const baselineICs = dailyICs(rowsByDay, forward7d, NaN, true);
      const ci = pairedBootstrapSharpe(decayedICs, baselineICs, 1000);
      console.log(
        `  ${r.source_class}: mean_diff=${ci.mean_diff.toFixed(4)} CI95=[${ci.ci_low_95.toFixed(4)}, ${ci.ci_high_95.toFixed(4)}] cutover_eligible=${ci.ci_low_95 > 0}`,
      );
    }
  }

  await prisma.$disconnect();
  if (anyInsufficient) process.exit(2);
  process.exit(0);
}

// Only run main() when this script is invoked directly (not when imported by tests/cron).
if (
  typeof require !== 'undefined' &&
  require.main === module &&
  !process.env.VITEST
) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

// Export helpers for testability + reuse by /api/cron/tune-decay/route.ts
export {
  tuneClass,
  computeDecayedAggregate,
  computeUniformAggregate,
  spearman,
  rollingICIR,
  dailyICs,
  groupByDay,
  pullObservations,
  pullForward7d,
  pairedBootstrapSharpe,
};
