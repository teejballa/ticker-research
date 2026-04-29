// src/lib/engine-context.ts
// Read-only snapshot of the Cipher learning engine's beliefs about a ticker
// at report-generation time. The returned object is the single contract every
// downstream component (Gemini prompt, EngineCalibrationPanel) reads from.
//
// No new math here — this layer composes existing primitives:
//   - computeDiffusionTrace + classifyCapClass from diffusion-trace.ts
//   - predictLogistic + credibleInterval95 + buildFeatureVector12 from learning.ts
//   - LearnedPattern / LogisticEpoch / LearningEvent / SentimentSnapshot from Prisma
//
// Phase 16 extension (16-04):
//   - Adds technical_* fields parallel to the diffusion fields, keyed on
//     (signal_class='technical', pattern_key=tech_pattern, cap_class, horizon_days=30)
//   - Adds horizon_calibrations[] — 6 entries × {3,7,14,30,60,90} days × both signal classes
//   - Adds agreement classification (deterministic, post-process safe)
//   - Adds combined_logistic_score from the 12-d Bayesian logistic
//
// The "trust boundary" sits here: numeric fields produced by this module are
// authoritative — Gemini cannot override them.

import { prisma } from '@/lib/db';
import {
  computeDiffusionTrace,
  classifyCapClass,
  type FlowPattern,
  type CapClass,
  type SnapshotInput,
} from './diffusion-trace';
import {
  predictLogistic,
  credibleInterval95,
  posteriorMean,
  patternStatus,
  buildFeatureVector12,
  FEATURE_NAMES,
  type LogisticState,
} from './learning';
import { lightweightCommunityScan } from './data/lightweight-community-scan';
import { computeTechnicalSnapshot } from './data/technical';
import type { TechPattern, TechnicalSnapshot, HorizonCalibration } from './types';

// Match the order used by /api/cron/learn (FEATURE_NAMES) for the 6-d diffusion
// logistic forward pass. Phase 16 introduces the 12-d combined logistic that uses
// FEATURE_NAMES from learning.ts directly.
export const ENGINE_FEATURE_NAMES = [
  'v_niche', 'v_middle', 'v_mainstream', 'niche_lead_cycles', 'q_z', 'qual_z',
] as const;

const HORIZONS = [3, 7, 14, 30, 60, 90] as const;
type Horizon = typeof HORIZONS[number];
type CellStatus = 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';

export interface EngineContext {
  // ── Trace classification at this moment ───────────────────────────────
  flow_pattern: FlowPattern | null;
  cap_class: CapClass;
  niche_lead_cycles: number;
  v_niche: number;
  v_middle: number;
  v_mainstream: number;
  q_z: number;
  qual_z: number;
  trace_window_size: number;

  // ── From LearnedPattern[diffusion × pattern × cap × 7d] ───────────────
  posterior_mean: number | null;
  ci_low: number | null;
  ci_high: number | null;
  posterior_30d_mean: number | null;
  sample_size: number;
  hits: number;
  status: CellStatus;
  brier_in_sample: number | null;
  brier_out_sample: number | null;
  brier_null: number | null;
  drift_z: number;

  // ── From latest LogisticEpoch (6-d diffusion-only forward pass) ───────
  logistic_score: number | null;
  logistic_ci_low: number | null;
  logistic_ci_high: number | null;
  feature_contributions: Array<{ feature: string; mu: number; contribution: number }>;
  logistic_brier_in: number | null;
  logistic_sample_size: number;

  // ── Engine meta ───────────────────────────────────────────────────────
  cycle_count: number;
  engine_first_run_at: Date | null;
  last_event_at: Date | null;

  // ── Prediction registration ───────────────────────────────────────────
  predicted_at: Date;
  prediction_id_seed: string;

  // ── Per-community alphas (Phase 2 stub — empty for now) ───────────────
  community_alphas: Array<{
    community_name: string;
    posterior_mean: number;
    sample_size: number;
  }>;

  // ── Sparkline (last up-to-4 snapshots' tier_breakdown, oldest → newest)
  diffusion_sparkline: Array<{ niche: number; middle: number; mainstream: number; scanned_at: string }>;

  // ── Phase 16: Technical signal class (parallel to flow_pattern fields) ─
  technical_pattern: TechPattern | null;
  technical_posterior_mean: number | null;
  technical_ci: [number, number] | null;
  technical_sample_size: number;
  technical_status: CellStatus;

  // ── Phase 16: Horizon table — both signal classes per horizon ─────────
  horizon_calibrations: HorizonCalibration[];

