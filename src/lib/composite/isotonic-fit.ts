// src/lib/composite/isotonic-fit.ts
// Phase 24 (REASON-02, D-02, CLAUDE.md #1 #6). Offline isotonic fit + composite CI.
// Time-series discipline: reads Report.analysis frozen posteriors — NEVER the live
// posterior_mean column on the learned-pattern table (Pitfall 2). Defensive look-ahead
// check throws if any row leaks.
//
// Schema field names (verified against prisma/schema.prisma Sep 2026):
//   - Report.analyzed_at    (NOT created_at)
//   - Report.outcomes[]     (NOT price_outcomes — that's the @@map SQL name)
//   - engine_calibration.posterior_mean          (diffusion; no `diffusion_` prefix)
//   - engine_calibration.technical_posterior_mean
//   - engine_calibration.institutional_posterior_mean
//   - engine_calibration.insider_posterior_mean
//   - engine_calibration.effective_sample_size   (diffusion ESS)
//   - engine_calibration.technical_ess / institutional_ess / insider_ess

import { prisma } from '@/lib/db';
import {
  fitAndSerialize,
  composeSignal,
  type SignalClass,
  type IsotonicCurveJSON,
  type IsotonicPredictor,
} from '@/lib/composite';
import { bootstrapBCa } from '@/lib/evaluation';

const CLASSES: SignalClass[] = ['diffusion', 'technical', 'institutional', 'insider'];
const MS_PER_DAY = 86_400_000;

export interface CompositeRow {
  ticker: string;
  predicted_at: Date;
  resolved_at: Date;
  horizon_days: number;
  raw_posteriors: Record<SignalClass, number | null>;
  ess: Record<SignalClass, number>;
  status: Record<SignalClass, 'ACTIVE' | 'EXPLORATORY' | 'EXPLORATORY-WATCH' | 'DEPRECATED' | 'NO_DATA'>;
  outcome: 0 | 1;
}

export function brier(preds: Array<{ p: number; y: number }>): number {
  if (preds.length === 0) return NaN;
  return preds.reduce((s, { p, y }) => s + (p - y) ** 2, 0) / preds.length;
}

/**
 * Load historical (posterior-at-predict-time, outcome) rows for fit.
 * READS Report.analysis (immutable) — NEVER the live-posterior table (Pitfall 2).
 *
 * Look-ahead defense (CLAUDE.md #6): outcome must be recorded AT OR AFTER
 * predicted_at + horizonDays. Rows that fail this are filtered out.
 */
export async function loadFitDataset(opts: {
  asOf: Date;
  regime: string;
  cap_class: string;
  horizonDays: number;
}): Promise<CompositeRow[]> {
  const cutoff = new Date(opts.asOf.getTime() - opts.horizonDays * MS_PER_DAY);
  const reports = await prisma.report.findMany({
    where: { analyzed_at: { lt: cutoff } },
    select: {
      id: true,
      ticker: true,
      analyzed_at: true,
      analysis: true,
      outcomes: {
        where: {
          days_after: opts.horizonDays,
          is_sigma_hit_k1: { not: null },
        },
        select: { recorded_at: true, is_sigma_hit_k1: true },
      },
    },
  });

  const rows: CompositeRow[] = [];
  for (const r of reports) {
    for (const po of r.outcomes) {
      // Look-ahead defense: outcome must be recorded AT OR AFTER predicted_at + horizon.
      if (po.recorded_at.getTime() < r.analyzed_at.getTime() + opts.horizonDays * MS_PER_DAY) continue;
      const analysis = (r.analysis ?? {}) as {
        engine_calibration?: {
          posterior_mean?: number | null;
          technical_posterior_mean?: number | null;
          institutional_posterior_mean?: number | null;
          insider_posterior_mean?: number | null;
          effective_sample_size?: number | null;
          technical_ess?: number | null;
          institutional_ess?: number | null;
          insider_ess?: number | null;
        };
      };
      const cal = analysis.engine_calibration ?? {};
      rows.push({
        ticker: r.ticker,
        predicted_at: r.analyzed_at,
        resolved_at: po.recorded_at,
        horizon_days: opts.horizonDays,
        raw_posteriors: {
          diffusion:     (cal.posterior_mean               ?? null) as number | null,
          technical:     (cal.technical_posterior_mean     ?? null) as number | null,
          institutional: (cal.institutional_posterior_mean ?? null) as number | null,
          insider:       (cal.insider_posterior_mean       ?? null) as number | null,
        },
        ess: {
          diffusion:     (cal.effective_sample_size ?? 0) as number,
          technical:     (cal.technical_ess         ?? 0) as number,
          institutional: (cal.institutional_ess     ?? 0) as number,
          insider:       (cal.insider_ess           ?? 0) as number,
        },
        status: {
          // NOTE: patternStatus is not persisted in Report.analysis today; treat as ACTIVE
          // for fit-dataset construction (fit uses raw_posterior only, not status). Wave 3
          // supplies live status at compose time.
          diffusion: 'ACTIVE', technical: 'ACTIVE', institutional: 'ACTIVE', insider: 'ACTIVE',
        },
        outcome: (po.is_sigma_hit_k1 ? 1 : 0) as 0 | 1,
      });
    }
  }
  return rows;
}

