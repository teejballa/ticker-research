// src/lib/sentiment/contradiction-detector.ts
//
// Phase 19 / Plan 19-C-10 — Cross-class contradiction detector (D-42).
//
// DETECTION-ONLY MODE — PERMANENT for Phase 19.
//   The detector NEVER gates the gemini-analysis output. It surfaces an
//   additive `contradiction_warnings` array consumed by EngineCalibrationPanel
//   only. Upgrading to gating mode requires a separate plan + new decision.
//
// Algorithm:
//   1. Take 4 class posteriors (diffusion, technical, insider, institutional).
//   2. Iterate every unique unordered pair (4 choose 2 = 6 pairs).
//   3. Verbalize each posterior as a directional statement:
//        "<class> signals bullish (<P>)"   when P > 0.5
//        "<class> signals bearish (<P>)"   when P ≤ 0.5
//   4. Run NLI(stmtA, stmtB) → 'entail' | 'contradict' | 'neutral'
//   5. severity = nli_label === 'contradict' ? |P_a − P_b| : 0
//   6. warnings = pairs whose severity > SEVERITY_THRESHOLD (0.3 — pinned
//      by Plan 19-C-10 Task 2 algorithmic spec).
//
// Graceful degrade:
//   - NLI error on a pair → record nli_label='neutral', severity=0 for that
//     pair so subsequent pairs still evaluate. Per Plan 19-C-10 Task 1 Test 4
//     (NLI error on one pair → other pairs still evaluated).
//
// Reuse the same NLI verifier choice as Plan 19-C-08 (CoVe two-pass). Until
// 19-C-08 lands, this module imports from src/lib/sentiment/nli-verifier.ts
// (a placeholder that returns 'neutral' for every call — production flag-off
// mode is therefore inert and never raises false-positive warnings).

import { nliVerify, type NliLabel } from '@/lib/sentiment/nli-verifier';

// Severity threshold per Plan 19-C-10 Task 2: pairs whose |P_a − P_b| > 0.3
// AND whose NLI label is 'contradict' raise a UI warning. Tuned post-shadow
// per T-19-C-10-01 (false-positive spam mitigation).
const SEVERITY_THRESHOLD = 0.3;

export interface ContradictionPair {
  class_a: string;
  class_b: string;
  posterior_a: number;
  posterior_b: number;
  /** NLI label for the verbalized pair. 'neutral' on graceful-degrade. */
  nli_label: 'contradiction' | 'neutral' | 'entailment';
  /** 0–1 — only non-zero when nli_label === 'contradiction'. */
  severity: number;
}

export interface ContradictionResult {
  detected: boolean;
  pairs: ContradictionPair[];
  warnings: string[];
}

/**
 * Map raw NLI verifier label to the public ContradictionPair label.
 * The verifier emits 'contradict' / 'entail' / 'neutral'; the public surface
 * uses 'contradiction' / 'entailment' / 'neutral' for readability.
 */
function publicLabel(raw: NliLabel | null): ContradictionPair['nli_label'] {
  if (raw === 'contradict') return 'contradiction';
  if (raw === 'entail') return 'entailment';
  return 'neutral';
}

function verbalize(className: string, posterior: number): string {
  const dir = posterior > 0.5 ? 'bullish' : 'bearish';
  return `${className} signals ${dir} (${posterior.toFixed(2)})`;
}

/**
 * Per D-42: NLI on every pair of class posteriors. Severity threshold flagged
 * in EngineCalibrationPanel — DETECTION-ONLY (additive UI, never gating).
 *
 * @param args.ticker            symbol (passthrough — included for caller-side
 *                                logging; not consulted in pair iteration)
 * @param args.classPosteriors   posterior probability per class. Iteration
 *                                order = `Object.keys(classPosteriors)`, so
 *                                callers control pair ordering by key order.
 *                                Typical 4-class call: { diffusion, technical,
 *                                insider, institutional }.
 */
export async function detectContradictions(args: {
  ticker: string;
  classPosteriors: Record<string, number>;
}): Promise<ContradictionResult> {
  const classes = Object.keys(args.classPosteriors);
  const pairs: ContradictionPair[] = [];

  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const a = classes[i];
      const b = classes[j];
      const pa = args.classPosteriors[a];
      const pb = args.classPosteriors[b];
      const stmtA = verbalize(a, pa);
      const stmtB = verbalize(b, pb);

      let raw: NliLabel | null;
      try {
        raw = await nliVerify(stmtA, stmtB);
      } catch {
        // Graceful degrade per Task 1 Test 4: errored pair → neutral, sev 0;
        // subsequent pairs still evaluate.
        raw = null;
      }

      const label = publicLabel(raw);
      const divergence = Math.abs(pa - pb);
      const severity = label === 'contradiction' ? divergence : 0;

      pairs.push({
        class_a: a,
        class_b: b,
        posterior_a: pa,
        posterior_b: pb,
        nli_label: label,
        severity,
      });
    }
  }

  const warnings = pairs
    .filter(p => p.severity > SEVERITY_THRESHOLD)
    .map(p =>
      `Cross-class contradiction: ${p.class_a}=${p.posterior_a.toFixed(2)} vs ${p.class_b}=${p.posterior_b.toFixed(2)} (severity ${p.severity.toFixed(2)})`,
    );

  return {
    detected: warnings.length > 0,
    pairs,
    warnings,
  };
}
