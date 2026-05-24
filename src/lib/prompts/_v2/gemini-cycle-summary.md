---
id: gemini-cycle-summary
version: v2
description: Diffusion-engine cycle-summary prompt — passed to Claude Haiku at the end of every learn-cron run to produce a single-sentence research-log entry. Used at maybeWriteCycleSummary() in src/app/api/cron/learn/route.ts. v2 (Phase 21) — sector-relative framing: hits now mean "beat their sector by >1%", not ">1% excess vs SPY".
created_at: 2026-05-23T00:00:00Z
deprecated_at: null
variables:
  - outcomes_processed
  - hits
  - drift_alerts
  - cells_active
---
Write a single-sentence research-log entry summarizing today's diffusion engine cycle. Do not use bullet points. Stats: {{outcomes_processed}} new outcomes resolved across all horizons, {{hits}} beat their sector by >1% (sector-relative), {{drift_alerts}} drift alerts triggered, {{cells_active}} pattern cells currently ACTIVE. Keep under 30 words. Plain text, no quotes.