---
phase: 20
plan: 20-D-03
wave: D
type: execute
depends_on: []
files_modified:
  - src/lib/gemini-analysis.ts
  - src/lib/types.ts
  - src/lib/eval/per-claim-verifier.ts
  - src/components/ResearchReport.tsx
  - scripts/measure-claim-verification.ts
  - tests/eval/per-claim-verifier.unit.test.ts
  - tests/components/research-report-verified-badge.unit.test.tsx
  - tests/integration/per-claim-verification.integration.test.ts
  - reports/.gitkeep
  - HYPERPARAMETERS.md
  - docs/cards/MODEL-CARD-per-claim-verifier.md
  - package.json
autonomous: true
requirements: []
shadow_required: true
shadow_skip_reason: null
shadow_lifecycle:
  off_default: true
  shadow_persist_column: "per_claim_verified_shadow"
  shadow_persist_target: "AnalysisResult.bullish_signals[*].verified / bearish_signals[*].verified / risks[*].verified — additive optional Zod field; shadow-mode populates the field but UI badge is suppressed until the cutover criteria below are met"
  cutover_criteria:
    - "≥1 baseline measurement run committed under reports/per-claim-verification-baseline-{YYYY-MM-DD}.json containing per-ticker × per-section verified-rate (true / false / null counts) for all 8 golden tickers from 20-D-04"
    - "20-D-04 golden-ticker SourcePackages exist on disk (forward-ref) AND every signal across all 8 reports has a populated `verified` field after the per-claim verifier runs (no skipped signals — verifier ran on 100% of bullish_signals + bearish_signals + risks claims)"
    - "Per-claim verifier latency: 8 golden tickers (~80 total signals @ ~10/report) verified end-to-end in < 30 seconds wall-clock with HF_DISTILBERT_MNLI_ENDPOINT set (single batch NLI call per report, not per claim)"
    - "Synthetic-injection RTL test asserts the (?) badge renders for `verified === 'false'` AND for `verified === 'null'` AND does NOT render for `verified === 'true'` AND does NOT render when `verified` is undefined — backward compatibility gate"
  cutover_action: "Set FEATURE_PER_CLAIM_VERIFIED=on in src/lib/features.ts. The 'on' path renders the (?) badge in ResearchReport for any signal where verified ∈ {false, null}. The 'off' path remains intact for one full release cycle (per S3 hard cleanup gate — deletion happens in 20-D-03-FOLLOWUP-CUTOVER, NOT this plan)."
hard_cleanup_gate: true
must_haves:
  truths:
    - "AnalysisResult.bullish_signals[*].verified is an optional ('true' | 'false' | 'null') field — undefined for reports persisted before this plan ships; backward compatible by construction (Zod .optional() at the per-signal level)"
    - "AnalysisResult.bearish_signals[*].verified follows the same shape"
    - "AnalysisResult.risks[*].verified exists; `risks` is the Zod alias for the per-claim list extracted from the existing free-text `key_risks` paragraph (see Task 2 — risks are extracted as a structured array PARALLEL to the existing key_risks string; both fields ship side-by-side and the legacy field is not touched)"
    - "verifyClaimPerSignal(signal, sourcePackage) wraps the existing 19-C-08 nliVerify function (re-export at @/lib/sentiment/nli-verifier) — NO new NLI infrastructure is implemented; this plan is strictly a per-claim granularity extension of the report-level pass-2 verifier already in production"
    - "verifyClaimPerSignal returns 'true' when NLI label === 'entail' AND the entailment score (HF top-label score) is > 0.7 — STRICT threshold; below 0.7 the verdict collapses to 'null' (insufficient evidence), never 'true'"
    - "verifyClaimPerSignal returns 'false' when NLI label === 'contradict' AND the contradiction score is > 0.7 — STRICT threshold; below 0.7 the verdict collapses to 'null', never 'false'"
    - "verifyClaimPerSignal returns 'null' on NLI label === 'neutral' OR null (NLI threw / endpoint unset) OR when the top score is ≤ 0.7 for either entail/contradict"
    - "verifyClaimsBatch(signals, sourcePackage) accepts a heterogeneous array of {description, supporting_evidence?} signals (bullish + bearish + risks) and returns a Map<signalId, verdict> in ONE round-trip through callNli per signal — reuses 19-C-08 callNli; no new HF endpoint, no new env var"
    - "Per-claim verification fires AFTER Gemini analysis returns in runGeminiAnalysis (post-Zod-validation) and is gated behind FEATURES.per_claim_verified_mode three-mode flag — 'off' bypasses entirely; 'shadow' computes + persists into AnalysisResult fields but UI badge stays hidden; 'on' computes + UI badge renders"
    - "UI: ResearchReport.tsx renders an inline (?) badge sibling to each signal's source_citation when (a) FEATURE_PER_CLAIM_VERIFIED === 'on' AND (b) signal.verified === 'false' OR signal.verified === 'null'"
    - "UI: NO badge renders when signal.verified === 'true' (clean default — the absence of a badge is the success signal); NO badge renders when signal.verified is undefined (backward compatibility — pre-plan reports look identical)"
    - "UI badge tooltip text contains the literal strings: 'Verified against source' for 'true' verdict (never rendered as a badge — only as accessibility label on a hidden el for screen readers in audit mode), 'Source data contradicts this claim' for 'false', 'Insufficient source data to verify' for 'null' — asserted by RTL snapshot test"
    - "scripts/measure-claim-verification.ts runs the verifier across 8 golden ticker SourcePackages (when present from 20-D-04) and writes per-ticker × per-section verified-rate to reports/per-claim-verification-baseline-{date}.json — gracefully skips with documented exit code 4 ('NO_GOLDEN_FIXTURES') when 20-D-04 fixtures have not yet landed"
    - "Baseline measurement output JSON schema: { run_date, golden_ticker_count, per_ticker: { ticker: { bullish: {true, false, null}, bearish: {true, false, null}, risks: {true, false, null} } }, totals: {true, false, null}, verifier_latency_ms_total } — one JSON file per measurement run, dated"
    - "MODEL-CARD-per-claim-verifier.md is committed under docs/cards/ following the Mitchell-2019 template — references the 19-C-08 NLI model card (distilbert-mnli choice + 28/30 fixture accuracy) as the upstream dependency"
    - "HYPERPARAMETERS.md gains a 'per_claim_verifier' subsection documenting the 0.7 entailment / 0.7 contradiction thresholds, their literature basis (HF text-classification top-label score convention per the cove.ts implementation), and the recalibration rule (re-evaluate after 200+ shadow comparisons land in production, per the 19-C-08 fixture footer convention)"
    - "Per-signal verification ID stability: verifyClaimsBatch uses the signal's positional index within its section (`bullish-${i}`, `bearish-${i}`, `risks-${i}`) as the signalId — this is the ONLY stable handle available given that AnalysisSignal has no id field; the Map order is preserved in the writer so the UI receives verdicts in lockstep with signal positions"
    - "Backward compatibility regression test asserts: pre-plan AnalysisResult fixtures (loaded from tests/fixtures/pre-20-D-03-analysis-results/*.json) round-trip through the new Zod schema with NO Zod failures AND no `verified` field appears on the output (proves .optional() at the per-signal level holds)"
    - "Non-fatal NLI failures: verifyClaimsBatch try/catches each individual callNli; failure → that single signal's verdict is 'null' (NOT a verifier-wide abort) — the user always gets a report even if HF Inference is partially down. Mirrors the 19-C-08 runWithCove belt-and-suspender pattern."
    - "Cost gate: shadow-mode runs are wrapped in setImmediate so per-claim verification NEVER lands on the user-facing latency path. The shadow runner pattern from 19-C-08 is the precedent."
  artifacts:
    - path: "src/lib/types.ts"
      provides: "Adds AnalysisSignal.verified?: 'true' | 'false' | 'null' optional field; adds AnalysisResult.risks?: Array<{description, source_citation?, verified?}> optional sibling to key_risks string"
      contains: "verified?:"
    - path: "src/lib/gemini-analysis.ts"
      provides: "Extends AnalysisResultSchema with .optional() verified on each signal entry; wires per-claim verification call after Zod parse + before return; gated behind FEATURES.per_claim_verified_mode"
      contains: "verifyClaimsBatch"
    - path: "src/lib/eval/per-claim-verifier.ts"
      provides: "verifyClaimPerSignal + verifyClaimsBatch — pure orchestration over @/lib/sentiment/nli-verifier (19-C-08 shim); zero new NLI infrastructure"
      contains: "export async function verifyClaimsBatch"
      exports: ["verifyClaimPerSignal", "verifyClaimsBatch", "PerClaimVerdict"]
    - path: "src/components/ResearchReport.tsx"
      provides: "Inline (?) badge sibling to source_citation inside the bullish_signals and bearish_signals .map() blocks (lines 730 + 749); conditional render gated on FEATURE_PER_CLAIM_VERIFIED === 'on' AND verified ∈ {false, null}"
      contains: "verified"
    - path: "scripts/measure-claim-verification.ts"
      provides: "Operator + (future cron) runnable; iterates 8 golden ticker SourcePackages, runs verifyClaimsBatch, writes baseline JSON to reports/per-claim-verification-baseline-{date}.json; exit code 4 = NO_GOLDEN_FIXTURES; exit code 0 = success; exit code 5 = NLI_ENDPOINT_DOWN"
      contains: "per-claim-verification-baseline"
    - path: "reports/.gitkeep"
      provides: "Ensures the reports/ output directory exists in the repo so the measurement script can write into it on first run without a manual mkdir step. The baseline JSON file itself is committed when produced (it IS the artifact of this plan), but transient runs in dev are .gitignored — adjust .gitignore in Task 6"
    - path: "HYPERPARAMETERS.md"
      provides: "New 'per_claim_verifier' subsection documenting the 0.7 entailment + 0.7 contradiction score thresholds, their basis, and the recalibration rule"
      contains: "per_claim_verifier"
    - path: "docs/cards/MODEL-CARD-per-claim-verifier.md"
      provides: "Mitchell-2019 model card for the per-claim verifier component; sections per S4; references MODEL-CARD-cove (19-C-08) as upstream"
      contains: "Intended use"
    - path: "tests/eval/per-claim-verifier.unit.test.ts"
      provides: "≥6 unit cases: entail>0.7 → 'true'; entail≤0.7 → 'null'; contradict>0.7 → 'false'; contradict≤0.7 → 'null'; neutral → 'null'; NLI threw → 'null'; batch reuses callNli once per signal"
    - path: "tests/components/research-report-verified-badge.unit.test.tsx"
      provides: "RTL: badge renders for 'false' AND 'null'; badge does NOT render for 'true'; badge does NOT render when verified undefined (pre-plan reports); tooltip text literal asserted per verdict"
    - path: "tests/integration/per-claim-verification.integration.test.ts"
      provides: "Mocks 8-ticker SourcePackage fixtures (synthetic stand-in until 20-D-04 lands real ones); runs end-to-end verifier; asserts (a) latency < 30s, (b) every signal across all 8 reports has a non-undefined verdict, (c) baseline JSON file produced with the documented schema"
    - path: "package.json"
      provides: "Adds 'measure-claim-verification' npm script wiring to scripts/measure-claim-verification.ts so operators can `npm run measure-claim-verification` in one step"
      contains: "measure-claim-verification"
  key_links:
    - from: "src/lib/eval/per-claim-verifier.ts verifyClaimPerSignal()"
      to: "src/lib/sentiment/nli-verifier.ts nliVerify() (the 19-C-08 re-export)"
      via: "single-claim NLI call with strict 0.7 score threshold mapping"
      pattern: "from ['\"]@/lib/sentiment/nli-verifier['\"]"
    - from: "src/lib/eval/per-claim-verifier.ts verifyClaimsBatch()"
      to: "src/lib/eval/per-claim-verifier.ts verifyClaimPerSignal() (one call per signal, parallelized via Promise.allSettled)"
      via: "Promise.allSettled fan-out — failure on any single signal collapses to 'null' for that signal only, never aborts the batch"
      pattern: "Promise\\.allSettled"
    - from: "src/lib/gemini-analysis.ts runGeminiAnalysis() (post-Zod-validation)"
      to: "src/lib/eval/per-claim-verifier.ts verifyClaimsBatch()"
      via: "feature-flagged call wrapped in try/catch; result merged onto bullish_signals + bearish_signals + risks via positional signalId"
      pattern: "verifyClaimsBatch\\("
    - from: "src/components/ResearchReport.tsx (Growth Catalysts block lines 730-740 + Risk Vectors block lines 749-759)"
      to: "signal.verified field"
      via: "conditional render of the (?) badge as a sibling span next to source_citation; tooltip text driven by verdict"
      pattern: "verified"
    - from: "scripts/measure-claim-verification.ts"
      to: "src/lib/eval/per-claim-verifier.ts verifyClaimsBatch() + tests/golden-tickers/* SourcePackage fixtures (forward-ref to 20-D-04)"
      via: "iterates golden-ticker SourcePackages, runs verifier per report, aggregates verified counts per section, writes baseline JSON"
      pattern: "verifyClaimsBatch"
    - from: "docs/cards/MODEL-CARD-per-claim-verifier.md"
      to: "docs/cards/MODEL-CARD-cove.md (19-C-08 upstream — distilbert-mnli choice + 28/30 fixture accuracy)"
      via: "explicit 'Upstream dependency' section referencing the cove model card; this card extends the report-level verifier to per-claim granularity but does NOT re-evaluate the NLI model choice"
      pattern: "MODEL-CARD-cove"