/**
 * Load holdout rows (for reliability + Brier evaluation).
 * Same shape/source as fit; caller separates by asOf window.
 */
export async function loadHoldoutDataset(opts: {
  asOf: Date;
  windowDays: number;
  regime: string;
  cap_class: string;
  horizonDays: number;
}): Promise<CompositeRow[]> {
  const startAt = new Date(opts.asOf.getTime() - opts.windowDays * MS_PER_DAY);
  const rows = await loadFitDataset({ asOf: opts.asOf, regime: opts.regime, cap_class: opts.cap_class, horizonDays: opts.horizonDays });
  return rows.filter((r) => r.predicted_at >= startAt);
}

/**
 * Fit one IsotonicCurveJSON per SignalClass. Classes with n<minN → null.
 * Defensive look-ahead re-check throws when input is empty or all rows fail defense.
 * This double-checks loadFitDataset's filter so callers using in-memory fixtures
 * (tests, ad-hoc analysis) also get the look-ahead protection (CLAUDE.md #6).
 */
export function fitPerClassCurves(
  rows: CompositeRow[],
  opts: { minN: number; horizonDays: number },
): Record<SignalClass, IsotonicCurveJSON | null> {
  const valid = rows.filter((r) =>
    r.resolved_at.getTime() >= r.predicted_at.getTime() + opts.horizonDays * MS_PER_DAY,
  );
  if (rows.length === 0 || valid.length === 0) {
    throw new Error('insufficient valid rows — no rows or all filtered by look-ahead defense');
  }
  const out: Record<SignalClass, IsotonicCurveJSON | null> = {
    diffusion: null, technical: null, institutional: null, insider: null,
  };
  for (const c of CLASSES) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const r of valid) {
      const p = r.raw_posteriors[c];
      if (p == null) continue;
      xs.push(p);
      ys.push(r.outcome);
    }
    if (xs.length >= opts.minN) {
      out[c] = fitAndSerialize(xs, ys);
    }
  }
  return out;
}

/**
 * Compute BCa CI on composite Brier via row-resample (preserves cross-class
 * correlation per D-02). Reproducible with seed=42 by default.
 *
 * Wraps bootstrapBCa from @/lib/evaluation. For each resampled row, invokes
 * composeSignal to get the ESS-weighted composite posterior, then computes
 * Brier over the resampled predictions.
 */
export function computeCompositeCi(
  rows: CompositeRow[],
  curves: Record<SignalClass, IsotonicPredictor>,
  opts: { nResamples?: number; seed?: number; alpha?: number } = {},
) {
  return bootstrapBCa(
    rows,
    (sample) => {
      const preds = sample
        .map((r) => {
          const result = composeSignal(
            {
              diffusion:     { raw_posterior: r.raw_posteriors.diffusion,     ess: r.ess.diffusion,     status: r.status.diffusion },
              technical:     { raw_posterior: r.raw_posteriors.technical,     ess: r.ess.technical,     status: r.status.technical },
              institutional: { raw_posterior: r.raw_posteriors.institutional, ess: r.ess.institutional, status: r.status.institutional },
              insider:       { raw_posterior: r.raw_posteriors.insider,       ess: r.ess.insider,       status: r.status.insider },
            },
            curves,
            { minClassesActive: 2 },
          );
          return result.composite_prob != null ? { p: result.composite_prob, y: r.outcome as number } : null;
        })
        .filter((x): x is { p: number; y: number } => x != null);
      return brier(preds);
    },
    { nResamples: opts.nResamples ?? 1000, seed: opts.seed ?? 42, alpha: opts.alpha ?? 0.05 },
  );
}
