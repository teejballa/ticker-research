// src/lib/sentiment/aspects.ts
// Plan 20-B-01 — fixed 7-element AspectTag taxonomy (CONTEXT.md line 113).
//
// Single source of truth — re-exported via src/lib/types.ts. 20-B-05 will import
// from this file when it lands. The Zod enum in src/lib/gemini-analysis.ts
// (per_document_sentiment field) and the classifier in
// src/lib/sentiment/per-doc-classifier.ts both lock against this literal.
//
// Order is significant — UI chip rendering in 20-B-05 iterates this array.
// Adding an aspect REQUIRES a NEW prompt version (v2) + new SentimentObservation
// model_version partition + a model card update (S2 immutability). Deletions are
// FORBIDDEN — they would break historical SentimentObservation rows.

/** Fixed 7-element taxonomy from CONTEXT.md line 113. */
export const ASPECT_TAGS = [
  'earnings',
  'guidance',
  'regulatory',
  'M&A',
  'macro',
  'product',
  'management',
] as const;

export type AspectTag = typeof ASPECT_TAGS[number];

/** Runtime type guard — used by the classifier's one-retry fallback path
 *  and by 20-B-05's aggregator when re-hydrating persisted rows. */
export function isAspectTag(x: unknown): x is AspectTag {
  return typeof x === 'string' && (ASPECT_TAGS as readonly string[]).includes(x);
}