  // ── Phase 16: 12-d logistic, trained on 30d ────────────────────────────
  combined_logistic_score: number | null;

  // ── Phase 16: Q3 agreement (Q1 vs Q2) ─────────────────────────────────
  agreement: 'aligned' | 'mixed' | 'opposed' | 'unknown';
}

function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

interface SnapshotCommunityData {
  quantity?: number;
  quality?: number;
  tier_breakdown?: { mainstream: number; middle: number; niche: number };
  highlights?: SnapshotInput['community_data']['highlights'];
  market_cap?: number | null;
  cap_class?: CapClass;
}

interface LearnedCellLike {
  alpha: number;
  beta: number;
  alpha_30d: number;
  beta_30d: number;
  sample_size: number;
  hits: number;
  brier_in_sample: number | null;
  brier_out_sample: number | null;
  brier_null: number | null;
  drift_z: number;
  status: string;
}

function deriveCellStatus(cell: LearnedCellLike | null): CellStatus {
  if (!cell) return 'NO_DATA';
  // Status comes from the learn cron (patternStatus); validate it's one of the known set.
  const s = cell.status;
  if (s === 'ACTIVE' || s === 'EXPLORATORY' || s === 'DEPRECATED') return s;
  return 'EXPLORATORY';
}

// Promote the higher-conviction status when reporting a row that aggregates
// both signal classes (used for the per-horizon row's overall status column).
function maxStatus(a: CellStatus, b: CellStatus): CellStatus {
  const order: Record<CellStatus, number> = {
    ACTIVE: 3,
    EXPLORATORY: 2,
    DEPRECATED: 1,
    NO_DATA: 0,
  };
  return order[a] >= order[b] ? a : b;
}

/**
 * Pure helper: agreement classification from RESEARCH §9 lines 446-450.
 *
 *   - 'aligned'  if (dP > 0.55 AND tP > 0.55) OR (dP < 0.45 AND tP < 0.45) AND both ACTIVE
 *   - 'opposed'  if (dP > 0.6 AND tP < 0.4) OR (dP < 0.4 AND tP > 0.6) AND both ACTIVE
 *   - 'mixed'    if both ACTIVE but neither aligned nor opposed
 *   - 'unknown'  if either status is NO_DATA, EXPLORATORY, or DEPRECATED
 *
 * Exported so unit tests can pin the deterministic boundaries without
 * spinning up the full Prisma stack.
 */
export function computeAgreement(
  dP: number | null,
  tP: number | null,
  dS: CellStatus,
  tS: CellStatus,
): 'aligned' | 'mixed' | 'opposed' | 'unknown' {
  if (dS !== 'ACTIVE' || tS !== 'ACTIVE' || dP == null || tP == null) return 'unknown';
  const bothBullish = dP > 0.55 && tP > 0.55;
  const bothBearish = dP < 0.45 && tP < 0.45;
  if (bothBullish || bothBearish) return 'aligned';
  if ((dP > 0.6 && tP < 0.4) || (dP < 0.4 && tP > 0.6)) return 'opposed';
  return 'mixed';
}

/**
 * Issue 12 findUnique queries (6 horizons × 2 signal classes) via Promise.all and
 * shape the result into the locked horizon_calibrations array.
 *
 * Each horizon row aggregates both signal classes into a single `status` (the
 * higher-conviction of the two) and a single `sample_size` (the max of the two).
 */
