// @model-card: docs/cards/MODEL-CARD-bot-filter.md
//
// Plan 20-C-03 — Cresci-2019 bot filter (per-author heuristics).
//
// Cited thresholds from Cresci et al. 2019 §3.2 + Nam & Yang 2023 §4.1:
//   account_age_days < 30      → 'young_account'
//   max pairwise cosine > 0.5  → 'high_self_similarity'
//   max pump density > 0.1     → 'pump_density'
//   max hashtag count > 5      → 'hashtag_spam'
//
// These are LITERAL thresholds with citations (S1 hand-pick exemption: cited
// from peer-reviewed sources whose corpus matches Cipher's). Calibration on
// production-labeled data is gated by the 100-author FP eval in
// scripts/eval-bot-fp.ts — the threshold values are reaffirmed when FP ≤ 5%
// on that labeled set; otherwise the model card §"Maintenance" requires
// recalibration via HYPERPARAMETERS.md update + 20-Z-01 model_version bump.

export const PUMP_PHRASES: readonly string[] = [
  'to the moon',
  'rocket',
  '100x',
  'moonshot',
  'bagholder',
  'yolo',
  'tendies',
  'rip',
  'lambo',
] as const;

export const MIN_ACCOUNT_AGE_DAYS = 30;
export const MAX_SELF_SIMILARITY = 0.5;
export const MAX_PUMP_DENSITY = 0.1;
export const MAX_HASHTAG_COUNT = 5;

export type CresciReason =
  | 'young_account'
  | 'high_self_similarity'
  | 'pump_density'
  | 'hashtag_spam'
  | 'clean';

export interface CresciAuthorInput {
  account_age_days: number;
  messages: string[];
  hashtag_counts: number[];
}

export interface CresciAuthorResult {
  is_bot: boolean;
  reason: CresciReason;
  features: {
    account_age_days: number;
    max_text_cosine_similarity: number;
    pump_phrase_density: number;
    hashtag_count_max: number;
  };
}

/** 4-gram character shingle set. Lowercased + whitespace-collapsed for stability. */
function shingles4(text: string): Map<string, number> {
  const s = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const m = new Map<string, number>();
  if (s.length < 4) return m;
  for (let i = 0; i <= s.length - 4; i++) {
    const k = s.slice(i, i + 4);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * TF-IDF cosine on character 4-gram shingles. Raw term-frequency vectors
 * (no IDF — IDF is unstable on tiny corpora of 2 docs); matches
 * scikit-learn's `CountVectorizer + cosine_similarity` on single-pair inputs.
 * Identical multisets → 1.0; disjoint vocab → 0.0.
 */
export function textCosineSimilarity(a: string, b: string): number {
  const A = shingles4(a);
  const B = shingles4(b);
  if (A.size === 0 || B.size === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, va] of A) {
    const vb = B.get(k) ?? 0;
    dot += va * vb;
    na += va * va;
  }
  for (const vb of B.values()) nb += vb * vb;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function pumpPhraseDensity(
  text: string,
  phrases: readonly string[] = PUMP_PHRASES,
): number {
  const lower = text.toLowerCase();
  const tokens = lower.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const p of phrases) {
    const needle = p.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(needle, idx)) !== -1) {
      hits++;
      idx += Math.max(needle.length, 1);
    }
  }
  return hits / tokens.length;
}

function maxPairwiseCosine(messages: string[]): number {
  if (messages.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < messages.length; i++) {
    for (let j = i + 1; j < messages.length; j++) {
      const c = textCosineSimilarity(messages[i], messages[j]);
      if (c > max) max = c;
    }
  }
  return max;
}

export function cresciBotScore(input: CresciAuthorInput): CresciAuthorResult {
  const max_text_cosine_similarity = maxPairwiseCosine(input.messages);
  let max_pump_density = 0;
  for (const m of input.messages) {
    const d = pumpPhraseDensity(m);
    if (d > max_pump_density) max_pump_density = d;
  }
  const hashtag_count_max =
    input.hashtag_counts.length === 0 ? 0 : Math.max(...input.hashtag_counts);

  const features = {
    account_age_days: input.account_age_days,
    max_text_cosine_similarity,
    pump_phrase_density: max_pump_density,
    hashtag_count_max,
  };

  // First-match enum order: young → similarity → pump → hashtag → clean.
  if (input.account_age_days < MIN_ACCOUNT_AGE_DAYS) {
    return { is_bot: true, reason: 'young_account', features };
  }
  if (max_text_cosine_similarity > MAX_SELF_SIMILARITY) {
    return { is_bot: true, reason: 'high_self_similarity', features };
  }
  if (max_pump_density > MAX_PUMP_DENSITY) {
    return { is_bot: true, reason: 'pump_density', features };
  }
  if (hashtag_count_max > MAX_HASHTAG_COUNT) {
    return { is_bot: true, reason: 'hashtag_spam', features };
  }
  return { is_bot: false, reason: 'clean', features };
}
