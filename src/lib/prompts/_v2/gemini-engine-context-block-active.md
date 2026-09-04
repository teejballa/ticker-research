---
id: gemini-engine-context-block-active
version: v2
description: Engine calibration context block — ACTIVE branch. Rendered when the diffusion engine has accumulated cycles of evidence for the ticker's current regime. The numeric fields (posterior, CI, logistic, Brier, drift_z) are pre-formatted by the caller. Concatenated AFTER the system prompt body. v2 (Phase 21) — sector-relative framing: the engine now predicts whether a ticker beats its sector (sector-relative excess > +1%), not vs SPY.
created_at: 2026-05-23T00:00:00Z
deprecated_at: null
variables:
  - cycle_count
  - flow_pattern
  - cap_class
  - posterior_mean_pct
  - ci_low_pct
  - ci_high_pct
  - sample_size
  - status
  - logistic_score_pct
  - logistic_ci_low_pct
  - logistic_ci_high_pct
  - logistic_sample_size
  - brier_in_sample
  - brier_null
  - drift_z
---


═══ ENGINE CALIBRATION CONTEXT ═══

Cipher's self-supervised learning engine has accumulated {{cycle_count}}
cycles of evidence about how sentiment-diffusion patterns predict whether a
ticker beats its sector (sector-relative excess > +1%) over 7 days. For this
ticker right now:

  Pattern detected:    {{flow_pattern}} × {{cap_class}}
  Engine prior:        {{posterior_mean_pct}} [CI {{ci_low_pct}}–{{ci_high_pct}}]
                       n={{sample_size}}, status: {{status}}
  Logistic score:      {{logistic_score_pct}} [CI {{logistic_ci_low_pct}}–{{logistic_ci_high_pct}}]
                       (engine has trained on {{logistic_sample_size}} resolved outcomes)
  Adversarial null:    real Brier {{brier_in_sample}}
                       null Brier {{brier_null}}
  Concept drift:       z = {{drift_z}} (>2σ = drifting)

INSTRUCTIONS for engine_calibration:

SIGNAL STRENGTH TIERS — use these to set confidence_level and engine_alignment:
  - posterior > 65% AND status = ACTIVE AND sample_size ≥ 50:
      → confidence_level MUST be 'High'. Use language like "the engine strongly signals outperformance".
      → If your qualitative read agrees: write "STRONG BUY SIGNAL" in engine_alignment.
  - posterior < 35% AND status = ACTIVE AND sample_size ≥ 50:
      → confidence_level MUST be 'High' (bearish conviction). Use "the engine strongly signals caution".
      → If your qualitative read agrees: write "STRONG SELL SIGNAL" in engine_alignment.
  - posterior 55–65% OR 35–45%, status = ACTIVE:
      → confidence_level SHOULD be 'Medium' unless other evidence overrides.
  - status = EXPLORATORY: treat as weak prior; your qualitative read dominates.
    Do NOT produce strong buy/sell language from EXPLORATORY priors alone.

1. Numeric fields will be overwritten post-generation — do not invent numbers.
2. In engine_alignment (string, ≤300 chars):
   - For ACTIVE HIGH-CONVICTION cells (posterior > 65% or < 35%, n ≥ 50): use
     "STRONG BUY SIGNAL" or "STRONG SELL SIGNAL" explicitly if your read agrees.
   - For ACTIVE moderate cells: write a single sentence affirming alignment,
     naming the pattern and sample size.
   - Otherwise, leave engine_alignment as null.
3. In engine_disagreement (string, ≤500 chars):
   - If your qualitative read CONTRADICTS an ACTIVE prior (sample_size ≥ 10),
     write a paragraph explaining specifically why, citing source evidence.
   - If status = DEPRECATED (drift detected), note that the pattern has drifted
     and you are NOT deferring to the historical prior.
   - Otherwise, leave engine_disagreement as null.
4. Your investment_thesis, key_risks, and confidence_level MUST match the tier
   above unless you have explicitly populated engine_disagreement.
5. If status = EXPLORATORY, treat the prior as weak — your qualitative judgment
   dominates. Do not use strong buy/sell language from EXPLORATORY cells.
