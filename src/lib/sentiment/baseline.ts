// @model-card: docs/cards/MODEL-CARD-mention-baseline.md
/**
 * Plan 20-A-02 — Robust mention-volume baseline (median + MAD).
 *
 * Replaces the GME-era heuristic `stocktwits_is_trending = Math.abs(sentiment_change) > 0.5`
 * with a calibrated, per-ticker volume z-score derived from a rolling 90-day median + MAD
 * baseline of daily mention counts in the new SentimentObservation table (20-Z-01).
 * Stratified by cap_class so micro/small caps don't drown in the large-cap baseline.
 *
 * Why median + MAD over mean + std:
 *   Meme-stock spikes (GME 2021: +1000% mention volume in 2 days) contaminate the variance
 *   estimator, so a single spike day inflates the standard deviation and SUPPRESSES future
 *   spike-detection. The median + median-absolute-deviation pair is robust — 50%+ of the
 *   data must change before either estimator moves.
 *
 * Why 1.4826 scaling:
 *   MAD = median(|x_i − median(x)|) is asymptotically consistent for ~0.6745σ on
 *   N(0, σ²) data (Rousseeuw & Croux 1993, "Alternatives to the Median Absolute Deviation",
 *   JASA 88:424). Multiplying by 1/0.6745 ≈ 1.4826 makes MAD_scaled a consistent estimator
 *   of σ — which lets downstream z-score thresholds (Z = 2.0 ≈ 95th percentile under
 *   normal-equivalent scaling) keep their usual frequentist interpretation while the
 *   underlying estimator stays robust to outliers.
 *
 * Pure functions (medianAndMAD, mentionZScore, getZThresh) — no DB IO.
 * getBaselineForTicker performs a single indexed lookup against MentionBaseline.
 */

import type { CapClass } from '@/lib/diffusion-trace';
import fs from 'node:fs';
import path from 'node:path';

/** Source-class buckets for baseline stratification.
 *  Maps SentimentObservation.source → coarser-grained class to keep baselines stable
 *  (per-source baselines would be too sparse for new tickers).
 */
export type SourceClass = 'community' | 'news' | 'sec';

export const SOURCE_TO_CLASS: Record<string, SourceClass> = {
  stocktwits: 'community',
  reddit: 'community',
  x: 'community',
  twitter: 'community',
  hackernews: 'community',
  apewisdom: 'community',
  news: 'news',
  sec: 'sec',
};

/** Minimum daily-count observations required before a baseline is considered usable.
 *  Below this, getBaselineForTicker returns null and consumers fall back to legacy.
 *  Source: standard practice for empirical-Bayes / robust-statistics — n = 30 is the
 *  classical "central limit theorem kicks in" threshold.
 */
export const MIN_OBSERVATIONS_FOR_BASELINE = 30;

/** EPSILON floor on MAD to prevent division by zero on perfectly-stable tickers.
 *  Set to 1.0 mention/day — i.e. a ticker whose 90d std-equivalent is < 1 mention
 *  is treated AS IF its noise floor is 1 mention/day. Documented constant, not tuned.
 *  Mitigates T-20-A-02-02 (MAD = 0 → ±Infinity z-score).
 */
export const MAD_EPSILON = 1.0;

/** Literature default Z threshold (≈ 95th percentile of N(0,1) ≈ 1.96, rounded). */
export const Z_THRESH_LITERATURE_DEFAULT = 2.0;

/**
 * Robust median + MAD with the standard 1.4826 normal-equivalent scaling constant
 * (Rousseeuw & Croux 1993, JASA 88:424). MAD = median(|x_i − median(x)|), then
 * MAD_scaled = 1.4826 × MAD is a consistent estimator of σ on N(0,σ²) data.
 *
 * Empty input → { median: 0, mad: 0 }. Caller MUST gate via MIN_OBSERVATIONS_FOR_BASELINE
 * before computing a z-score on the result.
 */
export function medianAndMAD(counts: number[]): { median: number; mad: number } {
  if (!counts || counts.length === 0) return { median: 0, mad: 0 };
  const sorted = [...counts].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n % 2 === 1
      ? sorted[Math.floor(n / 2)]
      : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  const deviations = sorted.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  const m = deviations.length;
  const mad_raw =
    m % 2 === 1
      ? deviations[Math.floor(m / 2)]
      : (deviations[m / 2 - 1] + deviations[m / 2]) / 2;

  // 1.4826 ≈ 1/Φ⁻¹(0.75) — Rousseeuw & Croux 1993 normal-equivalent scaling.
  const mad = 1.4826 * mad_raw;
  return { median, mad };
}

/**
 * (today_count − baseline.median) / max(baseline.mad, MAD_EPSILON)
 *
 * The EPSILON floor (= 1.0 mention/day) is the documented MAD = 0 mitigation for
 * T-20-A-02-02. Without it, a ticker whose 90d MAD is 0 (e.g. always exactly
 * 7 mentions/day) would yield ±Infinity for any deviation from median — a
 * downstream NaN landmine.
 */
