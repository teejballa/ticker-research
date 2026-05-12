---
id: gemini-citations-section
version: v1
description: Phase 19-C-07 (D-39) CITATIONS section rendered at the top of the Gemini user prompt when FEATURE_CITATIONS_V2 is shadow or on. Carries the assembled-from-SourcePackage citation candidates; the LLM must SELECT (not fabricate) from the list when populating citations_v2.
created_at: 2026-05-11T00:00:00Z
deprecated_at: null
variables:
  - citation_count
  - citations_json
---
=== CITATIONS ===
Available citations ({{citation_count}}). You MUST select WHICH of these support each claim by populating citations_v2 on your output. DO NOT invent URLs that are not in this list.

{{citations_json}}
