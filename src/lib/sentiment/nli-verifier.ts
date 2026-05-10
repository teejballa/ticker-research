// src/lib/sentiment/nli-verifier.ts
//
// Phase 19 / Plan 19-C-10 — Thin NLI verifier shim.
//
// Why this file exists:
//   Plan 19-C-10 (contradiction detector) depends on an NLI verifier per D-42.
//   Plan 19-C-08 (CoVe two-pass) introduces the canonical FinBERT/distilbert-mnli
//   verifier in src/lib/reasoning/cove.ts. 19-C-10 may ship BEFORE 19-C-08 —
//   when it does, this shim gives the detector a stable import path it can
//   mock in unit tests and stub for integration tests.
//
// Contract (matches the planned cove.ts signature):
//   nliVerify(claim, evidence) → 'entail' | 'contradict' | 'neutral' | null
//
//   - 'entail'      : evidence supports the claim
//   - 'contradict'  : evidence contradicts the claim
//   - 'neutral'     : evidence is unrelated / unverifiable
//   - null          : NLI inference errored (graceful degrade — caller treats
//                     as 'neutral' for severity computation)
//
// Once 19-C-08 lands, this file becomes a re-export of cove.nliVerify (keeping
// the import path stable for callers and tests).
//
// Until then, the default implementation returns 'neutral' for any pair —
// that's the safe no-op for the detection-only flag-off mode (no false
// positives, no warnings raised). Tests mock this module to inject specific
// labels per pair.

export type NliLabel = 'entail' | 'contradict' | 'neutral';

/**
 * Pure-TS placeholder. Real NLI inference (FinBERT / distilbert-mnli via HF
 * Inference) lands in 19-C-08. This default never raises false positives —
 * the contradiction detector stays inert until a real verifier wires in.
 *
 * Returns:
 *   - 'neutral' on every call (safe default for production flag-off mode)
 *   - null is the documented graceful-degrade sentinel — the placeholder
 *     never returns it, but tests / future implementations may.
 */
export async function nliVerify(
  _claim: string,
  _evidence: string,
): Promise<NliLabel | null> {
  return 'neutral';
}
