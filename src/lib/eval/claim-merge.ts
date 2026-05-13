// src/lib/eval/claim-merge.ts
//
// Plan 20-D-02 — pure bag-of-words helpers + mergeClaimSets.
//
// bagOfWords: deterministic, lowercase, strip non-alphanumeric, drop stopwords.
// cosineBagOfWords: cosine similarity on the bag vectors.
// mergeClaimSets: dedupe across (regex, llm) claim sets by cosine > 0.85,
//   keeping the LOWER start_char on collision (positional stability). Output
//   is stable-sorted by (section, start_char) for deterministic test runs.

import { COSINE_DEDUPE_THRESHOLD, type Claim } from './citation-coverage.types';

const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for',
  'at', 'by', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
  'could', 'can', 'may', 'might', 'this', 'that', 'these', 'those', 'it', 'its',
  'they', 'them', 'their', 'there', 'here',
]);

/**
 * Lowercase, split on non-alphanumerics, drop stopwords, count remaining tokens.
 * Empty / whitespace input returns an empty map.
 */
export function bagOfWords(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    m.set(raw, (m.get(raw) ?? 0) + 1);
  }
  return m;
}

/**
 * Cosine similarity between two bag-of-words vectors. Returns 0 when either
 * input is empty so an empty claim never matches anything.
 */
export function cosineBagOfWords(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, va] of a) {
    na += va * va;
    const vb = b.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  for (const vb of b.values()) nb += vb * vb;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Merge regex + LLM claim sets:
 *   - Stamp source_method: claims appearing in BOTH become 'merged'; otherwise
 *     keep the originating method tag.
 *   - Dedupe by cosine > COSINE_DEDUPE_THRESHOLD (0.85). On collision, keep the
 *     claim with the LOWER start_char (positional stability).
 *   - Stable-sort by (section, start_char).
 */
export function mergeClaimSets(regex: Claim[], llm: Claim[]): Claim[] {
  type Tagged = { c: Claim; vec: Map<string, number> };
  const tag = (c: Claim): Tagged => ({ c, vec: bagOfWords(c.text) });

  const regexT = regex.map(tag);
  const llmT = llm.map(tag);

  const out: Tagged[] = [];

  const pushOrMerge = (t: Tagged, asMerged: boolean) => {
    // Find an existing item in the same section whose cosine exceeds threshold.
    for (let i = 0; i < out.length; i++) {
      if (out[i].c.section !== t.c.section) continue;
      if (cosineBagOfWords(out[i].vec, t.vec) > COSINE_DEDUPE_THRESHOLD) {
        // Existing collision: keep the lower start_char; mark as merged.
        if (t.c.start_char < out[i].c.start_char) {
          out[i] = { c: { ...t.c, source_method: 'merged' }, vec: t.vec };
        } else {
          out[i] = { c: { ...out[i].c, source_method: 'merged' }, vec: out[i].vec };
        }
        return;
      }
    }
    out.push({ c: { ...t.c, source_method: asMerged ? 'merged' : t.c.source_method }, vec: t.vec });
  };

  for (const t of regexT) pushOrMerge(t, false);
  for (const t of llmT) pushOrMerge(t, false);

  const claims = out.map((t) => t.c);
  // Stable sort: section alpha, then start_char ascending.
  claims.sort((a, b) => {
    if (a.section < b.section) return -1;
    if (a.section > b.section) return 1;
    return a.start_char - b.start_char;
  });
  return claims;
}
