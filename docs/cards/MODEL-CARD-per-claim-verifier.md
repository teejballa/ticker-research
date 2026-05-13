---
model_name: per-claim-verifier
model_version: cove-extension-v1
card_format: mitchell-2019
last_validated: 2026-05-13
retrain_cadence: P90D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/eval/per-claim-verifier.ts
  - src/lib/reasoning/cove.ts
  - scripts/measure-claim-verification.ts
---

# MODEL CARD — per-claim-verifier (Plan 20-D-03)

**Format**: Mitchell-2019 model card.
**Status**: shipped in `off` mode by default; shadow infrastructure ready.
Cutover from `shadow → on` is filed in the follow-up plan `20-D-03-FOLLOWUP-CUTOVER`
when the 4 numerical cutover criteria (see `.planning/phases/20-real-sentiment-analysis/20-D-03-PLAN.md`
frontmatter `shadow_lifecycle.cutover_criteria`) are met.

## Intended use

Emits per-claim verification verdicts (`'true' | 'false' | 'null'`) for every
`bullish_signal`, `bearish_signal`, and (new in 20-D-03) `risks` entry in
`AnalysisResult`. The verdict drives an inline (?) badge in
`ResearchReport.tsx` that flags unverified claims to the end user without
making investment-advice statements.

This per-claim layer is a **granularity extension** of 19-C-08's
report-level CoVe Pass-2 verifier. NO new NLI infrastructure is implemented;
the verifier reuses 19-C-08's `distilbert-mnli` endpoint behind the existing
`HF_DISTILBERT_MNLI_ENDPOINT` env var.

**NOT a replacement for human review.** The verifier surfaces a verifier
verdict; the user retains sole responsibility for investment decisions.

## Out of scope

- The NLI model choice itself — owned by Plan 19-C-08 (see
  `docs/cards/MODEL-CARD-cove.md` if/when filed; until then 19-C-08-SUMMARY.md
  documents the 28/30 fixture decision).
- Citation-coverage metric — Plan 20-D-02.
- Numeric-grounding regression — Plan 20-D-01.
- Golden-ticker SourcePackage fixtures — Plan 20-D-04.

## Architecture

Composite signal layered on top of 19-C-08:

1. **`nliVerifyWithScore(claim, evidence)`** (`src/lib/reasoning/cove.ts`):
   score-returning sibling to the existing `nliVerify`. Calls the same
   `HF_DISTILBERT_MNLI_ENDPOINT` via `@huggingface/inference` and returns
   `{ label: 'entail' | 'contradict' | 'neutral' | null, score: number | null }`
   — the score is the top-label probability. Existing `nliVerify` (label-only)
   is preserved verbatim — 19-C-08 + 19-C-10 callers unchanged.

2. **`verifyClaimPerSignal(signal, sourcePackage)`** (`src/lib/eval/per-claim-verifier.ts`):
   wraps `nliVerifyWithScore` with strict 0.7 score thresholds. Verdict mapping
   per `HYPERPARAMETERS.md per_claim_verifier`:
   - `'entail'`     AND score > 0.7 → `'true'`
   - `'contradict'` AND score > 0.7 → `'false'`
   - else (neutral / score ≤ 0.7 / threw / endpoint unset) → `'null'`

3. **`verifyClaimsBatch(signals, sourcePackage)`**: `Promise.allSettled`
   fan-out. Per-signal failures collapse to `'null'` without aborting the
   batch (mirrors 19-C-08 `runWithCove` belt-and-suspender). Returns
   `Map<signalId, verdict>` keyed by positional IDs (`bullish-0`,
   `bearish-2`, `risks-1`, …).

4. **`runGeminiAnalysis`** (`src/lib/gemini-analysis.ts`): post-Zod-validation,
   post-sidecar wiring gated on `FEATURES.per_claim_verified_mode !== 'off'`.
   Try/catch swallows verifier failure — partial HF outage NEVER aborts the
   user-facing report (T-20-D-03-04).

## Training data + parameter origin

- **No training step.** Pure orchestration over 19-C-08's `distilbert-mnli`.
- **Threshold origin**: 0.7 is the HF text-classification top-label
  "high confidence" convention. Below 0.7 collapses to `'null'` (conservative
  default — "insufficient source data to verify"), never to `'true'` or
  `'false'`. Re-evaluated after ≥200 shadow comparisons OR 90 days.
- **Truncation limits**: `MAX_CLAIM_LEN=500` and `MAX_EVIDENCE_LEN=5000` are
  inherited from 19-C-08 (RESEARCH Pitfall 5 cost gate + prompt-injection
  defense).

## Evaluation metrics

Per-ticker × per-section verified-rate (true / false / null counts) measured
by `scripts/measure-claim-verification.ts`:

```
{
  run_date: ISO8601,
  golden_ticker_count: number,
  verifier_latency_ms_total: number,
  per_ticker: {
    [ticker]: {
      bullish: { true, false, null },
      bearish: { true, false, null },
      risks:   { true, false, null }
    }
  },
  totals: { true, false, null }
}
```

