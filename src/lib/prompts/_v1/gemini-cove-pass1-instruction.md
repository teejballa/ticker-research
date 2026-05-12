---
id: gemini-cove-pass1-instruction
version: v1
description: Chain-of-Verification (Pass 1) instruction appended to the main Gemini user prompt when FEATURE_COVE_TWO_PASS is shadow or on. Asks Gemini to emit 3 short factual checkable claims as `verification_claims` for Pass-2 NLI verification by runCoVe.
created_at: 2026-05-11T00:00:00Z
deprecated_at: null
variables: []
---

=== CHAIN-OF-VERIFICATION (Pass 1) ===
In addition to your structured analysis, emit a `verification_claims` array of EXACTLY 3 short, factual, checkable claims drawn from your analysis. Each claim must be a single sentence (≤30 words) that can be verified directly against the research data above. Examples of good claims: "Q1 revenue grew >10% YoY" or "Analyst consensus is Buy with target of $X". Avoid speculative or directional claims like "stock will outperform". These claims will be NLI-verified against the SourcePackage as a hallucination check.