async function readHorizonCalibrations(
  flow_pattern: FlowPattern | null,
  techPattern: TechPattern | null,
  cap_class: CapClass,
): Promise<HorizonCalibration[]> {
  // Skip lookups for pattern_key that the engine never stores ('flat' for
  // diffusion is intentionally a no-op cell).
  const queryDiffusion = flow_pattern && flow_pattern !== 'flat';
  const queryTechnical = techPattern != null;

  const cellQueries = HORIZONS.flatMap((horizon) => {
    const diffusionPromise: Promise<LearnedCellLike | null> = queryDiffusion
      ? prisma.learnedPattern.findUnique({
          where: {
            signal_class_pattern_key_cap_class_horizon_days: {
              signal_class: 'diffusion',
              pattern_key: flow_pattern!,
              cap_class,
              horizon_days: horizon,
            },
          },
        }) as Promise<LearnedCellLike | null>
      : Promise.resolve(null);
    const technicalPromise: Promise<LearnedCellLike | null> = queryTechnical
      ? prisma.learnedPattern.findUnique({
          where: {
            signal_class_pattern_key_cap_class_horizon_days: {
              signal_class: 'technical',
              pattern_key: techPattern!,
              cap_class,
              horizon_days: horizon,
            },
          },
        }) as Promise<LearnedCellLike | null>
      : Promise.resolve(null);
    return [diffusionPromise, technicalPromise];
  });

  const cells = await Promise.all(cellQueries);

  return HORIZONS.map((horizon, i) => {
    const dCell = cells[i * 2];
    const tCell = cells[i * 2 + 1];

    const dPosterior = dCell ? posteriorMean({ alpha: dCell.alpha, beta: dCell.beta }) : null;
    const dCi = dCell ? credibleInterval95({ alpha: dCell.alpha, beta: dCell.beta }) : null;
    const tPosterior = tCell ? posteriorMean({ alpha: tCell.alpha, beta: tCell.beta }) : null;
    const tCi = tCell ? credibleInterval95({ alpha: tCell.alpha, beta: tCell.beta }) : null;

    const dStatus = deriveCellStatus(dCell);
    const tStatus = deriveCellStatus(tCell);

    return {
      horizon_days: horizon,
      diffusion_posterior: dPosterior,
      diffusion_ci: dCi ? [dCi.low, dCi.high] : null,
      technical_posterior: tPosterior,
      technical_ci: tCi ? [tCi.low, tCi.high] : null,
      sample_size: Math.max(dCell?.sample_size ?? 0, tCell?.sample_size ?? 0),
      status: maxStatus(dStatus, tStatus),
    } satisfies HorizonCalibration;
  });
}

