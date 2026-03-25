---
phase: 07
plan: 03
subsystem: research-pipeline
tags: [python, notebooklm, security-type, preamble, etf, spac]
dependency_graph:
  requires: [07-02]
  provides: [security-type-aware-questions, analysis-result-security-type]
  affects: [scripts/notebooklm_research.py]
tech_stack:
  added: []
  patterns: [preamble-injection, conditional-brief-formatting]
key_files:
  created: []
  modified:
    - scripts/notebooklm_research.py
decisions:
  - "PREAMBLES dict placed at module level after Q6 constant — reusable and easy to extend with new security types"
  - "preamble + q concatenation in list comprehension replaces static QUESTIONS list — zero overhead for equity/unknown types"
  - "security_type defaulted to 'equity' via pkg.get() at both parse_answers() and main() — backward compat with old source packages that lack the field"
  - "ETF analyst sentinel check uses analyst.get('error','') and 'not applicable' substring — matches the sentinel written by fetchAnalystSentiment in 07-01"
metrics:
  duration: 69s
  completed: "2026-03-25"
  tasks: 1
  files: 1
---

# Phase 7 Plan 3: Security-Type Preamble Injection Summary

Security-type-aware preamble injection into all 6 NotebookLM questions, plus ETF analyst brief improvement and security_type propagation through AnalysisResult.

## What Was Built

Modified `scripts/notebooklm_research.py` with four targeted changes:

1. **PREAMBLES dict** — Module-level dict with `'spac'` and `'etf'` keys mapping to instrument-specific context strings that orient Gemini before each question. Equity/unknown/adr/preferred/crypto get an empty string (no behavioral change).

2. **Preamble injection in main()** — Reads `security_type` from the source package JSON via `pkg.get('security_type', 'equity')`, looks up the preamble, then builds `QUESTIONS = [preamble + q for q in [Q1, Q2, Q3, Q4, Q5, Q6]]` as a list comprehension.

3. **security_type in AnalysisResult** — Added `'security_type': pkg.get('security_type', 'equity')` to the `parse_answers()` return dict so the field flows through to the JSON output consumed by the report renderer.

4. **ETF analyst brief improvement** — `format_research_brief()` now checks `analyst.get('error', '')` for the `'not applicable'` sentinel written by `fetchAnalystSentiment`. When present, emits a clear "Not applicable (ETF — no stock analyst ratings exist for this fund)" line plus an evaluation hint, rather than rendering N/A for all fields.

## Decisions Made

- PREAMBLES at module level for discoverability and future extensibility (adding `'crypto'`, `'adr'`, etc. is a one-liner)
- List comprehension chosen over explicit 6-line replacement for conciseness and correctness guarantee
- `security_type` defaulted to `'equity'` at both injection site and parse_answers() for safe backward compat with persisted source packages from earlier phases
- ETF sentinel detection uses substring match on `'not applicable'` — loosely coupled to the exact sentinel wording in the TypeScript data layer

## Verification

- Python syntax check: `ast.parse()` passes
- PREAMBLES dict: 2 matches (definition + usage)
- `preamble + q`: 1 match (list comprehension)
- `'security_type'`: 2 matches (main() injection + parse_answers() return)
- `'not applicable'`: 2 matches (SPAC preamble text + ETF analyst note)
- TypeScript unit tests: 117/117 passed — no regressions

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- scripts/notebooklm_research.py: FOUND
- commit c2e9dcb: FOUND
