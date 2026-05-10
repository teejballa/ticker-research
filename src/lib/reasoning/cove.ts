// src/lib/reasoning/cove.ts
//
// Phase 19 / Plan 19-C-08 — Chain-of-Verification (CoVe) two-pass wrapper (D-40).
//
// Per Dhuliawala et al. 2024 (https://arxiv.org/abs/2309.11495). Pass 1 (Gemini
// upstream of this module) emits the AnalysisResult plus 3 short verification
// claims. Pass 2 (this module) runs an NLI verifier on each (claim, evidence)
// pair against the SourcePackage and flags contradictions in source_warnings
// without modifying any other field of the analysis.
//
// NLI MODEL CHOICE: distilbert-mnli (cross-encoder/nli-distilroberta-base) —
// selected via the empirical evaluation in tests/fixtures/nli-eval-labels.tsv.
// On the 30-claim stratified sample, distilbert-mnli scored 28/30 (93.3%) vs
// FinBERT-tone's 22/30 (73.3%). Decision date: 2026-05-08. Re-evaluate after
// 200+ live shadow comparisons land in ShadowComparison.
//
// Why distilbert-mnli wins: FinBERT-tone is a 3-way SENTIMENT classifier
// (positive/neutral/negative) trained on financial text. Mapping its label
// probabilistically onto NLI (entail/contradict/neutral) is a category
// mismatch — declarative facts that aren't tonally negative slip through as
// 'neutral' (rows c2, c4, c11, c12, c18, c30 in the fixture). distilbert-mnli
// is purpose-built for NLI (MNLI/SNLI training corpora) and handles the
// entailment signal directly, which is the contract runCoVe needs.
//
// SECURITY (T-19-C-08-01 / shared with finsentllm.ts T-19-C-01-01):
//   We never log the endpoint URL on error — only the SDK error message.
//   HF endpoint URLs include opaque IDs and should be treated as secrets.
//
// COST GATE (T-19-C-08-02): the router (Plan 19-C-09) gates CoVe to high-
// stakes tickers only. This module is gate-agnostic — it just runs the
// verification when called. The shadow lifecycle in gemini-analysis.ts wires
// the gate.

import type { AnalysisResult, SourcePackage } from '@/lib/types';

// ── Local NLI label type ──────────────────────────────────────────────────
//
// Mirrors the NliLabel emitted by the verifier shim. Re-declared here so this
// module has zero downstream type churn if the shim ever moves.
type NliLabel = 'entail' | 'contradict' | 'neutral';

