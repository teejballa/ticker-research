---
id: gemini-engine-context-block-no-data
version: v1
description: Engine calibration context block — NO_DATA branch. Rendered when the diffusion engine has no historical data for the ticker's current regime yet. Concatenated AFTER the system prompt body.
created_at: 2026-05-11T00:00:00Z
deprecated_at: null
variables:
  - cycle_count
---


═══ ENGINE CALIBRATION CONTEXT ═══

The Cipher learning engine has no historical data for this ticker's
current diffusion regime yet (status: NO_DATA, cycle {{cycle_count}}).
Your qualitative read is the only signal. In the engine_calibration
object, set engine_alignment to null and write engine_disagreement
explaining that the engine has no prior to defer to (≤300 chars).