---

# Plan 20-D-03: Per-claim confidence (CoVe extension — per-signal verified field + UI badge)

<universal_preamble>

## Autonomous Execution Clause

This plan is fully autonomous. No operator step is required. All file writes, schema extensions, tests, baseline measurement (against synthetic golden-ticker fixtures until 20-D-04 ships real ones), and commits proceed without prompts.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **Shadow lifecycle is staged but NOT graduated in this plan** — feature ships in `off` mode by default; cutover from `shadow → on` is performed in a follow-up plan filed at cutover time (`20-D-03-FOLLOWUP-CUTOVER`) once the four numerical cutover criteria in frontmatter `shadow_lifecycle.cutover_criteria` are met. This plan ships the shadow infrastructure + the `off` path only.
2. **No old code deleted** (additive — extends `AnalysisResultSchema`, extends `AnalysisSignal`, adds new `risks` array sibling to the legacy `key_risks` string, extends Sentiment / Growth Catalysts / Risk Vectors blocks in `ResearchReport.tsx`, adds new `src/lib/eval/per-claim-verifier.ts`, adds new measurement script).
3. **Feature flag `FEATURE_PER_CLAIM_VERIFIED: 'off' | 'shadow' | 'on'` introduced in `src/lib/features.ts`** with default `off`. The `off` path is preserved verbatim until `20-D-03-FOLLOWUP-CUTOVER` removes it (per S3 hard cleanup gate — deletion is the FOLLOWUP plan's responsibility, not this plan's).
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest where applicable), and `npm run test:e2e` (Playwright RTL component test) all green on `main` post-commit.
5. **Backward Compatibility Gate**: integration test loads ≥1 pre-plan `AnalysisResult` JSON fixture and round-trips it through the new Zod schema with NO failures AND no `verified` field appears on output. Proves `.optional()` placement at the per-signal level holds for all persisted reports.
6. **Verifier Latency Gate**: integration test asserts 8 synthetic golden-ticker reports (~80 signals total at ~10 signals per report) complete `verifyClaimsBatch` end-to-end in < 30 seconds wall-clock (mocked HF inference at the unit-test layer; live HF at the integration layer when `HF_DISTILBERT_MNLI_ENDPOINT` is set, otherwise the integration test skips this leg with `it.todo`).
7. **Baseline Output Gate**: `npm run measure-claim-verification` against the synthetic 8-ticker fixture EITHER (a) writes `reports/per-claim-verification-baseline-{YYYY-MM-DD}.json` with the documented schema, OR (b) exits with code 4 (`NO_GOLDEN_FIXTURES`) AND the operator log records the reason. Both outcomes accepted; silent failure not.
8. **UI Render Gate**: RTL test asserts the (?) badge renders for `verified === 'false'` AND for `verified === 'null'`, does NOT render for `verified === 'true'`, and does NOT render when `verified` is `undefined`. Tooltip text matches the three literal strings.
9. **Model Card Gate**: `docs/cards/MODEL-CARD-per-claim-verifier.md` committed. Passes 20-Z-02 `check-model-cards.ts` if it exists at the time this plan ships (forward-reference: if 20-Z-02 has not landed yet, file presence is sufficient — schema linting deferred to 20-Z-02).
10. **HYPERPARAMETERS Gate**: `HYPERPARAMETERS.md` contains a `## per_claim_verifier` section documenting the 0.7 entailment + 0.7 contradiction thresholds and the recalibration rule.

## Cross-cutting standards adherence (CONTEXT.md §S1–S10)

- **S4 (model card per artifact)** — `docs/cards/MODEL-CARD-per-claim-verifier.md` committed. The per-claim verifier is a composite signal layered on top of 19-C-08's distilbert-mnli; the card documents intended use ("per-claim entailment verification against SourcePackage evidence"), evaluation metrics (baseline verified-rate measured per-ticker × per-section in `reports/per-claim-verification-baseline-{date}.json`), out-of-distribution behavior (claims that lack any matching source language → 'null', not 'false'), ethical considerations (UI badge framing as "could not verify" never as "false claim"), known failure modes (long claims truncated to 500 chars per 19-C-08 MAX_CLAIM_LEN; very-long SourcePackages truncated to 5000 chars), and retrain cadence (re-evaluate after 200 shadow comparisons land — same convention as 19-C-08 fixture footer).
- **S7 (threat model)** — five plan-level threats T-20-D-03-{01..05} below. The 0.7 thresholds mitigate T-20-D-03-01 (false-positive 'true') and T-20-D-03-02 (false-positive 'false'). UI clean-default (no badge on 'true') mitigates T-20-D-03-03 (user distrust). Batched verification mitigates T-20-D-03-04 (latency). Optional schema field mitigates T-20-D-03-05 (consumer breakage).
- **S8 (numerical acceptance)** — every gate above is grep / row-count / latency / file-existence. Zero adjectives. Verified-rate baseline is a JSON file with counts (not "looks correct").
- **S10 (regulatory hygiene)** — UI tooltip text is informational framing ("Could not verify against source data") NOT a recommendation or claim of falsehood. The 'false' verdict's literal tooltip is "Source data contradicts this claim" — factual contradiction language, NOT investment-advice language. RTL test asserts the literal strings.

