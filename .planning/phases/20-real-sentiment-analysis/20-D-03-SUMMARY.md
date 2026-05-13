---
phase: 20
plan: 20-D-03
subsystem: per-claim-verification
tags:
  - cove
  - nli
  - per-claim
  - shadow-lifecycle
  - feature-flag
  - ui-badge
  - model-card
requires:
  - 19-C-08  # report-level CoVe Pass-2 verifier (NLI + distilbert-mnli)
  - 19-C-10  # legacy nliVerify shim consumer (preserved verbatim)
provides:
  - src/lib/eval/per-claim-verifier.ts (verifyClaimPerSignal + verifyClaimsBatch + PerClaimVerdict)
  - src/lib/reasoning/cove.ts:nliVerifyWithScore (NEW — score-returning sibling to nliVerify)
  - AnalysisResult.bullish_signals[*].verified optional Zod field
  - AnalysisResult.bearish_signals[*].verified optional Zod field
  - AnalysisResult.risks (optional structured-list sibling to legacy key_risks string)
  - src/components/ResearchReport.tsx (?) inline badge in Bull Case + Bear Case blocks
  - scripts/measure-claim-verification.ts (operator + future cron CLI)
  - npm run measure-claim-verification
  - HYPERPARAMETERS.md §per_claim_verifier entry
  - docs/cards/MODEL-CARD-per-claim-verifier.md (Mitchell-2019)
  - FEATURE_PER_CLAIM_VERIFIED + NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED three-mode flags
affects:
  - .env.example (+ FEATURE_PER_CLAIM_VERIFIED + NEXT_PUBLIC_ variant)
  - package.json (+ measure-claim-verification npm script)
  - .gitignore (+ baseline JSON ignore pattern with blessed-file exception)
tech-stack:
  added: []
  patterns:
    - "Promise.allSettled fan-out — single-signal NLI failure collapses to 'null' without aborting batch"
    - "Strict 0.7 score thresholds — conservative-default principle (T-20-D-03-01 / T-20-D-03-02)"
    - "Score-returning sibling rather than nliVerify breaking change (preserves 19-C-08 + 19-C-10 callers verbatim)"
    - "Belt-and-suspender try/catch at runGeminiAnalysis wiring — verifier failure NEVER aborts the report"
    - "Self-contained RTL subject mirroring production JSX (20-C-03 precedent)"
    - "AnalysisResult.JSONB as the shadow-mode persistence surface (high-cardinality verdicts unsuitable for ShadowComparison)"
key-files:
  created:
    - src/lib/eval/per-claim-verifier.ts
    - scripts/measure-claim-verification.ts
    - tests/eval/per-claim-verifier.unit.test.ts
    - tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts
    - tests/fixtures/pre-20-D-03-analysis-result.json
    - tests/components/research-report-verified-badge.unit.test.tsx
    - tests/integration/per-claim-verification.integration.test.ts
    - docs/cards/MODEL-CARD-per-claim-verifier.md
    - reports/.gitkeep
  modified:
    - src/lib/reasoning/cove.ts (+ nliVerifyWithScore export — score-returning sibling)
    - src/lib/eval/per-claim-verifier.ts (verifier module — full implementation)
    - src/lib/types.ts (+ AnalysisSignal.verified + AnalysisRisk + AnalysisResult.risks)
    - src/lib/gemini-analysis.ts (Zod schema extension + runGeminiAnalysis wiring)
    - src/lib/features.ts (+ 'per_claim_verified' flag)
    - src/components/ResearchReport.tsx (+ (?) badge JSX in Bull + Bear blocks)
    - .env.example (+ FEATURE_PER_CLAIM_VERIFIED + NEXT_PUBLIC_ variant)
    - package.json (+ measure-claim-verification script)
    - .gitignore (+ /reports/per-claim-verification-baseline-*.json with blessed exception)
    - HYPERPARAMETERS.md (+ per_claim_verifier section)
decisions:
  - "nliVerifyWithScore lives in src/lib/reasoning/cove.ts as a NEW exported sibling to nliVerify (NOT in the @/lib/sentiment/nli-verifier shim). Rationale: the shim is a pure re-export and changing its surface ripples to the 19-C-10 contradiction detector. The new function is purpose-built for per-claim verification and the existing nliVerify (label-only) keeps its contract verbatim — 19-C-08 + 19-C-10 callers unchanged."
  - "Shadow-mode persistence surface is AnalysisResult.JSONB (Report.analysis column), NOT a new ShadowComparison schema. Per-claim verdicts are too high-cardinality for the single-row-per-request ShadowComparison shape, and the in-memory persistence onto AnalysisResult is the cleaner surface for the cutover criteria (operator runs npm run measure-claim-verification against ANY recent report set)."
  - "UI clean-default contract — NO badge renders for verified === 'true'. The ABSENCE of the (?) glyph IS the success signal. This mitigates T-20-D-03-03 (user-distrust spillover when a noisy badge appears on every signal)."
  - "Strict 0.7 score thresholds — symmetric for entail + contradict. Below 0.7 collapses to 'null' (insufficient evidence), never 'true' or 'false'. This is the conservative-default principle: an under-confident verdict shows as informational (?) NOT as a false confirmation NOR as a false contradiction (T-20-D-03-01 + T-20-D-03-02 mitigations)."
  - "Optional .optional() Zod field at the per-SIGNAL level (NOT at the array level). Pre-plan persisted reports round-trip through the new schema with NO Zod failures — proven by tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts (5/5 GREEN)."
