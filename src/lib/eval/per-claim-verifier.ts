// src/lib/eval/per-claim-verifier.ts
//
// Phase 20 / Plan 20-D-03 — Per-claim NLI verification (CoVe extension).
//
// Wraps 19-C-08's nliVerifyWithScore (the score-returning sibling to nliVerify,
// also defined in src/lib/reasoning/cove.ts) at single-claim granularity. Strict
// 0.7 score thresholds: entail > 0.7 → 'true'; contradict > 0.7 → 'false';
// otherwise 'null' (conservative default).
//
// Architecture decision (20-D-03 Task 1): the score-returning sibling lives in
// cove.ts (not in the @/lib/sentiment/nli-verifier shim) because the shim is a
// pure re-export of nliVerify and changing its surface would ripple to the
// 19-C-10 contradiction detector. The 20-D-03 verifier consumes the new
// nliVerifyWithScore directly; the legacy shim is untouched.
//
// Threshold rationale (HYPERPARAMETERS.md per_claim_verifier):
//   - 0.7 is the HF text-classification top-score "high confidence" convention.
//   - Below 0.7 collapses to 'null' (insufficient evidence) — never to 'true' /
//     'false'. The UI badge for 'null' reads "Insufficient source data to
//     verify" (informational), NOT "false claim" (accusatory).
//   - Re-evaluate after 200+ shadow comparisons (same convention as 19-C-08).
//
// COST GATE (T-20-D-03-04):
//   - verifyClaimsBatch uses Promise.allSettled so all N NLI calls run in
//     parallel — wall-clock is one call's latency, not N calls.
//   - Per-signal failures collapse to 'null' WITHOUT aborting the batch
//     (mirrors 19-C-08 runWithCove belt-and-suspender pattern).
//
// SECURITY (T-20-D-03-05):
//   - The `verified` field is .optional() at the per-SIGNAL level on the Zod
//     schema (gemini-analysis.ts AnalysisResultSchema), so pre-plan persisted
//     reports continue to parse without Zod failure.

import { nliVerifyWithScore } from '@/lib/reasoning/cove';
import type { SourcePackage } from '@/lib/types';

export type PerClaimVerdict = 'true' | 'false' | 'null';

/** HF text-classification top-score "high confidence" threshold. */
const SCORE_THRESHOLD = 0.7;
/** Inherited from 19-C-08 MAX_CLAIM_LEN — bounds NLI input + prompt-injection risk. */
const MAX_CLAIM_LEN = 500;
/** Inherited from 19-C-08 MAX_EVIDENCE_LEN — bounds NLI input + latency. */
const MAX_EVIDENCE_LEN = 5000;

/**
 * Single-claim verifier. Wraps nliVerifyWithScore with strict 0.7 thresholds.
 *
 * Returns:
 *   - 'true'  iff NLI returned 'entail'     AND top-label score > 0.7
 *   - 'false' iff NLI returned 'contradict' AND top-label score > 0.7
 *   - 'null'  on NLI 'neutral' OR null OR score ≤ 0.7 OR throw (graceful degrade)
 */
export async function verifyClaimPerSignal(
  signal: { description: string; supporting_evidence?: string },
  sourcePackage: SourcePackage,
): Promise<PerClaimVerdict> {
  try {
    const claim = (signal.description ?? '').slice(0, MAX_CLAIM_LEN);
    const evidence = JSON.stringify(sourcePackage).slice(0, MAX_EVIDENCE_LEN);
    const { label, score } = await nliVerifyWithScore(claim, evidence);
    if (label === null) return 'null';
    if (score === null) return 'null';
    if (label === 'entail' && score > SCORE_THRESHOLD) return 'true';
    if (label === 'contradict' && score > SCORE_THRESHOLD) return 'false';
    return 'null';
  } catch {
    // Defense-in-depth: nliVerifyWithScore already guards its own throws, but
    // any other unexpected error (JSON.stringify on a circular ref, etc.)
    // collapses to 'null' so the batch never aborts on a single bad signal.
    return 'null';
  }
}

/**
 * Batched per-claim verification. Promise.allSettled fan-out — failure on any
 * single signal collapses to 'null' for that signal only; the batch never
 * aborts.
 *
 * Caller stamps positional IDs onto signals (e.g. `bullish-0`, `bearish-2`,
 * `risks-1`); the returned Map preserves those IDs so the caller can merge
 * verdicts back onto AnalysisResult by position.
 */
export async function verifyClaimsBatch(
  signals: Array<{ id: string; description: string; supporting_evidence?: string }>,
  sourcePackage: SourcePackage,
): Promise<Map<string, PerClaimVerdict>> {
  const out = new Map<string, PerClaimVerdict>();
  if (signals.length === 0) return out;
  const results = await Promise.allSettled(
    signals.map((s) =>
      verifyClaimPerSignal(s, sourcePackage).then((v) => [s.id, v] as const),
    ),
  );
  for (let i = 0; i < signals.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      out.set(r.value[0], r.value[1]);
    } else {
      out.set(signals[i].id, 'null');
    }
  }
  return out;
}
