/**
 * Plan 20-B-04 — Source-tier weighting (data-driven, capped softmax of per-source IC).
 *
 * PHASE 22 Wave 3 extension (D-06, D-07, D-09):
 *   - getWeightForSource extended to (source_id, regime, asOf) with D-09 3-step
 *     cold-start chain.  Read-time path does NOT apply EB shrinkage; the
 *     write-time path (scripts/recompute-source-tiers.ts) is the only producer
 *     of regime-conditional weights, so shrinkage runs there ONCE per cell and
 *     gets persisted on the SourceTier row.  Double-applying shrinkage would
 *     bias every read toward the unconditional row by an extra λ-pass.
 *   - shrinkSourceIcEmpiricalBayes is a Beta-Binomial conjugate shrinkage of a
 *     regime-sliced IC toward the unconditional `(source, 'ALL')` IC.  Mirrors
 *     `hierarchicalPooledPosterior` (learning.ts:158) clamp pattern verbatim.
 *
 * Per RESEARCH §F Pitfall 2: the recompute order is `IC → shrink → softmax`,
 * NEVER `IC → softmax → shrink`.  shrinkSourceIcEmpiricalBayes operates on
 * per-source IC scalars; the resulting `IC_shrunk` vector is what gets fed
 * into softmaxWithCaps per regime.
 *
 * Three exports (pre-Wave 3):
 *   - softmaxWithCaps(values, cap_min, cap_max) — pure; numerically stable softmax + clamp.
 *     IMPORTANT: clamped softmax is NOT a probability distribution; it is a bounded
 *     weighting. Callers must NOT assume Σ weights = 1.
 *   - computeSourceWeights(rows) — pure; partitions cold-start vs eligible, runs softmax
 *     over eligible, defaults cold-start to weight=1.0.
 *   - getWeightForSource(source_id, asOf) — async DB read of latest SourceTier row;
 *     cold-start fallback returns 1.0 verbatim (NEVER throws).
 *
 * Wave 3 additions:
 *   - getWeightForSource(source_id, regime, asOf) — extended D-09 chain.
 *   - shrinkSourceIcEmpiricalBayes({regime_ic, regime_n, unconditional_ic, lambda_min, lambda_max})
 *
 * Threat T-20-B-04-04 enforcement: NO env-var override path. Weights come from SourceTier
 * rows ONLY. CI grep guard at .github/workflows/no-hand-curated-tier-weights.yml fails the
 * build on the explicit override-token names.
 */
import {
  SOURCE_TIER_HYPERPARAMETERS,
  type SourceTierConfig,
} from './source-tier-hyperparameters';
import type { RegimeLabel } from '@/lib/regime/types';

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

// ─── PHASE 22 Wave 3 — D-07 Empirical-Bayes shrinkage ─────────────────────────
/**
 * Shrink a regime-sliced source IC toward the unconditional `(source, 'ALL')` IC
 * via a Beta-Binomial conjugate update. Mirrors the λ-clamp pattern from
 * `hierarchicalPooledPosterior` at `src/lib/learning.ts:181`.
 *
 *   shrunk_ic = (regime_n * regime_ic + λ * unconditional_ic) / (regime_n + λ)
 *
 * where λ is clamped to [eb_shrinkage_lambda_min, eb_shrinkage_lambda_max].
 *
 * In practice:
 *   - regime_n == 0  →  shrunk_ic === unconditional_ic (full pooling)
 *   - regime_n >> λ  →  shrunk_ic ≈ regime_ic (signal-rich; regime-specific dominates)
 *   - regime_n ≈ λ   →  midpoint between regime_ic and unconditional_ic
 *
 * The lambda formula `clamp(unconditional_n / max(1, var(IC_{s,r}) / n_{s,r}), λ_min, λ_max)`
 * specified in 22-PLAN §F line 147 collapses to a constant when the cron has not
 * yet measured `var(IC_{s,r})` — the cron passes a pre-computed λ from `lambda`
 * when it has variance data; otherwise λ is the clamp midpoint by default. The
 * helper signature accepts an explicit `lambda` so the caller (the recompute cron)
 * controls the precise statistic.
 *
 * `shrinkage_strength` is returned as λ / (regime_n + λ) ∈ [0, 1] — 1 = full
 * pooling toward unconditional, 0 = no shrinkage applied. This is the canonical
 * "fraction of weight assigned to the prior" reported in the EB literature
 * (Efron-Morris 1973) and persisted on the SourceTier row for audit.
 *
 * Pure function — no DB access, no module-level state. The recompute cron is the
 * sole caller in production; tests exercise it directly.
 */
export interface ShrinkIcInputs {
  /** Mean IC over the (source, regime) slice — null treated as 0 by convention (no signal). */
  regime_ic: number;
  /** Observation count in the (source, regime) slice. 0 → full pooling. */
  regime_n: number;
  /** Mean IC over (source, 'ALL') — the EB prior target. */
  unconditional_ic: number;
  /** Optional explicit λ override.  Defaults to clamp midpoint when omitted. */
  lambda?: number;
  /** Floor for λ.  Defaults to SOURCE_TIER_HYPERPARAMETERS.eb_shrinkage_lambda_min. */
  lambda_min?: number;
  /** Ceiling for λ.  Defaults to SOURCE_TIER_HYPERPARAMETERS.eb_shrinkage_lambda_max. */
  lambda_max?: number;
}