metrics:
  duration: "≈ 1h45m wall-clock execution"
  completed: 2026-05-13
---

# Phase 20 Plan 20-D-03: Per-claim CoVe verification + UI (?) badge Summary

**One-liner**: Extends 19-C-08's report-level CoVe Pass-2 NLI verifier to per-claim
granularity — every bullish/bearish/risk signal in AnalysisResult gains an optional
`verified ∈ {'true' | 'false' | 'null'}` field driven by a strict-0.7-threshold NLI
check against the SourcePackage. UI surfaces a clean-default (?) badge only for
non-`'true'` verdicts so users see at-a-glance which claims survived verification.

## What shipped

### Per-claim verifier orchestration

- **`src/lib/eval/per-claim-verifier.ts`** (NEW, ~100 LOC of pure orchestration):
  - `verifyClaimPerSignal(signal, sourcePackage) → PerClaimVerdict`: wraps
    `nliVerifyWithScore` with strict 0.7 thresholds. Score ≤ 0.7 collapses to
    `'null'` regardless of label.
  - `verifyClaimsBatch(signals, sourcePackage) → Map<string, PerClaimVerdict>`:
    Promise.allSettled fan-out across heterogeneous signal IDs (`bullish-N`,
    `bearish-N`, `risks-N`). Per-signal failures isolated to `'null'`; batch
    never aborts.

- **`src/lib/reasoning/cove.ts:nliVerifyWithScore`** (NEW exported sibling):
  Returns `{ label, score }` from the same HF distilbert-mnli endpoint that
  19-C-08 already uses. Existing `nliVerify` preserved verbatim.

### Schema + wiring

- **`src/lib/types.ts`**: optional `verified?: 'true'|'false'|'null'` on
  `AnalysisSignal`; new `AnalysisRisk` interface; optional `risks?: AnalysisRisk[]`
  on `AnalysisResult` (parallel to legacy `key_risks` string — both ship
  side-by-side; legacy field untouched).
- **`src/lib/gemini-analysis.ts:AnalysisResultSchema`**: matching `.optional()`
  Zod enums on `bullish_signals[*]` + `bearish_signals[*]` + new `risks` array
  (max 7).
- **`src/lib/gemini-analysis.ts:runGeminiAnalysis`**: post-Zod-validation,
  post-sidecar wiring gated on `FEATURES.per_claim_verified_mode !== 'off'`.
  Wraps `verifyClaimsBatch` in try/catch so verifier failure NEVER aborts the
  user-facing report.

### UI

- **`src/components/ResearchReport.tsx`**: inline (?) badge JSX in both Bull
  Case and Bear Case blocks (lines ~937 + ~956), gated on
  `NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED === 'on'` AND
  `verified ∈ {'false', 'null'}`. Clean-default: no badge on `'true'` or
  `undefined`. Tooltip text per S10:
  - `'false'` → "Source data contradicts this claim"
  - `'null'`  → "Insufficient source data to verify"

### Feature flag

- **`src/lib/features.ts`**: appended `'per_claim_verified'` to FLAG_NAMES
  (default `'off'`). Three-mode contract (off / shadow / on).
- **`.env.example`**: documented `FEATURE_PER_CLAIM_VERIFIED` (server-side)
  and `NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED` (client-side UI gate).

### Measurement + telemetry

- **`scripts/measure-claim-verification.ts`** + npm script
  (`npm run measure-claim-verification`):
  Iterates `tests/golden-tickers/*.json` (forward-ref to 20-D-04), runs
  `verifyClaimsBatch` per ticker, aggregates per-section verdict counts, writes
  `reports/per-claim-verification-baseline-{YYYY-MM-DD}.json`. Exit codes:
  0 / 4 / 5 per the plan contract.

### Documentation

- **`HYPERPARAMETERS.md §per_claim_verifier`**: thresholds, basis, recalibration
  cadence (200 shadow comparisons OR 90 days).
- **`docs/cards/MODEL-CARD-per-claim-verifier.md`**: Mitchell-2019 model card.

## Test results

