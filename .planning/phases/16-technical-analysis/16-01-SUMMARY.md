---
phase: 16-technical-analysis
plan: 01
subsystem: data
tags: [technical-analysis, technicalindicators, rsi, macd, sma, atr, yahoo-finance2, sensor]

requires:
  - phase: 12-pure-typescript-pipeline
    provides: yahoo-finance2 fetcher conventions (try/catch, null-on-fail) and exact-pin dependency policy
provides:
  - Pinned technicalindicators@3.1.0 (no caret) — same exact-pin policy as ai@6.0.168 / firecrawl-js@4.18.3
  - TechPattern union (8 locked literals) + TechnicalSnapshot interface in src/lib/types.ts
  - src/lib/data/technical.ts: fetchOhlcv, computeTechnicalSnapshot, classifyTechPattern (the exact signatures plans 16-02/16-03/16-04/16-05 import)
  - tests/lib/data/technical.test.ts: 23 tests covering indicator math + 8-bucket classifier reachability + edge cases
affects: [16-02-schema, 16-03-cron-writer, 16-04-engine-context, 16-05-backfill-insights]

tech-stack:
  added: [technicalindicators@3.1.0]
  patterns:
    - "Indicator output arrays are TRUNCATED, not padded — always read [length-1] for the most recent value"
    - "MACD signal/histogram are undefined during warmup — coerce with `?? null` in our shape"
    - "yahoo-finance2 OHLCV bars can have null fields — drop ANY bar where high/low/close is null BEFORE passing to ATR"
    - "volume === 0 is a halt-day — exclude from 20d avg AND null out volume_ratio when latest bar is halted"
    - "bar_count < 200 → sma_200 = null AND tech_pattern = null (other indicators populated where their warmup permits)"

key-files:
  created:
    - src/lib/data/technical.ts
    - tests/lib/data/technical.test.ts
    - .planning/phases/16-technical-analysis/16-01-SUMMARY.md
  modified:
    - package.json (technicalindicators 3.1.0 — done in acb19fc)
    - package-lock.json (technicalindicators 3.1.0 — done in acb19fc)
    - src/lib/types.ts (TechPattern + TechnicalSnapshot — done in acb19fc)

key-decisions:
  - "Classifier uses first-match-wins priority chain (cross > overbought > breakout > pullback > consolidation; or oversold > breakdown on the downside)"
  - "Volume halt detection thresholds: <5 non-zero volume bars in trailing 20 → avg_volume_20d = null AND volume_ratio = null"
  - "fetchOhlcv coerces undefined volume to 0 (preserves bar) so the halt-detection logic owns the semantic decision; high/low/close/open/date nulls drop the bar entirely"
  - "computeTechnicalSnapshot is best-effort: yahoo failure or zero usable bars → returns null, never throws"

patterns-established:
  - "Pure-compute sensor module: no DB writes, no engine-context lookups, no Gemini calls — downstream plans wire this in"
  - "Mocked yahoo-finance2 in unit tests via vi.mock — synthesize OHLCV in-test, never hit the network"
  - "Every TechPattern literal must be reachable via at least one classifier test (Tests 8-15 + 15b cover all 8 buckets)"

requirements-completed: [16-01, AC1-precondition, AC3-precondition]

duration: ~6 min (Task 2 + SUMMARY only — Task 1 already done in acb19fc)
completed: 2026-04-28
---

# Phase 16 Plan 01: Technical-Analysis Sensor Summary

**Pure-compute technical sensor — RSI(14), MACD(12/26/9), SMA(50), SMA(200), ATR(14), volume_ratio, plus an 8-bucket pattern classifier — built on technicalindicators@3.1.0 against yahoo-finance2 daily OHLCV.**

## Performance

- **Duration:** ~6 min (resumed after Task 1 had landed in `acb19fc`)
- **Started:** 2026-04-28T20:41:00Z
- **Completed:** 2026-04-28T20:47:00Z
- **Tasks executed in this run:** 1 of 2 (Task 2 — sensor + test suite)
- **Files created/modified in this run:** 2 source files + 1 SUMMARY

## Accomplishments

- Built `src/lib/data/technical.ts` with `fetchOhlcv`, `computeTechnicalSnapshot`, and `classifyTechPattern` — the exact module shape downstream Phase 16 plans depend on.
- Wrote `tests/lib/data/technical.test.ts` with 23 tests (plan required ≥17) covering RSI/MACD/SMA/ATR math, MACD warmup nulls, volume halt, null-bar filtering, insufficient bars, and reachability of every one of the 8 `TechPattern` literals.
- Verified `technicalindicators` v3.1.0 returns truncated arrays exactly as RESEARCH.md §3.1 documented (RSI 250 in → 236 out; MACD first entry has no signal/histogram).
- All tests green; `tsc --noEmit` clean.