## Out-of-scope (do NOT plan in this plan)

- The 19-C-08 NLI verifier itself (already shipped; this plan strictly reuses it via `@/lib/sentiment/nli-verifier`).
- Citation-coverage metric (20-D-02 — separate plan).
- Numeric grounding regression test (20-D-01 — separate plan).
- Golden-ticker SourcePackage fixtures (20-D-04 — separate plan). This plan uses SYNTHETIC stand-in fixtures until 20-D-04 lands; the measurement script gracefully exits 4 (`NO_GOLDEN_FIXTURES`) when the real `tests/golden-tickers/` directory is empty.

</universal_preamble>

<objective>
Extend the existing report-level CoVe Pass-2 NLI verification (19-C-08) to per-claim granularity. Every `bullish_signal`, `bearish_signal`, and (newly-extracted) `risk` claim in `AnalysisResult` gains a `verified ∈ {'true' | 'false' | 'null'}` field driven by an NLI check against the SourcePackage. The UI renders a visible (?) badge next to claims where `verified !== 'true'` so the user sees, at-a-glance, which claims survived the verifier and which did not.

This is a granularity extension — NOT a re-implementation of the verifier. The 19-C-08 plan shipped `runCoVe` + `nliVerify` (distilbert-mnli at cross-encoder/nli-distilroberta-base, selected 28/30 vs FinBERT-tone 22/30 on the 30-row labeled fixture at `tests/fixtures/nli-eval-labels.tsv`). This plan ships:

- A per-claim orchestrator (`verifyClaimPerSignal` + `verifyClaimsBatch`) wrapping the existing `nliVerify` shim.
- Strict score thresholds (entailment > 0.7 → `'true'`; contradiction > 0.7 → `'false'`; otherwise `'null'`) so the verifier defaults to the conservative `'null'` verdict on weak signal.
- A `verified` optional field on each `AnalysisSignal` (Zod-validated, backward-compatible).
- A UI badge that renders only on `verified ∈ {'false', 'null'}` AND only when `FEATURE_PER_CLAIM_VERIFIED === 'on'`.
- A baseline measurement script that emits per-ticker × per-section verified-rate to `reports/per-claim-verification-baseline-{date}.json`.

Per S1, the 0.7 thresholds are LITERATURE-DEFAULTS from the HF text-classification top-score convention (the `nliVerify` implementation in `src/lib/reasoning/cove.ts` already picks the highest-probability label — this plan tightens that to require the probability ALSO exceed 0.7). They are documented in `HYPERPARAMETERS.md` and re-evaluated after 200+ shadow comparisons (same convention as 19-C-08).

Ships in `off` mode with shadow infrastructure ready. Cutover (`shadow → on` + off-path deletion) is a follow-up plan filed when the 4 numerical cutover criteria in frontmatter are met.

Purpose: today the user sees `bullish_signal: "Revenue grew 45% YoY"` with `source_citation: "Finnhub fundamentals"` — but they have no signal whether the model HALLUCINATED the 45% or sourced it. The (?) badge surfaces the verifier's verdict per claim so the user reads "this claim survived the NLI check" or "this claim could not be verified against the SourcePackage" at-a-glance.

