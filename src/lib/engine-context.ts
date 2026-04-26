// src/lib/engine-context.ts
// Read-only snapshot of the Cipher learning engine's beliefs about a ticker
// at report-generation time. The returned object is the single contract every
// downstream component (Gemini prompt, EngineCalibrationPanel) reads from.
//
// No new math here — this layer composes existing primitives:
//   - computeDiffusionTrace + classifyCapClass from diffusion-trace.ts
//   - predictLogistic + credibleInterval95 from learning.ts
//   - LearnedPattern / LogisticEpoch / LearningEvent / SentimentSnapshot from Prisma
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
  type LogisticState,
} from './learning';
import { lightweightCommunityScan } from './data/lightweight-community-scan';

// Match the order used by /api/cron/learn (FEATURE_NAMES) so logistic forward
// passes line up with persisted coefficients.
export const ENGINE_FEATURE_NAMES = [
  'v_niche', 'v_middle', 'v_mainstream', 'niche_lead_cycles', 'q_z', 'qual_z',
] as const;

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

  // ── From LearnedPattern[flow_pattern × cap_class] ─────────────────────
  posterior_mean: number | null;
  ci_low: number | null;
  ci_high: number | null;
  posterior_30d_mean: number | null;
  sample_size: number;
  hits: number;
  status: 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';
  brier_in_sample: number | null;
  brier_out_sample: number | null;
  brier_null: number | null;
  drift_z: number;

  // ── From latest LogisticEpoch ─────────────────────────────────────────
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

  // ── 2. Cold-start: ticker has no snapshots → trigger one-shot scan ──
  if (snaps.length === 0) {
    try {
      const live = await lightweightCommunityScan(upperTicker);
      if (live) {
        const created = await prisma.sentimentSnapshot.create({
          data: {
            ticker: upperTicker,
            scanned_at: asOf,
            price_at_scan: 0,
            community_data: live as object,
          },
        });
        snaps = [created];
      }
    } catch {
      // Cold-start scrape may fail (no FIRECRAWL_API_KEY, network); status will be NO_DATA.
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

  // ── 5. Look up LearnedPattern (only when pattern is informative) ────
  let cell: Awaited<ReturnType<typeof prisma.learnedPattern.findUnique>> = null;
  if (flow_pattern && flow_pattern !== 'flat') {
    cell = await prisma.learnedPattern.findUnique({
      where: { flow_pattern_cap_class: { flow_pattern, cap_class } },
    });
  }

  let posterior_mean: number | null = null;
  let ci_low: number | null = null;
  let ci_high: number | null = null;
  let posterior_30d_mean: number | null = null;
  if (cell) {
    const ci = credibleInterval95({ alpha: cell.alpha, beta: cell.beta });
    posterior_mean = ci.mean;
    ci_low = ci.low;
    ci_high = ci.high;
    const n30 = cell.alpha_30d + cell.beta_30d;
    posterior_30d_mean = n30 > 0 ? cell.alpha_30d / n30 : null;
  }

  // ── 6. Latest LogisticEpoch + forward pass ──────────────────────────
  const lastEpoch = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  let logistic_score: number | null = null;
  let logistic_ci_low: number | null = null;
  let logistic_ci_high: number | null = null;
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
    const state: LogisticState = {
      intercept: lastEpoch.intercept,
      intercept_var: ((c['_intercept']?.sigma) ?? 1) ** 2,
      weights: ENGINE_FEATURE_NAMES.map(n => c[n]?.mu ?? 0),
      weight_vars: ENGINE_FEATURE_NAMES.map(n => (c[n]?.sigma ?? 1) ** 2),
      feature_names: [...ENGINE_FEATURE_NAMES],
    };
    logistic_score = predictLogistic(state, x);

    // CI via propagated variance: var(z) = var(intercept) + Σ var(w_i) * x_i^2
    let varZ = state.intercept_var;
    let z = state.intercept;
    for (let i = 0; i < state.weights.length; i++) {
      z += state.weights[i] * x[i];
      varZ += state.weight_vars[i] * x[i] * x[i];
      feature_contributions.push({
        feature: ENGINE_FEATURE_NAMES[i],
        mu: state.weights[i],
        contribution: state.weights[i] * x[i],
      });
    }
    const sd = Math.sqrt(Math.max(0, varZ));
    logistic_ci_low = sigmoid(z - 1.96 * sd);
    logistic_ci_high = sigmoid(z + 1.96 * sd);
  }

  // ── 7. Engine meta ──────────────────────────────────────────────────
  const firstEvent = await prisma.learningEvent.findFirst({ orderBy: { occurred_at: 'asc' } });
  const lastEvent = await prisma.learningEvent.findFirst({ orderBy: { occurred_at: 'desc' } });

  // ── 8. Status ───────────────────────────────────────────────────────
  const status: EngineContext['status'] = !cell
    ? 'NO_DATA'
    : (cell.status as 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED');

  // ── 9. Sparkline ────────────────────────────────────────────────────
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
    sample_size: cell?.sample_size ?? 0,
    hits: cell?.hits ?? 0,
    status,
    brier_in_sample: cell?.brier_in_sample ?? null,
    brier_out_sample: cell?.brier_out_sample ?? null,
    brier_null: cell?.brier_null ?? null,
    drift_z: cell?.drift_z ?? 0,

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
  };
}