## Task Commits

Task 1 was completed in a prior run (commit `acb19fc` — pinned `technicalindicators@3.1.0`, added `TechPattern` + `TechnicalSnapshot` to `src/lib/types.ts`, typecheck clean).

This run executed Task 2 in TDD style:

1. **Task 2 RED — failing test suite** — `0c59898` (test)
2. **Task 2 GREEN — sensor implementation + test typing fix** — `62904e5` (feat)

(REFACTOR was unnecessary — implementation written in its final form on the first pass, only typing widening was needed for the null-bar test fixture.)

## Files Created/Modified (this run)

- `src/lib/data/technical.ts` — Sensor module. `fetchOhlcv` wraps yahoo's chart endpoint and drops null-OHLC bars. `computeTechnicalSnapshot` runs all four indicator calls, derives `trend_regime` / `momentum_regime` / `cross_state` / volume aggregates, and assembles a `TechnicalSnapshot`. `classifyTechPattern` is a pure first-match-wins chain over the 8 buckets.
- `tests/lib/data/technical.test.ts` — 23 unit tests. Mocks `yahoo-finance2.chart` via `vi.mock`. Synthesizes monotone-rising / monotone-falling close series and crafts targeted snapshots for each classifier branch.

## Decisions Made

- **Classifier priority chain** committed exactly as plan 16-01 §action.11 specifies: bar_count < 200 → null; cross states first; then uptrend stack (overbought > breakout > pullback > consolidation); then downtrend stack (oversold > breakdown); mixed stack falls through to consolidation.
- **Volume halt floor:** require ≥5 non-zero volume bars in the trailing 20 to compute `avg_volume_20d`. With fewer, both `avg_volume_20d` and `volume_ratio` are null. (Documented in module header — RESEARCH.md leaves the precise floor unspecified; 5 was chosen so we don't divide by averages of 1-2 stale samples on thinly-traded days.)
- **`fetchOhlcv` null-coerces `volume`** rather than dropping the bar, so the halt-detection logic in `computeTechnicalSnapshot` owns the volume semantics. High/low/close/open/date nulls still drop the bar.

## Deviations from Plan

None - plan executed exactly as written.

(One small typing fix during execution: the null-bar fixture in Test 17c needed a widened type to reassign `bars[5].close = null`, since `OhlcvBar.close` is strictly `number`. Resolved by declaring an explicit `RawQuote` shape with nullable OHLC. This is test-only and matches what yahoo-finance2 actually returns at the wire boundary — not a behavior change.)

## Issues Encountered

- `npm install` had not been run in this worktree; `node_modules/technicalindicators` was missing even though `package.json` and `package-lock.json` already pinned `3.1.0`. Resolved by running `npm install` before sanity-checking the indicator API. (Not a deviation — required environment setup.)

## Threat Surface Scan

Reviewed against plan's `<threat_model>`:
- T-16-01-01 (ticker tampering): Mitigated — `ticker` flows directly into `yahooFinance.chart()`, which performs its own URL escaping; no manual concatenation.
- T-16-01-04 (supply chain): Mitigated — `technicalindicators` is exact-pinned at `3.1.0` (no caret) in both `package.json` and `package-lock.json`.

No new trust-boundary surface introduced beyond what the plan's threat register already covers.

## Next Phase Readiness

- The sensor is a pure module with the exact signatures plans 16-02 / 16-03 / 16-04 / 16-05 import. They can wire it in without further changes here.
- `npm test -- tests/lib/data/technical.test.ts` is the smoke test downstream agents can run to confirm the sensor still computes correctly after their changes.

## Self-Check: PASSED

- `src/lib/data/technical.ts` — FOUND
- `tests/lib/data/technical.test.ts` — FOUND
- `.planning/phases/16-technical-analysis/16-01-SUMMARY.md` — FOUND (this file)
- Commit `0c59898` (test RED) — FOUND
- Commit `62904e5` (feat GREEN) — FOUND
- Commit `acb19fc` (Task 1 — done in prior run) — FOUND
- 23 tests passing (≥ 17 required) — VERIFIED
- All 8 TechPattern literals reachable in classifier tests — VERIFIED
- `tsc --noEmit` clean — VERIFIED

---
*Phase: 16-technical-analysis*
*Plan: 01*
*Completed: 2026-04-28*