export async function getEngineContextForTicker(
  ticker: string,
  asOf: Date,
): Promise<EngineContext> {
  const upperTicker = ticker.toUpperCase();

  // ── 1. Pull last 4 snapshots ────────────────────────────────────────
  let snaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: upperTicker, scanned_at: { lte: asOf } },
    orderBy: { scanned_at: 'desc' },
    take: 4,
  });

  // ── 2. Cold-start: ticker has no snapshots → trigger parallel one-shot scans ──
  // Phase 16 (Pitfall 6 mitigation): both sensors fire in parallel via Promise.all so
  // the first-ever-research-on-a-ticker path doesn't block on serial fetches.
  let coldStartTechSnap: TechnicalSnapshot | null = null;
  if (snaps.length === 0) {
    const [communityResult, techResult] = await Promise.all([
      lightweightCommunityScan(upperTicker).catch(() => null),
      computeTechnicalSnapshot(upperTicker).catch(() => null),
    ]);
    coldStartTechSnap = techResult;
    if (communityResult) {
      const created = await prisma.sentimentSnapshot.create({
        data: {
          ticker: upperTicker,
          scanned_at: asOf,
          price_at_scan: 0,
          community_data: communityResult as object,
        },
      });
      snaps = [created];
    }
  }

  // snaps come back desc; reverse to chronological for trace computation.
  const snapsAsc = [...snaps].reverse();

  // ── 3. Historical context for z-scoring (best effort) ───────────────
  const tickerHistory = await prisma.sentimentSnapshot.findMany({
    where: { ticker: upperTicker },
    select: { community_data: true },
    take: 50,
    orderBy: { scanned_at: 'desc' },
  });
  const histQuantity: number[] = [];
  const histQuality: number[] = [];
  for (const s of tickerHistory) {
    const cd = (s.community_data ?? {}) as SnapshotCommunityData;
    if (typeof cd.quantity === 'number' && Number.isFinite(cd.quantity)) histQuantity.push(cd.quantity);
    if (typeof cd.quality === 'number' && Number.isFinite(cd.quality)) histQuality.push(cd.quality);
  }

  // ── 4. Compute trace ────────────────────────────────────────────────
  const inputs: SnapshotInput[] = snapsAsc.map(s => ({
    scanned_at: s.scanned_at,
    community_data: (s.community_data ?? {}) as SnapshotInput['community_data'],
  }));
  const trace = inputs.length >= 2 ? computeDiffusionTrace(inputs, histQuantity, histQuality) : null;

  // Most-recent snapshot's stored cap_class wins; otherwise classify from market_cap.
  const mostRecent = snapsAsc[snapsAsc.length - 1]?.community_data as SnapshotCommunityData | undefined;
  const flow_pattern = trace?.flow_pattern ?? null;
  const cap_class: CapClass =
    trace?.cap_class
    ?? mostRecent?.cap_class
    ?? classifyCapClass(mostRecent?.market_cap ?? null);

  // ── 5. Compute live technical snapshot for the 12-d combined logistic forward
  // pass and the technical-cell lookup. Reuse the cold-start techSnap if we already
  // computed it; otherwise run it fresh (best-effort, null on fail).
  const techSnap: TechnicalSnapshot | null =
    coldStartTechSnap ?? (await computeTechnicalSnapshot(upperTicker).catch(() => null));
  const techPattern: TechPattern | null = techSnap?.tech_pattern ?? null;

  // ── 6. Look up diffusion LearnedPattern at the 7d primary horizon ────
  // Phase 16: composite key is (signal_class, pattern_key, cap_class, horizon_days).
  // 7d remains the diffusion primary horizon (preserves existing semantics).
  let diffusionCell: LearnedCellLike | null = null;
  if (flow_pattern && flow_pattern !== 'flat') {
    diffusionCell = (await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'diffusion',
          pattern_key: flow_pattern,
          cap_class,
          horizon_days: 7,
        },
      },
    })) as LearnedCellLike | null;
  }

  let posterior_mean: number | null = null;
  let ci_low: number | null = null;
  let ci_high: number | null = null;
  let posterior_30d_mean: number | null = null;
  if (diffusionCell) {
    const ci = credibleInterval95({ alpha: diffusionCell.alpha, beta: diffusionCell.beta });
    posterior_mean = ci.mean;
    ci_low = ci.low;
    ci_high = ci.high;
    const n30 = diffusionCell.alpha_30d + diffusionCell.beta_30d;
    posterior_30d_mean = n30 > 0 ? diffusionCell.alpha_30d / n30 : null;
  }

  // ── 7. Look up technical LearnedPattern at the 30d primary horizon ────
  // 30d is the LOCKED primary horizon for the technical signal class (it's also
  // the only horizon the 12-feature Bayesian logistic trains on).
  let technicalCell: LearnedCellLike | null = null;
  if (techPattern) {
    technicalCell = (await prisma.learnedPattern.findUnique({
      where: {
        signal_class_pattern_key_cap_class_horizon_days: {
          signal_class: 'technical',
          pattern_key: techPattern,
          cap_class,
          horizon_days: 30,
        },
      },
    })) as LearnedCellLike | null;
  }

  let technical_posterior_mean: number | null = null;
  let technical_ci: [number, number] | null = null;
  if (technicalCell) {
    const tci = credibleInterval95({ alpha: technicalCell.alpha, beta: technicalCell.beta });
    technical_posterior_mean = tci.mean;
    technical_ci = [tci.low, tci.high];
  }

  // ── 8. Latest LogisticEpoch + forward pass ──────────────────────────
  const lastEpoch = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  let logistic_score: number | null = null;
  let logistic_ci_low: number | null = null;
  let logistic_ci_high: number | null = null;
  let combined_logistic_score: number | null = null;
  const feature_contributions: EngineContext['feature_contributions'] = [];

  if (lastEpoch && trace) {
    const c = (lastEpoch.coefficients ?? {}) as Record<string, { mu: number; sigma: number }>;
    const x = [
      trace.v_niche,
      trace.v_middle,
      trace.v_mainstream,
      trace.niche_lead_cycles,
      trace.q_z,
      trace.qual_z,
    ];
    const state6: LogisticState = {
      intercept: lastEpoch.intercept,
      intercept_var: ((c['_intercept']?.sigma) ?? 1) ** 2,
      weights: ENGINE_FEATURE_NAMES.map(n => c[n]?.mu ?? 0),
      weight_vars: ENGINE_FEATURE_NAMES.map(n => (c[n]?.sigma ?? 1) ** 2),
      feature_names: [...ENGINE_FEATURE_NAMES],
    };
    logistic_score = predictLogistic(state6, x);

    // CI via propagated variance: var(z) = var(intercept) + Σ var(w_i) * x_i^2
    let varZ = state6.intercept_var;
    let z = state6.intercept;
    for (let i = 0; i < state6.weights.length; i++) {
      z += state6.weights[i] * x[i];
      varZ += state6.weight_vars[i] * x[i] * x[i];
      feature_contributions.push({
        feature: ENGINE_FEATURE_NAMES[i],
        mu: state6.weights[i],
        contribution: state6.weights[i] * x[i],
      });
    }
    const sd = Math.sqrt(Math.max(0, varZ));
    logistic_ci_low = sigmoid(z - 1.96 * sd);
    logistic_ci_high = sigmoid(z + 1.96 * sd);

    // Combined 12-d logistic forward pass (Phase 16). Only run when both sensors
    // are populated AND the persisted epoch has the 12-d shape — otherwise the
    // missing-key fallback (`c[n]?.mu ?? 0`) yields a degenerate score.
    if (techSnap) {
      const x12 = buildFeatureVector12(trace, techSnap, techPattern);
      const state12: LogisticState = {
        intercept: lastEpoch.intercept,
        intercept_var: ((c['_intercept']?.sigma) ?? 1) ** 2,
        weights: FEATURE_NAMES.map(n => c[n]?.mu ?? 0),
        weight_vars: FEATURE_NAMES.map(n => (c[n]?.sigma ?? 1) ** 2),
        feature_names: [...FEATURE_NAMES],
      };
      combined_logistic_score = predictLogistic(state12, x12);
    }
  }

  // ── 9. Horizon calibrations (12 cells: 6 horizons × 2 signal classes) ─
  const horizon_calibrations = await readHorizonCalibrations(flow_pattern, techPattern, cap_class);

  // ── 10. Engine meta ─────────────────────────────────────────────────
  const firstEvent = await prisma.learningEvent.findFirst({ orderBy: { occurred_at: 'asc' } });
  const lastEvent = await prisma.learningEvent.findFirst({ orderBy: { occurred_at: 'desc' } });

  // ── 11. Status ──────────────────────────────────────────────────────
  const status: CellStatus = deriveCellStatus(diffusionCell);
  const technical_status: CellStatus = deriveCellStatus(technicalCell);

  // ── 12. Sparkline ───────────────────────────────────────────────────
  const diffusion_sparkline: EngineContext['diffusion_sparkline'] = snapsAsc.map(s => {
    const cd = (s.community_data ?? {}) as SnapshotCommunityData;
    const tb = cd.tier_breakdown ?? { niche: 0, middle: 0, mainstream: 0 };
    return {
      niche: tb.niche ?? 0,
      middle: tb.middle ?? 0,
      mainstream: tb.mainstream ?? 0,
      scanned_at: s.scanned_at.toISOString(),
    };
  });

  // ── 13. Agreement (Q1 vs Q2) at the primary horizons ─────────────────
  // The agreement uses the diffusion 7d posterior + technical 30d posterior —
  // each signal class's *primary* horizon. computeAgreement gates on both
  // statuses being ACTIVE; otherwise returns 'unknown'.
  const agreement = computeAgreement(
    posterior_mean,
    technical_posterior_mean,
    status,
    technical_status,
  );

  return {
    flow_pattern,
    cap_class,
    niche_lead_cycles: trace?.niche_lead_cycles ?? 0,
    v_niche: trace?.v_niche ?? 0,
    v_middle: trace?.v_middle ?? 0,
    v_mainstream: trace?.v_mainstream ?? 0,
    q_z: trace?.q_z ?? 0,
    qual_z: trace?.qual_z ?? 0,
    trace_window_size: snapsAsc.length,

    posterior_mean,
    ci_low,
    ci_high,
    posterior_30d_mean,
    sample_size: diffusionCell?.sample_size ?? 0,
    hits: diffusionCell?.hits ?? 0,
    status,
    brier_in_sample: diffusionCell?.brier_in_sample ?? null,
    brier_out_sample: diffusionCell?.brier_out_sample ?? null,
    brier_null: diffusionCell?.brier_null ?? null,
    drift_z: diffusionCell?.drift_z ?? 0,

    logistic_score,
    logistic_ci_low,
    logistic_ci_high,
    feature_contributions,
    logistic_brier_in: lastEpoch?.brier_in ?? null,
    logistic_sample_size: lastEpoch?.sample_size ?? 0,

    cycle_count: lastEpoch?.epoch ?? 0,
    engine_first_run_at: firstEvent?.occurred_at ?? null,
    last_event_at: lastEvent?.occurred_at ?? null,

    predicted_at: asOf,
    prediction_id_seed: `${upperTicker}-${asOf.toISOString()}`,

    community_alphas: [],
    diffusion_sparkline,

    technical_pattern: techPattern,
    technical_posterior_mean,
    technical_ci,
    technical_sample_size: technicalCell?.sample_size ?? 0,
    technical_status,

    horizon_calibrations,
    combined_logistic_score,
    agreement,
  };
}

// Internal helpers re-exported for the unit-test surface only. Production
// callers should use getEngineContextForTicker — these are unstable.
export const __internal = { patternStatus };
