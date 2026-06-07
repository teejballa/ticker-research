/**
 * Categorical Log-Loss (Cross-Entropy) — proper scoring rule for
 * probabilistic Buy / Hold / Sell predictions.
 *
 * Formula (CS229 "Information Theory"):
 *   LL = −(1/n) · Σᵢ Σ_k 𝟙[yᵢ = k] · log(p_ik)
 *
 * Probabilities are clipped to [ε, 1−ε] with ε = 1e-15 to avoid log(0).
 * Missing class in a prediction record is treated as ε (maximum penalty).
 * Probabilities that do not sum to 1 (within 1e-6) are re-normalised with
 * a console.warn.
 *
 * Why log-loss over accuracy (per CLAUDE.md rule #7): log-loss is a proper
 * scoring rule that rewards calibrated confidence and punishes overconfident
 * wrong calls. Raw accuracy is gameable by always predicting the majority class.
 *
 * Reference: CS229 main notes (Stanford), "Information Theory" section
 *   https://cs229.stanford.edu/main_notes.pdf
 *
 * Hand-rolled — no external dependencies.
 */

/**
 * Categorical log-loss for 3-way (Buy / Hold / Sell) predictions.
 *
 * @param y_true   - True class labels (e.g. 'Buy', 'Hold', 'Sell')
 * @param y_pred   - Predicted probability distributions (one Record per row)
 * @param classes  - Class names (default ['Buy', 'Hold', 'Sell'])
 * @param eps      - Clipping epsilon to avoid log(0) (default 1e-15)
 * @returns Mean log-loss across all rows (lower is better)
 *
 * Edge cases:
 * - y_true.length !== y_pred.length → throws Error
 * - Missing class in prediction record → treated as eps (penalty ≈ −log(eps) ≈ 34.5)
 * - Probabilities not summing to 1 (within 1e-6) → re-normalise + console.warn
 *
 * Reference: CS229 main notes, "Information Theory" section
 */
export function categoricalLogLoss(
  y_true: string[],
  y_pred: Array<Record<string, number>>,
  classes: string[] = ['Buy', 'Hold', 'Sell'],
  eps: number = 1e-15,
): number {
  if (y_true.length !== y_pred.length) {
    throw new Error(
      `[log-loss] y_true and y_pred length mismatch: ${y_true.length} vs ${y_pred.length}`,
    );
  }

  const n = y_true.length;
  if (n === 0) return 0;

  let totalLoss = 0;

  for (let i = 0; i < n; i++) {
    const trueClass = y_true[i];
    const predRow = y_pred[i];

    // --- Re-normalise if probabilities do not sum to 1 ---
    let sum = 0;
    for (const cls of classes) {
      sum += predRow[cls] ?? 0;
    }
    let normalised = predRow;
    if (Math.abs(sum - 1) > 1e-6) {
      console.warn(
        `[log-loss] row ${i} probabilities sum to ${sum.toFixed(6)}, re-normalising`,
      );
      const normFactor = sum > 0 ? sum : 1;
      normalised = {} as Record<string, number>;
      for (const cls of classes) {
        normalised[cls] = (predRow[cls] ?? 0) / normFactor;
      }
    }

    // --- Clip and accumulate log of the true-class probability ---
    // Only the true class contributes (one-hot 𝟙[yᵢ = k])
    const rawP = normalised[trueClass] ?? 0;
    const clippedP = Math.max(eps, Math.min(1 - eps, rawP));
    totalLoss += -Math.log(clippedP);
  }

  return totalLoss / n;
}