The first blessed baseline (after 20-D-04 ships real golden-ticker
SourcePackages) is committed at
`reports/per-claim-verification-baseline-blessed.json`. Cutover criterion
4 (UI render gate) and criterion 1 (≥1 baseline measurement) both gate on
this file's existence + content.

## Known failure modes

- **Long claims truncated at 500 chars** — claims that exceed the truncation
  limit may lose disambiguating detail. Mitigated by the 19-C-08
  `MAX_CLAIM_LEN` precedent: in practice, signals are short (≤ 200 chars
  typical); the 500-char limit is a defense ceiling, not a typical cutoff.
- **Very-large SourcePackages truncated at 5000 chars** — distant evidence
  in the JSON-stringified package may be discarded. Mitigated by SourcePackage
  field ordering (high-signal market_data + fundamentals + analyst sentiment
  come first; long-form news bodies come last).
- **Forward-looking claims → `'null'`** — NLI is trained on declarative
  entailment, not predictive claims. Price targets, projections, and
  "could / may / expected to" claims correctly verify as `'null'`
  ("insufficient source data to verify"). This is the **intended** behavior
  per T-20-D-03-02 mitigation — under-confident `'false'` verdicts on
  legitimate-but-future claims would generate regulatory exposure.
- **NLI endpoint unset / unreachable** — every signal returns `'null'`
  (graceful degrade). The measurement script's exit code 5
  (`NLI_ENDPOINT_DOWN`) detects this when the endpoint env var WAS set;
  exit code 0 with all-null totals when the env var was UNSET (documented
  detection-only-mode behavior).
- **Per-signal failure** in a batch — Promise.allSettled isolates failures
  to a single signal's verdict (collapsed to `'null'`); the batch never
  aborts.

## Ethical considerations

- **Tooltip framing** (S10 regulatory hygiene):
  - `verified === 'false'` → "Source data contradicts this claim" (factual
    contradiction language).
  - `verified === 'null'`  → "Insufficient source data to verify"
    (informational).
  - The UI explicitly avoids investment-advice language. RTL test
    `tests/components/research-report-verified-badge.unit.test.tsx` asserts
    the tooltip does NOT match `/sell|buy|wrong|false claim|hallucinat|lie/i`.
- **Clean-default UI contract** (T-20-D-03-03 mitigation): NO badge renders
  for `verified === 'true'` — absence of the (?) glyph IS the success signal.
  The badge renders only for `verified ∈ {'false', 'null'}`. If the badge
  appears on every signal (over-conservative verifier), users dismiss it as
  noise and the feature loses its purpose; the cutover criterion blocks the
  shadow→on flip when `null` rate > 60% on the golden tickers.

## Upstream dependency

- **`docs/cards/MODEL-CARD-cove.md`** (Plan 19-C-08, when filed; until then
  see `.planning/phases/19-cipher-v2-0-excellence/19-C-08-SUMMARY.md`):
  `distilbert-mnli` at `cross-encoder/nli-distilroberta-base`, selected
  28/30 (93.3%) vs FinBERT-tone 22/30 (73.3%) on the 30-claim stratified
  sample at `tests/fixtures/nli-eval-labels.tsv`. Decision date: 2026-05-08.
  Re-evaluation cadence: ≥200 live shadow comparisons OR 90 days.
  This plan extends per-claim granularity but does NOT alter that decision.

## Maintenance

- **Recalibration cadence**: P90D. Re-run
  `npm run measure-claim-verification` against the 20-D-04 golden-ticker
  SourcePackages quarterly (or after every meaningful change to
  `src/lib/eval/per-claim-verifier.ts` or
  `src/lib/reasoning/cove.ts:nliVerifyWithScore`).
- **Cutover trigger**: when the 4 numerical criteria in
  `20-D-03-PLAN.md` frontmatter `shadow_lifecycle.cutover_criteria` are met,
  file `20-D-03-FOLLOWUP-CUTOVER` to flip
  `FEATURE_PER_CLAIM_VERIFIED=shadow → on` in Vercel Production and (per S3
  hard cleanup gate) delete the `off`-path branch in
  `src/lib/gemini-analysis.ts`.

## Spot-check log

_(Placeholder — to be populated by the cutover follow-up plan with
human-labeled FP audits on the 8 golden tickers. Convention mirrors the
20-A-01 model card.)_

## References

- Mitchell, M. et al. 2019. "Model Cards for Model Reporting." *FAT\* '19*.
- Dhuliawala, S. et al. 2024. "Chain-of-Verification Reduces Hallucination
  in Large Language Models." arXiv:2309.11495.
- Plan 19-C-08 — report-level CoVe Pass-2 (`distilbert-mnli` decision).
- Plan 19-C-10 — contradiction detector (the legacy `nliVerify` shim consumer).
- Plan 20-Z-02 — model-card scaffold + `check-model-cards.ts` CI gate.
- Plan 20-D-04 — golden-ticker SourcePackage fixtures (forward-ref).