export function mentionZScore(
  today_count: number,
  baseline: { median: number; mad: number },
): number {
  // T-20-A-02-02 — EPSILON guard on MAD = 0.
  const denom = Math.max(baseline.mad, MAD_EPSILON);
  return (today_count - baseline.median) / denom;
}

/**
 * Reads the latest MentionBaseline row for (ticker, source_class) where
 * computed_at <= asOf. Returns null when:
 *   - no row exists, OR
 *   - the latest row has n_observations < MIN_OBSERVATIONS_FOR_BASELINE.
 *
 * Caller convention: null → fall back to legacy is_trending_v1 (preserves
 * behavior for new tickers / sparse-data tickers per T-20-A-02-01).
 *
 * Lazy prisma import keeps unit-test callers without DATABASE_URL working
 * (same pattern as crowded-consensus-config.ts).
 */
export async function getBaselineForTicker(
  ticker: string,
  source_class: SourceClass,
  asOf: Date,
): Promise<{ median: number; mad: number; n_observations: number } | null> {
  const { prisma } = await import('@/lib/db');
  const row = await prisma.mentionBaseline.findFirst({
    where: {
      ticker,
      source_class,
      computed_at: { lte: asOf },
    },
    orderBy: { computed_at: 'desc' },
  });
  if (!row) return null;
  if (row.n_observations < MIN_OBSERVATIONS_FOR_BASELINE) return null;
  return {
    median: row.mention_count_median,
    mad: row.mention_count_mad,
    n_observations: row.n_observations,
  };
}

// ─── Z_thresh per-cap_class loader (reads HYPERPARAMETERS.md once, caches) ───

let cachedZThresh: Map<string, number> | null = null;
const warnedClasses = new Set<string>();

/**
 * Parses the `## Z_thresh per cap_class (Plan 20-A-02)` block in HYPERPARAMETERS.md.
 * Looks for the markdown table after that heading and extracts numeric values from
 * the `Z_thresh` column for `large_cap | mid_cap | small_cap | unknown` rows.
 *
 * Returns an empty Map on any parse failure or missing file — getZThresh then
 * falls back to Z_THRESH_LITERATURE_DEFAULT for every class (defensive fallback
 * for fresh-clone / pre-calibration state).
 */
function loadZThreshTable(): Map<string, number> {
  const out = new Map<string, number>();
  try {
    const filepath = path.resolve(process.cwd(), 'HYPERPARAMETERS.md');
    if (!fs.existsSync(filepath)) return out;
    const content = fs.readFileSync(filepath, 'utf-8');
    const sectionMatch = content.match(
      /##\s*Z_thresh per cap_class \(Plan 20-A-02\)([\s\S]*?)(?=\n##\s|$)/,
    );
    if (!sectionMatch) return out;
    const section = sectionMatch[1];
    // Match rows like:  | large_cap  | 2.5  | 0.07 | 0.01 | 120 |
    const rowRegex =
      /\|\s*(large_cap|mid_cap|small_cap|unknown)\s*\|\s*([0-9]*\.?[0-9]+)\s*\|/g;
    let m: RegExpExecArray | null;
    while ((m = rowRegex.exec(section)) !== null) {
      const cap = m[1];
      const z = parseFloat(m[2]);
      if (Number.isFinite(z)) out.set(cap, z);
    }
  } catch {
    // Defensive — any read/parse error falls through to empty Map.
  }
  return out;
}

/**
 * Returns the calibrated Z_thresh for a given cap_class. Falls back to
 * Z_THRESH_LITERATURE_DEFAULT (= 2.0) when:
 *   - HYPERPARAMETERS.md is missing or malformed
 *   - the requested cap_class is not in the table (warns once per class)
 *
 * Per S1 (no hand-picked parameters): the table itself MUST be produced by
 * scripts/calibrate-mention-z-threshold.ts via grid search; the literature
 * default seeds the search but is NOT the persisted answer.
 */
export function getZThresh(cap_class: CapClass): number {
  if (cachedZThresh == null) {
    cachedZThresh = loadZThreshTable();
  }
  const v = cachedZThresh.get(cap_class);
  if (v != null) return v;
  if (!warnedClasses.has(cap_class)) {
    warnedClasses.add(cap_class);
    console.warn(
      `[baseline] Z_thresh for cap_class=${cap_class} not found in HYPERPARAMETERS.md; ` +
        `falling back to literature default Z=${Z_THRESH_LITERATURE_DEFAULT}`,
    );
  }
  return Z_THRESH_LITERATURE_DEFAULT;
}

/** Test-only: clear the in-process cache. Used by unit tests that mutate HYPERPARAMETERS.md. */
export function _resetZThreshCacheForTests(): void {
  cachedZThresh = null;
  warnedClasses.clear();
}
