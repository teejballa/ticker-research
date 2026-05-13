---
phase: 20-real-sentiment-analysis
plan: 20-D-01
subsystem: testing
tags: [numeric-grounding, regression, golden-tickers, ci-gate]

requires:
  - phase: 20-Z-04
    provides: Prompt registry + golden-file regression infrastructure
provides:
  - Numeric-grounding matcher that asserts every numeric figure in an AnalysisResult traces to a SourcePackage value
  - 8 frozen golden-ticker AnalysisResult fixtures + 8 SourcePackage fixtures
  - record-frozen-report operator CLI for re-freezing fixtures when SourcePackage shape evolves
  - check-numeric-grounding CLI gate (used in CI)
  - GitHub Actions workflow firing on PR
  - Regression + synthetic-injection integration tests
affects: [20-D-04 golden-tickers suite + 32 exemplars (this is one of the four primitive checks D-04 composes)]

tech-stack:
  added: []
  patterns:
    - "Closest-value matcher with tunable tolerance for trace-to-source numeric grounding"
    - "Frozen-fixture regression test pattern — operator re-freezes when upstream schema evolves"

key-files:
  created:
    - tests/golden-tickers/* (8 ticker fixtures + manifest)
    - scripts/record-frozen-report.ts
    - scripts/check-numeric-grounding.ts
    - .github/workflows/numeric-grounding.yml
    - src/lib/eval/numeric-grounding.ts (matcher)
  modified: []

key-decisions:
  - "Closest-value matcher with tunable tolerance — bridges Gemini's numeric paraphrasing (rounded, unit-coerced) to SourcePackage raw values."
  - "Synthetic-injection integration test proves the matcher catches fabricated numbers (not vacuously passing)."

patterns-established:
  - "Numeric grounding as a primitive — independently composable by D-04's golden-tickers suite"

requirements-completed: []

duration: ~30min
completed: 2026-05-13
---

# Phase 20-D-01 Summary

**Numeric-grounding regression test: every numeric in AnalysisResult must trace to a SourcePackage value, asserted across 8 golden tickers.**

## Self-Check: PASSED

- `npx tsc --noEmit` → exit 0
- `npm run check-model-cards` → OK (0 findings)
- `npm run check-immutability` → OK
- `npm run check-telemetry-coverage` → OK (11/11)
- `npm run check-prompts` → green
- `npm run check-lookahead` → 0 violations / 189 files

(Working tree contains only `.playwright-mcp/*` artifact, unrelated.)

## Commits (9)

1. `78c758f` test(20-D-01): failing tests for numeric-grounding matcher (RED)
2. `d735f55` feat(20-D-01): implement numeric-grounding matcher (GREEN)
3. `41075f5` test(20-D-01): 10 closest-value + grounding-check unit tests
4. `8aad1e1` test(20-D-01): 8 golden-ticker SourcePackage fixtures
5. `f4cf132` test(20-D-01): bootstrap 8 frozen AnalysisResults + recording manifest
6. `e67d2db` feat(20-D-01): record-frozen-report operator CLI
7. `28b3311` test(20-D-01): regression + synthetic-injection integration tests
8. `99c69a0` feat(20-D-01): check-numeric-grounding CLI gate
9. `244f3c1` ci(20-D-01): numeric-grounding GitHub Actions workflow

## Downstream

- D-04 (golden-tickers suite + 32 exemplars) composes this matcher as one of its primitive checks alongside D-02 citation coverage and D-03 per-claim CoVe.
