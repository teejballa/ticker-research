---
id: gemini-technical-context-block
version: v1
description: Phase 16 technical calibration context block. Rendered when the engine has accumulated horizon_calibrations rows; otherwise omitted by the caller (empty string, no template render). Pre-formatted numerics (percentages, CIs, horizon rows table) are passed in as strings.
created_at: 2026-05-11T00:00:00Z
deprecated_at: null
variables:
  - technical_sample_size
  - technical_pattern
  - cap_class
  - technical_posterior_pct
  - technical_ci
  - technical_status
  - horizon_rows
  - combined_logistic_pct
  - agreement
---


═══ TECHNICAL CALIBRATION CONTEXT ═══

Cipher's technical learning engine has accumulated {{technical_sample_size}} resolved 30d outcomes
for technical regimes (RSI/MACD/MA/ATR/volume → 8 buckets × 4 cap classes).
For this ticker right now:

  Technical pattern detected:    {{technical_pattern}} × {{cap_class}}
  Technical prior (30d):         {{technical_posterior_pct}} {{technical_ci}}
                                 n={{technical_sample_size}}, status: {{technical_status}}
  Horizon table (Beta cells):
{{horizon_rows}}
  Combined 12-d logistic (30d): {{combined_logistic_pct}}
  Agreement (Q1 vs Q2):  {{agreement}}

INSTRUCTIONS:
- 30d is the primary horizon. Your future_projection MUST mention 30d.
- Cite at least one technical pattern by name in your buy_rationale or sell_rationale.
- For technical_alignment / technical_disagreement: same rules as engine_alignment/disagreement
  but applied to the technical_posterior. Numeric values will be overwritten post-generation.
