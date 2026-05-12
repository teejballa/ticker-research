---
id: gemini-engine-context-block-active
version: v1
description: Engine calibration context block — ACTIVE branch. Rendered when the diffusion engine has accumulated cycles of evidence for the ticker's current regime. The numeric fields (posterior, CI, logistic, Brier, drift_z) are pre-formatted by the caller. Concatenated AFTER the system prompt body.
created_at: 2026-05-11T00:00:00Z
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
cycles of evidence about how sentiment-diffusion patterns predict 7-day
returns vs SPY (excess > +1%). For this ticker right now:

  Pattern detected:    {{flow_pattern}} × {{cap_class}}
  Engine prior:        {{posterior_mean_pct}} [CI {{ci_low_pct}}–{{ci_high_pct}}]
                       n={{sample_size}}, status: {{status}}
  Logistic score:      {{logistic_score_pct}} [CI {{logistic_ci_low_pct}}–{{logistic_ci_high_pct}}]
                       (engine has trained on {{logistic_sample_size}} resolved outcomes)
  Adversarial null:    real Brier {{brier_in_sample}}
                       null Brier {{brier_null}}
  Concept drift:       z = {{drift_z}} (>2σ = drifting)

INSTRUCTIONS for engine_calibration:
1. Treat these numbers as CALIBRATED PRIORS. Do not invent numbers; the
   numeric fields will be overwritten post-generation regardless of what
   you output.
2. In engine_alignment (string, ≤300 chars):
   - If the engine prior is HIGH (>60%) and your qualitative read is bullish,
     OR the engine prior is LOW (<40%) and your read is bearish: write a
     single sentence affirming alignment, naming the pattern, and noting
     the sample size.
   - Otherwise, leave engine_alignment as null.
3. In engine_disagreement (string, ≤500 chars):
   - If your qualitative read CONTRADICTS a high-confidence prior
     (sample_size ≥ 10 AND status = ACTIVE), write a single paragraph
     explaining specifically WHY you disagree. Cite specific community
     evidence that overrides the prior.
   - If status is DEPRECATED (drift detected), explicitly note that the
     pattern has drifted and you are NOT deferring to the historical prior.
   - Otherwise, leave engine_disagreement as null.
4. Your investment_thesis, key_risks, and confidence_level MUST be
   consistent with the engine prior unless you have explicitly populated
   engine_disagreement above.
5. If status is EXPLORATORY (n < 10), treat the prior as weak and weight
   your qualitative read more heavily.
