---
id: price-target-hedge
version: v1
description: |
  Hedging qualifier rendered next to any price_target value.
  Substituted by renderPrompt when AnalysisResult.price_target is non-null.
  The {{ci_band_or_implied_range}} placeholder is filled with either
  the conformal CI band string from 19-C-12 OR the literal "(implied range)".
created_at: "2026-05-11T17:30:00Z"
deprecated_at: null
variables:
  - data_as_of_timestamp
  - ci_band_or_implied_range
---
Price target reflects analyst consensus or model-implied range as of {{data_as_of_timestamp}}; not a forecast or recommendation. {{ci_band_or_implied_range}}
