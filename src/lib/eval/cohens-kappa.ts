// src/lib/eval/cohens-kappa.ts
//
// Plan 20-D-02 — Cohen's kappa for inter-method agreement between two binary
// classifications. Used by scripts/eval-claim-extraction-kappa.ts to measure
// regex-vs-LLM agreement on the 100-claim labeled set.
//
// Degenerate case (p_e === 1): both predictors agree on every label. By
// convention we return 1.0 (the methods are perfectly consistent) rather than
// NaN — NaN would crash the ship-gate check while silently passing.

/**
 * Cohen's kappa for two binary classifications of equal length.
 *
 * @throws Error when predA.length !== predB.length
 * @returns 1.0 on perfect agreement (including degenerate p_e === 1 case),
 *          ~0 on independent random,
 *          -1.0 on perfect disagreement.
 */
export function cohensKappa(predA: boolean[], predB: boolean[]): number {
  if (predA.length !== predB.length) {
    throw new Error(
      `cohensKappa: length mismatch (predA=${predA.length}, predB=${predB.length})`,
    );
  }
  if (predA.length === 0) return 1.0;

  const n = predA.length;
  let aTrue = 0;
  let bTrue = 0;
  let agree = 0;
  for (let i = 0; i < n; i++) {
    if (predA[i]) aTrue++;
    if (predB[i]) bTrue++;
    if (predA[i] === predB[i]) agree++;
  }
  const pO = agree / n;
  const pATrue = aTrue / n;
  const pBTrue = bTrue / n;
  const pE = pATrue * pBTrue + (1 - pATrue) * (1 - pBTrue);
  if (pE === 1) return 1.0;
  return (pO - pE) / (1 - pE);
}
