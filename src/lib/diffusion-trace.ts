// src/lib/diffusion-trace.ts
// Pure functions for computing sentiment-diffusion traces from a sequence of
// SentimentSnapshot rows. No DB access here — caller passes data in.

export type CapClass = 'large_cap' | 'mid_cap' | 'small_cap' | 'unknown';
export type FlowPattern = 'niche_leads' | 'simultaneous' | 'mainstream_first' | 'flat';

export interface SnapshotInput {
  scanned_at: Date;
  community_data: {
    quantity?: number;
    quality?: number;
    tier_breakdown?: { mainstream: number; middle: number; niche: number };
    highlights?: Array<{
      community_name: string;
      community_type: 'mainstream' | 'middle' | 'niche';
      engagement_count?: number;
      engagement?: 'high' | 'medium' | 'low';
    }>;
    market_cap?: number | null;
    cap_class?: CapClass;
  };
}

export interface DiffusionTraceResult {
  v_niche: number;
  v_middle: number;
  v_mainstream: number;
  niche_lead_cycles: number;
  flow_pattern: FlowPattern;
  q_z: number;
  qual_z: number;
  cap_class: CapClass;
  source_count: number;
}

const ENGAGEMENT_WEIGHTS = { high: 3, medium: 2, low: 1 } as const;

export function classifyCapClass(marketCap: number | null | undefined): CapClass {
  if (marketCap == null || !Number.isFinite(marketCap)) return 'unknown';
  if (marketCap >= 10_000_000_000) return 'large_cap';
  if (marketCap >= 2_000_000_000) return 'mid_cap';
  return 'small_cap';
}

// Extract per-tier engagement count for a snapshot.
// Prefers raw counts from `highlights[i].engagement_count`; falls back to
// tier_breakdown weights from computeSentimentDimensions.
function tierEngagement(snap: SnapshotInput): { mainstream: number; middle: number; niche: number } {
  const cd = snap.community_data;
  if (cd.highlights && cd.highlights.length > 0) {
    const out = { mainstream: 0, middle: 0, niche: 0 };
    for (const h of cd.highlights) {
      const v = typeof h.engagement_count === 'number' && Number.isFinite(h.engagement_count)
        ? h.engagement_count
        : (h.engagement ? ENGAGEMENT_WEIGHTS[h.engagement] : 0);
      if (h.community_type in out) out[h.community_type] += v;
    }
    return out;
  }
  return cd.tier_breakdown ?? { mainstream: 0, middle: 0, niche: 0 };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function zScore(value: number, sample: number[]): number {
  const sd = std(sample);
  if (sd === 0) return 0;
  return (value - mean(sample)) / sd;
}

// Average velocity over the window: (last - first) / (cycles - 1)
// Returns 0 if fewer than 2 snapshots.
function velocity(values: number[]): number {
  if (values.length < 2) return 0;
  return (values[values.length - 1] - values[0]) / (values.length - 1);
}

// Detect cycle index where each tier first turned strictly positive
// (current cycle's level > previous cycle's level). Returns null if never.
function firstPositiveIndex(values: number[]): number | null {
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) return i;
  }
  return null;
}

export function classifyFlowPattern(args: {
  v_niche: number;
  v_middle: number;
  v_mainstream: number;
  niche_first_idx: number | null;
  middle_first_idx: number | null;
  mainstream_first_idx: number | null;
}): { flow_pattern: FlowPattern; niche_lead_cycles: number } {
  const { v_niche, v_middle, v_mainstream, niche_first_idx, mainstream_first_idx } = args;

  // Flat — no meaningful movement
  const epsilon = 0.5;
  if (Math.abs(v_niche) < epsilon && Math.abs(v_middle) < epsilon && Math.abs(v_mainstream) < epsilon) {
    return { flow_pattern: 'flat', niche_lead_cycles: 0 };
  }

  // No mainstream activity, niche has activity → niche leads strongly
  if (mainstream_first_idx === null && niche_first_idx !== null) {
    return { flow_pattern: 'niche_leads', niche_lead_cycles: 3 };
  }

  // No niche activity, mainstream has activity → mainstream first
  if (niche_first_idx === null && mainstream_first_idx !== null) {
    return { flow_pattern: 'mainstream_first', niche_lead_cycles: 0 };
  }

  // Both have first-positive cycles → compare order
  if (niche_first_idx !== null && mainstream_first_idx !== null) {
    const lead = mainstream_first_idx - niche_first_idx;
    if (lead >= 1) return { flow_pattern: 'niche_leads', niche_lead_cycles: lead };
    if (lead <= -1) return { flow_pattern: 'mainstream_first', niche_lead_cycles: 0 };
    return { flow_pattern: 'simultaneous', niche_lead_cycles: 0 };
  }

  return { flow_pattern: 'flat', niche_lead_cycles: 0 };
}

/**
 * Compute a diffusion trace from a chronological window of snapshots
 * (oldest → newest). Returns null if the window is too small (<2).
 *
 * `historicalQuantity` and `historicalQuality` are arrays of past values
 * (across many cycles) for z-score normalization within ticker history.
 */
export function computeDiffusionTrace(
  snapshots: SnapshotInput[],
  historicalQuantity: number[],
  historicalQuality: number[],
): DiffusionTraceResult | null {
  if (snapshots.length < 2) return null;

  const ordered = [...snapshots].sort((a, b) => a.scanned_at.getTime() - b.scanned_at.getTime());

  const niche = ordered.map(s => tierEngagement(s).niche);
  const middle = ordered.map(s => tierEngagement(s).middle);
  const mainstream = ordered.map(s => tierEngagement(s).mainstream);

  const v_niche = velocity(niche);
  const v_middle = velocity(middle);
  const v_mainstream = velocity(mainstream);

  const { flow_pattern, niche_lead_cycles } = classifyFlowPattern({
    v_niche, v_middle, v_mainstream,
    niche_first_idx: firstPositiveIndex(niche),
    middle_first_idx: firstPositiveIndex(middle),
    mainstream_first_idx: firstPositiveIndex(mainstream),
  });

  const lastQuantity = ordered[ordered.length - 1].community_data.quantity ?? 0;
  const lastQuality = ordered[ordered.length - 1].community_data.quality ?? 0;
  const q_z = zScore(lastQuantity, historicalQuantity);
  const qual_z = zScore(lastQuality, historicalQuality);

  // cap_class: prefer the most recent snapshot's stored cap_class; else classify from market_cap
  const last = ordered[ordered.length - 1].community_data;
  const cap_class: CapClass = last.cap_class ?? classifyCapClass(last.market_cap);

  return {
    v_niche, v_middle, v_mainstream,
    niche_lead_cycles, flow_pattern,
    q_z, qual_z,
    cap_class,
    source_count: ordered.length,
  };
}
