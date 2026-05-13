/**
 * Plan 20-B-04 — Source-tier weighting (data-driven, capped softmax of per-source IC).
 *
 * Three exports:
 *   - softmaxWithCaps(values, cap_min, cap_max) — pure; numerically stable softmax + clamp.
 *     IMPORTANT: clamped softmax is NOT a probability distribution; it is a bounded
 *     weighting. Callers must NOT assume Σ weights = 1.
 *   - computeSourceWeights(rows) — pure; partitions cold-start vs eligible, runs softmax
 *     over eligible, defaults cold-start to weight=1.0.
 *   - getWeightForSource(source_id, asOf) — async DB read of latest SourceTier row;
 *     cold-start fallback returns 1.0 verbatim (NEVER throws).
 *
 * Threat T-20-B-04-04 enforcement: NO env-var override path. Weights come from SourceTier
 * rows ONLY. CI grep guard at .github/workflows/no-hand-curated-tier-weights.yml fails the
 * build on the explicit override-token names.
 */
import {
  SOURCE_TIER_HYPERPARAMETERS,
  type SourceTierConfig,
} from './source-tier-hyperparameters';

// NOTE: prisma is lazy-imported inside getWeightForSource() to keep this
// module unit-testable without DATABASE_URL set (mirrors the
// computeAuthorConcentration pattern in aggregator.ts).

export interface PerSourceICRow {
  source_id: string;
  mean_ic_90d: number | null;
  n_observations: number;
}

export interface SourceWeightRow {
  source_id: string;
  weight: number;
  is_cold_start: boolean;
}

/**
 * Numerically stable softmax with element-wise clamp to [cap_min, cap_max].
 *
 * Implementation: subtract max(values) before exp() to prevent overflow on
 * large positive ICs (rare but possible). Then divide by sum(exp). Then
 * multiply by N so a uniform softmax lands at 1.0 (the "neutral" weight),
 * then clamp.
 *
 * Multiplying by N before the clamp is the key bounded-WEIGHTING move:
 * without it, a uniform input would yield 1/N which would always hit the
 * cap_min floor on >2 sources — defeating the purpose of a softmax. The
 * "weight = 1.0 is average" convention is what makes the clamp meaningful.
 *
 * CLAMPED SOFTMAX IS NOT A PROBABILITY DISTRIBUTION — it is a bounded weighting.
 * The clamp ensures no source is fully suppressed (floor) or fully dominant (ceiling).
 */
export function softmaxWithCaps(
  values: number[],
  cap_min: number = SOURCE_TIER_HYPERPARAMETERS.cap_min,
  cap_max: number = SOURCE_TIER_HYPERPARAMETERS.cap_max,
): number[] {
  if (values.length === 0) {
    throw new Error(
      'softmaxWithCaps: input array is empty (caller bug — should filter beforehand)',
    );
  }
  if (
    !Number.isFinite(cap_min) ||
    !Number.isFinite(cap_max) ||
    cap_min <= 0 ||
    cap_max <= cap_min
  ) {
    throw new Error(
      `softmaxWithCaps: invalid caps (cap_min=${cap_min}, cap_max=${cap_max}); require 0 < cap_min < cap_max`,
    );
  }
  for (const v of values) {
    if (!Number.isFinite(v)) {
      throw new Error(`softmaxWithCaps: non-finite value in input (${v})`);
    }
  }
  const maxV = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - maxV));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  // sumExp >= 1 by construction (one term is exp(0) = 1), so no div-by-zero.
  const N = values.length;
  return exps.map((e) => {
    const w = (e / sumExp) * N; // softmax × N — "1.0 is average" convention
    return Math.min(cap_max, Math.max(cap_min, w));
  });
}

/**
 * Two-stage: cold-start sources default to weight=1.0; eligible sources go through
 * softmaxWithCaps over their mean_ic_90d values.
 *
 * Returns ALL sources (eligible + cold-start) so the caller can persist every row,
 * making the SourceTier history complete and audit-friendly.
 */
export function computeSourceWeights(
  rows: PerSourceICRow[],
  config?: Partial<SourceTierConfig>,
): SourceWeightRow[] {
  const cfg = { ...SOURCE_TIER_HYPERPARAMETERS, ...config };
  const eligible: PerSourceICRow[] = [];
  const coldStart: PerSourceICRow[] = [];
  for (const r of rows) {
    if (r.mean_ic_90d == null || r.n_observations < cfg.n_min_observations) {
      coldStart.push(r);
    } else {
      eligible.push(r);
    }
  }

  const result: SourceWeightRow[] = [];

  if (eligible.length > 0) {
    const weights = softmaxWithCaps(
      eligible.map((r) => r.mean_ic_90d as number),
      cfg.cap_min,
      cfg.cap_max,
    );
    eligible.forEach((r, i) => {
      result.push({
        source_id: r.source_id,
        weight: weights[i],
        is_cold_start: false,
      });
    });
  }

  for (const r of coldStart) {
    result.push({ source_id: r.source_id, weight: 1.0, is_cold_start: true });
  }

  return result;
}

/**
 * Reads latest SourceTier row with computed_at <= asOf for the given source_id.
 *
 * Cold-start fallback: returns 1.0 when no row exists (NEVER throws). Also returns
 * 1.0 when the DB is unreachable or the table is missing — operator-side telemetry
 * (20-Z-03) catches that error rate.
 */
export async function getWeightForSource(
  source_id: string,
  asOf: Date,
): Promise<number> {
  try {
    // Lazy import — keep this module unit-testable without DATABASE_URL
    // (db.ts throws at module load when DATABASE_URL is missing).
    const { prisma } = await import('@/lib/db');
    const row = await prisma.sourceTier.findFirst({
      where: { source_id, computed_at: { lte: asOf } },
      orderBy: { computed_at: 'desc' },
      select: { weight: true },
    });
    if (!row) return 1.0;
    return row.weight;
  } catch {
    // Defensive: if DB is unreachable or table missing, fall back to 1.0 rather than
    // crash the aggregator. Operator-side telemetry (20-Z-03) catches the error rate.
    return 1.0;
  }
}
