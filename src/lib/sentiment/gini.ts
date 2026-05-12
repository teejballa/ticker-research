// @model-card: docs/cards/MODEL-CARD-author-gini.md
/**
 * Plan 20-A-04 — Gini coefficient + author-share helpers for the
 * author-concentration signal.
 *
 * PURE MATH ONLY. No Prisma imports, no IO. Callers (aggregator, calibration
 * script) pass already-loaded SentimentObservation-shaped rows; this module
 * never reads the DB.
 *
 * Three canonical Gini examples (literature):
 *   - uniform   → G = 0           (perfect equality, high diversity)
 *   - dominant  → G → 1           (one author dominates, crowded)
 *   - 50/50     → G = 0           (two equal authors)
 *
 * The formula (after sorting `values` ascending, x_1 ≤ … ≤ x_n):
 *
 *     G = (2 × Σ_{i=1..n} i × x_i) / (n × Σ x_i) − (n+1)/n
 *
 * Returns ∈ [0, 1]:
 *   - 0 = perfect equality
 *   - 1 = perfect concentration (asymptotic limit; for finite n the upper bound is (n-1)/n)
 *
 * PII discipline: callers SHALL pass already-hashed `author_id` values from
 * the SentimentObservation feature store (20-Z-01). `authorDisplayPrefix`
 * applies a defense-in-depth re-hash + truncation before any UI rendering.
 */
import { createHash } from 'crypto';

/**
 * Standard Gini coefficient.
 *
 * Edge cases:
 *   - Empty array → throws RangeError("giniCoefficient: empty input")
 *   - All zeros → throws RangeError("giniCoefficient: total=0")
 *   - Negative or non-finite values → throws RangeError
 *   - Single value → 0 (degenerate equality; the n_authors<5 sentinel in
 *     consumers handles meaningfulness)
 */
export function giniCoefficient(values: number[]): number {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError('giniCoefficient: empty input');
  }
  for (const v of values) {
    if (!Number.isFinite(v) || v < 0) {
      throw new RangeError(`giniCoefficient: invalid value ${v}; must be a finite non-negative number`);
    }
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const total = sorted.reduce((s, v) => s + v, 0);
  if (total === 0) {
    throw new RangeError('giniCoefficient: total=0');
  }
  // G = (2 × Σ i × x_i) / (n × Σ x_i) − (n+1)/n
  let weightedSum = 0;
  for (let i = 0; i < n; i++) weightedSum += (i + 1) * sorted[i];
  const g = (2 * weightedSum) / (n * total) - (n + 1) / n;
  // Numerical safety clamp — guards against tiny FP drift below 0 on uniform input.
  return Math.max(0, Math.min(1, g));
}

/** Minimal shape of a SentimentObservation row consumed by the aggregator. */
export interface MinimalObservation {
  author_id: string;
  classifier_score: number | null;
}

/**
 * Roll up SentimentObservation[] into per-author message counts.
 *
 * Uses `observation.author_id` directly — already sha256-hashed at the source
 * by 20-Z-01. Rows where `classifier_score === null` are SKIPPED because
 * those rows did not actually classify the message (insertObservation may
 * persist them for telemetry); counting them would inflate volume from
 * authors that produced unclassifiable noise.
 */
export function messageCountsByAuthor(
  observations: MinimalObservation[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const obs of observations) {
    if (obs.classifier_score === null) continue;
    counts.set(obs.author_id, (counts.get(obs.author_id) ?? 0) + 1);
  }
  return counts;
}

/** One entry in the author-share distribution (sorted DESC by share). */
export interface AuthorShare {
  /** Already sha256-hashed author id from 20-Z-01. */
  author_id: string;
  /** ∈ [0, 1]. */
  share: number;
  /** Raw message count for UI tooltips. */
  message_count: number;
}

/**
 * Author-share distribution sorted DESCENDING by share.
 * Returns [] when input is empty or total count is 0.
 */
export function authorShareDistribution(
  counts: Map<string, number>,
): AuthorShare[] {
  if (!counts || counts.size === 0) return [];
  let total = 0;
  for (const v of counts.values()) total += v;
  if (total === 0) return [];
  const entries: AuthorShare[] = [];
  for (const [author_id, message_count] of counts.entries()) {
    entries.push({
      author_id,
      share: message_count / total,
      message_count,
    });
  }
  entries.sort((a, b) => b.share - a.share);
  return entries;
}

/**
 * Sum of the top-N author shares.
 *   - Returns 0 when counts is empty.
 *   - When counts.size < n, sums all available shares (≤ 1.0).
 */
export function topNAuthorShare(
  counts: Map<string, number>,
  n: number,
): number {
  if (!counts || counts.size === 0 || n <= 0) return 0;
  const dist = authorShareDistribution(counts);
  if (dist.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < Math.min(n, dist.length); i++) sum += dist[i].share;
  return sum;
}

/**
 * Hash an author_id to its 8-char display prefix for UI rendering.
 *
 * `author_id` from 20-Z-01 is already sha256("{source}:{handle}"); this
 * function applies a defense-in-depth re-hash + truncate. Even if a raw
 * handle leaked into author_id upstream, what surfaces in the UI is the
 * first 8 hex chars of sha256(author_id) — never reversible back to a handle
 * within the feasible computational budget for an 8-char prefix-collision attack
 * against a single ticker's 24h window.
 *
 * Returns 8 lowercase hex characters.
 */
export function authorDisplayPrefix(author_id: string): string {
  return createHash('sha256').update(author_id, 'utf8').digest('hex').slice(0, 8);
}