Output:
- 1 new module: `src/lib/eval/per-claim-verifier.ts` (~120 LOC, zero new NLI infra — pure orchestration over 19-C-08's `nliVerify`)
- 1 schema extension: optional `verified` on each `AnalysisSignal` (Zod + TypeScript)
- 1 risks-as-array sibling: optional `AnalysisResult.risks?: Array<{description, source_citation?, verified?}>` (additive to the existing `key_risks` string)
- 1 wiring change in `runGeminiAnalysis` (post-Zod-validation call to `verifyClaimsBatch`, feature-flag gated)
- 1 UI change in `ResearchReport.tsx` (inline (?) badge inside the existing bullish + bearish + risks blocks)
- 1 measurement script: `scripts/measure-claim-verification.ts`
- 1 baseline JSON: `reports/per-claim-verification-baseline-{date}.json` (committed on first successful run)
- 1 unit test file: `tests/eval/per-claim-verifier.unit.test.ts` (≥6 cases)
- 1 RTL test file: `tests/components/research-report-verified-badge.unit.test.tsx`
- 1 integration test: `tests/integration/per-claim-verification.integration.test.ts`
- 1 HYPERPARAMETERS.md entry
- 1 Mitchell-2019 model card
- 1 npm script wiring
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-C-08-SUMMARY.md
@.planning/phases/19-cipher-v2-0-excellence/19-C-08-PLAN.md
@CLAUDE.md
@src/lib/reasoning/cove.ts
@src/lib/sentiment/nli-verifier.ts
@src/lib/gemini-analysis.ts
@src/lib/types.ts
@src/components/ResearchReport.tsx

<interfaces>

```typescript
// src/lib/eval/per-claim-verifier.ts — NEW. Pure orchestration over 19-C-08 nliVerify.
//
// Reuses @/lib/sentiment/nli-verifier (which is itself a re-export of
// @/lib/reasoning/cove.nliVerify per 19-C-08). NO new HF endpoint, NO new
// env var. The 19-C-08 endpoint HF_DISTILBERT_MNLI_ENDPOINT gates the verifier;
// when unset, nliVerify safe-defaults to 'neutral' → this module returns 'null'
// for every signal (off-state behavior is bit-identical to today).

export type PerClaimVerdict = 'true' | 'false' | 'null';

/**
 * Single-claim verifier. Wraps nliVerify with strict 0.7 score thresholds.
 *
 * Returns:
 *   - 'true'  iff NLI returned 'entail' AND top-label probability > 0.7
 *   - 'false' iff NLI returned 'contradict' AND top-label probability > 0.7
 *   - 'null'  on NLI 'neutral' OR null (threw/endpoint-unset) OR top score ≤ 0.7
 *
 * Threshold rationale (HYPERPARAMETERS.md `per_claim_verifier` section):
 *   - 0.7 is the HF text-classification top-score convention for "high confidence"
 *     (consistent with the implicit selection logic in cove.ts that picks the
 *     highest-prob label regardless of magnitude — this layer ADDS the magnitude gate).
 *   - Below 0.7 collapses to 'null' (insufficient evidence) — never to 'true' or 'false'.
 *     This is the conservative-default principle: an under-confident verdict is
 *     surfaced as "could not verify" (UI shows (?)), not as a false confirmation
 *     or false contradiction.
 *   - Re-evaluate after 200+ shadow comparisons land in production.
 */
export async function verifyClaimPerSignal(
  signal: { description: string; supporting_evidence?: string },
  sourcePackage: SourcePackage,
): Promise<PerClaimVerdict>;

/**
 * Batched verification across a heterogeneous signal array.
 *
 * Input signals are stamped with positional IDs by the caller (e.g.
 * `bullish-0`, `bullish-1`, ..., `bearish-0`, ..., `risks-0`, ...). The caller
 * passes the array along with their IDs; the returned Map preserves the IDs so
 * the caller can merge verdicts back onto the AnalysisResult by position.
 *
 * Per-signal failures collapse to 'null' WITHOUT aborting the batch
 * (Promise.allSettled — mirrors 19-C-08 runWithCove belt-and-suspender pattern).
 *
 * Cost gate: this function makes ONE callNli per signal — never one per
 * claim-token, never one per source-fact. The 19-C-08 cost gate (Pitfall 5)
 * is the precedent — evidence is the JSON-stringified SourcePackage truncated
 * to 5000 chars per call. With ~10 signals per report and ~80 signals across
 * the 8 golden tickers, total NLI calls per measurement run = 80.
 */
export async function verifyClaimsBatch(
  signals: Array<{ id: string; description: string; supporting_evidence?: string }>,
  sourcePackage: SourcePackage,
): Promise<Map<string, PerClaimVerdict>>;
```

```typescript
// src/lib/types.ts — EXTEND. Additive optional field on AnalysisSignal.

export interface AnalysisSignal {
  signal: string;
  source_citation: string;
  // ── NEW (Plan 20-D-03) ─────────────────────────────────────
  /**
   * 'true'  → NLI entailment > 0.7 against SourcePackage
   * 'false' → NLI contradiction > 0.7 against SourcePackage
   * 'null'  → insufficient evidence (NLI neutral / threw / endpoint unset / score ≤ 0.7)
   * undefined → pre-plan persisted report OR FEATURE_PER_CLAIM_VERIFIED === 'off'
   */
  verified?: 'true' | 'false' | 'null';
}

// AnalysisResult gains an additional sibling to the existing `key_risks` string:
export interface AnalysisRisk {
  description: string;          // Extracted from key_risks paragraph by Gemini Pass-1
  source_citation?: string;     // Optional — risks may not cite a specific source
  verified?: 'true' | 'false' | 'null';
}

export interface AnalysisResult {
  // ... existing fields preserved verbatim ...
  /**
   * Optional structured risks list parallel to the existing free-text `key_risks` paragraph.
   * Both fields ship side-by-side; the legacy `key_risks` string is NOT touched. UI may render
   * either — per Plan 20-D-03 the (?) badge renders against `risks[*].verified` when present.
   */
  risks?: AnalysisRisk[];
}
```

```typescript
// src/lib/gemini-analysis.ts — EXTEND AnalysisResultSchema + wire verifyClaimsBatch.

// Schema extension (additive — placed inline on existing bullish_signals / bearish_signals):
//
//   bullish_signals: z.array(z.object({
//     signal: z.string(),
//     source_citation: z.string(),
//     verified: z.enum(['true', 'false', 'null']).optional(),   // ← NEW
//   })).min(1).max(5),
//
//   bearish_signals: z.array(z.object({
//     signal: z.string(),
//     source_citation: z.string(),
//     verified: z.enum(['true', 'false', 'null']).optional(),   // ← NEW
//   })).min(1).max(5),
//
//   risks: z.array(z.object({                                    // ← NEW
//     description: z.string(),
//     source_citation: z.string().optional(),
//     verified: z.enum(['true', 'false', 'null']).optional(),
//   })).max(7).optional(),
//
// Backward compat: every new field is .optional() — pre-plan persisted reports
// continue to parse.

// Wiring (post-Zod-validation, pre-return, inside runGeminiAnalysis):
//
//   const verifiedMode = FEATURES.per_claim_verified_mode;  // 'off' | 'shadow' | 'on'
//   if (verifiedMode !== 'off') {
//     try {
//       const signals = [
//         ...result.bullish_signals.map((s, i) => ({ id: `bullish-${i}`, description: s.signal, supporting_evidence: s.source_citation })),
//         ...result.bearish_signals.map((s, i) => ({ id: `bearish-${i}`, description: s.signal, supporting_evidence: s.source_citation })),
//         ...(result.risks ?? []).map((r, i) => ({ id: `risks-${i}`, description: r.description, supporting_evidence: r.source_citation })),
//       ];
//       const verdicts = await verifyClaimsBatch(signals, pkg);
//       // Merge verdicts back onto result by positional id:
//       result.bullish_signals = result.bullish_signals.map((s, i) => ({ ...s, verified: verdicts.get(`bullish-${i}`) }));
//       result.bearish_signals = result.bearish_signals.map((s, i) => ({ ...s, verified: verdicts.get(`bearish-${i}`) }));
//       if (result.risks) result.risks = result.risks.map((r, i) => ({ ...r, verified: verdicts.get(`risks-${i}`) }));
//     } catch {
//       // Belt-and-suspender: never abort the report on verifier failure.
//     }
//   }
//   return result;
```

```typescript
// src/components/ResearchReport.tsx — EXTEND Growth Catalysts + Risk Vectors blocks.
//
// The badge is an inline <span> sibling to the existing source_citation span.
// Gated on FEATURE_PER_CLAIM_VERIFIED === 'on' AND verified ∈ {'false', 'null'}.

// Inside the bullish_signals .map() at lines 730-740, after the source_citation span:
//
//   {process.env.NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED === 'on' &&
//     s.verified !== undefined && s.verified !== 'true' && (
//       <span
//         role="img"
//         aria-label={s.verified === 'false'
//           ? 'Source data contradicts this claim'
//           : 'Insufficient source data to verify'}
//         title={s.verified === 'false'
//           ? 'Source data contradicts this claim'
//           : 'Insufficient source data to verify'}
//         className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold text-on-surface-variant bg-surface-container-high rounded-full cursor-help"
//       >
//         ?
//       </span>
//   )}
//
// Repeat identical pattern for bearish_signals at lines 749-759 and (new) risks block.
```

```typescript
// scripts/measure-claim-verification.ts — NEW. Operator + (future cron) runnable.

/**
 * Iterates 8 golden ticker SourcePackages (forward-ref from 20-D-04), runs
 * verifyClaimsBatch on each, aggregates verified-rate per section, writes
 * baseline JSON to reports/per-claim-verification-baseline-{date}.json.
 *
 * Output JSON schema:
 *   {
 *     run_date: string;                  // ISO 8601
 *     golden_ticker_count: number;       // expected: 8 (or fewer if some absent)
 *     verifier_latency_ms_total: number;
 *     per_ticker: {
 *       [ticker: string]: {
 *         bullish: { true: number; false: number; null: number };
 *         bearish: { true: number; false: number; null: number };
 *         risks:   { true: number; false: number; null: number };
 *       }
 *     };
 *     totals: { true: number; false: number; null: number };
 *   }
 *
 * Exit codes:
 *   0 — success (baseline written)
 *   4 — NO_GOLDEN_FIXTURES (tests/golden-tickers/ empty — forward-ref to 20-D-04)
 *   5 — NLI_ENDPOINT_DOWN (every signal returned 'null' AND HF_DISTILBERT_MNLI_ENDPOINT was set)
 */
export async function runMeasurement(opts?: {
  goldenDir?: string;          // default 'tests/golden-tickers'
  outputDir?: string;          // default 'reports'
  dryRun?: boolean;            // default false
}): Promise<{
  exit_code: 0 | 4 | 5;
  baseline_path: string | null;
  totals: { true: number; false: number; null: number };
}>;
```

</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Gemini-analysis-result → per-claim-verifier | Per-signal text crosses into NLI call; truncated to 500 chars per 19-C-08 MAX_CLAIM_LEN to bound cost + prompt-injection-grade payload risk. |
| per-claim-verifier → HF Inference | NLI call to distilbert-mnli endpoint; endpoint URL never logged per 19-C-08 T-19-C-08-01. |
| per-claim-verifier → AnalysisResult writer | Verdict map merged back onto signals by positional id — ordering invariant must hold or verdicts get attached to the wrong claims. |
| AnalysisResult → ResearchReport.tsx UI | (?) badge user-visible — false 'true' verdicts mask real hallucinations; false 'false' verdicts create unwarranted alarm; clean default (no badge on 'true') is the trust contract. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-D-03-01 | Information disclosure / FP confirmation | `verifyClaimPerSignal` returning `'true'` on an uncheckable claim (low entailment score) — user trusts a hallucinated number because the (?) badge is absent | mitigate | Strict 0.7 entailment threshold: NLI label === 'entail' is necessary but NOT sufficient — the top-label score must ALSO exceed 0.7. Below 0.7 collapses to `'null'` (UI renders (?) badge). Unit test asserts the threshold literally (score 0.69 → 'null'; score 0.71 → 'true'). HF text-classification top-score is between 0 and 1; the 0.7 cut is documented in `HYPERPARAMETERS.md` per_claim_verifier section. **Severity: HIGH** — silent FP would defeat the entire UI badge's purpose. |
| T-20-D-03-02 | Information disclosure / FP contradiction | `verifyClaimPerSignal` returning `'false'` on a legitimate-but-source-omitted claim (e.g., claim mentions Q3 guidance but SourcePackage only contains Q2 data — neutral, not contradiction) creates a false alarm and erodes user trust | mitigate | Strict 0.7 contradiction threshold: NLI label === 'contradict' AND top score > 0.7. Below 0.7 collapses to `'null'` ("insufficient source data to verify"), which is BOTH the correct framing AND the conservative default. The UI badge for `'null'` reads "Insufficient source data to verify" — NOT "false claim". Unit test asserts the threshold. **Severity: HIGH** — under-confident `'false'` verdicts on omitted-but-true claims would generate user-visible regulatory exposure ("the AI said my analyst was wrong"). |
| T-20-D-03-03 | Repudiation / user-distrust spillover | If the (?) badge appears next to EVERY signal (because the verifier is over-conservative), the user dismisses the badge as noise and stops reading it — neutralizing the entire feature | mitigate | Clean-default UI contract: NO badge renders for `verified === 'true'` (absence is the success signal). The badge renders only when `verified ∈ {'false', 'null'}`. The cutover criterion measures per-ticker × per-section verified-rate via `reports/per-claim-verification-baseline-{date}.json` — operator reviews the baseline before flipping `FEATURE_PER_CLAIM_VERIFIED=on`. If `null` rate > 60% on golden tickers, the cutover is BLOCKED and HYPERPARAMETERS.md needs tuning (lower the score threshold or re-evaluate the NLI model). Forward-reference: a 20-D-03-FOLLOWUP plan adjusts thresholds if the baseline shows excessive `'null'` verdicts. **Severity: MEDIUM** — degrades feature trust over time but does not invalidate methodology. |
| T-20-D-03-04 | Denial of service / latency | Per-signal NLI call adds N × latency_per_call to report generation (N = ~10 signals); even at 200ms per call this is 2s added to the user-facing path | mitigate | Two mitigations: (1) `verifyClaimsBatch` uses `Promise.allSettled` so all N calls run in parallel — wall-clock is one call's latency, not N calls; (2) shadow-mode runs are wrapped in `setImmediate` so the verifier NEVER lands on the user-facing latency path during shadow — same pattern as 19-C-08 `runWithShadow('cove-two-pass', ...)`. On-mode latency budget: < 30s wall-clock for the entire 8-golden-ticker measurement (~80 signals) — gated by the integration test. If a future change pushes per-claim latency to >2s, the test fails and forces re-design. **Severity: MEDIUM** — observable in 20-Z-03 (forward-ref) telemetry; cron-mode latency lives outside user path. |
| T-20-D-03-05 | Business logic / consumer breakage | Adding a non-optional `verified` field to `AnalysisSignal` breaks every persisted report and every downstream consumer (UI, PDF generator, shadow-verdict CLI) | mitigate | Schema field placement: `verified` is `z.enum([...]).optional()` at the per-SIGNAL level, NOT at the array level. Pre-plan reports (persisted as `Report.analysis JSONB` in Neon) round-trip through the new Zod schema with NO failures — proven by the Backward Compatibility Gate integration test that loads ≥1 pre-plan AnalysisResult fixture. The UI conditional render checks `verified !== undefined` so old reports render IDENTICALLY to before — no badge, no layout shift. **Severity: HIGH if introduced** — would block production deploy; mitigation makes this physically impossible by construction. |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-D-03-01">
  <name>Task 1: Write failing per-claim-verifier unit tests + backward-compat schema test</name>
  <files>tests/eval/per-claim-verifier.unit.test.ts, tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts</files>
  <read_first>
    - src/lib/reasoning/cove.ts (existing nliVerify contract — return type 'entail' | 'contradict' | 'neutral' | null)
    - src/lib/sentiment/nli-verifier.ts (re-export shim — the import path for vi.mock targets)
    - .planning/phases/19-cipher-v2-0-excellence/19-C-08-SUMMARY.md ("3 entail → all true / no warnings" test pattern)
    - src/lib/gemini-analysis.ts lines 75-82 (existing bullish_signals + bearish_signals Zod schema — placement of new .optional() field)
  </read_first>
  <behavior>
    `tests/eval/per-claim-verifier.unit.test.ts` (≥6 cases):
    - Test 1: `verifyClaimPerSignal` — NLI mocked to return label='entail', score=0.85 → returns 'true'
    - Test 2: `verifyClaimPerSignal` — NLI mocked to return label='entail', score=0.65 → returns 'null' (below 0.7 threshold)
    - Test 3: `verifyClaimPerSignal` — NLI mocked to return label='contradict', score=0.80 → returns 'false'
    - Test 4: `verifyClaimPerSignal` — NLI mocked to return label='contradict', score=0.55 → returns 'null' (below 0.7 threshold)
    - Test 5: `verifyClaimPerSignal` — NLI mocked to return label='neutral', score=0.99 → returns 'null' (neutral never collapses to true/false regardless of score)
    - Test 6: `verifyClaimPerSignal` — NLI mocked to THROW → returns 'null' (graceful degrade — mirrors 19-C-08 belt-and-suspender)
    - Test 7: `verifyClaimsBatch` — 3 mocked signals (entail/contradict/neutral) → returned Map has 3 entries keyed by `bullish-0`, `bullish-1`, `bullish-2` with verdicts ['true', 'false', 'null']
    - Test 8: `verifyClaimsBatch` — one signal's NLI throws while others succeed → that signal's verdict is 'null', others' verdicts are unaffected (Promise.allSettled semantics)

    `tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts` (≥2 cases):
    - Test 1: Load `tests/fixtures/pre-20-D-03-analysis-result.json` (a synthetic pre-plan AnalysisResult with NO `verified` field on any signal) — parse through the new `AnalysisResultSchema` — assert NO Zod failure AND output retains undefined `verified` on every signal.
    - Test 2: Parse a same-shape result that DOES include `verified: 'true'` on one signal — assert the field round-trips correctly through Zod.

    All tests RED (module + fixture do not exist yet).

    The Task 1 outputs are: (a) the test files, (b) a one-page synthetic AnalysisResult JSON fixture at `tests/fixtures/pre-20-D-03-analysis-result.json` representing the shape of a persisted report from before this plan ships. Use the same field set as the current `AnalysisResultSchema` minus the new `verified` fields. The fixture must include ≥3 bullish_signals + ≥3 bearish_signals so the batch test has enough data.
  </behavior>
  <action>
    Create the two test files above plus `tests/fixtures/pre-20-D-03-analysis-result.json`. Use `import { verifyClaimPerSignal, verifyClaimsBatch } from '@/lib/eval/per-claim-verifier'` — module does not yet exist, confirming RED state.

    For the NLI mock: `vi.mock('@/lib/sentiment/nli-verifier', () => ({ nliVerify: vi.fn() }))` — but note that `nliVerify` currently returns ONLY a label (`'entail' | 'contradict' | 'neutral' | null`), NOT a {label, score} object. This plan's verifier needs the SCORE too, so this task's mock MUST mock the underlying HF call OR mock a NEW function that the verifier wraps.

    Decision (S1 — no hand-picked architecture, but this is a structural choice not a parameter): the per-claim verifier introduces ONE new exported function in `src/lib/reasoning/cove.ts` named `nliVerifyWithScore(claim, evidence)` that returns `{ label: NliLabel | null; score: number | null }` — the score is the top-label probability from the HF response. The existing `nliVerify` function is preserved verbatim (no behavior change to 19-C-08 callers). `verifyClaimPerSignal` consumes `nliVerifyWithScore`; the mock target is therefore `@/lib/reasoning/cove` (not `@/lib/sentiment/nli-verifier`).

    This decision is documented inline in the test file header comment and again in Task 3's implementation file header.
  </action>
  <verify>
    <automated>npx vitest run tests/eval/per-claim-verifier.unit.test.ts tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts 2>&amp;1 | grep -qE "FAIL|Cannot find module"</automated>
  </verify>
  <done>≥10 unit tests written across 2 files; all RED (module + Zod extension not yet shipped).</done>
</task>

<task type="auto" tdd="true" id="20-D-03-02">
  <name>Task 2: Implement src/lib/eval/per-claim-verifier.ts + extend nliVerify with score</name>
  <files>src/lib/eval/per-claim-verifier.ts, src/lib/reasoning/cove.ts</files>
  <read_first>
    - tests/eval/per-claim-verifier.unit.test.ts (the contracts)
    - src/lib/reasoning/cove.ts (existing nliVerify HF Inference path; we extend with a sibling function that ALSO returns the top-label score)
    - src/lib/sentiment/nli-verifier.ts (re-export shim — DO NOT touch; the new function is added to cove.ts NOT to the shim)
  </read_first>
  <action>
    1. **Extend `src/lib/reasoning/cove.ts`** with a new exported function `nliVerifyWithScore(claim, evidence)` that mirrors `nliVerify` but ALSO returns the top-label probability score. Preserve the existing `nliVerify` function verbatim (zero behavior change to 19-C-08 callers — the contradiction detector, runCoVe internal callNli, and the 19-C-10 detection-only path all keep working).

       ```typescript
       export interface NliVerdictWithScore {
         label: NliLabel | null;   // 'entail' | 'contradict' | 'neutral' | null
         score: number | null;      // top-label probability ∈ [0, 1], null on throw / endpoint-unset
       }

       export async function nliVerifyWithScore(
         claim: string,
         evidence: string,
       ): Promise<NliVerdictWithScore> {
         const endpoint = process.env.HF_DISTILBERT_MNLI_ENDPOINT;
         if (!endpoint) return { label: 'neutral', score: null };  // detection-only mode: same safe-default
         try {
           const { HfInference } = await import('@huggingface/inference');
           const token = process.env.HF_INFERENCE_TOKEN;
           if (!token) return { label: 'neutral', score: null };
           const client = new HfInference(token);
           const out = await client.textClassification({
             model: endpoint,
             inputs: `${claim} [SEP] ${evidence}`,
           });
           const arr = (Array.isArray(out) ? out : [out]) as Array<{ label: string; score: number }>;
           if (arr.length === 0) return { label: 'neutral', score: null };
           let best = arr[0];
           for (const r of arr) if (r.score > best.score) best = r;
           const lower = best.label.toLowerCase();
           const label: NliLabel = lower.startsWith('entail') ? 'entail'
             : lower.startsWith('contradict') ? 'contradict'
             : 'neutral';
           return { label, score: best.score };
         } catch {
           return { label: null, score: null };   // SECURITY: do not log the endpoint URL (T-19-C-08-01).
         }
       }
       ```

       Inline header comment in `cove.ts` explains: "20-D-03 adds `nliVerifyWithScore` as a score-returning sibling to `nliVerify`. The existing `nliVerify` is preserved verbatim for 19-C-08 + 19-C-10 callers that only need the label."

    2. **Create `src/lib/eval/per-claim-verifier.ts`** implementing `verifyClaimPerSignal` + `verifyClaimsBatch` per the `<interfaces>` block. Implementation skeleton:

       ```typescript
       // src/lib/eval/per-claim-verifier.ts
       //
       // Phase 20 / Plan 20-D-03 — Per-claim NLI verification (CoVe extension).
       //
       // Wraps 19-C-08's nliVerifyWithScore (new sibling to nliVerify) at single-claim
       // granularity. Strict 0.7 score thresholds: entail > 0.7 → 'true'; contradict > 0.7
       // → 'false'; otherwise 'null' (conservative default). Per HYPERPARAMETERS.md
       // per_claim_verifier section — re-evaluate after 200+ shadow comparisons.

       import { nliVerifyWithScore } from '@/lib/reasoning/cove';
       import type { SourcePackage } from '@/lib/types';

       export type PerClaimVerdict = 'true' | 'false' | 'null';

       const SCORE_THRESHOLD = 0.7;
       const MAX_CLAIM_LEN = 500;
       const MAX_EVIDENCE_LEN = 5000;

       export async function verifyClaimPerSignal(
         signal: { description: string; supporting_evidence?: string },
         sourcePackage: SourcePackage,
       ): Promise<PerClaimVerdict> {
         const claim = (signal.description ?? '').slice(0, MAX_CLAIM_LEN);
         const evidence = JSON.stringify(sourcePackage).slice(0, MAX_EVIDENCE_LEN);
         const { label, score } = await nliVerifyWithScore(claim, evidence);
         if (label === null) return 'null';
         if (label === 'entail' && score !== null && score > SCORE_THRESHOLD) return 'true';
         if (label === 'contradict' && score !== null && score > SCORE_THRESHOLD) return 'false';
         return 'null';
       }

       export async function verifyClaimsBatch(
         signals: Array<{ id: string; description: string; supporting_evidence?: string }>,
         sourcePackage: SourcePackage,
       ): Promise<Map<string, PerClaimVerdict>> {
         const out = new Map<string, PerClaimVerdict>();
         const results = await Promise.allSettled(
           signals.map(s => verifyClaimPerSignal(s, sourcePackage).then(v => [s.id, v] as const)),
         );
         for (let i = 0; i < signals.length; i++) {
           const r = results[i];
           if (r.status === 'fulfilled') out.set(r.value[0], r.value[1]);
           else out.set(signals[i].id, 'null');
         }
         return out;
       }
       ```

    3. Run all tests from Task 1 — every test GREEN.

    Do NOT touch `gemini-analysis.ts` Zod schema yet (that's Task 4).
    Do NOT touch the UI yet (that's Task 5).
    Do NOT touch the schema-backcompat test fixture wiring yet — Task 4 extends the Zod schema; until then the backcompat test parses against the OLD schema and trivially passes.
  </action>
  <verify>
    <automated>npx vitest run tests/eval/per-claim-verifier.unit.test.ts</automated>
  </verify>
  <done>`src/lib/eval/per-claim-verifier.ts` exists; `nliVerifyWithScore` exported from `src/lib/reasoning/cove.ts`; Task 1's per-claim-verifier.unit.test.ts is fully GREEN (≥8 tests pass). The schema-backcompat test stays RED until Task 4 wires the Zod schema.</done>
</task>

<task type="auto" id="20-D-03-03">
  <name>Task 3: Introduce FEATURE_PER_CLAIM_VERIFIED three-mode flag in src/lib/features.ts</name>
  <files>src/lib/features.ts</files>
  <read_first>
    - src/lib/features.ts (existing FLAG_NAMES + FeatureMode pattern from Phase 19)
    - .planning/phases/19-cipher-v2-0-excellence/19-Z-01-PLAN.md or 19-C-08-PLAN.md (FEATURE_COVE_TWO_PASS as the precedent template)
  </read_first>
  <action>
    Append `'per_claim_verified'` to `FLAG_NAMES` (or the equivalent registry) following the existing 'cove_two_pass' precedent. Default mode is `'off'`. The env var read is `FEATURE_PER_CLAIM_VERIFIED`. Surface as `FEATURES.per_claim_verified_mode: 'off' | 'shadow' | 'on'`.

    Also surface a client-side flag so `ResearchReport.tsx` (React component) can gate the (?) badge render: `NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED` env var read at build time. Document the client-side env var in `.env.example` (append at the bottom — additive).

    No tests required for the flag plumbing itself (the existing features.ts has its own test pattern from Phase 19 — extend in-place if those tests use a hard-coded flag list).
  </action>
  <verify>
    <automated>grep -q "per_claim_verified" src/lib/features.ts &amp;&amp; grep -q "NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED" .env.example</automated>
  </verify>
  <done>Three-mode flag exists; default 'off'; client-side surface available for the UI gate.</done>
</task>

<task type="auto" id="20-D-03-04">
  <name>Task 4: Extend AnalysisResultSchema with optional verified field + wire verifyClaimsBatch in runGeminiAnalysis</name>
  <files>src/lib/gemini-analysis.ts, src/lib/types.ts</files>
  <read_first>
    - src/lib/gemini-analysis.ts lines 64-156 (the AnalysisResultSchema — find bullish_signals at line 75, bearish_signals at line 79; the new optional `verified` enum lands inline on the existing z.object())
    - src/lib/gemini-analysis.ts lines 1267-1280 (the return-shape passthrough — currently maps output.bullish_signals → result.bullish_signals)
    - src/lib/types.ts line 211 (AnalysisSignal) and lines 393-469 (AnalysisResult)
  </read_first>
  <action>
    1. **`src/lib/types.ts`**: Add the optional `verified?: 'true' | 'false' | 'null'` field to `AnalysisSignal` per the `<interfaces>` block. Add the new `AnalysisRisk` interface. Add the optional `risks?: AnalysisRisk[]` field to `AnalysisResult`. **Preserve every existing field verbatim — additive ONLY.**

    2. **`src/lib/gemini-analysis.ts` AnalysisResultSchema** (lines 64-156): extend `bullish_signals` and `bearish_signals` Zod array element shapes to include `verified: z.enum(['true', 'false', 'null']).optional()`. Add a new optional top-level `risks: z.array(z.object({ description: z.string(), source_citation: z.string().optional(), verified: z.enum(['true', 'false', 'null']).optional() })).max(7).optional()` sibling to the existing `key_risks` string. **DO NOT modify the existing `key_risks` field** — both fields ship side-by-side.

    3. **`src/lib/gemini-analysis.ts` runGeminiAnalysis** (the function exporting the analysis pipeline — likely around the runWithShadow('cove-two-pass', ...) wrap from 19-C-08): AFTER the Zod parse + ALL existing post-process (engine-context overwrite, citations_v2 passthrough, cove_verified passthrough, etc.) completes — but BEFORE the function returns — INSERT the per-claim verification wiring per the `<interfaces>` block. The wiring is wrapped in `if (FEATURES.per_claim_verified_mode !== 'off')` AND a try/catch that swallows verifier failure (belt-and-suspender — never abort the report on NLI failure).

       Sub-decision on shadow-mode persistence: in `shadow` mode, the verdicts ARE written onto `result.bullish_signals[*].verified` etc. (in-memory), but the UI gate keeps the badge hidden. The shadow surface is therefore the persisted `Report.analysis` JSONB column — operator inspects via SQL or admin tooling. NO new ShadowComparison row is written for this plan (the persisted AnalysisResult IS the shadow surface). This is a deviation from 19-C-08's pattern that's intentional: per-claim verdicts are too high-cardinality for the ShadowComparison schema (which records one path per request), and the in-memory persistence onto AnalysisResult is the cleaner surface for the cutover criteria (operator runs `npm run measure-claim-verification` against ANY recent report set).

    4. **Update the return-shape passthrough block** (lines ~1267-1280): ensure `bullish_signals` and `bearish_signals` are passed through with their merged `verified` fields, and `risks` is passed through when present.

    5. Verify Zod parse round-trip on the pre-plan AnalysisResult fixture from Task 1: the schema-backcompat test now goes GREEN (was RED before).
  </action>
  <verify>
    <automated>grep -q "verifyClaimsBatch" src/lib/gemini-analysis.ts &amp;&amp; grep -q "verified: z.enum" src/lib/gemini-analysis.ts &amp;&amp; npx vitest run tests/eval/per-claim-verifier-schema-backcompat.unit.test.ts</automated>
  </verify>
  <done>Schema extension landed; verifyClaimsBatch wired post-Zod inside runGeminiAnalysis behind FEATURE_PER_CLAIM_VERIFIED; backward-compat test GREEN; existing 19-C-08 tests (covering CoVe report-level path) still GREEN (no regression — `npx vitest run tests/lib/reasoning/cove.test.ts` must still pass 6/6).</done>
</task>

<task type="auto" tdd="true" id="20-D-03-05">
  <name>Task 5: Write failing RTL badge test + implement UI badge in ResearchReport.tsx</name>
  <files>tests/components/research-report-verified-badge.unit.test.tsx, src/components/ResearchReport.tsx</files>
  <read_first>
    - src/components/__tests__/ResearchReport.test.tsx (existing RTL test patterns — selector conventions, mock data shape)
    - src/components/ResearchReport.tsx lines 720-790 (Growth Catalysts + Risk Vectors + Key Risks blocks — exact insertion points for the badge)
    - https://react.dev/reference/react/Component (per the react-best-practices skill triggered by the editor — confirm semantics of conditional rendering + ARIA attributes are correct in React 19; specifically that role="img" with aria-label on a non-interactive span is the AT-correct pattern for a glyph-with-tooltip)
  </read_first>
  <behavior>
    `tests/components/research-report-verified-badge.unit.test.tsx` (≥5 cases):
    - Test 1: When `NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED === 'on'` AND a bullish signal has `verified === 'false'` → render the badge with `aria-label="Source data contradicts this claim"`.
    - Test 2: Same conditions but `verified === 'null'` → badge renders with `aria-label="Insufficient source data to verify"`.
    - Test 3: `verified === 'true'` → NO badge renders (clean default; the (?) glyph is absent).
    - Test 4: `verified === undefined` (pre-plan persisted report) → NO badge renders; the rendered output is identical to today's output (snapshot match).
    - Test 5: `NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED === 'off'` AND signal has `verified === 'false'` → NO badge renders (feature flag gate trumps the verdict).
    - Test 6 (optional): Same pattern repeated against a bearish signal — confirms parity of the bullish + bearish render paths.

    All tests RED initially (badge not yet wired into the component).
  </behavior>
  <action>
    1. Write the RTL test file using `@testing-library/react` per the existing `src/components/__tests__/ResearchReport.test.tsx` pattern. Mock `process.env.NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED` via `vi.stubEnv()`. Synthetic AnalysisResult fixture in-file (DB-free).

    2. Run tests → RED.

    3. Edit `src/components/ResearchReport.tsx`:
       - Inside the `bullish_signals.map((s, i) => ...)` block at lines 730-740, add the conditional badge `<span>` sibling AFTER the existing `source_citation` span (i.e., still inside the `<div>` that wraps the signal + citation). Use the literal JSX from the `<interfaces>` block above — `role="img"`, `aria-label`, `title`, and Tailwind classes matching the existing dark/light theme.
       - Repeat the identical pattern inside `bearish_signals.map(...)` at lines 749-759.
       - (Optional, behind the same flag) — if `analysisResult.risks` is non-empty, render a sibling block under the existing `key_risks` paragraph that maps risks individually with the same badge pattern. This block is wrapped in `{risks && risks.length > 0 && (FEATURE_PER_CLAIM_VERIFIED === 'on') && ...}` so the legacy `key_risks` rendering is preserved verbatim.

    4. Re-run tests → all GREEN.

    5. Visual confirmation (manual, but documented in the SUMMARY at execution time): the badge is a small, gray, circular (?) glyph that sits inline next to the source_citation text. Tooltip appears on hover via the native `title` attribute (accessible by default; AT users get the `aria-label`). NO visual change for pre-plan reports (every existing rendering pass continues to render bit-identical output).
  </action>
  <verify>
    <automated>npx vitest run tests/components/research-report-verified-badge.unit.test.tsx</automated>
  </verify>
  <done>RTL test ≥5 cases GREEN; badge renders correctly under the 4 verdict states; existing ResearchReport tests continue to pass (no regression).</done>
</task>

<task type="auto" id="20-D-03-06">
  <name>Task 6: Implement scripts/measure-claim-verification.ts + npm wiring + baseline-output gate</name>
  <files>scripts/measure-claim-verification.ts, package.json, reports/.gitkeep, .gitignore, tests/integration/per-claim-verification.integration.test.ts</files>
  <read_first>
    - src/lib/eval/per-claim-verifier.ts (the verifyClaimsBatch contract)
    - scripts/calibrate-crowded-consensus.ts pattern from 20-A-01 (operator-runnable + cron-runnable script structure — exit codes, dry-run, output-path convention)
  </read_first>
  <action>
    1. **Create `scripts/measure-claim-verification.ts`** implementing `runMeasurement` per the `<interfaces>` block. Behavior:
       - Reads `tests/golden-tickers/*.json` (forward-ref to 20-D-04 — each file is a `SourcePackage` plus a paired `AnalysisResult` from a frozen Gemini run).
       - When the directory is empty OR missing OR no files match: exit code 4, log a structured JSON message `{exit_code: 4, reason: 'NO_GOLDEN_FIXTURES'}`, return without writing baseline.
       - When fixtures are present: for each ticker, build the signals array (bullish + bearish + risks) and call `verifyClaimsBatch`. Aggregate per-section verdict counts. Write `reports/per-claim-verification-baseline-{YYYY-MM-DD}.json` with the documented schema. Return exit code 0.
       - When EVERY signal across EVERY ticker returns 'null' AND `HF_DISTILBERT_MNLI_ENDPOINT` was set in env: exit code 5 (`NLI_ENDPOINT_DOWN`). When the env var was UNSET: exit code 0 with all-null totals (this is the documented detection-only-mode behavior — the baseline still gets written, with the all-null distribution serving as the canonical "verifier is inert" reference).
       - Operator-runnable as `npm run measure-claim-verification`; cron-runnable as well (no auth required — local script, NOT an API route).

    2. **Add npm script to package.json**: `"measure-claim-verification": "tsx scripts/measure-claim-verification.ts"` (matching the existing script convention — likely `tsx` based on the project; if `tsx` is not in package.json, use `ts-node` per the existing project pattern. Confirm by reading current package.json scripts).

    3. **Create `reports/.gitkeep`** (empty file). **Update `.gitignore`** to:
       - Keep the directory tracked (`!reports/`).
       - Track the baseline JSON files explicitly (`!reports/per-claim-verification-baseline-*.json`) since they are committed artifacts of this plan.
       - Ignore transient development output (the convention will become clearer when 20-Z-03 ships; for this plan, just track the baseline pattern).

    4. **Write `tests/integration/per-claim-verification.integration.test.ts`**:
       - Test 1: `runMeasurement` against an empty `tests/golden-tickers/` directory → exit code 4.
       - Test 2: `runMeasurement` against a SYNTHETIC stand-in golden-ticker fixture set (8 minimal JSON files placed in a temp directory) → exit code 0 (or 5 if HF_DISTILBERT_MNLI_ENDPOINT is unset and you want strict mode — but per S1 the documented behavior is exit 0 with all-null totals when endpoint is unset; assert that).
       - Test 3: Latency gate — running against 8 synthetic fixtures (~80 signals total) with the NLI mocked to resolve in ~10ms each → total wall-clock < 30s (the Promise.allSettled fan-out should make this ~10ms × ~10 calls = ~100ms, well under the gate).
       - Test 4: Backward-compat gate (re-asserted at the integration level using a real-shape pre-plan AnalysisResult JSON) → no Zod failure on parse.

    5. **Run the measurement script once locally** as part of plan execution. Two valid outcomes:
       - (a) If `tests/golden-tickers/` is empty (most likely — 20-D-04 hasn't shipped): exit code 4, NO baseline file written, document this in the SUMMARY's "Baseline Output Gate" section as "deferred to 20-D-04 — verifier infrastructure ready".
       - (b) If a placeholder fixture set exists: exit code 0, baseline file written + committed.
  </action>
  <verify>
    <automated>npx vitest run tests/integration/per-claim-verification.integration.test.ts &amp;&amp; test -f scripts/measure-claim-verification.ts &amp;&amp; grep -q "measure-claim-verification" package.json</automated>
  </verify>
  <done>Script exists; npm wiring landed; integration test ≥4 cases GREEN; baseline-output gate satisfied (either by writing the JSON file when fixtures present, or by exiting 4 when fixtures absent — both outcomes documented).</done>
</task>

<task type="auto" id="20-D-03-07">
  <name>Task 7: Commit HYPERPARAMETERS.md + MODEL-CARD-per-claim-verifier.md + SUMMARY</name>
  <files>HYPERPARAMETERS.md, docs/cards/MODEL-CARD-per-claim-verifier.md, .planning/phases/20-real-sentiment-analysis/20-D-03-SUMMARY.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-A-01-PLAN.md (HYPERPARAMETERS.md + MODEL-CARD writeup conventions)
    - .planning/phases/19-cipher-v2-0-excellence/19-C-08-SUMMARY.md (the precedent NLI model-card content — distilbert-mnli choice + 28/30 fixture)
    - docs/cards/ (if existing — confirm Mitchell-2019 template structure used by prior cards)
  </read_first>
  <action>
    1. **Append `HYPERPARAMETERS.md`** with a `## per_claim_verifier` section documenting:
       - `entailment_score_threshold = 0.7` (basis: HF text-classification top-score convention; rationale: conservative default, re-evaluate after 200 shadow comparisons)
       - `contradiction_score_threshold = 0.7` (same basis + rationale)
       - `max_claim_chars = 500` (inherited from 19-C-08 MAX_CLAIM_LEN)
       - `max_evidence_chars = 5000` (inherited from 19-C-08 MAX_EVIDENCE_LEN)
       - `nli_model = 'distilbert-mnli'` (upstream from 19-C-08 fixture decision — not re-evaluated in this plan)
       - `re-evaluation cadence`: after 200 shadow comparisons OR 90 days, whichever first.

    2. **Create `docs/cards/MODEL-CARD-per-claim-verifier.md`** following the Mitchell-2019 template:
       - **Model details**: per-claim verifier composing 19-C-08 distilbert-mnli with strict 0.7 score thresholds at the single-signal granularity.
       - **Intended use**: emit per-claim verdicts on bullish_signals / bearish_signals / risks within AnalysisResult to power a UI badge that flags unverified claims to the end user. NOT a replacement for human review.
       - **Out-of-distribution behavior**: claims about future events (price targets, projections) — the NLI is trained on declarative entailment, not predictive claims; expected verdict for future claims is `'null'` (correctly conservative).
       - **Evaluation metrics**: per-ticker × per-section verified-rate (true/false/null counts) measured by `scripts/measure-claim-verification.ts`. Baseline JSON committed at `reports/per-claim-verification-baseline-{date}.json`.
       - **Ethical considerations**: tooltip framing avoids investment-advice language; the `'false'` verdict tooltip reads "Source data contradicts this claim" (factual contradiction language) NOT "this claim is wrong".
       - **Known failure modes**: long claims truncated at 500 chars; very-large SourcePackages truncated at 5000 chars; off-domain claims (forward projections, qualitative judgment, opinions about future) → 'null'; the conservative default is the intended behavior.
       - **Retrain cadence**: same as 19-C-08 — re-evaluate after 200+ shadow comparisons land. This plan does NOT alter the upstream NLI model choice.
       - **Upstream dependency**: link to `docs/cards/MODEL-CARD-cove.md` (the 19-C-08 model card) — distilbert-mnli @ cross-encoder/nli-distilroberta-base, 28/30 fixture accuracy.
       - **Spot-check log section**: placeholder section for human-labeled FP audits at cutover time (mirrors 20-A-01 model card section convention).

    3. **Write the SUMMARY** at `.planning/phases/20-real-sentiment-analysis/20-D-03-SUMMARY.md` per `~/.claude/get-shit-done/templates/summary.md` — including the four cutover gate statuses, the threat-model disposition for each T-20-D-03-XX, and the lifecycle next-step actions (HF endpoint pinning, FEATURE_PER_CLAIM_VERIFIED=shadow flip in Vercel, baseline measurement against real 20-D-04 fixtures when they land).
  </action>
  <verify>
    <automated>grep -q "per_claim_verifier" HYPERPARAMETERS.md &amp;&amp; test -f docs/cards/MODEL-CARD-per-claim-verifier.md &amp;&amp; grep -q "distilbert-mnli" docs/cards/MODEL-CARD-per-claim-verifier.md &amp;&amp; test -f .planning/phases/20-real-sentiment-analysis/20-D-03-SUMMARY.md    <automated>grep -q "per_claim_verifier" HYPERPARAMETERS.md &amp;&amp; test -f docs/cards/MODEL-CARD-per-claim-verifier.md &amp;&amp; grep -q "distilbert-mnli" docs/cards/MODEL-CARD-per-claim-verifier.md &amp;&amp; test -f .planning/phases/20-real-sentiment-analysis/20-D-03-SUMMARY.md</automated>
  </verify>
  <done>HYPERPARAMETERS.md per_claim_verifier section committed; MODEL-CARD-per-claim-verifier.md committed; SUMMARY committed.</done>
</task>

<task type="auto" id="20-D-03-08">
  <name>Task 8: Final commit + full test sweep + tick ROADMAP</name>
  <files>.planning/ROADMAP.md</files>
  <read_first>
    - .planning/ROADMAP.md (find the 20-D-03 row in the Phase 20 plan table — tick the checkbox)
  </read_first>
  <action>
    1. Run the full test sweep BEFORE committing:
       - `npx vitest run` (full unit suite — must be GREEN; the new tests + the existing 19-C-08 cove tests + the existing ResearchReport tests all green)
       - `npx tsc --noEmit -p tsconfig.json` (clean — no type errors from the schema extension)
       - `npm run test:integration` ONLY for the new integration test (`tests/integration/per-claim-verification.integration.test.ts`) — the rest of the live-Neon suite is out-of-scope for this plan and the existing baseline must not regress; if a non-related test fails, document in the SUMMARY's "Issues Encountered" section but do not gate this plan on it.
       - `npm run test:e2e` for the RTL component test (covered already by Task 5 vitest run if your RTL is run under vitest; if it's a separate Playwright suite, run that too).
    2. Tick `[x] 20-D-03` in `.planning/ROADMAP.md`.
    3. Final atomic commit per the existing project convention (see `git log` recent commits for the exact subject format — likely `feat(20-D-03): per-claim CoVe extension + UI badge`).
       - Sign-off via `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "..."` per the GSD planner workflow.
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "20-D-03" &amp;&amp; grep -q "\[x\] 20-D-03" .planning/ROADMAP.md</automated>
  </verify>
  <done>All tests green; ROADMAP ticked; commit landed with the 20-D-03 subject.</done>
</task>

</tasks>

<verification>
- [ ] `verified` field accepted in `AnalysisResultSchema` Zod parse (backward-compat test green; new test for `verified: 'true'` round-trip green)
- [ ] Per-claim verifier runs on 8 synthetic golden ticker fixtures in < 30s wall-clock (integration test gate)
- [ ] Baseline JSON either written to `reports/per-claim-verification-baseline-{date}.json` OR exit code 4 documented when 20-D-04 fixtures absent (Task 6 gate)
- [ ] UI (?) badge renders for synthetic `'false'` AND `'null'` signals (RTL Tests 1+2); does NOT render for `'true'` (RTL Test 3); does NOT render when `verified` undefined (RTL Test 4 — backward compat); flag-off suppresses badge entirely (RTL Test 5)
- [ ] Unit tests green: ≥8 in `per-claim-verifier.unit.test.ts` + ≥2 in `per-claim-verifier-schema-backcompat.unit.test.ts`
- [ ] Integration test green: ≥4 cases in `per-claim-verification.integration.test.ts`
- [ ] Existing 19-C-08 `cove.test.ts` still 6/6 green (no regression on the report-level path)
- [ ] `HYPERPARAMETERS.md` `## per_claim_verifier` section committed
- [ ] `docs/cards/MODEL-CARD-per-claim-verifier.md` committed
- [ ] Final commit subject contains `20-D-03`; ROADMAP ticked
</verification>

<success_criteria>
1. Per-claim verification infrastructure ships in `off` mode by default — `FEATURE_PER_CLAIM_VERIFIED` three-mode flag introduced; off path bit-identical to today.
2. `verifyClaimsBatch` exists; reuses 19-C-08's NLI infrastructure via `nliVerifyWithScore` (a new score-returning sibling to `nliVerify` in `src/lib/reasoning/cove.ts`); strict 0.7 thresholds enforced.
3. `AnalysisResult.bullish_signals[*].verified` + `bearish_signals[*].verified` + `risks[*].verified` are optional Zod-validated fields — backward-compatible by construction for all pre-plan persisted reports.
4. UI (?) badge surfaces only for `verified ∈ {'false', 'null'}` AND only when `NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED === 'on'`; clean-default (no badge on 'true') and backward-compat (no badge on undefined) gates met.
5. Baseline measurement script + npm wiring landed; runs against synthetic OR (future) real 20-D-04 fixtures; writes JSON with documented schema OR exits 4 gracefully.
6. Model card + HYPERPARAMETERS.md entry committed (S4 + S1 standards met).
7. Shadow lifecycle staged but NOT graduated in this plan — cutover follow-up plan filed when the 4 numerical cutover criteria in frontmatter are met.
</success_criteria>

<output>
Create `.planning/phases/20-real-sentiment-analysis/20-D-03-SUMMARY.md` summarizing:
- The 8 task commits.
- The `nliVerifyWithScore` sibling addition to `src/lib/reasoning/cove.ts` (document this decision — Task 1 architecture choice).
- The 4 cutover gate statuses with explicit lifecycle next-step actions (operator HF endpoint pinning, `FEATURE_PER_CLAIM_VERIFIED=shadow` flip in Vercel Production, baseline measurement against real 20-D-04 fixtures when they land, then the `20-D-03-FOLLOWUP-CUTOVER` plan filing).
- Threat-model disposition for T-20-D-03-01 through T-20-D-03-05.
- Forward-references: 20-D-04 (golden-ticker SourcePackage fixtures), 20-Z-02 (model-card scaffold + `check-model-cards.ts` CI gate), 20-Z-03 (`/insights` Sentiment Health telemetry — per-claim verifier latency surfaces there post-cutover).
</output>
