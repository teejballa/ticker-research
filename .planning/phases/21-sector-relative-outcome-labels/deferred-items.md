# Phase 21 — Deferred Items

Out-of-scope discoveries logged during execution. NOT fixed by the discovering plan.

## From 21-4-07 (UI swap)

- **src/lib/gemini-analysis.ts — pre-existing AI-gateway lint warnings.** The vercel
  posttooluse validator flags lines 11/33/44/49/517/1161 (direct Anthropic SDK import,
  model-slug hyphens, provider API key bypassing the gateway). These are PRE-EXISTING and
  unrelated to the 21-4-07 change (which only threaded three sector/SPY fields into the
  engine_calibration mapping). Out of scope for this UI plan — not touched. Should be
  addressed by a dedicated ai-gateway migration plan.

