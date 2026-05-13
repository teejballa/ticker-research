// @model-card: docs/cards/MODEL-CARD-per-aspect-aggregate.md
/**
 * Plan 20-B-05 — per-aspect sentiment aggregator (pure functions).
 *
 * Replaces the single global `aggregated_bull_pct` chip with a per-aspect chip
 * stack (Earnings 75% · Guidance 50% · Regulatory '—' · ...). Groups per-doc
 * polarity scores from the 20-B-01 Gemini classifier by AspectTag and computes
 * a Beta-smoothed weighted-mean bull% per aspect.
 *
 * Inter-aspect overlap is INTENTIONAL per CONTEXT.md line 113 ("Inter-aspect
 * overlap allowed") — a doc with two aspects contributes to BOTH per-aspect
 * aggregates. This is NOT double-counting; it is the correct representation
 * of multi-aspect docs (T-20-B-05-02 mitigation).
 *
 * Beta-prior strength (α = β = 5) is the post-Phase-19 carry-over —
 * a Cookson-style weak symmetric prior equivalent to 10 pseudo-observations
 * (5 bull + 5 bear) before any data. Same formula shape as
 * src/lib/sentiment/aggregator.ts.
 *
 * Insufficient-signal sentinel: `bull_pct == null` when n_docs < N_DOCS_MIN.
 * UI renders the em-dash '—' rather than '0%' (T-20-B-05-03 — empty data must
 * not be communicated as zero bullishness).
 */

import { ASPECT_TAGS, type AspectTag } from '@/lib/sentiment/aspects';

/** Fixed aspect taxonomy from 20-B-01 (CONTEXT.md line 113). */
export const ASPECT_TAXONOMY: readonly AspectTag[] = ASPECT_TAGS;

/** N_DOCS_MIN = 3 — fewer than 3 docs ⇒ insufficient signal ⇒ bull_pct = null. */
export const N_DOCS_MIN = 3;

/** Beta prior strength α = β = 5 — post-Phase-19 carry-over (Cookson-style weak symmetric prior). */
export const BETA_ALPHA = 5;
export const BETA_BETA = 5;

/**
 * Per-doc result from 20-B-01's Gemini per-document classification pass.
 * polarity ∈ [-1, +1] (negative = bearish, positive = bullish, 0 = neutral).
 * confidence ∈ [0, 1] (used as the weight in Beta smoothing).
 * aspects can carry multiple tags — overlap is INTENTIONAL per T-20-B-05-02.
 */
export interface PerDocResult {
  doc_id: string;
  polarity: number;
  confidence: number;
  aspects: AspectTag[];
}

/**
 * Per-aspect aggregate, one entry per AspectTag in ASPECT_TAXONOMY.
 * bull_pct == null ⇒ insufficient signal (n_docs < N_DOCS_MIN) — UI renders '—'.
 */
export interface PerAspectResult {
  aspect: AspectTag;
  bull_pct: number | null;
  n_docs: number;
  confidence_mean: number;
}

/**
 * Beta-smoothed weighted bull% — same formula as the post-Phase-19 multi-source
 * aggregator (src/lib/sentiment/aggregator.ts).
 *
 *   bull_contrib = weight * max(0,  polarity)
 *   bear_contrib = weight * max(0, -polarity)
 *   posterior_mean = (α + Σ bull) / (α + β + Σ bull + Σ bear)
 *   bull_pct       = clamp(posterior_mean * 100, [0, 100])
 *
 * Returns null when scores.length === 0 (empty input sentinel). Callers MUST
 * also gate on N_DOCS_MIN — `aggregateByAspect` enforces this.
 */
export function betaSmoothedBullPct(
  scores: { polarity: number; weight: number }[],
  alpha: number = BETA_ALPHA,
  beta: number = BETA_BETA,
): number | null {
  if (!scores || scores.length === 0) return null;
  let sumBull = 0;
  let sumBear = 0;
  for (const s of scores) {
    const w = Number.isFinite(s.weight) && s.weight > 0 ? s.weight : 0;
    const p = Number.isFinite(s.polarity) ? Math.max(-1, Math.min(1, s.polarity)) : 0;
    if (p > 0) sumBull += w * p;
    else if (p < 0) sumBear += w * -p;
    // p == 0 contributes neither — pure neutral.
  }
  const denom = alpha + beta + sumBull + sumBear;
  if (denom <= 0) return null;
  const posterior = (alpha + sumBull) / denom;
  const pct = posterior * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}

/**
 * Group per-doc results by AspectTag (overlap allowed) and compute per-aspect
 * Beta-smoothed bull%. Returns one entry per AspectTag in ASPECT_TAXONOMY,
 * even when n_docs == 0 (entry has bull_pct: null, n_docs: 0).
 *
 * Inter-aspect overlap is INTENTIONAL per CONTEXT.md line 113 — a doc with two
 * aspects contributes to BOTH per-aspect aggregates. This is NOT double-counting;
 * it is the correct representation of multi-aspect docs (T-20-B-05-02 mitigation).
 */
export function aggregateByAspect(perDocResults: PerDocResult[]): PerAspectResult[] {
  const input = Array.isArray(perDocResults) ? perDocResults : [];
  return ASPECT_TAXONOMY.map((aspect): PerAspectResult => {
    const contributing = input.filter(d =>
      Array.isArray(d.aspects) && d.aspects.includes(aspect),
    );
    const n_docs = contributing.length;
    const confidence_mean =
      n_docs === 0
        ? 0
        : contributing.reduce((s, d) => s + (Number.isFinite(d.confidence) ? d.confidence : 0), 0) /
          n_docs;
    if (n_docs < N_DOCS_MIN) {
      return { aspect, bull_pct: null, n_docs, confidence_mean };
    }
    const scores = contributing.map(d => ({
      polarity: d.polarity,
      weight: Math.max(0, Math.min(1, Number.isFinite(d.confidence) ? d.confidence : 0)),
    }));
    const bull_pct = betaSmoothedBullPct(scores);
    return { aspect, bull_pct, n_docs, confidence_mean };
  });
}