| Suite                                                          | Result          |
| -------------------------------------------------------------- | --------------- |
| `tests/eval/per-claim-verifier.unit.test.ts`                   | 12/12 GREEN     |
| `tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts` | 5/5 GREEN       |
| `tests/components/research-report-verified-badge.unit.test.tsx`| 8/8 GREEN       |
| `tests/integration/per-claim-verification.integration.test.ts` | 5/5 GREEN       |
| `tests/lib/reasoning/cove.test.ts` (19-C-08 regression)        | 6/6 GREEN       |

## End-of-plan gates

| Gate                                | Status |
| ----------------------------------- | ------ |
| `tsc --noEmit -p tsconfig.json`     | 0 errors |
| `npm test`                          | All NEW tests GREEN; pre-existing failures (8 tests, DATABASE_URL infra) confirmed present on baseline `main` before this plan landed (unrelated) |
| `npm run check-model-cards`         | OK (0 findings) |
| `npm run check-immutability`        | OK (no SentimentObservation UPDATE/UPSERT/DELETE) |
| `npm run check-telemetry-coverage`  | OK (all 11 modules wrapped) |
| `npm run check-prompts`             | OK (no prompt drift) |
| `npm run check-lookahead`           | OK (0 violations across 197 files) |

## Cutover gate status (shadow_lifecycle.cutover_criteria)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | ≥1 baseline measurement run committed under `reports/per-claim-verification-baseline-{YYYY-MM-DD}.json` containing per-ticker × per-section verified-rate for all 8 golden tickers | **DEFERRED** — verifier infrastructure ready; the canonical baseline file lands once 20-D-04 ships real golden-ticker SourcePackages. Local invocation in detection-only mode (HF endpoint unset) is documented to exit 0 with all-null totals — acceptable per Task 6. |
| 2 | 20-D-04 golden-ticker SourcePackages exist AND every signal has a populated `verified` field after the verifier runs | **DEFERRED** — forward-ref to 20-D-04. |
| 3 | Latency: 8 tickers (~80 signals) verified end-to-end in < 30s wall-clock | **MET (synthetic)** — `tests/integration/per-claim-verification.integration.test.ts` Gate 3 GREEN (~ms in detection-only mode; well under 30s). Will be re-asserted with `HF_DISTILBERT_MNLI_ENDPOINT` set against the 20-D-04 fixtures. |
| 4 | Synthetic-injection RTL test asserts badge renders for `'false'` AND `'null'` AND NOT for `'true'` AND NOT when `verified` undefined | **MET** — `tests/components/research-report-verified-badge.unit.test.tsx` 8/8 GREEN. |

## Threat model disposition