export interface CoVeResult {
  /** Per-claim verification result.
   *    - true   → claim entailed by SourcePackage evidence
   *    - false  → claim contradicted by SourcePackage evidence
   *    - null   → unverifiable (NLI returned 'neutral', threw, or returned null)
   */
  verified: (boolean | null)[];
  /** Human-readable warnings appended to source_warnings (one per contradiction). */
  contradictions: string[];
  /** NLI model identifier used for this run. Pinned to 'distilbert-mnli' per Task 1
   *  decision. The literal type intentionally still admits 'finbert' for future
   *  re-evaluation; flipping it requires a new fixture run + this constant + a
   *  CHANGELOG note in the header. */
  nli_model: 'finbert' | 'distilbert-mnli';
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Per Task 2 Test 6: claims are truncated to this many chars before being
 *  fed to the NLI verifier (defensive — guards against accidental prompt-
 *  injection-grade payloads from upstream Gemini outputs). */
const MAX_CLAIM_LEN = 500;
/** Evidence is the JSON-stringified SourcePackage truncated to this many
 *  chars (per RESEARCH Pitfall 5 cost gate — keeps NLI inference latency
 *  bounded). */
const MAX_EVIDENCE_LEN = 5000;
/** Slice of the claim included in the contradiction warning string (so the
 *  surface text in source_warnings stays UI-friendly). */
const WARNING_SLICE_LEN = 100;

/**
 * Resolve the NLI verifier dynamically so unit tests can vi.mock the
 * '@/lib/sentiment/nli-verifier' module without `runCoVe` carrying a static
 * import that escapes hoisting. Mirrors the contradiction-detector pattern.
 *
 * Returns a label or null. Errors are swallowed and returned as null so the
 * caller can record `verified=null` for the row without aborting the whole
 * verification pass (Task 2 Test 4 — graceful degrade).
 */
async function callNli(claim: string, evidence: string): Promise<NliLabel | null> {
  try {
    const mod = await import('@/lib/sentiment/nli-verifier');
    const out = await mod.nliVerify(claim, evidence);
    return out;
  } catch {
    return null;
  }
}

/**
 * CoVe Pass 2.
 *
 * Walks `verificationClaims` in order, runs the NLI verifier on each
 * (claim, evidence) pair, and returns the per-claim verdicts plus a list of
 * human-readable contradiction warnings. The caller (gemini-analysis.ts)
 * appends `contradictions` onto `AnalysisResult.source_warnings` and may
 * surface `verified` on a non-canonical `cove_verified` field during shadow.
 */
export async function runCoVe(args: {
  analysisResult: AnalysisResult;
  verificationClaims: string[];
  sourcePackage: SourcePackage;
}): Promise<CoVeResult> {
  // The analysisResult parameter is currently unused by the verification
  // logic (the LLM has already produced it). We keep it on the signature so
  // future iterations can correlate per-signal claims back to their source
  // citations without a follow-up signature change.
  void args.analysisResult;

  const evidence = JSON.stringify(args.sourcePackage).slice(0, MAX_EVIDENCE_LEN);
  const verified: (boolean | null)[] = [];
  const contradictions: string[] = [];

  for (const rawClaim of args.verificationClaims) {
    const claim = rawClaim.slice(0, MAX_CLAIM_LEN);
    const label = await callNli(claim, evidence);

    if (label === null) {
      verified.push(null);
      continue;
    }
    if (label === 'entail') {
      verified.push(true);
      continue;
    }
    if (label === 'contradict') {
      verified.push(false);
      contradictions.push(
        `Claim "${rawClaim.slice(0, WARNING_SLICE_LEN)}" contradicted by SourcePackage`,
      );
      continue;
    }
    // 'neutral' → unverifiable; record null without raising a contradiction.
    verified.push(null);
  }

  return {
    verified,
    contradictions,
    nli_model: 'distilbert-mnli',
  };
}

/**
 * Direct NLI verifier entry point.
 *
 * 19-C-10 introduced a placeholder NLI shim at src/lib/sentiment/nli-verifier.ts
 * that always returned 'neutral'. With 19-C-08 landing, the shim becomes a
 * re-export of this function so callers (the contradiction detector AND
 * runCoVe's internal callNli) share one implementation.
 *
 * Production wiring: this function is the place to plug in the HF Inference
 * call to the chosen NLI endpoint (HF_DISTILBERT_MNLI_ENDPOINT). Until that
 * endpoint env var is set, the function returns 'neutral' for every pair so
 * detection-only mode (the 19-C-10 default) stays inert. Tests mock this via
 * vi.mock('@/lib/sentiment/nli-verifier', ...).
 */
export async function nliVerify(
  _claim: string,
  _evidence: string,
): Promise<NliLabel | null> {
  // Production HF inference path — gated on the endpoint env var being set.
  // When the operator provisions HF_DISTILBERT_MNLI_ENDPOINT (and the matching
  // HF_INFERENCE_TOKEN that finsentllm.ts already requires), this function
  // ships a real NLI score. Until then, the safe-default 'neutral' keeps the
  // 19-C-10 contradiction detector inert (no false-positive warnings) and
  // CoVe's verified array filled with null entries (which the shadow runner
  // treats as unverifiable — never as contradiction).
  const endpoint = process.env.HF_DISTILBERT_MNLI_ENDPOINT;
  if (!endpoint) return 'neutral';

  try {
    // Lazy import to avoid eagerly loading @huggingface/inference in test
    // runs that don't exercise this code path.
    const { HfInference } = await import('@huggingface/inference');
    const token = process.env.HF_INFERENCE_TOKEN;
    if (!token) return 'neutral';
    const client = new HfInference(token);

    // distilbert-mnli text-classification: input is the concatenation of
    // claim + [SEP] + evidence; output is per-label probabilities. We map
    // the highest-probability label into our NliLabel surface.
    const out = await client.textClassification({
      model: endpoint,
      inputs: `${_claim} [SEP] ${_evidence}`,
    });
    const arr = (Array.isArray(out) ? out : [out]) as Array<{ label: string; score: number }>;
    if (arr.length === 0) return 'neutral';
    let best = arr[0];
    for (const r of arr) if (r.score > best.score) best = r;
    const label = best.label.toLowerCase();
    if (label.startsWith('entail')) return 'entail';
    if (label.startsWith('contradict')) return 'contradict';
    return 'neutral';
  } catch {
    // SECURITY: do not log the endpoint URL (T-19-C-08-01).
    return null;
  }
}
