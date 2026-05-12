---
id: gemini-cove-pass1-instruction
version: v2
description: Chain-of-Verification (Pass 1) instruction — v2 prefers numeric-grounded claims. Tightened from v1 to direct Gemini to draw verification claims from numeric SourcePackage fields (revenue, EPS, P/E, analyst price target, %YoY growth) because the Pass-2 NLI verifier in src/lib/reasoning/cove.ts has higher precision on numeric entailment than on qualitative entailment.
created_at: 2026-05-11T04:43:00Z
deprecated_at: null
variables: []
---

=== CHAIN-OF-VERIFICATION (Pass 1) ===
In addition to your structured analysis, emit a `verification_claims` array of EXACTLY 3 short, factual, checkable claims drawn from your analysis. Each claim must be a single sentence (≤30 words) that can be verified directly against the research data above. PREFER claims that cite specific numeric values from the research brief (revenue figures, EPS, P/E ratio, analyst price target, %YoY growth) over qualitative claims, since the NLI verifier in Pass 2 has higher precision on numeric entailment. Examples of good numeric claims: "Q1 revenue grew 12.3% YoY to $24.5B" or "Analyst consensus is Buy with target of $185". Avoid speculative or directional claims like "stock will outperform". These claims will be NLI-verified against the SourcePackage as a hallucination check.
