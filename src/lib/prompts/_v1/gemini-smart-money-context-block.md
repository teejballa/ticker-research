---
id: gemini-smart-money-context-block
version: v1
description: Phase 17-04 smart-money calibration context block (institutional + insider). Rendered when either class has data; otherwise omitted by the caller. All numeric fields are pre-formatted (percentages, CIs, ages) by the caller and passed as strings. The LLM may populate only the 4 prose strings; numeric fields are post-process overwritten.
created_at: 2026-05-11T00:00:00Z
deprecated_at: null
variables:
  - institutional_pattern
  - cap_class
  - institutional_posterior_pct
  - institutional_ci
  - institutional_sample_size
  - institutional_status
  - institutional_age_text
  - insider_pattern
  - insider_posterior_pct
  - insider_ci
  - insider_sample_size
  - insider_status
  - insider_age_text
  - row30_diffusion_pct
  - row30_diffusion_ci
  - row30_technical_pct
  - row30_technical_ci
  - row30_institutional_pct
  - row30_institutional_ci
  - row30_insider_pct
  - row30_insider_ci
  - agreement
---


═══ SMART MONEY CALIBRATION CONTEXT ═══

INSTITUTIONAL PATTERN: {{institutional_pattern}} × {{cap_class}}
  Posterior:      {{institutional_posterior_pct}} {{institutional_ci}}
  Sample size:    n={{institutional_sample_size}}
  Status:         {{institutional_status}}
  Data age:       {{institutional_age_text}}

INSIDER PATTERN: {{insider_pattern}} × {{cap_class}}
  Posterior:      {{insider_posterior_pct}} {{insider_ci}}
  Sample size:    n={{insider_sample_size}}
  Status:         {{insider_status}}
  Data age:       {{insider_age_text}}

4-CLASS HORIZON TABLE AT 30d:
  Diffusion:     {{row30_diffusion_pct}} {{row30_diffusion_ci}}
  Technical:     {{row30_technical_pct}} {{row30_technical_ci}}
  Institutional: {{row30_institutional_pct}} {{row30_institutional_ci}}
  Insider:       {{row30_insider_pct}} {{row30_insider_ci}}

N-WAY AGREEMENT: {{agreement}}

INSTRUCTIONS for institutional/insider fields (D-04 trust boundary):
- When the institutional or insider class shows status=ACTIVE at 30d, your buy_rationale or sell_rationale MUST cite the calibrating bucket by its exact name (one of: cluster_buying, lone_buy, ceo_buy, cfo_buy, director_buy, cluster_selling, planned_sell_10b5_1, lone_sell, net_accumulation, net_distribution, new_initiation, complete_exit, smart_money_concentration, smart_money_dispersion, contrarian_inflow, contrarian_outflow). Do not paraphrase the bucket name.
- You may write 4 prose strings under engine_calibration: institutional_alignment, institutional_disagreement, insider_alignment, insider_disagreement. These are the ONLY institutional/insider fields you may populate. All numeric and categorical fields under engine_calibration are written by the engine and any value you supply for them will be discarded.