| Threat ID         | Disposition | Evidence |
|-------------------|-------------|----------|
| T-20-D-03-01 (FP `'true'`) | **mitigated** | Strict 0.7 entail threshold; unit tests at 0.65 → `'null'`, 0.85 → `'true'`. |
| T-20-D-03-02 (FP `'false'`) | **mitigated** | Strict 0.7 contradict threshold; unit tests at 0.55 → `'null'`, 0.80 → `'false'`. UI tooltip for `'null'` is "Insufficient source data to verify" (informational), NOT accusatory. |
| T-20-D-03-03 (user distrust) | **mitigated** | Clean-default UI contract — NO badge on `'true'`. RTL Test 3 asserts. Cutover criterion blocks shadow→on flip if `null` rate > 60% on golden tickers (forward to 20-D-03-FOLLOWUP-CUTOVER). |
| T-20-D-03-04 (latency DoS) | **mitigated** | Promise.allSettled fan-out (wall-clock = one call's latency, NOT N calls). Integration Gate 3 asserts < 30s for 80 signals. Belt-and-suspender try/catch swallows verifier failure. |
| T-20-D-03-05 (consumer breakage) | **mitigated** | `.optional()` Zod placement at the per-SIGNAL level; pre-plan persisted reports round-trip with NO Zod failures (backcompat tests 5/5 GREEN). UI conditional checks `verified !== undefined` so old reports render bit-identical. |

## Lifecycle next-step actions

1. **HF endpoint pinning** (operator): when ready to begin shadow rollout, set
   `HF_DISTILBERT_MNLI_ENDPOINT` + `HF_INFERENCE_TOKEN` in Vercel Production env.
   Both vars already documented (inherited from 19-C-08).
2. **Flag flip — shadow** (operator): set `FEATURE_PER_CLAIM_VERIFIED=shadow` in
   Vercel Production. The verifier runs + persists verdicts onto
   `Report.analysis.bullish_signals[*].verified` but the UI badge stays hidden.
3. **Baseline measurement against 20-D-04 fixtures**: once 20-D-04 ships real
   golden-ticker SourcePackages, run `npm run measure-claim-verification` to
   produce the canonical baseline JSON. Commit it as
   `reports/per-claim-verification-baseline-blessed.json` (the .gitignore allows
   this filename via the `!/reports/per-claim-verification-baseline-blessed.json`
   exception added in this plan).
4. **File 20-D-03-FOLLOWUP-CUTOVER**: once all 4 cutover criteria are met, file
   the follow-up plan to (a) set `FEATURE_PER_CLAIM_VERIFIED=on` in Vercel
   Production, (b) set `NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED=on`, (c) per S3
   hard cleanup gate, delete the `off`-path branch in
   `src/lib/gemini-analysis.ts` (the FOLLOWUP plan owns the deletion — this
   plan strictly ships shadow infrastructure + off path).

## Forward references

- **20-D-04** — Golden-ticker SourcePackage fixtures. Currently the measurement
  script gracefully exits 0 with all-null totals (detection-only mode) against
  the existing `tests/golden-tickers/` contents; the canonical blessed
  baseline lands once 20-D-04 produces real SourcePackages.
- **20-Z-02** — Model-card scaffold + `check-model-cards.ts` CI gate (already
  green for this plan's new card).
- **20-Z-03** — `/insights` Sentiment Health telemetry. Per-claim verifier
  latency surfaces there post-cutover (the existing `withTelemetry` wrapper at
  the Gemini call site already captures the report-level latency; per-claim
  latency is sub-call-level and would be added to the `/insights` panel as a
  follow-up if observable variance justifies it).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Backcompat test pulled in `DATABASE_URL`-requiring transitive imports**
- **Found during:** Task 1 / Task 4 RED-state verification of `tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts`
- **Issue:** Importing `AnalysisResultSchema` from `@/lib/gemini-analysis` transitively imported `@/lib/engine-context` which imports `@/lib/db` (Prisma + Neon adapter), and the test env has no `DATABASE_URL` set.
- **Fix:** Added `vi.mock('@/lib/db', () => ({ prisma: {} }))` at the top of the test file — stubs the database import without touching production code. The same pattern was also added to the integration test for parity.
- **Files modified:** `tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts`, `tests/integration/per-claim-verification.integration.test.ts`
- **Commit:** included in 5612c2f (Task 4 commit)

### Deferred Issues

**Pre-existing, out-of-scope (logged in `.planning/phases/20-real-sentiment-analysis/deferred-items.md`)**:
- `src/lib/gemini-analysis.ts` line 12: direct Anthropic SDK import (Pool-B niche discovery — Anthropic-native web_search_20250305 tool, NOT available via AI Gateway).
- `src/lib/gemini-analysis.ts` lines 34, 45, 698: model slug hyphenation in pre-existing strings.
- `src/lib/gemini-analysis.ts` line 50: `new Anthropic()` direct client.
- These are pre-existing patterns that pre-date 20-D-03 and are NOT touched by this plan's changes. Migrating them is out of scope for a per-claim verifier extension.

**Pre-existing test failures on `main`** (confirmed on baseline `git stash`):
- 8 failures across `tests/playwright/research-manipulation-banner.spec.ts`,
  `tests/sentiment/bot-filter-aggregator.unit.test.ts`,
  `tests/lib/sentiment/aggregator.test.ts`,
  `tests/lib/data/source-package.test.ts`,
  `src/lib/data/source-package.test.ts`,
  `tests/unit/anthropic-search-branching.test.ts`.
- All trip on `DATABASE_URL` infra issues at module-load time (existed before 20-D-03 landed). Out of scope per S3 hard cleanup gate scope boundary.

## Self-Check: PASSED

- [x] `src/lib/eval/per-claim-verifier.ts` exists (verified `test -f`)
- [x] `src/lib/reasoning/cove.ts:nliVerifyWithScore` exported (verified `grep`)
- [x] `src/lib/types.ts` has `AnalysisSignal.verified` + `AnalysisRisk` (verified `grep`)
- [x] `src/lib/gemini-analysis.ts` has `verifyClaimsBatch` wiring + Zod `verified: z.enum` (verified `grep`)
- [x] `src/lib/features.ts` has `'per_claim_verified'` (verified `grep`)
- [x] `.env.example` has `FEATURE_PER_CLAIM_VERIFIED` + `NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED` (verified `grep`)
- [x] `src/components/ResearchReport.tsx` has the (?) badge JSX (verified inline in commit 967578e)
- [x] `scripts/measure-claim-verification.ts` exists; `package.json` has `measure-claim-verification` script (verified `grep`)
- [x] `HYPERPARAMETERS.md` has `## per_claim_verifier` section (verified `grep`)
- [x] `docs/cards/MODEL-CARD-per-claim-verifier.md` exists + mentions distilbert-mnli (verified `grep`)
- [x] Commits exist: 7f17c93 (Task 1), 0f45dad (Task 2), 2aa5b0c (Task 3), 5612c2f (Task 4), 967578e (Task 5), 54c2928 (Task 6)