export interface ShrinkIcResult {
  /** Shrunk IC ∈ between regime_ic and unconditional_ic. */
  shrunk_ic: number;
  /** λ / (regime_n + λ) ∈ [0, 1] — fraction of weight on the unconditional prior. */
  shrinkage_strength: number;
  /** λ actually used after clamp (audit). */
  lambda: number;
}

export function shrinkSourceIcEmpiricalBayes(
  args: ShrinkIcInputs,
): ShrinkIcResult {
  const lambda_min = args.lambda_min ?? SOURCE_TIER_HYPERPARAMETERS.eb_shrinkage_lambda_min;
  const lambda_max = args.lambda_max ?? SOURCE_TIER_HYPERPARAMETERS.eb_shrinkage_lambda_max;
  if (
    !Number.isFinite(lambda_min) ||
    !Number.isFinite(lambda_max) ||
    lambda_min <= 0 ||
    lambda_max <= lambda_min
  ) {
    throw new Error(
      `shrinkSourceIcEmpiricalBayes: invalid clamps (min=${lambda_min}, max=${lambda_max})`,
    );
  }
  // Default λ = midpoint when no explicit value provided (the cron computes
  // its own λ from `n_ALL / max(1, var(IC_{s,r}) / n_{s,r})` per RESEARCH §F).
  const rawLambda = args.lambda ?? (lambda_min + lambda_max) / 2;
  if (!Number.isFinite(rawLambda)) {
    throw new Error(
      `shrinkSourceIcEmpiricalBayes: non-finite lambda override (${rawLambda})`,
    );
  }
  const lambda = Math.min(lambda_max, Math.max(lambda_min, rawLambda));

  const regime_n = Math.max(0, args.regime_n);
  const regime_ic = Number.isFinite(args.regime_ic) ? args.regime_ic : 0;
  const unconditional_ic = Number.isFinite(args.unconditional_ic)
    ? args.unconditional_ic
    : 0;

  const denom = regime_n + lambda;
  // denom > 0 always (lambda >= lambda_min > 0).
  const shrunk_ic = (regime_n * regime_ic + lambda * unconditional_ic) / denom;
  const shrinkage_strength = lambda / denom;
  return { shrunk_ic, shrinkage_strength, lambda };
}

// ─── PHASE 22 Wave 3 — D-06 + D-09 getWeightForSource extension ───────────────
/**
 * Read-only fetch of the most-recent SourceTier row matching
 * `(source_id, regime, computed_at <= asOf)`. Used by both the regime-specific
 * and the unconditional ('ALL') fall-through steps of the D-09 chain.
 *
 * Returns `null` when no row exists OR when the DB is unreachable / table missing.
 * Callers convert `null` to the next fall-through (regime → 'ALL' → 1.0).
 *
 * Extracted from the chain body for testability — the D-09 chain becomes
 * three explicit calls with explicit fall-through semantics.
 */
async function getMostRecentSourceTierRow(
  source_id: string,
  regime: RegimeLabel,
  asOf: Date,
): Promise<{ weight: number } | null> {
  try {
    // Lazy import — keep this module unit-testable without DATABASE_URL.
    const { prisma } = await import('@/lib/db');
    const row = await prisma.sourceTier.findFirst({
      where: { source_id, regime, computed_at: { lte: asOf } },
      orderBy: { computed_at: 'desc' },
      select: { weight: true },
    });
    return row ?? null;
  } catch {
    // Defensive: if DB is unreachable or table missing, fall through. Operator-
    // side telemetry (20-Z-03) catches DB error rate.
    return null;
  }
}

/**
 * Reads latest SourceTier row with `computed_at <= asOf` for the given
 * `(source_id, regime)` pair.  D-09 cold-start chain (Wave 3):
 *
 *   1. SourceTier row matching `(source_id, regime, asOf)` — regime-specific.
 *   2. Fall through to `(source_id, 'ALL', asOf)` — unconditional baseline
 *      (the row that already exists for every source as of Wave 0 + the
 *      `'ALL'` row Wave 3 cron writes per recompute cycle).
 *   3. Fall through to `1.0` — full cold-start (NEVER throws).
 *
 * IMPORTANT (Pitfall 2 in 22-RESEARCH §F): the read path does NOT apply EB
 * shrinkage.  Shrinkage is applied ONCE at write-time by the recompute cron
 * and persisted on the SourceTier row.  Re-applying shrinkage at read-time
 * would double-bias every read toward the unconditional row.
 *
 * The chain exits on first hit — no extra round-trips fired for nothing.
 * Pre-fetching both `(source, regime)` AND `(source, 'ALL')` in parallel would
 * waste a DB call in the common case (regime-specific row exists).
 */
export async function getWeightForSource(
  source_id: string,
  regime: RegimeLabel,
  asOf: Date,
): Promise<number> {
  // D-09 step 1 — regime-specific row.
  if (regime !== 'ALL') {
    const regimeRow = await getMostRecentSourceTierRow(source_id, regime, asOf);
    if (regimeRow) return regimeRow.weight;
  }
  // D-09 step 2 — unconditional 'ALL' row (the row Wave 3 cron writes per cycle).
  const allRow = await getMostRecentSourceTierRow(source_id, 'ALL', asOf);
  if (allRow) return allRow.weight;
  // D-09 step 3 — full cold-start.
  return 1.0;
}
